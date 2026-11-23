export type ViewerStats = {
  engines: number;
  observers: number;
  elementListeners: number;
  loadsCompleted: number;
  loadsDiscarded: number;
  currentImageId: string | null;
};

declare global {
  interface Window {
    __viewerStats?: ViewerStats;
  }
}

/** Live lifecycle counters; mirrored to window.__viewerStats for browser tests. */
export const viewerStats: ViewerStats = {
  engines: 0,
  observers: 0,
  elementListeners: 0,
  loadsCompleted: 0,
  loadsDiscarded: 0,
  currentImageId: null,
};

if (typeof window !== "undefined") window.__viewerStats = viewerStats;

export function trackEngine(delta: 1 | -1): void {
  viewerStats.engines += delta;
}

export function trackObserver(delta: 1 | -1): void {
  viewerStats.observers += delta;
}

const instrumented = new WeakSet<EventTarget>();

/**
 * Wraps addEventListener/removeEventListener on one element so that
 * viewerStats.elementListeners reflects the net number of distinct listeners
 * registered on it (same dedupe rule as the DOM: type + listener + capture).
 * Idempotent per element.
 */
export function instrumentElement(el: HTMLElement): void {
  if (instrumented.has(el)) return;
  instrumented.add(el);
  const live = new Set<string>();
  const ids = new WeakMap<object, number>();
  let nextId = 0;
  const keyOf = (
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | EventListenerOptions,
  ) => {
    let id = ids.get(listener);
    if (id === undefined) {
      id = (nextId += 1);
      ids.set(listener, id);
    }
    const capture = typeof options === "boolean" ? options : options?.capture === true;
    return `${type}|${id}|${capture ? 1 : 0}`;
  };
  const add = el.addEventListener.bind(el);
  const remove = el.removeEventListener.bind(el);
  el.addEventListener = (
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | AddEventListenerOptions,
  ) => {
    if (!listener) return;
    const key = keyOf(type, listener, options);
    if (!live.has(key)) {
      live.add(key);
      viewerStats.elementListeners += 1;
    }
    add(type, listener, options);
  };
  el.removeEventListener = (
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | EventListenerOptions,
  ) => {
    if (!listener) return;
    if (live.delete(keyOf(type, listener, options))) viewerStats.elementListeners -= 1;
    remove(type, listener, options);
  };
}
