// Modèles prêts à l'emploi : des surcharges partielles du style par défaut.
// Chaque couple couleur des modules / fond garde un contraste confortable pour la lecture.

export const PRESETS = [
  { id: 'p-classique', name: 'Classique', style: {} },
  {
    id: 'p-sapin', name: 'Sapin',
    style: {
      dots: { shape: 'fluid', fill: { type: 'linear', c1: '#113e2f', c2: '#286e55', angle: 135 } },
      eyes: { outer: 'rounded', inner: 'rounded' },
      bg: { type: 'solid', c1: '#fffefb' },
    },
  },
  {
    id: 'p-encre', name: 'Encre',
    style: {
      dots: { shape: 'fluid', fill: { type: 'solid', c1: '#1b1f3b' } },
      eyes: { outer: 'rounded', inner: 'rounded' },
    },
  },
  {
    id: 'p-points', name: 'Points',
    style: {
      dots: { shape: 'dots', scale: 0.85, fill: { type: 'solid', c1: '#111111' } },
      eyes: { outer: 'circle', inner: 'circle' },
    },
  },
  {
    id: 'p-ocean', name: 'Océan',
    style: {
      dots: { shape: 'fluid', fill: { type: 'linear', c1: '#0b3d91', c2: '#087a7a', angle: 45 } },
      eyes: { outer: 'circle', inner: 'circle' },
      bg: { type: 'solid', c1: '#f4fbff' },
    },
  },
  {
    id: 'p-braise', name: 'Braise',
    style: {
      dots: { shape: 'rounded', scale: 0.9, fill: { type: 'radial', c1: '#c2410c', c2: '#7a1420' } },
      eyes: { outer: 'drop', inner: 'drop', custom: true, outerColor: '#7a1420', innerColor: '#c2410c' },
      bg: { type: 'solid', c1: '#fffaf5' },
    },
  },
  {
    id: 'p-foret', name: 'Forêt',
    style: {
      dots: { shape: 'leaf', scale: 1, fill: { type: 'solid', c1: '#14532d' } },
      eyes: { outer: 'leaf', inner: 'leaf' },
      bg: { type: 'solid', c1: '#f3faf3' },
    },
  },
  {
    id: 'p-nuit', name: 'Nuit',
    style: {
      dots: { shape: 'fluid', fill: { type: 'solid', c1: '#f8fafc' } },
      eyes: { outer: 'rounded', inner: 'rounded', custom: true, outerColor: '#f8fafc', innerColor: '#fbbf24' },
      bg: { type: 'solid', c1: '#0f172a' },
      frame: { radius: 3 },
    },
  },
  {
    id: 'p-etiquette', name: 'Étiquette',
    style: {
      dots: { shape: 'square', fill: { type: 'solid', c1: '#111111' } },
      frame: { style: 'bottom', text: 'Scannez-moi', bold: true, upper: true, size: 3, color: '#111111', textColor: '#ffffff', radius: 3, thickness: 1.5 },
    },
  },
  {
    id: 'p-violine', name: 'Violine',
    style: {
      dots: { shape: 'vbars', scale: 0.8, fill: { type: 'linear', c1: '#5b21b6', c2: '#be185d', angle: 90 } },
      eyes: { outer: 'rounded', inner: 'rounded' },
      frame: { style: 'label', text: 'Scannez-moi', bold: true, size: 2.75, color: '#5b21b6', radius: 2 },
    },
  },
  {
    id: 'p-carte', name: 'Carte',
    style: {
      dots: { shape: 'rounded', scale: 0.9, fill: { type: 'solid', c1: '#1f2937' } },
      eyes: { outer: 'rounded', inner: 'square', custom: true, outerColor: '#1f2937', innerColor: '#e4572e' },
      frame: { style: 'border', color: '#1f2937', radius: 4, thickness: 0.75 },
    },
  },
];
