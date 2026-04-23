/**
 * Fix round 2 — Correzioni dopo feedback utente:
 *   1. Revert Villa San Luigi €518 da PROV-ROM-2601 a PONT-NAP-2601 (Seminario, stessa area Via Petrarca 115)
 *   2. Move Sauter CONAI 2× €2.015,52 da costi-generali a fatture-ingresso PONT-NAP-2601 (Seminario)
 *
 * Gravinese Via Capo Sorrento resta in costi-generali (utente chiede dove sta → rimane lì con TBD).
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
const costi_generali = loadJSON('costi-generali.json');

const seminarioId = projects.find(p => p.code === 'PONT-NAP-2601').id;

// ───── Fix 1: Revert Villa San Luigi €518 → PONT-NAP-2601 ─────
{
  const rec = fatture_emesse.find(x =>
    /villa san luigi/i.test(x.cliente || '') && x.importo === 518
  );
  if (rec) {
    console.log('Fix 1: Villa San Luigi €518');
    console.log('  Prima: projectId =', rec.projectId);
    rec.projectId = seminarioId;
    // Pulisco la nota "FIX" precedente
    rec.note = (rec.note || '').replace(/\s*\|\s*FIX:.*$/, '') + ' | FIX round2: Villa San Luigi → PONT-NAP-2601 (Seminario, stessa area Via Petrarca)';
    console.log('  Dopo: projectId =', rec.projectId, '(PONT-NAP-2601/Seminario) ✓');
  } else {
    console.log('✗ Fix 1: record Villa San Luigi €518 non trovato in fatture-emesse');
  }
}

// ───── Fix 2: Sauter CONAI 2× → fatture-ingresso PONT-NAP-2601 ─────
{
  const sauters = [];
  for (let i = costi_generali.length - 1; i >= 0; i--) {
    const x = costi_generali[i];
    if (/sauter/i.test(x.fornitore || '') && x.importo === 2015.52) {
      sauters.push({ rec: x, idx: i });
    }
  }
  console.log('\nFix 2: Sauter CONAI — trovate', sauters.length, 'in costi-generali');
  for (const { rec, idx } of sauters) {
    const newIngresso = {
      id: randomUUID(),
      projectId: seminarioId,
      numeroFattura: (rec.note || '').match(/Nr\.\s*fattura:\s*([^|]+)/i)?.[1]?.trim() || rec.id.slice(0, 8),
      fornitore: 'Sauter Italia S.p.A.',
      dataEmissione: rec.data,
      dataCaricamento: new Date().toISOString().slice(0, 10),
      dataScadenzaPagamento: rec.dataScadenza || rec.data,
      importo: Math.round(rec.importo * 100), // EUR → cents
      categoria: 'collaborazione_esterna',
      descrizione: rec.descrizione,
      pagata: !!rec.pagato,
      ...(rec.dataPagamento ? { dataPagamento: rec.dataPagamento } : {}),
      note: `Spostata a PONT-NAP-2601 (Seminario) su istruzione utente. ${rec.note || ''}`.trim(),
    };
    fatture_ingresso.push(newIngresso);
    costi_generali.splice(idx, 1);
    console.log('  ✓ Sauter €' + rec.importo.toFixed(2) + ' del ' + rec.data + ' → PONT-NAP-2601');
  }
}

// Salva
saveJSON('fatture-emesse.json', fatture_emesse);
saveJSON('fatture-ingresso.json', fatture_ingresso);
saveJSON('costi-generali.json', costi_generali);

console.log('\n✅ Fix round 2 applicati');
