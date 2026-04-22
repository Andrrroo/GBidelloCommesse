/**
 * Migration v11 — Sposta i 109 record "interni" (GBIDELLO-INT-2026 placeholder)
 * da fatture-ingresso/consulenti/costi-vivi → costi-generali, poi elimina la
 * commessa e il cliente placeholder.
 *
 * Ragione: GBidello è lo studio stesso, non ha senso creare una commessa
 * cliente per le spese aziendali generiche (BENZINA, TRENI, TELEFONIA,
 * ENEL, ecc.). Queste sono naturalmente costi generali (nessun projectId).
 *
 * Step:
 *  1. Identifico i record con projectId = commessa GBIDELLO-INT-2026
 *  2. Per ogni record, mappo al costo generale corrispondente:
 *     - fornitore, descrizione, data, importo (euro), pagato, note, allegato
 *     - categoria derivata dal centro costo Excel (o 'altro' fallback)
 *  3. Li sposto: pop dal file originale, push in costi-generali.json
 *  4. Elimino la commessa GBIDELLO-INT-2026 da projects.json
 *  5. Elimino il cliente "GBIDELLO ENGINEERING & PARTNERS" se non più usato
 *  6. Bump schema a 11
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

const SELF_CLIENT_NAME = 'GBIDELLO ENGINEERING & PARTNERS S.R.L.';
const INTERNAL_PROJECT_CODE = 'GBIDELLO-INT-2026';

// Mapping centro costo FIC → costi_generali.categoria
function mapCentroCostoToCategoriaGenerale(cc: string | null): string {
  if (!cc) return 'altro';
  const s = cc.toUpperCase();
  if (/TELEFONIA/.test(s)) return 'internet_dati';
  if (/^ENEL$/.test(s) || /ENERGIA/.test(s)) return 'energia';
  if (/CANONI PEC|SOFTWARE.*ABBONAMENT|ABBONAMENT/.test(s)) return 'abbonamento';
  if (/COMMERCIALIST|CONSULENTI AMMINISTRATIV/.test(s)) return 'commercialista';
  if (/TELEPASS|^AUTO$|NOLEGGI.*AUTO/.test(s)) return 'noleggio_auto';
  if (/PULIZI/.test(s)) return 'pulizie';
  if (/GIARDI/.test(s)) return 'giardiniere';
  if (/ASSICURAZION/.test(s)) return 'assicurazioni';
  if (/MULT/.test(s)) return 'multe';
  if (/FITTO|AFFITT|LOCAZION/.test(s)) return 'fitto_ufficio';
  return 'altro';
}

// ============================================================================
// Excel lookup
// ============================================================================
interface ExcelRow {
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
    out.push({
      data: excelSerialToDate(r[0]),
      nrAcquisto: r[2] != null ? String(r[2]).trim() : '',
      centroCosto: r[5] != null ? String(r[5]).trim() : null,
      fornitore: String(r[7] || '').trim(),
      imponibile: typeof r[18] === 'number' ? r[18] : parseFloat(String(r[18] || 0)) || 0,
      iva: typeof r[19] === 'number' ? r[19] : parseFloat(String(r[19] || 0)) || 0,
    });
  }
  return out;
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
async function run(apply: boolean) {
  // Carica Excel e indicizza per lookup centro costo
  const allExcel: ExcelRow[] = [];
  for (const f of EXCEL_FILES) {
    const full = path.join(EXCEL_DIR, f);
    if (fs.existsSync(full)) allExcel.push(...loadExcel(full));
  }
  const excelIdx = new Map<string, ExcelRow[]>();
  for (const r of allExcel) {
    const k = normFornitore(r.fornitore) + '|' + r.imponibile.toFixed(2);
    const arr = excelIdx.get(k) || [];
    arr.push(r);
    excelIdx.set(k, arr);
  }

  // Carica JSON
  const projects: any[] = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'projects.json'), 'utf-8'));
  const clients: any[] = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'clients.json'), 'utf-8'));
  const internalProject = projects.find(p => p.code === INTERNAL_PROJECT_CODE);
  if (!internalProject) {
    console.log('[v11] Nessuna commessa', INTERNAL_PROJECT_CODE, '— niente da fare.');
    return;
  }
  const placeholderId = internalProject.id;
  const selfClientId = clients.find(c => (c.name || '') === SELF_CLIENT_NAME)?.id;

  const fattureIngresso: any[] = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'fatture-ingresso.json'), 'utf-8'));
  const fattureConsulenti: any[] = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'fatture-consulenti.json'), 'utf-8'));
  const costiVivi: any[] = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'costi-vivi.json'), 'utf-8'));
  const costiGenerali: any[] = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'costi-generali.json'), 'utf-8'));

  // Trova i 109 record + mappali a costi_generali
  const toMove = {
    fatture_ingresso: fattureIngresso.filter((x: any) => x.projectId === placeholderId),
    fatture_consulenti: fattureConsulenti.filter((x: any) => x.projectId === placeholderId),
    costi_vivi: costiVivi.filter((x: any) => x.projectId === placeholderId),
  };

  console.log('[v11] Record da spostare in costi-generali:');
  console.log('  fatture_ingresso:', toMove.fatture_ingresso.length);
  console.log('  fatture_consulenti:', toMove.fatture_consulenti.length);
  console.log('  costi_vivi:', toMove.costi_vivi.length);
  const total = toMove.fatture_ingresso.length + toMove.fatture_consulenti.length + toMove.costi_vivi.length;
  console.log('  TOTALE:', total);

  function lookupCentroCosto(fornitore: string, importoEUR: number): string | null {
    const k = normFornitore(fornitore) + '|' + importoEUR.toFixed(2);
    const candidates = excelIdx.get(k);
    if (!candidates || candidates.length === 0) return null;
    return candidates[0].centroCosto;
  }

  const newCostiGenerali: any[] = [];
  const categoriaCount: Record<string, number> = {};

  // Fatture ingresso → costi generali
  for (const r of toMove.fatture_ingresso) {
    const importoEUR = r.importo / 100; // cents → euro
    const cc = lookupCentroCosto(r.fornitore, importoEUR);
    const categoria = mapCentroCostoToCategoriaGenerale(cc);
    categoriaCount[categoria] = (categoriaCount[categoria] || 0) + 1;
    newCostiGenerali.push({
      id: randomUUID(),
      categoria,
      fornitore: r.fornitore,
      descrizione: r.descrizione || `Import FIC ${r.numeroFattura || ''}`,
      data: r.dataEmissione,
      dataScadenza: r.dataScadenzaPagamento || undefined,
      importo: Math.round(importoEUR * 100) / 100,
      pagato: !!r.pagata,
      dataPagamento: r.dataPagamento || undefined,
      allegato: r.allegato || undefined,
      note: `${r.note || ''} | Orig: fattura_ingresso num ${r.numeroFattura} (centroCosto: ${cc || 'n/d'})`.trim(),
    });
  }

  // Fatture consulenti → costi generali
  for (const r of toMove.fatture_consulenti) {
    const cc = lookupCentroCosto(r.consulente, r.importo);
    const categoria = mapCentroCostoToCategoriaGenerale(cc);
    categoriaCount[categoria] = (categoriaCount[categoria] || 0) + 1;
    newCostiGenerali.push({
      id: randomUUID(),
      categoria,
      fornitore: r.consulente,
      descrizione: r.descrizione || `Consulenza ${r.numeroFattura || ''}`,
      data: r.dataEmissione,
      dataScadenza: r.dataScadenzaPagamento || undefined,
      importo: Math.round(r.importo * 100) / 100,
      pagato: !!r.pagata,
      dataPagamento: r.dataPagamento || undefined,
      allegato: r.allegato || undefined,
      note: `${r.note || ''} | Orig: fattura_consulente num ${r.numeroFattura} (centroCosto: ${cc || 'n/d'})`.trim(),
    });
  }

  // Costi vivi → costi generali (fornitore è nel formato "FORNITORE — descr")
  for (const r of toMove.costi_vivi) {
    const importoEUR = r.importo / 100;
    // Estrai fornitore dalla descrizione
    let fornitore = '';
    let descr = r.descrizione || '';
    const m = /^(.+?)\s+—\s+(.+)$/.exec(descr);
    if (m) {
      fornitore = m[1].trim();
      descr = m[2].trim();
    }
    const cc = lookupCentroCosto(fornitore, importoEUR);
    const categoria = mapCentroCostoToCategoriaGenerale(cc);
    categoriaCount[categoria] = (categoriaCount[categoria] || 0) + 1;
    newCostiGenerali.push({
      id: randomUUID(),
      categoria,
      fornitore: fornitore || r.fornitore || 'Non specificato',
      descrizione: descr || `${r.tipologia || 'spesa'}`,
      data: r.data,
      importo: Math.round(importoEUR * 100) / 100,
      pagato: true, // costi vivi tipicamente già sostenuti
      dataPagamento: r.data,
      note: `${r.note || ''} | Orig: costo_vivo tipologia ${r.tipologia} (centroCosto: ${cc || 'n/d'})`.trim(),
    });
  }

  console.log('\n[v11] Nuova distribuzione per categoria costi_generali:');
  Object.entries(categoriaCount).sort((a, b) => b[1] - a[1]).forEach(([c, n]) => console.log(`  ${n}x ${c}`));

  // Rimuovi i record dai file originali
  const fattureIngressoClean = fattureIngresso.filter((x: any) => x.projectId !== placeholderId);
  const fattureConsulentiClean = fattureConsulenti.filter((x: any) => x.projectId !== placeholderId);
  const costiViviClean = costiVivi.filter((x: any) => x.projectId !== placeholderId);

  // Rimuovi commessa interna
  const projectsClean = projects.filter(p => p.code !== INTERNAL_PROJECT_CODE);

  // Rimuovi cliente self se non ci sono altri riferimenti
  const stillReferenced = projectsClean.some(p => p.client === SELF_CLIENT_NAME);
  const clientsClean = stillReferenced ? clients : clients.filter(c => c.id !== selfClientId);

  // Aggiungi i nuovi costi generali
  const costiGeneraliFinal = [...costiGenerali, ...newCostiGenerali];

  console.log('\n[v11] Impatto:');
  console.log('  fatture-ingresso:', fattureIngresso.length, '→', fattureIngressoClean.length, '(-' + (fattureIngresso.length - fattureIngressoClean.length) + ')');
  console.log('  fatture-consulenti:', fattureConsulenti.length, '→', fattureConsulentiClean.length, '(-' + (fattureConsulenti.length - fattureConsulentiClean.length) + ')');
  console.log('  costi-vivi:', costiVivi.length, '→', costiViviClean.length, '(-' + (costiVivi.length - costiViviClean.length) + ')');
  console.log('  costi-generali:', costiGenerali.length, '→', costiGeneraliFinal.length, '(+' + newCostiGenerali.length + ')');
  console.log('  projects:', projects.length, '→', projectsClean.length, '(rimossa ' + INTERNAL_PROJECT_CODE + ')');
  console.log('  clients:', clients.length, '→', clientsClean.length);

  if (!apply) {
    console.log('\n[v11] DRY-RUN — nessuna scrittura. Usa --apply.');
    return;
  }

  // Backup
  const backupDir = path.join(DATA_DIR, '_backup-pre-v11');
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
  for (const f of ['projects.json', 'clients.json', 'fatture-ingresso.json', 'fatture-consulenti.json', 'costi-vivi.json', 'costi-generali.json']) {
    fs.copyFileSync(path.join(DATA_DIR, f), path.join(backupDir, f));
  }
  console.log('[v11] Backup in', backupDir);

  // Scrivi
  fs.writeFileSync(path.join(DATA_DIR, 'fatture-ingresso.json'), JSON.stringify(fattureIngressoClean, null, 2), 'utf-8');
  fs.writeFileSync(path.join(DATA_DIR, 'fatture-consulenti.json'), JSON.stringify(fattureConsulentiClean, null, 2), 'utf-8');
  fs.writeFileSync(path.join(DATA_DIR, 'costi-vivi.json'), JSON.stringify(costiViviClean, null, 2), 'utf-8');
  fs.writeFileSync(path.join(DATA_DIR, 'costi-generali.json'), JSON.stringify(costiGeneraliFinal, null, 2), 'utf-8');
  fs.writeFileSync(path.join(DATA_DIR, 'projects.json'), JSON.stringify(projectsClean, null, 2), 'utf-8');
  fs.writeFileSync(path.join(DATA_DIR, 'clients.json'), JSON.stringify(clientsClean, null, 2), 'utf-8');

  // Bump schema
  const svPath = path.join(DATA_DIR, '_schema-version.json');
  const prev = fs.existsSync(svPath) ? JSON.parse(fs.readFileSync(svPath, 'utf-8')) : { version: 10, history: [] };
  fs.writeFileSync(svPath, JSON.stringify({
    version: 11, lastMigration: new Date().toISOString(),
    history: [...(prev.history || []), { to: 11, at: new Date().toISOString() }],
  }, null, 2), 'utf-8');

  console.log('\n[v11] Applied. Schema a v11. Commessa interna e cliente self rimossi.');
}

const apply = process.argv.includes('--apply');
run(apply).catch(e => { console.error('[v11] FATAL:', e); process.exit(1); });
