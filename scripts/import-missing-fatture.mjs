/**
 * Importa le 227 fatture ingresso mancanti:
 *   - 1 PRA €17.160 → nuova commessa CNPA-NAP-2501 (cliente CNPADC)
 *   - 1 RGG €3.150 → commessa esistente SIF-TOR-2501 (fotovoltaico Torino)
 *   - 225 altre (costi aziendali) → costi-generali con categoria per CC
 */

import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

const DATA = 'C:/Users/tecni/Desktop/Codice/GBidelloCommesse-main/data';
function load(f) { return JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf-8')); }
function save(f, d) { fs.writeFileSync(path.join(DATA, f), JSON.stringify(d, null, 2), 'utf-8'); }

const missing = JSON.parse(fs.readFileSync(path.join(DATA, '_missing-fatture-report.json'), 'utf-8'));
const projects = load('projects.json');
const clients = load('clients.json');
const fi = load('fatture-ingresso.json');
const cg = load('costi-generali.json');

// ─── 1. Crea commessa CNPA-NAP-2501 ───
const cnpa = clients.find(c => c.sigla === 'CNPA');
let cnpaProject = projects.find(p => p.code === 'CNPA-NAP-2501');
if (!cnpaProject) {
  cnpaProject = {
    id: randomUUID(),
    code: 'CNPA-NAP-2501',
    client: cnpa.name,
    city: 'Napoli',
    object: 'Accatastamento e progettazione parcheggio Via San Giacomo dei Capri 129 Napoli',
    year: 2025,
    template: 'BREVE',
    status: 'in_corso',
    tipoRapporto: 'diretto',
    tipoIntervento: 'professionale',
    manutenzione: false,
    categoriaLavoro: 'IA04',
    createdAt: '2025-01-01T00:00:00.000Z',
  };
  projects.push(cnpaProject);
  console.log('✓ Creata commessa CNPA-NAP-2501 (id=' + cnpaProject.id + ')');
}
const sifProject = projects.find(p => p.code === 'SIF-TOR-2501');
if (!sifProject) { console.error('✗ SIF-TOR-2501 non esiste!'); process.exit(1); }

// CC → categoria costi-generali
function ccToCategoria(cc) {
  if (!cc) return 'noleggio_auto'; // i 12 vuoti sono tutti carburante/telepass/parcheggio
  const u = cc.toUpperCase();
  if (/AUTO E ANNESSI|^AUTO$|BENZINA|TELEPASS|PARCHEGGIO/.test(u)) return 'noleggio_auto';
  if (/TRENI|AEREI|RISTORANTI|TICKET RESTAURANT|ALBERGHI|AMAZON/.test(u)) return 'altro';
  if (/SOFTWARE.*ABBONAMENT|ABBONAMENT/.test(u)) return 'abbonamento';
  if (/ENEL|ENERGIA/.test(u)) return 'energia';
  if (/TELEFONIA|INTERNET/.test(u)) return 'internet_dati';
  return 'altro';
}

let createdCG = 0;
let createdFI = 0;
const toImport = missing.filter(x => x.kind === 'ingresso');
console.log(`\nImporto ${toImport.length} fatture ingresso mancanti...`);

for (const m of toImport) {
  const isPaid = !!m.dataFE;
  const dataPag = m.dataFE || undefined;

  // Caso speciale: PRA San Giacomo dei Capri → CNPA-NAP-2501
  if (/pasquale raffa/i.test(m.fornitore) && /san giacomo dei capri/i.test(m.descrizione || '')) {
    fi.push({
      id: randomUUID(),
      projectId: cnpaProject.id,
      numeroFattura: m.nr || m.data,
      fornitore: m.fornitore,
      dataEmissione: m.data,
      dataCaricamento: new Date().toISOString().slice(0, 10),
      dataScadenzaPagamento: m.data,
      importo: Math.round(m.imponibile * 100),
      categoria: 'collaborazione_esterna',
      descrizione: m.descrizione,
      pagata: isPaid,
      ...(isPaid && dataPag ? { dataPagamento: dataPag } : {}),
      note: 'Import v14 da export 16-04 | CC: COLLABORAZIONI ESTERNE | cliente CNPADC (dalla descrizione)',
    });
    createdFI++;
    console.log(`  ✓ PRA €${m.imponibile} → CNPA-NAP-2501 (fatture-ingresso)`);
    continue;
  }

  // Caso speciale: RGG RIGENERAZIONE GREEN → SIF-TOR-2501
  if (/rgg|rigenerazionegreen/i.test(m.fornitore) && m.cc === 'RIGENERAZIONE GREEN') {
    fi.push({
      id: randomUUID(),
      projectId: sifProject.id,
      numeroFattura: m.nr || m.data,
      fornitore: m.fornitore,
      dataEmissione: m.data,
      dataCaricamento: new Date().toISOString().slice(0, 10),
      dataScadenzaPagamento: m.data,
      importo: Math.round(m.imponibile * 100),
      categoria: 'collaborazione_esterna',
      descrizione: m.descrizione,
      pagata: isPaid,
      ...(isPaid && dataPag ? { dataPagamento: dataPag } : {}),
      note: 'Import v14 da export 22-04 | CC: RIGENERAZIONE GREEN → SIF-TOR-2501 (fotovoltaico Torino)',
    });
    createdFI++;
    console.log(`  ✓ RGG €${m.imponibile} → SIF-TOR-2501 (fatture-ingresso)`);
    continue;
  }

  // Default: costi-generali
  const categoria = ccToCategoria(m.cc);
  cg.push({
    id: randomUUID(),
    categoria,
    fornitore: m.fornitore,
    descrizione: m.descrizione || `Import da FIC nr. ${m.nr}`,
    data: m.data,
    dataScadenza: undefined,
    importo: m.imponibile,
    pagato: isPaid,
    ...(isPaid && dataPag ? { dataPagamento: dataPag } : {}),
    note: `Import v14 da export ${m.file} | CC orig: ${m.cc || '(vuoto)'} | nr ${m.nr}`,
  });
  createdCG++;
}

save('projects.json', projects);
save('fatture-ingresso.json', fi);
save('costi-generali.json', cg);

console.log(`\n✅ Import completato:`);
console.log(`  projects.json: ${projects.length} commesse`);
console.log(`  fatture-ingresso.json: ${fi.length} (+${createdFI})`);
console.log(`  costi-generali.json: ${cg.length} (+${createdCG})`);
