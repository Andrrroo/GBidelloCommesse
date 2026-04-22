/**
 * Migration v9 — Import nuove fatture da export aggiuntivo Fatture in Cloud
 * e ri-match dei 96 record pending della v8.
 *
 * Step:
 *  1. Carica 3 file Excel FIC (15, 16, 22 aprile) + dedup per (nrAcquisto +
 *     fornitore + imponibile + iva).
 *  2. Per ogni record JSON esistente: re-match contro archivio esteso.
 *     I 96 pending che ora trovano match univoco vengono convertiti
 *     (lordo → imponibile).
 *  3. Le righe Excel che NON matchano nessun record JSON sono nuove
 *     fatture da importare. Le classifico via mapping del Centro Costo
 *     (col[5]) al kind/categoria JSON. Creo nuovi record con projectId
 *     placeholder "DA-ASSEGNARE" (creo la commessa placeholder se assente).
 *
 * Modalità:
 *   DRY-RUN (default): produce report JSON, NON scrive sul DB.
 *   APPLY:  modifica i file .json, crea backup, bump schema a v9.
 *
 * Uso CLI:
 *   npx tsx server/lib/migrations/v9-import-new-invoices.ts          # dry-run
 *   npx tsx server/lib/migrations/v9-import-new-invoices.ts --apply  # commit
 */

import XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { fileURLToPath } from 'url';

const xlsxReadFile = XLSX.readFile.bind(XLSX);
const xlsxUtils = XLSX.utils;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '..', '..', '..', 'data');
const EXCEL_DIR = process.env.EXCEL_DIR || 'C:/Users/tecni/Desktop/Codice/Dati';
const EXCEL_FILES = [
  'export 15-04-2026 08-46-51.xls',
  'export 16-04-2026 09-42-32.xls',
  'export 22-04-2026 16-10-28.xls',
];

// ============================================================================
// Types
// ============================================================================
interface ExcelRow {
  source: string;
  rowNum: number;
  data: Date | null;
  nrAcquisto: string;
  centroCosto: string | null;
  fornitore: string;
  pIva: string | null;
  descrizione: string | null;
  imponibile: number;
  iva: number;
}

interface JsonRecord {
  kind: 'fattura_ingresso' | 'fattura_consulente' | 'costo_vivo' | 'costo_generale';
  id: string;
  importoEUR: number;
  fornitore: string;
  numeroFattura?: string;
  dataEmissione: string | null;
}

// ============================================================================
// Excel helpers
// ============================================================================
function excelSerialToDate(n: unknown): Date | null {
  if (typeof n !== 'number' || !isFinite(n)) return null;
  const epoch = new Date(Date.UTC(1899, 11, 30));
  return new Date(epoch.getTime() + n * 86400000);
}

function loadExcel(filePath: string): ExcelRow[] {
  const wb = xlsxReadFile(filePath);
  const sh = wb.Sheets[wb.SheetNames[0]];
  const raw: unknown[][] = xlsxUtils.sheet_to_json(sh, { header: 1, defval: null });
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
    if (!Array.isArray(r) || r[7] == null) continue;
    const fornitore = String(r[7] || '').trim();
    if (!fornitore) continue;
    out.push({
      source: path.basename(filePath),
      rowNum: i + 1,
      data: excelSerialToDate(r[0]),
      nrAcquisto: r[2] != null ? String(r[2]).trim() : '',
      centroCosto: r[5] != null ? String(r[5]).trim() : null,
      fornitore,
      pIva: r[8] != null ? String(r[8]) : null,
      descrizione: r[16] != null ? String(r[16]) : null,
      imponibile: typeof r[18] === 'number' ? r[18] : parseFloat(String(r[18] || 0)) || 0,
      iva: typeof r[19] === 'number' ? r[19] : parseFloat(String(r[19] || 0)) || 0,
    });
  }
  return out;
}

function dedupeExcel(rows: ExcelRow[]): ExcelRow[] {
  const seen = new Map<string, ExcelRow>();
  for (const r of rows) {
    const key = [
      r.nrAcquisto,
      r.fornitore.toLowerCase(),
      r.imponibile.toFixed(2),
      r.iva.toFixed(2),
    ].join('|');
    if (!seen.has(key)) seen.set(key, r);
  }
  return Array.from(seen.values());
}

// ============================================================================
// Mapping centro costo → kind JSON
// ============================================================================
type KindCategoria = { kind: 'fattura_ingresso' | 'fattura_consulente' | 'costo_vivo' | 'costo_generale' | 'skip'; categoria?: string; tipologia?: string };

function mapCentroCosto(cc: string | null): KindCategoria {
  if (!cc) return { kind: 'fattura_ingresso', categoria: 'altro' };
  const s = cc.toUpperCase();
  if (/BENZINA|CARBURANTE/i.test(s)) return { kind: 'costo_vivo', tipologia: 'carburante' };
  if (/TRENI|AEREI/i.test(s)) return { kind: 'costo_vivo', tipologia: 'viaggio' };
  if (/RISTORANTI|TICKET RESTAURANT/i.test(s)) return { kind: 'costo_vivo', tipologia: 'vitto' };
  if (/PARCHEGGIO/i.test(s)) return { kind: 'costo_vivo', tipologia: 'parcheggio' };
  if (/TELEPASS/i.test(s) || /^AUTO$/i.test(s)) return { kind: 'costo_vivo', tipologia: 'autostrada' };
  if (/TELEFONIA/i.test(s)) return { kind: 'costo_generale', categoria: 'internet_dati' };
  if (/^ENEL$/i.test(s)) return { kind: 'costo_generale', categoria: 'energia' };
  if (/CANONI PEC|SOFTWARE.*ABBONAMENT/i.test(s)) return { kind: 'costo_generale', categoria: 'abbonamento' };
  if (/AMAZON/i.test(s)) return { kind: 'costo_generale', categoria: 'altro' };
  if (/COLLABORAZIONI ESTERNE|CONSULENTI/i.test(s)) return { kind: 'fattura_consulente' };
  if (/MANUTENZION|LAVORI/i.test(s)) return { kind: 'fattura_ingresso', categoria: 'materiali' };
  if (/STIPEND/i.test(s)) return { kind: 'skip' }; // gestiti via PDF
  return { kind: 'fattura_ingresso', categoria: 'altro' };
}

// ============================================================================
// Match helpers (stesso algoritmo v8)
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

function daysBetween(a: Date | string | null, b: Date | string | null): number {
  if (!a || !b) return 9999;
  const da = typeof a === 'string' ? new Date(a) : a;
  const db = typeof b === 'string' ? new Date(b) : b;
  if (isNaN(da.getTime()) || isNaN(db.getTime())) return 9999;
  return Math.abs((da.getTime() - db.getTime()) / 86400000);
}

type MatchResult =
  | { kind: 'matched'; imponibileEUR: number; row: ExcelRow }
  | { kind: 'already_imponibile'; row: ExcelRow }
  | { kind: 'ambiguous'; candidates: ExcelRow[] }
  | { kind: 'unmatched' };

function matchRecord(rec: JsonRecord, excel: ExcelRow[]): MatchResult {
  let candidates = excel;

  if (rec.numeroFattura) {
    const normNum = rec.numeroFattura.trim().toLowerCase();
    const byNumber = excel.filter(r => r.nrAcquisto && r.nrAcquisto.toLowerCase() === normNum);
    if (byNumber.length > 0) candidates = byNumber;
  }

  if (rec.dataEmissione) {
    const near = candidates.filter(r => daysBetween(r.data, rec.dataEmissione) <= 10);
    if (near.length > 0) candidates = near;
  }

  const normFJ = normFornitore(rec.fornitore);
  if (normFJ) {
    const byForn = candidates.filter(r => {
      const nf = normFornitore(r.fornitore);
      return nf === normFJ || nf.includes(normFJ) || normFJ.includes(nf);
    });
    if (byForn.length > 0) candidates = byForn;
  }

  const byTot = candidates.filter(r => Math.abs((r.imponibile + r.iva) - rec.importoEUR) < 0.02);
  if (byTot.length === 1) return { kind: 'matched', imponibileEUR: byTot[0].imponibile, row: byTot[0] };
  if (byTot.length > 1) return { kind: 'ambiguous', candidates: byTot };

  const byImp = candidates.filter(r => Math.abs(r.imponibile - rec.importoEUR) < 0.02);
  if (byImp.length === 1) return { kind: 'already_imponibile', row: byImp[0] };
  if (byImp.length > 1) return { kind: 'ambiguous', candidates: byImp };

  if (candidates.length > 0 && candidates.length < excel.length) {
    return { kind: 'ambiguous', candidates };
  }
  return { kind: 'unmatched' };
}

// ============================================================================
// JSON helpers
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
      kind: 'fattura_ingresso', id: f.id, importoEUR: f.importo / 100,
      fornitore: f.fornitore || '', numeroFattura: f.numeroFattura,
      dataEmissione: f.dataEmissione || null,
    });
  }
  for (const f of loadJson('fatture-consulenti.json')) {
    out.push({
      kind: 'fattura_consulente', id: f.id, importoEUR: f.importo,
      fornitore: f.consulente || '', numeroFattura: f.numeroFattura,
      dataEmissione: f.dataEmissione || null,
    });
  }
  for (const c of loadJson('costi-vivi.json')) {
    out.push({
      kind: 'costo_vivo', id: c.id, importoEUR: c.importo / 100,
      fornitore: c.fornitore || c.userName || c.descrizione || '',
      dataEmissione: c.data || null,
    });
  }
  for (const c of loadJson('costi-generali.json')) {
    if (c.categoria === 'stipendi') continue;
    out.push({
      kind: 'costo_generale', id: c.id, importoEUR: c.importo,
      fornitore: c.fornitore || '',
      dataEmissione: c.data || null,
    });
  }
  return out;
}

// ============================================================================
// Main
// ============================================================================
interface Report {
  summary: {
    excelRowsUnique: number;
    jsonRecords: number;
    matchedTotal: number;
    alreadyImponibile: number;
    stillAmbiguous: number;
    stillUnmatched: number;
    pendingResolvedNow: number;
    orphanExcelRows: number;
    newRecordsToCreate: Record<string, number>; // kind → count
  };
  pendingResolved: Array<{ id: string; kind: string; fornitore: string; oldImporto: number; newImponibile: number }>;
  newRecords: Array<{ excelSource: string; excelRow: number; nrAcquisto: string; fornitore: string; centroCosto: string | null; imponibile: number; iva: number; data: string | null; mappedKind: string; mappedCategoria?: string; mappedTipologia?: string }>;
  stillPending: Array<{ id: string; kind: string; fornitore: string; dataEmissione: string | null; importoEUR: number }>;
}

async function run(apply: boolean): Promise<Report> {
  // 1. Carica Excel
  console.log('[v9] Carico Excel (3 file)...');
  const allRows: ExcelRow[] = [];
  for (const f of EXCEL_FILES) {
    const full = path.join(EXCEL_DIR, f);
    if (!fs.existsSync(full)) {
      console.warn(`[v9] WARN file Excel non trovato: ${full}`);
      continue;
    }
    const rows = loadExcel(full);
    console.log(`[v9]   ${f}: ${rows.length} righe`);
    allRows.push(...rows);
  }
  const excel = dedupeExcel(allRows);
  console.log(`[v9] Totale righe Excel uniche: ${excel.length}`);

  // 2. Carica JSON
  const records = buildRecords();
  console.log(`[v9] Totale record JSON da re-matchare: ${records.length}`);

  // 3. Per ogni record JSON, cerco match
  const matchedExcelKeys = new Set<string>();
  const excelKey = (r: ExcelRow) => `${r.source}|${r.rowNum}`;

  const pendingResolved: Report['pendingResolved'] = [];
  const stillPending: Report['stillPending'] = [];
  let matchedTotal = 0;
  let alreadyImponibile = 0;
  let stillAmbiguous = 0;
  let stillUnmatched = 0;

  // Per identificare i 96 "pending v8", non abbiamo il flag — ma possiamo
  // desumere: un record JSON il cui match attuale è "matched" (total) e
  // l'importo JSON è uguale a quell'imponibile = già converted.
  // Semplifichiamo: per ogni record, ri-eseguiamo il match. I record già
  // convertiti in v8 ora saranno 'already_imponibile'; quelli pending di v8
  // saranno 'matched' (se il nuovo Excel aiuta) o di nuovo ambiguous.

  // Caricare file JSON per scrivere i cambi
  const fileMap: Record<string, { path: string; items: any[]; inCents: boolean }> = {
    fattura_ingresso: { path: path.join(DATA_DIR, 'fatture-ingresso.json'), items: loadJson('fatture-ingresso.json'), inCents: true },
    fattura_consulente: { path: path.join(DATA_DIR, 'fatture-consulenti.json'), items: loadJson('fatture-consulenti.json'), inCents: false },
    costo_vivo: { path: path.join(DATA_DIR, 'costi-vivi.json'), items: loadJson('costi-vivi.json'), inCents: true },
    costo_generale: { path: path.join(DATA_DIR, 'costi-generali.json'), items: loadJson('costi-generali.json'), inCents: false },
  };

  for (const rec of records) {
    const m = matchRecord(rec, excel);
    if (m.kind === 'matched') {
      matchedTotal++;
      matchedExcelKeys.add(excelKey(m.row));
      // Se l'importo attuale != imponibile, è un pending risolto ora
      if (Math.abs(rec.importoEUR - m.imponibileEUR) > 0.02) {
        pendingResolved.push({
          id: rec.id,
          kind: rec.kind,
          fornitore: rec.fornitore,
          oldImporto: rec.importoEUR,
          newImponibile: m.imponibileEUR,
        });
        // Applica il cambio in memoria
        const bucket = fileMap[rec.kind];
        if (bucket) {
          const target = bucket.items.find((x: any) => x.id === rec.id);
          if (target) {
            target.importo = bucket.inCents ? Math.round(m.imponibileEUR * 100) : Math.round(m.imponibileEUR * 100) / 100;
          }
        }
      }
    } else if (m.kind === 'already_imponibile') {
      alreadyImponibile++;
      matchedExcelKeys.add(excelKey(m.row));
    } else if (m.kind === 'ambiguous') {
      stillAmbiguous++;
      stillPending.push({ id: rec.id, kind: rec.kind, fornitore: rec.fornitore, dataEmissione: rec.dataEmissione, importoEUR: rec.importoEUR });
      for (const c of m.candidates) matchedExcelKeys.add(excelKey(c));
    } else {
      stillUnmatched++;
      stillPending.push({ id: rec.id, kind: rec.kind, fornitore: rec.fornitore, dataEmissione: rec.dataEmissione, importoEUR: rec.importoEUR });
    }
  }

  // 4. Righe Excel orfane = non matched da alcun record JSON
  const orphans = excel.filter(r => !matchedExcelKeys.has(excelKey(r)));
  console.log(`[v9] Match JSON: ${matchedTotal} con conversion, ${alreadyImponibile} già imponibili, ${stillAmbiguous} ambigui, ${stillUnmatched} unmatched. Pending risolti ORA: ${pendingResolved.length}`);
  console.log(`[v9] Righe Excel orfane (nessun match JSON): ${orphans.length}`);

  // 5. Classifica orfane → nuovi record
  const newRecords: Report['newRecords'] = [];
  const newByKind: Record<string, number> = {};
  const projects = loadJson('projects.json');
  let placeholderProjectId: string | null = null;
  function ensurePlaceholder(): string {
    if (placeholderProjectId) return placeholderProjectId;
    const existing = projects.find((p: any) => p.code === 'DA-ASSEGNARE');
    if (existing) {
      placeholderProjectId = existing.id;
      return existing.id;
    }
    placeholderProjectId = randomUUID();
    projects.push({
      id: placeholderProjectId,
      code: 'DA-ASSEGNARE',
      client: 'Da assegnare',
      city: '—',
      object: 'Placeholder per fatture/costi importati da FIC senza commessa',
      year: new Date().getFullYear(),
      template: 'BREVE',
      status: 'sospesa',
      tipoRapporto: 'diretto',
      tipoIntervento: 'professionale',
      manutenzione: false,
      createdAt: new Date().toISOString(),
    });
    return placeholderProjectId;
  }

  for (const r of orphans) {
    const m = mapCentroCosto(r.centroCosto);
    if (m.kind === 'skip') continue;
    newByKind[m.kind] = (newByKind[m.kind] || 0) + 1;
    const dataIso = r.data ? r.data.toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
    newRecords.push({
      excelSource: r.source,
      excelRow: r.rowNum,
      nrAcquisto: r.nrAcquisto,
      fornitore: r.fornitore,
      centroCosto: r.centroCosto,
      imponibile: r.imponibile,
      iva: r.iva,
      data: dataIso,
      mappedKind: m.kind,
      mappedCategoria: m.categoria,
      mappedTipologia: m.tipologia,
    });

    if (apply) {
      const descrSafe = (r.descrizione && r.descrizione.length > 0 ? r.descrizione : `Import FIC ${r.nrAcquisto}`).slice(0, 500);
      const note = `Import da Fatture in Cloud (${r.source}, riga ${r.rowNum})`;
      if (m.kind === 'fattura_ingresso') {
        fileMap.fattura_ingresso.items.push({
          id: randomUUID(),
          projectId: ensurePlaceholder(),
          numeroFattura: r.nrAcquisto || `FIC-${randomUUID().slice(0, 8)}`,
          fornitore: r.fornitore,
          dataEmissione: dataIso,
          dataScadenzaPagamento: dataIso, // placeholder = dataEmissione
          importo: Math.round(r.imponibile * 100), // cents
          categoria: m.categoria || 'altro',
          descrizione: descrSafe,
          pagata: false,
          note,
        });
      } else if (m.kind === 'fattura_consulente') {
        fileMap.fattura_consulente.items.push({
          id: randomUUID(),
          projectId: ensurePlaceholder(),
          numeroFattura: r.nrAcquisto || `FIC-${randomUUID().slice(0, 8)}`,
          consulente: r.fornitore,
          dataEmissione: dataIso,
          dataScadenzaPagamento: dataIso,
          importo: r.imponibile, // euro
          descrizione: descrSafe,
          pagata: false,
          note,
        });
      } else if (m.kind === 'costo_vivo') {
        fileMap.costo_vivo.items.push({
          id: randomUUID(),
          projectId: ensurePlaceholder(),
          tipologia: m.tipologia || 'altro',
          data: dataIso,
          importo: Math.round(r.imponibile * 100), // cents
          descrizione: `${r.fornitore} — ${descrSafe}`.slice(0, 500),
          note,
        });
      } else if (m.kind === 'costo_generale') {
        fileMap.costo_generale.items.push({
          id: randomUUID(),
          categoria: m.categoria || 'altro',
          fornitore: r.fornitore,
          descrizione: descrSafe,
          data: dataIso,
          importo: r.imponibile, // euro
          pagato: false,
          note,
        });
      }
    }
  }

  // 6. Report
  const report: Report = {
    summary: {
      excelRowsUnique: excel.length,
      jsonRecords: records.length,
      matchedTotal,
      alreadyImponibile,
      stillAmbiguous,
      stillUnmatched,
      pendingResolvedNow: pendingResolved.length,
      orphanExcelRows: orphans.length,
      newRecordsToCreate: newByKind,
    },
    pendingResolved,
    newRecords,
    stillPending,
  };
  const reportPath = path.join(DATA_DIR, '_migration-v9-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8');
  console.log(`[v9] Report scritto: ${reportPath}`);
  console.log('[v9] SUMMARY:', report.summary);

  if (!apply) {
    console.log('[v9] DRY-RUN — nessun file modificato. Usa --apply per scrivere.');
    return report;
  }

  // 7. Backup + scrittura
  const backupDir = path.join(DATA_DIR, '_backup-pre-v9');
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
  for (const f of ['fatture-ingresso.json', 'fatture-consulenti.json', 'costi-vivi.json', 'costi-generali.json', 'projects.json']) {
    const src = path.join(DATA_DIR, f);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(backupDir, f));
  }
  console.log(`[v9] Backup in ${backupDir}`);

  // Scrivi JSON aggiornati
  fs.writeFileSync(fileMap.fattura_ingresso.path, JSON.stringify(fileMap.fattura_ingresso.items, null, 2), 'utf-8');
  fs.writeFileSync(fileMap.fattura_consulente.path, JSON.stringify(fileMap.fattura_consulente.items, null, 2), 'utf-8');
  fs.writeFileSync(fileMap.costo_vivo.path, JSON.stringify(fileMap.costo_vivo.items, null, 2), 'utf-8');
  fs.writeFileSync(fileMap.costo_generale.path, JSON.stringify(fileMap.costo_generale.items, null, 2), 'utf-8');
  if (placeholderProjectId) {
    fs.writeFileSync(path.join(DATA_DIR, 'projects.json'), JSON.stringify(projects, null, 2), 'utf-8');
    console.log(`[v9] Commessa placeholder DA-ASSEGNARE creata (id: ${placeholderProjectId})`);
  }

  // Bump schema version a 9
  const svPath = path.join(DATA_DIR, '_schema-version.json');
  const prevMeta = fs.existsSync(svPath) ? JSON.parse(fs.readFileSync(svPath, 'utf-8')) : { version: 8, history: [] };
  const newMeta = {
    version: 9,
    lastMigration: new Date().toISOString(),
    history: [...(prevMeta.history || []), { to: 9, at: new Date().toISOString() }],
  };
  fs.writeFileSync(svPath, JSON.stringify(newMeta, null, 2), 'utf-8');
  console.log('[v9] _schema-version.json aggiornato a 9');

  return report;
}

// Entry point
const apply = process.argv.includes('--apply');
run(apply).catch((e) => {
  console.error('[v9] FATAL:', e);
  process.exit(1);
});
