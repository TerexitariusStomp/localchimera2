const fs = require('fs');
const path = require('path');

function findDist() {
  const candidates = [
    path.resolve(__dirname, '..', '..', '..', 'qvac', 'frontend', 'dist'),
    path.resolve(__dirname, '..', '..', '..', '..', 'qvac', 'frontend', 'dist'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

const src = findDist();
if (!src) {
  console.error('Error: qvac/frontend/dist not found at any candidate path');
  process.exit(1);
}

const dst = path.resolve(__dirname, '..', 'dist');
fs.rmSync(dst, { recursive: true, force: true });
fs.cpSync(src, dst, { recursive: true });
console.log('Copied', src, '->', dst);
