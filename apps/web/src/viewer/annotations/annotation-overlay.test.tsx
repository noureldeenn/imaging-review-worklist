import { act, render } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import type { ImageMapper } from './annotation-geometry';
import { AnnotationOverlay } from './annotation-overlay';
import { resetAnnotations, useAnnotationStore } from './annotation-store';

const scaled = (s: number, dx = 0, dy = 0): ImageMapper => ({
  toCanvas: ([x, y]) => [x * s + dx, y * s + dy],
  toImage: ([x, y]) => [(x - dx) / s, (y - dy) / s],
});
// A quarter turn clockwise about the origin, then shifted: (x, y) -> (-y, x).
const rotated: ImageMapper = {
  toCanvas: ([x, y]) => [300 - y, x],
  toImage: ([x, y]) => [y, 300 - x],
};

const store = () => useAnnotationStore.getState();
const circles = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('[data-kind="length"] circle')).map((c) => [
    Number(c.getAttribute('cx')),
    Number(c.getAttribute('cy')),
  ]);

beforeEach(() => resetAnnotations());

describe('AnnotationOverlay', () => {
  it('re-projects image points through the current mapping; labels stay the same', () => {
    store().add('A', {
      kind: 'length',
      points: [
        [10, 20],
        [40, 60],
      ],
      spacing: null,
    });
    let mapper: ImageMapper | null = scaled(2);
    const { container, rerender } = render(
      <AnnotationOverlay studyId="A" revision={1} getMapper={() => mapper} />,
    );
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).toHaveClass('pointer-events-none');
    expect(circles(container)).toEqual([
      [20, 40],
      [80, 120],
    ]);
    expect(container.querySelector('[data-kind="length"]')).toHaveAttribute('data-label', '50 px');

    mapper = scaled(3, 5, 7);
    rerender(<AnnotationOverlay studyId="A" revision={2} getMapper={() => mapper} />);
    expect(circles(container)).toEqual([
      [35, 67],
      [125, 187],
    ]);

    mapper = rotated;
    rerender(<AnnotationOverlay studyId="A" revision={3} getMapper={() => mapper} />);
    expect(circles(container)).toEqual([
      [280, 10],
      [240, 40],
    ]);
    expect(container.querySelector('text')).toHaveTextContent('50 px');

    // No live viewport (closed / superseded): nothing is drawn.
    mapper = null;
    rerender(<AnnotationOverlay studyId="A" revision={4} getMapper={() => mapper} />);
    expect(container.querySelectorAll('[data-annotation-id]')).toHaveLength(0);
  });

  it('shows only the given study, marks the selection and draws the draft dashed', () => {
    const a = store().add('A', {
      kind: 'rectangle',
      points: [
        [0, 0],
        [10, 10],
      ],
      spacing: null,
    });
    store().add('B', {
      kind: 'ellipse',
      points: [
        [0, 0],
        [10, 10],
      ],
      spacing: null,
    });
    const { container } = render(
      <AnnotationOverlay studyId="A" revision={1} getMapper={() => scaled(1)} />,
    );
    expect(container.querySelectorAll('[data-annotation-id]')).toHaveLength(1);
    act(() => {
      store().select('A', a);
      store().setDraft({
        studyId: 'A',
        kind: 'length',
        points: [
          [1, 1],
          [5, 5],
        ],
      });
    });
    expect(container.querySelector('[data-kind="rectangle"]')).toHaveAttribute(
      'data-selected',
      'true',
    );
    expect(
      container.querySelector('[data-draft="length"] polyline[stroke-dasharray]'),
    ).not.toBeNull();
  });
});
