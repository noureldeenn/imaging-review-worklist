import { deferred, type Deferred } from './deferred';

// Test double for `@cornerstonejs/core` (viewer interaction and component
// tests): a fake viewport that also implements the camera API. Every call is
// logged; calls that reach a destroyed engine are counted instead of thrown.
type Call = { engine: number; name: string; args: unknown[] };

export const fake = {
  engines: [] as Array<{ n: number; destroyed: boolean }>,
  stacks: [] as Array<{ imageId: string; engine: number; d: Deferred<string> }>,
  calls: [] as Call[],
  callsAfterDestroy: 0,
  frames: [] as Array<() => void>,
  /** Photometric interpretation the fake metadata reports (null: no pixel module). */
  photometric: null as string | null,
};

/** Viewports of the fake engines, by engine index (for camera assertions). */
export const fakeViewports: Array<{ getCamera(): { focalPoint: number[] } }> = [];

/** Clears every log and setting between tests. */
export function resetFake(): void {
  fake.engines.length = 0;
  fake.stacks.length = 0;
  fake.calls.length = 0;
  fake.frames.length = 0;
  fake.callsAfterDestroy = 0;
  fake.photometric = null;
  fakeViewports.length = 0;
}

type P3 = [number, number, number];
export class RenderingEngine {
  destroyed = false;
  readonly n: number;
  private state = {
    scale: 2,
    focal: [0, 0, 0] as P3,
    voi: { lower: 0, upper: 400 },
    invert: false,
  };
  readonly viewport: Record<string, (...args: never[]) => unknown>;
  constructor(readonly id: string) {
    this.n = fake.engines.length;
    fake.engines.push(this);
    const log = (name: string, args: unknown[]) => {
      if (this.destroyed) fake.callsAfterDestroy += 1;
      fake.calls.push({ engine: this.n, name, args });
    };
    const s = this.state;
    this.viewport = {
      setStack: (ids: string[]) => {
        const d = deferred<string>();
        fake.stacks.push({ imageId: ids[0] ?? '', engine: this.n, d });
        return d.promise;
      },
      render: () => log('render', []),
      getProperties: () => ({ voiRange: s.voi, invert: s.invert }),
      setProperties: (p: { voiRange?: { lower: number; upper: number }; invert?: boolean }) => {
        log('setProperties', [p]);
        if (p.voiRange) s.voi = p.voiRange;
        if (p.invert !== undefined) s.invert = p.invert;
      },
      resetCamera: () => {
        log('resetCamera', []);
        s.scale = 2;
        s.focal = [0, 0, 0];
      },
      resetProperties: () => {
        log('resetProperties', []);
        s.voi = { lower: 0, upper: 400 };
        s.invert = false;
      },
      getZoom: () => s.scale,
      setZoom: (z: number) => {
        log('setZoom', [z]);
        s.scale = z;
      },
      // As on the CPU path, the focal point is the world point at the canvas centre;
      // `s.focal` is the world point at the canvas origin.
      getCamera: () => {
        const [cx, cy] = this.centre();
        return {
          focalPoint: [cx / s.scale + s.focal[0], cy / s.scale + s.focal[1], 0],
          position: [0, 0, 0],
        };
      },
      setCamera: (c: { focalPoint?: P3 }) => {
        log('setCamera', [c]);
        if (c.focalPoint) {
          const [cx, cy] = this.centre();
          s.focal = [c.focalPoint[0] - cx / s.scale, c.focalPoint[1] - cy / s.scale, 0];
        }
      },
      canvasToWorld: ([x, y]: [number, number]) => [
        x / s.scale + s.focal[0],
        y / s.scale + s.focal[1],
        0,
      ],
      setViewPresentation: (p: { rotation?: number }) => log('setViewPresentation', [p]),
    };
    fakeViewports.push(this.viewport as unknown as (typeof fakeViewports)[number]);
  }
  // Like the real engine, enabling an element adds one (counted) listener to it.
  private element: HTMLElement | null = null;
  private centre(): [number, number] {
    return [(this.element?.clientWidth ?? 0) / 2, (this.element?.clientHeight ?? 0) / 2];
  }
  private readonly onWheel = () => undefined;
  enableElement({ element }: { element: HTMLElement }) {
    this.element = element;
    element.addEventListener('wheel', this.onWheel);
  }
  getViewport() {
    return this.viewport;
  }
  // keepCamera=false refits like the real CPU path: zoom to fit, pan to centre.
  resize(_immediate?: boolean, keepCamera?: boolean) {
    fake.calls.push({ engine: this.n, name: 'resize', args: [keepCamera] });
    if (!keepCamera) {
      this.state.scale = 2;
      this.state.focal = [0, 0, 0];
    }
  }
  destroy() {
    this.destroyed = true;
    this.element?.removeEventListener('wheel', this.onWheel);
    this.element = null;
  }
}

export const Enums = { ViewportType: { STACK: 'stack' } };
export const cache = { removeImageLoadObject: () => undefined };
export const metaData = {
  get: (type: string) =>
    type === 'imagePixelModule' && fake.photometric !== null
      ? { photometricInterpretation: fake.photometric }
      : undefined,
};
