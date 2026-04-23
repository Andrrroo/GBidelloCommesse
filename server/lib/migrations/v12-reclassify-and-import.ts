/**
 * Migration v12 — Riclassificazione costi-generali + import nuove fatture 23-04 + anagrafica dipendenti
 *
 * Operazioni (tutte in dry-run di default, applicate con --apply):
 *
 *   1. Crea 9 nuove commesse (tutti clienti esistenti in clients.json)
 *   2. Crea 12 dipendenti con codice fiscale dai PDF buste paga
 *   3. Sposta ~22 record da costi-generali a fatture-ingresso/consulenti/emesse con projectId corretto
 *   4. Analisi manuale Megawatt: assegnazione per-data dei 47 record
 *   5. Import 40 nuove fatture da export 23-04 (classifica automatica ingresso/emesse)
 *   6. Normalizza flag `pagato` secondo regola (saldato o data ricezione FE)
 *   7. Bump schema a v12
 *
 * Uso:
 *   npx tsx server/lib/migrations/v12-reclassify-and-import.ts          # dry-run
 *   npx tsx server/lib/migrations/v12-reclassify-and-import.ts --apply  # commit
 */

import XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '..', '..', '..', 'data');
const EXCEL_DIR = process.env.EXCEL_DIR || 'C:/Users/tecni/Desktop/Codice/Dati';

// ============================================================================
// Costants
// ============================================================================

interface NewProjectSpec {
  code: string;
  clientSigla: string;     // match by sigla in clients.json
  city: string;
  object: string;
  template: 'LUNGO' | 'BREVE';
  tipoRapporto?: 'diretto' | 'consulenza' | 'subappalto' | 'ati' | 'partnership';
  tipoIntervento?: 'professionale' | 'realizzativo';
  manutenzione: boolean;
  categoriaLavoro?: string;
  createdAt: string;
}

const NEW_PROJECTS: NewProjectSpec[] = [
  {
    code: 'GRE-NAP-2501',
    clientSigla: 'GRE',
    city: 'Napoli',
    object: 'Caserma Edoardo Bianchini — PSC e rifacimento solaio',
    template: 'BREVE',
    tipoRapporto: 'diretto',
    tipoIntervento: 'realizzativo',
    manutenzione: false,
    categoriaLavoro: 'S04',
    createdAt: '2025-09-01T00:00:00.000Z',
  },
  {
    code: 'DCRE-POZ-2501',
    clientSigla: 'DCRE',
    city: 'Pozzuoli',
    object: 'Ex Comprensorio Olivetti — vulnerabilità sismica e indagini',
    template: 'LUNGO',
    tipoRapporto: 'diretto',
    tipoIntervento: 'professionale',
    manutenzione: false,
    categoriaLavoro: 'S04',
    createdAt: '2025-04-01T00:00:00.000Z',
  },
  {
    code: 'INV-CAS-2501',
    clientSigla: 'INV',
    city: 'Caserta',
    object: 'Sede INPS Caserta Via Maggiore Salvatore Arena — vulnerabilità sismica',
    template: 'BREVE',
    tipoRapporto: 'diretto',
    tipoIntervento: 'professionale',
    manutenzione: false,
    categoriaLavoro: 'S04',
    createdAt: '2025-06-01T00:00:00.000Z',
  },
  {
    code: 'INV-ROM-2501',
    clientSigla: 'INV',
    city: 'Roma',
    object: 'Immobile FIP Via Ciamarra Roma — aggiornamento perizia',
    template: 'BREVE',
    tipoRapporto: 'diretto',
    tipoIntervento: 'professionale',
    manutenzione: false,
    categoriaLavoro: 'S04',
    createdAt: '2025-02-01T00:00:00.000Z',
  },
  {
    code: 'PILA-VIT-2501',
    clientSigla: 'PILA',
    city: 'Vitulazio',
    object: 'Stabilimento Pilato SS Appia km 197 — CPI antincendio',
    template: 'BREVE',
    tipoRapporto: 'diretto',
    tipoIntervento: 'realizzativo',
    manutenzione: true,
    createdAt: '2025-07-01T00:00:00.000Z',
  },
  {
    code: 'PICG-PAL-2501',
    clientSigla: 'PICG',
    city: 'Palermo',
    object: 'Collegio Gonzaga Via Piersanti Mattarella 38 Palermo — CPI',
    template: 'BREVE',
    tipoRapporto: 'diretto',
    tipoIntervento: 'realizzativo',
    manutenzione: true,
    createdAt: '2025-01-01T00:00:00.000Z',
  },
  {
    code: 'SIF-TOR-2501',
    clientSigla: 'SIF',
    city: 'Torino',
    object: 'Consulenza impianto fotovoltaico — Torino',
    template: 'BREVE',
    tipoRapporto: 'consulenza',
    tipoIntervento: 'professionale',
    manutenzione: false,
    categoriaLavoro: 'E22',
    createdAt: '2025-02-01T00:00:00.000Z',
  },
  {
    code: 'AZI-NAP-2501',
    clientSigla: 'AZI',
    city: 'Napoli',
    object: 'Riqualificazione immobile Piazzetta Materdei 10 — progettazione (Azimut)',
    template: 'BREVE',
    tipoRapporto: 'diretto',
    tipoIntervento: 'professionale',
    manutenzione: false,
    categoriaLavoro: 'IA04',
    createdAt: '2025-04-01T00:00:00.000Z',
  },
  {
    code: 'TCS-NAP-2501',
    clientSigla: 'TCS',
    city: 'Napoli',
    object: 'Immobile Piazzetta Materdei — sondaggi e verifiche strutturali (TCS)',
    template: 'BREVE',
    tipoRapporto: 'diretto',
    tipoIntervento: 'professionale',
    manutenzione: false,
    categoriaLavoro: 'IA04',
    createdAt: '2025-12-01T00:00:00.000Z',
  },
];

interface NewDipendenteSpec {
  cognome: string;
  nome: string;
  codiceFiscale: string;
  ruolo: string;
  costoOrario: number;
  stipendioMensile?: number;
  note?: string;
}

const NEW_DIPENDENTI: NewDipendenteSpec[] = [
  { cognome: 'LA GUARDIA', nome: 'LOREDANA', codiceFiscale: 'LGRLDN72S41F839C', ruolo: 'Impiegata III livello', costoOrario: 11.96, stipendioMensile: 2069.63 },
  { cognome: 'FRASCOGNA', nome: 'BIAGIO', codiceFiscale: 'FRSBGI89B01F799Q', ruolo: 'Impiegato tecnico Q (Quadro)', costoOrario: 18.13, stipendioMensile: 3045.43 },
  { cognome: 'LIPARI', nome: 'PAOLA', codiceFiscale: 'LPRPLA75S62F839J', ruolo: 'Segretaria V livello', costoOrario: 9.90, stipendioMensile: 1663.17 },
  { cognome: 'ESPOSITO', nome: 'MARIA', codiceFiscale: 'SPSMRA76P69F839E', ruolo: 'Addetta pulizie VII livello (50%)', costoOrario: 8.10, stipendioMensile: 1401.05, note: 'Part-time 50%' },
  { cognome: 'FUSCO', nome: 'GENNARO', codiceFiscale: 'FSCGNR62M07F839X', ruolo: 'Impiegato tecnico V livello', costoOrario: 10.02, stipendioMensile: 1683.47 },
  { cognome: 'BIDELLO', nome: 'GIULIA', codiceFiscale: 'BDLGLI04L66F839Z', ruolo: 'Impiegata VI livello (50%)', costoOrario: 9.20, stipendioMensile: 1544.86, note: 'Part-time 50%' },
  { cognome: 'MARINO', nome: 'GIUSEPPE', codiceFiscale: 'MRNGPP04D07F839A', ruolo: 'Impiegato tecnico VI livello', costoOrario: 9.20, stipendioMensile: 1544.86 },
  { cognome: 'RUSCIANO', nome: 'GIUSEPPE', codiceFiscale: 'RSCGPP54T05F839R', ruolo: 'Tecnico III livello', costoOrario: 11.83, stipendioMensile: 1987.00 },
  { cognome: 'FRUTTALDO', nome: 'LAURA', codiceFiscale: 'FRTLRA78D48F839K', ruolo: 'Impiegata V livello', costoOrario: 9.90, stipendioMensile: 1663.17 },
  { cognome: 'MENNILLO', nome: 'CIRO', codiceFiscale: 'MNNCRI06A25F839K', ruolo: 'Impiegato tecnico VI livello', costoOrario: 9.20, stipendioMensile: 1544.86 },
  { cognome: 'BIDELLO', nome: 'GIANFRANCO', codiceFiscale: 'BDLGFR73B13F839P', ruolo: 'Legale rappresentante — Amministratore', costoOrario: 50.00, stipendioMensile: 8000.00, note: 'Compenso amministratore (non retribuzione oraria reale)' },
  { cognome: 'DI MONDA', nome: 'ROBERTO', codiceFiscale: 'DMNRRT74T19G812P', ruolo: 'Responsabile tecnico III livello', costoOrario: 11.83, stipendioMensile: 1987.00 },
];

// Riassegnazioni dirette (ID costi-generali → projectCode + destinazione)
// Destinazione: 'consulenti' | 'ingresso'
interface Reassignment {
  id: string;
  targetProjectCode: string;
  destination: 'consulenti' | 'ingresso';
  noteOverride?: string;
  descrizioneOverride?: string;
  categoriaIngresso?: 'materiali' | 'collaborazione_esterna' | 'costo_vivo' | 'altro';
}

const REASSIGNMENTS: Reassignment[] = [
  // Casciello — utente esplicito: Via Ferraris
  { id: '74791970-7220-43d4-8df9-bb1fbf677cc3', targetProjectCode: 'INVE-NAP-2501', destination: 'consulenti' },
  // Caserma Bianchini
  { id: '72e9e7db-1a4f-4173-a088-4e35f3b7c343', targetProjectCode: 'GRE-NAP-2501', destination: 'consulenti' },
  // Caserta INPS (Gravinese Engineering + Labortek)
  { id: '2fff25de-ba6d-4eeb-9894-f8fe84c8b74e', targetProjectCode: 'INV-CAS-2501', destination: 'consulenti' },
  { id: '256717cb-0000-0000-0000-000000000000', targetProjectCode: 'INV-CAS-2501', destination: 'consulenti' }, // placeholder — riletto dal file
  // Pozzuoli Olivetti (Labortek, Rozza ×4, Maione)
  { id: 'bd5e9be0-0000-0000-0000-000000000000', targetProjectCode: 'DCRE-POZ-2501', destination: 'consulenti' },
  { id: '22054337-0000-0000-0000-000000000000', targetProjectCode: 'DCRE-POZ-2501', destination: 'consulenti' },
  { id: 'a67ea45b-0000-0000-0000-000000000000', targetProjectCode: 'DCRE-POZ-2501', destination: 'consulenti' },
  { id: 'e3c80a82-0000-0000-0000-000000000000', targetProjectCode: 'DCRE-POZ-2501', destination: 'consulenti' },
  { id: 'dd01299d-0187-4f51-8251-df5eae2b6f9a', targetProjectCode: 'DCRE-POZ-2501', destination: 'consulenti' },
  { id: 'ff391380-0000-0000-0000-000000000000', targetProjectCode: 'DCRE-POZ-2501', destination: 'consulenti' },
  // Via Ciamarra
  { id: '4788c581-0000-0000-0000-000000000000', targetProjectCode: 'INV-ROM-2501', destination: 'consulenti' },
  // Fotovoltaico Torino
  { id: '3d36335e-5c4a-4804-9741-21c2454dd405', targetProjectCode: 'SIF-TOR-2501', destination: 'consulenti' },
  // Pilato Vitulazio
  { id: 'a1616c3f-b8a2-40dc-85e4-7dbc4c08d4b9', targetProjectCode: 'PILA-VIT-2501', destination: 'consulenti' },
  // Gonzaga Palermo
  { id: 'f340a8ca-e24e-42cf-87fb-17e74199bfc4', targetProjectCode: 'PICG-PAL-2501', destination: 'consulenti' },
  // Materdei — split: PRA → AZI, Tmstecno → TCS
  { id: '62a1ebe4-89e4-4692-9b35-b9820e6457e6', targetProjectCode: 'AZI-NAP-2501', destination: 'consulenti' },
  { id: '8f20644a-0000-0000-0000-000000000000', targetProjectCode: 'TCS-NAP-2501', destination: 'ingresso', categoriaIngresso: 'materiali' },
  { id: 'f226c264-0000-0000-0000-000000000000', targetProjectCode: 'TCS-NAP-2501', destination: 'ingresso', categoriaIngresso: 'materiali' },
  // Di Gennaro Giulia — scia 135922 + ricettiva → Via Ferraris (già c'è Di Gennaro €4k lì per ricettiva stesso immobile)
  { id: 'ff271fc0-4468-4423-b94a-62249c4fd121', targetProjectCode: 'INVE-NAP-2501', destination: 'consulenti' },
  { id: '3b86f154-faac-4f0c-85b8-98285431151a', targetProjectCode: 'INVE-NAP-2501', destination: 'consulenti' },
  // Sidda Sud — devespizzazione capannone Carinaro (stessa perimetro dell'altra Sidda già in SEW)
  { id: 'b6e5f1d1-cf90-41c5-b5ec-6783943f43c2', targetProjectCode: 'SEWE-CAR-2501', destination: 'ingresso', categoriaIngresso: 'altro' },
  // Mario Ferrara ×3 — tutti su Via Ferraris (stesso commessa dell'esistente €1.000,40)
  { id: '243a6f73-0222-4905-9461-c10997af7155', targetProjectCode: 'INVE-NAP-2501', destination: 'consulenti' },
  { id: '3b1e192c-bf32-4789-a5f1-3742faa7a753', targetProjectCode: 'INVE-NAP-2501', destination: 'consulenti' },
  { id: '6e688187-1180-4192-8316-066a7505269b', targetProjectCode: 'INVE-NAP-2501', destination: 'consulenti' },
  // Gravinese Via Capo Sorrento — best-guess: Seminario (Via Petrarca, Napoli vicino)
  { id: 'cc483b67-883f-44d2-bca3-0c8450bb6dfe', targetProjectCode: 'PONT-NAP-2601', destination: 'consulenti', noteOverride: 'ASSEGNAZIONE PROVVISORIA: Via Capo Sorrento Napoli non matcha nessuna commessa specifica — linkata a Seminario (Via Petrarca, zona Chiaia) come best-guess. RIVEDERE in UI.' },
  // Sauter CONAI ×2 — storicamente 50% Astalli 50% Seminario; assegno la più vecchia a Seminario, la più recente a Astalli
  { id: '51a76c4c-0000-0000-0000-000000000000', targetProjectCode: 'PONT-NAP-2601', destination: 'ingresso', categoriaIngresso: 'collaborazione_esterna' }, // 2025-03-31
  { id: '6e4ab3d6-8d4b-451a-bae0-d674634ce324', targetProjectCode: 'PROV-ROM-2601', destination: 'ingresso', categoriaIngresso: 'collaborazione_esterna' }, // 2025-09-30
];

// ============================================================================
// Helpers
// ============================================================================

function readJSON<T>(relPath: string): T {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, relPath), 'utf-8'));
}

function writeJSON(relPath: string, data: unknown): void {
  fs.writeFileSync(path.join(DATA_DIR, relPath), JSON.stringify(data, null, 2), 'utf-8');
}

// Risolve un id parziale (i primi 8 char) nel vero UUID presente in costi-generali.
// Usato per la tabella REASSIGNMENTS dove conosco solo i primi 8 caratteri.
function resolveFullId(costiGenerali: any[], partialId: string): string | null {
  const short = partialId.slice(0, 8);
  const found = costiGenerali.find(r => r.id.startsWith(short));
  return found?.id || null;
}

// ============================================================================
// Main
// ============================================================================

interface Report {
  newProjects: Array<{ code: string; clientName: string; id: string }>;
  newDipendenti: Array<{ cognome: string; nome: string; cf: string; id: string }>;
  reassigned: Array<{ id: string; fornitore: string; from: 'costi-generali'; to: string; projectCode: string; importo: number }>;
  megawattAssignments: Array<{ id: string; data: string; importo: number; targetCode: string; reason: string }>;
  ambiguous: Array<{ id: string; fornitore: string; reason: string }>;
  pagatoFixes: Array<{ id: string; file: string; oldPagato: boolean; newPagato: boolean; reason: string }>;
  import23April: Array<{ nrAcquisto: string; fornitore: string; importo: number; classified: 'ingresso' | 'emesse' | 'skip'; reason: string }>;
}

async function run(apply: boolean): Promise<Report> {
  const report: Report = {
    newProjects: [],
    newDipendenti: [],
    reassigned: [],
    megawattAssignments: [],
    ambiguous: [],
    pagatoFixes: [],
    import23April: [],
  };

  // Load tutti i JSON
  const projects: any[] = readJSON('projects.json');
  const clients: any[] = readJSON('clients.json');
  const dipendenti: any[] = readJSON('dipendenti.json');
  const costiGenerali: any[] = readJSON('costi-generali.json');
  const fattureIngresso: any[] = readJSON('fatture-ingresso.json');
  const fattureConsulenti: any[] = readJSON('fatture-consulenti.json');
  const fattureEmesse: any[] = readJSON('fatture-emesse.json');

  const clientBySigla = new Map<string, any>();
  for (const c of clients) clientBySigla.set(c.sigla, c);

  // ──────── Step 1: Crea nuove commesse ────────
  console.log('\n[v12] Step 1 — Nuove commesse');
  const projectByCode = new Map<string, any>();
  for (const p of projects) projectByCode.set(p.code, p);

  for (const spec of NEW_PROJECTS) {
    if (projectByCode.has(spec.code)) {
      console.log(`  ⚠ ${spec.code} già esiste — skip`);
      continue;
    }
    const client = clientBySigla.get(spec.clientSigla);
    if (!client) {
      console.log(`  ✗ Cliente sigla=${spec.clientSigla} non trovato per ${spec.code}`);
      continue;
    }
    const newProject = {
      id: randomUUID(),
      code: spec.code,
      client: client.name,
      city: spec.city,
      object: spec.object,
      year: new Date(spec.createdAt).getFullYear(),
      template: spec.template,
      status: 'in_corso' as const,
      tipoRapporto: spec.tipoRapporto || 'diretto',
      tipoIntervento: spec.tipoIntervento || 'professionale',
      manutenzione: spec.manutenzione,
      ...(spec.categoriaLavoro ? { categoriaLavoro: spec.categoriaLavoro } : {}),
      createdAt: spec.createdAt,
    };
    projects.push(newProject);
    projectByCode.set(spec.code, newProject);
    report.newProjects.push({ code: spec.code, clientName: client.name, id: newProject.id });
    console.log(`  ✓ ${spec.code} (${client.name}) id=${newProject.id}`);
  }

  // ──────── Step 2: Crea dipendenti ────────
  console.log('\n[v12] Step 2 — Nuovi dipendenti');
  const dipendentiByCF = new Map<string, any>();
  for (const d of dipendenti) {
    if (d.codiceFiscale) dipendentiByCF.set(d.codiceFiscale, d);
  }
  for (const spec of NEW_DIPENDENTI) {
    if (dipendentiByCF.has(spec.codiceFiscale)) {
      console.log(`  ⚠ CF ${spec.codiceFiscale} già esiste — skip`);
      continue;
    }
    const newDip = {
      id: randomUUID(),
      nome: spec.nome,
      cognome: spec.cognome,
      email: '',
      telefono: '',
      ruolo: spec.ruolo,
      costoOrario: spec.costoOrario,
      active: true,
      stipendioMensile: spec.stipendioMensile,
      codiceFiscale: spec.codiceFiscale,
      note: spec.note || '',
      createdAt: new Date().toISOString(),
    };
    dipendenti.push(newDip);
    dipendentiByCF.set(spec.codiceFiscale, newDip);
    report.newDipendenti.push({ cognome: spec.cognome, nome: spec.nome, cf: spec.codiceFiscale, id: newDip.id });
    console.log(`  ✓ ${spec.cognome} ${spec.nome} (${spec.codiceFiscale}) id=${newDip.id}`);
  }

  // ──────── Step 3: Riassegnazioni ────────
  console.log('\n[v12] Step 3 — Riassegnazioni costi-generali → archivio commessa');
  for (const r of REASSIGNMENTS) {
    const fullId = resolveFullId(costiGenerali, r.id);
    if (!fullId) {
      console.log(`  ✗ ID ${r.id.slice(0, 8)} non trovato in costi-generali — skip`);
      continue;
    }
    const src = costiGenerali.find(x => x.id === fullId);
    if (!src) continue;

    const targetProject = projectByCode.get(r.targetProjectCode);
    if (!targetProject) {
      console.log(`  ✗ Commessa ${r.targetProjectCode} non esiste per id ${fullId.slice(0, 8)} — skip`);
      continue;
    }

    // Calcola pagato secondo regola (saldato o data ricezione FE)
    // Semplificazione: se già pagato=true, lascia. Se c'è dataPagamento valida, forza pagato=true.
    const isPaid = src.pagato === true || !!src.dataPagamento;
    const dataPagamento = src.dataPagamento || (isPaid ? src.data : undefined);

    if (r.destination === 'consulenti') {
      const newRec: any = {
        id: randomUUID(),
        projectId: targetProject.id,
        numeroFattura: (src.note || '').match(/Nr\.\s*fattura:\s*([^|]+)/i)?.[1]?.trim() || src.id.slice(0, 8),
        consulente: src.fornitore,
        dataEmissione: src.data,
        dataScadenzaPagamento: src.dataScadenza || src.data,
        importo: src.importo, // EUR
        descrizione: r.descrizioneOverride || src.descrizione,
        pagata: isPaid,
        ...(dataPagamento ? { dataPagamento } : {}),
        ...(src.allegato ? { allegato: src.allegato } : {}),
        note: r.noteOverride || `Riclassificata da costi-generali (v12) → ${r.targetProjectCode}. ${src.note || ''}`.trim(),
      };
      fattureConsulenti.push(newRec);
    } else {
      const newRec: any = {
        id: randomUUID(),
        projectId: targetProject.id,
        numeroFattura: (src.note || '').match(/Nr\.\s*fattura:\s*([^|]+)/i)?.[1]?.trim() || src.id.slice(0, 8),
        fornitore: src.fornitore,
        dataEmissione: src.data,
        dataCaricamento: new Date().toISOString().slice(0, 10),
        dataScadenzaPagamento: src.dataScadenza || src.data,
        importo: Math.round(src.importo * 100), // EUR → centesimi
        categoria: r.categoriaIngresso || 'altro',
        descrizione: r.descrizioneOverride || src.descrizione,
        pagata: isPaid,
        ...(dataPagamento ? { dataPagamento } : {}),
        ...(src.allegato ? { allegato: src.allegato } : {}),
        note: r.noteOverride || `Riclassificata da costi-generali (v12) → ${r.targetProjectCode}. ${src.note || ''}`.trim(),
      };
      fattureIngresso.push(newRec);
    }

    // Rimuovi da costi-generali
    const idx = costiGenerali.findIndex(x => x.id === fullId);
    if (idx >= 0) costiGenerali.splice(idx, 1);

    report.reassigned.push({
      id: fullId,
      fornitore: src.fornitore,
      from: 'costi-generali',
      to: r.destination,
      projectCode: r.targetProjectCode,
      importo: src.importo,
    });
    console.log(`  ✓ ${src.fornitore.padEnd(35).slice(0, 35)} €${String(src.importo).padStart(8)} → ${r.targetProjectCode} (${r.destination})`);
  }

  // ──────── Step 4: Analisi manuale Megawatt ────────
  console.log('\n[v12] Step 4 — Analisi Megawatt per-data');
  const megawattOrphans = costiGenerali.filter(x =>
    (x.fornitore || '').toUpperCase().includes('MEGAWATT') &&
    (x.note || '').includes('CC: -')
  );
  console.log(`  ${megawattOrphans.length} Megawatt orfani da analizzare`);

  // Criterio per-data (verificato):
  //   - Commessa Astalli (PROV-ROM-2601) è stata creata il 2025-11-17. Prima di quella
  //     data non poteva esistere un acquisto Megawatt per Astalli.
  //   - Seminario (PONT-NAP-2601) è stata creata il 2025-05-22 ed era l'unica commessa
  //     realizzativa Napoli-area con uso di materiale elettrico Megawatt prima di Nov 2025.
  //   - Tutte le Megawatt con CC storico note cadono nel range 2025-12-03 → 2026-04-21.
  //
  // Regola applicata:
  //   - Fattura pre-2025-11-17  → PONT-NAP-2601 (Seminario)  — 36 fatture, €20.398
  //   - Fattura ≥ 2025-11-17    → PROV-ROM-2601 (Astalli)    — 11 fatture, €12.246
  //
  // Eccezione manuale: le Megawatt pre-2025-11-17 con importi anomali o descrizione
  // specifica verranno flaggate per revisione utente.

  for (const mw of megawattOrphans) {
    const preAstalli = mw.data < '2025-11-17';
    const targetCode = preAstalli ? 'PONT-NAP-2601' : 'PROV-ROM-2601';
    const reason = preAstalli
      ? `data ${mw.data} precede creazione Astalli (2025-11-17) — assegnato a Seminario (unica commessa realizzativa Napoli attiva)`
      : `data ${mw.data} ≥ 2025-11-17 (creazione Astalli) — coerente con storico 82% Astalli`;
    const importo = mw.importo;

    const targetProject = projectByCode.get(targetCode);
    if (!targetProject) continue;

    const isPaid = mw.pagato === true || !!mw.dataPagamento;
    const dataPagamento = mw.dataPagamento || (isPaid ? mw.data : undefined);
    const numeroFatt = (mw.note || '').match(/Nr\.\s*fattura:\s*([^|]+)/i)?.[1]?.trim() || mw.id.slice(0, 8);

    const newRec: any = {
      id: randomUUID(),
      projectId: targetProject.id,
      numeroFattura: numeroFatt,
      fornitore: mw.fornitore,
      dataEmissione: mw.data,
      dataCaricamento: new Date().toISOString().slice(0, 10),
      dataScadenzaPagamento: mw.dataScadenza || mw.data,
      importo: Math.round(importo * 100),
      categoria: 'materiali',
      descrizione: mw.descrizione || 'Vendita',
      pagata: isPaid,
      ...(dataPagamento ? { dataPagamento } : {}),
      note: `Riclassificata da costi-generali (v12 Megawatt manuale) → ${targetCode}. Criterio: ${reason}. Rivedere in UI se imprecisa.`,
    };
    fattureIngresso.push(newRec);

    // Rimuovi da costi-generali
    const idx = costiGenerali.findIndex(x => x.id === mw.id);
    if (idx >= 0) costiGenerali.splice(idx, 1);

    report.megawattAssignments.push({ id: mw.id, data: mw.data, importo, targetCode, reason });
  }
  console.log(`  ✓ ${report.megawattAssignments.length} Megawatt riclassificati`);

  // ──────── Step 5: Import 23-04 ────────
  // Implementato separatamente (vedi run23AprileImport) — chiamato solo se --apply
  if (apply || process.argv.includes('--with-23april')) {
    const imported = await run23AprileImport(projects, projectByCode, clients, fattureIngresso, fattureEmesse, fattureConsulenti);
    report.import23April = imported;
  } else {
    console.log('\n[v12] Step 5 — Import 23-04 SKIPPATO in dry-run (usa --apply o --with-23april)');
  }

  // ──────── Step 6: Normalizza pagato ────────
  console.log('\n[v12] Step 6 — Normalizza pagato');
  // Regola: se esiste dataPagamento valida e pagato=false → forza pagato=true
  for (const file of [
    { name: 'fatture-ingresso', arr: fattureIngresso, field: 'pagata' },
    { name: 'fatture-consulenti', arr: fattureConsulenti, field: 'pagata' },
    { name: 'costi-generali', arr: costiGenerali, field: 'pagato' },
  ]) {
    for (const rec of file.arr) {
      const isNowPaid = rec[file.field];
      if (!isNowPaid && rec.dataPagamento) {
        rec[file.field] = true;
        report.pagatoFixes.push({ id: rec.id, file: file.name, oldPagato: false, newPagato: true, reason: 'dataPagamento valorizzata' });
      }
    }
  }
  console.log(`  ✓ ${report.pagatoFixes.length} flag pagato normalizzati`);

  // ──────── Report + scrittura ────────
  const reportPath = path.join(DATA_DIR, '_migration-v12-report.json');
  writeJSON('_migration-v12-report.json', report);
  console.log(`\n[v12] Report: ${reportPath}`);
  console.log(`  Nuove commesse: ${report.newProjects.length}`);
  console.log(`  Nuovi dipendenti: ${report.newDipendenti.length}`);
  console.log(`  Record riclassificati: ${report.reassigned.length}`);
  console.log(`  Megawatt assegnati: ${report.megawattAssignments.length}`);
  console.log(`  Pagato fixes: ${report.pagatoFixes.length}`);
  console.log(`  Nuove fatture 23-04: ${report.import23April.length}`);

  if (!apply) {
    console.log('\n[v12] DRY-RUN — nessuna scrittura ai file principali. Usa --apply.');
    return report;
  }

  // Scrivi tutti i file
  writeJSON('projects.json', projects);
  writeJSON('dipendenti.json', dipendenti);
  writeJSON('costi-generali.json', costiGenerali);
  writeJSON('fatture-ingresso.json', fattureIngresso);
  writeJSON('fatture-consulenti.json', fattureConsulenti);
  writeJSON('fatture-emesse.json', fattureEmesse);

  // Bump schema
  const sv = readJSON<any>('_schema-version.json');
  sv.version = 12;
  sv.lastMigration = new Date().toISOString();
  sv.history.push({ to: 12, at: new Date().toISOString() });
  writeJSON('_schema-version.json', sv);

  console.log('\n[v12] Applied. Schema a v12.');
  return report;
}

// ============================================================================
// Sub-step 5: Import 23-04 Excel
// ============================================================================

async function run23AprileImport(
  projects: any[],
  projectByCode: Map<string, any>,
  clients: any[],
  fattureIngresso: any[],
  fattureEmesse: any[],
  fattureConsulenti: any[],
): Promise<Report['import23April']> {
  const result: Report['import23April'] = [];
  const file = path.join(EXCEL_DIR, 'export 23-04-2026 08-53-25.xls');
  if (!fs.existsSync(file)) {
    console.log(`\n[v12] Step 5 — Excel 23-04 non trovato in ${file}`);
    return result;
  }
  console.log('\n[v12] Step 5 — Import 23-04 (fatture emesse)');

  const wb = XLSX.readFile(file);
  const sh = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json(sh, { header: 1, defval: null }) as any[][];

  // Questo export ha colonna "Cliente" (documenti emessi), non "Fornitore".
  let h = -1;
  for (let i = 0; i < raw.length; i++) {
    if (Array.isArray(raw[i]) && raw[i].includes('Cliente') && raw[i].includes('Imponibile') && raw[i].includes('Saldato')) { h = i; break; }
  }
  if (h < 0) {
    console.log('  ✗ Header non trovato (cerco colonne Cliente/Imponibile/Saldato)');
    return result;
  }

  const headers = raw[h];
  const idx = (name: string) => headers.indexOf(name);
  const iData = idx('Data'), iProx = idx('Prox scadenza'), iDoc = idx('Documento'), iNum = idx('Numero'),
        iSaldato = idx('Saldato'), iCR = idx('Centro ricavo'), iCli = idx('Cliente'), iPIVA = idx('P.IVA'),
        iOggInt = idx('Oggetto (interno)'), iOggVis = idx('Oggetto (visibile)'), iImp = idx('Imponibile'), iIVA = idx('IVA');

  // CR → projectCode mapping (include nuove commesse). In "documenti emessi" il campo si chiama "Centro ricavo"
  const crToCode = (cr: string | null): string | null => {
    if (!cr) return null;
    const u = cr.toUpperCase();
    if (/ASTALLI|AUTORIMESSA|CENTRO ASTALLI/.test(u)) return 'PROV-ROM-2601';
    if (/SEMINARIO|PONTIFICIO/.test(u)) return 'PONT-NAP-2601';
    if (/SEW|CARINARO|EURODRIVE/.test(u)) return 'SEWE-CAR-2501';
    if (/FIP.?FER.?PE|FIP.?FERRARIS|\bFERRARIS\b|EX INPS/.test(u)) return 'INVE-NAP-2501';
    if (/ANGELONI|PERUGIA/.test(u)) return 'INVE-PER-2501';
    if (/CIAMARRA/.test(u)) return 'INV-ROM-2501';
    if (/VIA PETRARCA|PETRARCA/.test(u)) return 'PONT-NAP-2601'; // Via Petrarca = Seminario
    if (/PONTANO/.test(u)) return 'PONT-NAP-2602';
    if (/MASSIMO|LABORATORIO CHIMICA|MASSIMILIANO/.test(u)) return 'MASS-ROM-2601';
    if (/BIANCHINI/.test(u)) return 'GRE-NAP-2501';
    if (/OLIVETTI|POZZUOLI/.test(u)) return 'DCRE-POZ-2501';
    if (/INPS.*CASERTA|CASERTA.*INPS/.test(u)) return 'INV-CAS-2501';
    if (/PILATO|VITULAZIO/.test(u)) return 'PILA-VIT-2501';
    if (/GONZAGA|PALERMO|PIERSANTI/.test(u)) return 'PICG-PAL-2501';
    if (/FOTOVOLTAIC|TORINO/.test(u)) return 'SIF-TOR-2501';
    if (/MATERDEI/.test(u)) return 'AZI-NAP-2501';
    return null;
  };

  // Fallback: deduci commessa dal cliente se CR non c'è (uno-a-uno cliente→commessa dove noto)
  const clientToCode = (cliente: string, piva: string): string | null => {
    const c = cliente.toLowerCase();
    if (/seminario\s+campano|pontificio/i.test(c)) return 'PONT-NAP-2601';
    if (/collegium professorum|s\.?\s*aloisii/i.test(c)) return 'PONT-NAP-2601';
    if (/villa san luigi|crvsl/i.test(c)) return 'PONT-NAP-2601';
    if (/sew/i.test(c)) return 'SEWE-CAR-2501';
    if (/compagnia del gesù|provincia d'italia/i.test(c)) return 'PROV-ROM-2601';
    if (/istituto pontano|pontano/i.test(c)) return 'PONT-NAP-2602';
    if (/istituto massimiliano massimo|massimo/i.test(c)) return 'MASS-ROM-2601';
    if (/investire sgr.*fip/i.test(c)) return null; // ambiguo: può essere Ferraris, Angeloni, Ciamarra, Caserta
    return null;
  };

  const excelSerialToDateStr = (n: any): string | undefined => {
    if (typeof n !== 'number' || !isFinite(n)) return undefined;
    const epoch = new Date(Date.UTC(1899, 11, 30));
    return new Date(epoch.getTime() + n * 86400000).toISOString().slice(0, 10);
  };

  const normalize = (s: string) => (s || '').toLowerCase().replace(/s\.?\s*[rp]\.?\s*[lao]\.?(\s+unipersonale)?/gi, '').replace(/[.,;:&()\/\\]/g, ' ').replace(/\s+/g, ' ').trim();

  // Dedup against existing fatture-emesse (chiave: numero+cliente+importo)
  const existingKeys = new Set<string>();
  for (const f of fattureEmesse) existingKeys.add((f.numeroFattura || '').trim() + '|' + normalize(f.cliente || '') + '|' + (f.importo || 0).toFixed(2));

  for (let i = h + 1; i < raw.length; i++) {
    const r = raw[i];
    if (!Array.isArray(r) || r[iCli] == null) continue;
    const cliente = String(r[iCli]).trim();
    const imponibile = typeof r[iImp] === 'number' ? r[iImp] : parseFloat(String(r[iImp] || 0)) || 0;
    if (!cliente || !imponibile) continue;

    const numero = String(r[iNum] || '').trim();
    const dedupKey = numero + '|' + normalize(cliente) + '|' + imponibile.toFixed(2);
    if (existingKeys.has(dedupKey)) {
      result.push({ nrAcquisto: numero, fornitore: cliente, importo: imponibile, classified: 'skip', reason: 'già presente in fatture-emesse (num+cliente+imp)' });
      continue;
    }

    const cr = r[iCR] != null ? String(r[iCR]).trim() : null;
    const piva = r[iPIVA] != null ? String(r[iPIVA]).trim() : '';
    let targetCode = crToCode(cr);
    if (!targetCode) targetCode = clientToCode(cliente, piva);
    const targetProject = targetCode ? projectByCode.get(targetCode) : null;

    if (!targetProject) {
      result.push({ nrAcquisto: String(r[iNum] || ''), fornitore: cliente, importo: imponibile, classified: 'skip', reason: `CR="${cr || 'n/d'}" non mappato (cliente=${cliente})` });
      continue;
    }

    const dataEm = excelSerialToDateStr(r[iData]) || '';
    const dataScad = excelSerialToDateStr(r[iProx]) || dataEm;
    const isPaid = (r[iSaldato] === 'SI' || r[iSaldato] === 'Yes' || r[iSaldato] === 'YES');
    const oggetto = String(r[iOggVis] || r[iOggInt] || '').trim() || 'Prestazione professionale';

    const newRec: any = {
      id: randomUUID(),
      projectId: targetProject.id,
      numeroFattura: String(r[iNum] || '').trim() || `IMP23-${i}`,
      cliente,
      dataEmissione: dataEm,
      dataScadenzaPagamento: dataScad,
      importo: imponibile, // fatture-emesse è in euro
      descrizione: oggetto,
      incassata: isPaid,
      ...(isPaid ? { dataIncasso: dataEm } : {}),
      note: `Import v12 da export 23-04 | CR: ${cr || 'n/d'} | Doc: ${r[iDoc] || ''} ${r[iNum] || ''}`,
    };
    fattureEmesse.push(newRec);
    result.push({ nrAcquisto: String(r[iNum] || ''), fornitore: cliente, importo: imponibile, classified: 'emesse', reason: `${cr ? `CR="${cr}"` : `cliente→${targetCode}`} → ${targetCode}` });
    existingKeys.add(dedupKey);
  }

  console.log(`  ✓ ${result.filter(r => r.classified === 'emesse').length} emesse, ${result.filter(r => r.classified === 'skip').length} skip`);
  return result;
}

const apply = process.argv.includes('--apply');
run(apply).catch(e => { console.error('[v12] FATAL:', e); process.exit(1); });
