/**
 * Dedup analysis: trova le fatture negli export FIC che NON sono in archivio.
 * Dedup loose: (fornitore_norm + importo_eur).toFixed(2)
 *
 * Output: lista + classificazione per CC per pianificare assegnazione.
 */

import fs from 'fs';
import path from 'path';
import XLSX from 'xlsx';

const DATA = 'C:/Users/tecni/Desktop/Codice/GBidelloCommesse-main/data';
const EXCEL = 'C:/Users/tecni/Desktop/Codice/Dati';

function load(f) { return JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf-8')); }
function norm(s) {
  return String(s||'').toLowerCase()
    .replace(/s\.?\s*r\.?\s*l\.?(\s+unipersonale)?/gi, '')
    .replace(/s\.?\s*p\.?\s*a\.?/gi, '')
    .replace(/[.,;:&()]/g, ' ')
    .replace(/\s+/g, ' ').trim();
}
function d(n) { if (typeof n !== 'number') return n; const e = new Date(Date.UTC(1899,11,30)); return new Date(e.getTime() + n*86400000).toISOString().slice(0,10); }

const fi = load('fatture-ingresso.json');
const fc = load('fatture-consulenti.json');
const fe = load('fatture-emesse.json');
const cg = load('costi-generali.json');

// Build dedup keys (fornitore_norm + importo in euro, 2 decimali)
const keys = new Set();
for (const x of fi) keys.add(norm(x.fornitore) + '|' + (x.importo/100).toFixed(2));
for (const x of fc) keys.add(norm(x.consulente) + '|' + Number(x.importo).toFixed(2));
for (const x of fe) keys.add(norm(x.cliente) + '|' + Number(x.importo).toFixed(2));
for (const x of cg) keys.add(norm(x.fornitore) + '|' + Number(x.importo).toFixed(2));

// Scan all exports
const exports_ingresso = ['export 15-04-2026 08-46-51.xls','export 16-04-2026 09-42-32.xls','export 22-04-2026 16-10-28.xls'];
const exports_emesse = ['export 23-04-2026 08-53-25.xls'];

const missing = [];
for (const f of exports_ingresso) {
  const full = path.join(EXCEL, f);
  if (!fs.existsSync(full)) continue;
  const wb = XLSX.readFile(full);
  const sh = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json(sh, { header: 1, defval: null });
  let h = -1;
  for (let i = 0; i < raw.length; i++) {
    if (Array.isArray(raw[i]) && raw[i].includes('Fornitore') && raw[i].includes('Imponibile')) { h = i; break; }
  }
  if (h < 0) continue;
  const cols = { data: raw[h].indexOf('Data'), num: raw[h].indexOf('Nr. acquisto'), dataFE: raw[h].indexOf('Data ricezione FE'), cc: raw[h].indexOf('Centro costo'), forn: raw[h].indexOf('Fornitore'), piva: raw[h].indexOf('Partita IVA'), desc: raw[h].indexOf('Descrizione'), imp: raw[h].indexOf('Imponibile'), iva: raw[h].indexOf('IVA'), ritAcc: raw[h].indexOf('Rit. acconto') };
  for (let i = h+1; i < raw.length; i++) {
    const r = raw[i];
    if (!Array.isArray(r) || !r[cols.forn]) continue;
    const imp = r[cols.imp];
    if (!imp || imp === 0) continue;
    const key = norm(String(r[cols.forn])) + '|' + Number(imp).toFixed(2);
    if (!keys.has(key)) {
      missing.push({
        kind: 'ingresso',
        file: f.slice(7,12),
        row: i,
        data: d(r[cols.data]),
        nr: String(r[cols.num]||''),
        dataFE: d(r[cols.dataFE]),
        cc: r[cols.cc] ? String(r[cols.cc]) : null,
        fornitore: String(r[cols.forn]),
        piva: r[cols.piva] ? String(r[cols.piva]) : null,
        descrizione: r[cols.desc] ? String(r[cols.desc]).slice(0,200) : null,
        imponibile: imp,
        iva: r[cols.iva] || 0,
        ritAcconto: r[cols.ritAcc] || 0,
      });
    }
  }
}

for (const f of exports_emesse) {
  const full = path.join(EXCEL, f);
  if (!fs.existsSync(full)) continue;
  const wb = XLSX.readFile(full);
  const sh = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json(sh, { header: 1, defval: null });
  let h = -1;
  for (let i = 0; i < raw.length; i++) {
    if (Array.isArray(raw[i]) && raw[i].includes('Cliente') && raw[i].includes('Saldato')) { h = i; break; }
  }
  if (h < 0) continue;
  const cols = { data: raw[h].indexOf('Data'), prox: raw[h].indexOf('Prox scadenza'), num: raw[h].indexOf('Numero'), saldato: raw[h].indexOf('Saldato'), cr: raw[h].indexOf('Centro ricavo'), cli: raw[h].indexOf('Cliente'), piva: raw[h].indexOf('P.IVA'), ogInt: raw[h].indexOf('Oggetto (interno)'), ogVis: raw[h].indexOf('Oggetto (visibile)'), imp: raw[h].indexOf('Imponibile') };
  for (let i = h+1; i < raw.length; i++) {
    const r = raw[i];
    if (!Array.isArray(r) || !r[cols.cli]) continue;
    const imp = r[cols.imp];
    if (!imp || imp === 0) continue;
    const key = norm(String(r[cols.cli])) + '|' + Number(imp).toFixed(2);
    if (!keys.has(key)) {
      missing.push({
        kind: 'emessa',
        file: f.slice(7,12),
        row: i,
        data: d(r[cols.data]),
        prox: d(r[cols.prox]),
        nr: String(r[cols.num]||''),
        saldato: r[cols.saldato] === 'SI',
        cr: r[cols.cr] ? String(r[cols.cr]) : null,
        cliente: String(r[cols.cli]),
        piva: r[cols.piva] ? String(r[cols.piva]) : null,
        oggetto: (r[cols.ogVis] || r[cols.ogInt]) ? String(r[cols.ogVis] || r[cols.ogInt]).slice(0,200) : null,
        imponibile: imp,
      });
    }
  }
}

console.log(`Mancanti totali: ${missing.length}`);
console.log(`  ingresso: ${missing.filter(x => x.kind === 'ingresso').length}`);
console.log(`  emesse: ${missing.filter(x => x.kind === 'emessa').length}`);
console.log('');

// Distribuzione per CC (ingresso)
const byCC = {};
for (const m of missing.filter(x => x.kind === 'ingresso')) {
  const cc = m.cc || '(vuoto)';
  byCC[cc] = (byCC[cc] || 0) + 1;
}
console.log('=== Ingresso per CC ===');
Object.entries(byCC).sort((a,b) => b[1] - a[1]).forEach(([k,v]) => console.log(' ', String(v).padStart(4), k));

// CR emesse
const byCR = {};
for (const m of missing.filter(x => x.kind === 'emessa')) {
  const cr = m.cr || '(vuoto)';
  byCR[cr] = (byCR[cr] || 0) + 1;
}
console.log('');
console.log('=== Emesse per CR ===');
Object.entries(byCR).sort((a,b) => b[1] - a[1]).forEach(([k,v]) => console.log(' ', String(v).padStart(4), k));

fs.writeFileSync(path.join(DATA, '_missing-fatture-report.json'), JSON.stringify(missing, null, 2), 'utf-8');
console.log('');
console.log('Report: data/_missing-fatture-report.json');
