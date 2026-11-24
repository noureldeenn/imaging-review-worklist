import { useEffect, type RefObject } from 'react';
import { PAN_KEY_FRACTION, ZOOM_STEP, pinchScale, wheelZoomFactor } from './viewer-math';
import type { AnnotationDrawing } from './annotations/annotation-drawing';
import type { ViewerTool, ViewportController } from './viewport-controller';
import type { WindowLevel } from './viewer-session';

type Point = [number, number];
type Drag = {
  id: number;
  mode: ViewerTool;
  start: Point;
  last: Point;
  startWl: WindowLevel | null;
};
type Pinch = { distance: number; mid: Point };

/**
 * Number of listeners `bindViewportInteractions` adds to the element. The
 * measurement tools add none: their pointer and key events are routed through
 * these same eight handlers (see `getDrawing`).
 */
export const INTERACTION_LISTENERS = 8;

// OHIF keys (l, p, z); `w` is kept as an alias of `l` from the first toolbar.
const TOOL_KEYS: Record<string, ViewerTool> = {
  l: 'windowLevel',
  w: 'windowLevel',
  p: 'pan',
  z: 'zoom',
};
const WHEEL_LINE_PX = 16;

const distance = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const midpoint = (a: Point, b: Point): Point => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

/**
 * Registers the viewport's pointer, wheel, keyboard and context-menu handlers
 * and returns the matching unbind (same function references and options, so
 * every add has a symmetrical remove). `getController` is consulted on every
 * event; when it returns null (load superseded, viewer closed) the event is
 * ignored and any gesture in progress is dropped.
 */
export function bindViewportInteractions(
  element: HTMLElement,
  getController: () => ViewportController | null,
  getDrawing: () => AnnotationDrawing | null = () => null,
): () => void {
  const pointers = new Map<number, Point>();
  let drag: Drag | null = null;
  let pinch: Pinch | null = null;
  // Pointer whose press the measurement drawing took (it gets the move/up).
  let drawingPointer: number | null = null;

  const local = (e: { clientX: number; clientY: number }): Point => {
    const r = element.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };
  const twoPointers = (): [Point, Point] | null => {
    const [a, b] = [...pointers.values()];
    return a && b ? [a, b] : null;
  };
  const release = (pointerId: number) => {
    try {
      if (element.hasPointerCapture(pointerId)) element.releasePointerCapture(pointerId);
    } catch {
      // Already released by the browser (or no capture support).
    }
  };
  const dropGesture = () => {
    pointers.forEach((_, id) => release(id));
    pointers.clear();
    drag = null;
    pinch = null;
    drawingPointer = null;
    getDrawing()?.cancel();
  };

  const onPointerDown = (e: PointerEvent) => {
    const c = getController();
    if (!c) return;
    if (e.pointerType === 'mouse' && e.button > 2) return;
    e.preventDefault();
    element.focus({ preventScroll: true });
    try {
      element.setPointerCapture(e.pointerId);
    } catch {
      // Pointer already gone (or no capture support): the gesture still works inside the element.
    }
    const p = local(e);
    pointers.set(e.pointerId, p);
    const pair = twoPointers();
    if (pair) {
      // A second finger cancels an in-progress measurement and pinches instead.
      getDrawing()?.cancel();
      drawingPointer = null;
      drag = null;
      pinch = { distance: distance(...pair), mid: midpoint(...pair) };
      return;
    }
    const tool = c.tool();
    const input = { id: e.pointerId, point: p, tool, touch: e.pointerType !== 'mouse' };
    if (e.button === 0 && getDrawing()?.pointerDown(input)) {
      drawingPointer = e.pointerId;
      drag = null;
      return;
    }
    const mode: ViewerTool = e.button === 1 ? 'pan' : e.button === 2 ? 'zoom' : tool;
    drag = { id: e.pointerId, mode, start: p, last: p, startWl: c.windowLevel() };
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!pointers.has(e.pointerId)) {
      // Buttonless mouse moves only feed the angle tool's rubber band.
      if (e.pointerType === 'mouse' && getController()) getDrawing()?.hover(local(e));
      return;
    }
    const c = getController();
    if (!c) {
      dropGesture();
      return;
    }
    const p = local(e);
    pointers.set(e.pointerId, p);
    if (drawingPointer === e.pointerId) {
      getDrawing()?.pointerMove(e.pointerId, p);
      return;
    }
    const pair = twoPointers();
    if (pinch && pair) {
      const nextDistance = distance(...pair);
      const mid = midpoint(...pair);
      c.zoomBy(pinchScale(pinch.distance, nextDistance), mid, 'frame');
      c.panBy(mid[0] - pinch.mid[0], mid[1] - pinch.mid[1], 'frame');
      pinch = { distance: nextDistance, mid };
      return;
    }
    if (!drag || drag.id !== e.pointerId) return;
    const dx = p[0] - drag.last[0];
    const dy = p[1] - drag.last[1];
    if (drag.mode === 'pan') c.panBy(dx, dy, 'frame');
    else if (drag.mode === 'zoom') c.zoomBy(Math.exp(-dy * 0.01), drag.start, 'frame');
    else if (drag.mode === 'windowLevel' && drag.startWl) {
      c.dragWindowLevel(drag.startWl, p[0] - drag.start[0], p[1] - drag.start[1]);
    }
    drag.last = p;
  };

  // pointerup, pointercancel and lostpointercapture all end that pointer's part
  // of the gesture; a pointer whose capture was lost must not linger in the map.
  const onPointerEnd = (e: PointerEvent) => {
    if (!pointers.delete(e.pointerId)) return;
    release(e.pointerId);
    if (drawingPointer === e.pointerId) {
      drawingPointer = null;
      const d = getController() ? getDrawing() : null;
      if (e.type === 'pointerup') d?.pointerUp(e.pointerId, local(e));
      else d?.cancel();
    }
    if (pointers.size < 2) pinch = null;
    if (drag?.id === e.pointerId || pointers.size === 0) drag = null;
  };

  const onWheel = (e: WheelEvent) => {
    const c = getController();
    if (!c) return;
    e.preventDefault();
    const deltaY = e.deltaMode === 1 ? e.deltaY * WHEEL_LINE_PX : e.deltaY;
    c.zoomBy(wheelZoomFactor(deltaY), local(e), 'frame');
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const c = getController();
    if (!c) return;
    // Escape cancels a drawing; Delete/Backspace remove the selected measurement.
    if (getDrawing()?.keyDown(e.key)) {
      e.preventDefault();
      return;
    }
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    const panX = element.clientWidth * PAN_KEY_FRACTION;
    const panY = element.clientHeight * PAN_KEY_FRACTION;
    const tool = TOOL_KEYS[key];
    if (tool) {
      getDrawing()?.cancel();
      c.setTool(tool);
    } else if (key === '+' || key === '=') c.zoomBy(ZOOM_STEP);
    else if (key === '-' || key === '_') c.zoomBy(1 / ZOOM_STEP);
    else if (key === '<' || key === ',') c.rotateBy(-90);
    else if (key === '>' || key === '.') c.rotateBy(90);
    else if (key === 'r') c.rotateBy(e.shiftKey ? -90 : 90);
    else if (key === 'h') c.flip('h');
    else if (key === 'v') c.flip('v');
    else if (key === 'i') c.toggleInvert();
    else if (key === '0') c.reset();
    else if (key === 'ArrowLeft') c.panBy(-panX, 0);
    else if (key === 'ArrowRight') c.panBy(panX, 0);
    else if (key === 'ArrowUp') c.panBy(0, -panY);
    else if (key === 'ArrowDown') c.panBy(0, panY);
    else return;
    e.preventDefault();
  };

  const onContextMenu = (e: Event) => e.preventDefault();

  const wheelOptions: AddEventListenerOptions = { passive: false };
  element.addEventListener('pointerdown', onPointerDown);
  element.addEventListener('pointermove', onPointerMove);
  element.addEventListener('pointerup', onPointerEnd);
  element.addEventListener('pointercancel', onPointerEnd);
  element.addEventListener('lostpointercapture', onPointerEnd);
  element.addEventListener('wheel', onWheel, wheelOptions);
  element.addEventListener('keydown', onKeyDown);
  element.addEventListener('contextmenu', onContextMenu);

  return () => {
    dropGesture(); // releases any captured pointers before the handlers go
    element.removeEventListener('pointerdown', onPointerDown);
    element.removeEventListener('pointermove', onPointerMove);
    element.removeEventListener('pointerup', onPointerEnd);
    element.removeEventListener('pointercancel', onPointerEnd);
    element.removeEventListener('lostpointercapture', onPointerEnd);
    element.removeEventListener('wheel', onWheel, wheelOptions);
    element.removeEventListener('keydown', onKeyDown);
    element.removeEventListener('contextmenu', onContextMenu);
  };
}

type InteractionOptions = {
  elementRef: RefObject<HTMLElement | null>;
  /** True only once the CURRENT load is ready. */
  active: boolean;
  /** Load sequence of that ready state: a new session re-binds from scratch. */
  session: number;
  /** Returns null once the load is superseded or the viewer is closed. */
  getController(): ViewportController | null;
  /** The measurement drawing of the same load (null with it). */
  getDrawing?(): AnnotationDrawing | null;
};

/**
 * Binds the viewport interactions while `active` and unbinds on session
 * change, close or unmount.
 */
export function useViewportInteractions({
  elementRef,
  active,
  session,
  getController,
  getDrawing,
}: InteractionOptions): void {
  useEffect(() => {
    const element = elementRef.current;
    if (!active || !element) return undefined;
    return bindViewportInteractions(element, getController, getDrawing);
  }, [elementRef, active, session, getController, getDrawing]);
}
