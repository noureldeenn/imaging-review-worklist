import { useCallback, useSyncExternalStore } from 'react';

/** Below this width the app is the phone layout (icon toolbar, bottom-sheet review). */
export const NARROW_QUERY = '(max-width: 899px)';
/** From this width the review panel sits beside the viewer and is open by default. */
export const WIDE_QUERY = '(min-width: 1280px)';

function supported(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function';
}

function matches(query: string): boolean {
  return supported() && window.matchMedia(query).matches;
}

export function isNarrowViewport(): boolean {
  return matches(NARROW_QUERY);
}

export function prefersReducedMotion(): boolean {
  return matches('(prefers-reduced-motion: reduce)');
}

/**
 * Live media-query match. Where matchMedia is unavailable (jsdom without a
 * stub) the hook returns `fallback`, so tests get the desktop layout.
 */
export function useMediaQuery(query: string, fallback = false): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!supported()) return () => undefined;
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    [query],
  );
  const read = () => (supported() ? window.matchMedia(query).matches : fallback);
  return useSyncExternalStore(subscribe, read, () => fallback);
}
