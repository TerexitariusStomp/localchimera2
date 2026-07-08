const fs = require('fs');
const path = require('path');
const { withDangerousMod } = require('@expo/config-plugins');
const { execSync } = require('child_process');

const SOURCE_DIR = 'assets/frontend';
const TARGET_DIR = 'Resources';

function copyRecursive(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function withIosFrontendResources(config) {
  return withDangerousMod(config, [
    'ios',
    async (cfg) => {
      const projectRoot = cfg.modRequest.projectRoot;
      const iosDir = path.join(projectRoot, 'ios');
      const projectName = cfg.modRequest.projectName || 'Chimera';
      const srcDir = path.join(projectRoot, SOURCE_DIR);
      const destDir = path.join(iosDir, projectName, TARGET_DIR);

      if (!fs.existsSync(srcDir)) {
        throw new Error(`withIosFrontendResources: source dir not found: ${srcDir}`);
      }

      copyRecursive(srcDir, destDir);
      console.log(`[withIosFrontendResources] copied frontend assets to ${destDir}`);

      // Run script to add resources to Xcode project
      try {
        execSync('node scripts/add-ios-resources.js', {
          cwd: projectRoot,
          stdio: 'inherit',
        });
      } catch (e) {
        console.warn('[withIosFrontendResources] could not update Xcode project:', e.message);
      }

      return cfg;
    },
  ]);
}

module.exports = withIosFrontendResources;
