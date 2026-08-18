const REGION_MAPPING_VERSION = 'sc-region-conventions/2026-08-18';

const NAMING_CONVENTIONS = Object.freeze([
  { region: 'US', pattern: /^us(?:e|w|c|east|west|central)?\d*[a-z]*$/i },
  { region: 'EU', pattern: /^eu(?:w|e|central|west|east)?\d*[a-z]*$/i },
  { region: 'AUS', pattern: /^(?:aus|oce)(?:e|w|east|west)?\d*[a-z]*$/i },
  { region: 'ASIA', pattern: /^(?:asia|apac|ap)(?:e|s|n|east|south|north)?\d*[a-z]*$/i }
]);

function mapShardRegion(shardLabel) {
  const segments = String(shardLabel || '')
    .split(/[^A-Za-z0-9]+/)
    .map((segment) => segment.trim())
    .filter(Boolean);

  for (const segment of segments) {
    const mapping = NAMING_CONVENTIONS.find((candidate) => candidate.pattern.test(segment));
    if (!mapping) continue;
    return {
      friendlyRegion: mapping.region,
      rawSegment: segment,
      confidence: 'medium',
      basis: 'naming_convention',
      mappingVersion: REGION_MAPPING_VERSION
    };
  }

  return {
    friendlyRegion: 'UNKNOWN',
    rawSegment: null,
    confidence: 'unknown',
    basis: 'unmapped',
    mappingVersion: REGION_MAPPING_VERSION
  };
}

module.exports = {
  NAMING_CONVENTIONS,
  REGION_MAPPING_VERSION,
  mapShardRegion
};
