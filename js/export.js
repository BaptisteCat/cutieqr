// Exports : tout part de la chaîne SVG produite par render.js.

const VENDOR = {
  jspdf: 'vendor/jspdf.umd.min.js',
  svg2pdf: 'vendor/svg2pdf.umd.min.js',
  jsqr: 'vendor/jsQR.js',
};

// Les bibliothèques lourdes ne sont chargées qu'au premier besoin.
const loading = {};
function loadScript(src) {
  loading[src] ||= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => {
      delete loading[src];
      s.remove();
      reject(new Error(`Chargement impossible : ${src}`));
    };
    document.head.append(s);
  });
  return loading[src];
}

export const MIME = {
  png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp', svg: 'image/svg+xml', pdf: 'application/pdf',
};
export const EXT = { png: 'png', jpeg: 'jpg', webp: 'webp', svg: 'svg', pdf: 'pdf' };

// Formats de page en mm (portrait).
const PAGES = { a4: [210, 297], a5: [148, 210], a6: [105, 148], letter: [215.9, 279.4] };

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Image illisible.'));
    img.src = url;
  });
}

// `svg` doit porter width/height explicites (Firefox l'exige pour drawImage).
export async function svgToCanvas(svg, w, h, { backdrop = null, pad = 0 } = {}) {
  const url = URL.createObjectURL(new Blob([svg], { type: MIME.svg }));
  try {
    const img = await loadImage(url);
    const canvas = document.createElement('canvas');
    canvas.width = w + 2 * pad;
    canvas.height = h + 2 * pad;
    const ctx = canvas.getContext('2d');
    if (backdrop) {
      ctx.fillStyle = backdrop;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(img, pad, pad, w, h);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

const canvasToBlob = (canvas, type, quality) =>
  new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Export impossible à cette taille.'))), type, quality));

// render(widthPx) → { svg, width, height } ; settings = { format, px, quality, mm, page }
export async function exportBlob(render, settings) {
  const { format } = settings;
  if (format === 'svg') {
    return new Blob([render(settings.px).svg], { type: MIME.svg });
  }
  if (format === 'pdf') return pdfBlob(render, settings);

  const r = render(settings.px);
  const w = Math.round(settings.px);
  const h = Math.round((settings.px * r.height) / r.width);
  // Le JPEG n'a pas de transparence (fond transparent, coins arrondis) : fond blanc.
  const canvas = await svgToCanvas(r.svg, w, h, { backdrop: format === 'jpeg' ? '#ffffff' : null });
  const blob = await canvasToBlob(canvas, MIME[format], settings.quality / 100);
  if (blob.type !== MIME[format]) throw new Error(`Ce navigateur ne sait pas exporter en ${format.toUpperCase()}.`);
  return blob;
}

async function pdfBlob(render, { mm, page }) {
  await loadScript(VENDOR.jspdf);
  await loadScript(VENDOR.svg2pdf);
  const { jsPDF } = window.jspdf;
  const r = render(1000);
  let w = Math.max(5, Number(mm) || 50);
  let h = (w * r.height) / r.width;
  let pw = w, ph = h;
  if (PAGES[page]) {
    [pw, ph] = PAGES[page];
    // Trop grand pour la page : on réduit en gardant 10 mm de marge.
    const k = Math.min(1, (pw - 20) / w, (ph - 20) / h);
    w *= k;
    h *= k;
  }
  const doc = new jsPDF({ unit: 'mm', format: [pw, ph], orientation: pw > ph ? 'landscape' : 'portrait', compress: true });
  const holder = document.createElement('div');
  holder.style.cssText = 'position:fixed;left:-10000px;top:0;width:10px;height:10px;overflow:hidden';
  holder.innerHTML = r.svg;
  document.body.append(holder);
  try {
    await doc.svg(holder.firstElementChild, { x: (pw - w) / 2, y: (ph - h) / 2, width: w, height: h });
  } finally {
    holder.remove();
  }
  return doc.output('blob');
}

export function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

export const canCopyImage = () => Boolean(navigator.clipboard && navigator.clipboard.write && window.ClipboardItem);

// Safari exige que le ClipboardItem soit créé pendant le clic : on lui passe la
// promesse du PNG plutôt que d'attendre sa fabrication.
export async function copyImage(pngPromise) {
  if (!canCopyImage()) throw new Error('La copie d’image n’est pas disponible dans ce navigateur.');
  await navigator.clipboard.write([new ClipboardItem({ [MIME.png]: pngPromise })]);
}

export function canShareFiles() {
  try {
    const probe = new File([new Blob(['x'], { type: MIME.png })], 'qr.png', { type: MIME.png });
    return Boolean(navigator.canShare && navigator.canShare({ files: [probe] }));
  } catch {
    return false;
  }
}

// Relit le QR code tel qu'il est dessiné, comme le ferait un lecteur.
// → true si le contenu décodé est exactement celui attendu.
export async function scanCheck(render, expected, backdrop) {
  await loadScript(VENDOR.jsqr);
  // Environ 8 px par module : assez fin pour le décodeur, même pour les grandes versions.
  const probe = render(100);
  const modules = (probe.width * Math.max(1, probe.height / probe.width));
  const width = Math.round(Math.min(1600, Math.max(420, modules * 8)));
  const r = render(width);
  const height = Math.round((width * r.height) / r.width);
  const canvas = await svgToCanvas(r.svg, width, height, { backdrop, pad: 24 });
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const result = window.jsQR(data, canvas.width, canvas.height, { inversionAttempts: 'attemptBoth' });
  return Boolean(result) && result.data === expected;
}
