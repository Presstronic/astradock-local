const assert = require('node:assert/strict');
const test = require('node:test');
const { getBuildCompatibilityCatalog, OBSERVED_BUILD_CATALOG } = require('../src/buildCompatibilityCatalog');
const { getDefaultBlueprintExtractionProfiles } = require('../src/exporter/blueprintExporter');

test('registers every build observed in the owner-supplied historical corpus', () => {
  const catalog = getBuildCompatibilityCatalog();
  assert.equal(catalog.version, 1);
  assert.equal(catalog.builds.length, 44);
  assert.equal(catalog.builds[0].build, '10480022');
  assert.equal(catalog.builds.at(-1).build, '12572603');
  assert.equal(catalog.builds.reduce((sum, entry) => sum + entry.observedFileCount, 0), 437);
  assert.equal(new Set(catalog.builds.map((entry) => entry.build)).size, catalog.builds.length);
  assert.ok(catalog.builds.some((entry) => entry.build === '10480022' && entry.capabilities.blueprint.status === 'not_evaluated'));
});

test('blueprint support is a narrower capability than build registration', () => {
  const supportedBuilds = new Set(getDefaultBlueprintExtractionProfiles().flatMap((profile) => profile.builds));
  const supportedCatalogBuilds = new Set(OBSERVED_BUILD_CATALOG
    .filter((entry) => entry.capabilities.blueprint.status === 'supported')
    .map((entry) => entry.build));
  assert.ok(supportedCatalogBuilds.has('11875683'));
  assert.ok(supportedCatalogBuilds.has('12535871'));
  assert.ok([...supportedCatalogBuilds].every((build) => supportedBuilds.has(build)));
  assert.ok(OBSERVED_BUILD_CATALOG.some((entry) => entry.build === '10766222' && !supportedCatalogBuilds.has(entry.build)));
});
