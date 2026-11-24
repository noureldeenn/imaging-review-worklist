import { act, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetSegmentation, useSegmentStore } from './segment-store';
import { SegmentationOverlay } from './segmentation-overlay';

const renderer = vi.hoisted(() => ({
  recolor: vi.fn(),
  project: vi.fn(),
  dispose: vi.fn(),
}));
vi.mock('./mask-renderer', () => ({ createMaskRenderer: () => renderer }));

const store = () => useSegmentStore.getState();
const getMapper = () => null;

beforeEach(() => {
  resetSegmentation();
  vi.clearAllMocks();
});

describe('SegmentationOverlay', () => {
  it('recolours on colour or visibility changes only, never on a rename', () => {
    const s = store().addSegment('A');
    const view = render(
      <SegmentationOverlay studyId="A" getMapper={getMapper} imageSize={{ width: 8, height: 8 }} />,
    );
    renderer.recolor.mockClear();
    act(() => store().renameSegment('A', s?.id ?? '', 'L'));
    act(() => store().renameSegment('A', s?.id ?? '', 'Li'));
    expect(renderer.recolor).not.toHaveBeenCalled();
    act(() => store().toggleVisible('A', s?.id ?? ''));
    expect(renderer.recolor).toHaveBeenCalledTimes(1);
    act(() => {
      store().addSegment('A');
    });
    expect(renderer.recolor).toHaveBeenCalledTimes(2);
    view.unmount();
    expect(renderer.dispose).toHaveBeenCalledTimes(1);
  });

  it('is an aria-hidden canvas without pointer events', () => {
    const { container } = render(
      <SegmentationOverlay studyId="A" getMapper={getMapper} imageSize={{ width: 8, height: 8 }} />,
    );
    const canvas = container.querySelector('canvas');
    expect(canvas).toHaveAttribute('aria-hidden', 'true');
    expect(canvas).toHaveClass('pointer-events-none');
  });
});
