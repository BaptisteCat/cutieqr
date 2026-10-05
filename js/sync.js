// Synchronisation entre appareils par un Gist GitHub secret.
// Chaque appareil garde ses données en local (IndexedDB) ; la synchronisation
// fusionne l'état local et celui du Gist, élément par élément : la version la
// plus récente l'emporte, et une suppression est mémorisée (« pierre tombale »)
// pour se propager au lieu d'être annulée par un autre appareil.

const API = 'https://api.github.com';
export const FILE = 'cutieqr-sync.json';
const DESCRIPTION = 'CutieQR — synchronisation (fichier géré par l’application)';
const CONFIG_KEY = 'cutieqr-sync';
const TOMBSTONE_TTL = 180 * 24 * 3600 * 1000; // une suppression est retenue six mois

export class SyncError extends Error {
  constructor(message, code = 'error') {
    super(message);
    this.code = code;
  }
}

/* ---------- Configuration locale (jeton + identifiant du Gist) ---------- */

export function loadConfig() {
  try {
    const cfg = JSON.parse(localStorage.getItem(CONFIG_KEY));
    return cfg && typeof cfg.token === 'string' && typeof cfg.gistId === 'string' ? cfg : null;
  } catch {
    return null;
  }
}
export function saveConfig(cfg) {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg));
}
export function clearConfig() {
  try { localStorage.removeItem(CONFIG_KEY); } catch { /* rien à effacer */ }
}

/* ---------- Fusion (fonction pure) ---------- */

const stampOf = (item) => Number(item.updatedAt || item.createdAt || 0);

// doc = { templates: [], history: [], tombstones: { "history:id": horodatage } }
export function merge(local, remote, now = Date.now()) {
  const tombstones = {};
  for (const src of [local.tombstones || {}, remote.tombstones || {}]) {
    for (const [key, at] of Object.entries(src)) {
      if (Number.isFinite(at) && now - at < TOMBSTONE_TTL) tombstones[key] = Math.max(tombstones[key] || 0, at);
    }
  }
  const out = { templates: [], history: [], tombstones };
  for (const store of ['templates', 'history']) {
    const byId = new Map();
    for (const item of [...(remote[store] || []), ...(local[store] || [])]) {
      const prev = byId.get(item.id);
      // À égalité, la version locale (parcourue en second) l'emporte.
      if (!prev || stampOf(item) >= stampOf(prev)) byId.set(item.id, item);
    }
    for (const [id, item] of byId) {
      const deletedAt = tombstones[`${store}:${id}`] || 0;
      if (stampOf(item) > deletedAt) {
        out[store].push(item);
        delete tombstones[`${store}:${id}`];
      }
    }
    out[store].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }
  return out;
}

// Représentation stable, pour savoir si un côté doit être mis à jour.
export function fingerprint(doc) {
  const sortById = (list) => [...list].sort((a, b) => (a.id < b.id ? -1 : 1)).map((i) => [i.id, stampOf(i)]);
  const tomb = Object.entries(doc.tombstones || {}).sort();
  return JSON.stringify([sortById(doc.templates || []), sortById(doc.history || []), tomb]);
}

/* ---------- Accès à l'API GitHub ---------- */

export class GistClient {
  constructor(token, fetchImpl = (...args) => fetch(...args)) {
    this.token = token;
    this.fetch = fetchImpl;
  }

  async request(path, { method = 'GET', body } = {}) {
    let res;
    try {
      res = await this.fetch(API + path, {
        method,
        cache: 'no-store',
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${this.token}`,
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new SyncError('GitHub est injoignable : vérifiez la connexion Internet.', 'network');
    }
    if (res.status === 401) throw new SyncError('GitHub refuse ce jeton : il est invalide ou expiré.', 'auth');
    if (res.status === 403) throw new SyncError('Ce jeton n’a pas le droit « gist », ou la limite de requêtes GitHub est atteinte.', 'forbidden');
    if (res.status === 404) throw new SyncError('Gist introuvable.', 'missing');
    if (!res.ok) throw new SyncError(`GitHub a répondu une erreur ${res.status}.`, 'http');
    return res.status === 204 ? null : res.json();
  }

  user() {
    return this.request('/user');
  }

  // Cherche un Gist CutieQR existant ; sinon en crée un, secret.
  async findOrCreate(initialDoc) {
    for (let page = 1; page <= 10; page++) {
      const list = await this.request(`/gists?per_page=100&page=${page}`);
      const found = list.find((g) => g.files && g.files[FILE]);
      if (found) return { id: found.id, created: false };
      if (list.length < 100) break;
    }
    const gist = await this.request('/gists', {
      method: 'POST',
      body: { description: DESCRIPTION, public: false, files: { [FILE]: { content: serialize(initialDoc) } } },
    });
    return { id: gist.id, created: true };
  }

  async read(gistId) {
    const gist = await this.request(`/gists/${encodeURIComponent(gistId)}`);
    const file = gist.files && gist.files[FILE];
    if (!file) throw new SyncError('Le fichier de synchronisation manque dans le Gist.', 'missing');
    let text = file.content;
    // Au-delà d'1 Mo, l'API tronque le contenu : on lit le fichier brut.
    if (file.truncated) {
      let res;
      try {
        res = await this.fetch(file.raw_url, { cache: 'no-store' });
      } catch {
        throw new SyncError('Lecture du Gist impossible : vérifiez la connexion Internet.', 'network');
      }
      if (!res.ok) throw new SyncError(`Lecture du Gist impossible (erreur ${res.status}).`, 'http');
      text = await res.text();
    }
    try {
      const doc = JSON.parse(text || '{}');
      return doc && typeof doc === 'object' ? doc : {};
    } catch {
      throw new SyncError('Le Gist de synchronisation est illisible.', 'corrupt');
    }
  }

  write(gistId, doc) {
    return this.request(`/gists/${encodeURIComponent(gistId)}`, {
      method: 'PATCH',
      body: { files: { [FILE]: { content: serialize(doc) } } },
    });
  }
}

function serialize(doc) {
  return JSON.stringify({
    app: 'cutieqr',
    version: 1,
    updatedAt: new Date().toISOString(),
    templates: doc.templates || [],
    history: doc.history || [],
    tombstones: doc.tombstones || {},
  });
}
