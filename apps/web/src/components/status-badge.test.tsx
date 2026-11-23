import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatusBadge } from './status-badge';

describe('StatusBadge', () => {
  it.each(['Unassigned', 'InReview', 'Completed'] as const)(
    'renders %s as text with a matching aria-label',
    (status) => {
      render(<StatusBadge status={status} />);
      const badge = screen.getByLabelText(status);
      expect(badge).toHaveTextContent(status);
      expect(badge).toHaveAttribute('data-status', status);
    },
  );

  it('uses a distinct tone per status', () => {
    const { rerender } = render(<StatusBadge status="Unassigned" />);
    const tone = (s: string) => screen.getByLabelText(s).className;
    const unassigned = tone('Unassigned');
    rerender(<StatusBadge status="InReview" />);
    const inReview = tone('InReview');
    rerender(<StatusBadge status="Completed" />);
    expect(new Set([unassigned, inReview, tone('Completed')]).size).toBe(3);
  });
});
