/**
 * Rimuove le 8 fatture con importo 0 dagli archivi JSON.
 * Tutte verificate nel FIC: Imponibile=0, IVA=0 (DDT, note, anticipo-chiusure, errori).
 */

import fs from 'fs';
import path from 'path';

const DATA = 'C:/Users/tecni/Desktop/Codice/GBidelloCommesse-main/data';
function load(f) { return JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf-8')); }
function save(f, d) { fs.writeFileSync(path.join(DATA, f), JSON.stringify(d, null, 2), 'utf-8'); }

const fi = load('fatture-ingresso.json');
const cg = load('costi-generali.json');

// Rimuovi da fatture-ingresso le 2 entries con importo=0
const fiBefore = fi.length;
const fiKept = fi.filter(x => {
  if (x.importo === 0) {
    console.log('[ingresso] RIMOSSO:', x.numeroFattura, '|', x.fornitore, '| desc:', (x.descrizione||'').slice(0, 80));
    return false;
  }
  return true;
});

// Rimuovi da costi-generali le 6 entries con importo=0
const cgBefore = cg.length;
const cgKept = cg.filter(x => {
  if (x.importo === 0) {
    console.log('[costi-gen] RIMOSSO:', x.fornitore, '| desc:', (x.descrizione||'').slice(0, 80));
    return false;
  }
  return true;
});

save('fatture-ingresso.json', fiKept);
save('costi-generali.json', cgKept);

console.log('');
console.log('Rimossi:');
console.log('  fatture-ingresso:', fiBefore, '→', fiKept.length, '(-' + (fiBefore - fiKept.length) + ')');
console.log('  costi-generali:', cgBefore, '→', cgKept.length, '(-' + (cgBefore - cgKept.length) + ')');
