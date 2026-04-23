/**
 * Split buste paga multi-pagina in PDF singoli (una busta per file).
 * Legge i 3 PDF in Dati/298 b *.pdf e genera N PDF in uploads/pdf/split/.
 *
 * Uso: node scripts/split-buste-paga.mjs
 */

import { PDFDocument } from 'pdf-lib';
import fs from 'fs';
import path from 'path';

const SOURCES = [
  { file: 'C:/Users/tecni/Desktop/Codice/Dati/298 b 1.pdf', label: 'gen-2026' },
  { file: 'C:/Users/tecni/Desktop/Codice/Dati/298 b 2.pdf', label: 'feb-2026' },
  { file: 'C:/Users/tecni/Desktop/Codice/Dati/298 b 3.pdf', label: 'mar-2026' },
];
const OUT_DIR = 'C:/Users/tecni/Desktop/Codice/GBidelloCommesse-main/uploads/pdf/split';

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

let total = 0;
for (const src of SOURCES) {
  if (!fs.existsSync(src.file)) {
    console.log('✗ non trovato:', src.file);
    continue;
  }
  const bytes = fs.readFileSync(src.file);
  const doc = await PDFDocument.load(bytes);
  const nPages = doc.getPageCount();
  console.log(`\n[${src.label}] ${nPages} pagine`);

  for (let i = 0; i < nPages; i++) {
    const single = await PDFDocument.create();
    const [page] = await single.copyPages(doc, [i]);
    single.addPage(page);
    const out = await single.save();
    const outPath = path.join(OUT_DIR, `busta-${src.label}-p${String(i + 1).padStart(2, '0')}.pdf`);
    fs.writeFileSync(outPath, out);
    console.log(`  ✓ p${i + 1} → ${path.basename(outPath)} (${out.length} bytes)`);
    total++;
  }
}
console.log(`\n✅ Totale PDF generati: ${total} in ${OUT_DIR}`);
