import { useLayoutEffect, useRef } from 'react';

/** Keep live arrivals visible without taking focus or disturbing explicit history browsing. */
export function useNewestFirstScroll<T extends HTMLElement>(
  events: readonly { id: string; timestamp?: string | null; summary?: string }[],
  following: boolean
) {
  const viewportRef = useRef<T>(null);
  const previous = useRef({ following: false, ids: new Set<string>() });

  useLayoutEffect(() => {
    const signature = (event: (typeof events)[number]) => JSON.stringify([event.id, event.timestamp, event.summary]);
    const receivedEvents = events.some(event => !previous.current.ids.has(signature(event)));
    if (following && (!previous.current.following || receivedEvents) && viewportRef.current) {
      viewportRef.current.scrollTop = 0;
    }
    previous.current = { following, ids: new Set(events.map(signature)) };
  }, [events, following]);

  return viewportRef;
}
