import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LIMIT_NOTICE,
  MAX_ANNOTATIONS,
  resetAnnotations,
  useAnnotationStore,
} from './annotation-store';
import { MeasurementNotice, NOTICE_MS } from './measurement-notice';

const line = {
  kind: 'length' as const,
  points: [
    [0, 0],
    [1, 1],
  ] as [number, number][],
  spacing: null,
};

beforeEach(() => {
  resetAnnotations();
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

describe('MeasurementNotice', () => {
  it('is an always-mounted status line that shows the limit for this study, then clears', () => {
    render(<MeasurementNotice studyId="A" />);
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('');
    act(() => {
      for (let i = 0; i <= MAX_ANNOTATIONS; i += 1) useAnnotationStore.getState().add('A', line);
    });
    expect(status).toHaveTextContent(LIMIT_NOTICE);
    act(() => vi.advanceTimersByTime(NOTICE_MS));
    expect(status).toHaveTextContent('');
  });

  it('ignores another study’s notice', () => {
    render(<MeasurementNotice studyId="B" />);
    act(() => {
      for (let i = 0; i <= MAX_ANNOTATIONS; i += 1) useAnnotationStore.getState().add('A', line);
    });
    expect(screen.getByRole('status')).toHaveTextContent('');
  });
});
