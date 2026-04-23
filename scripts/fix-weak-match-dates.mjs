/**
 * FIX punto 6: allinea le date dei record DB che hanno WEAK_MATCH con Excel
 * (cioè match su fornitore+importo ma data diversa).
 *
 * Strategia: per ogni record DB (in fi/cg/cv/fc) con un match loose (same forn+importo)
 * ma no strict (date diverse), se esiste UNA sola Excel row con lo stesso (forn,importo,
 * data_unica), aggiorna la data del record DB alla data Excel.
 * Se ambiguo (più righe Excel senza match strict per quella forn/importo), skip e report.
 *
 * Usage:
 *   node scripts/fix-weak-match-dates.mjs          # dry-run
 *   node scripts/fix-weak-match-dates.mjs --apply  # apply
 */

import fs from 'fs';
import path from 'path';
import XLSX from 'xlsx';

const DATA = 'C:/Users/tecni/Desktop/Codice/GBidelloCommesse-main/data';
const EXCEL = 'C:/Users/tecni/Desktop/Codice/Dati';
const APPLY = process.argv.includes('--apply');

const load = (f) => JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf-8'));
const save = (f, d) => fs.writeFileSync(path.join(DATA, f), JSON.stringify(d, null, 2), 'utf-8');

function norm(s) {
  return String(s || '').toLowerCase()
    .replace(/s\.?\s*r\.?\s*l\.?(\s+unipersonale)?/gi, '')
    .replace(/s\.?\s*p\.?\s*a\.?/gi, '')
    .replace(/s\.?\s*n\.?\s*c\.?/gi, '')
    .replace(/s\.?\s*a\.?\s*s\.?/gi, '')
    .replace(/società|societa/gi, '')
    .replace(/[.,;:&()'"\/]/g, ' ').replace(/\s+/g, ' ').trim();
}
function dIso(n) { if (typeof n !== 'number') return n || null; const e = new Date(Date.UTC(1899,11,30)); return new Date(e.getTime()+n*86400000).toISOString().slice(0,10); }

// ─── Excel rows ────────────────────────────────────────────────────
const files = ['export 15-04-2026 08-46-51.xls', 'export 16-04-2026 09-42-32.xls', 'export 22-04-2026 16-10-28.xls'];
const excelRows = [];
for (const f of files) {
  const wb = XLSX.readFile(path.join(EXCEL, f));
  const raw = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: null });
  let h = -1;
  for (let i = 0; i < raw.length; i++) if (Array.isArray(raw[i]) && raw[i].includes('Fornitore') && raw[i].includes('Imponibile')) { h = i; break; }
  const H = raw[h];
  const c = { data: H.indexOf('Data'), forn: H.indexOf('Fornitore'), imp: H.indexOf('Imponibile'), num: H.indexOf('Nr. acquisto'), cc: H.indexOf('Centro costo') };
  for (let i = h + 1; i < raw.length; i++) {
    const r = raw[i];
    if (!Array.isArray(r) || !r[c.forn] || !r[c.imp]) continue;
    excelRows.push({
      data: dIso(r[c.data]),
      forn_n: norm(r[c.forn]),
      forn: String(r[c.forn]),
      imp: Number(r[c.imp]),
      nr: String(r[c.num] || ''),
      cc: r[c.cc] ? String(r[c.cc]) : null,
    });
  }
}

// Excel rows index: key = forn_n|imp → list of rows
const excelByKey = new Map();
for (const r of excelRows) {
  const k = `${r.forn_n}|${r.imp.toFixed(2)}`;
  if (!excelByKey.has(k)) excelByKey.set(k, []);
  excelByKey.get(k).push(r);
}

// ─── DB records ────────────────────────────────────────────────────
const fi = load('fatture-ingresso.json');
const cg = load('costi-generali.json');
const cv = load('costi-vivi.json');

// Unified DB list
const dbList = [
  ...fi.map(r => ({ file: 'fi', id: r.id, forn_n: norm(r.fornitore), forn: r.fornitore, imp: r.importo/100, data: r.dataEmissione, ref: r })),
  ...cg.map(r => ({ file: 'cg', id: r.id, forn_n: norm(r.fornitore), forn: r.fornitore, imp: Number(r.importo), data: r.data, ref: r })),
  ...cv.map(r => {
    const m = String(r.note || '').match(/Fornitore:\s*([^|]+)/i);
    const forn = m ? m[1].trim() : (r.descrizione || '');
    return { file: 'cv', id: r.id, forn_n: norm(forn), forn, imp: r.importo/100, data: r.data, ref: r };
  }),
];

// Per ogni DB record: cerca match Excel
const changes = { date: [], ambiguous: [], noMatch: [] };

// Track "used" Excel row indices per key (per evitare di allineare più DB records alla stessa Excel row)
const excelUsed = new Map(); // key → Set(rowIdx)

for (const db of dbList) {
  const k = `${db.forn_n}|${db.imp.toFixed(2)}`;
  const excelForKey = excelByKey.get(k) || [];
  if (excelForKey.length === 0) continue; // no match → lasciamo stare (probabilmente pre-export o extra)

  // Se esiste Excel con stessa data → già strict OK, skip
  const strictMatch = excelForKey.find(e => e.data === db.data);
  if (strictMatch) continue;

  // Check quante Excel rows per quella (forn, imp) senza match strict (cioè la cui data non è già usata da qualche DB record con stessa key)
  // Per semplicità conto: se esistono più Excel rows ambigue → ambiguous
  // Qui vogliamo 1-to-1: se |DB_group| == 1 e |Excel_group| == 1 → easy
  // Rileviamo il "group" DB: tutti i db record con key k
  const dbGroup = dbList.filter(x => x.forn_n === db.forn_n && Math.abs(x.imp - db.imp) < 0.01);
  if (dbGroup.length > excelForKey.length) {
    changes.noMatch.push({ ...db, reason: `DB ha ${dbGroup.length} record ma Excel solo ${excelForKey.length}` });
    continue;
  }

  // Excel rows not yet strictly matched (cioè non hanno un DB record con stessa data)
  const used = excelUsed.get(k) || new Set();
  const available = excelForKey.filter((e, idx) => !used.has(idx) && !dbGroup.some(d => d.data === e.data));
  if (available.length === 0) {
    changes.noMatch.push({ ...db, reason: 'nessuna Excel row disponibile' });
    continue;
  }
  if (available.length === 1) {
    // 1-to-1 match → aggiorna data
    const target = available[0];
    const targetIdx = excelForKey.indexOf(target);
    used.add(targetIdx);
    excelUsed.set(k, used);
    changes.date.push({ ...db, oldData: db.data, newData: target.data, excelNr: target.nr, excelCc: target.cc });
  } else {
    changes.ambiguous.push({ ...db, options: available.map(e => e.data) });
  }
}

// ─── Report ────────────────────────────────────────────────────────
console.log(`\n=== DATE DA ALLINEARE (1-to-1) [${changes.date.length}] ===`);
for (const c of changes.date) {
  console.log(`  ${c.file.padEnd(3)} | €${String(c.imp).padStart(8)} | ${c.forn.slice(0,30).padEnd(30)} | ${c.oldData} → ${c.newData} (nr excel: ${c.excelNr})`);
}

console.log(`\n=== AMBIGUI (più date Excel possibili, skip) [${changes.ambiguous.length}] ===`);
for (const c of changes.ambiguous.slice(0, 10)) {
  console.log(`  ${c.file} | €${c.imp} | ${c.forn.slice(0,30)} | DB data: ${c.data} | Excel: ${c.options.join(',')}`);
}

console.log(`\n=== NO MATCH [${changes.noMatch.length}] ===`);
for (const c of changes.noMatch.slice(0, 10)) {
  console.log(`  ${c.file} | €${c.imp} | ${c.forn.slice(0,30)} | DB data: ${c.data} | reason: ${c.reason}`);
}

console.log(`\n══════ SUMMARY ══════`);
console.log(`  ${changes.date.length} date da aggiornare`);
console.log(`  ${changes.ambiguous.length} ambigue (skip)`);
console.log(`  ${changes.noMatch.length} senza match Excel (skip)`);

if (!APPLY) { console.log('\n(dry-run. Per applicare: --apply)'); process.exit(0); }

// Backup
const BACKUP = path.join(DATA, '_backup-pre-fix-dates-' + new Date().toISOString().slice(0,10));
if (!fs.existsSync(BACKUP)) fs.mkdirSync(BACKUP);
for (const f of ['fatture-ingresso.json', 'costi-generali.json', 'costi-vivi.json']) {
  fs.copyFileSync(path.join(DATA, f), path.join(BACKUP, f));
}

for (const c of changes.date) {
  if (c.file === 'fi') c.ref.dataEmissione = c.newData;
  else if (c.file === 'cg') c.ref.data = c.newData;
  else if (c.file === 'cv') c.ref.data = c.newData;
  c.ref.note = (c.ref.note || '') + ` | DATE FIX ${c.oldData}→${c.newData} (da Excel) 2026-04-23`;
}
save('fatture-ingresso.json', fi);
save('costi-generali.json', cg);
save('costi-vivi.json', cv);
console.log(`\n✅ APPLIED: ${changes.date.length} date aggiornate`);
