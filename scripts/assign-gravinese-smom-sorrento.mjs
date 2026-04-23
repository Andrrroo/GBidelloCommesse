/**
 * Crea commessa SMOM-SOR-2501 (Sovrano Militare Ordine di Malta — Sorrento)
 * e sposta Gravinese €4.160 da costi-generali a fatture-ingresso.
 */

import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

const DATA = 'C:/Users/tecni/Desktop/Codice/GBidelloCommesse-main/data';
const load = (f) => JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf-8'));
const save = (f, d) => fs.writeFileSync(path.join(DATA, f), JSON.stringify(d, null, 2), 'utf-8');

const projects = load('projects.json');
const clients = load('clients.json');
const costi_generali = load('costi-generali.json');
const fatture_ingresso = load('fatture-ingresso.json');

// ─── 1. Crea commessa SMOM-SOR-2501 ───
const smomClient = clients.find(c => c.sigla === 'SMOM');
if (!smomClient) { console.error('✗ Cliente SMOM non trovato'); process.exit(1); }

const existing = projects.find(p => p.code === 'SMOM-SOR-2501');
let smomProject;
if (existing) {
  console.log('⚠ SMOM-SOR-2501 già esiste — skip creazione');
  smomProject = existing;
} else {
  smomProject = {
    id: randomUUID(),
    code: 'SMOM-SOR-2501',
    client: smomClient.name,
    city: 'Sorrento',
    object: 'Interventi strutturali messa in sicurezza paramento murario Via Capo Sorrento',
    year: 2025,
    template: 'BREVE',
    status: 'in_corso',
    tipoRapporto: 'diretto',
    tipoIntervento: 'professionale',
    manutenzione: false,
    categoriaLavoro: 'S04',
    createdAt: '2025-01-01T00:00:00.000Z',
  };
  projects.push(smomProject);
  console.log('✓ Creata commessa SMOM-SOR-2501 (id=' + smomProject.id + ')');
}

// ─── 2. Rimuovi Gravinese da costi-generali ───
const graviIdx = costi_generali.findIndex(r =>
  /rocco antonio gravinese/i.test(r.fornitore || '') &&
  /capo sorrento/i.test(r.descrizione || '')
);
if (graviIdx < 0) { console.error('✗ Gravinese non trovato in costi-generali'); process.exit(1); }
const gravi = costi_generali[graviIdx];
console.log('✓ Trovato Gravinese in costi-generali: id=' + gravi.id + ' importo=€' + gravi.importo);

// ─── 3. Crea entry in fatture-ingresso (cents) ───
const todayISO = new Date().toISOString().slice(0, 10);
const newIngresso = {
  id: randomUUID(),
  projectId: smomProject.id,
  numeroFattura: '2',
  fornitore: 'ROCCO ANTONIO GRAVINESE',
  dataEmissione: gravi.data,
  dataCaricamento: todayISO,
  dataScadenzaPagamento: gravi.dataScadenza || gravi.data,
  importo: Math.round(gravi.importo * 100), // euro → centesimi
  categoria: 'collaborazione_esterna',
  descrizione: gravi.descrizione,
  pagata: !!gravi.pagato,
  ...(gravi.dataPagamento ? { dataPagamento: gravi.dataPagamento } : {}),
  note: 'Riclassificata da costi-generali → SMOM-SOR-2501 (Sovrano Militare Ordine di Malta, Sorrento) | Rit. acconto €800 su imponibile €4.160',
};
fatture_ingresso.push(newIngresso);
console.log('✓ Aggiunta entry a fatture-ingresso: id=' + newIngresso.id + ' importo=' + newIngresso.importo + ' cents (€' + (newIngresso.importo/100).toFixed(2) + ')');

// ─── 4. Rimuovi da costi-generali ───
costi_generali.splice(graviIdx, 1);
console.log('✓ Rimosso Gravinese da costi-generali');

// ─── Salva ───
save('projects.json', projects);
save('costi-generali.json', costi_generali);
save('fatture-ingresso.json', fatture_ingresso);

console.log('\n✅ Operazione completata. Totali:');
console.log('  projects.json:', projects.length, 'commesse');
console.log('  costi-generali.json:', costi_generali.length, 'record');
console.log('  fatture-ingresso.json:', fatture_ingresso.length, 'record');
