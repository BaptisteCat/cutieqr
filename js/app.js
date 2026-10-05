import { CONTENT_TYPES, defaultContent, buildPayload, describeContent, typeLabel, sanitizeContent } from './payload.js';
import {
  DOT_SHAPES, EYE_SHAPES, defaultStyle, mergeStyle, resolveEcc, makeMatrix, renderSVG, MIN_VERSION_WITH_LOGO,
  dotSample, eyeSample, contrastRatio, luminance,
} from './render.js';
import { exportBlob, download, copyImage, canCopyImage, canShareFiles, scanCheck, EXT } from './export.js';
import * as store from './store.js';
import { PRESETS } from './presets.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const clone = (v) => JSON.parse(JSON.stringify(v));

const SAMPLE_DATA = 'https://exemple.fr/cutieqr';
const FORMATS = ['png', 'svg', 'jpeg', 'webp', 'pdf'];
const PAGES = ['fit', 'a4', 'a5', 'a6', 'letter'];
// Capacité maximale (version 40, mode octet) selon la correction d'erreur.
const MAX_BYTES = { L: 2953, M: 2331, Q: 1663, H: 1273 };

const defaultExport = () => ({ format: 'png', px: 1024, quality: 92, mm: 50, page: 'fit', name: '' });

function sanitizeExport(raw) {
  const d = defaultExport();
  if (!raw || typeof raw !== 'object') return d;
  const num = (v, min, max, def) => (Number.isFinite(Number(v)) && v !== '' ? Math.min(max, Math.max(min, Number(v))) : def);
  return {
    format: FORMATS.includes(raw.format) ? raw.format : d.format,
    px: Math.round(num(raw.px, 128, 4096, d.px)),
    quality: Math.round(num(raw.quality, 50, 100, d.quality)),
    mm: num(raw.mm, 10, 1000, d.mm),
    page: PAGES.includes(raw.page) ? raw.page : d.page,
    name: typeof raw.name === 'string' ? raw.name.slice(0, 80) : '',
  };
}

const state = { content: defaultContent(), style: defaultStyle(), export: defaultExport() };
// Entrée d'historique en cours d'édition : un nouvel export la met à jour au lieu d'en créer une autre.
let session = { id: null, createdAt: null };

const getPath = (path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), state);
function setPath(path, value) {
  const keys = path.split('.');
  const last = keys.pop();
  keys.reduce((o, k) => o[k], state)[last] = value;
}

/* ============================== Notification ============================== */

let toastTimer = 0;
function toast(message, { error = false, action = null } = {}) {
  const el = $('#toast');
  const text = document.createElement('span');
  text.textContent = message;
  el.replaceChildren(text);
  if (action) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = action.label;
    b.addEventListener('click', () => {
      el.classList.remove('show');
      action.run();
    });
    el.append(b);
  }
  el.classList.toggle('error', error);
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), action ? 6000 : error ? 4500 : 2600);
}

/* ============================== Liaisons ============================== */

function readInput(el) {
  if (el.type === 'checkbox') return el.checked;
  if (el.type === 'range' || el.type === 'number') return el.value === '' ? '' : Number(el.value);
  return el.value;
}

function bindInputs() {
  for (const el of $$('[data-bind]')) {
    const live = el.tagName === 'TEXTAREA' || /^(text|url|email|tel|search|number|range)$/.test(el.type);
    el.addEventListener(live ? 'input' : 'change', () => {
      if (el.type === 'radio' && !el.checked) return;
      setPath(el.dataset.bind, readInput(el));
      onChange(el.dataset.bind);
    });
  }
}

function formatOutput(input) {
  const value = Number(input.value) * Number(input.dataset.scale || 1);
  let unit = input.dataset.unit || '';
  if (unit === ' modules' && value < 2) unit = ' module';
  return value.toLocaleString('fr-FR', { maximumFractionDigits: 2 }) + unit;
}

function evalShow(expr) {
  const m = expr.match(/^([\w.]+)(!?=)(.*)$/);
  if (!m) return true;
  const v = getPath(m[1]);
  const hit = m[3].split('|').some((o) => (o === 'set' ? Boolean(v) : String(v) === o));
  return m[2] === '=' ? hit : !hit;
}

function syncUI() {
  for (const el of $$('[data-bind]')) {
    const v = getPath(el.dataset.bind);
    if (el.type === 'radio') el.checked = el.value === String(v);
    else if (el.type === 'checkbox') el.checked = Boolean(v);
    else if (el.value !== String(v ?? '')) el.value = v ?? '';
  }
  for (const out of $$('.range output')) {
    const input = out.closest('.range').querySelector('input');
    out.textContent = formatOutput(input);
  }
  for (const host of $$('[data-color]')) {
    const v = getPath(host.dataset.color);
    const [picker, hex] = host.querySelectorAll('input');
    if (picker.value !== v) picker.value = v;
    if (document.activeElement !== hex) hex.value = v;
    const label = host.dataset.altWhen && evalShow(host.dataset.altWhen) ? host.dataset.labelAlt : host.dataset.label;
    host.querySelector('.color-label').textContent = label;
    picker.setAttribute('aria-label', label);
    hex.setAttribute('aria-label', `${label} (code hexadécimal)`);
  }
  for (const tile of $$('.tile')) {
    tile.setAttribute('aria-checked', String(getPath(tile.dataset.path) === tile.dataset.value));
  }
  for (const el of $$('[data-show]')) el.hidden = !evalShow(el.dataset.show);

  const logo = state.style.logo.src;
  const thumb = $('#logo-thumb');
  thumb.hidden = !logo;
  if (logo && thumb.getAttribute('src') !== logo) thumb.src = logo;
  if (!logo) thumb.removeAttribute('src');
  $('#logo-title').textContent = logo ? 'Logo' : 'Ajouter un logo';
  $('#logo-remove').hidden = !logo;
  $('#logo-file').closest('label').querySelector('span').textContent = logo ? 'Remplacer…' : 'Choisir…';
}

function buildColorFields() {
  for (const host of $$('[data-color]')) {
    const path = host.dataset.color;
    host.innerHTML =
      '<input type="color"><span class="color-meta"><span class="color-label"></span>' +
      '<input type="text" class="hex" maxlength="7" spellcheck="false" autocomplete="off"></span>';
    const [picker, hex] = host.querySelectorAll('input');
    picker.addEventListener('input', () => {
      setPath(path, picker.value.toLowerCase());
      hex.value = picker.value.toLowerCase();
      onChange(path);
    });
    hex.addEventListener('input', () => {
      let v = hex.value.trim().toLowerCase();
      if (!v.startsWith('#')) v = '#' + v;
      if (/^#[0-9a-f]{3}$/.test(v)) v = '#' + [...v.slice(1)].map((c) => c + c).join('');
      if (/^#[0-9a-f]{6}$/.test(v)) {
        setPath(path, v);
        picker.value = v;
        onChange(path);
      }
    });
    hex.addEventListener('blur', () => { hex.value = getPath(path); });
  }
}

function buildTiles() {
  const groups = {
    dots: { path: 'style.dots.shape', items: DOT_SHAPES, svg: (id) => dotSample(id) },
    'eye-outer': { path: 'style.eyes.outer', items: EYE_SHAPES, svg: (id) => eyeSample('outer', id) },
    'eye-inner': { path: 'style.eyes.inner', items: EYE_SHAPES, svg: (id) => eyeSample('inner', id) },
  };
  for (const host of $$('[data-tiles]')) {
    const g = groups[host.dataset.tiles];
    for (const item of g.items) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'tile';
      b.setAttribute('role', 'radio');
      b.dataset.path = g.path;
      b.dataset.value = item.id;
      b.innerHTML = g.svg(item.id);
      const caption = document.createElement('span');
      caption.textContent = item.label;
      b.append(caption);
      b.addEventListener('click', () => {
        setPath(g.path, item.id);
        onChange(g.path);
      });
      host.append(b);
    }
  }
}

function setupTabs() {
  const tabs = $$('[role="tab"]');
  const select = (tab, focus) => {
    for (const t of tabs) {
      const on = t === tab;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      $('#' + t.getAttribute('aria-controls')).hidden = !on;
    }
    if (focus) tab.focus();
    tab.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    if (tab.id === 'tab-history') renderHistory();
    if (tab.id === 'tab-templates') renderTemplates();
  };
  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => select(tab));
    tab.addEventListener('keydown', (e) => {
      const j = { ArrowRight: (i + 1) % tabs.length, ArrowLeft: (i - 1 + tabs.length) % tabs.length, Home: 0, End: tabs.length - 1 }[e.key];
      if (j === undefined) return;
      e.preventDefault();
      select(tabs[j], true);
    });
  });
}

/* ============================== Rendu ============================== */

const matrixCache = new Map();
function getMatrix(data, ecc, minVersion = 0) {
  const key = `${ecc}\u0000${minVersion}\u0000${data}`;
  if (!matrixCache.has(key)) {
    if (matrixCache.size > 24) matrixCache.clear();
    let value;
    try {
      value = makeMatrix(data, ecc, minVersion);
    } catch {
      value = null;
    }
    matrixCache.set(key, value);
  }
  return matrixCache.get(key);
}

function isContentEmpty(content) {
  return Object.entries(content[content.type]).every(([k, v]) => typeof v !== 'string' || k === 'format' || !v.trim());
}

let current = { matrix: null, data: SAMPLE_DATA, sample: true };

const minVersion = (style) => (style.logo.src ? MIN_VERSION_WITH_LOGO : 0);

function compute() {
  const ecc = resolveEcc(state.style);
  const built = buildPayload(state.content);
  let error = built.error && !isContentEmpty(state.content) ? built.error : null;
  if (built.data) {
    const matrix = getMatrix(built.data, ecc, minVersion(state.style));
    if (matrix) return { matrix, data: built.data, sample: false, error: null };
    const bytes = new TextEncoder().encode(built.data).length;
    error = `Contenu trop long pour un QR code : ${bytes.toLocaleString('fr-FR')} octets, ` +
      `pour un maximum de ${MAX_BYTES[ecc].toLocaleString('fr-FR')} avec la correction ${ecc}. ` +
      (ecc === 'L' ? 'Raccourcissez le contenu.' : 'Raccourcissez-le ou baissez la correction d’erreur (onglet Formes).');
  }
  return { matrix: getMatrix(SAMPLE_DATA, ecc, minVersion(state.style)), data: SAMPLE_DATA, sample: true, error };
}

// Un rendu par image ; le minuteur prend le relais quand l'onglet est en arrière-plan
// (requestAnimationFrame y est suspendu).
let renderPending = false;
let frame = 0;
let frameTimer = 0;
function scheduleRender() {
  if (renderPending) return;
  renderPending = true;
  const run = () => {
    if (!renderPending) return;
    renderPending = false;
    cancelAnimationFrame(frame);
    clearTimeout(frameTimer);
    renderNow();
  };
  frame = requestAnimationFrame(run);
  frameTimer = setTimeout(run, 80);
}

function renderNow() {
  syncUI();
  current = compute();
  const { matrix, sample, error } = current;
  const preview = $('#preview');
  preview.innerHTML = renderSVG(matrix, state.style).svg;
  preview.classList.toggle('is-sample', sample);

  const err = $('#content-error');
  err.hidden = !error;
  err.textContent = error || '';

  $('#qr-info').textContent = sample ? ''
    : `Version ${matrix.version} · ${matrix.n}×${matrix.n} · correction ${matrix.ecc} · ` +
      `${matrix.bytes.toLocaleString('fr-FR')} octet${matrix.bytes > 1 ? 's' : ''}`;
  preview.setAttribute('aria-label', sample ? 'Aperçu d’exemple du QR code' : `QR code : ${describeContent(state.content)}`);

  for (const id of ['btn-download', 'btn-copy', 'btn-share', 'btn-save']) $('#' + id).disabled = sample;
  $('#export-name').placeholder = defaultFileName();
  updateContrastWarning();
  scheduleScan();
}

function updateContrastWarning() {
  const s = state.style;
  const fg = [s.dots.fill.c1];
  if (s.dots.fill.type !== 'solid') fg.push(s.dots.fill.c2);
  if (s.eyes.custom) fg.push(s.eyes.outerColor, s.eyes.innerColor);
  const transparent = s.bg.type === 'none';
  const bg = transparent ? ['#ffffff'] : s.bg.type === 'solid' ? [s.bg.c1] : [s.bg.c1, s.bg.c2];
  let min = Infinity;
  for (const a of fg) for (const b of bg) min = Math.min(min, contrastRatio(a, b));
  const msgs = [];
  if (min < 3) {
    msgs.push(`Contraste faible (${min.toFixed(1).replace('.', ',')}:1) entre les modules et le fond${transparent ? ' blanc' : ''} : la lecture risque d’échouer. Visez au moins 4:1.`);
  }
  if (luminance(fg[0]) > luminance(bg[0])) {
    msgs.push('Modules plus clairs que le fond : certains lecteurs ne lisent pas les QR codes inversés.');
  }
  if (transparent) msgs.push('Fond transparent : posez le QR code sur une surface claire et unie.');
  const el = $('#contrast-warning');
  el.hidden = !msgs.length;
  el.textContent = msgs.join(' ');
}

// La vérification de lecture tourne après une courte pause dans la saisie.
let scanTimer = 0;
let scanToken = 0;
function setBadge(stateName, text, title = '') {
  const badge = $('#scan-badge');
  badge.dataset.state = stateName;
  badge.title = title;
  badge.querySelector('use').setAttribute('href', stateName === 'fail' ? '#i-alert' : '#i-check');
  $('#scan-text').textContent = text;
}
function scheduleScan() {
  clearTimeout(scanTimer);
  const token = ++scanToken;
  setBadge('checking', 'Vérification…');
  scanTimer = setTimeout(async () => {
    const { matrix, data } = current;
    const style = clone(state.style);
    let ok = false;
    try {
      ok = await scanCheck((w) => renderSVG(matrix, style, { width: w }), data, '#ffffff');
    } catch {
      if (token === scanToken) setBadge('idle', 'Vérification indisponible');
      return;
    }
    if (token !== scanToken) return;
    if (ok) setBadge('ok', 'Lecture vérifiée', 'Le QR code a été relu avec succès par un décodeur.');
    else setBadge('fail', 'Lecture incertaine', 'Le décodeur intégré n’a pas pu le relire : augmentez le contraste, réduisez le logo ou choisissez des formes plus pleines, puis testez avec un téléphone.');
  }, 380);
}

/* ============================== Changements ============================== */

let draftTimer = 0;
function saveDraftSoon() {
  clearTimeout(draftTimer);
  draftTimer = setTimeout(() => {
    store.kvSet('draft', { content: state.content, style: state.style, export: state.export, session }).catch(() => {});
  }, 500);
}

function adjustEventInputs() {
  const ev = state.content.event;
  const type = ev.allDay ? 'date' : 'datetime-local';
  for (const key of ['start', 'end']) {
    const el = $('#event-' + key);
    if (el.type !== type) el.type = type;
    const v = ev[key];
    if (v) ev[key] = ev.allDay ? v.slice(0, 10) : v.length === 10 ? `${v}T09:00` : v;
  }
}

function onChange(path) {
  if (path === 'content.event.allDay') adjustEventInputs();
  scheduleRender();
  saveDraftSoon();
}

/* ============================== Logo ============================== */

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Image illisible.'));
    img.src = url;
  });
}

// Toute image est ramenée à un PNG de 512 px maximum : poids raisonnable pour le
// stockage, et format accepté partout (aperçu, PDF, sauvegarde).
async function loadLogo(file) {
  if (!file) return;
  if (!/^image\//.test(file.type)) {
    toast('Ce fichier n’est pas une image.', { error: true });
    return;
  }
  if (file.size > 15 * 1024 * 1024) {
    toast('Image trop lourde (15 Mo au maximum).', { error: true });
    return;
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const w0 = img.naturalWidth || 512, h0 = img.naturalHeight || 512;
    const k = file.type === 'image/svg+xml' ? 512 / Math.max(w0, h0) : Math.min(1, 512 / Math.max(w0, h0));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(w0 * k));
    canvas.height = Math.max(1, Math.round(h0 * k));
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    state.style.logo.src = canvas.toDataURL('image/png');
    onChange('style.logo.src');
    toast(state.style.ecc === 'auto' ? 'Logo ajouté — correction d’erreur passée à « élevée »' : 'Logo ajouté');
  } catch {
    toast('Impossible de lire cette image.', { error: true });
  } finally {
    URL.revokeObjectURL(url);
  }
}

function setupLogo() {
  const input = $('#logo-file');
  input.addEventListener('change', () => {
    loadLogo(input.files[0]);
    input.value = '';
  });
  $('#logo-remove').addEventListener('click', () => {
    state.style.logo.src = null;
    onChange('style.logo.src');
  });
  const zone = $('#logo-drop');
  zone.addEventListener('dragover', (e) => {
    e.preventDefault();
    zone.classList.add('dragover');
  });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('dragover');
    loadLogo(e.dataTransfer.files[0]);
  });
}

/* ============================== Export ============================== */

function slug(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50);
}

function defaultFileName() {
  return current.sample ? 'qr-code' : 'qr-' + (slug(describeContent(state.content)) || 'code');
}

function fileName(format) {
  const base = (state.export.name.trim() || defaultFileName())
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '-')
    .replace(/\.(png|jpe?g|webp|svg|pdf)$/i, '')
    .slice(0, 80) || 'qr-code';
  return `${base}.${EXT[format]}`;
}

function renderer() {
  const { matrix } = current;
  const style = clone(state.style);
  return (w) => renderSVG(matrix, style, { width: w });
}

async function withBusy(button, task) {
  if (button.getAttribute('aria-busy') === 'true') return;
  button.setAttribute('aria-busy', 'true');
  try {
    await task();
  } catch (e) {
    if (e && e.name === 'AbortError') return;
    toast((e && e.message) || 'L’opération a échoué.', { error: true });
  } finally {
    button.removeAttribute('aria-busy');
  }
}

function setupExport() {
  const formatName = () => state.export.format.toUpperCase();

  $('#btn-download').addEventListener('click', (e) => withBusy(e.currentTarget, async () => {
    if (current.sample) return;
    const settings = { ...state.export };
    const blob = await exportBlob(renderer(), settings);
    download(blob, fileName(settings.format));
    toast(`${formatName()} téléchargé`);
    await saveToHistory({ silent: true });
  }));

  const copy = $('#btn-copy');
  copy.hidden = !canCopyImage();
  copy.addEventListener('click', (e) => withBusy(e.currentTarget, async () => {
    if (current.sample) return;
    const png = exportBlob(renderer(), { ...state.export, format: 'png' });
    await copyImage(png);
    toast('Image PNG copiée dans le presse-papiers');
    await saveToHistory({ silent: true });
  }));

  const share = $('#btn-share');
  share.hidden = !canShareFiles();
  share.addEventListener('click', (e) => withBusy(e.currentTarget, async () => {
    if (current.sample) return;
    const settings = { ...state.export };
    const blob = await exportBlob(renderer(), settings);
    const file = new File([blob], fileName(settings.format), { type: blob.type });
    await navigator.share({ files: [file], title: describeContent(state.content) });
    await saveToHistory({ silent: true });
  }));

  $('#btn-save').addEventListener('click', () => saveToHistory({ silent: false }));
}

/* ============================== Historique ============================== */

let thumbMatrix = null;
function thumbSVG(content, style) {
  let matrix = null;
  if (content) {
    const built = buildPayload(content);
    if (built.data) matrix = getMatrix(built.data, resolveEcc(style), minVersion(style));
  }
  thumbMatrix ||= getMatrix('CutieQR', 'M');
  return renderSVG(matrix || thumbMatrix, style).svg;
}

async function saveToHistory({ silent }) {
  if (current.sample) {
    if (!silent) toast('Saisissez d’abord un contenu valide.', { error: true });
    return;
  }
  const now = Date.now();
  const entry = {
    id: session.id || store.newId(),
    createdAt: session.createdAt || now,
    updatedAt: now,
    type: state.content.type,
    label: describeContent(state.content),
    content: clone(state.content),
    style: clone(state.style),
  };
  try {
    await store.put('history', entry);
  } catch {
    toast('Enregistrement impossible : stockage plein ou indisponible.', { error: true });
    return;
  }
  const isNew = !session.id;
  session = { id: entry.id, createdAt: entry.createdAt };
  saveDraftSoon();
  if (!silent) toast(isNew ? 'Ajouté à l’historique' : 'Historique mis à jour');
  if (!$('#panel-history').hidden) renderHistory();
}

const dateFormat = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });

async function renderHistory() {
  const list = $('#history-list');
  const query = slug($('#history-search').value);
  let items = (await store.getAll('history')).sort((a, b) => b.updatedAt - a.updatedAt);
  const total = items.length;
  if (query) items = items.filter((it) => slug(`${it.label} ${typeLabel(it.type)}`).includes(query));
  list.replaceChildren();
  $('#btn-clear-history').disabled = !total;
  if (!items.length) {
    const p = document.createElement('p');
    p.className = 'empty';
    p.textContent = total ? 'Aucun résultat.' : 'Aucun QR code pour l’instant. Ceux que vous exportez ou enregistrez apparaîtront ici.';
    list.append(p);
    return;
  }
  for (const it of items) {
    const content = sanitizeContent(it.content);
    const style = mergeStyle(it.style);
    const row = document.createElement('div');
    row.className = 'history-item' + (it.id === session.id ? ' current' : '');

    const thumb = document.createElement('div');
    thumb.className = 'history-thumb checker';
    thumb.innerHTML = thumbSVG(content, style);

    const text = document.createElement('div');
    text.className = 'history-text';
    const title = document.createElement('div');
    title.className = 'history-title';
    title.textContent = typeof it.label === 'string' ? it.label : describeContent(content);
    title.title = title.textContent;
    const meta = document.createElement('div');
    meta.className = 'history-meta';
    meta.textContent = `${typeLabel(content.type)} · ${dateFormat.format(new Date(it.updatedAt || Date.now()))}`;
    text.append(title, meta);

    const actions = document.createElement('div');
    actions.className = 'history-actions';
    const open = iconButton('Ouvrir', null, 'btn sm');
    open.addEventListener('click', () => {
      state.content = content;
      state.style = style;
      session = { id: it.id, createdAt: it.createdAt || Date.now() };
      adjustEventInputs();
      onChange('history');
      renderHistory();
      toast('QR code rouvert : vos modifications mettront à jour cette entrée');
    });
    const del = iconButton(null, 'i-trash', 'btn sm icon-only danger', `Supprimer « ${title.textContent} »`);
    del.addEventListener('click', async () => {
      await store.remove('history', it.id);
      if (session.id === it.id) session = { id: null, createdAt: null };
      renderHistory();
      toast('Supprimé de l’historique', {
        action: { label: 'Annuler', run: async () => { await store.put('history', it); renderHistory(); } },
      });
    });
    actions.append(open, del);
    row.append(thumb, text, actions);
    list.append(row);
  }
}

function iconButton(label, icon, className, ariaLabel) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = className;
  if (icon) b.innerHTML = `<svg class="icon"><use href="#${icon}"/></svg>`;
  if (label) {
    const span = document.createElement('span');
    span.textContent = label;
    b.append(span);
  }
  if (ariaLabel) {
    b.setAttribute('aria-label', ariaLabel);
    b.title = ariaLabel;
  }
  return b;
}

/* ============================== Modèles ============================== */

function templateCard(name, style, onApply, onDelete) {
  const card = document.createElement('div');
  card.className = 'card';
  const thumb = document.createElement('button');
  thumb.type = 'button';
  thumb.className = 'card-thumb checker';
  thumb.setAttribute('aria-label', `Appliquer le modèle « ${name} »`);
  thumb.title = 'Appliquer ce modèle';
  thumb.innerHTML = thumbSVG(null, style);
  thumb.addEventListener('click', onApply);
  const foot = document.createElement('div');
  foot.className = 'card-foot';
  const label = document.createElement('span');
  label.className = 'card-name';
  label.textContent = name;
  label.title = name;
  foot.append(label);
  if (onDelete) {
    const del = iconButton(null, 'i-trash', 'btn sm icon-only ghost danger', `Supprimer le modèle « ${name} »`);
    del.addEventListener('click', onDelete);
    foot.append(del);
  }
  card.append(thumb, foot);
  return card;
}

async function renderTemplates() {
  const mine = (await store.getAll('templates')).sort((a, b) => b.createdAt - a.createdAt);
  const host = $('#my-templates');
  host.replaceChildren();
  if (!mine.length) {
    const p = document.createElement('p');
    p.className = 'empty';
    p.textContent = 'Aucun modèle enregistré.';
    host.append(p);
  }
  for (const t of mine) {
    const style = mergeStyle(t.style);
    const name = String(t.name || 'Modèle');
    host.append(templateCard(name, style, () => {
      state.style = clone(style);
      onChange('template');
      toast(`Modèle « ${name} » appliqué`);
    }, async () => {
      await store.remove('templates', t.id);
      renderTemplates();
      toast('Modèle supprimé', {
        action: { label: 'Annuler', run: async () => { await store.put('templates', t); renderTemplates(); } },
      });
    }));
  }

  const builtin = $('#builtin-templates');
  if (!builtin.childElementCount) {
    for (const p of PRESETS) {
      const style = mergeStyle(p.style);
      builtin.append(templateCard(p.name, style, () => {
        // Les modèles fournis ne définissent pas de logo : on garde celui en place.
        const logo = state.style.logo;
        state.style = clone(style);
        state.style.logo = logo;
        onChange('template');
        toast(`Modèle « ${p.name} » appliqué`);
      }));
    }
  }
}

function setupTemplates() {
  $('#template-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = $('#template-name');
    const name = input.value.trim();
    if (!name) return;
    const existing = (await store.getAll('templates')).find((t) => t.name.toLowerCase() === name.toLowerCase());
    try {
      await store.put('templates', {
        id: existing ? existing.id : store.newId(),
        name,
        createdAt: existing ? existing.createdAt : Date.now(),
        style: clone(state.style),
      });
    } catch {
      toast('Enregistrement impossible : stockage plein ou indisponible.', { error: true });
      return;
    }
    input.value = '';
    renderTemplates();
    toast(existing ? `Modèle « ${name} » remplacé` : `Modèle « ${name} » enregistré`);
  });
}

/* ============================== Sauvegarde ============================== */

function setupBackup() {
  $('#btn-backup').addEventListener('click', async () => {
    const data = {
      app: 'cutieqr',
      version: 1,
      exportedAt: new Date().toISOString(),
      templates: await store.getAll('templates'),
      history: await store.getAll('history'),
    };
    const stamp = new Date().toISOString().slice(0, 10);
    download(new Blob([JSON.stringify(data)], { type: 'application/json' }), `cutieqr-sauvegarde-${stamp}.json`);
    toast(`Sauvegarde téléchargée (${data.templates.length} modèle(s), ${data.history.length} QR code(s))`);
  });

  const input = $('#restore-file');
  input.addEventListener('change', async () => {
    const file = input.files[0];
    input.value = '';
    if (!file) return;
    let data;
    try {
      data = JSON.parse(await file.text());
    } catch {
      toast('Fichier illisible : ce n’est pas une sauvegarde CutieQR.', { error: true });
      return;
    }
    if (!data || data.app !== 'cutieqr') {
      toast('Ce fichier n’est pas une sauvegarde CutieQR.', { error: true });
      return;
    }
    const validId = (id) => typeof id === 'string' && /^[\w-]{1,64}$/.test(id);
    const stamp = (v) => (Number.isFinite(v) ? v : Date.now());
    let count = 0;
    for (const t of Array.isArray(data.templates) ? data.templates : []) {
      if (!t || !validId(t.id) || typeof t.name !== 'string') continue;
      await store.put('templates', { id: t.id, name: t.name.slice(0, 40), createdAt: stamp(t.createdAt), style: mergeStyle(t.style) });
      count++;
    }
    for (const h of Array.isArray(data.history) ? data.history : []) {
      if (!h || !validId(h.id)) continue;
      const content = sanitizeContent(h.content);
      await store.put('history', {
        id: h.id,
        createdAt: stamp(h.createdAt),
        updatedAt: stamp(h.updatedAt),
        type: content.type,
        label: describeContent(content),
        content,
        style: mergeStyle(h.style),
      });
      count++;
    }
    renderHistory();
    renderTemplates();
    toast(count ? `${count} élément(s) restauré(s)` : 'La sauvegarde ne contenait aucun élément.');
  });

  $('#btn-clear-history').addEventListener('click', async () => {
    if (!confirm('Supprimer tout l’historique de cet appareil ? Les modèles sont conservés.')) return;
    await store.clear('history');
    session = { id: null, createdAt: null };
    saveDraftSoon();
    renderHistory();
    toast('Historique vidé');
  });

  $('#history-search').addEventListener('input', () => renderHistory());
}

/* ============================== Divers ============================== */

function setupMisc() {
  // Thème
  const mq = matchMedia('(prefers-color-scheme: dark)');
  const effective = () => document.documentElement.dataset.theme || (mq.matches ? 'dark' : 'light');
  const syncThemeColor = () => {
    const bg = getComputedStyle(document.body).backgroundColor;
    for (const meta of $$('meta[name="theme-color"]')) meta.content = bg;
  };
  $('#btn-theme').addEventListener('click', () => {
    const next = effective() === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('cutieqr-theme', next); } catch { /* préférence non retenue */ }
    syncThemeColor();
  });
  if (document.documentElement.dataset.theme) syncThemeColor();

  // Nouveau QR code : on vide le contenu, on garde le style.
  $('#btn-new').addEventListener('click', () => {
    const type = state.content.type;
    state.content = defaultContent();
    state.content.type = type;
    state.export.name = '';
    session = { id: null, createdAt: null };
    adjustEventInputs();
    onChange('new');
    $('#tab-content').click();
    toast('Nouveau QR code — le style actuel est conservé');
  });

  // Intervertir les deux couleurs d'un dégradé
  for (const b of $$('[data-swap]')) {
    b.addEventListener('click', () => {
      const fill = getPath(b.dataset.swap);
      [fill.c1, fill.c2] = [fill.c2, fill.c1];
      onChange(b.dataset.swap);
    });
  }

  // Position actuelle
  $('#btn-locate').addEventListener('click', (e) => {
    if (!navigator.geolocation) {
      toast('La géolocalisation n’est pas disponible sur cet appareil.', { error: true });
      return;
    }
    const btn = e.currentTarget;
    btn.setAttribute('aria-busy', 'true');
    navigator.geolocation.getCurrentPosition((pos) => {
      btn.removeAttribute('aria-busy');
      state.content.geo.lat = pos.coords.latitude.toFixed(6);
      state.content.geo.lng = pos.coords.longitude.toFixed(6);
      onChange('content.geo');
      toast(`Position trouvée (précision ± ${Math.round(pos.coords.accuracy)} m)`);
    }, (err) => {
      btn.removeAttribute('aria-busy');
      toast(err.code === 1 ? 'Accès à la position refusé.' : 'Position indisponible, réessayez.', { error: true });
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 });
  });

  // Ctrl/Cmd + S : enregistrer dans l'historique
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 's') {
      e.preventDefault();
      saveToHistory({ silent: false });
    }
  });

  // Installation de l'application
  let installEvent = null;
  const install = $('#btn-install');
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    installEvent = e;
    install.hidden = false;
  });
  install.addEventListener('click', async () => {
    if (!installEvent) return;
    installEvent.prompt();
    await installEvent.userChoice.catch(() => null);
    installEvent = null;
    install.hidden = true;
  });
  window.addEventListener('appinstalled', () => {
    install.hidden = true;
    toast('CutieQR est installé');
  });
}

async function restoreDraft() {
  try {
    const draft = await store.kvGet('draft');
    if (!draft) return;
    state.content = sanitizeContent(draft.content);
    state.style = mergeStyle(draft.style);
    state.export = sanitizeExport(draft.export);
    const s = draft.session;
    if (s && typeof s.id === 'string') session = { id: s.id, createdAt: Number(s.createdAt) || Date.now() };
  } catch {
    /* brouillon illisible : on repart des valeurs par défaut */
  }
}

async function init() {
  buildColorFields();
  buildTiles();
  bindInputs();
  setupTabs();
  setupLogo();
  setupExport();
  setupTemplates();
  setupBackup();
  setupMisc();
  await restoreDraft();
  adjustEventInputs();
  renderNow();

  if (!(await store.persistent())) {
    toast('Stockage local indisponible (navigation privée ?) : modèles et historique ne seront pas conservés.', { error: true });
  }

  const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  if ('serviceWorker' in navigator && !local) {
    navigator.serviceWorker.register('sw.js').catch(() => { /* hors ligne indisponible, l'app fonctionne */ });
  }
}

init();

// Pour la console et les tests
window.cutieQR = { state, CONTENT_TYPES };
