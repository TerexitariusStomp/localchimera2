// Patches react-native-bare-kit to gracefully handle missing TurboModule
// in release builds. The BareKitPackage.getModule() returns null, causing
// a NullPointerException when React Native tries to initialize it.
// Fix: remove BareKit from the module info map so RN never tries to create it.
const fs = require('fs');
const path = require('path');

const baseDir = path.join(__dirname, '..', 'node_modules', 'react-native-bare-kit');

// 1. Patch NativeBareKit.ts: getEnforcing -> get (returns null instead of throwing)
const specsFile = path.join(baseDir, 'specs', 'NativeBareKit.ts');
if (fs.existsSync(specsFile)) {
  let content = fs.readFileSync(specsFile, 'utf-8');
  if (content.includes('getEnforcing')) {
    content = content.replace('TurboModuleRegistry.getEnforcing', 'TurboModuleRegistry.get');
    fs.writeFileSync(specsFile, content);
    console.log('[patch-bare-kit] Patched NativeBareKit.ts: getEnforcing -> get');
  } else {
    console.log('[patch-bare-kit] NativeBareKit.ts already patched or no getEnforcing found');
  }
} else {
  console.log('[patch-bare-kit] NativeBareKit.ts not found');
}

// 2. Patch BareKitPackage.java to not register the BareKit module at all.
// This prevents React Native from trying to call getModule("BareKit") which
// returns null and causes a NullPointerException.
const javaFile = path.join(baseDir, 'android', 'src', 'main', 'java', 'to', 'holepunch', 'bare', 'kit', 'react', 'BareKitPackage.java');
if (fs.existsSync(javaFile)) {
  let content = fs.readFileSync(javaFile, 'utf-8');
  if (!content.includes('__patched_empty_map')) {
    // Replace the getReactModuleInfoProvider to return an empty map
    // so RN never tries to instantiate BareKit
    content = content.replace(
      /return \(\) -> \{[\s\S]*?return map;[\s\S]*?\};/,
      'return () -> { return new java.util.HashMap<>(); }; // __patched_empty_map'
    );
    fs.writeFileSync(javaFile, content);
    console.log('[patch-bare-kit] Patched BareKitPackage.java: empty module info map');
  } else {
    console.log('[patch-bare-kit] BareKitPackage.java already patched');
  }
} else {
  console.log('[patch-bare-kit] BareKitPackage.java not found');
}

// 3. Overwrite index.js with a minimal stub. The real BareKit module
// can't be loaded (TurboModule not available in release builds), so
// we replace the entire file with stubs that throw catchable Errors
// when @qvac/sdk tries to use them. App.js's try/catch handles this.
const indexFile = path.join(baseDir, 'index.js');
if (fs.existsSync(indexFile)) {
  let content = fs.readFileSync(indexFile, 'utf-8');
  if (!content.includes('__bareKitPatched')) {
    const stubCode = `// __bareKitPatched: stub for release builds where TurboModule is unavailable
console.warn('[BareKit] TurboModule not available - AI features disabled');
class Worklet {
  constructor() { throw new Error('BareKit not available in this build'); }
}
class IPC {
  constructor() { throw new Error('BareKit not available in this build'); }
}
module.exports = { Worklet, IPC };
`;
    fs.writeFileSync(indexFile, stubCode);
    console.log('[patch-bare-kit] Replaced index.js with stub (original backed up)');
    // Backup original for reference
    fs.writeFileSync(indexFile + '.orig', content);
  } else {
    console.log('[patch-bare-kit] index.js already patched');
  }
} else {
  console.log('[patch-bare-kit] index.js not found');
}

console.log('[patch-bare-kit] Done');
