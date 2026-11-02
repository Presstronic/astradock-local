const fs = require('node:fs/promises');
const { parseGameLogTimestamp } = require('./time');
const { observedReleaseChannels } = require('./gameEnvironments');

const BLOCK_BYTES = 64 * 1024;
const MAX_WINDOW_BYTES = 8 * 1024 * 1024;

/** Read build metadata plus a bounded recent suffix, never materialize old log history. */
async function readRuntimeCaptureWindow(filePath, { since, signal } = {}) {
  const cutoff = Date.parse(since);
  if (!Number.isFinite(cutoff)) throw new TypeError('Capture start must be an absolute timestamp.');
  signal?.throwIfAborted();
  const file = await fs.open(filePath, 'r');
  try {
    const stat = await file.stat();
    const header = Buffer.alloc(Math.min(BLOCK_BYTES, stat.size));
    const headerRead = await file.read(header, 0, header.length, 0);
    const metadata = header.subarray(0, headerRead.bytesRead).toString('utf8');
    const build = metadata.match(/\bFileVersion:\s*([^\s]+)/)?.[1];
    const branch = metadata.match(/\bBranch:\s*([^\s]+)/)?.[1];
    const chunks = [];
    let offset = stat.size;
    let capturedBytes = 0;
    let bytesRead = headerRead.bytesRead;
    while (offset > 0 && capturedBytes < MAX_WINDOW_BYTES) {
      signal?.throwIfAborted();
      const length = Math.min(BLOCK_BYTES, offset, MAX_WINDOW_BYTES - capturedBytes);
      offset -= length;
      const block = Buffer.alloc(length);
      const read = await file.read(block, 0, length, offset);
      bytesRead += read.bytesRead;
      capturedBytes += read.bytesRead;
      chunks.unshift(block.subarray(0, read.bytesRead));
      const complete = block.subarray(offset === 0 ? 0 : block.indexOf(10) + 1).toString('utf8');
      if (complete.split('\n').some(line => {
        const timestamp = parseGameLogTimestamp(line);
        return timestamp.ok && Date.parse(timestamp.instant) < cutoff;
      })) break;
      if (read.bytesRead !== length) break;
    }
    const buffer = Buffer.concat(chunks);
    let position = offset === 0 ? 0 : buffer.indexOf(10) + 1;
    let start = buffer.length;
    while (position < buffer.length) {
      const end = buffer.indexOf(10, position);
      const lineEnd = end < 0 ? buffer.length : end + 1;
      const timestamp = parseGameLogTimestamp(buffer.subarray(position, lineEnd).toString('utf8'));
      if (timestamp.ok && Date.parse(timestamp.instant) >= cutoff) { start = position; break; }
      position = lineEnd;
    }
    return {
      text: buffer.subarray(start).toString('utf8'), gameBuild: build, branch,
      observedChannels: observedReleaseChannels(metadata),
      sourceByteOffset: offset + start, modifiedAt: stat.mtime.toISOString(),
      bytesRead, truncated: offset > 0 && capturedBytes >= MAX_WINDOW_BYTES
    };
  } finally { await file.close(); }
}

module.exports = { readRuntimeCaptureWindow };
