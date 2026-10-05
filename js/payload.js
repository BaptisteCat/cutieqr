// Construit la chaîne encodée dans le QR code à partir du formulaire de contenu.

export const CONTENT_TYPES = [
  { id: 'url', label: 'Lien' },
  { id: 'text', label: 'Texte' },
  { id: 'vcard', label: 'Contact' },
  { id: 'event', label: 'Événement' },
  { id: 'geo', label: 'Lieu' },
  { id: 'sepa', label: 'Virement' },
];

export function defaultContent() {
  return {
    type: 'url',
    url: { value: '' },
    text: { value: '' },
    vcard: {
      first: '', last: '', org: '', title: '', mobile: '', phone: '', email: '', url: '',
      street: '', zip: '', city: '', country: '', note: '',
    },
    event: { title: '', allDay: false, start: '', end: '', location: '', description: '' },
    geo: { lat: '', lng: '', format: 'geo' },
    sepa: { name: '', iban: '', bic: '', amount: '', remittance: '' },
  };
}

// Contenu venu d'une sauvegarde ou d'un brouillon : on ne reprend que les champs
// connus, avec le bon type.
export function sanitizeContent(raw) {
  const out = defaultContent();
  if (!raw || typeof raw !== 'object') return out;
  if (CONTENT_TYPES.some((t) => t.id === raw.type)) out.type = raw.type;
  for (const { id } of CONTENT_TYPES) {
    const src = raw[id];
    if (!src || typeof src !== 'object') continue;
    for (const [k, def] of Object.entries(out[id])) {
      if (typeof src[k] !== typeof def) continue;
      out[id][k] = typeof def === 'string' ? src[k].slice(0, 4000) : src[k];
    }
  }
  if (!['geo', 'gmaps'].includes(out.geo.format)) out.geo.format = 'geo';
  return out;
}

const trim = (s) => String(s ?? '').trim();

// Échappement commun à vCard et iCalendar.
const esc = (s) =>
  trim(s).replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/([,;])/g, '\\$1');

function buildUrl({ value }) {
  const v = trim(value);
  if (!v) return { error: 'Saisissez une adresse web.' };
  if (/\s/.test(v)) return { error: 'Une adresse web ne contient pas d’espace.' };
  return { data: /^[a-z][a-z0-9+.-]*:/i.test(v) ? v : 'https://' + v };
}

function buildText({ value }) {
  const v = String(value ?? '');
  if (!v.trim()) return { error: 'Saisissez un texte.' };
  return { data: v };
}

function buildVcard(c) {
  const first = trim(c.first), last = trim(c.last), org = trim(c.org);
  if (!first && !last && !org) return { error: 'Indiquez au moins un nom ou une société.' };
  const lines = ['BEGIN:VCARD', 'VERSION:3.0'];
  lines.push(`N:${esc(last)};${esc(first)};;;`);
  lines.push(`FN:${esc([first, last].filter(Boolean).join(' ') || org)}`);
  if (org) lines.push(`ORG:${esc(org)}`);
  if (trim(c.title)) lines.push(`TITLE:${esc(c.title)}`);
  if (trim(c.mobile)) lines.push(`TEL;TYPE=CELL:${trim(c.mobile)}`);
  if (trim(c.phone)) lines.push(`TEL;TYPE=WORK,VOICE:${trim(c.phone)}`);
  if (trim(c.email)) lines.push(`EMAIL;TYPE=INTERNET:${trim(c.email)}`);
  if (trim(c.url)) lines.push(`URL:${trim(c.url)}`);
  if (trim(c.street) || trim(c.city) || trim(c.zip) || trim(c.country)) {
    lines.push(`ADR;TYPE=WORK:;;${esc(c.street)};${esc(c.city)};;${esc(c.zip)};${esc(c.country)}`);
  }
  if (trim(c.note)) lines.push(`NOTE:${esc(c.note)}`);
  lines.push('END:VCARD');
  return { data: lines.join('\n') };
}

// « 2026-10-01T14:30 » → « 20261001T143000 » ; « 2026-10-01 » → « 20261001 »
const icsStamp = (v) => {
  const s = v.replace(/[-:]/g, '');
  return s.includes('T') ? s.padEnd(15, '0') : s;
};

function nextDay(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + 1));
  return dt.toISOString().slice(0, 10);
}

function buildEvent(e) {
  const title = trim(e.title);
  if (!title) return { error: 'Donnez un titre à l’événement.' };
  if (!e.start) return { error: 'Indiquez la date de début.' };
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'BEGIN:VEVENT', `SUMMARY:${esc(title)}`];
  if (e.allDay) {
    const start = e.start.slice(0, 10);
    const end = (e.end || e.start).slice(0, 10);
    if (end < start) return { error: 'La fin précède le début.' };
    lines.push(`DTSTART;VALUE=DATE:${icsStamp(start)}`);
    // DTEND est exclusif pour les journées entières.
    lines.push(`DTEND;VALUE=DATE:${icsStamp(nextDay(end))}`);
  } else {
    if (e.end && e.end < e.start) return { error: 'La fin précède le début.' };
    lines.push(`DTSTART:${icsStamp(e.start)}`);
    if (e.end) lines.push(`DTEND:${icsStamp(e.end)}`);
  }
  if (trim(e.location)) lines.push(`LOCATION:${esc(e.location)}`);
  if (trim(e.description)) lines.push(`DESCRIPTION:${esc(e.description)}`);
  lines.push('END:VEVENT', 'END:VCALENDAR');
  return { data: lines.join('\n') };
}

const num = (v) => Number(trim(v).replace(',', '.'));

function buildGeo(g) {
  if (!trim(g.lat) || !trim(g.lng)) return { error: 'Indiquez la latitude et la longitude.' };
  const lat = num(g.lat), lng = num(g.lng);
  if (!Number.isFinite(lat) || Math.abs(lat) > 90) return { error: 'Latitude invalide (entre −90 et 90).' };
  if (!Number.isFinite(lng) || Math.abs(lng) > 180) return { error: 'Longitude invalide (entre −180 et 180).' };
  const pos = `${+lat.toFixed(6)},${+lng.toFixed(6)}`;
  return { data: g.format === 'gmaps' ? `https://www.google.com/maps?q=${pos}` : `geo:${pos}` };
}

export function isValidIban(raw) {
  const iban = String(raw ?? '').replace(/\s+/g, '').toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false;
  const moved = iban.slice(4) + iban.slice(0, 4);
  let rem = 0;
  for (const ch of moved) {
    const v = ch >= 'A' ? String(ch.charCodeAt(0) - 55) : ch;
    for (const d of v) rem = (rem * 10 + Number(d)) % 97;
  }
  return rem === 1;
}

// QR code de virement SEPA, format EPC069-12 version 002.
function buildSepa(s) {
  const name = trim(s.name);
  const iban = trim(s.iban).replace(/\s+/g, '').toUpperCase();
  const bic = trim(s.bic).replace(/\s+/g, '').toUpperCase();
  if (!name) return { error: 'Indiquez le nom du bénéficiaire.' };
  if (name.length > 70) return { error: 'Le nom du bénéficiaire dépasse 70 caractères.' };
  if (!iban) return { error: 'Indiquez l’IBAN du bénéficiaire.' };
  if (!isValidIban(iban)) return { error: 'IBAN invalide : vérifiez la saisie.' };
  if (bic && !/^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(bic)) return { error: 'BIC invalide (8 ou 11 caractères).' };
  let amount = '';
  if (trim(s.amount)) {
    const a = num(s.amount);
    if (!Number.isFinite(a) || a < 0.01 || a > 999999999.99) return { error: 'Montant invalide.' };
    amount = 'EUR' + a.toFixed(2);
  }
  const remittance = trim(s.remittance).replace(/\r?\n/g, ' ');
  if (remittance.length > 140) return { error: 'Le motif dépasse 140 caractères.' };
  const lines = ['BCD', '002', '1', 'SCT', bic, name, iban, amount, '', '', remittance];
  while (lines[lines.length - 1] === '') lines.pop();
  return { data: lines.join('\n') };
}

const BUILDERS = { url: buildUrl, text: buildText, vcard: buildVcard, event: buildEvent, geo: buildGeo, sepa: buildSepa };

// → { data } ou { error }
export function buildPayload(content) {
  const build = BUILDERS[content.type];
  return build ? build(content[content.type]) : { error: 'Type de contenu inconnu.' };
}

// Libellé court, pour l'historique et le nom de fichier.
export function describeContent(content) {
  const c = content[content.type] || {};
  switch (content.type) {
    case 'url': {
      const v = trim(c.value).replace(/^https?:\/\//i, '').replace(/\/$/, '');
      return v || 'Lien';
    }
    case 'text': return trim(c.value).replace(/\s+/g, ' ').slice(0, 60) || 'Texte';
    case 'vcard': return [trim(c.first), trim(c.last)].filter(Boolean).join(' ') || trim(c.org) || 'Contact';
    case 'event': return trim(c.title) || 'Événement';
    case 'geo': return trim(c.lat) && trim(c.lng) ? `${trim(c.lat)}, ${trim(c.lng)}` : 'Lieu';
    case 'sepa': return trim(c.name) ? `Virement — ${trim(c.name)}` : 'Virement';
    default: return 'QR code';
  }
}

export function typeLabel(type) {
  return (CONTENT_TYPES.find((t) => t.id === type) || {}).label || type;
}
