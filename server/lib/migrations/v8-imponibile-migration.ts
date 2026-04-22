/**
 * Migration v8 — Ricalcolo dati storici per schema "solo imponibile, no IVA".
 *
 * Legge i due file Excel export di Fatture in Cloud, matcha ogni record JSON
 * (fatture-ingresso, fatture-consulenti, costi-vivi, costi-generali
 * non-stipendi) con la riga corrispondente, e sovrascrive `importo` col
 * valore della colonna `Imponibile`.
 *
 * Modalità:
 *  - DRY-RUN (default): produce solo il report, NON scrive sul DB.
 *  - APPLY:  modifica i file .json e aggiorna _schema-version.json a v8.
 *
 * Uso da CLI:
 *   npx tsx server/lib/migrations/v8-imponibile-migration.ts          # dry-run
 *   npx tsx server/lib/migrations/v8-imponibile-migration.ts --apply  # commit
 */

import XLSX from 'xlsx';
const xlsxReadFile = XLSX.readFile.bind(XLSX);
const xlsxUtils = XLSX.utils;
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// Path di default (override con env vars se serve)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '..', '..', '..', 'data');
const EXCEL_DIR = process.env.EXCEL_DIR || 'C:/Users/tecni/Desktop/Codice/Dati';
const EXCEL_FILES = [
  'export 15-04-2026 08-46-51.xls',
  'export 16-04-2026 09-42-32.xls',
];

// ============================================================================
// Tipi
// ============================================================================
interface ExcelRow {
  source: string; // file di provenienza
  rowNum: number;
  data: Date | null;
  proxScadenza: Date | null;
  nrAcquisto: string;
  ftElettronica: string | null;
  dataRicezione: Date | null;
  centroCosto: string | null;
  categoria: string | null;
  fornitore: string;
  partitaIva: string | null;
  codiceFiscale: string | null;
  descrizione: string | null;
  imponibile: number; // EUR
  iva: number; // EUR
  ritAcconto: number;
  ritPrev: number;
  importatoInApp: string | null; // "NO" | "SI - <categoria>" | "SI - fatt_ingresso (CODE)" | ...
}

type MatchResult =
  // Totale Excel (imp+IVA) coincide col JSON → sovrascrivo con imponibile
  | { kind: 'matched'; imponibileEUR: number; row: ExcelRow; confidence: 'high' }
  // JSON ha già imponibile (non lordo): non tocco nulla ma registro il match
  | { kind: 'already_imponibile'; imponibileEUR: number; row: ExcelRow }
  // Candidati multipli dopo filtro — richiede intervento utente
  | { kind: 'ambiguous'; candidates: ExcelRow[] }
  // Nessun candidato trovato
  | { kind: 'unmatched' };

// ============================================================================
// Helpers Excel
// ============================================================================
function excelSerialToDate(n: unknown): Date | null {
  if (typeof n !== 'number' || !isFinite(n)) return null;
  // Excel serial date: day 1 = 1900-01-01. Excel bug: treats 1900 as leap year.
  // Per date dopo 1900-03-01 usiamo offset standard.
  const epoch = new Date(Date.UTC(1899, 11, 30));
  return new Date(epoch.getTime() + n * 86400000);
}

function loadExcel(filePath: string): ExcelRow[] {
  const wb = xlsxReadFile(filePath, { cellDates: false });
  const sh = wb.Sheets[wb.SheetNames[0]];
  const raw: unknown[][] = xlsxUtils.sheet_to_json(sh, { header: 1, defval: null });
  // Trova la riga header (contiene "Fornitore")
  let headerIdx = -1;
  for (let i = 0; i < raw.length; i++) {
    const r = raw[i];
    if (Array.isArray(r) && r.includes('Fornitore') && r.includes('Imponibile')) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx < 0) throw new Error(`Header non trovato in ${filePath}`);

  const out: ExcelRow[] = [];
  for (let i = headerIdx + 1; i < raw.length; i++) {
    const r = raw[i];
    if (!Array.isArray(r) || r[7] == null) continue; // salto righe vuote
    const fornitore = String(r[7] || '').trim();
    if (!fornitore) continue;
    out.push({
      source: path.basename(filePath),
      rowNum: i + 1,
      data: excelSerialToDate(r[0]),
      proxScadenza: excelSerialToDate(r[1]),
      nrAcquisto: r[2] != null ? String(r[2]).trim() : '',
      ftElettronica: r[3] != null ? String(r[3]) : null,
      dataRicezione: excelSerialToDate(r[4]),
      centroCosto: r[5] != null ? String(r[5]) : null,
      categoria: r[6] != null ? String(r[6]) : null,
      fornitore,
      partitaIva: r[8] != null ? String(r[8]) : null,
      codiceFiscale: r[9] != null ? String(r[9]) : null,
      descrizione: r[16] != null ? String(r[16]) : null,
      imponibile: typeof r[18] === 'number' ? r[18] : parseFloat(String(r[18] || 0)) || 0,
      iva: typeof r[19] === 'number' ? r[19] : parseFloat(String(r[19] || 0)) || 0,
      ritAcconto: typeof r[20] === 'number' ? r[20] : 0,
      ritPrev: typeof r[21] === 'number' ? r[21] : 0,
      importatoInApp: r[25] != null ? String(r[25]) : null,
    });
  }
  return out;
}

function dedupeExcelRows(rows: ExcelRow[]): ExcelRow[] {
  // Deduplico per (data ISO + nrAcquisto + fornitore + imponibile + iva).
  const seen = new Map<string, ExcelRow>();
  for (const r of rows) {
    const key = [
      r.data ? r.data.toISOString().slice(0, 10) : '',
      r.nrAcquisto,
      normFornitore(r.fornitore),
      r.imponibile.toFixed(2),
      r.iva.toFixed(2),
    ].join('|');
    if (!seen.has(key)) seen.set(key, r);
  }
  return Array.from(seen.values());
}

// ============================================================================
// Match helpers
// ============================================================================
function normFornitore(s: string): string {
  if (!s) return '';
  return s
    .toLowerCase()
    .replace(/s\.?\s*r\.?\s*l\.?(\s+unipersonale)?/gi, '')
    .replace(/s\.?\s*p\.?\s*a\.?/gi, '')
    .replace(/s\.?\s*n\.?\s*c\.?/gi, '')
    .replace(/\bdi\b/g, '')
    .replace(/[.,;:&()\/\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function daysBetween(a: Date | string | null | undefined, b: Date | string | null | undefined): number {
  if (!a || !b) return 9999;
  const da = typeof a === 'string' ? new Date(a) : a;
  const db = typeof b === 'string' ? new Date(b) : b;
  if (isNaN(da.getTime()) || isNaN(db.getTime())) return 9999;
  return Math.abs((da.getTime() - db.getTime()) / 86400000);
}

interface JsonRecord {
  kind: 'fattura_ingresso' | 'fattura_consulente' | 'costo_vivo' | 'costo_generale';
  id: string;
  importoEUR: number; // lordo (con IVA) in euro — già convertito da cents dove serve
  importoCents?: number; // se il record nativo è in cents
  fornitore: string;
  numeroFattura?: string;
  dataEmissione: string | null; // ISO date "YYYY-MM-DD"
  descrizione?: string;
  categoria?: string;
}

function matchRow(rec: JsonRecord, excel: ExcelRow[]): MatchResult {
  const totEUR = rec.importoEUR;

  // Filtri incrementali
  let candidates = excel;

  // 1) numeroFattura se presente (solo fatture)
  if (rec.numeroFattura) {
    const normNum = rec.numeroFattura.trim().toLowerCase();
    const byNumber = excel.filter(r => r.nrAcquisto && r.nrAcquisto.toLowerCase() === normNum);
    if (byNumber.length > 0) candidates = byNumber;
  }

  // 2) data entro ±10 giorni
  if (rec.dataEmissione) {
    const near = candidates.filter(r => daysBetween(r.data, rec.dataEmissione) <= 10);
    if (near.length > 0) candidates = near;
  }

  // 3) fornitore fuzzy
  const normFJ = normFornitore(rec.fornitore);
  if (normFJ) {
    const byForn = candidates.filter(r => {
      const nf = normFornitore(r.fornitore);
      return nf === normFJ || nf.includes(normFJ) || normFJ.includes(nf);
    });
    if (byForn.length > 0) candidates = byForn;
  }

  // 4) PRIMARIO: totale Excel (imp+IVA) coincide col JSON — JSON era lordo
  const byTotale = candidates.filter(r => Math.abs((r.imponibile + r.iva) - totEUR) < 0.02);
  if (byTotale.length === 1) {
    return { kind: 'matched', imponibileEUR: byTotale[0].imponibile, row: byTotale[0], confidence: 'high' };
  }
  if (byTotale.length > 1) {
    return { kind: 'ambiguous', candidates: byTotale };
  }

  // 5) SECONDARIO: imponibile Excel coincide col JSON — JSON era GIÀ imponibile
  const byImp = candidates.filter(r => Math.abs(r.imponibile - totEUR) < 0.02);
  if (byImp.length === 1) {
    return { kind: 'already_imponibile', imponibileEUR: byImp[0].imponibile, row: byImp[0] };
  }
  if (byImp.length > 1) {
    return { kind: 'ambiguous', candidates: byImp };
  }

  // 6) Fallback: candidati dopo filtri ma nessuno matcha importo → ambiguous
  if (candidates.length > 0 && candidates.length < excel.length) {
    return { kind: 'ambiguous', candidates };
  }
  return { kind: 'unmatched' };
}

// ============================================================================
// Carica record JSON
// ============================================================================
function loadJson(file: string): any[] {
  const p = path.join(DATA_DIR, file);
  if (!fs.existsSync(p)) return [];
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

function buildRecords(): JsonRecord[] {
  const out: JsonRecord[] = [];

  for (const f of loadJson('fatture-ingresso.json')) {
    out.push({
      kind: 'fattura_ingresso',
      id: f.id,
      importoEUR: f.importo / 100, // cents → eur
      importoCents: f.importo,
      fornitore: f.fornitore || '',
      numeroFattura: f.numeroFattura,
      dataEmissione: f.dataEmissione || null,
      descrizione: f.descrizione,
      categoria: f.categoria,
    });
  }

  for (const f of loadJson('fatture-consulenti.json')) {
    out.push({
      kind: 'fattura_consulente',
      id: f.id,
      importoEUR: f.importo, // già in EUR
      fornitore: f.consulente || '',
      numeroFattura: f.numeroFattura,
      dataEmissione: f.dataEmissione || null,
      descrizione: f.descrizione,
    });
  }

  for (const c of loadJson('costi-vivi.json')) {
    out.push({
      kind: 'costo_vivo',
      id: c.id,
      importoEUR: c.importo / 100, // cents → eur
      importoCents: c.importo,
      fornitore: c.fornitore || c.userName || c.descrizione || '',
      dataEmissione: c.data || null,
      descrizione: c.descrizione,
      categoria: c.tipologia,
    });
  }

  for (const c of loadJson('costi-generali.json')) {
    if (c.categoria === 'stipendi') continue; // gli stipendi non vanno ricalcolati
    out.push({
      kind: 'costo_generale',
      id: c.id,
      importoEUR: c.importo, // già in EUR
      fornitore: c.fornitore || '',
      dataEmissione: c.data || null,
      descrizione: c.descrizione,
      categoria: c.categoria,
    });
  }

  return out;
}

// ============================================================================
// Report
// ============================================================================
interface Report {
  summary: { total: number; matched: number; alreadyImponibile: number; ambiguous: number; unmatched: number };
  matched: Array<{ id: string; kind: string; fornitore: string; oldImportoEUR: number; newImponibileEUR: number; diff: number; excelRow: number; excelSource: string }>;
  alreadyImponibile: Array<{ id: string; kind: string; fornitore: string; importoEUR: number; excelRow: number; excelSource: string }>;
  ambiguous: Array<{ id: string; kind: string; fornitore: string; dataEmissione: string | null; importoEUR: number; candidates: Array<{ source: string; row: number; fornitore: string; imponibile: number; iva: number; data: string | null }> }>;
  unmatched: Array<{ id: string; kind: string; fornitore: string; dataEmissione: string | null; importoEUR: number; numeroFattura?: string }>;
}

function run(apply: boolean): Report {
  // Carica Excel
  console.log('[v8] Carico Excel...');
  const allRows: ExcelRow[] = [];
  for (const f of EXCEL_FILES) {
    const full = path.join(EXCEL_DIR, f);
    if (!fs.existsSync(full)) {
      console.warn(`[v8] WARN file Excel non trovato: ${full}`);
      continue;
    }
    const rows = loadExcel(full);
    console.log(`[v8]   ${f}: ${rows.length} righe`);
    allRows.push(...rows);
  }
  const excel = dedupeExcelRows(allRows);
  console.log(`[v8] Totale righe Excel dedotte: ${excel.length}`);

  // Carica JSON
  const records = buildRecords();
  console.log(`[v8] Totale record JSON da migrare: ${records.length}`);

  const report: Report = {
    summary: { total: records.length, matched: 0, alreadyImponibile: 0, ambiguous: 0, unmatched: 0 },
    matched: [],
    alreadyImponibile: [],
    ambiguous: [],
    unmatched: [],
  };

  for (const rec of records) {
    const m = matchRow(rec, excel);
    if (m.kind === 'matched') {
      report.summary.matched++;
      report.matched.push({
        id: rec.id,
        kind: rec.kind,
        fornitore: rec.fornitore,
        oldImportoEUR: rec.importoEUR,
        newImponibileEUR: m.imponibileEUR,
        diff: rec.importoEUR - m.imponibileEUR,
        excelRow: m.row.rowNum,
        excelSource: m.row.source,
      });
    } else if (m.kind === 'already_imponibile') {
      report.summary.alreadyImponibile++;
      report.alreadyImponibile.push({
        id: rec.id,
        kind: rec.kind,
        fornitore: rec.fornitore,
        importoEUR: rec.importoEUR,
        excelRow: m.row.rowNum,
        excelSource: m.row.source,
      });
    } else if (m.kind === 'ambiguous') {
      report.summary.ambiguous++;
      report.ambiguous.push({
        id: rec.id,
        kind: rec.kind,
        fornitore: rec.fornitore,
        dataEmissione: rec.dataEmissione,
        importoEUR: rec.importoEUR,
        candidates: m.candidates.slice(0, 5).map(c => ({
          source: c.source,
          row: c.rowNum,
          fornitore: c.fornitore,
          imponibile: c.imponibile,
          iva: c.iva,
          data: c.data ? c.data.toISOString().slice(0, 10) : null,
        })),
      });
    } else {
      report.summary.unmatched++;
      report.unmatched.push({
        id: rec.id,
        kind: rec.kind,
        fornitore: rec.fornitore,
        dataEmissione: rec.dataEmissione,
        importoEUR: rec.importoEUR,
        numeroFattura: rec.numeroFattura,
      });
    }
  }

  // Scrivi report
  const reportPath = path.join(DATA_DIR, '_migration-v8-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8');
  console.log(`[v8] Report scritto in ${reportPath}`);
  console.log('[v8] SUMMARY:', report.summary);

  if (!apply) {
    console.log('[v8] DRY-RUN — nessuna modifica applicata. Usa --apply per scrivere sul DB.');
    return report;
  }

  // APPLY: backup + scrittura
  const backupDir = path.join(DATA_DIR, '_backup-pre-v8');
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
  for (const f of ['fatture-ingresso.json', 'fatture-consulenti.json', 'costi-vivi.json', 'costi-generali.json']) {
    const src = path.join(DATA_DIR, f);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(backupDir, f));
  }
  console.log(`[v8] Backup in ${backupDir}`);

  const matchedById = new Map(report.matched.map(m => [m.id, m]));
  for (const file of ['fatture-ingresso.json', 'fatture-consulenti.json', 'costi-vivi.json', 'costi-generali.json']) {
    const fpath = path.join(DATA_DIR, file);
    if (!fs.existsSync(fpath)) continue;
    const arr: any[] = JSON.parse(fs.readFileSync(fpath, 'utf-8'));
    let changed = 0;
    for (const r of arr) {
      const m = matchedById.get(r.id);
      if (!m) continue;
      const newEUR = m.newImponibileEUR;
      if (file === 'fatture-ingresso.json' || file === 'costi-vivi.json') {
        // importo in cents
        r.importo = Math.round(newEUR * 100);
      } else {
        r.importo = Math.round(newEUR * 100) / 100; // EUR con 2 decimali
      }
      changed++;
    }
    if (changed > 0) {
      fs.writeFileSync(fpath, JSON.stringify(arr, null, 2), 'utf-8');
      console.log(`[v8] ${file}: aggiornati ${changed} record`);
    }
  }

  // Rimuovi importoIVA/importoTotale da fatture-emesse
  const emesseP = path.join(DATA_DIR, 'fatture-emesse.json');
  if (fs.existsSync(emesseP)) {
    const arr: any[] = JSON.parse(fs.readFileSync(emesseP, 'utf-8'));
    let cleaned = 0;
    for (const r of arr) {
      if ('importoIVA' in r) { delete r.importoIVA; cleaned++; }
      if ('importoTotale' in r) { delete r.importoTotale; cleaned++; }
    }
    if (cleaned > 0) {
      fs.writeFileSync(emesseP, JSON.stringify(arr, null, 2), 'utf-8');
      console.log(`[v8] fatture-emesse.json: puliti ${cleaned} campi legacy`);
    }
  }

  // Aggiorna schema-version
  const svPath = path.join(DATA_DIR, '_schema-version.json');
  fs.writeFileSync(svPath, JSON.stringify({
    version: 8,
    lastMigration: new Date().toISOString(),
    history: [{ to: 8, at: new Date().toISOString() }],
  }, null, 2), 'utf-8');
  console.log('[v8] _schema-version.json aggiornato a 8');

  return report;
}

// Entry point CLI
const apply = process.argv.includes('--apply');
run(apply);
