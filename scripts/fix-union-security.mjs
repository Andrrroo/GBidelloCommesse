/**
 * FIX Union Security:
 *   - Rimuove i 22 record UNION SECURITY SPA €73.20 in costi-generali (non
 *     presenti in nessun Excel FIC, confermato dall'utente).
 *   - Importa le 24 righe UNION SECURITY €60 dall'export 16-04-2026 che sono
 *     missing nel DB (strict data match). Destinazione: costi-generali
 *     categoria "altro" (studio security fee).
 *
 * Usage:
 *   node scripts/fix-union-security.mjs          # dry-run
 *   node scripts/fix-union-security.mjs --apply  # apply
 */

import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import XLSX from 'xlsx';

const DATA = 'C:/Users/tecni/Desktop/Codice/GBidelloCommesse-main/data';
const EXCEL = 'C:/Users/tecni/Desktop/Codice/Dati';
const APPLY = process.argv.includes('--apply');

const load = (f) => JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf-8'));
const save = (f, d) => fs.writeFileSync(path.join(DATA, f), JSON.stringify(d, null, 2), 'utf-8');

function norm(s) {
  return String(s || '').toLowerCase()
    .replace(/s\.?\s*r\.?\s*l\.?/gi, '')
    .replace(/s\.?\s*p\.?\s*a\.?/gi, '')
    .replace(/[.,;&()'"\/]/g, ' ').replace(/\s+/g, ' ').trim();
}
function dIso(n) { if (typeof n !== 'number') return n || null; const e = new Date(Date.UTC(1899,11,30)); return new Date(e.getTime()+n*86400000).toISOString().slice(0,10); }

// ─── 1. Rimuovi UNION SECURITY €73.20 orfani ───────────────────────
const cg = load('costi-generali.json');
const toRemove = cg.filter(r => /union security/i.test(r.fornitore || '') && Math.abs(Number(r.importo) - 73.20) < 0.01);
console.log(`Trovati ${toRemove.length} record UNION SECURITY €73.20 da rimuovere:`);
for (const r of toRemove) console.log('  ', r.data, '| €' + r.importo, '|', r.fornitore);

// ─── 2. Trova righe UNION SECURITY €60 nell'Excel non presenti in DB ─
const wb = XLSX.readFile(path.join(EXCEL, 'export 16-04-2026 09-42-32.xls'));
const raw = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: null });
let h = -1;
for (let i = 0; i < raw.length; i++) {
  if (Array.isArray(raw[i]) && raw[i].includes('Fornitore') && raw[i].includes('Imponibile')) { h = i; break; }
}
const H = raw[h];
const c = { data: H.indexOf('Data'), num: H.indexOf('Nr. acquisto'), cc: H.indexOf('Centro costo'), forn: H.indexOf('Fornitore'), piva: H.indexOf('Partita IVA'), desc: H.indexOf('Descrizione'), imp: H.indexOf('Imponibile'), iva: H.indexOf('IVA'), dataFE: H.indexOf('Data ricezione FE') };

// Keys esistenti per Union €60 (strict)
const dbKeys = new Set();
for (const r of cg) {
  if (!/union security/i.test(r.fornitore || '')) continue;
  if (Math.abs(Number(r.importo) - 60) > 0.01) continue;
  dbKeys.add(`${r.data}|60.00`);
}

const toAdd = [];
for (let i = h + 1; i < raw.length; i++) {
  const r = raw[i];
  if (!Array.isArray(r) || !r[c.forn]) continue;
  if (!/union security/i.test(String(r[c.forn]))) continue;
  if (Math.abs(Number(r[c.imp]) - 60) > 0.01) continue;
  const data = dIso(r[c.data]);
  const key = `${data}|60.00`;
  if (dbKeys.has(key)) continue;
  toAdd.push({
    data,
    nr: String(r[c.num] || ''),
    imp: 60,
    iva: Number(r[c.iva]) || 0,
    piva: r[c.piva] ? String(r[c.piva]) : null,
    cc: r[c.cc] ? String(r[c.cc]) : null,
    desc: r[c.desc] ? String(r[c.desc]) : null,
    dataFE: dIso(r[c.dataFE]),
  });
}
console.log(`\nTrovate ${toAdd.length} righe UNION SECURITY €60 da aggiungere in costi-generali:`);
for (const r of toAdd) console.log('  ', r.data, '| nr', r.nr.padStart(6), '| CC:', r.cc || '-');

console.log('\n══════ SUMMARY ══════');
console.log(`  -${toRemove.length} costi-generali UNION SECURITY €73.20 (rimuovi)`);
console.log(`  +${toAdd.length} costi-generali UNION SECURITY €60 (aggiungi)`);
console.log(`  costi-generali: ${cg.length} → ${cg.length - toRemove.length + toAdd.length}`);

if (!APPLY) { console.log('\n(dry-run. Per applicare: --apply)'); process.exit(0); }

// Backup
const BACKUP = path.join(DATA, '_backup-pre-union-security-' + new Date().toISOString().slice(0,10));
if (!fs.existsSync(BACKUP)) fs.mkdirSync(BACKUP);
fs.copyFileSync(path.join(DATA, 'costi-generali.json'), path.join(BACKUP, 'costi-generali.json'));
console.log(`\n→ Backup in ${BACKUP}`);

// Apply
const removeIds = new Set(toRemove.map(r => r.id));
let newCg = cg.filter(r => !removeIds.has(r.id));
for (const a of toAdd) {
  newCg.push({
    id: randomUUID(),
    categoria: 'altro',
    fornitore: 'UNION SECURITY SPA',
    descrizione: a.desc || 'Servizio sicurezza studio',
    data: a.data,
    importo: a.imp,
    pagato: !!a.dataFE,
    ...(a.dataFE ? { dataPagamento: a.dataFE } : {}),
    note: `Import manuale da export 16-04-2026 | CC: ${a.cc || 'SICUREZZA STUDIO'} | nr acquisto ${a.nr}`,
  });
}
save('costi-generali.json', newCg);
console.log(`\n✅ APPLIED: costi-generali.json: ${cg.length} → ${newCg.length}`);
