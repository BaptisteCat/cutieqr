// Stockage local (IndexedDB) : modèles, historique et brouillon en cours.
// Si IndexedDB est indisponible (navigation privée stricte), on retombe sur
// une mémoire de session : l'application reste utilisable, sans persistance.

const DB_NAME = 'cutieqr';
const STORES = ['templates', 'history', 'kv'];

let dbPromise = null;
const memory = { templates: new Map(), history: new Map(), kv: new Map() };

function open() {
  dbPromise ||= new Promise((resolve) => {
    let req;
    try {
      req = indexedDB.open(DB_NAME, 1);
    } catch {
      resolve(null);
      return;
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      db.createObjectStore('templates', { keyPath: 'id' });
      db.createObjectStore('history', { keyPath: 'id' });
      db.createObjectStore('kv');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
    req.onblocked = () => resolve(null);
  });
  return dbPromise;
}

async function run(store, mode, fn) {
  const db = await open();
  if (!db) return fn(null);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const req = fn(tx.objectStore(store));
    tx.oncomplete = () => resolve(req ? req.result : undefined);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export const persistent = async () => Boolean(await open());

export function getAll(store) {
  return run(store, 'readonly', (os) => (os ? os.getAll() : [...memory[store].values()]));
}

export function put(store, value) {
  return run(store, 'readwrite', (os) => (os ? os.put(value) : void memory[store].set(value.id, value)));
}

export function remove(store, id) {
  return run(store, 'readwrite', (os) => (os ? os.delete(id) : void memory[store].delete(id)));
}

export function clear(store) {
  return run(store, 'readwrite', (os) => (os ? os.clear() : void memory[store].clear()));
}

export function kvGet(key) {
  return run('kv', 'readonly', (os) => (os ? os.get(key) : memory.kv.get(key)));
}

export function kvSet(key, value) {
  return run('kv', 'readwrite', (os) => (os ? os.put(value, key) : void memory.kv.set(key, value)));
}

export const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export { STORES };
