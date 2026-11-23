import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ViewerErrorBoundary } from './viewer-error-boundary';

function Boom({ explode }: { explode: boolean }) {
  if (explode) throw new Error('boom');
  return <p>viewer ok</p>;
}

describe('ViewerErrorBoundary', () => {
  it('renders an alert when a child throws and keeps outside content', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(
      <div>
        <p>outside</p>
        <ViewerErrorBoundary resetKey="a">
          <Boom explode />
        </ViewerErrorBoundary>
      </div>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'The viewer crashed. Close and reopen the study.',
    );
    expect(screen.getByText('outside')).toBeInTheDocument();
  });

  it('recovers when resetKey changes', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { rerender } = render(
      <ViewerErrorBoundary resetKey="a">
        <Boom explode />
      </ViewerErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
    rerender(
      <ViewerErrorBoundary resetKey="b">
        <Boom explode={false} />
      </ViewerErrorBoundary>,
    );
    expect(screen.getByText('viewer ok')).toBeInTheDocument();
  });
});
