import { beforeEach, describe, expect, it } from 'vitest';
import { createAnnotationDrawing, type AnnotationDrawing } from './annotation-drawing';
import type { ImageMapper } from './annotation-geometry';
import { resetAnnotations, useAnnotationStore } from './annotation-store';
import type { Point } from './measure-math';

// Fake viewport mapping: canvas = image * 2 + 10 (zoomed and panned).
const mapper: ImageMapper = {
  toCanvas: ([x, y]) => [x * 2 + 10, y * 2 + 10],
  toImage: ([x, y]) => [(x - 10) / 2, (y - 10) / 2],
};
const canvas = (p: Point): Point => mapper.toCanvas(p);

const frames: Array<() => void> = [];
const scheduler = {
  request: (cb: () => void) => frames.push(cb),
  cancel: (h: number) => {
    frames[h - 1] = () => undefined;
  },
};
const flushFrames = () => frames.splice(0).forEach((cb) => cb());
const store = () => useAnnotationStore.getState();
const list = () => store().list('A');

let d: AnnotationDrawing;
beforeEach(() => {
  resetAnnotations();
  frames.length = 0;
  d = createAnnotationDrawing({
    studyId: 'A',
    spacing: null,
    imageSize: { width: 256, height: 256 },
    mapper,
    scheduler,
  });
});

const down = (p: Point, tool = 'length', id = 1, touch = false) =>
  d.pointerDown({ id, point: canvas(p), tool, touch });
const move = (p: Point, id = 1) => d.pointerMove(id, canvas(p));
const up = (p: Point, id = 1) => d.pointerUp(id, canvas(p));
const click = (p: Point, tool = 'angle') => {
  down(p, tool);
  up(p);
};

describe('annotation drawing: create', () => {
  it.each(['length', 'ellipse', 'rectangle'] as const)(
    '%s: press, drag, release stores image points',
    (tool) => {
      expect(down([10, 20], tool)).toBe(true);
      move([30, 40]);
      flushFrames();
      expect(store().draft).toMatchObject({
        kind: tool,
        points: [
          [10, 20],
          [30, 40],
        ],
      });
      expect(up([50, 60])).toBe(true);
      expect(list()).toMatchObject([
        {
          kind: tool,
          points: [
            [10, 20],
            [50, 60],
          ],
          spacing: null,
        },
      ]);
      expect(store().draft).toBeNull();
    },
  );

  it('a tiny drag (a click) draws nothing', () => {
    down([10, 10]);
    up([11, 10]); // 2 canvas px
    expect(list()).toEqual([]);
  });

  it('clamps points to the image', () => {
    down([-20, 10]);
    up([300, 10]);
    expect(list()[0]?.points).toEqual([
      [0, 10],
      [256, 10],
    ]);
  });

  it('angle: three clicks, the second is the vertex, with a rubber band in between', () => {
    click([10, 0]);
    d.hover(canvas([5, 5]));
    flushFrames();
    expect(store().draft).toMatchObject({
      kind: 'angle',
      points: [
        [10, 0],
        [5, 5],
      ],
    });
    click([0, 0]);
    expect(list()).toEqual([]);
    click([0, 10]);
    expect(list()).toMatchObject([
      {
        kind: 'angle',
        points: [
          [10, 0],
          [0, 0],
          [0, 10],
        ],
      },
    ]);
    expect(store().draft).toBeNull();
  });

  it('angle: a first press that drags draws the first arm; then one more click', () => {
    down([10, 0], 'angle');
    move([0, 0]);
    up([0, 0]);
    click([0, 10]);
    expect(list()[0]?.points).toEqual([
      [10, 0],
      [0, 0],
      [0, 10],
    ]);
  });

  it('a slightly moving click still counts as a click for the angle', () => {
    down([10, 0], 'angle');
    d.pointerUp(1, [canvas([10, 0])[0] + 2, canvas([10, 0])[1]]);
    click([0, 0]);
    click([0, 10]);
    expect(list()).toHaveLength(1);
    expect(list()[0]?.points).toEqual([
      [11, 0],
      [0, 0],
      [0, 10],
    ]);
  });

  it('navigation tools do not draw; the press is left to pan / levels', () => {
    expect(down([10, 10], 'pan')).toBe(false);
    expect(down([10, 10], 'windowLevel')).toBe(false);
  });
});

describe('annotation drawing: cancel', () => {
  it('Escape cancels an in-progress drag and an unfinished angle', () => {
    down([10, 10]);
    move([40, 40]);
    flushFrames();
    expect(d.keyDown('Escape')).toBe(true);
    expect(store().draft).toBeNull();
    up([40, 40]);
    expect(list()).toEqual([]);

    click([10, 0]);
    click([0, 0]);
    expect(d.keyDown('Escape')).toBe(true);
    click([0, 10], 'angle');
    expect(list()).toEqual([]);
  });

  it('cancel() (second pointer, tool switch) drops the drawing and its pending frame', () => {
    down([10, 10], 'rectangle');
    move([40, 40]);
    d.cancel();
    flushFrames();
    expect(store().draft).toBeNull();
    expect(up([40, 40])).toBe(false);
    expect(list()).toEqual([]);
  });

  it('after dispose every event is a no-op and the draft is gone', () => {
    down([10, 10]);
    move([40, 40]);
    d.dispose();
    flushFrames();
    expect(store().draft).toBeNull();
    expect(up([40, 40])).toBe(false);
    expect(down([1, 1])).toBe(false);
    expect(d.keyDown('Delete')).toBe(false);
    expect(list()).toEqual([]);
  });
});

describe('annotation drawing: select, adjust, delete', () => {
  beforeEach(() => {
    store().add('A', {
      kind: 'length',
      points: [
        [10, 10],
        [50, 10],
      ],
      spacing: null,
    });
  });
  const id = () => list()[0]?.id ?? '';

  it('pressing on the line selects it with any tool (no new shape)', () => {
    expect(down([30, 11], 'pan')).toBe(true);
    up([30, 11]);
    expect(store().selectedIn('A')).toBe(id());
    expect(list()).toHaveLength(1);
    // Pressing empty space deselects.
    down([100, 100], 'pan');
    expect(store().selectedIn('A')).toBeNull();
  });

  it('dragging a handle of the selected annotation moves that end; Escape restores it', () => {
    down([30, 10]);
    up([30, 10]);
    down([50, 10]);
    move([60, 30]);
    flushFrames();
    expect(list()[0]?.points).toEqual([
      [10, 10],
      [60, 30],
    ]);
    up([60, 30]);
    expect(list()[0]?.points).toEqual([
      [10, 10],
      [60, 30],
    ]);

    down([60, 30]);
    move([90, 90]);
    flushFrames();
    d.keyDown('Escape');
    expect(list()[0]?.points).toEqual([
      [10, 10],
      [60, 30],
    ]);
  });

  it('Delete and Backspace remove the selected annotation only', () => {
    expect(d.keyDown('Delete')).toBe(false);
    store().select('A', id());
    expect(d.keyDown('Backspace')).toBe(true);
    expect(list()).toEqual([]);
  });

  it('touch uses a larger hit radius', () => {
    expect(down([30, 15], 'pan', 1, false)).toBe(false); // 10 canvas px off the line
    expect(down([30, 15], 'pan', 2, true)).toBe(true);
  });
});
