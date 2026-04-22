/**
 * Migration v10 — Assegna automaticamente le commesse ai 166 record importati
 * dal v9 (finora assegnati alla commessa placeholder DA-ASSEGNARE).
 *
 * Strategia:
 *  1. Carico projects, clients, i 4 JSON files, e il report v9 (che ha per
 *     ogni record il centroCosto originale dall'Excel).
 *  2. Per ogni commessa REALE (non DA-ASSEGNARE), estraggo keyword dal
 *     code+client+object.
 *  3. Per ogni record con projectId = DA-ASSEGNARE id, cerco match:
 *     - Estraggo centroCosto dal report (match via fornitore+importo+data)
 *     - Conto le keyword che matchano il centroCosto
 *     - Se match univoco (1 commessa domina) → riassegno
 *  4. I record residui (spese aziendali generiche come BENZINA, TELEFONIA,
 *     ENEL, TRENI) vengono riassegnati a una commessa "GBIDELLO-INT-2026"
 *     creata trasformando DA-ASSEGNARE (mi limito a rinominare code/client/
 *     object; l'id resta uguale così preservo i riferimenti già scritti).
 *     Creo anche il cliente "GBIDELLO ENGINEERING & PARTNERS S.R.L." se
 *     non esiste.
 *
 * Modalità:
 *   DRY-RUN (default): report JSON senza scrivere
 *   APPLY:  scrive + backup + bump schema a 10
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

// Keyword per ogni commessa: parole distintive del code+client+object che
// fanno match sul Centro Costo FIC. Mappa fissa per evitare falsi positivi
// di keyword troppo generiche (es. "LAVORI", "MANUTENZIONE").
const PROJECT_KEYWORDS: Record<string, string[]> = {
  'SEWE-CAR-2501': ['SEW', 'CARINARO', 'EURODRIVE'],
  'PONT-NAP-2601': ['SEMINARIO', 'PONTIFICIO'],
  'PROV-ROM-2601': ['ASTALLI', 'AUTORIMESSA'],
  'INVE-NAP-2501': ['FERRARIS', 'INPS'],
  'INVE-PER-2501': ['ANGELONI', 'PERUGIA'],
  'MASS-ROM-2601': ['MASSIMO', 'MASSIMILIANO', 'LABORATORIO', 'CHIMICA'],
  'PONT-NAP-2602': ['PONTANO'],
};

// ============================================================================
// Excel helpers (stesso pattern di v9)
// ============================================================================
interface ExcelRow {
  source: string;
  data: Date | null;
  nrAcquisto: string;
  centroCosto: string | null;
  fornitore: string;
  imponibile: number;
  iva: number;
}

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
    if (Array.isArray(raw[i]) && (raw[i] as any[]).includes('Fornitore') && (raw[i] as any[]).includes('Imponibile')) {
      headerIdx = i; break;
    }
  }
  const out: ExcelRow[] = [];
  for (let i = headerIdx + 1; i < raw.length; i++) {
    const r = raw[i];
    if (!Array.isArray(r) || r[7] == null) continue;
    const fornitore = String(r[7] || '').trim();
    if (!fornitore) continue;
    out.push({
      source: path.basename(filePath),
      data: excelSerialToDate(r[0]),
      nrAcquisto: r[2] != null ? String(r[2]).trim() : '',
      centroCosto: r[5] != null ? String(r[5]).trim() : null,
      fornitore,
      imponibile: typeof r[18] === 'number' ? r[18] : parseFloat(String(r[18] || 0)) || 0,
      iva: typeof r[19] === 'number' ? r[19] : parseFloat(String(r[19] || 0)) || 0,
    });
  }
  return out;
}

// ============================================================================
// Matching helpers
// ============================================================================
function matchProjectCodeFromCentroCosto(cc: string | null): string | null {
  if (!cc) return null;
  const upper = cc.toUpperCase();
  // Ritorna il code con più keyword matched
  let bestCode: string | null = null;
  let bestScore = 0;
  for (const [code, keywords] of Object.entries(PROJECT_KEYWORDS)) {
    const score = keywords.reduce((s, k) => s + (upper.includes(k) ? 1 : 0), 0);
    if (score > bestScore) {
      bestScore = score;
      bestCode = code;
    }
  }
  return bestScore > 0 ? bestCode : null;
}

function normFornitore(s: string): string {
  if (!s) return '';
  return s.toLowerCase()
    .replace(/s\.?\s*r\.?\s*l\.?(\s+unipersonale)?/gi, '')
    .replace(/s\.?\s*p\.?\s*a\.?/gi, '')
    .replace(/[.,;:&()\/\\]/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

// ============================================================================
// Main
// ============================================================================
interface Report {
  summary: {
    totalWithPlaceholder: number;
    reassignedAutomatic: Record<string, number>; // code → count
    remainsInternal: number;
    perKindAutomatic: Record<string, number>;
  };
  assignments: Array<{ id: string; kind: string; fornitore: string; centroCosto: string | null; oldProjectCode: string; newProjectCode: string }>;
}

async function run(apply: boolean): Promise<Report> {
  // Carica Excel per mapping nrAcquisto+fornitore+imponibile → centroCosto
  console.log('[v10] Carico Excel...');
  const allExcel: ExcelRow[] = [];
  for (const f of EXCEL_FILES) {
    const full = path.join(EXCEL_DIR, f);
    if (fs.existsSync(full)) allExcel.push(...loadExcel(full));
  }
  // Index per lookup veloce: key = fornitore_norm + imponibile + data_iso
  const excelIdx = new Map<string, ExcelRow[]>();
  for (const r of allExcel) {
    const k = normFornitore(r.fornitore) + '|' + r.imponibile.toFixed(2);
    const arr = excelIdx.get(k) || [];
    arr.push(r);
    excelIdx.set(k, arr);
  }
  console.log('[v10] Excel loaded:', allExcel.length, 'rows, indexed by fornitore+imp');

  // Carica JSON
  const projects: any[] = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'projects.json'), 'utf-8'));
  const clients: any[] = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'clients.json'), 'utf-8'));
  const placeholder = projects.find(p => p.code === 'DA-ASSEGNARE');
  if (!placeholder) {
    console.log('[v10] Nessuna commessa DA-ASSEGNARE — niente da fare.');
    return { summary: { totalWithPlaceholder: 0, reassignedAutomatic: {}, remainsInternal: 0, perKindAutomatic: {} }, assignments: [] };
  }
  const placeholderId = placeholder.id;

  const projectByCode = new Map<string, any>();
  for (const p of projects) projectByCode.set(p.code, p);

  // Carica i JSON records
  const files: Record<string, { path: string; items: any[]; inCents: boolean; fornitoreField: string }> = {
    fattura_ingresso: { path: path.join(DATA_DIR, 'fatture-ingresso.json'), items: JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'fatture-ingresso.json'), 'utf-8')), inCents: true, fornitoreField: 'fornitore' },
    fattura_consulente: { path: path.join(DATA_DIR, 'fatture-consulenti.json'), items: JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'fatture-consulenti.json'), 'utf-8')), inCents: false, fornitoreField: 'consulente' },
    costo_vivo: { path: path.join(DATA_DIR, 'costi-vivi.json'), items: JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'costi-vivi.json'), 'utf-8')), inCents: true, fornitoreField: '' }, // fornitore è concatenato in descrizione
  };

  // Per ogni record con projectId = placeholderId, cerco match
  const report: Report = {
    summary: { totalWithPlaceholder: 0, reassignedAutomatic: {}, remainsInternal: 0, perKindAutomatic: {} },
    assignments: [],
  };

  for (const [kind, file] of Object.entries(files)) {
    for (const rec of file.items) {
      if (rec.projectId !== placeholderId) continue;
      report.summary.totalWithPlaceholder++;

      // Ricostruisco fornitore
      let fornitore = '';
      if (kind === 'costo_vivo') {
        // descrizione = "FORNITORE — descrizione originale"
        const m = /^(.+?)\s+—/.exec(rec.descrizione || '');
        fornitore = m ? m[1] : '';
      } else {
        fornitore = rec[file.fornitoreField] || '';
      }

      const importoEUR = file.inCents ? rec.importo / 100 : rec.importo;

      // Lookup Excel: fornitore + imponibile (importo è già imponibile post v8/v9)
      const key = normFornitore(fornitore) + '|' + importoEUR.toFixed(2);
      const candidates = excelIdx.get(key) || [];
      // Filtra per data ~ se disponibile (tolleranza generosa)
      const dataRec = rec.data || rec.dataEmissione;
      let centroCosto: string | null = null;
      if (candidates.length === 1) {
        centroCosto = candidates[0].centroCosto;
      } else if (candidates.length > 1 && dataRec) {
        const target = new Date(dataRec).getTime();
        candidates.sort((a, b) => {
          const da = a.data ? Math.abs(a.data.getTime() - target) : 9e15;
          const db = b.data ? Math.abs(b.data.getTime() - target) : 9e15;
          return da - db;
        });
        centroCosto = candidates[0].centroCosto;
      } else if (candidates.length > 0) {
        centroCosto = candidates[0].centroCosto;
      }

      const matchedCode = matchProjectCodeFromCentroCosto(centroCosto);
      if (matchedCode) {
        const newProject = projectByCode.get(matchedCode);
        if (newProject) {
          report.assignments.push({
            id: rec.id, kind, fornitore, centroCosto,
            oldProjectCode: 'DA-ASSEGNARE', newProjectCode: matchedCode,
          });
          if (apply) rec.projectId = newProject.id;
          report.summary.reassignedAutomatic[matchedCode] = (report.summary.reassignedAutomatic[matchedCode] || 0) + 1;
          report.summary.perKindAutomatic[kind] = (report.summary.perKindAutomatic[kind] || 0) + 1;
          continue;
        }
      }
      // No match → resta sul placeholder (diventerà commessa interna)
      report.summary.remainsInternal++;
    }
  }

  console.log('[v10] Record con placeholder:', report.summary.totalWithPlaceholder);
  console.log('[v10] Riassegnati automaticamente:');
  for (const [code, n] of Object.entries(report.summary.reassignedAutomatic)) {
    const p = projectByCode.get(code);
    console.log(`[v10]   ${code} (${p?.client}): ${n}`);
  }
  console.log('[v10] Restano su commessa interna:', report.summary.remainsInternal);

  // Trasformo DA-ASSEGNARE in commessa interna GBIDELLO-INT-2026
  // + aggiungo cliente "GBIDELLO ENGINEERING & PARTNERS" se non esiste
  const SELF_CLIENT_NAME = 'GBIDELLO ENGINEERING & PARTNERS S.R.L.';
  let selfClient = clients.find(c => (c.name || '').toUpperCase() === SELF_CLIENT_NAME);
  if (!selfClient) {
    selfClient = {
      id: randomUUID(),
      sigla: 'GBIE',
      name: SELF_CLIENT_NAME,
      codiceInterno: 'GBIE-INT',
      address: 'Viale Colli Aminei 491',
      city: 'Napoli',
      cap: '80131',
      province: 'NA',
      paese: 'Italia',
      piva: '',
      cf: '',
      codiceSdi: '',
      email: '',
      pec: '',
      phone: '',
      notes: 'Cliente placeholder per commessa interna spese studio',
      projectsCount: 1,
    };
    if (apply) clients.push(selfClient);
  }

  // Trasforma commessa placeholder
  placeholder.code = 'GBIDELLO-INT-2026';
  placeholder.client = SELF_CLIENT_NAME;
  placeholder.city = 'Napoli';
  placeholder.object = 'Spese interne studio (carburante, telefonia, bollette, abbonamenti, trasferte)';
  placeholder.status = 'in_corso';

  const reportPath = path.join(DATA_DIR, '_migration-v10-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8');
  console.log('[v10] Report scritto:', reportPath);

  if (!apply) {
    console.log('[v10] DRY-RUN — nessuna scrittura. Usa --apply.');
    return report;
  }

  // Backup + scrittura
  const backupDir = path.join(DATA_DIR, '_backup-pre-v10');
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
  for (const f of ['projects.json', 'clients.json', 'fatture-ingresso.json', 'fatture-consulenti.json', 'costi-vivi.json', 'costi-generali.json']) {
    const src = path.join(DATA_DIR, f);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(backupDir, f));
  }
  console.log('[v10] Backup in', backupDir);

  fs.writeFileSync(path.join(DATA_DIR, 'projects.json'), JSON.stringify(projects, null, 2), 'utf-8');
  fs.writeFileSync(path.join(DATA_DIR, 'clients.json'), JSON.stringify(clients, null, 2), 'utf-8');
  fs.writeFileSync(files.fattura_ingresso.path, JSON.stringify(files.fattura_ingresso.items, null, 2), 'utf-8');
  fs.writeFileSync(files.fattura_consulente.path, JSON.stringify(files.fattura_consulente.items, null, 2), 'utf-8');
  fs.writeFileSync(files.costo_vivo.path, JSON.stringify(files.costo_vivo.items, null, 2), 'utf-8');

  // Bump schema to 10
  const svPath = path.join(DATA_DIR, '_schema-version.json');
  const prev = fs.existsSync(svPath) ? JSON.parse(fs.readFileSync(svPath, 'utf-8')) : { version: 9, history: [] };
  fs.writeFileSync(svPath, JSON.stringify({
    version: 10, lastMigration: new Date().toISOString(),
    history: [...(prev.history || []), { to: 10, at: new Date().toISOString() }],
  }, null, 2), 'utf-8');

  console.log('[v10] Applied. Schema a v10. Commessa placeholder trasformata in GBIDELLO-INT-2026');
  return report;
}

const apply = process.argv.includes('--apply');
run(apply).catch(e => { console.error('[v10] FATAL:', e); process.exit(1); });
