/**
 * Importa direttamente le 36 buste paga (Gen/Feb/Mar 2026) nei costi-generali.
 * Replica la logica del backend endpoint /api/costi-generali/upload-buste-paga/commit
 * senza HTTP (molto più veloce e non richiede il server attivo).
 *
 * Step:
 *   1. Per ogni PDF in uploads/pdf/split/, parse tramite parseBustaPagaPdf
 *   2. Match CF → dipendente in dipendenti.json
 *   3. Crea entry stipendi in costi-generali.json (idempotente: se (dipendenteId,periodo) esiste, aggiorna)
 *   4. Sposta il PDF da split/ a uploads/pdf/ (flat layout) e salva fileUrl
 *
 * Uso: node scripts/upload-buste-paga-direct.mjs
 */

import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

const SPLIT_DIR = 'C:/Users/tecni/Desktop/Codice/GBidelloCommesse-main/uploads/pdf/split';
const UPLOADS_DIR = 'C:/Users/tecni/Desktop/Codice/GBidelloCommesse-main/uploads/pdf';
const DATA_DIR = 'C:/Users/tecni/Desktop/Codice/GBidelloCommesse-main/data';

// Carica il parser (già esistente nel server)
const { parseBustaPagaPdf } = await import('../server/lib/payroll-pdf-parser.ts');

// Fallback per buste paga che il parser rigetta (≤5 importi sulla riga finale,
// tipicamente part-time o ruoli senza alcune colonne fiscali).
// Cerca l'ultima riga con ≥5 importi formato italiano, primo importo positivo.
// Pattern: "<TOTALE COMPETENZE> <...> <NETTO IN BUSTA ~ ,00>"
async function fallbackParse(buffer) {
  const { PDFParse } = await import('pdf-parse');
  const p = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const r = await p.getText();
    const text = r.text || '';
    if (!text.trim()) throw new Error('PDF vuoto');

    // Estrai CF
    const cfMatch = /[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]/.exec(text);
    if (!cfMatch) throw new Error('CF non trovato');
    const codiceFiscale = cfMatch[0];

    // Estrai periodo
    const MESI = ['GENNAIO','FEBBRAIO','MARZO','APRILE','MAGGIO','GIUGNO','LUGLIO','AGOSTO','SETTEMBRE','OTTOBRE','NOVEMBRE','DICEMBRE'];
    const perMatch = new RegExp(`(${MESI.join('|')})\\s*/\\s*(\\d{4})`, 'i').exec(text);
    if (!perMatch) throw new Error('Periodo non trovato');
    const mIdx = MESI.indexOf(perMatch[1].toUpperCase());
    const periodo = `${perMatch[2]}-${String(mIdx + 1).padStart(2, '0')}`;
    const meseLabel = perMatch[1].charAt(0).toUpperCase() + perMatch[1].slice(1).toLowerCase() + ' ' + perMatch[2];

    // Estrai imponibile con heuristic
    const amountRegex = /-?\d{1,3}(?:\.\d{3})*,\d{2}(?!\d)/g;
    const lines = text.split(/\r?\n/);
    // Cerca righe con ≥5 importi DOVE l'ultimo importo finisce in ,00 (NETTO IN BUSTA arrotondato)
    const candidates = [];
    for (const line of lines) {
      const m = line.match(amountRegex);
      if (!m || m.length < 5) continue;
      const last = m[m.length - 1];
      if (!/,00$/.test(last)) continue;
      const first = Number(m[0].replace(/\./g, '').replace(',', '.'));
      if (!isFinite(first) || first <= 0) continue;
      candidates.push({ line, first });
    }
    if (candidates.length === 0) throw new Error('Riga totali non trovata (fallback)');
    // La TOTALE COMPETENZE è tipicamente l'ULTIMA occorrenza di questo pattern nel PDF
    const chosen = candidates[candidates.length - 1];
    return { codiceFiscale, periodo, meseLabel, imponibileMensile: chosen.first };
  } finally {
    await p.destroy().catch(() => {});
  }
}

const dipendenti = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'dipendenti.json'), 'utf-8'));
const costiGenerali = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'costi-generali.json'), 'utf-8'));
const dipByCF = new Map();
for (const d of dipendenti) {
  if (d.codiceFiscale) dipByCF.set(d.codiceFiscale, d);
}
console.log(`Dipendenti con CF: ${dipByCF.size}`);

const pdfFiles = fs.readdirSync(SPLIT_DIR).filter(f => f.endsWith('.pdf')).sort();
console.log(`PDF da elaborare: ${pdfFiles.length}`);

let created = 0;
let updated = 0;
let failed = 0;
const results = [];

for (const filename of pdfFiles) {
  const src = path.join(SPLIT_DIR, filename);
  const buffer = fs.readFileSync(src);
  let parsed;
  let usedFallback = false;
  try {
    parsed = await parseBustaPagaPdf(buffer);
  } catch (e) {
    try {
      parsed = await fallbackParse(buffer);
      usedFallback = true;
    } catch (e2) {
      console.log(`✗ ${filename}: errore parse (anche fallback) — ${e2.message}`);
      failed++;
      results.push({ filename, status: 'error', error: `primary: ${e.message} | fallback: ${e2.message}` });
      continue;
    }
  }
  try {
    const dip = dipByCF.get(parsed.codiceFiscale);
    if (!dip) {
      console.log(`✗ ${filename}: CF ${parsed.codiceFiscale} non matcha nessun dipendente — skip`);
      failed++;
      results.push({ filename, status: 'no-match', cf: parsed.codiceFiscale });
      continue;
    }

    // Sposta il PDF in uploads/pdf/ con nome UUID-based (stesso pattern del backend)
    const destFilename = `${Date.now()}-${randomUUID().slice(0, 8)}.pdf`;
    const destPath = path.join(UPLOADS_DIR, destFilename);
    fs.copyFileSync(src, destPath);
    const fileUrl = `/uploads/pdf/${destFilename}`;

    // Check idempotenza: (categoria=stipendi, dipendenteId, periodo) esiste?
    const existing = costiGenerali.find(r =>
      r.categoria === 'stipendi' &&
      r.dipendenteId === dip.id &&
      r.periodo === parsed.periodo
    );
    const today = new Date().toISOString().slice(0, 10);

    if (existing) {
      existing.allegato = fileUrl;
      existing.importo = parsed.imponibileMensile;
      existing.descrizione = `Busta paga ${parsed.meseLabel}`;
      existing.pagato = true;
      if (!existing.dataPagamento) existing.dataPagamento = today;
      console.log(`✓ ${filename}: AGGIORNATA${usedFallback ? ' (fallback)' : ''} — ${dip.cognome} ${dip.nome} ${parsed.meseLabel} €${parsed.imponibileMensile}`);
      updated++;
    } else {
      const newRec = {
        id: randomUUID(),
        categoria: 'stipendi',
        fornitore: `${dip.cognome} ${dip.nome}`,
        descrizione: `Busta paga ${parsed.meseLabel}`,
        data: today,
        importo: parsed.imponibileMensile,
        pagato: true,
        dataPagamento: today,
        allegato: fileUrl,
        dipendenteId: dip.id,
        periodo: parsed.periodo,
      };
      costiGenerali.push(newRec);
      console.log(`✓ ${filename}: NUOVA${usedFallback ? ' (fallback)' : ''} — ${dip.cognome} ${dip.nome} ${parsed.meseLabel} €${parsed.imponibileMensile}`);
      created++;
    }
    results.push({ filename, status: existing ? 'updated' : 'created', cognome: dip.cognome, nome: dip.nome, periodo: parsed.periodo, importo: parsed.imponibileMensile, fallback: usedFallback });
  } catch (e) {
    console.log(`✗ ${filename}: errore — ${e.message}`);
    failed++;
    results.push({ filename, status: 'error', error: e.message });
  }
}

// Scrivi costi-generali aggiornato
fs.writeFileSync(path.join(DATA_DIR, 'costi-generali.json'), JSON.stringify(costiGenerali, null, 2), 'utf-8');
fs.writeFileSync(path.join(DATA_DIR, '_buste-paga-import-report.json'), JSON.stringify(results, null, 2), 'utf-8');

console.log(`\n✅ Risultato: ${created} create, ${updated} aggiornate, ${failed} fallite`);
console.log(`Report: ${path.join(DATA_DIR, '_buste-paga-import-report.json')}`);
