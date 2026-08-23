import { createRequire } from 'module';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync, copyFileSync, writeFileSync } from 'fs';

// Use sharp from wrangler's transitive deps
const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');

// Path to sharp via wrangler's transitive dependency
let sharp;
try {
  sharp = require(resolve(projectRoot, 'node_modules/wrangler/node_modules/miniflare/node_modules/sharp'));
} catch {
  try {
    sharp = require('sharp');
  } catch {
    console.error('sharp not found, using fallback');
    process.exit(1);
  }
}

const codexImage = process.argv[2]; // PWA icon source
const ogImage = process.argv[3];   // OG image source

if (!codexImage || !ogImage) {
  console.error('Usage: node update-icons.mjs <codex-image-path> <og-image-path>');
  process.exit(1);
}

const publicDir = resolve(projectRoot, 'public');
const ogDir = resolve(publicDir, 'og');

async function resize(src, dest, width, height) {
  await sharp(src)
    .resize(width, height, { fit: 'cover' })
    .png({ quality: 95 })
    .toFile(dest);
  console.log(`  Created: ${dest} (${width}x${height})`);
}

async function main() {
  // === PWA Icons from Codex Image ===
  console.log('\n📱 Updating PWA icons...');
  await resize(codexImage, resolve(publicDir, 'icon-192.png'), 192, 192);
  await resize(codexImage, resolve(publicDir, 'icon-512.png'), 512, 512);
  await resize(codexImage, resolve(publicDir, 'icon-maskable-192.png'), 192, 192);
  await resize(codexImage, resolve(publicDir, 'icon-maskable-512.png'), 512, 512);
  await resize(codexImage, resolve(publicDir, 'apple-touch-icon.png'), 180, 180);
  await resize(codexImage, resolve(publicDir, 'favicon-48.png'), 48, 48);
  await resize(codexImage, resolve(publicDir, 'favicon-32.png'), 32, 32);
  await resize(codexImage, resolve(publicDir, 'favicon-16.png'), 16, 16);

  // === OG Image ===
  console.log('\n🖼️  Updating OG image...');
  await resize(ogImage, resolve(ogDir, 'sharetext-og-v6.png'), 1200, 630);
  // Also copy as jpg
  await sharp(ogImage)
    .resize(1200, 630, { fit: 'cover' })
    .jpeg({ quality: 92 })
    .toFile(resolve(ogDir, 'sharetext-og-v6.jpg'));
  console.log(`  Created: ${resolve(ogDir, 'sharetext-og-v6.jpg')} (1200x630)`);

  // Copy to root for direct access
  copyFileSync(resolve(ogDir, 'sharetext-og-v6.jpg'), resolve(publicDir, 'og-sharetext-v6.jpg'));
  console.log(`  Copied to: ${resolve(publicDir, 'og-sharetext-v6.jpg')}`);

  console.log('\n✅ All icons and OG images updated!');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
