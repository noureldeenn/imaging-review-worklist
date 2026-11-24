import { cache, type RenderingEngine } from '@cornerstonejs/core';
import type { ImageMapper } from './annotations/annotation-geometry';
import type { ViewportDrawing } from './load-drawing';
import { trackEngine, trackObserver, viewerStats } from './viewer-stats';
import type { StackViewportLike } from './viewer-session';
import type { ViewportController } from './viewport-controller';

/** Everything one load created; released together by `releaseLoad`. */
export type OwnedLoad = {
  engine: RenderingEngine | null;
  observer: ResizeObserver | null;
  viewport: StackViewportLike | null;
  controller: ViewportController | null;
  drawing: ViewportDrawing | null;
  mapper: ImageMapper | null;
};

export const emptyLoad = (): OwnedLoad => ({
  engine: null,
  observer: null,
  viewport: null,
  controller: null,
  drawing: null,
  mapper: null,
});

/**
 * Releases one load (study change, close or unmount): the controller and the
 * measurement/segmentation drawing go first (late events become no-ops and an
 * in-progress shape or brush stroke is dropped), then the observer, the engine and the cached image.
 */
export function releaseLoad(owned: OwnedLoad, imageId: string): void {
  owned.controller?.dispose();
  owned.drawing?.dispose();
  owned.mapper = null;
  if (owned.observer) {
    owned.observer.disconnect();
    trackObserver(-1);
  }
  if (owned.viewport) {
    // Cornerstone 5.19.4's CPU load callback ignores `isDisabled` and calls
    // render() through the engine cache when a request lands after destroy,
    // throwing an uncaught TypeError. Disarm the dead viewport so a late
    // load settles quietly (and is then counted as discarded).
    owned.viewport.render = () => undefined;
  }
  if (owned.engine) {
    try {
      owned.engine.destroy();
    } catch {
      // Already torn down; nothing left to release.
    }
    trackEngine(-1);
  }
  try {
    cache.removeImageLoadObject(imageId);
  } catch {
    // Not cached (load never finished or failed): nothing to evict.
  }
  viewerStats.currentImageId = null;
}
