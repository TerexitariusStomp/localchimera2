// Patches react-native-bare-kit for React Native 0.76 compatibility.
// The BareKitPackage.java in the package uses the old 6-arg ReactModuleInfo
// constructor. In RN 0.76 the 7-arg constructor is required, with the last
// boolean isTurboModule. Without it, RN treats BareKit as a plain native
// module, calls getModule("BareKit") which returns null, and crashes with a
// NullPointerException. The react-native.config.js also points to a missing
// root CMakeLists.txt; the Android CMakeLists is under android/CMakeLists.txt.
// We also keep the getEnforcing -> get change so the JS layer can gracefully
// degrade if the TurboModule is still unavailable.
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

// 2. Patch BareKitPackage.java to use the 7-arg ReactModuleInfo constructor
// with isTurboModule=true. This is the root cause of the NPE in release builds.
const javaFile = path.join(baseDir, 'android', 'src', 'main', 'java', 'to', 'holepunch', 'bare', 'kit', 'react', 'BareKitPackage.java');
if (fs.existsSync(javaFile)) {
  let content = fs.readFileSync(javaFile, 'utf-8');
  if (!content.includes('__patched_7arg')) {
    content = content.replace(
      'map.put(NAME, new ReactModuleInfo(NAME, NAME, false, false, true, true));',
      'map.put(NAME, new ReactModuleInfo(NAME, NAME, false, false, true, false, true)); // __patched_7arg'
    );
    fs.writeFileSync(javaFile, content);
    console.log('[patch-bare-kit] Patched BareKitPackage.java: 7-arg ReactModuleInfo constructor');
  } else {
    console.log('[patch-bare-kit] BareKitPackage.java already patched');
  }
} else {
  console.log('[patch-bare-kit] BareKitPackage.java not found');
}

// 3. Patch react-native.config.js to point to the actual Android CMakeLists.txt
const configFile = path.join(baseDir, 'react-native.config.js');
if (fs.existsSync(configFile)) {
  let content = fs.readFileSync(configFile, 'utf-8');
  if (content.includes("cxxModuleCMakeListsPath: 'CMakeLists.txt'")) {
    content = content.replace(
      "cxxModuleCMakeListsPath: 'CMakeLists.txt'",
      "cxxModuleCMakeListsPath: 'android/CMakeLists.txt'"
    );
    fs.writeFileSync(configFile, content);
    console.log('[patch-bare-kit] Patched react-native.config.js: CMakeLists path -> android/CMakeLists.txt');
  } else {
    console.log('[patch-bare-kit] react-native.config.js already patched or path differs');
  }
} else {
  console.log('[patch-bare-kit] react-native.config.js not found');
}

console.log('[patch-bare-kit] Done');
