/**
 * FIX audit punti 1+2:
 *   1) I 34 record con note "Da RIEPILOGO ACQUISTI" in fatture-ingresso.json
 *      → alcuni sono sulla commessa sbagliata (bug: tutti i fogli SEMINARIO/
 *        COLLEGIUM/BERARDINO finiti su PROV-ROM-2601 invece di PONT-NAP-2601).
 *   2) Molti di questi sono duplicati di record FIC (stesso fornitore+importo,
 *      una copia dal RIEPILOGO una dal FIC).
 *
 * Regole:
 *   - Per ogni record RIEPILOGO: trovo il mapping foglio → commessa giusta.
 *   - Cerco se esiste un record FIC (same fornitore_norm + importo, source diversa)
 *     con data reale (non 2026-04-21 placeholder).
 *   - Se esiste FIC duplicato:
 *       - Se FIC è sulla commessa giusta → elimino il RIEPILOGO.
 *       - Se FIC è sulla commessa sbagliata → correggo FIC ed elimino RIEPILOGO.
 *   - Se NON esiste FIC duplicato:
 *       - Se RIEPILOGO è sulla commessa sbagliata → correggo projectId.
 *       - Se già giusta → no-op.
 *
 * Usage:
 *   node scripts/fix-riepilogo-duplicates-and-commessa.mjs          # dry-run
 *   node scripts/fix-riepilogo-duplicates-and-commessa.mjs --apply  # apply
 */

import fs from 'fs';
import path from 'path';

const DATA = 'C:/Users/tecni/Desktop/Codice/GBidelloCommesse-main/data';
const APPLY = process.argv.includes('--apply');

const load = (f) => JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf-8'));
const save = (f, d) => fs.writeFileSync(path.join(DATA, f), JSON.stringify(d, null, 2), 'utf-8');

function norm(s) {
  return String(s || '').toLowerCase()
    .replace(/s\.?\s*r\.?\s*l\.?(\s+unipersonale)?/gi, '')
    .replace(/s\.?\s*p\.?\s*a\.?/gi, '')
    .replace(/s\.?\s*n\.?\s*c\.?/gi, '')
    .replace(/s\.?\s*a\.?\s*s\.?/gi, '')
    .replace(/società|societa/gi, '')
    .replace(/[.,;:&()'"\/]/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

// Mapping foglio RIEPILOGO → project code
const SHEET_TO_CODE = {
  'SEMINARIO': 'PONT-NAP-2601',
  'COLLEGIUM': 'PONT-NAP-2601', // tutti i COLLEGIUM (Immobile Seminario/Sezione/VSL/Aree Esterne)
  'INFERMERIA': 'PONT-NAP-2601',
  'CARDONER': 'PONT-NAP-2601',
  'P3-P4': 'PONT-NAP-2601',
  'BERARDINO': 'PONT-NAP-2601', // tetto biblioteca VSL
  'ASTALLI': 'PROV-ROM-2601',
  'SEW': 'SEWE-CAR-2501',
  'MASSIMO': 'MASS-ROM-2601',
  'PONTANO': 'PONT-NAP-2602',
};

function detectSheet(note) {
  const m = String(note || '').match(/foglio\s+(\S+)/i);
  if (!m) return null;
  const raw = m[1].toUpperCase();
  // match keyword
  for (const [k, v] of Object.entries(SHEET_TO_CODE)) {
    if (raw.startsWith(k)) return { raw, keyword: k, expectedCode: v };
  }
  return { raw, keyword: null, expectedCode: null };
}

// ─── Main ──────────────────────────────────────────────────────────
const projects = load('projects.json');
const projById = new Map(projects.map(p => [p.id, p]));
const projByCode = new Map(projects.map(p => [p.code, p]));

const fi = load('fatture-ingresso.json');

const riepRecords = fi.filter(r => /Da RIEPILOGO ACQUISTI/i.test(r.note || ''));
console.log(`Record con note "Da RIEPILOGO ACQUISTI": ${riepRecords.length}`);

// Index fatture-ingresso per (fornitore_norm, importo_cents)
const fiByKey = new Map();
for (const r of fi) {
  const k = `${norm(r.fornitore)}|${r.importo}`;
  if (!fiByKey.has(k)) fiByKey.set(k, []);
  fiByKey.get(k).push(r);
}

const actions = {
  delete: [], // record RIEPILOGO da eliminare (duplicati di FIC)
  updateProjectId: [], // record RIEPILOGO da correggere (no FIC duplicato)
  updateFicProjectId: [], // record FIC da correggere (sbagliato di commessa)
  unchanged: [], // già giusti
  uncertain: [], // casi da rivedere
};

for (const riep of riepRecords) {
  const sheet = detectSheet(riep.note);
  const currCode = projById.get(riep.projectId)?.code;

  if (!sheet || !sheet.expectedCode) {
    actions.uncertain.push({ record: riep, reason: 'foglio non mappato', sheet });
    continue;
  }

  const expectedProjectId = projByCode.get(sheet.expectedCode)?.id;
  if (!expectedProjectId) {
    actions.uncertain.push({ record: riep, reason: 'project non esiste: ' + sheet.expectedCode });
    continue;
  }

  // cerca duplicati FIC (stesso fornitore_norm + importo, record diverso da questo)
  const key = `${norm(riep.fornitore)}|${riep.importo}`;
  const sameKey = fiByKey.get(key) || [];
  const ficDups = sameKey.filter(x =>
    x.id !== riep.id && !/Da RIEPILOGO ACQUISTI/i.test(x.note || '')
  );

  if (ficDups.length > 0) {
    // duplicato FIC esiste → elimina il RIEPILOGO; correggi FIC se sbagliato
    if (ficDups.length > 1) {
      actions.uncertain.push({ record: riep, reason: 'più di 1 FIC dup', dups: ficDups.map(d=>d.id) });
      continue;
    }
    const fic = ficDups[0];
    const ficCode = projById.get(fic.projectId)?.code;
    const needsFicFix = ficCode !== sheet.expectedCode;
    if (needsFicFix) {
      actions.updateFicProjectId.push({
        ficRecord: fic,
        riepRecord: riep,
        from: ficCode, to: sheet.expectedCode,
        expectedProjectId,
        sheet: sheet.raw,
      });
    }
    actions.delete.push({
      record: riep,
      reason: 'duplicato di FIC id=' + fic.id,
      sheet: sheet.raw,
      currCode, expectedCode: sheet.expectedCode,
      ficData: fic.dataEmissione,
      ficCode, needsFicFix,
    });
  } else {
    // no duplicato FIC → solo correggi projectId se sbagliato
    if (currCode !== sheet.expectedCode) {
      actions.updateProjectId.push({
        record: riep,
        sheet: sheet.raw,
        from: currCode, to: sheet.expectedCode,
        expectedProjectId,
      });
    } else {
      actions.unchanged.push({ record: riep, currCode, sheet: sheet.raw });
    }
  }
}

// ─── Print plan ────────────────────────────────────────────────────
console.log('\n══════ DRY-RUN REPORT ══════\n');

console.log(`[DELETE] ${actions.delete.length} record RIEPILOGO da eliminare (duplicati di FIC):`);
for (const a of actions.delete) {
  const r = a.record;
  const marker = a.needsFicFix ? ' 🔧FIC-FIX-NEEDED' : '';
  console.log(`  €${String(r.importo/100).padStart(10)} | ${r.fornitore.slice(0,28).padEnd(28)} | foglio:${a.sheet.padEnd(12)} | currentCode:${a.currCode}${marker}`);
}

console.log(`\n[UPDATE-FIC] ${actions.updateFicProjectId.length} record FIC da riassegnare:`);
for (const a of actions.updateFicProjectId) {
  const r = a.ficRecord;
  console.log(`  €${String(r.importo/100).padStart(10)} | ${r.fornitore.slice(0,28).padEnd(28)} | ${a.from} → ${a.to} | ficId=${r.id}`);
}

console.log(`\n[UPDATE] ${actions.updateProjectId.length} record RIEPILOGO da riassegnare (no FIC dup):`);
for (const a of actions.updateProjectId) {
  const r = a.record;
  console.log(`  €${String(r.importo/100).padStart(10)} | ${r.fornitore.slice(0,28).padEnd(28)} | ${a.from} → ${a.to} | foglio:${a.sheet}`);
}

console.log(`\n[UNCHANGED] ${actions.unchanged.length} record RIEPILOGO già corretti (solo info):`);
for (const a of actions.unchanged.slice(0, 5)) {
  const r = a.record;
  console.log(`  €${String(r.importo/100).padStart(10)} | ${r.fornitore.slice(0,28).padEnd(28)} | ${a.currCode} (foglio:${a.sheet}) ✓`);
}
if (actions.unchanged.length > 5) console.log(`  ... +${actions.unchanged.length-5} altri`);

console.log(`\n[UNCERTAIN] ${actions.uncertain.length} record ambigui (non modificati):`);
for (const a of actions.uncertain) {
  const r = a.record;
  console.log(`  €${String(r.importo/100).padStart(10)} | ${r.fornitore.slice(0,28).padEnd(28)} | reason: ${a.reason}`);
}

// Summary
console.log('\n══════ SUMMARY ══════');
console.log(`  Deleting ${actions.delete.length} RIEPILOGO records (dedup).`);
console.log(`  Updating ${actions.updateFicProjectId.length} FIC records' projectId.`);
console.log(`  Updating ${actions.updateProjectId.length} RIEPILOGO records' projectId.`);
console.log(`  ${actions.unchanged.length} already correct, ${actions.uncertain.length} uncertain.`);

// ─── Apply ─────────────────────────────────────────────────────────
if (!APPLY) {
  console.log('\n(dry-run, nessuna modifica. Per applicare: --apply)');
  process.exit(0);
}

// backup
const BACKUP_DIR = path.join(DATA, '_backup-pre-fix-riepilogo-' + new Date().toISOString().slice(0,10));
if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR);
fs.copyFileSync(path.join(DATA, 'fatture-ingresso.json'), path.join(BACKUP_DIR, 'fatture-ingresso.json'));
console.log(`\n→ Backup in ${BACKUP_DIR}`);

// costruisci nuovo array
const toDelete = new Set(actions.delete.map(a => a.record.id));
const ficUpdates = new Map(actions.updateFicProjectId.map(a => [a.ficRecord.id, a.expectedProjectId]));
const riepUpdates = new Map(actions.updateProjectId.map(a => [a.record.id, a.expectedProjectId]));

let deleted = 0, updated = 0;
const newFi = [];
for (const r of fi) {
  if (toDelete.has(r.id)) { deleted++; continue; }
  if (ficUpdates.has(r.id)) {
    newFi.push({ ...r, projectId: ficUpdates.get(r.id), note: (r.note||'') + ` | FIX: projectId corretto ${new Date().toISOString().slice(0,10)}` });
    updated++;
  } else if (riepUpdates.has(r.id)) {
    newFi.push({ ...r, projectId: riepUpdates.get(r.id), note: (r.note||'') + ` | FIX: projectId corretto ${new Date().toISOString().slice(0,10)}` });
    updated++;
  } else {
    newFi.push(r);
  }
}

save('fatture-ingresso.json', newFi);
console.log(`\n✅ APPLIED:`);
console.log(`  -${deleted} record eliminati (duplicati)`);
console.log(`  ${updated} record con projectId corretto`);
console.log(`  fatture-ingresso.json: ${fi.length} → ${newFi.length} record`);
