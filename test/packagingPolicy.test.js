const assert = require('node:assert/strict');
const test = require('node:test');
const packageJson = require('../package.json');

test('normal distribution targets only approved release artifacts', () => {
  assert.deepEqual(packageJson.build.win.target, ['nsis']);
  assert.deepEqual(packageJson.build.linux.target, ['AppImage']);
  assert.equal(packageJson.build.asar, true);
  assert.equal(packageJson.build.nsis.perMachine, false);
  assert.equal(packageJson.build.nsis.allowElevation, false);
  assert.equal(packageJson.build.linux.desktopName, 'astradock-local');
  assert.equal(packageJson.build.linux.artifactName, 'AstraDock-Local-${version}-${arch}.${ext}');
});

test('normal distribution scripts are explicit, x64-only, and never publish', () => {
  for (const [name, target, output] of [
    ['dist:win', '--win nsis --x64', 'dist/release/win'],
    ['dist:linux', '--linux AppImage --x64', 'dist/release/linux']
  ]) {
    const command = packageJson.scripts[name];
    assert.match(command, new RegExp(`electron-builder ${target}`));
    assert.match(command, /--publish never/);
    assert.match(command, new RegExp(output.replaceAll('/', '\\/')));
  }
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
  assert.match(command, /blueprint-exporter/);
  assert.doesNotMatch(packageJson.scripts.dist, /exporter|standalone/);
});

test('Exporter-focused Linux artifact remains explicitly labeled', () => {
  const command = packageJson.scripts['dist:standalone:exporter:linux'];
  assert.match(command, /--linux AppImage --x64/);
  assert.match(command, /--publish never/);
  assert.match(command, /blueprint-exporter/);
  assert.match(command, /standalone-exporter-linux/);
});
