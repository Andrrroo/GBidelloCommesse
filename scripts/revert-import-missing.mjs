/**
 * Annulla l'import v14 (script import-missing-fatture.mjs):
 *   - Rimuove commessa CNPA-NAP-2501
 *   - Rimuove tutti i record con note "Import v14"
 */

import fs from 'fs';
import path from 'path';

const DATA = 'C:/Users/tecni/Desktop/Codice/GBidelloCommesse-main/data';
function load(f) { return JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf-8')); }
function save(f, d) { fs.writeFileSync(path.join(DATA, f), JSON.stringify(d, null, 2), 'utf-8'); }

const projects = load('projects.json');
const fi = load('fatture-ingresso.json');
const cg = load('costi-generali.json');

// Rimuovi commessa CNPA-NAP-2501
const projsBefore = projects.length;
const projsKept = projects.filter(p => p.code !== 'CNPA-NAP-2501');
const cnpaRemoved = projsBefore - projsKept.length;

// Rimuovi fatture-ingresso con note "Import v14"
const fiBefore = fi.length;
const fiKept = fi.filter(x => !(x.note || '').includes('Import v14'));
const fiRemoved = fiBefore - fiKept.length;

// Rimuovi costi-generali con note "Import v14"
const cgBefore = cg.length;
const cgKept = cg.filter(x => !(x.note || '').includes('Import v14'));
const cgRemoved = cgBefore - cgKept.length;

save('projects.json', projsKept);
save('fatture-ingresso.json', fiKept);
save('costi-generali.json', cgKept);

console.log('Revert completato:');
console.log('  Commessa CNPA-NAP-2501 rimossa:', cnpaRemoved);
console.log('  fatture-ingresso:', fiBefore, '→', fiKept.length, '(-' + fiRemoved + ')');
console.log('  costi-generali:', cgBefore, '→', cgKept.length, '(-' + cgRemoved + ')');
