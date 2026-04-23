/**
 * Cerca "Capo Sorrento" (e varianti) in tutti i PDF/docx in Lavori/
 */
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { PDFParse } from 'pdf-parse';

const ROOT = 'C:/Users/tecni/Desktop/Lavori';
const KEYWORDS = [/capo\s*sorrento/i, /paramento\s*murario/i, /via\s*capo/i];

function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(full));
    else if (e.isFile() && /\.(pdf|docx)$/i.test(e.name)) out.push(full);
  }
  return out;
}

async function parsePDF(file) {
  const buffer = fs.readFileSync(file);
  const p = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const r = await p.getText();
    return r.text || '';
  } finally {
    await p.destroy().catch(() => {});
  }
}

function parseDocx(file) {
  try {
    return execSync(`unzip -p "${file}" word/document.xml 2>nul`, { encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024 })
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ');
  } catch { return ''; }
}

const files = walk(ROOT);
console.log(`Scansione ${files.length} file...\n`);

for (const file of files) {
  let text = '';
  try {
    if (file.toLowerCase().endsWith('.pdf')) text = await parsePDF(file);
    else text = parseDocx(file);
  } catch (e) {
    console.log(`✗ ${file}: ${e.message}`);
    continue;
  }
  const hits = [];
  for (const kw of KEYWORDS) {
    const m = text.match(new RegExp(`.{0,120}${kw.source}.{0,120}`, 'gi'));
    if (m) hits.push(...m);
  }
  if (hits.length > 0) {
    console.log(`\n=== ${file.replace(ROOT, '')} ===`);
    hits.slice(0, 5).forEach(h => console.log('  >', h.replace(/\s+/g, ' ').trim().slice(0, 250)));
  }
}
