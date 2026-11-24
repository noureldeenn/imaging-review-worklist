import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { MAX_ANNOTATIONS, resetAnnotations, useAnnotationStore } from './annotation-store';
import { useAnnotations } from './use-annotations';

const store = () => useAnnotationStore.getState();
const line = {
  kind: 'length' as const,
  points: [
    [0, 0],
    [3, 4],
  ] as [number, number][],
  spacing: null,
};

beforeEach(() => resetAnnotations());

describe('annotation store', () => {
  it('adds, updates, removes and clears per study', () => {
    const id = store().add('A', line);
    expect(id).not.toBeNull();
    expect(store().list('A')).toHaveLength(1);
    store().update('A', id ?? '', [
      [1, 1],
      [2, 2],
    ]);
    expect(store().list('A')[0]?.points).toEqual([
      [1, 1],
      [2, 2],
    ]);
    store().add('A', line);
    store().remove('A', id ?? '');
    expect(store().list('A')).toHaveLength(1);
    store().clear('A');
    expect(store().list('A')).toEqual([]);
  });

  it('keeps studies isolated', () => {
    store().add('A', line);
    store().add('B', { ...line, kind: 'rectangle' });
    expect(
      store()
        .list('A')
        .map((a) => a.kind),
    ).toEqual(['length']);
    expect(
      store()
        .list('B')
        .map((a) => a.kind),
    ).toEqual(['rectangle']);
    store().clear('B');
    expect(store().list('A')).toHaveLength(1);
  });

  it(`caps a study at ${MAX_ANNOTATIONS}`, () => {
    for (let i = 0; i < MAX_ANNOTATIONS; i += 1) expect(store().add('A', line)).not.toBeNull();
    expect(store().add('A', line)).toBeNull();
    expect(store().list('A')).toHaveLength(MAX_ANNOTATIONS);
    expect(store().add('B', line)).not.toBeNull();
  });

  it('selection belongs to one study and is dropped on remove/clear', () => {
    const id = store().add('A', line) ?? '';
    store().select('A', id);
    expect(store().selectedIn('A')).toBe(id);
    expect(store().selectedIn('B')).toBeNull();
    store().remove('A', id);
    expect(store().selectedIn('A')).toBeNull();
    const again = store().add('A', line) ?? '';
    store().select('A', again);
    store().clear('A');
    expect(store().selectedIn('A')).toBeNull();
  });

  it('removeSelected deletes the selected annotation of that study only', () => {
    const a = store().add('A', line) ?? '';
    store().add('A', line);
    store().select('A', a);
    expect(store().removeSelected('B')).toBe(false);
    expect(store().removeSelected('A')).toBe(true);
    expect(
      store()
        .list('A')
        .map((x) => x.id),
    ).not.toContain(a);
  });
});

describe('useAnnotations', () => {
  it('returns the current study list and selection, A→B→A restores A', () => {
    const { result, rerender } = renderHook(({ id }) => useAnnotations(id), {
      initialProps: { id: 'A' },
    });
    let a = '';
    act(() => {
      a = store().add('A', line) ?? '';
      store().select('A', a);
    });
    expect(result.current.annotations.map((x) => x.id)).toEqual([a]);
    expect(result.current.selectedId).toBe(a);
    rerender({ id: 'B' });
    expect(result.current.annotations).toEqual([]);
    expect(result.current.selectedId).toBeNull();
    rerender({ id: 'A' });
    expect(result.current.annotations.map((x) => x.id)).toEqual([a]);
  });
});
