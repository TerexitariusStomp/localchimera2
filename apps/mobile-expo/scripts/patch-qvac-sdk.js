const fs = require('fs');
const path = require('path');

// Patch @qvac/sdk's withMobileBundle.js to skip bare-posix missing prebuild errors
// bare-posix doesn't ship Android prebuilds but has a JS fallback (unsupported.js)
const target = path.join(__dirname, '..', 'node_modules', '@qvac', 'sdk', 'dist', 'expo', 'plugins', 'withMobileBundle.js');

if (!fs.existsSync(target)) {
  console.log('⚠️  withMobileBundle.js not found, skipping patch');
  process.exit(0);
}

let content = fs.readFileSync(target, 'utf8');

const oldCheck = `if (hasErrors(result)) {
        throw new BundleVerificationFailedError(generatedBundle, new Error(formatVerifyBundleResult(result)));
    }`;

const newCheck = `// Patched: ignore bare-posix missing prebuild on Android (no native prebuilds, JS fallback exists)
    const filteredIssues = result.issues.filter(i => !(i.code === 'missing-prebuild' && i.addon && i.addon.includes('bare-posix')));
    const filteredResult = { ...result, issues: filteredIssues };
    if (hasErrors(filteredResult)) {
        throw new BundleVerificationFailedError(generatedBundle, new Error(formatVerifyBundleResult(result)));
    }`;

if (content.includes(oldCheck)) {
  content = content.replace(oldCheck, newCheck);
  fs.writeFileSync(target, content, 'utf8');
  console.log('✅ Patched withMobileBundle.js to skip bare-posix missing prebuild errors');
} else {
  console.log('⚠️  Could not find expected code block in withMobileBundle.js, patch may need updating');
}

// Patch @qvac/sdk's withQvacSDK.js to downgrade NDK from 29 to 27
// NDK 29's libc++ doesn't define std::char_traits<unsigned char>, breaking fbjni
const sdkDir = path.join(__dirname, '..', 'node_modules', '@qvac', 'sdk', 'dist', 'expo', 'plugins');
const qvacSdkFile = path.join(sdkDir, 'withQvacSDK.js');

if (fs.existsSync(qvacSdkFile)) {
  let qvacContent = fs.readFileSync(qvacSdkFile, 'utf8');
  if (qvacContent.includes('29.0.14206865')) {
    qvacContent = qvacContent.replace(/29\.0\.14206865/g, '27.2.12479018');
    fs.writeFileSync(qvacSdkFile, qvacContent, 'utf8');
    console.log('✅ Patched withQvacSDK.js to use NDK 27.2.12479018 instead of 29.0.14206865');
  } else {
    console.log('⚠️  NDK 29 version not found in withQvacSDK.js, skipping NDK patch');
  }
} else {
  console.log('⚠️  withQvacSDK.js not found, skipping NDK patch');
}

// Also patch withAndroidNdkVersion.js if it hardcodes the NDK version
const ndkVersionFile = path.join(sdkDir, 'withAndroidNdkVersion.js');
if (fs.existsSync(ndkVersionFile)) {
  let ndkContent = fs.readFileSync(ndkVersionFile, 'utf8');
  if (ndkContent.includes('29.0.14206865')) {
    ndkContent = ndkContent.replace(/29\.0\.14206865/g, '27.2.12479018');
    fs.writeFileSync(ndkVersionFile, ndkContent, 'utf8');
    console.log('✅ Patched withAndroidNdkVersion.js to use NDK 27.2.12479018');
  }
}
