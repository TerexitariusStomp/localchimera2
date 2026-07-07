import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sdkRoot = path.join(__dirname, '..', '..', 'browser-sdk');
const bundleSrc = path.join(sdkRoot, 'dist', 'bundle.js');
const destDir = path.join(__dirname, '..', 'example', 'browser-sdk-dist');
const destFile = path.join(destDir, 'index.js');

function getLatestSourceMtime(dir) {
  let latest = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      latest = Math.max(latest, getLatestSourceMtime(fullPath));
    } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.js'))) {
      latest = Math.max(latest, fs.statSync(fullPath).mtimeMs);
    }
  }
  return latest;
}

// Build the bundled browser SDK if it is missing or stale.
if (!fs.existsSync(bundleSrc) || fs.statSync(bundleSrc).mtimeMs < getLatestSourceMtime(path.join(sdkRoot, 'src'))) {
  console.log('Building browser SDK bundle...');
  const result = spawnSync('npm', ['run', 'build:bundle'], { cwd: sdkRoot, stdio: 'inherit', shell: true });
  if (result.status !== 0) {
    throw new Error(`Browser SDK bundle build failed with status ${result.status}`);
  }
}

if (!fs.existsSync(bundleSrc)) {
  throw new Error(`Browser SDK bundle not found at ${bundleSrc}`);
}

fs.rmSync(destDir, { recursive: true, force: true });
fs.mkdirSync(destDir, { recursive: true });
fs.copyFileSync(bundleSrc, destFile);

console.log('Copied browser-sdk bundle to example/browser-sdk-dist/index.js');
