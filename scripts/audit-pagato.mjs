/**
 * Audit flag pagato/incassata: confronta le fatture in archivio con i campi
 * "Saldato" (emesse) e "Data ricezione FE" (ingresso/consulenti) negli export FIC.
 *
 * Regola (da istruzione utente):
 *   - Emesse: pagato/incassata = true se Saldato=SI
 *   - Ingresso/Consulenti: pagato = true se Data ricezione FE è valorizzata
 *
 * Output: stampa correzioni da applicare (dry-run). --apply le esegue.
 */

import fs from 'fs';
import path from 'path';
import XLSX from 'xlsx';

const DATA = 'C:/Users/tecni/Desktop/Codice/GBidelloCommesse-main/data';
const EXCEL = 'C:/Users/tecni/Desktop/Codice/Dati';
const APPLY = process.argv.includes('--apply');

function load(f) { return JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf-8')); }
function save(f, d) { fs.writeFileSync(path.join(DATA, f), JSON.stringify(d, null, 2), 'utf-8'); }
function norm(s) {
  return String(s || '').toLowerCase()
    .replace(/s\.?\s*r\.?\s*l\.?(\s+unipersonale)?/gi, '')
    .replace(/s\.?\s*p\.?\s*a\.?/gi, '')
    .replace(/[.,;:&()]/g, ' ')
    .replace(/\s+/g, ' ').trim();
}
function serialToDate(n) {
  if (typeof n !== 'number' || !isFinite(n)) return null;
  const e = new Date(Date.UTC(1899, 11, 30));
  return new Date(e.getTime() + n * 86400000).toISOString().slice(0, 10);
}

// ─── Carica exports FIC e costruisci lookup ───

// Lookup ingresso/consulenti: key = fornitore_norm|importo (EUR) → { dataRicezioneFE }
const ingressoLookup = new Map();
for (const f of ['export 15-04-2026 08-46-51.xls', 'export 16-04-2026 09-42-32.xls', 'export 22-04-2026 16-10-28.xls']) {
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
  const iDataFE = raw[h].indexOf('Data ricezione FE');
  const iForn = raw[h].indexOf('Fornitore');
  const iImp = raw[h].indexOf('Imponibile');
  for (let i = h + 1; i < raw.length; i++) {
    const r = raw[i];
    if (!Array.isArray(r) || !r[iForn]) continue;
    const imp = r[iImp];
    if (!imp) continue;
    const key = norm(String(r[iForn])) + '|' + Number(imp).toFixed(2);
    const dataFE = serialToDate(r[iDataFE]);
    if (!ingressoLookup.has(key)) {
      ingressoLookup.set(key, { dataRicezioneFE: dataFE });
    }
  }
}

// Lookup emesse: key = cliente_norm|importo → { saldato }
const emesseLookup = new Map();
{
  const f = 'export 23-04-2026 08-53-25.xls';
  const full = path.join(EXCEL, f);
  if (fs.existsSync(full)) {
    const wb = XLSX.readFile(full);
    const sh = wb.Sheets[wb.SheetNames[0]];
    const raw = XLSX.utils.sheet_to_json(sh, { header: 1, defval: null });
    let h = -1;
    for (let i = 0; i < raw.length; i++) {
      if (Array.isArray(raw[i]) && raw[i].includes('Cliente') && raw[i].includes('Saldato')) { h = i; break; }
    }
    if (h >= 0) {
      const iSaldato = raw[h].indexOf('Saldato');
      const iCli = raw[h].indexOf('Cliente');
      const iImp = raw[h].indexOf('Imponibile');
      const iNum = raw[h].indexOf('Numero');
      for (let i = h + 1; i < raw.length; i++) {
        const r = raw[i];
        if (!Array.isArray(r) || !r[iCli]) continue;
        const imp = r[iImp];
        if (!imp) continue;
        const key = norm(String(r[iCli])) + '|' + Number(imp).toFixed(2);
        if (!emesseLookup.has(key)) {
          emesseLookup.set(key, { saldato: r[iSaldato] === 'SI' });
        }
      }
    }
  }
}

console.log(`Export caricati. Lookup ingresso: ${ingressoLookup.size} key, emesse: ${emesseLookup.size} key`);
console.log('');

// ─── Audit archivi JSON ───
const corrections = { fatture_emesse: [], fatture_ingresso: [], fatture_consulenti: [] };

// Emesse
const fe = load('fatture-emesse.json');
for (const x of fe) {
  const key = norm(x.cliente) + '|' + Number(x.importo).toFixed(2);
  const src = emesseLookup.get(key);
  if (!src) continue;
  const shouldBePaid = src.saldato;
  if (shouldBePaid && !x.incassata) {
    corrections.fatture_emesse.push({ id: x.id, nr: x.numeroFattura, cliente: x.cliente, importo: x.importo, action: 'set incassata=true' });
    if (APPLY) {
      x.incassata = true;
      if (!x.dataIncasso) x.dataIncasso = x.dataEmissione;
    }
  }
}

// Ingresso
const fi = load('fatture-ingresso.json');
for (const x of fi) {
  const key = norm(x.fornitore) + '|' + (x.importo / 100).toFixed(2);
  const src = ingressoLookup.get(key);
  if (!src) continue;
  const shouldBePaid = !!src.dataRicezioneFE;
  if (shouldBePaid && !x.pagata) {
    corrections.fatture_ingresso.push({ id: x.id, nr: x.numeroFattura, fornitore: x.fornitore, importo: x.importo / 100, dataFE: src.dataRicezioneFE, action: 'set pagata=true' });
    if (APPLY) {
      x.pagata = true;
      if (!x.dataPagamento) x.dataPagamento = src.dataRicezioneFE;
    }
  }
}

// Consulenti
const fc = load('fatture-consulenti.json');
for (const x of fc) {
  const key = norm(x.consulente) + '|' + Number(x.importo).toFixed(2);
  const src = ingressoLookup.get(key);
  if (!src) continue;
  const shouldBePaid = !!src.dataRicezioneFE;
  if (shouldBePaid && !x.pagata) {
    corrections.fatture_consulenti.push({ id: x.id, nr: x.numeroFattura, consulente: x.consulente, importo: x.importo, dataFE: src.dataRicezioneFE, action: 'set pagata=true' });
    if (APPLY) {
      x.pagata = true;
      if (!x.dataPagamento) x.dataPagamento = src.dataRicezioneFE;
    }
  }
}

console.log(`Correzioni necessarie:`);
console.log(`  fatture-emesse:      ${corrections.fatture_emesse.length}`);
console.log(`  fatture-ingresso:    ${corrections.fatture_ingresso.length}`);
console.log(`  fatture-consulenti:  ${corrections.fatture_consulenti.length}`);
console.log('');

if (corrections.fatture_emesse.length > 0) {
  console.log('--- Emesse da segnare come incassate ---');
  corrections.fatture_emesse.forEach(c => console.log(' ', c.nr.padEnd(6), '|', c.cliente.slice(0, 40).padEnd(40), '| €' + c.importo));
}
if (corrections.fatture_ingresso.length > 0) {
  console.log('\n--- Ingresso da segnare come pagate ---');
  corrections.fatture_ingresso.slice(0, 20).forEach(c => console.log(' ', c.nr.padEnd(10), '|', c.fornitore.slice(0, 35).padEnd(35), '| €' + c.importo.toFixed(2), '| FE:', c.dataFE));
  if (corrections.fatture_ingresso.length > 20) console.log('  ...altri', corrections.fatture_ingresso.length - 20);
}
if (corrections.fatture_consulenti.length > 0) {
  console.log('\n--- Consulenti da segnare come pagate ---');
  corrections.fatture_consulenti.forEach(c => console.log(' ', c.nr.padEnd(10), '|', c.consulente.slice(0, 35).padEnd(35), '| €' + c.importo, '| FE:', c.dataFE));
}

const reportPath = path.join(DATA, '_pagato-audit-report.json');
fs.writeFileSync(reportPath, JSON.stringify(corrections, null, 2), 'utf-8');
console.log('\nReport dettagliato:', reportPath);

if (APPLY) {
  save('fatture-emesse.json', fe);
  save('fatture-ingresso.json', fi);
  save('fatture-consulenti.json', fc);
  console.log('\n✅ Correzioni APPLICATE');
} else {
  console.log('\nDRY-RUN — usa --apply per salvare');
}
