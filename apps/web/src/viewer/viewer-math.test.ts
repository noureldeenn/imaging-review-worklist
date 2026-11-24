import { describe, expect, it } from 'vitest';
import {
  ZOOM_MAX,
  ZOOM_MIN,
  ZOOM_STEP,
  clampZoom,
  normaliseRotation,
  pinchScale,
  wheelZoomFactor,
  windowLevelFromDrag,
  wlDragSensitivity,
} from './viewer-math';

describe('zoom', () => {
  it('clamps to 10%..2000% of fit', () => {
    expect(ZOOM_MIN).toBe(0.1);
    expect(ZOOM_MAX).toBe(20);
    expect(clampZoom(0.01)).toBe(0.1);
    expect(clampZoom(50)).toBe(20);
    expect(clampZoom(1.5)).toBe(1.5);
    expect(clampZoom(Number.NaN)).toBe(1);
    expect(clampZoom(19 * ZOOM_STEP)).toBe(20);
    expect(clampZoom(0.11 / ZOOM_STEP)).toBe(0.1);
  });

  it('maps wheel delta to a zoom factor (up = in)', () => {
    expect(wheelZoomFactor(-100)).toBeGreaterThan(1);
    expect(wheelZoomFactor(100)).toBeLessThan(1);
    expect(wheelZoomFactor(0)).toBe(1);
    expect(wheelZoomFactor(-100000)).toBeLessThanOrEqual(2);
    expect(wheelZoomFactor(100000)).toBeGreaterThanOrEqual(0.5);
  });

  it('computes the pinch scale from finger distances', () => {
    expect(pinchScale(100, 150)).toBeCloseTo(1.5);
    expect(pinchScale(100, 50)).toBeCloseTo(0.5);
    expect(pinchScale(0, 50)).toBe(1);
    expect(pinchScale(100, 0)).toBe(1);
  });
});

describe('rotation', () => {
  it('normalises any angle into 0..359', () => {
    expect(normaliseRotation(0)).toBe(0);
    expect(normaliseRotation(90)).toBe(90);
    expect(normaliseRotation(360)).toBe(0);
    expect(normaliseRotation(450)).toBe(90);
    expect(normaliseRotation(-90)).toBe(270);
    expect(normaliseRotation(-450)).toBe(270);
    expect(normaliseRotation(-0)).toBe(0);
    expect(normaliseRotation(45.5)).toBe(45.5);
  });
});

describe('window/level drag', () => {
  const start = { ww: 400, wl: 40 };

  it('drag right widens the window, drag down raises the level', () => {
    expect(windowLevelFromDrag(start, 10, 0, 1)).toEqual({ ww: 410, wl: 40 });
    expect(windowLevelFromDrag(start, -10, 0, 1)).toEqual({ ww: 390, wl: 40 });
    expect(windowLevelFromDrag(start, 0, 20, 1)).toEqual({ ww: 400, wl: 60 });
    expect(windowLevelFromDrag(start, 0, -20, 2)).toEqual({ ww: 400, wl: 0 });
  });

  it('clamps width to >= 1 and rounds', () => {
    expect(windowLevelFromDrag(start, -1000, 0, 1).ww).toBe(1);
    expect(windowLevelFromDrag(start, 0.4, 0.6, 1)).toEqual({ ww: 400, wl: 41 });
    expect(windowLevelFromDrag(start, 0, 1e9, 1).wl).toBe(65535);
  });

  it('scales sensitivity with the image window', () => {
    expect(wlDragSensitivity(256)).toBe(1);
    expect(wlDragSensitivity(4096)).toBe(16);
    expect(wlDragSensitivity(10)).toBe(1);
  });
});
