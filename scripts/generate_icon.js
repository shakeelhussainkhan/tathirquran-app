const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const svg = `<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  <rect width="1024" height="1024" fill="#1a1005" rx="200"/>
  <rect x="20" y="20" width="984" height="984" fill="none" stroke="rgba(201,162,39,0.3)" stroke-width="2" rx="186"/>
  <text x="512" y="680" font-family="serif" font-size="600" fill="#c9a227" text-anchor="middle" dominant-baseline="middle">ط</text>
  <text x="512" y="870" font-family="sans-serif" font-size="60" fill="rgba(201,162,39,0.4)" text-anchor="middle" letter-spacing="8">TATHIRQURAN</text>
</svg>`;

const assetsDir = path.resolve(__dirname, '../assets');
if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir, { recursive: true });

fs.writeFileSync(path.join(assetsDir, 'icon.svg'), svg);

sharp(Buffer.from(svg))
  .resize(1024, 1024)
  .png()
  .toFile(path.join(assetsDir, 'icon.png'), (err) => {
    if (err) console.error(err);
    else console.log('✓ Icon generated at assets/icon.png');
  });
