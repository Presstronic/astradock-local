const CATALOG_VERSION = 1;

// Observed identity is deliberately separate from parser capability. This is
// evidence from the owner-supplied backup corpus, not a support promise.
const OBSERVED_BUILD_COUNTS = Object.freeze({
  '10480022': 8, '10487514': 22, '10591185': 34, '10733565': 1,
  '10744215': 5, '10753606': 10, '10766222': 33, '10967244': 13,
  '10989003': 18, '11010425': 17, '11135423': 12, '11218823': 8,
  '11303722': 4, '11319298': 6, '11372147': 2, '11377160': 9,
  '11518367': 2, '11545720': 3, '11576750': 2, '11592622': 4,
  '11617053': 1, '11638371': 7, '11674325': 4, '11715810': 12,
  '11825000': 4, '11854421': 3, '11875683': 32, '11952564': 3,
  '12015818': 6, '12030094': 2, '12061511': 19, '12122953': 15,
  '12232306': 4, '12248363': 5, '12269732': 5, '12286454': 2,
  '12302499': 2, '12326004': 2, '12344265': 41, '12519617': 4,
  '12535871': 5, '12545750': 17, '12568521': 2, '12572603': 27
});

const BLUEPRINT_SUPPORTED_BUILDS = new Set([
  '11518367', '11545720', '11576750', '11592622', '11638371', '11674325',
  '11715810', '11825000', '11854421', '11875683', '11952564', '12061511',
  '12122953', '12232306', '12248363', '12269732', '12286454', '12302499',
  '12326004', '12344265', '12519617', '12535871', '12545750', '12572603'
]);

function familyForBuild(build) {
  const number = Number(build);
  if (number < 10600000) return 'pre-4.4';
  if (number < 10800000) return '4.4';
  if (number < 11100000) return '4.5';
  if (number < 11400000) return '4.6';
  if (number < 11800000) return '4.7';
  if (number < 12200000) return '4.8';
  if (number < 12500000) return '4.9';
  return '4.10';
}

function blueprintProfileId(build, family) {
  if (build === '11518367') return 'sc-4.7-live-11518367-blueprint-v1';
  return `sc-${family}-blueprint-v1`;
}

const OBSERVED_BUILD_CATALOG = Object.freeze(Object.entries(OBSERVED_BUILD_COUNTS)
  .map(([build, observedFileCount]) => {
    const family = familyForBuild(build);
    const blueprintSupported = BLUEPRINT_SUPPORTED_BUILDS.has(build);
    return Object.freeze({
      build,
      family,
      observedFileCount,
      source: 'owner-log-archive-walking-octopuss',
      capabilities: Object.freeze({
        blueprint: Object.freeze({
          status: blueprintSupported ? 'supported' : 'not_evaluated',
          profileId: blueprintSupported ? blueprintProfileId(build, family) : null,
          detail: blueprintSupported
            ? 'Exact build is covered by the approved blueprint notification profile.'
            : 'No blueprint capture is approved for this build.'
        })
      })
    });
  })
  .sort((left, right) => Number(left.build) - Number(right.build)));

function getBuildCompatibilityCatalog() {
  return { version: CATALOG_VERSION, builds: OBSERVED_BUILD_CATALOG };
}

module.exports = { CATALOG_VERSION, OBSERVED_BUILD_CATALOG, getBuildCompatibilityCatalog };
