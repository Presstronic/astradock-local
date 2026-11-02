#!/usr/bin/env node
const fs = require('node:fs/promises');
const path = require('node:path');
const { validateLogSource } = require('../src/sourceDiscovery');
const { readRuntimeCaptureWindow } = require('../src/runtimeCaptureWindow');
const { parseAbsoluteInstant } = require('../src/time');
const { auditLocationInventoryCapture } = require('../src/locationInventoryAudit');

const USAGE = 'Usage: npm run audit:inventory -- --log <original Game.log> --since <absolute timestamp> [--output <new report.json>]';
function parseArguments(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = ({ '--log': 'log', '--since': 'since', '--output': 'output' })[argv[index]];
    if (!key || options[key] !== undefined || !argv[index + 1] || argv[index + 1].startsWith('--')) throw new TypeError(USAGE);
    options[key] = argv[index + 1];
  }
  if (!options.log || !parseAbsoluteInstant(options.since).ok) throw new TypeError(USAGE);
  if (options.output && path.extname(options.output).toLowerCase() !== '.json') throw new TypeError(USAGE);
  return options;
}
function stable(before, after) {
  return before.dev === after.dev && before.ino === after.ino && before.size === after.size && before.mtimeNs === after.mtimeNs && before.ctimeNs === after.ctimeNs;
}
async function runAudit(options) {
  const before = await fs.stat(options.log, { bigint: true });
  const source = await validateLogSource(options.log);
  if (!source.validation.isValid) throw new Error('Selected log is invalid or its environment evidence conflicts.');
  const capture = await readRuntimeCaptureWindow(source.private.canonicalPath, { since: options.since });
  const after = await fs.stat(options.log, { bigint: true });
  if (!stable(before, after)) throw new Error('Log changed during the audit. Retry during a quiet interval or after exiting the game.');
  if (capture.observedChannels.some(channel => channel !== source.channelHint)) throw new Error('Log environment evidence conflicts.');
  const report = auditLocationInventoryCapture({ ...capture, releaseChannel: source.channelHint, since: options.since });
  if (options.output) {
    // Exclusive creation refuses existing files/symlinks, including the selected source.
    await fs.writeFile(options.output, JSON.stringify(report, null, 2) + '\n', { encoding: 'utf8', flag: 'wx', mode: 0o600 });
  }
  return report;
}
if (require.main === module) {
  (async () => {
    const options = parseArguments(process.argv.slice(2));
    const report = await runAudit(options);
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  })().catch(error => {
    const message = error instanceof TypeError ? USAGE
      : error.code ? `Inventory audit could not finish (${/^[A-Z0-9_]+$/.test(error.code) ? error.code : 'I/O error'}). No source log was modified.`
        : 'Inventory audit blocked: invalid, changing or conflicting source. Retry with the correct environment during a quiet interval.';
    process.stderr.write(message + '\n');
    process.exitCode = 1;
  });
}
module.exports = { parseArguments, runAudit, stable };
