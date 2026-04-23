import { PDFParse } from 'pdf-parse';
import fs from 'fs';
import path from 'path';

function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(full));
    else if (/\.pdf$/i.test(e.name)) out.push(full);
  }
  return out;
}

const files = walk('C:/Users/tecni/Desktop/Lavori');
console.log('PDFs:', files.length);

for (const file of files) {
  try {
    const p = new PDFParse({ data: new Uint8Array(fs.readFileSync(file)) });
    const r = await p.getText();
    const t = r.text || '';
    const m = t.match(/.{0,120}(capo\s*sorrento|via\s*capo|sorrento).{0,120}/gi);
    if (m && m.length > 0) {
      console.log('\n=== ' + file.replace('C:/Users/tecni/Desktop/Lavori', '') + ' ===');
      m.slice(0, 5).forEach(x => console.log('  >', x.replace(/\s+/g, ' ').trim().slice(0, 300)));
    }
    await p.destroy();
  } catch (e) {
    console.log('✗', file, e.message);
  }
}
console.log('\n--- fine scansione ---');
