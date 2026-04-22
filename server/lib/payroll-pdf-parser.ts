// Parser per buste paga PDF generate dal template Buffetti (layout fisso).
// Estrae solo i campi strettamente necessari per matchare il costo generale:
//   - codice fiscale dipendente (16 caratteri, identifica univocamente)
//   - periodo retributivo (es. GENNAIO/2026 → "2026-01")
//   - imponibile mensile (IMPONIBILE INPS / TOTALE COMPETENZE — primo
//     importo della riga di riepilogo finale)
//
// Robustezza: se uno qualsiasi di questi 3 campi non viene estratto, la
// funzione lancia un errore con dettaglio → l'endpoint segnala il PDF
// come "failed" e l'admin può decidere manualmente.

import { logger } from './logger.js';

const MESI_NOMI_IT = [
  'GENNAIO', 'FEBBRAIO', 'MARZO', 'APRILE', 'MAGGIO', 'GIUGNO',
  'LUGLIO', 'AGOSTO', 'SETTEMBRE', 'OTTOBRE', 'NOVEMBRE', 'DICEMBRE',
];

export interface BustaPagaParsed {
  codiceFiscale: string;
  periodo: string;            // "YYYY-MM"
  imponibileMensile: number;  // EUR — imponibile INPS / totale competenze
  meseLabel: string;          // "Gennaio 2026"
  // Diagnostica (utile per debug / UI): chi è il dipendente secondo il PDF.
  nomePdf?: string;
}

function parseItalianAmount(raw: string): number {
  // "1.445,00" → 1445.00 ; "9,89982" → 9.89982
  const normalized = raw.replace(/\./g, '').replace(',', '.');
  const n = Number(normalized);
  if (!isFinite(n)) throw new Error(`Importo non valido: "${raw}"`);
  return n;
}

function extractPeriodo(text: string): { periodo: string; meseLabel: string } {
  // Il PDF riporta "GENNAIO /2026" (con o senza spazio prima dello slash).
  // Cerchiamo il primo nome-mese seguito da slash e anno a 4 cifre.
  const pattern = new RegExp(`(${MESI_NOMI_IT.join('|')})\\s*/\\s*(\\d{4})`, 'i');
  const m = pattern.exec(text);
  if (!m) throw new Error('Periodo retributivo non trovato (formato atteso: "MESE /ANNO")');
  const meseUpper = m[1].toUpperCase();
  const idx = MESI_NOMI_IT.indexOf(meseUpper);
  if (idx < 0) throw new Error(`Mese sconosciuto: ${m[1]}`);
  const year = Number(m[2]);
  const mm = String(idx + 1).padStart(2, '0');
  const meseCapital = meseUpper.charAt(0) + meseUpper.slice(1).toLowerCase();
  return { periodo: `${year}-${mm}`, meseLabel: `${meseCapital} ${year}` };
}

function extractCodiceFiscale(text: string): string {
  // Codice fiscale italiano: 16 caratteri [A-Z0-9]. Per evitare falsi
  // positivi su altre sigle a 16 chars, pretendiamo il formato canonico:
  // 6 lettere + 2 cifre + 1 lettera + 2 cifre + 1 lettera + 3 cifre + 1 lettera.
  const pattern = /[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]/;
  const m = pattern.exec(text);
  if (!m) throw new Error('Codice fiscale del dipendente non trovato');
  return m[0];
}

function extractImponibileMensile(text: string): number {
  // Nel layout Buffetti le label ("TOTALE COMPETENZE", "NETTO IN BUSTA",
  // ecc.) sono grafiche del template, non testo estraibile. La riga di
  // riepilogo finale è però riconoscibile perché è l'unica con 6 importi
  // in formato italiano a 2 decimali esatti:
  //   TOT.COMPETENZE  TOT.RIT.SOCIALI  TOT.RIT.FISCALI  ARR.PREC.  ARR.ATTUALE  NETTO IN BUSTA
  //   1.663,17        157,32           45,42            0,16       -0,38        1.445,00
  // Ci interessa il PRIMO importo (TOTALE COMPETENZE = imponibile INPS/mensile),
  // non l'ultimo (netto in busta): è il valore che rappresenta il costo
  // lavoro del dipendente prima delle ritenute.
  const amountRegex = /-?\d{1,3}(?:\.\d{3})*,\d{2}(?!\d)/g;
  const lines = text.split(/\r?\n/);

  // Candidate: righe con almeno 6 importi a 2 decimali esatti. In pratica
  // nella busta Buffetti ce n'è una sola. Prendiamo il PRIMO importo della
  // riga (TOTALE COMPETENZE = imponibile); discriminiamo su positività del
  // primo come filtro di sicurezza.
  const candidates: Array<{ line: string; firstAmount: number }> = [];
  for (const line of lines) {
    const matches = line.match(amountRegex);
    if (!matches || matches.length < 6) continue;
    const firstNum = parseItalianAmount(matches[0]);
    candidates.push({ line, firstAmount: firstNum });
  }
  if (candidates.length === 0) {
    throw new Error('Riga di riepilogo finale non trovata (6 importi formato italiano)');
  }
  // Preferiamo il totale competenze positivo (non nullo). Se tutte le
  // candidate hanno il primo ≤0, prendiamo comunque la prima (caso
  // degenerato: busta paga a zero).
  const withPositive = candidates.find(c => c.firstAmount > 0);
  const chosen = withPositive ?? candidates[0];
  return chosen.firstAmount;
}

function extractNome(text: string, codiceFiscale: string): string | undefined {
  // Layout Buffetti: la riga col CF ha nella prima posizione il cognome:
  //   "FRUTTALDO FRTLRA78D48F839K 08/04/1978 01/07/2025"
  // Il nome è sulla riga successiva (tutto maiuscolo):
  //   "LAURA"
  const lines = text.split(/\r?\n/).map(l => l.trim());
  const cfLineIdx = lines.findIndex(l => l.includes(codiceFiscale));
  if (cfLineIdx < 0) return undefined;
  const isWordMaiuscolo = (s: string) => /^[A-ZÀ-Ú'-]{2,}$/.test(s);
  const cognome = lines[cfLineIdx].split(/\s+/)[0];
  let nome: string | undefined;
  for (let i = cfLineIdx + 1; i < Math.min(lines.length, cfLineIdx + 4); i++) {
    const firstTok = lines[i].split(/\s+/)[0];
    if (isWordMaiuscolo(firstTok)) { nome = firstTok; break; }
  }
  if (cognome && nome) return `${cognome} ${nome}`;
  return isWordMaiuscolo(cognome) ? cognome : undefined;
}

export async function parseBustaPagaPdf(buffer: Buffer): Promise<BustaPagaParsed> {
  // pdf-parse v2 espone una classe PDFParse (ESM). Import dinamica per non
  // caricare pdfjs-dist al boot del server (pesante).
  const { PDFParse } = await import('pdf-parse');
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getText();
    const text = result.text || '';
    if (!text.trim()) throw new Error('PDF vuoto o non testuale (OCR non supportato)');
    return runExtraction(text);
  } finally {
    await parser.destroy().catch(() => { /* best effort cleanup */ });
  }
}

function runExtraction(text: string): BustaPagaParsed {

  try {
    const codiceFiscale = extractCodiceFiscale(text);
    const { periodo, meseLabel } = extractPeriodo(text);
    const imponibileMensile = extractImponibileMensile(text);
    const nomePdf = extractNome(text, codiceFiscale);
    return { codiceFiscale, periodo, meseLabel, imponibileMensile, nomePdf };
  } catch (err) {
    logger.error('Parsing busta paga PDF fallito', {
      err,
      preview: text.slice(0, 500),
    });
    throw err;
  }
}
