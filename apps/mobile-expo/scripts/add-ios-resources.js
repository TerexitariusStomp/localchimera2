const fs = require('fs');
const path = require('path');

const pbxprojPath = path.join(__dirname, '../ios/Chimera.xcodeproj/project.pbxproj');
const resourcesDir = path.join(__dirname, '../ios/Chimera/Resources');

if (!fs.existsSync(pbxprojPath)) { console.error('pbxproj not found'); process.exit(1); }
if (!fs.existsSync(resourcesDir)) { console.error('Resources dir not found'); process.exit(1); }

let pbx = fs.readFileSync(pbxprojPath, 'utf8');

// Get all files in Resources dir
const files = fs.readdirSync(resourcesDir).filter(f => fs.statSync(path.join(resourcesDir, f)).isFile());

// Find existing file references to avoid duplicates — check build phase for existing file names
const existingRefs = new Set();
// Match patterns like: NAMEID /* filename in Resources */,
const buildFileRegex = /\/\*\s+(\S+)\s+in Resources\s+\*\//g;
let m;
while ((m = buildFileRegex.exec(pbx)) !== null) {
  existingRefs.add(m[1]);
}
// Also check PBXFileReference entries for path = "Chimera/Resources/filename"
const refPathRegex = /path = "Chimera\/Resources\/([^"]+)"/g;
while ((m = refPathRegex.exec(pbx)) !== null) {
  existingRefs.add(m[1]);
}

// Find the Resources build phase
const buildPhaseRegex = /13B07F8E1A680F5B00A75B9A \/\* Resources \*\/ = \{\s*isa = PBXResourcesBuildPhase;\s*buildActionMask = \d+;\s*files = \(([\s\S]*?)\);/;
const buildPhaseMatch = pbx.match(buildPhaseRegex);
if (!buildPhaseMatch) { console.error('Resources build phase not found'); process.exit(1); }

let filesContent = buildPhaseMatch[1];
const newFileRefs = [];
const newBuildFiles = [];

for (const file of files) {
  if (existingRefs.has(file)) {
    console.log(`Already exists: ${file}`);
    continue;
  }

  // Generate unique 24-char hex IDs
  const fileRefId = Array.from({length: 24}, () => 'ABCDEF0123456789'[Math.floor(Math.random() * 16)]).join('');
  const buildFileId = Array.from({length: 24}, () => 'ABCDEF0123456789'[Math.floor(Math.random() * 16)]).join('');

  // Add PBXFileReference
  newFileRefs.push(`\t\t${fileRefId} /* ${file} */ = {isa = PBXFileReference; lastKnownFileType = file; name = ${file}; path = "Chimera/Resources/${file}"; sourceTree = "<group>"; };`);

  // Add PBXBuildFile
  newBuildFiles.push(`\t\t${buildFileId} /* ${file} in Resources */ = {isa = PBXBuildFile; fileRef = ${fileRefId} /* ${file} */; };`);

  // Add to build phase files
  filesContent += `\n\t\t\t\t${buildFileId} /* ${file} in Resources */,`;

  console.log(`Added: ${file}`);
}

if (newFileRefs.length === 0) {
  console.log('All files already in project.');
  process.exit(0);
}

// Insert PBXBuildFile entries before the "End PBXBuildFile section" marker
pbx = pbx.replace(/\/\* End PBXBuildFile section \*\//, newBuildFiles.join('\n') + '\n/* End PBXBuildFile section */');

// Insert PBXFileReference entries before the "End PBXFileReference section" marker
pbx = pbx.replace(/\/\* End PBXFileReference section \*\//, newFileRefs.join('\n') + '\n/* End PBXFileReference section */');

// Update the build phase files list
pbx = pbx.replace(buildPhaseMatch[1], filesContent);

// Add file refs to the Chimera group's children
// Find the Chimera group and add references
const groupRegex = /(13B07F9E1A680F5B00A75B9A)\/\*\s*Chimera\s*\*\/ = {[\s\S]*?children = \(([\s\S]*?)\);/;
const groupMatch = pbx.match(groupRegex);
if (groupMatch) {
  let children = groupMatch[2];
  for (const file of files) {
    // Find the fileRefId we generated for this file
    const refLine = newFileRefs.find(r => r.includes(`/* ${file} */`));
    if (refLine) {
      const id = refLine.split(' ')[0].trim();
      children += `\n\t\t\t\t${id} /* ${file} */,`;
    }
  }
  pbx = pbx.replace(groupMatch[2], children);
}

fs.writeFileSync(pbxprojPath, pbx);
console.log(`Added ${newFileRefs.length} files to Xcode project.`);
