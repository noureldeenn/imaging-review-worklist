import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { stubWindowWidth } from '../test/match-media';
import { useLayoutState } from './use-layout-state';

afterEach(() => vi.unstubAllGlobals());

function mount(width: number, initial: string | null = null) {
  stubWindowWidth(width);
  return renderHook(({ id }: { id: string | null }) => useLayoutState(id), {
    initialProps: { id: initial },
  });
}

describe('useLayoutState', () => {
  it('no selection: the worklist drawer is open; selecting closes it; clearing reopens it', () => {
    const { result, rerender } = mount(1440);
    expect(result.current.worklistOpen).toBe(true);
    expect(result.current.reviewOpen).toBe(false);
    rerender({ id: 'study-001' });
    expect(result.current.worklistOpen).toBe(false);
    act(() => result.current.toggleWorklist());
    expect(result.current.worklistOpen).toBe(true);
    rerender({ id: 'study-002' });
    expect(result.current.worklistOpen).toBe(false);
    rerender({ id: null });
    expect(result.current.worklistOpen).toBe(true);
  });

  it('>= 1280px: push mode, review panel open by default and stays beside the drawer', () => {
    const { result, rerender } = mount(1440);
    expect(result.current.mode).toBe('push');
    rerender({ id: 'study-001' });
    expect(result.current.reviewOpen).toBe(true);
    act(() => result.current.openWorklist());
    expect(result.current.reviewOpen).toBe(true);
    act(() => result.current.toggleReview());
    expect(result.current.reviewOpen).toBe(false);
  });

  it('900-1279px: overlay mode, closed by default; drawer and overlay exclude each other', () => {
    const { result } = mount(1024, 'study-001');
    expect(result.current.mode).toBe('overlay');
    expect(result.current.reviewOpen).toBe(false);
    act(() => result.current.openReview());
    expect(result.current.reviewOpen).toBe(true);
    act(() => result.current.openWorklist());
    expect(result.current.worklistOpen).toBe(true);
    expect(result.current.reviewOpen).toBe(false);
    act(() => result.current.openReview());
    expect(result.current.worklistOpen).toBe(false);
  });

  it('< 900px: bottom-sheet mode, closed by default', () => {
    const { result } = mount(390, 'study-001');
    expect(result.current.mode).toBe('sheet');
    expect(result.current.reviewOpen).toBe(false);
    act(() => result.current.toggleReview());
    expect(result.current.reviewOpen).toBe(true);
  });

  it('revealReview (feedback): opens quietly, or badges Review while a floating drawer is open', () => {
    const { result } = mount(1024, 'study-001');
    act(() => result.current.openWorklist());
    act(() => result.current.revealReview());
    expect(result.current.worklistOpen).toBe(true);
    expect(result.current.reviewOpen).toBe(false);
    expect(result.current.feedbackUnseen).toBe(true);

    act(() => result.current.closeWorklist());
    act(() => result.current.revealReview());
    expect(result.current.reviewOpen).toBe(true);
    expect(result.current.reviewFocusOnOpen).toBe(false);
    expect(result.current.feedbackUnseen).toBe(false);

    // A user open (the Review button) moves focus in as before.
    act(() => result.current.closeReview());
    act(() => result.current.openReview());
    expect(result.current.reviewFocusOnOpen).toBe(true);
  });

  it('never reports the review panel open without a selection', () => {
    const { result } = mount(1440);
    act(() => result.current.openReview());
    expect(result.current.reviewOpen).toBe(false);
  });
});
