const assert = require('node:assert/strict');
const test = require('node:test');
const packageJson = require('../package.json');

test('normal distribution targets only approved release artifacts', () => {
  assert.deepEqual(packageJson.build.win.target, ['nsis']);
  assert.deepEqual(packageJson.build.linux.target, ['AppImage']);
});

test('standalone Windows build is explicit, isolated, x64-only, and never published', () => {
  const command = packageJson.scripts['dist:standalone:win'];

  assert.equal(typeof command, 'string');
  assert.match(command, /electron-builder --win portable --x64/);
  assert.match(command, /--publish never/);
  assert.match(command, /--config\.directories\.output=dist\/standalone/);
  assert.doesNotMatch(packageJson.scripts.dist, /portable|standalone/);
});

test('standalone artifacts are unmistakably labeled as test output', () => {
  assert.equal(
    packageJson.build.portable.artifactName,
    'AstraDock-Local-${version}-standalone-test-${arch}.${ext}'
  );
});

test('Exporter-focused standalone build is isolated from normal packaging', () => {
  const command = packageJson.scripts['dist:standalone:exporter:win'];

  assert.equal(typeof command, 'string');
  assert.match(command, /build:renderer:exporter/);
  assert.match(command, /electron-builder --win portable --x64/);
  assert.match(command, /--publish never/);
  assert.match(command, /dist\/standalone-exporter/);
  assert.match(command, /exporter-standalone-test/);
  assert.doesNotMatch(packageJson.scripts.dist, /exporter|standalone/);
});
