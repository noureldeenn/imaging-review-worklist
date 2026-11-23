/** Below this width the shell is master/detail (one pane at a time). */
export const NARROW_QUERY = '(max-width: 899px)';

function matches(query: string): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(query).matches;
}

export function isNarrowViewport(): boolean {
  return matches(NARROW_QUERY);
}

export function prefersReducedMotion(): boolean {
  return matches('(prefers-reduced-motion: reduce)');
}
