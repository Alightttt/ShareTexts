// Convert the OG SVG to PNG at 1200x630
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const svgPath = path.join(__dirname, '..', 'public', 'og', 'sharetext-og-v2.svg');
const pngPath = path.join(__dirname, '..', 'public', 'og', 'sharetext-og-v2.png');

const svg = fs.readFileSync(svgPath, 'utf8');

sharp(Buffer.from(svg))
  .resize(1200, 630)
  .png({ quality: 95 })
  .toFile(pngPath)
  .then(() => {
    const stats = fs.statSync(pngPath);
    console.log(`PNG created: ${pngPath} (${(stats.size / 1024).toFixed(1)} KB)`);
  })
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
