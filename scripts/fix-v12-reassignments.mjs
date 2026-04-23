/**
 * Fix v12 — Correzioni post-migration:
 *   1. Villa San Luigi €518 (numero 47) → sposta da PONT-NAP-2601 a PROV-ROM-2601
 *   2. Revert Gravinese Via Capo Sorrento €4.160 da fatture-consulenti a costi-generali (TBD)
 *   3. Revert Sauter CONAI 2× €2.015,52 da fatture-ingresso a costi-generali (TBD)
 *
 * Uso: node scripts/fix-v12-reassignments.mjs
 */

import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

const DATA = 'C:/Users/tecni/Desktop/Codice/GBidelloCommesse-main/data';

function loadJSON(f) { return JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf-8')); }
function saveJSON(f, d) { fs.writeFileSync(path.join(DATA, f), JSON.stringify(d, null, 2), 'utf-8'); }

const projects = loadJSON('projects.json');
const fatture_emesse = loadJSON('fatture-emesse.json');
const fatture_ingresso = loadJSON('fatture-ingresso.json');
const fatture_consulenti = loadJSON('fatture-consulenti.json');
const costi_generali = loadJSON('costi-generali.json');

const astalliId = projects.find(p => p.code === 'PROV-ROM-2601').id;
const seminarioId = projects.find(p => p.code === 'PONT-NAP-2601').id;

// ───── Fix 1: Villa San Luigi €518 ─────
{
  const rec = fatture_emesse.find(x =>
    /villa san luigi/i.test(x.cliente || '') && x.importo === 518
  );
  if (rec) {
    console.log('Fix 1: Villa San Luigi €518');
    console.log('  Prima: projectId =', rec.projectId, '(PONT-NAP-2601/Seminario)');
    rec.projectId = astalliId;
    rec.note = (rec.note || '') + ' | FIX: Villa San Luigi senza CR → PROV-ROM-2601 (Via degli Astalli)';
    console.log('  Dopo: projectId =', rec.projectId, '(PROV-ROM-2601/Astalli) ✓');
  } else {
    console.log('✗ Fix 1: record Villa San Luigi €518 non trovato');
  }
}

// ───── Fix 2: Revert Gravinese Via Capo Sorrento ─────
{
  const idx = fatture_consulenti.findIndex(x =>
    /rocco antonio gravinese/i.test(x.consulente || '') &&
    /capo sorrento/i.test(x.descrizione || '')
  );
  if (idx >= 0) {
    const rec = fatture_consulenti[idx];
    console.log('\nFix 2: Gravinese Via Capo Sorrento €' + rec.importo);
    console.log('  Rimozione da fatture-consulenti (id=' + rec.id.slice(0,8) + ')');
    // Crea back-entry in costi-generali
    const cgRec = {
      id: randomUUID(),
      categoria: 'altro',
      fornitore: 'ROCCO ANTONIO GRAVINESE',
      descrizione: rec.descrizione,
      data: rec.dataEmissione,
      dataScadenza: rec.dataScadenzaPagamento,
      importo: rec.importo,
      pagato: !!rec.pagata,
      dataPagamento: rec.dataPagamento,
      note: 'TBD: via Capo Sorrento Napoli — commessa da identificare (revert da v12 dopo feedback utente)',
    };
    costi_generali.push(cgRec);
    fatture_consulenti.splice(idx, 1);
    console.log('  Riaggiunta a costi-generali con TBD flag ✓');
  } else {
    console.log('✗ Fix 2: Gravinese Via Capo Sorrento non trovato');
  }
}

// ───── Fix 3: Revert Sauter CONAI 2× ─────
{
  const sauters = [];
  for (let i = fatture_ingresso.length - 1; i >= 0; i--) {
    const x = fatture_ingresso[i];
    if (/sauter/i.test(x.fornitore || '') &&
        x.importo === 201552 && // in centesimi = €2015,52
        /conai/i.test(x.descrizione || '')) {
      sauters.push({ rec: x, idx: i });
    }
  }
  console.log('\nFix 3: Sauter CONAI — trovate', sauters.length, 'fatture con split arbitrario');
  for (const { rec, idx } of sauters) {
    const cgRec = {
      id: randomUUID(),
      categoria: 'altro',
      fornitore: 'Sauter Italia S.p.A.',
      descrizione: rec.descrizione,
      data: rec.dataEmissione,
      dataScadenza: rec.dataScadenzaPagamento,
      importo: rec.importo / 100, // cents → euro
      pagato: !!rec.pagata,
      dataPagamento: rec.dataPagamento,
      note: 'TBD: Sauter CONAI senza CR — Astalli o Seminario (revert da v12 dopo feedback utente)',
    };
    costi_generali.push(cgRec);
    fatture_ingresso.splice(idx, 1);
    console.log('  Revert €' + (rec.importo/100).toFixed(2) + ' del ' + rec.dataEmissione + ' ✓');
  }
}

// Salva
saveJSON('fatture-emesse.json', fatture_emesse);
saveJSON('fatture-consulenti.json', fatture_consulenti);
saveJSON('fatture-ingresso.json', fatture_ingresso);
saveJSON('costi-generali.json', costi_generali);

console.log('\n✅ Fix applicati e file salvati');
