import { clampWindowLevel, type WindowLevel } from './viewer-session';

/** Zoom is expressed relative to "fit to viewport" (1 = 100 %). */
export const ZOOM_MIN = 0.1;
export const ZOOM_MAX = 20;
export const ZOOM_STEP = 1.25;
/** Arrow keys pan by this fraction of the viewport size. */
export const PAN_KEY_FRACTION = 0.1;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function clampZoom(zoom: number): number {
  return Number.isFinite(zoom) ? clamp(zoom, ZOOM_MIN, ZOOM_MAX) : 1;
}

/** Wheel `deltaY` (pixels) to a multiplicative zoom factor; scrolling up zooms in. */
export function wheelZoomFactor(deltaY: number): number {
  if (!Number.isFinite(deltaY) || deltaY === 0) return 1;
  return clamp(Math.exp(-deltaY * 0.0015), 0.5, 2);
}

/** Ratio of the current to the previous two-finger distance (1 when undefined). */
export function pinchScale(previousDistance: number, nextDistance: number): number {
  if (previousDistance <= 0 || nextDistance <= 0) return 1;
  return nextDistance / previousDistance;
}

/** Any angle in degrees to [0, 360). Cornerstone ignores negative rotations. */
export function normaliseRotation(degrees: number): number {
  const r = degrees % 360;
  return r < 0 ? r + 360 : r === 0 ? 0 : r;
}

/**
 * Image axis to mirror so the picture flips along the given SCREEN axis.
 * Cornerstone's CPU path mirrors in image axes before rotating (the DICOM
 * presentation-state order), so at 90/270 degrees the axes swap.
 */
export function imageFlipAxis(screenAxis: 'h' | 'v', rotation: number): 'h' | 'v' {
  const quarterTurned = Math.round(normaliseRotation(rotation) / 90) % 2 === 1;
  if (!quarterTurned) return screenAxis;
  return screenAxis === 'h' ? 'v' : 'h';
}

/** Window units per dragged CSS pixel, scaled to the image's default window. */
export function wlDragSensitivity(defaultWindowWidth: number): number {
  return Math.max(1, defaultWindowWidth / 256);
}

/**
 * Window/level after a drag of (dx, dy) CSS pixels from `start`: right/left
 * widens/narrows the window, down/up raises/lowers the level.
 */
export function windowLevelFromDrag(
  start: WindowLevel,
  dx: number,
  dy: number,
  sensitivity: number,
): WindowLevel {
  return clampWindowLevel(start.ww + dx * sensitivity, start.wl + dy * sensitivity);
}

export type Size = { width: number; height: number };

/**
 * Whether a container resize should refit zoom and pan. Changes of 8 px or
 * less, and width-only changes of up to 20 px (a classic scrollbar appearing
 * or disappearing), keep the current camera.
 */
export function shouldRefitOnResize(previous: Size, next: Size): boolean {
  const dw = Math.abs(next.width - previous.width);
  const dh = Math.abs(next.height - previous.height);
  if (dw <= 8 && dh <= 8) return false;
  if (dh === 0 && dw <= 20) return false;
  return true;
}
