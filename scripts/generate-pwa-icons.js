import sharp from 'sharp';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const inputImage = path.join(__dirname, '../client/public/logo_gb_1.png');
const outputDir = path.join(__dirname, '../client/public');

const sizes = [
  { name: 'pwa-192x192.png', size: 192 },
  { name: 'pwa-512x512.png', size: 512 },
  { name: 'apple-touch-icon.png', size: 180 },
  { name: 'favicon.ico', size: 32 },
];

async function generateIcons() {
  console.log('Generating PWA icons from:', inputImage);

  for (const { name, size } of sizes) {
    const outputPath = path.join(outputDir, name);

    await sharp(inputImage)
      .resize(size, size, {
        fit: 'contain',
        background: { r: 255, g: 255, b: 255, alpha: 1 }
      })
      .png()
      .toFile(outputPath);

    console.log(`Generated: ${name} (${size}x${size})`);
  }

  console.log('All PWA icons generated successfully!');
}

generateIcons().catch(console.error);
