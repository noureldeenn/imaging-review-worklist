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
};

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
      getCamera: () => ({ focalPoint: s.focal, position: [0, 0, 0] }),
      setCamera: (c: { focalPoint?: P3 }) => {
        log('setCamera', [c]);
        if (c.focalPoint) s.focal = c.focalPoint;
      },
      canvasToWorld: ([x, y]: [number, number]) => [
        x / s.scale + s.focal[0],
        y / s.scale + s.focal[1],
        0,
      ],
      setViewPresentation: (p: { rotation?: number }) => log('setViewPresentation', [p]),
    };
  }
  enableElement() {}
  getViewport() {
    return this.viewport;
  }
  resize() {}
  destroy() {
    this.destroyed = true;
  }
}

export const Enums = { ViewportType: { STACK: 'stack' } };
export const cache = { removeImageLoadObject: () => undefined };
export const metaData = { get: () => undefined };
