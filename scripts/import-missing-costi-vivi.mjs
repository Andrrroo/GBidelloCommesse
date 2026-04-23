/**
 * IMPORT MISSING fatture come costi-vivi (pattern mese-dominante).
 *
 * Input: 3 FIC export acquisti. Filtra righe missing (no strict match in DB).
 * Classifica per CC:
 *   - AUTO/BENZINA/TELEPASS/PARCHEGGIO/GARAGE → tipologia carburante/autostrada/parcheggio
 *   - TRENI/AEREI → viaggio
 *   - RISTORANTI/TICKET RESTAURANT → vitto
 *   - ALBERGHI → alloggio
 *   - AMAZON/vuoto/altro → costi-generali (non costi-vivi)
 *   - COLLABORAZIONI ESTERNE → fatture-ingresso (PRA caso)
 *   - RIGENERAZIONE GREEN → fatture-ingresso (RGG caso)
 *   - ENEL → costi-generali energia
 *   - SOFTWARE-NORME → costi-generali abbonamento
 *
 * Mapping mese → commessa dominante (dai costi-vivi esistenti):
 *   2025-01: PONT-NAP (100%)
 *   2025-02: SEWE-CAR 5/8 + PONT-NAP 3/8 (proporzionale per data)
 *   2025-03: SEWE-CAR (100%)
 *   2025-04: SEWE-CAR
 *   2025-05: PONT-NAP
 *   2025-06-07: SEWE-CAR
 *   2025-08-09: PONT-NAP
 *   2025-10: SEWE-CAR
 *   2025-11: PONT-NAP 24/27 (maj) + PROV-ROM 3/27
 *   2025-12: INVE-NAP 15/22 + PROV-ROM 7/22
 *   2026-01: PROV-ROM 14/20 + PONT-NAP 6/20
 *   2026-04: PROV-ROM ~70% + PONT-NAP ~30% (estrapolazione da gen26)
 *
 * Usage:
 *   node scripts/import-missing-costi-vivi.mjs          # dry-run
 *   node scripts/import-missing-costi-vivi.mjs --apply  # apply
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
    .replace(/s\.?\s*r\.?\s*l\.?(\s+unipersonale)?/gi, '')
    .replace(/s\.?\s*p\.?\s*a\.?/gi, '')
    .replace(/s\.?\s*n\.?\s*c\.?/gi, '')
    .replace(/s\.?\s*a\.?\s*s\.?/gi, '')
    .replace(/società|societa/gi, '')
    .replace(/[.,;:&()'"\/]/g, ' ').replace(/\s+/g, ' ').trim();
}
function dIso(n) { if (typeof n !== 'number') return n || null; const e = new Date(Date.UTC(1899,11,30)); return new Date(e.getTime()+n*86400000).toISOString().slice(0,10); }

const projects = load('projects.json');
const projByCode = new Map(projects.map(p => [p.code, p]));
const projById = new Map(projects.map(p => [p.id, p]));
const fi = load('fatture-ingresso.json');
const cg = load('costi-generali.json');
const cv = load('costi-vivi.json');
const fc = load('fatture-consulenti.json');

// Mapping mese → {commessaCode: count_proportional}
// L'ordine delle commesse conta: le prime N/totalN righe del mese vanno alla prima, ecc.
const MONTH_DISTRIBUTION = {
  '2025-01': [['PONT-NAP-2601', 1]],
  '2025-02': [['SEWE-CAR-2501', 5], ['PONT-NAP-2601', 3]],
  '2025-03': [['SEWE-CAR-2501', 1]],
  '2025-04': [['SEWE-CAR-2501', 1]],
  '2025-05': [['PONT-NAP-2601', 1]],
  '2025-06': [['SEWE-CAR-2501', 1]],
  '2025-07': [['SEWE-CAR-2501', 1]],
  '2025-08': [['PONT-NAP-2601', 1]],
  '2025-09': [['PONT-NAP-2601', 1]],
  '2025-10': [['SEWE-CAR-2501', 1]],
  '2025-11': [['PONT-NAP-2601', 24], ['PROV-ROM-2601', 3]],
  '2025-12': [['INVE-NAP-2501', 15], ['PROV-ROM-2601', 7]],
  '2026-01': [['PROV-ROM-2601', 14], ['PONT-NAP-2601', 6]],
  '2026-04': [['PROV-ROM-2601', 14], ['PONT-NAP-2601', 6]], // estrapolato da gen26
};

// CC → {destination, tipologia_cv, categoria_cg}
function classifyCC(cc) {
  const u = String(cc || '').toUpperCase();
  // costi-vivi
  if (/BENZINA|AUTO E ANNESSI/.test(u)) return { dest: 'cv', tipologia: 'carburante' };
  if (/TELEPASS/.test(u)) return { dest: 'cv', tipologia: 'autostrada' };
  if (/PARCHEGGIO|GARAGE/.test(u)) return { dest: 'cv', tipologia: 'parcheggio' };
  if (/TRENI|AEREI/.test(u)) return { dest: 'cv', tipologia: 'viaggio' };
  if (/RISTORANTI|TICKET RESTAURANT/.test(u)) return { dest: 'cv', tipologia: 'vitto' };
  if (/ALBERGHI/.test(u)) return { dest: 'cv', tipologia: 'alloggio' };
  // costi-generali
  if (/ENEL|ENERGIA/.test(u)) return { dest: 'cg', categoria: 'energia' };
  if (/TELEFONIA|INTERNET/.test(u)) return { dest: 'cg', categoria: 'internet_dati' };
  if (/SOFTWARE.*ABBONAMENT|ABBONAMENT/.test(u)) return { dest: 'cg', categoria: 'abbonamento' };
  if (/AMAZON/.test(u)) return { dest: 'cg', categoria: 'altro' };
  // fatture-ingresso (casi speciali)
  if (/COLLABORAZIONI ESTERNE/.test(u)) return { dest: 'fi_special_pra' };
  if (/RIGENERAZIONE GREEN/.test(u)) return { dest: 'fi_special_rgg' };
  // default: costi-generali altro
  return { dest: 'cg', categoria: 'altro' };
}

// ─── Parse Excel missing ───────────────────────────────────────────
const files = ['export 15-04-2026 08-46-51.xls', 'export 16-04-2026 09-42-32.xls', 'export 22-04-2026 16-10-28.xls'];
const excelRows = [];
for (const f of files) {
  const wb = XLSX.readFile(path.join(EXCEL, f));
  const raw = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: null });
  let h = -1;
  for (let i = 0; i < raw.length; i++) if (Array.isArray(raw[i]) && raw[i].includes('Fornitore') && raw[i].includes('Imponibile')) { h = i; break; }
  const H = raw[h];
  const c = { data: H.indexOf('Data'), num: H.indexOf('Nr. acquisto'), cc: H.indexOf('Centro costo'), forn: H.indexOf('Fornitore'), piva: H.indexOf('Partita IVA'), desc: H.indexOf('Descrizione'), imp: H.indexOf('Imponibile'), iva: H.indexOf('IVA'), dataFE: H.indexOf('Data ricezione FE') };
  for (let i = h + 1; i < raw.length; i++) {
    const r = raw[i];
    if (!Array.isArray(r) || !r[c.forn] || !r[c.imp]) continue;
    excelRows.push({
      source: f.slice(7, 12),
      rowIdx: i,
      data: dIso(r[c.data]),
      nr: String(r[c.num] || ''),
      fornitore: String(r[c.forn]),
      fornitore_norm: norm(r[c.forn]),
      piva: r[c.piva] ? String(r[c.piva]) : null,
      cc: r[c.cc] ? String(r[c.cc]) : null,
      desc: r[c.desc] ? String(r[c.desc]) : null,
      imp: Number(r[c.imp]),
      iva: Number(r[c.iva]) || 0,
      dataFE: dIso(r[c.dataFE]),
    });
  }
}
// Dedupe cross-export
const seen = new Set(); const uniq = [];
for (const r of excelRows) {
  const k = `${r.fornitore_norm}|${r.imp.toFixed(2)}|${r.data}|${r.nr}`;
  if (seen.has(k)) continue; seen.add(k); uniq.push(r);
}

// ─── Strict index DB ────────────────────────────────────────────────
const dbKeys = new Set();
for (const r of fi) dbKeys.add(`${norm(r.fornitore)}|${(r.importo/100).toFixed(2)}|${r.dataEmissione}`);
for (const r of cg) dbKeys.add(`${norm(r.fornitore)}|${Number(r.importo).toFixed(2)}|${r.data}`);
for (const r of cv) {
  // cv note contiene "Fornitore: X"
  const m = String(r.note || '').match(/Fornitore:\s*([^|]+)/i);
  if (m) dbKeys.add(`${norm(m[1].trim())}|${(r.importo/100).toFixed(2)}|${r.data}`);
}
for (const r of fc) dbKeys.add(`${norm(r.consulente)}|${Number(r.importo).toFixed(2)}|${r.dataEmissione || r.data}`);

const missing = uniq.filter(e => !dbKeys.has(`${e.fornitore_norm}|${e.imp.toFixed(2)}|${e.data}`));
console.log(`Missing totale (nessun match strict): ${missing.length}`);

// ─── Classifica ed assegna commessa ────────────────────────────────
const bucketCv = [];
const bucketCg = [];
const bucketFiPra = [];
const bucketFiRgg = [];

for (const m of missing) {
  const cls = classifyCC(m.cc);
  if (cls.dest === 'cv') bucketCv.push({ ...m, tipologia: cls.tipologia });
  else if (cls.dest === 'cg') bucketCg.push({ ...m, categoria: cls.categoria });
  else if (cls.dest === 'fi_special_pra') bucketFiPra.push(m);
  else if (cls.dest === 'fi_special_rgg') bucketFiRgg.push(m);
}

console.log(`  → costi-vivi: ${bucketCv.length}`);
console.log(`  → costi-generali: ${bucketCg.length}`);
console.log(`  → fatture-ingresso PRA (CNPA-NAP-2501): ${bucketFiPra.length}`);
console.log(`  → fatture-ingresso RGG (SIF-TOR-2501): ${bucketFiRgg.length}`);

// ─── Assegna commessa per mese ai costi-vivi ───────────────────────
// Raggruppa per mese e ordina per data
const cvByMonth = {};
for (const c of bucketCv) {
  const mo = (c.data || '').slice(0, 7);
  if (!cvByMonth[mo]) cvByMonth[mo] = [];
  cvByMonth[mo].push(c);
}
for (const mo of Object.keys(cvByMonth)) cvByMonth[mo].sort((a, b) => (a.data || '').localeCompare(b.data || ''));

const cvToAdd = [];
const cvUnassigned = [];
for (const [mo, rows] of Object.entries(cvByMonth)) {
  const dist = MONTH_DISTRIBUTION[mo];
  if (!dist) {
    for (const r of rows) cvUnassigned.push({ ...r, reason: `mese ${mo} non mappato` });
    continue;
  }
  // Calcola quante righe per ogni commessa (proporzionale)
  const totalWeight = dist.reduce((s, [, w]) => s + w, 0);
  const N = rows.length;
  const assignments = [];
  let used = 0;
  for (let i = 0; i < dist.length; i++) {
    const [code, w] = dist[i];
    let count;
    if (i === dist.length - 1) count = N - used; // last takes remainder
    else count = Math.round(N * w / totalWeight);
    assignments.push([code, count]);
    used += count;
  }
  let cursor = 0;
  for (const [code, count] of assignments) {
    for (let j = 0; j < count && cursor < rows.length; j++) {
      const r = rows[cursor++];
      const proj = projByCode.get(code);
      if (!proj) { cvUnassigned.push({ ...r, reason: `commessa ${code} non esiste` }); continue; }
      cvToAdd.push({ ...r, projectId: proj.id, projectCode: code });
    }
  }
}

console.log(`\nCosti-vivi assegnati: ${cvToAdd.length}`);
console.log(`Costi-vivi non assegnati: ${cvUnassigned.length}`);
if (cvUnassigned.length) {
  for (const u of cvUnassigned.slice(0, 5)) console.log('   ', u.data, '| €' + u.imp, '|', u.fornitore.slice(0,25), '|', u.reason);
}

// Distribuzione finale per commessa/mese
console.log('\n=== Distribuzione costi-vivi importati (mese × commessa) ===');
const dist = {};
for (const r of cvToAdd) {
  const mo = (r.data || '').slice(0, 7);
  if (!dist[mo]) dist[mo] = {};
  dist[mo][r.projectCode] = (dist[mo][r.projectCode] || 0) + 1;
}
for (const [mo, v] of Object.entries(dist).sort()) {
  console.log(' ', mo, '→', JSON.stringify(v));
}

console.log('\n=== Costi-generali da aggiungere ===');
const cgByForn = {};
for (const r of bucketCg) {
  const k = norm(r.fornitore);
  if (!cgByForn[k]) cgByForn[k] = { n: 0, tot: 0, categoria: r.categoria };
  cgByForn[k].n++; cgByForn[k].tot += r.imp;
}
for (const [k, v] of Object.entries(cgByForn).sort((a,b)=>b[1].n-a[1].n)) {
  console.log(' ', String(v.n).padStart(3), '€' + v.tot.toFixed(2).padStart(10), '|', k.slice(0,30).padEnd(30), '| cat:', v.categoria);
}

console.log('\n══════ SUMMARY ══════');
console.log(`  +${cvToAdd.length} costi-vivi`);
console.log(`  +${bucketCg.length} costi-generali`);
console.log(`  +${bucketFiPra.length} fatture-ingresso (PRA → CNPA-NAP-2501)`);
console.log(`  +${bucketFiRgg.length} fatture-ingresso (RGG → SIF-TOR-2501)`);
console.log(`  ${cvUnassigned.length} non assegnati (serve revisione)`);

if (!APPLY) {
  console.log('\n(dry-run. Per applicare: --apply)');
  process.exit(0);
}

// Backup
const BACKUP = path.join(DATA, '_backup-pre-import-costi-vivi-' + new Date().toISOString().slice(0,10));
if (!fs.existsSync(BACKUP)) fs.mkdirSync(BACKUP);
fs.copyFileSync(path.join(DATA, 'costi-vivi.json'), path.join(BACKUP, 'costi-vivi.json'));
fs.copyFileSync(path.join(DATA, 'costi-generali.json'), path.join(BACKUP, 'costi-generali.json'));
fs.copyFileSync(path.join(DATA, 'fatture-ingresso.json'), path.join(BACKUP, 'fatture-ingresso.json'));
console.log(`\n→ Backup in ${BACKUP}`);

// ─── Apply ─────────────────────────────────────────────────────────
const today = new Date().toISOString().slice(0, 10);

for (const r of cvToAdd) {
  cv.push({
    id: randomUUID(),
    projectId: r.projectId,
    tipologia: r.tipologia,
    data: r.data,
    importo: Math.round(r.imp * 100),
    descrizione: r.desc || r.fornitore,
    note: `Nr. fattura: ${r.nr} | CC: ${r.cc || '-'} | Fonte: FIC export ${r.source} | Fornitore: ${r.fornitore}`,
  });
}

for (const r of bucketCg) {
  cg.push({
    id: randomUUID(),
    categoria: r.categoria,
    fornitore: r.fornitore,
    descrizione: r.desc || `Import da FIC nr. ${r.nr}`,
    data: r.data,
    importo: r.imp,
    pagato: !!r.dataFE,
    ...(r.dataFE ? { dataPagamento: r.dataFE } : {}),
    note: `Import da FIC ${r.source} | CC: ${r.cc || '(vuoto)'} | nr ${r.nr}`,
  });
}

// PRA
const cnpa = projByCode.get('CNPA-NAP-2501');
for (const r of bucketFiPra) {
  fi.push({
    id: randomUUID(),
    projectId: cnpa.id,
    numeroFattura: r.nr,
    fornitore: r.fornitore,
    dataEmissione: r.data,
    dataCaricamento: today,
    dataScadenzaPagamento: r.data,
    importo: Math.round(r.imp * 100),
    categoria: 'collaborazione_esterna',
    descrizione: r.desc,
    pagata: !!r.dataFE,
    ...(r.dataFE ? { dataPagamento: r.dataFE } : {}),
    note: `Import da FIC ${r.source} | CC: COLLABORAZIONI ESTERNE | nr ${r.nr}`,
  });
}

// RGG
const sif = projByCode.get('SIF-TOR-2501');
for (const r of bucketFiRgg) {
  fi.push({
    id: randomUUID(),
    projectId: sif.id,
    numeroFattura: r.nr,
    fornitore: r.fornitore,
    dataEmissione: r.data,
    dataCaricamento: today,
    dataScadenzaPagamento: r.data,
    importo: Math.round(r.imp * 100),
    categoria: 'collaborazione_esterna',
    descrizione: r.desc,
    pagata: !!r.dataFE,
    ...(r.dataFE ? { dataPagamento: r.dataFE } : {}),
    note: `Import da FIC ${r.source} | CC: RIGENERAZIONE GREEN | nr ${r.nr}`,
  });
}

save('costi-vivi.json', cv);
save('costi-generali.json', cg);
save('fatture-ingresso.json', fi);

console.log(`\n✅ APPLIED:`);
console.log(`  costi-vivi: ${cv.length} (+${cvToAdd.length})`);
console.log(`  costi-generali: ${cg.length} (+${bucketCg.length})`);
console.log(`  fatture-ingresso: ${fi.length} (+${bucketFiPra.length + bucketFiRgg.length})`);
