import { useLayoutEffect, type RefObject } from 'react';

/** CSS variable the floating drawer / review overlay use as their bottom offset. */
export const INFO_STRIP_VAR = '--info-strip-h';
/** Attribute of the app-shell element that holds the viewer and the floating surfaces. */
export const VIEWER_FRAME_ATTR = 'data-viewer-frame';

/**
 * Publishes the info strip's height on the viewer frame so the worklist drawer
 * and the review overlay end above it (metadata, readout and the window
 * sliders stay visible). The strip wraps at narrow widths, so its height is
 * observed rather than assumed. Removed again on unmount.
 */
export function useInfoStripOffset(strip: RefObject<HTMLElement | null>): void {
  useLayoutEffect(() => {
    const el = strip.current;
    const frame = el?.closest<HTMLElement>(`[${VIEWER_FRAME_ATTR}]`);
    if (!el || !frame) return undefined;
    // Fractional height, so the surfaces end exactly at the strip's top edge.
    const publish = () =>
      frame.style.setProperty(INFO_STRIP_VAR, `${el.getBoundingClientRect().height}px`);
    publish();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(publish);
    observer?.observe(el);
    return () => {
      observer?.disconnect();
      frame.style.removeProperty(INFO_STRIP_VAR);
    };
  }, [strip]);
}
