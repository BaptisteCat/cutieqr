/* global qrcode */
// Moteur de rendu : matrice QR + style → SVG. Le SVG est la source unique de
// tous les exports (aperçu, PNG/JPEG/WebP par rastérisation, PDF vectoriel).
// Toutes les coordonnées sont exprimées en « modules » (1 = un carré du QR).

export const DOT_SHAPES = [
  { id: 'square', label: 'Carrés' },
  { id: 'rounded', label: 'Arrondis' },
  { id: 'fluid', label: 'Fluide' },
  { id: 'dots', label: 'Points' },
  { id: 'diamond', label: 'Losanges' },
  { id: 'leaf', label: 'Feuilles' },
  { id: 'vbars', label: 'Barres verticales' },
  { id: 'hbars', label: 'Barres horizontales' },
];

export const EYE_SHAPES = [
  { id: 'square', label: 'Carré' },
  { id: 'rounded', label: 'Arrondi' },
  { id: 'circle', label: 'Cercle' },
  { id: 'drop', label: 'Goutte' },
  { id: 'leaf', label: 'Feuille' },
];

export const FONTS = {
  sans: "Arial, Helvetica, sans-serif",
  serif: "'Times New Roman', Times, serif",
  mono: "'Courier New', Courier, monospace",
};

export function defaultStyle() {
  return {
    ecc: 'auto',
    margin: 3,
    dots: { shape: 'square', scale: 0.9, fill: { type: 'solid', c1: '#111111', c2: '#e4572e', angle: 45 } },
    eyes: { outer: 'square', inner: 'square', custom: false, outerColor: '#111111', innerColor: '#111111' },
    bg: { type: 'solid', c1: '#ffffff', c2: '#e9eef5', angle: 90 },
    logo: { src: null, size: 22, pad: 1, shape: 'square', clear: true, plate: false, plateColor: '#ffffff' },
    compact: { enabled: false, www: false, tracking: false },
    frame: {
      style: 'none', text: 'Scannez-moi', font: 'sans', bold: true, upper: false, size: 3,
      color: '#111111', textColor: '#ffffff', radius: 0, thickness: 1.5,
    },
  };
}

const HEX = /^#[0-9a-f]{6}$/i;
const LOGO_SRC = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/;

// Fusion sur les valeurs par défaut + validation de chaque champ. Un style peut
// venir d'un fichier de sauvegarde importé ou d'une version antérieure : comme
// ses valeurs sont injectées dans le balisage SVG, rien n'y entre sans contrôle.
export function mergeStyle(partial) {
  const d = defaultStyle();
  const p = partial && typeof partial === 'object' ? partial : {};
  const sub = (o, k) => (o && typeof o[k] === 'object' && o[k] ? o[k] : {});
  const color = (v, def) => (typeof v === 'string' && HEX.test(v) ? v.toLowerCase() : def);
  const num = (v, min, max, def) => {
    const x = typeof v === 'number' || typeof v === 'string' ? Number(v) : NaN;
    return Number.isFinite(x) ? Math.min(max, Math.max(min, x)) : def;
  };
  const pick = (v, list, def) => (list.includes(v) ? v : def);
  const bool = (v, def) => (typeof v === 'boolean' ? v : def);
  const fill = (v, def, types) => ({
    type: pick(v.type, types, def.type),
    c1: color(v.c1, def.c1),
    c2: color(v.c2, def.c2),
    angle: num(v.angle, 0, 360, def.angle),
  });
  const shapeIds = EYE_SHAPES.map((s) => s.id);
  const dots = sub(p, 'dots'), eyes = sub(p, 'eyes'), logo = sub(p, 'logo'), frame = sub(p, 'frame');
  const compact = sub(p, 'compact');
  return {
    ecc: pick(p.ecc, ['auto', 'L', 'M', 'Q', 'H'], d.ecc),
    margin: Math.round(num(p.margin, 0, 8, d.margin)),
    dots: {
      shape: pick(dots.shape, DOT_SHAPES.map((s) => s.id), d.dots.shape),
      scale: num(dots.scale, 0.5, 1, d.dots.scale),
      fill: fill(sub(dots, 'fill'), d.dots.fill, ['solid', 'linear', 'radial']),
    },
    eyes: {
      outer: pick(eyes.outer, shapeIds, d.eyes.outer),
      inner: pick(eyes.inner, shapeIds, d.eyes.inner),
      custom: bool(eyes.custom, d.eyes.custom),
      outerColor: color(eyes.outerColor, d.eyes.outerColor),
      innerColor: color(eyes.innerColor, d.eyes.innerColor),
    },
    bg: fill(sub(p, 'bg'), d.bg, ['solid', 'linear', 'radial', 'none']),
    logo: {
      src: typeof logo.src === 'string' && LOGO_SRC.test(logo.src) ? logo.src : null,
      size: num(logo.size, 10, 32, d.logo.size),
      pad: num(logo.pad, 0, 3, d.logo.pad),
      shape: pick(logo.shape, ['square', 'rounded', 'circle'], d.logo.shape),
      clear: bool(logo.clear, d.logo.clear),
      plate: bool(logo.plate, d.logo.plate),
      plateColor: color(logo.plateColor, d.logo.plateColor),
    },
    compact: {
      enabled: bool(compact.enabled, d.compact.enabled),
      www: bool(compact.www, d.compact.www),
      tracking: bool(compact.tracking, d.compact.tracking),
    },
    frame: {
      style: pick(frame.style, ['none', 'border', 'bottom', 'top', 'label'], d.frame.style),
      text: typeof frame.text === 'string' ? frame.text.slice(0, 60) : d.frame.text,
      font: pick(frame.font, Object.keys(FONTS), d.frame.font),
      bold: bool(frame.bold, d.frame.bold),
      upper: bool(frame.upper, d.frame.upper),
      size: num(frame.size, 1.5, 6, d.frame.size),
      color: color(frame.color, d.frame.color),
      textColor: color(frame.textColor, d.frame.textColor),
      radius: num(frame.radius, 0, 8, d.frame.radius),
      thickness: num(frame.thickness, 0.5, 4, d.frame.thickness),
    },
  };
}

export function resolveEcc(style) {
  if (style.ecc !== 'auto') return style.ecc;
  if (style.logo.src) return 'H';
  // En compact, on part du plancher L : la correction est ensuite relevée au maximum
  // que permet la version obtenue.
  return style.compact.enabled ? 'L' : 'M';
}

// Un logo masque des modules : les toutes petites versions n'ont pas assez de
// redondance pour l'encaisser, on impose alors au moins la version 3 (29×29).
export const MIN_VERSION_WITH_LOGO = 3;

/* ---------- Encodage compact ----------
   Un QR code peut enchaîner des segments de modes différents : numérique
   (3,3 bits par chiffre), alphanumérique (5,5 bits par caractère parmi
   0-9 A-Z espace $%*+-./:) et octet (8 bits par octet UTF-8). Le découpage
   optimal se calcule par programmation dynamique (méthode de Nayuki), en
   sixièmes de bit pour rester en nombres entiers. */

const ALNUM = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';
const MODES = ['Numeric', 'Alphanumeric', 'Byte'];
const MODE_LETTER = { Numeric: 'N', Alphanumeric: 'A', Byte: 'B' };
// Bits du compteur de caractères selon la tranche de versions (1-9, 10-26, 27-40).
const COUNT_BITS = { Numeric: [10, 12, 14], Alphanumeric: [9, 11, 13], Byte: [8, 16, 16] };
const ECC_ORDER = ['L', 'M', 'Q', 'H'];

const isDigit = (ch) => ch >= '0' && ch <= '9';
const isAlnum = (ch) => ch.length === 1 && ALNUM.includes(ch);
const utf8Length = (ch) => {
  const c = ch.codePointAt(0);
  return c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4;
};

// → [{ mode, text }] minimisant le nombre de bits pour une tranche de versions.
export function segmentize(data, versionGroup = 0) {
  const chars = [...data];
  if (!chars.length) return [];
  const head = {};
  for (const m of MODES) head[m] = (4 + COUNT_BITS[m][versionGroup]) * 6;
  let prev = { ...head };
  const from = [];
  for (const ch of chars) {
    const cur = { Numeric: Infinity, Alphanumeric: Infinity, Byte: prev.Byte + utf8Length(ch) * 48 };
    const step = { Numeric: null, Alphanumeric: null, Byte: 'Byte' };
    if (isDigit(ch)) { cur.Numeric = prev.Numeric + 20; step.Numeric = 'Numeric'; }
    if (isAlnum(ch)) { cur.Alphanumeric = prev.Alphanumeric + 33; step.Alphanumeric = 'Alphanumeric'; }
    // Changer de mode après ce caractère : on clôt le segment (bits entiers) et on ouvre le suivant.
    const next = { ...cur };
    for (const to of MODES) {
      for (const k of MODES) {
        if (k === to || step[k] === null) continue;
        const cost = Math.ceil(cur[k] / 6) * 6 + head[to];
        if (cost < next[to]) { next[to] = cost; step[to] = k; }
      }
    }
    from.push(step);
    prev = next;
  }
  let state = MODES.reduce((a, b) => (Math.ceil(prev[b] / 6) < Math.ceil(prev[a] / 6) ? b : a));
  const charModes = new Array(chars.length);
  for (let i = chars.length - 1; i >= 0; i--) {
    charModes[i] = from[i][state];
    state = charModes[i];
  }
  const segments = [];
  chars.forEach((ch, i) => {
    const last = segments[segments.length - 1];
    if (last && last.mode === charModes[i]) last.text += ch;
    else segments.push({ mode: charModes[i], text: ch });
  });
  return segments;
}

function buildQr(segments, version, ecc) {
  const qr = qrcode(version, ecc);
  for (const s of segments) qr.addData(s.text, s.mode);
  qr.make();
  return qr;
}
const versionOf = (qr) => (qr.getModuleCount() - 17) / 4;

// Plus petite version pour ces segments (au moins minVersion), ou null si trop long.
function smallestQr(segments, ecc, minVersion) {
  let qr;
  try {
    qr = buildQr(segments, 0, ecc);
  } catch {
    return null;
  }
  if (versionOf(qr) < minVersion) qr = buildQr(segments, minVersion, ecc);
  return qr;
}

// Encodage compact : découpage optimal pour chaque tranche de versions, plus
// petite version obtenue, puis correction d'erreur relevée tant que la taille
// ne change pas (plus robuste, pas plus grand).
function compactQr(data, ecc, minVersion) {
  let best = null;
  for (let g = 0; g < 3; g++) {
    const segments = segmentize(data, g);
    const qr = smallestQr(segments, ecc, minVersion);
    if (qr && (!best || versionOf(qr) < versionOf(best.qr))) best = { qr, segments, ecc };
  }
  if (!best) return null;
  const version = versionOf(best.qr);
  for (const e of ECC_ORDER.slice(ECC_ORDER.indexOf(ecc) + 1).reverse()) {
    try {
      best = { qr: buildQr(best.segments, version, e), segments: best.segments, ecc: e };
      break;
    } catch { /* ne tient pas dans cette version */ }
  }
  return best;
}

// → { n, cells (Uint8Array n×n), version, ecc, bytes, segments } ; lève une erreur si le contenu est trop long.
// compact : encodage optimisé (voir compactQr) ; ecc est alors un plancher.
export function makeMatrix(data, ecc, minVersion = 0, { compact = false } = {}) {
  qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];
  let qr;
  let segments = [{ mode: 'Byte', text: data }];
  if (compact) {
    const best = compactQr(data, ecc, minVersion);
    if (!best) throw new Error('code length overflow');
    ({ qr, segments, ecc } = best);
  } else {
    qr = buildQr(segments, 0, ecc);
    if (versionOf(qr) < minVersion) qr = buildQr(segments, minVersion, ecc);
  }
  const n = qr.getModuleCount();
  const cells = new Uint8Array(n * n);
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) cells[r * n + c] = qr.isDark(r, c) ? 1 : 0;
  return {
    n, cells, version: (n - 17) / 4, ecc,
    bytes: qrcode.stringToBytes(data).length,
    segments: segments.map((s) => MODE_LETTER[s.mode] + s.text.length),
  };
}

// Centres des motifs d'alignement par version (norme ISO/IEC 18004, annexe E).
const ALIGNMENT = [
  [], [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50],
  [6, 30, 54], [6, 32, 58], [6, 34, 62], [6, 26, 46, 66], [6, 26, 48, 70], [6, 26, 50, 74], [6, 30, 54, 78],
  [6, 30, 56, 82], [6, 30, 58, 86], [6, 34, 62, 90], [6, 28, 50, 72, 94], [6, 26, 50, 74, 98],
  [6, 30, 54, 78, 102], [6, 28, 54, 80, 106], [6, 32, 58, 84, 110], [6, 30, 58, 86, 114], [6, 34, 62, 90, 118],
  [6, 26, 50, 74, 98, 122], [6, 30, 54, 78, 102, 126], [6, 26, 52, 78, 104, 130], [6, 30, 56, 82, 108, 134],
  [6, 34, 60, 86, 112, 138], [6, 30, 58, 86, 114, 142], [6, 34, 62, 90, 118, 146], [6, 30, 54, 78, 102, 126, 150],
  [6, 24, 50, 76, 102, 128, 154], [6, 28, 54, 80, 106, 132, 158], [6, 32, 58, 84, 110, 136, 162],
  [6, 26, 54, 82, 110, 138, 166], [6, 30, 58, 86, 114, 142, 170],
];

// Coins haut-gauche [colonne, ligne] des motifs d'alignement (hors repères d'angle).
function alignmentCorners(version, n) {
  const pos = ALIGNMENT[version] || [];
  const out = [];
  for (const r of pos) {
    for (const c of pos) {
      if ((r < 9 && c < 9) || (r < 9 && c > n - 9) || (r > n - 9 && c < 9)) continue;
      out.push([c - 2, r - 2]);
    }
  }
  return out;
}

const f = (v) => +v.toFixed(3);
const xml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Rectangle à coins arrondis, rayon par coin [haut-gauche, haut-droit, bas-droit, bas-gauche].
function rr(x, y, w, h, radii) {
  const [tl, tr, br, bl] = (Array.isArray(radii) ? radii : [radii, radii, radii, radii]).map((r) =>
    Math.max(0, Math.min(r, w / 2, h / 2)));
  const arc = (r, ex, ey) => (r ? `A${f(r)} ${f(r)} 0 0 1 ${f(ex)} ${f(ey)}` : '');
  return (
    `M${f(x + tl)} ${f(y)}H${f(x + w - tr)}${arc(tr, x + w, y + tr)}` +
    `V${f(y + h - br)}${arc(br, x + w - br, y + h)}` +
    `H${f(x + bl)}${arc(bl, x, y + h - bl)}` +
    `V${f(y + tl)}${arc(tl, x + tl, y)}Z`
  );
}

const circle = (cx, cy, r) =>
  `M${f(cx - r)} ${f(cy)}a${f(r)} ${f(r)} 0 1 0 ${f(2 * r)} 0a${f(r)} ${f(r)} 0 1 0 ${f(-2 * r)} 0Z`;

function dotsPath(grid, n, shape, scale, ox, oy) {
  const on = (r, c) => r >= 0 && c >= 0 && r < n && c < n && grid[r * n + c] === 1;
  const w = Math.max(0.4, Math.min(1, scale));
  const off = (1 - w) / 2;
  let d = '';

  if (shape === 'square' || shape === 'hbars') {
    // Fusion des suites horizontales en un seul rectangle.
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (!on(r, c)) continue;
        let len = 1;
        while (on(r, c + len)) len++;
        d += shape === 'square'
          ? `M${f(ox + c)} ${f(oy + r)}h${len}v1h${-len}Z`
          : rr(ox + c, oy + r + off, len, w, w / 2);
        c += len;
      }
    }
    return d;
  }
  if (shape === 'vbars') {
    for (let c = 0; c < n; c++) {
      for (let r = 0; r < n; r++) {
        if (!on(r, c)) continue;
        let len = 1;
        while (on(r + len, c)) len++;
        d += rr(ox + c + off, oy + r, w, len, w / 2);
        r += len;
      }
    }
    return d;
  }
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (!on(r, c)) continue;
      const x = ox + c, y = oy + r;
      switch (shape) {
        case 'rounded':
          d += rr(x + off, y + off, w, w, w * 0.28);
          break;
        case 'fluid': {
          const up = on(r - 1, c), down = on(r + 1, c), left = on(r, c - 1), right = on(r, c + 1);
          d += rr(x, y, 1, 1, [!up && !left ? 0.5 : 0, !up && !right ? 0.5 : 0, !down && !right ? 0.5 : 0, !down && !left ? 0.5 : 0]);
          break;
        }
        case 'dots':
          d += circle(x + 0.5, y + 0.5, w / 2);
          break;
        case 'diamond': {
          const h = w * 0.6;
          d += `M${f(x + 0.5)} ${f(y + 0.5 - h)}L${f(x + 0.5 + h)} ${f(y + 0.5)}L${f(x + 0.5)} ${f(y + 0.5 + h)}L${f(x + 0.5 - h)} ${f(y + 0.5)}Z`;
          break;
        }
        case 'leaf':
          d += rr(x + off, y + off, w, w, [w / 2, 0, w / 2, 0]);
          break;
        default:
          d += `M${f(x)} ${f(y)}h1v1h-1Z`;
      }
    }
  }
  return d;
}

// Rayons des coins d'un œil (repère d'angle) pour un carré de côté `size`.
function eyeRadii(kind, size) {
  const k = size / 7; // 7 = contour extérieur ; l'iris (3) et l'anneau intérieur (5) sont proportionnels
  switch (kind) {
    case 'rounded': return [2 * k, 2 * k, 2 * k, 2 * k];
    case 'circle': return [size / 2, size / 2, size / 2, size / 2];
    case 'drop': return [0, 2.6 * k, 2.6 * k, 2.6 * k];
    case 'leaf': return [0, 2.6 * k, 0, 2.6 * k];
    default: return [0, 0, 0, 0];
  }
}

// Les formes asymétriques sont retournées pour que leur pointe vise le coin du QR.
function orient([tl, tr, br, bl], eyeIndex) {
  if (eyeIndex === 1) return [tr, tl, bl, br]; // haut-droit : miroir horizontal
  if (eyeIndex === 2) return [bl, br, tr, tl]; // bas-gauche : miroir vertical
  return [tl, tr, br, bl];
}

function eyeOuterPath(kind, x, y, eyeIndex) {
  const outer = orient(eyeRadii(kind, 7), eyeIndex);
  const inner = outer.map((r) => Math.max(0, r - 1));
  return rr(x, y, 7, 7, outer) + rr(x + 1, y + 1, 5, 5, inner);
}

function eyeInnerPath(kind, x, y, eyeIndex) {
  return rr(x + 2, y + 2, 3, 3, orient(eyeRadii(kind, 3), eyeIndex));
}

// Motif d'alignement (5×5) dessiné d'un bloc dans le style des yeux : fragmenté
// en points ou en losanges, il ne serait plus repéré par les lecteurs.
function alignmentPath(outerKind, innerKind, x, y) {
  const outer = eyeRadii(outerKind, 5);
  return rr(x, y, 5, 5, outer) + rr(x + 1, y + 1, 3, 3, outer.map((r) => Math.max(0, r - 1))) +
    rr(x + 2, y + 2, 1, 1, eyeRadii(innerKind, 1));
}

function paint(fill, id, x, y, w, h, defs) {
  if (fill.type === 'linear') {
    const a = ((fill.angle || 0) * Math.PI) / 180;
    const dx = Math.cos(a), dy = Math.sin(a);
    const L = (Math.abs(dx) * w + Math.abs(dy) * h) / 2;
    const cx = x + w / 2, cy = y + h / 2;
    defs.push(
      `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${f(cx - dx * L)}" y1="${f(cy - dy * L)}" x2="${f(cx + dx * L)}" y2="${f(cy + dy * L)}">` +
      `<stop offset="0" stop-color="${fill.c1}"/><stop offset="1" stop-color="${fill.c2}"/></linearGradient>`);
    return `url(#${id})`;
  }
  if (fill.type === 'radial') {
    defs.push(
      `<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${f(x + w / 2)}" cy="${f(y + h / 2)}" r="${f(Math.hypot(w, h) / 2)}">` +
      `<stop offset="0" stop-color="${fill.c1}"/><stop offset="1" stop-color="${fill.c2}"/></radialGradient>`);
    return `url(#${id})`;
  }
  return fill.c1;
}

let measureCtx = null;
// Largeur d'un texte pour une taille de police de 1.
function measureText(text, font, bold) {
  if (typeof document === 'undefined') return text.length * 0.56;
  measureCtx ||= document.createElement('canvas').getContext('2d');
  measureCtx.font = `${bold ? 'bold ' : ''}100px ${FONTS[font] || FONTS.sans}`;
  return measureCtx.measureText(text).width / 100;
}

const FRAMED = ['border', 'bottom', 'top'];
const CAPTIONED = ['bottom', 'top', 'label'];

let renderCount = 0;

// → { svg, width, height } (dimensions en modules ; opts.width fixe la largeur en pixels du SVG)
export function renderSVG(matrix, rawStyle, opts = {}) {
  const style = mergeStyle(rawStyle);
  const n = matrix.n;
  const m = Math.max(0, style.margin);
  const Q = n + 2 * m;
  const fr = style.frame;
  const uid = `q${++renderCount}`;
  const defs = [];
  const out = [];

  // --- Mise en page : cadre, bandeau de légende, bloc QR ---
  const caption = CAPTIONED.includes(fr.style) ? (fr.upper ? fr.text.toUpperCase() : fr.text).trim() : '';
  const t = FRAMED.includes(fr.style) ? fr.thickness : 0;
  const W = Q + 2 * t;
  let fs = 0, band = 0;
  if (caption) {
    fs = fr.size;
    band = fr.style === 'label' ? fs * 1.7 : Math.max(fs * 1.9, t);
    const w1 = measureText(caption, fr.font, fr.bold) || 1;
    fs = Math.min(fs, (W - 2) / w1);
  }
  const topPad = fr.style === 'top' && caption ? band : t;
  const bottomPad = fr.style === 'bottom' && caption ? band : fr.style === 'label' ? band : t;
  const H = topPad + Q + bottomPad;
  const bx = t, by = topPad;       // bloc QR (zone de silence comprise)
  const qx = bx + m, qy = by + m;  // premier module
  const radius = Math.min(fr.radius, W / 2);

  // --- Fond ---
  const framed = t > 0 || (caption && fr.style !== 'label');
  if (style.bg.type !== 'none') {
    if (framed) {
      // Déborde légèrement sous le cadre pour éviter un liseré à la jonction.
      const e = Math.min(0.1, t);
      const fill = paint(style.bg, `${uid}bg`, bx, by, Q, Q, defs);
      out.push(`<path d="${rr(bx - e, by - e, Q + 2 * e, Q + 2 * e, Math.max(0, radius - t) + e)}" fill="${fill}"/>`);
    } else {
      const fill = paint(style.bg, `${uid}bg`, 0, 0, W, H, defs);
      out.push(`<path d="${rr(0, 0, W, H, radius)}" fill="${fill}"/>`);
    }
  }
  if (framed) {
    out.push(`<path fill-rule="evenodd" d="${rr(0, 0, W, H, radius)}${rr(bx, by, Q, Q, Math.max(0, radius - t))}" fill="${fr.color}"/>`);
  }

  // --- Modules : on retire les yeux (dessinés à part) et la zone du logo ---
  const grid = Uint8Array.from(matrix.cells);
  const eyes = [[0, 0], [n - 7, 0], [0, n - 7]]; // [colonne, ligne]
  for (const [ec, er] of eyes) {
    for (let r = er; r < er + 7; r++) for (let c = ec; c < ec + 7; c++) grid[r * n + c] = 0;
  }
  const logo = style.logo;
  const logoSize = (n * Math.max(5, Math.min(40, logo.size))) / 100;
  const cut = logoSize / 2 + logo.pad;
  // Motif d'alignement masqué (même partiellement) par le logo : on le laisse en modules.
  const underLogo = ([c, r]) => logo.src && logo.clear &&
    Math.abs(c + 2.5 - n / 2) < cut + 2.5 && Math.abs(r + 2.5 - n / 2) < cut + 2.5;
  const aligns = alignmentCorners(matrix.version, n).filter((a) => !underLogo(a));
  for (const [ac, ar] of aligns) {
    for (let r = ar; r < ar + 5; r++) for (let c = ac; c < ac + 5; c++) grid[r * n + c] = 0;
  }
  if (logo.src && logo.clear) {
    const rad = cut * 0.35;
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        const dx = Math.abs(c + 0.5 - n / 2), dy = Math.abs(r + 0.5 - n / 2);
        let inside = dx < cut && dy < cut;
        if (inside && logo.shape === 'circle') inside = Math.hypot(dx, dy) < cut;
        if (inside && logo.shape === 'rounded' && dx > cut - rad && dy > cut - rad) {
          inside = Math.hypot(dx - (cut - rad), dy - (cut - rad)) < rad;
        }
        if (inside) grid[r * n + c] = 0;
      }
    }
  }

  const dotFill = paint(style.dots.fill, `${uid}fg`, qx, qy, n, n, defs);
  const d = dotsPath(grid, n, style.dots.shape, style.dots.scale, qx, qy);
  if (d) out.push(`<path d="${d}" fill="${dotFill}"/>`);
  if (aligns.length) {
    const ad = aligns.map(([ac, ar]) => alignmentPath(style.eyes.outer, style.eyes.inner, qx + ac, qy + ar)).join('');
    out.push(`<path fill-rule="evenodd" d="${ad}" fill="${dotFill}"/>`);
  }

  const outerFill = style.eyes.custom ? style.eyes.outerColor : dotFill;
  const innerFill = style.eyes.custom ? style.eyes.innerColor : dotFill;
  let outerD = '', innerD = '';
  eyes.forEach(([ec, er], i) => {
    outerD += eyeOuterPath(style.eyes.outer, qx + ec, qy + er, i);
    innerD += eyeInnerPath(style.eyes.inner, qx + ec, qy + er, i);
  });
  out.push(`<path fill-rule="evenodd" d="${outerD}" fill="${outerFill}"/>`);
  out.push(`<path d="${innerD}" fill="${innerFill}"/>`);

  // --- Logo ---
  if (logo.src) {
    const cx = qx + n / 2, cy = qy + n / 2;
    const shapePath = (half) =>
      logo.shape === 'circle' ? circle(cx, cy, half)
        : rr(cx - half, cy - half, 2 * half, 2 * half, logo.shape === 'rounded' ? half * 0.35 : 0);
    if (logo.plate) out.push(`<path d="${shapePath(cut)}" fill="${logo.plateColor}"/>`);
    let clip = '';
    if (logo.shape !== 'square') {
      defs.push(`<clipPath id="${uid}lc"><path d="${shapePath(logoSize / 2)}"/></clipPath>`);
      clip = ` clip-path="url(#${uid}lc)"`;
    }
    out.push(
      `<image xlink:href="${logo.src}" x="${f(cx - logoSize / 2)}" y="${f(cy - logoSize / 2)}" width="${f(logoSize)}" height="${f(logoSize)}" preserveAspectRatio="xMidYMid meet"${clip}/>`);
  }

  // --- Légende ---
  if (caption) {
    const bandTop = fr.style === 'top' ? 0 : by + Q;
    // Sans cadre, la zone de silence sert déjà d'espace : on remonte un peu le texte.
    const mid = fr.style === 'label' ? bandTop + band * 0.4 : bandTop + band / 2;
    const color = fr.style === 'label' ? fr.color : fr.textColor;
    out.push(
      `<text x="${f(W / 2)}" y="${f(mid + fs * 0.35)}" text-anchor="middle" font-family="${FONTS[fr.font] || FONTS.sans}" font-size="${f(fs)}"` +
      `${fr.bold ? ' font-weight="bold"' : ''} fill="${color}">${xml(caption)}</text>`);
  }

  const size = opts.width ? ` width="${f(opts.width)}" height="${f((opts.width * H) / W)}"` : '';
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${f(W)} ${f(H)}"${size}>` +
    (defs.length ? `<defs>${defs.join('')}</defs>` : '') +
    out.join('') +
    '</svg>';
  return { svg, width: W, height: H };
}

// --- Vignettes des sélecteurs de formes ---
const SAMPLE = [
  1, 1, 0, 1, 1, 1,
  1, 0, 0, 0, 1, 0,
  1, 1, 1, 0, 1, 1,
  0, 0, 1, 1, 0, 1,
  1, 0, 1, 1, 1, 0,
  1, 1, 0, 0, 1, 1,
];

export function dotSample(shape) {
  const d = dotsPath(Uint8Array.from(SAMPLE), 6, shape, 0.9, 0, 0);
  return `<svg viewBox="-0.5 -0.5 7 7" aria-hidden="true"><path d="${d}" fill="currentColor"/></svg>`;
}

export function eyeSample(part, shape) {
  const outer = eyeOuterPath(part === 'outer' ? shape : 'square', 0, 0, 0);
  const inner = eyeInnerPath(part === 'inner' ? shape : 'square', 0, 0, 0);
  const dim = ' opacity="0.25"';
  return (
    `<svg viewBox="-0.75 -0.75 8.5 8.5" aria-hidden="true">` +
    `<path fill-rule="evenodd" d="${outer}" fill="currentColor"${part === 'inner' ? dim : ''}/>` +
    `<path d="${inner}" fill="currentColor"${part === 'outer' ? dim : ''}/></svg>`
  );
}

// Luminance relative WCAG d'une couleur hexadécimale.
export function luminance(hex) {
  const v = hex.replace('#', '');
  const ch = [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

// Rapport de contraste WCAG entre deux couleurs hexadécimales.
export function contrastRatio(hexA, hexB) {
  const a = luminance(hexA), b = luminance(hexB);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
