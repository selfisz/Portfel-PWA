/**
 * Regression tests for Zobowiązani multi-key sync (mirrors helpers in html).
 * Run: node test-sync-helpers.mjs
 */
import assert from 'assert';

const REG_SYSTEMS = ['KAWA', 'SINF', 'UFG', 'JPK', 'INFZ'];
const MAX = 26;
const norm = v => String(v == null ? '' : v).replace(/\u00a0/g, ' ').trim();

function canonPersonKey(v) {
  let s = norm(v).replace(/[\s-]/g, '');
  if (!s) return '';
  if (/^\d+\.0+$/.test(s)) s = s.replace(/\.0+$/, '');
  if (!/^\d{10,11}$/.test(s)) {
    const digits = String(s).replace(/\D/g, '');
    if (digits.length === 10 || digits.length === 11) s = digits;
  }
  return s;
}
const normPesel = v => canonPersonKey(v);
const normNip = v => canonPersonKey(v);
function keyKind(v) {
  const s = canonPersonKey(v);
  if (/^\d{11}$/.test(s)) return 'pesel';
  if (/^\d{10}$/.test(s)) return 'nip';
  return '';
}
function looksLikePesel(v) {
  return /^\d{11}$/.test(norm(v).replace(/[\s-]/g, ''));
}
function looksLikeNip(v) {
  return /^\d{10}$/.test(norm(v).replace(/[\s-]/g, ''));
}
function registryColMap(reg) {
  const m = {};
  reg.columns.forEach((n, i) => { m[n] = i; });
  return m;
}
function registryIndexByPesel(reg) {
  const map = registryColMap(reg);
  const pci = map.PESEL;
  const idx = new Map();
  if (pci == null) return idx;
  reg.rows.forEach((r, i) => { const k = normPesel(r[pci]); if (k) idx.set(k, i); });
  return idx;
}
function registryIndexByNip(reg) {
  const map = registryColMap(reg);
  const nci = map.NIP;
  const idx = new Map();
  if (nci == null) return idx;
  reg.rows.forEach((r, i) => { const k = normNip(r[nci]); if (k) idx.set(k, i); });
  return idx;
}
function findRegistryRowByKey(reg, key) {
  if (!reg || !key) return null;
  const raw = canonPersonKey(key);
  if (!raw) return null;
  const kind = keyKind(raw);
  if (kind === 'pesel' || (!kind && raw.length === 11)) {
    const by = registryIndexByPesel(reg);
    if (by.has(normPesel(raw))) return by.get(normPesel(raw));
  }
  if (kind === 'nip' || (!kind && raw.length === 10)) {
    const by = registryIndexByNip(reg);
    if (by.has(normNip(raw))) return by.get(normNip(raw));
  }
  const byP = registryIndexByPesel(reg);
  const kp = normPesel(raw);
  if (kp && byP.has(kp)) return byP.get(kp);
  const byN = registryIndexByNip(reg);
  const kn = normNip(raw);
  if (kn && byN.has(kn)) return byN.get(kn);
  return null;
}
function findSystemCol(sh, name) {
  let ci = sh.columns.indexOf(name);
  if (ci >= 0) return ci;
  const up = String(name).toUpperCase();
  return sh.columns.findIndex(c => norm(c).toUpperCase() === up);
}
function listRowKeys(sh, ri, keyCol) {
  const keys = [];
  const seen = new Set();
  const add = v => {
    const k = canonPersonKey(v);
    if (!k || seen.has(k)) return;
    seen.add(k);
    keys.push(k);
  };
  if (keyCol != null && keyCol >= 0) add(sh.rows[ri][keyCol]);
  sh.columns.forEach((name, ci) => {
    if (/pesel/i.test(String(name)) || /\bnip\b|^nip$/i.test(norm(name))) add(sh.rows[ri][ci]);
  });
  if (!keys.length) {
    sh.columns.forEach((_, ci) => {
      const v = sh.rows[ri][ci];
      if (looksLikePesel(v) || looksLikeNip(v)) add(v);
    });
  }
  return keys;
}
function findRegistryRowForListRow(reg, sh, ri, keyCol) {
  const keys = listRowKeys(sh, ri, keyCol);
  for (let i = 0; i < keys.length; i++) {
    const dest = findRegistryRowByKey(reg, keys[i]);
    if (dest != null) return { dest, key: keys[i], keys };
  }
  return { dest: null, key: keys[0] || '', keys };
}
function padSheetRow(sh, ri) {
  while (sh.rows[ri].length < sh.columns.length) sh.rows[ri].push('');
}
function ensureCol(sh, name) {
  let ci = sh.columns.indexOf(name);
  if (ci >= 0) return ci;
  if (sh.columns.length >= MAX) return -1;
  ci = sh.columns.length;
  sh.columns.push(name);
  sh.rows.forEach(r => { while (r.length < sh.columns.length) r.push(''); });
  return ci;
}
function writeSystemsToRegistryRow(reg, dest, values, rmap) {
  padSheetRow(reg, dest);
  const map = rmap || registryColMap(reg);
  let changed = false;
  Object.keys(values || {}).forEach(name => {
    const regCi = map[name];
    if (regCi == null) return;
    const next = values[name];
    if (next == null || next === '') return;
    if (norm(reg.rows[dest][regCi]) !== norm(next)) {
      reg.rows[dest][regCi] = next;
      changed = true;
    }
  });
  return changed;
}
function syncIdentityOntoRegistry(reg, dest, sh, ri) {
  ensureCol(reg, 'NIP');
  ensureCol(reg, 'PESEL');
  padSheetRow(reg, dest);
  const rmap = registryColMap(reg);
  listRowKeys(sh, ri, -1).forEach(k => {
    const kind = keyKind(k);
    if (kind === 'nip' && rmap.NIP != null && !norm(reg.rows[dest][rmap.NIP])) reg.rows[dest][rmap.NIP] = normNip(k);
    if (kind === 'pesel' && rmap.PESEL != null && !norm(reg.rows[dest][rmap.PESEL])) reg.rows[dest][rmap.PESEL] = normPesel(k);
  });
}

// --- cases that reproduced the user bug ---

assert.strictEqual(canonPersonKey('910101-12345'), '91010112345');
assert.strictEqual(canonPersonKey('1234567890.0'), '1234567890');

const reg = {
  columns: ['NIP', 'PESEL', 'KAWA', 'SINF', 'UFG', 'JPK', 'INFZ', 'Stan', 'Komplet'],
  rows: [
    ['', '91010112345', '', '', '', '', '', '', ''],
    ['5252445767', '80010112345', '', '', '', '', '', '', '']
  ]
};

const list = {
  columns: ['NIP', 'PESEL', 'KAWA', 'INFZ', 'Stan'],
  rows: [['5252445767', '', '2026-07-23', '2026-07-23', 'Częściowo']]
};

const keyCol = 1; // PESEL preferred, empty on this row — OLD sync skipped or treated as spoza bazy
const keys = listRowKeys(list, 0, keyCol);
assert.ok(keys.includes('5252445767'), 'NIP collected when PESEL empty');

const hit = findRegistryRowForListRow(reg, list, 0, keyCol);
assert.strictEqual(hit.dest, 1, 'match existing Zobowiązani row by NIP');

const rmap = registryColMap(reg);
assert.ok(writeSystemsToRegistryRow(reg, hit.dest, { KAWA: '2026-07-23', INFZ: '2026-07-23' }, rmap));
assert.strictEqual(reg.rows[1][rmap.KAWA], '2026-07-23');
assert.strictEqual(reg.rows[1][rmap.INFZ], '2026-07-23');

// OLD single-key behavior would fail:
const oldKey = norm(list.rows[0][keyCol]).replace(/[\s-]/g, '');
assert.strictEqual(oldKey, '', 'old path had empty key');
assert.strictEqual(findRegistryRowByKey(reg, oldKey), null);

assert.strictEqual(findSystemCol({ columns: ['kawa', 'INFZ'] }, 'KAWA'), 0);
assert.ok(REG_SYSTEMS.includes('KAWA'));

console.log('OK — multi-key sync writes KAWA/INFZ onto existing Zobowiązani row');
