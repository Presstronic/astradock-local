// Shared identity vocabulary. Recognizing a channel does not approve a parser
// profile, authorize synchronization, or establish gameplay evidence coverage.
const GAME_CHANNELS = Object.freeze(['LIVE', 'PTU', 'EPTU', 'HOTFIX', 'TECH-PREVIEW']);

function channelFromPath(sourcePath) {
  return String(sourcePath || '').replace(/\\/g, '/').split('/').reverse()
    .map(part => part.trim().toUpperCase()).find(part => GAME_CHANNELS.includes(part)) || null;
}

function observedReleaseChannels(text) {
  const channels = new Set();
  for (const line of String(text).split(/\r?\n/)) {
    if (/<Init>/i.test(line)) {
      for (const match of line.matchAll(/\bTag\[([^\]]+)\]/gi)) channels.add(match[1].trim().toUpperCase());
    }
    if (/<Game Version>/i.test(line)) {
      for (const match of line.matchAll(/\benvironment\[([^\]]+)\]/gi)) channels.add(match[1].trim().toUpperCase());
      for (const match of line.matchAll(/\bversion\[[^\]]*?-(TECH-PREVIEW|LIVE|EPTU|PTU|HOTFIX)\b/gi)) channels.add(match[1].toUpperCase());
    }
    for (const match of line.matchAll(/\b(?:FileVersion|ProductVersion)\b\s*[:=]\s*[A-Za-z0-9.]+-(TECH-PREVIEW|LIVE|EPTU|PTU|HOTFIX)\b/gi)) channels.add(match[1].toUpperCase());
  }
  return [...channels];
}

function hasChannelConflict(channels, expectedChannel) {
  return new Set(channels).size > 1 || Boolean(expectedChannel && channels.some(channel => channel !== expectedChannel));
}

module.exports = { GAME_CHANNELS, channelFromPath, observedReleaseChannels, hasChannelConflict };
