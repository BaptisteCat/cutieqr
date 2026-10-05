// Tests de la fusion de synchronisation : node tools/test-sync.mjs
import assert from 'node:assert/strict';
import { merge, fingerprint } from '../js/sync.js';

const now = 1_800_000_000_000;
const ids = (list) => list.map((i) => i.id).sort();
let n = 0;
const test = (name, fn) => { fn(); n++; console.log('✓', name); };

test('la version la plus récente l’emporte, des deux côtés', () => {
  const m = merge(
    { templates: [{ id: 'a', updatedAt: 5, name: 'local' }], history: [{ id: 'h', updatedAt: 9, label: 'local' }] },
    { templates: [{ id: 'a', updatedAt: 7, name: 'distant' }], history: [{ id: 'h', updatedAt: 3, label: 'distant' }] },
    now,
  );
  assert.equal(m.templates[0].name, 'distant');
  assert.equal(m.history[0].label, 'local');
});

test('les éléments propres à chaque appareil sont réunis', () => {
  const m = merge({ history: [{ id: 'x', updatedAt: 1 }] }, { history: [{ id: 'y', updatedAt: 1 }] }, now);
  assert.deepEqual(ids(m.history), ['x', 'y']);
});

test('une suppression plus récente que l’élément se propage', () => {
  const m = merge(
    { history: [], tombstones: { 'history:h': now - 1000 } },
    { history: [{ id: 'h', updatedAt: now - 5000 }] },
    now,
  );
  assert.deepEqual(m.history, []);
  assert.ok(m.tombstones['history:h']);
});

test('une modification postérieure à la suppression ressuscite l’élément', () => {
  const m = merge(
    { history: [{ id: 'h', updatedAt: now - 10 }] },
    { history: [], tombstones: { 'history:h': now - 1000 } },
    now,
  );
  assert.deepEqual(ids(m.history), ['h']);
  assert.equal(m.tombstones['history:h'], undefined);
});

test('les pierres tombales de plus de six mois sont oubliées', () => {
  const m = merge({ tombstones: { 'templates:old': now - 200 * 86400e3 } }, {}, now);
  assert.deepEqual(m.tombstones, {});
});

test('à égalité d’horodatage, la version locale est gardée', () => {
  const m = merge({ templates: [{ id: 'a', updatedAt: 4, name: 'L' }] }, { templates: [{ id: 'a', updatedAt: 4, name: 'D' }] }, now);
  assert.equal(m.templates[0].name, 'L');
});

test('l’empreinte détecte un changement et ignore l’ordre', () => {
  const a = { templates: [{ id: 'a', updatedAt: 1 }, { id: 'b', updatedAt: 2 }], history: [], tombstones: {} };
  const b = { templates: [{ id: 'b', updatedAt: 2 }, { id: 'a', updatedAt: 1 }], history: [], tombstones: {} };
  assert.equal(fingerprint(a), fingerprint(b));
  b.templates[0].updatedAt = 3;
  assert.notEqual(fingerprint(a), fingerprint(b));
});

test('fusionner deux fois donne le même résultat (convergence)', () => {
  const L = { templates: [{ id: 'a', updatedAt: 5 }], history: [{ id: 'h1', updatedAt: 10 }], tombstones: { 'history:h2': now - 50 } };
  const R = { templates: [{ id: 'b', updatedAt: 6 }], history: [{ id: 'h2', updatedAt: now - 100 }, { id: 'h1', updatedAt: 8 }], tombstones: {} };
  const m1 = merge(L, R, now);
  const m2 = merge(m1, R, now);
  const m3 = merge(R, m1, now);
  assert.equal(fingerprint(m1), fingerprint(m2));
  assert.equal(fingerprint(m1), fingerprint(m3));
});

console.log(`\n${n} tests réussis`);
