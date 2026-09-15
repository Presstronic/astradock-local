const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const failures = [];

function required(condition, message) {
  if (!condition) failures.push(message);
}

required(packageJson.build?.asar === true, 'application files must be packaged in ASAR');
required(Array.isArray(packageJson.build?.files) && packageJson.build.files.length > 0, 'package file allowlist is required');
required(JSON.stringify(packageJson.build.files).includes('src/**/*'), 'runtime source must be explicitly allowlisted');
required(JSON.stringify(packageJson.build.files).includes('dist/renderer/**/*'), 'built renderer must be explicitly allowlisted');
required(packageJson.build?.win?.target?.join(',') === 'nsis', 'Windows release must target NSIS only');
required(packageJson.build?.linux?.target?.join(',') === 'AppImage', 'Linux release must target AppImage only');
required(packageJson.build?.nsis?.perMachine === false, 'Windows install must be per-user');
required(packageJson.build?.nsis?.allowElevation === false, 'Windows install must not elevate');
required(!String(packageJson.build?.linux?.artifactName).includes('standalone'), 'Linux release artifact must not be labeled standalone');
required(/--publish never/.test(packageJson.scripts.dist || ''), 'generic distribution script must not publish');
required(/--publish never/.test(packageJson.scripts['dist:win'] || ''), 'Windows release script must not publish');
required(/--publish never/.test(packageJson.scripts['dist:linux'] || ''), 'Linux release script must not publish');

if (failures.length) {
  console.error('Release packaging audit failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log('Release packaging audit passed.');
}
