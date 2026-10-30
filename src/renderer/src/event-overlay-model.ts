import type { OverlayFeed } from '../../contracts/rendererApi';

export function orderOverlayFeed(feed: OverlayFeed): OverlayFeed {
  const events = [...feed.events].sort((left, right) => {
    const leftTime = left.timestamp ? Date.parse(left.timestamp) : NaN;
    const rightTime = right.timestamp ? Date.parse(right.timestamp) : NaN;
    if (!Number.isFinite(leftTime)) return Number.isFinite(rightTime) ? 1 : 0;
    if (!Number.isFinite(rightTime)) return -1;
    return rightTime - leftTime;
  });
  const seen = new Set<string>();
  return { ...feed, events: events.filter((event) => {
    if (seen.has(event.id)) return false;
    seen.add(event.id);
    return true;
  }).slice(0, 80) };
}
