const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, '../../../qvac/frontend/dist');
const destDir = path.join(__dirname, '../assets/frontend');
const androidAssetsDir = path.join(__dirname, '../android/app/src/main/assets');
const iosAssetsDir = path.join(__dirname, '../ios/Chimera/Resources');

function copyRecursive(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * vite-plugin-singlefile inlines the JS bundle in the <head>. For mobile
 * WebView loads (file://) the script executes before the <div id="root">
 * exists, so React never mounts. Move the inline module script to the end of
 * <body> right after the root div, keeping the bundle inline so file:// module
 * issues are avoided.
 */
function fixSingleFileHtml(filePath) {
  if (!fs.existsSync(filePath)) return;
  let html = fs.readFileSync(filePath, 'utf8');
  const moduleStart = html.search(/<script type="module"[^>]*>/i);
  if (moduleStart === -1) return;
  const moduleEnd = html.indexOf('</script>', moduleStart);
  if (moduleEnd === -1) return;
  const scriptBlock = html.slice(moduleStart, moduleEnd + '</script>'.length);

  // Remove the module script from the head first, then find the root div.
  html = html.slice(0, moduleStart) + html.slice(moduleEnd + '</script>'.length);
  const rootDivIdx = html.indexOf('<div id="root"></div>');
  if (rootDivIdx === -1) return;
  const rootDivEnd = html.indexOf('</div>', rootDivIdx) + '</div>'.length;

  // Insert the module script right after the root div.
  html = html.slice(0, rootDivEnd) + '\n' + scriptBlock + html.slice(rootDivEnd);
  fs.writeFileSync(filePath, html);
  console.log('Moved inline module script after root div:', filePath);
}

if (!fs.existsSync(srcDir)) {
  console.error('Frontend build directory not found:', srcDir);
  console.error('Run: cd qvac/frontend && npm run build');
  process.exit(1);
}

// Copy to Expo assets (also creates destination directories)
copyRecursive(srcDir, destDir);

// Copy wllama wasm to the asset roots so the fallback inference engine can load it
// relative to the loaded index.html (file:///android_asset/wllama.wasm).
const wllamaWasmSrc = path.join(__dirname, '../../../qvac/frontend/node_modules/@wllama/wllama/esm/wasm/wllama.wasm');
if (fs.existsSync(wllamaWasmSrc)) {
  fs.copyFileSync(wllamaWasmSrc, path.join(destDir, 'wllama.wasm'));
  fs.copyFileSync(wllamaWasmSrc, path.join(androidAssetsDir, 'wllama.wasm'));
  console.log('wllama.wasm copied to asset roots');
} else {
  console.warn('wllama.wasm not found at', wllamaWasmSrc);
}
console.log('Frontend assets copied to:', destDir);

// Copy to Android native assets directory (create if missing).
// This is required for the files to be included in the APK as raw assets.
copyRecursive(srcDir, androidAssetsDir);
console.log('Frontend assets copied to Android assets:', androidAssetsDir);

// Fix single-file HTML ordering for mobile WebView.
fixSingleFileHtml(path.join(destDir, 'index.html'));
fixSingleFileHtml(path.join(androidAssetsDir, 'index.html'));

// Copy to iOS bundle resources if ios/ project exists
if (fs.existsSync(path.join(__dirname, '../ios'))) {
  copyRecursive(srcDir, iosAssetsDir);
  fixSingleFileHtml(path.join(iosAssetsDir, 'index.html'));
  if (fs.existsSync(wllamaWasmSrc)) {
    fs.copyFileSync(wllamaWasmSrc, path.join(iosAssetsDir, 'wllama.wasm'));
  }
  console.log('Frontend assets copied to iOS resources:', iosAssetsDir);

  // Add files to Xcode project
  try {
    require('child_process').execSync('node scripts/add-ios-resources.js', {
      cwd: path.join(__dirname, '..'),
      stdio: 'inherit',
    });
  } catch (e) {
    console.warn('Could not update Xcode project:', e.message);
  }
}
