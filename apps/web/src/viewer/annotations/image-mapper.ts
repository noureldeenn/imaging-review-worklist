import type { ImageMapper } from './annotation-geometry';
import type { Point } from './measure-math';

type Point3 = [number, number, number];
type Vec = ArrayLike<number>;

/** The StackViewport calls the mapping needs (Cornerstone 5.19.4, CPU and GPU paths). */
export type MappableViewport = {
  canvasToWorld(canvasPos: [number, number]): Point3;
  worldToCanvas(worldPos: Point3): [number, number];
  getImageData(): { origin: Vec; spacing: Vec; direction: Vec } | undefined;
};

const at = (v: Vec, i: number) => v[i] ?? 0;

/**
 * Image pixel (column, row) <-> canvas (CSS px) for the viewport's CURRENT
 * camera. Index -> world uses the image's own origin, spacing and direction
 * (the same numbers the CPU path's canvasToWorld uses), world <-> canvas goes
 * through the viewport, which applies zoom, pan, rotation and flips.
 * Every call reads the live camera, so one mapper serves the whole load.
 */
export function createImageMapper(viewport: MappableViewport): ImageMapper | null {
  const data = viewport.getImageData();
  if (!data) return null;
  const { origin, spacing, direction } = data;
  const i: Point3 = [at(direction, 0), at(direction, 1), at(direction, 2)];
  const j: Point3 = [at(direction, 3), at(direction, 4), at(direction, 5)];
  const sx = at(spacing, 0) || 1;
  const sy = at(spacing, 1) || 1;
  const o: Point3 = [at(origin, 0), at(origin, 1), at(origin, 2)];
  return {
    toCanvas([x, y]: Point): Point {
      const w: Point3 = [0, 1, 2].map(
        (k) => at(o, k) + at(i, k) * x * sx + at(j, k) * y * sy,
      ) as Point3;
      const [cx, cy] = viewport.worldToCanvas(w);
      return [cx, cy];
    },
    toImage(p: Point): Point {
      const w = viewport.canvasToWorld(p) ?? o;
      const d: Point3 = [at(w, 0) - o[0], at(w, 1) - o[1], at(w, 2) - o[2]];
      const dot = (v: Point3) => d[0] * v[0] + d[1] * v[1] + d[2] * v[2];
      return [dot(i) / sx, dot(j) / sy];
    },
  };
}
