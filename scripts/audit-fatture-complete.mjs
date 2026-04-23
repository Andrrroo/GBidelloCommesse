/**
 * AUDIT FATTURE COMPLETO (read-only)
 *
 * Verifica che ogni fattura nei file Excel sia presente nel sito e collegata
 * alla commessa giusta. Non modifica il DB. Output: data/_audit-fatture-report.json
 *
 * Sorgenti Excel in C:/Users/tecni/Desktop/Codice/Dati/:
 *   - export 15-04-2026, 16-04-2026, 22-04-2026 (acquisti FIC)
 *   - export 23-04-2026 (documenti emessi FIC)
 *   - RIEPILOGO ACQUISTI.xlsx (mappa fornitore+importo -> sheet/commessa)
 *
 * Classificazione per riga Excel:
 *   OK_COMMESSA          — presente in fi/fe/fc e su commessa giusta
 *   OK_COSTO_GENERALE    — presente in cg (corretto: non è costo di commessa)
 *   MISSING              — non presente in nessun file JSON
 *   DUPLICATE            — match multiplo in DB
 *   WRONG_COMMESSA       — su commessa diversa da quella prevista da RIEPILOGO
 *   MISCLASSIFIED_AS_CG  — in costi-generali ma RIEPILOGO lo mette su commessa
 *   AMBIGUOUS            — fornitore+importo appare su più sheet RIEPILOGO
 *   WEAK_MATCH           — match solo su (fornitore,importo) senza data
 */

import fs from 'fs';
import path from 'path';
import XLSX from 'xlsx';

const DATA = 'C:/Users/tecni/Desktop/Codice/GBidelloCommesse-main/data';
const EXCEL = 'C:/Users/tecni/Desktop/Codice/Dati';

// ─── util ──────────────────────────────────────────────────────────────────
const load = (f) => JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf-8'));

function norm(s) {
  return String(s || '').toLowerCase()
    .replace(/s\.?\s*r\.?\s*l\.?(\s+unipersonale)?/gi, '')
    .replace(/s\.?\s*p\.?\s*a\.?/gi, '')
    .replace(/s\.?\s*n\.?\s*c\.?/gi, '')
    .replace(/s\.?\s*a\.?\s*s\.?/gi, '')
    .replace(/società|societa/gi, '')
    .replace(/[.,;:&()'"\/]/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

function normPiva(s) {
  if (!s) return null;
  const digits = String(s).replace(/\D/g, '');
  return digits.length >= 8 ? digits : null; // accetta PIVA (11) o CF (16) o semplici 8+
}

function excelDateToIso(n) {
  if (typeof n !== 'number') return n || null;
  const epoch = new Date(Date.UTC(1899, 11, 30));
  return new Date(epoch.getTime() + n * 86400000).toISOString().slice(0, 10);
}

function eur(n) {
  const v = typeof n === 'number' ? n : parseFloat(String(n).replace(',', '.'));
  return Number.isFinite(v) ? +v.toFixed(2) : null;
}

// ─── parse FIC acquisti (ingresso) ─────────────────────────────────────────
function parseFICIngresso(filename) {
  const full = path.join(EXCEL, filename);
  if (!fs.existsSync(full)) return [];
  const wb = XLSX.readFile(full);
  const sh = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json(sh, { header: 1, defval: null });
  let h = -1;
  for (let i = 0; i < raw.length; i++) {
    if (Array.isArray(raw[i]) && raw[i].includes('Fornitore') && raw[i].includes('Imponibile')) {
      h = i; break;
    }
  }
  if (h < 0) return [];
  const H = raw[h];
  const col = (name) => H.indexOf(name);
  const c = {
    data: col('Data'),
    num: col('Nr. acquisto'),
    dataFE: col('Data ricezione FE'),
    cc: col('Centro costo'),
    forn: col('Fornitore'),
    piva: col('Partita IVA'),
    desc: col('Descrizione'),
    imp: col('Imponibile'),
    iva: col('IVA'),
    ritAcc: col('Rit. acconto'),
  };
  const out = [];
  for (let i = h + 1; i < raw.length; i++) {
    const r = raw[i];
    if (!Array.isArray(r) || !r[c.forn]) continue;
    const imp = eur(r[c.imp]);
    if (!imp || imp === 0) continue;
    out.push({
      kind: 'ingresso',
      file: filename.slice(7, 12), // es. "15-04"
      rowIdx: i,
      data: excelDateToIso(r[c.data]),
      numeroAcquisto: r[c.num] ? String(r[c.num]) : null,
      fornitore: String(r[c.forn]),
      fornitore_norm: norm(r[c.forn]),
      piva: normPiva(r[c.piva]),
      cc: r[c.cc] ? String(r[c.cc]) : null,
      descrizione: r[c.desc] ? String(r[c.desc]) : null,
      imponibile: imp,
      iva: eur(r[c.iva]) || 0,
      ritAcc: eur(r[c.ritAcc]) || 0,
      dataRicezioneFE: excelDateToIso(r[c.dataFE]),
    });
  }
  return out;
}

// ─── parse FIC emesse ─────────────────────────────────────────────────────
function parseFICEmesse(filename) {
  const full = path.join(EXCEL, filename);
  if (!fs.existsSync(full)) return [];
  const wb = XLSX.readFile(full);
  const sh = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json(sh, { header: 1, defval: null });
  let h = -1;
  for (let i = 0; i < raw.length; i++) {
    if (Array.isArray(raw[i]) && raw[i].includes('Cliente') && raw[i].includes('Saldato')) {
      h = i; break;
    }
  }
  if (h < 0) return [];
  const H = raw[h];
  const col = (name) => H.indexOf(name);
  const c = {
    data: col('Data'),
    prox: col('Prox scadenza'),
    num: col('Numero'),
    saldato: col('Saldato'),
    cr: col('Centro ricavo'),
    cli: col('Cliente'),
    piva: col('P.IVA'),
    ogInt: col('Oggetto (interno)'),
    ogVis: col('Oggetto (visibile)'),
    imp: col('Imponibile'),
  };
  const out = [];
  for (let i = h + 1; i < raw.length; i++) {
    const r = raw[i];
    if (!Array.isArray(r) || !r[c.cli]) continue;
    const imp = eur(r[c.imp]);
    if (!imp || imp === 0) continue;
    out.push({
      kind: 'emessa',
      file: filename.slice(7, 12),
      rowIdx: i,
      data: excelDateToIso(r[c.data]),
      numero: r[c.num] ? String(r[c.num]) : null,
      saldato: r[c.saldato] === 'SI',
      cr: r[c.cr] ? String(r[c.cr]) : null,
      cliente: String(r[c.cli]),
      cliente_norm: norm(r[c.cli]),
      piva: normPiva(r[c.piva]),
      oggetto: (r[c.ogVis] || r[c.ogInt]) ? String(r[c.ogVis] || r[c.ogInt]) : null,
      imponibile: imp,
      proxScadenza: excelDateToIso(r[c.prox]),
    });
  }
  return out;
}

// ─── parse RIEPILOGO ACQUISTI ─────────────────────────────────────────────
function parseRiepilogo(filename) {
  const full = path.join(EXCEL, filename);
  if (!fs.existsSync(full)) return [];
  const wb = XLSX.readFile(full);
  const out = [];
  for (const sheetName of wb.SheetNames) {
    const raw = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: null });
    // trova riga header con "FORNITORE" + "IMPORTO TOT."
    let h = -1;
    for (let i = 0; i < raw.length; i++) {
      if (Array.isArray(raw[i]) && raw[i].includes('FORNITORE') && raw[i].some(v => v && String(v).toUpperCase().includes('IMPORTO'))) {
        h = i; break;
      }
    }
    if (h < 0) continue;
    const H = raw[h];
    const cN = H.indexOf('N°');
    const cDesc = H.findIndex(v => v && String(v).toUpperCase().includes('DESCRIZIONE'));
    const cForn = H.indexOf('FORNITORE');
    const cImp = H.findIndex(v => v && String(v).toUpperCase().includes('IMPORTO'));
    const cPdf = H.findIndex(v => v && String(v).toUpperCase().includes('LINK'));
    const cOrd = H.findIndex(v => v && String(v).toUpperCase().replace(/\s/g, '').includes('CHECKORDINE'));
    const cRap = H.findIndex(v => v && String(v).toUpperCase().replace(/\s/g, '').includes('CHECKRAPPORTO'));
    const cFat = H.findIndex(v => v && String(v).toUpperCase().replace(/\s/g, '').includes('CHECKFATTURA'));
    for (let i = h + 1; i < raw.length; i++) {
      const r = raw[i];
      if (!Array.isArray(r)) continue;
      const forn = r[cForn];
      const imp = eur(r[cImp]);
      if (!forn || forn === '-' || !imp || imp === 0) continue;
      out.push({
        sheet: sheetName,
        rowIdx: i,
        n: r[cN] ? String(r[cN]) : null,
        descrizione: r[cDesc] ? String(r[cDesc]) : null,
        fornitore: String(forn),
        fornitore_norm: norm(forn),
        importoTot: imp,
        pdf: r[cPdf] || null,
        checkOrdine: r[cOrd] || null,
        checkRapporto: r[cRap] || null,
        checkFattura: r[cFat] || null,
      });
    }
  }
  return out;
}

// ─── sheet → commessa mapping ─────────────────────────────────────────────
const SHEET_TO_COMMESSA = {
  'SEMINARIO': 'PONT-NAP-2601',
  'COLLEGIUM - Immobile Seminario': 'PONT-NAP-2601',
  'COLLEGIUM Sezione': 'PONT-NAP-2601',
  'COLLEGIUM - Immobile VSL': 'PONT-NAP-2601',
  'COLLEGIUM Aree Esterne': 'PONT-NAP-2601',
  'INFERMERIA VSL': 'PONT-NAP-2601',
  'CARDONER VSL': 'PONT-NAP-2601',
  'P3-P4 VSL': 'PONT-NAP-2601',
  'BERARDINO': 'PONT-NAP-2601', // tetto VSL → Seminario
  'CHIESA': null, // ambiguo
  'PALAZZO SPAVENTA': null, // ambiguo
  'SEW CARINARO': 'SEWE-CAR-2501',
  'VIA DEGLI ASTALLI': 'PROV-ROM-2601',
  'SCUOLA DEL MASSIMO': 'MASS-ROM-2601',
  'PONTANO': 'PONT-NAP-2602',
};

// ─── main ──────────────────────────────────────────────────────────────────
const projects = load('projects.json');
const clients = load('clients.json');
const fi = load('fatture-ingresso.json');
const fe = load('fatture-emesse.json');
const fc = load('fatture-consulenti.json');
const cg = load('costi-generali.json');

// index projects by id
const projectById = new Map(projects.map(p => [p.id, p]));
const projectByCode = new Map(projects.map(p => [p.code, p]));

// index DB rows (unified)
// ogni entry: { source, id, projectId, projectCode, importoEur, fornitore_norm, piva, data, numero, raw }
const dbRows = [];
for (const r of fi) {
  dbRows.push({
    source: 'fi', id: r.id,
    projectId: r.projectId,
    projectCode: projectById.get(r.projectId)?.code || null,
    importoEur: r.importo / 100,
    fornitore: r.fornitore,
    fornitore_norm: norm(r.fornitore),
    piva: null, // FI in DB non ha piva
    data: r.dataEmissione,
    numero: r.numeroFattura,
    raw: r,
  });
}
for (const r of fc) {
  dbRows.push({
    source: 'fc', id: r.id,
    projectId: r.projectId,
    projectCode: projectById.get(r.projectId)?.code || null,
    importoEur: Number(r.importo),
    fornitore: r.consulente,
    fornitore_norm: norm(r.consulente),
    piva: null,
    data: r.dataEmissione || r.data,
    numero: r.numeroFattura,
    raw: r,
  });
}
for (const r of fe) {
  dbRows.push({
    source: 'fe', id: r.id,
    projectId: r.projectId,
    projectCode: projectById.get(r.projectId)?.code || null,
    importoEur: Number(r.importo),
    fornitore: r.cliente,
    fornitore_norm: norm(r.cliente),
    piva: null,
    data: r.dataEmissione || r.data,
    numero: r.numeroFattura,
    raw: r,
  });
}
for (const r of cg) {
  dbRows.push({
    source: 'cg', id: r.id,
    projectId: null,
    projectCode: null,
    importoEur: Number(r.importo),
    fornitore: r.fornitore,
    fornitore_norm: norm(r.fornitore),
    piva: null,
    data: r.data,
    numero: null,
    raw: r,
  });
}

function buildIndex(keyFn) {
  const m = new Map();
  for (const row of dbRows) {
    const key = keyFn(row);
    if (!key) continue;
    if (!m.has(key)) m.set(key, []);
    m.get(key).push(row);
  }
  return m;
}

const idxStrict = buildIndex(r => r.fornitore_norm && r.importoEur != null && r.data
  ? `${r.fornitore_norm}|${r.importoEur.toFixed(2)}|${r.data}` : null);
const idxLoose = buildIndex(r => r.fornitore_norm && r.importoEur != null
  ? `${r.fornitore_norm}|${r.importoEur.toFixed(2)}` : null);

// ─── parse excel ─────────────────────────────────────────────────────────
console.log('→ Parsing Excel files...');
const ingressoRows = [
  ...parseFICIngresso('export 15-04-2026 08-46-51.xls'),
  ...parseFICIngresso('export 16-04-2026 09-42-32.xls'),
  ...parseFICIngresso('export 22-04-2026 16-10-28.xls'),
];
const emesseRows = parseFICEmesse('export 23-04-2026 08-53-25.xls');
const riepilogoRows = parseRiepilogo('RIEPILOGO ACQUISTI.xlsx');

console.log(`  ingresso FIC: ${ingressoRows.length} righe`);
console.log(`  emesse FIC:   ${emesseRows.length} righe`);
console.log(`  riepilogo:    ${riepilogoRows.length} righe su ${new Set(riepilogoRows.map(r => r.sheet)).size} sheet`);

// ─── Dedupe ingresso Excel (stesse fatture presenti su più export) ─────
// Dedup key: fornitore_norm + imponibile + data + numeroAcquisto (il più stretto possibile)
const ingressoMap = new Map();
for (const r of ingressoRows) {
  const k = `${r.fornitore_norm}|${r.imponibile.toFixed(2)}|${r.data}|${r.numeroAcquisto || ''}`;
  if (!ingressoMap.has(k)) ingressoMap.set(k, []);
  ingressoMap.get(k).push(r);
}
const ingressoUnique = [];
const excelDuplicatesIngresso = [];
for (const [k, arr] of ingressoMap) {
  ingressoUnique.push(arr[0]); // teniamo la prima occorrenza come canonica
  if (arr.length > 1) {
    excelDuplicatesIngresso.push({
      key: k,
      count: arr.length,
      files: arr.map(x => x.file),
      sample: { fornitore: arr[0].fornitore, imponibile: arr[0].imponibile, data: arr[0].data, nr: arr[0].numeroAcquisto },
    });
  }
}
console.log(`  ingresso uniche (dedup cross-export): ${ingressoUnique.length}`);

// ─── Riepilogo index by (fornitore_norm, importoTot) ──────────────────
const riepilogoByKey = new Map();
for (const r of riepilogoRows) {
  const k = `${r.fornitore_norm}|${r.importoTot.toFixed(2)}`;
  if (!riepilogoByKey.has(k)) riepilogoByKey.set(k, []);
  riepilogoByKey.get(k).push(r);
}

// ─── Cross-check ingresso ─────────────────────────────────────────────
console.log('\n→ Cross-check fatture ingresso...');

const results = {
  ingresso: {
    OK_COMMESSA: [],
    OK_COSTO_GENERALE: [],
    MISSING: [],
    DUPLICATE_IN_DB: [],
    WRONG_COMMESSA: [],
    MISCLASSIFIED_AS_CG: [],
    AMBIGUOUS: [],
    WEAK_MATCH: [],
    SHEET_UNMAPPED: [],
  },
  emesse: {
    OK_COMMESSA: [],
    MISSING: [],
    DUPLICATE_IN_DB: [],
    WRONG_COMMESSA: [],
    WEAK_MATCH: [],
  },
  orfaniInDb: {
    ingresso: [],
    consulenti: [],
    emesse: [],
    costiGenerali: [],
  },
  excelDuplicatesIngresso,
  riepilogoSenzaMatch: [],
};

function matchInDb(r, kind) {
  const strictKey = `${r.fornitore_norm}|${r.imponibile.toFixed(2)}|${r.data}`;
  const strictHits = idxStrict.get(strictKey) || [];
  if (strictHits.length > 0) return { hits: strictHits, strength: 'strict' };
  const looseKey = `${r.fornitore_norm}|${r.imponibile.toFixed(2)}`;
  const looseHits = idxLoose.get(looseKey) || [];
  // Se emessa, filtra ai soli fe; se ingresso, esclude fe
  const filtered = looseHits.filter(h => kind === 'emessa' ? h.source === 'fe' : h.source !== 'fe');
  if (filtered.length > 0) return { hits: filtered, strength: 'weak' };
  return { hits: [], strength: null };
}

// marchiamo quali record DB vengono "usati" (per trovare orfani)
const usedDbIds = new Set();

for (const r of ingressoUnique) {
  const { hits, strength } = matchInDb(r, 'ingresso');
  const riepKey = `${r.fornitore_norm}|${r.imponibile.toFixed(2)}`;
  const riepHits = riepilogoByKey.get(riepKey) || [];
  const expectedSheets = [...new Set(riepHits.map(x => x.sheet))];
  const expectedCodes = [...new Set(expectedSheets.map(s => SHEET_TO_COMMESSA[s]).filter(Boolean))];
  const hasUnmappedSheet = expectedSheets.some(s => SHEET_TO_COMMESSA[s] === null);

  const baseInfo = {
    file: r.file,
    data: r.data,
    nr: r.numeroAcquisto,
    cc: r.cc,
    fornitore: r.fornitore,
    piva: r.piva,
    descrizione: r.descrizione?.slice(0, 150),
    imponibile: r.imponibile,
    riepilogoSheets: expectedSheets,
  };

  if (hits.length === 0) {
    results.ingresso.MISSING.push(baseInfo);
    continue;
  }

  if (hits.length > 1) {
    // accettabile se sono tutti sullo stesso projectId/source o sono veri duplicati
    const distinctIds = new Set(hits.map(h => h.id));
    if (distinctIds.size > 1) {
      results.ingresso.DUPLICATE_IN_DB.push({
        ...baseInfo,
        dbMatches: hits.map(h => ({ source: h.source, id: h.id, projectCode: h.projectCode, data: h.data, numero: h.numero })),
      });
      for (const h of hits) usedDbIds.add(h.id);
      continue;
    }
  }

  const dbRow = hits[0];
  usedDbIds.add(dbRow.id);

  if (strength === 'weak') {
    results.ingresso.WEAK_MATCH.push({
      ...baseInfo,
      dbMatch: { source: dbRow.source, id: dbRow.id, projectCode: dbRow.projectCode, dataInDb: dbRow.data, numeroInDb: dbRow.numero },
    });
    // ma fai lo stesso la verifica di commessa
  }

  // Verifica commessa
  if (dbRow.source === 'cg') {
    // è in costi-generali
    if (expectedCodes.length === 0 || hasUnmappedSheet) {
      // non previsto su commessa (o sheet ambigua) → probabilmente ok
      if (hasUnmappedSheet) {
        results.ingresso.SHEET_UNMAPPED.push({ ...baseInfo, dbMatch: { source: 'cg', id: dbRow.id } });
      } else {
        results.ingresso.OK_COSTO_GENERALE.push(baseInfo);
      }
    } else if (expectedCodes.length === 1) {
      results.ingresso.MISCLASSIFIED_AS_CG.push({
        ...baseInfo,
        expectedProjectCode: expectedCodes[0],
        sheetInRiepilogo: expectedSheets[0],
        dbMatch: { source: 'cg', id: dbRow.id },
      });
    } else {
      // più sheet possibili → ambiguo
      results.ingresso.AMBIGUOUS.push({
        ...baseInfo,
        expectedProjectCodes: expectedCodes,
        sheets: expectedSheets,
        dbMatch: { source: 'cg', id: dbRow.id },
      });
    }
  } else {
    // è in fi/fc
    if (expectedCodes.length === 0) {
      // non previsto in RIEPILOGO → giusto essere su commessa? verifica solo che projectCode esista
      results.ingresso.OK_COMMESSA.push({ ...baseInfo, projectCode: dbRow.projectCode, source: dbRow.source });
    } else if (expectedCodes.length === 1) {
      if (dbRow.projectCode === expectedCodes[0]) {
        results.ingresso.OK_COMMESSA.push({ ...baseInfo, projectCode: dbRow.projectCode, source: dbRow.source });
      } else {
        results.ingresso.WRONG_COMMESSA.push({
          ...baseInfo,
          dbProjectCode: dbRow.projectCode,
          expectedProjectCode: expectedCodes[0],
          sheetInRiepilogo: expectedSheets[0],
          dbMatch: { source: dbRow.source, id: dbRow.id },
        });
      }
    } else {
      // più sheet possibili
      if (expectedCodes.includes(dbRow.projectCode)) {
        results.ingresso.OK_COMMESSA.push({ ...baseInfo, projectCode: dbRow.projectCode, source: dbRow.source });
      } else {
        results.ingresso.AMBIGUOUS.push({
          ...baseInfo,
          expectedProjectCodes: expectedCodes,
          sheets: expectedSheets,
          dbProjectCode: dbRow.projectCode,
          dbMatch: { source: dbRow.source, id: dbRow.id },
        });
      }
    }
  }
}

// ─── Cross-check emesse ───────────────────────────────────────────────
console.log('→ Cross-check fatture emesse...');

for (const r of emesseRows) {
  const rNormKey = { fornitore_norm: r.cliente_norm, imponibile: r.imponibile, data: r.data };
  const strictKey = `${r.cliente_norm}|${r.imponibile.toFixed(2)}|${r.data}`;
  const strictHits = (idxStrict.get(strictKey) || []).filter(h => h.source === 'fe');
  let hits = strictHits;
  let strength = strictHits.length > 0 ? 'strict' : null;
  if (hits.length === 0) {
    const looseKey = `${r.cliente_norm}|${r.imponibile.toFixed(2)}`;
    const looseHits = (idxLoose.get(looseKey) || []).filter(h => h.source === 'fe');
    hits = looseHits;
    strength = hits.length > 0 ? 'weak' : null;
  }
  const baseInfo = {
    data: r.data,
    nr: r.numero,
    cliente: r.cliente,
    piva: r.piva,
    saldato: r.saldato,
    cr: r.cr,
    oggetto: r.oggetto?.slice(0, 150),
    imponibile: r.imponibile,
  };
  if (hits.length === 0) {
    results.emesse.MISSING.push(baseInfo);
    continue;
  }
  if (hits.length > 1) {
    const distinct = new Set(hits.map(h => h.id));
    if (distinct.size > 1) {
      results.emesse.DUPLICATE_IN_DB.push({
        ...baseInfo,
        dbMatches: hits.map(h => ({ id: h.id, projectCode: h.projectCode, dataInDb: h.data, numeroInDb: h.numero })),
      });
      for (const h of hits) usedDbIds.add(h.id);
      continue;
    }
  }
  const dbRow = hits[0];
  usedDbIds.add(dbRow.id);
  if (strength === 'weak') {
    results.emesse.WEAK_MATCH.push({
      ...baseInfo,
      dbMatch: { id: dbRow.id, projectCode: dbRow.projectCode, dataInDb: dbRow.data, numeroInDb: dbRow.numero },
    });
  }
  results.emesse.OK_COMMESSA.push({ ...baseInfo, projectCode: dbRow.projectCode });
}

// ─── Riepilogo entries senza corrispondenza in FIC ────────────────────
console.log('→ Verifica RIEPILOGO senza match FIC...');
const fornImportoInFIC = new Set(
  ingressoUnique.map(r => `${r.fornitore_norm}|${r.imponibile.toFixed(2)}`)
);
for (const r of riepilogoRows) {
  const k = `${r.fornitore_norm}|${r.importoTot.toFixed(2)}`;
  if (!fornImportoInFIC.has(k)) {
    results.riepilogoSenzaMatch.push({
      sheet: r.sheet,
      fornitore: r.fornitore,
      importoTot: r.importoTot,
      descrizione: r.descrizione?.slice(0, 150),
      checkFattura: r.checkFattura,
    });
  }
}

// ─── Orfani DB (record in DB senza corrispondenza in Excel) ───────────
console.log('→ Verifica orfani DB...');
for (const row of dbRows) {
  if (usedDbIds.has(row.id)) continue;
  const info = {
    id: row.id,
    source: row.source,
    projectCode: row.projectCode,
    fornitore: row.fornitore,
    importoEur: row.importoEur,
    data: row.data,
    numero: row.numero,
    note: row.raw.note || null,
  };
  if (row.source === 'fi') results.orfaniInDb.ingresso.push(info);
  else if (row.source === 'fc') results.orfaniInDb.consulenti.push(info);
  else if (row.source === 'fe') results.orfaniInDb.emesse.push(info);
  else if (row.source === 'cg') results.orfaniInDb.costiGenerali.push(info);
}

// ─── Output ───────────────────────────────────────────────────────────
const summary = {
  runAt: new Date().toISOString(),
  currentDate: '2026-04-23',
  excelRows: {
    ingresso_raw: ingressoRows.length,
    ingresso_unique: ingressoUnique.length,
    ingresso_duplicati_in_excel: excelDuplicatesIngresso.length,
    emesse: emesseRows.length,
    riepilogo: riepilogoRows.length,
    riepilogo_sheets: [...new Set(riepilogoRows.map(r => r.sheet))],
  },
  dbRows: {
    fatture_ingresso: fi.length,
    fatture_emesse: fe.length,
    fatture_consulenti: fc.length,
    costi_generali: cg.length,
  },
  ingresso: Object.fromEntries(Object.entries(results.ingresso).map(([k, v]) => [k, v.length])),
  emesse: Object.fromEntries(Object.entries(results.emesse).map(([k, v]) => [k, v.length])),
  orfaniInDb: Object.fromEntries(Object.entries(results.orfaniInDb).map(([k, v]) => [k, v.length])),
  riepilogoSenzaMatch: results.riepilogoSenzaMatch.length,
};

const report = { summary, details: results };
fs.writeFileSync(path.join(DATA, '_audit-fatture-report.json'), JSON.stringify(report, null, 2), 'utf-8');

// ─── stdout summary ─────────────────────────────────────────────────
console.log('\n══════ RIEPILOGO AUDIT ══════\n');
console.log('Righe Excel:');
console.log(`  ingresso (raw):        ${summary.excelRows.ingresso_raw}`);
console.log(`  ingresso (uniche):     ${summary.excelRows.ingresso_unique}  (duplicati cross-export: ${summary.excelRows.ingresso_duplicati_in_excel})`);
console.log(`  emesse:                ${summary.excelRows.emesse}`);
console.log(`  riepilogo:             ${summary.excelRows.riepilogo}  (${summary.excelRows.riepilogo_sheets.length} sheet)`);

console.log('\nRighe DB:');
console.log(`  fatture-ingresso:      ${summary.dbRows.fatture_ingresso}`);
console.log(`  fatture-emesse:        ${summary.dbRows.fatture_emesse}`);
console.log(`  fatture-consulenti:    ${summary.dbRows.fatture_consulenti}`);
console.log(`  costi-generali:        ${summary.dbRows.costi_generali}`);

console.log('\nINGRESSO — classificazione righe Excel:');
for (const [k, v] of Object.entries(summary.ingresso)) {
  console.log(`  ${k.padEnd(22)} ${String(v).padStart(5)}`);
}

console.log('\nEMESSE — classificazione righe Excel:');
for (const [k, v] of Object.entries(summary.emesse)) {
  console.log(`  ${k.padEnd(22)} ${String(v).padStart(5)}`);
}

console.log('\nOrfani DB (non trovati in Excel):');
for (const [k, v] of Object.entries(summary.orfaniInDb)) {
  console.log(`  ${k.padEnd(22)} ${String(v).padStart(5)}`);
}

console.log(`\nRiepilogo ACQUISTI senza match FIC:  ${summary.riepilogoSenzaMatch}`);

function dump(title, list, fmt, limit = 10) {
  if (!list.length) return;
  console.log(`\n── ${title} (primi ${Math.min(limit, list.length)} di ${list.length}) ──`);
  for (const x of list.slice(0, limit)) console.log('  ' + fmt(x));
}

dump('INGRESSO MISSING', results.ingresso.MISSING, x =>
  `${x.data || '?'} | €${x.imponibile.toString().padStart(10)} | ${x.fornitore.slice(0, 30).padEnd(30)} | CC:${x.cc || '-'}`);

dump('INGRESSO MISCLASSIFIED_AS_CG', results.ingresso.MISCLASSIFIED_AS_CG, x =>
  `€${String(x.imponibile).padStart(10)} | ${x.fornitore.slice(0, 25).padEnd(25)} | cg → should be ${x.expectedProjectCode} (${x.sheetInRiepilogo})`);

dump('INGRESSO WRONG_COMMESSA', results.ingresso.WRONG_COMMESSA, x =>
  `€${String(x.imponibile).padStart(10)} | ${x.fornitore.slice(0, 25).padEnd(25)} | ${x.dbProjectCode} → should be ${x.expectedProjectCode}`);

dump('INGRESSO DUPLICATE_IN_DB', results.ingresso.DUPLICATE_IN_DB, x =>
  `€${String(x.imponibile).padStart(10)} | ${x.fornitore.slice(0, 25).padEnd(25)} | ${x.dbMatches.length} match`);

dump('INGRESSO AMBIGUOUS', results.ingresso.AMBIGUOUS, x =>
  `€${String(x.imponibile).padStart(10)} | ${x.fornitore.slice(0, 25).padEnd(25)} | sheets: ${x.sheets.join(',')}`);

dump('INGRESSO SHEET_UNMAPPED', results.ingresso.SHEET_UNMAPPED, x =>
  `€${String(x.imponibile).padStart(10)} | ${x.fornitore.slice(0, 25).padEnd(25)} | sheet: ${x.riepilogoSheets.join(',')}`);

dump('INGRESSO WEAK_MATCH (primi 5)', results.ingresso.WEAK_MATCH, x =>
  `${x.data || '?'} | €${String(x.imponibile).padStart(9)} | ${x.fornitore.slice(0, 25).padEnd(25)} | db data: ${x.dbMatch.dataInDb}`, 5);

dump('EMESSE MISSING', results.emesse.MISSING, x =>
  `${x.data} | nr ${x.nr} | €${x.imponibile} | ${x.cliente.slice(0, 40)}`);

dump('ORFANI DB ingresso (primi 5)', results.orfaniInDb.ingresso, x =>
  `€${String(x.importoEur).padStart(10)} | ${x.fornitore?.slice(0, 25).padEnd(25)} | ${x.projectCode}`, 5);

dump('ORFANI DB costi-generali (primi 5)', results.orfaniInDb.costiGenerali, x =>
  `€${String(x.importoEur).padStart(10)} | ${x.fornitore?.slice(0, 30).padEnd(30)} | ${x.data || '?'}`, 5);

dump('RIEPILOGO senza match FIC (primi 10)', results.riepilogoSenzaMatch, x =>
  `${x.sheet.slice(0, 22).padEnd(22)} | €${String(x.importoTot).padStart(10)} | ${x.fornitore.slice(0, 25).padEnd(25)} | checkFatt: ${x.checkFattura || '-'}`);

console.log('\n✅ Report completo: data/_audit-fatture-report.json');
