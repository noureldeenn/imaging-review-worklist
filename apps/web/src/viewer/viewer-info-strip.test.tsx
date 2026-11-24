import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Toolbar } from '../toolbar/toolbar';
import { groupsFor } from '../test/toolbar-fixtures';
import { ViewerControls } from './viewer-controls';
import { ViewerReadout, isMirrored } from './viewer-readout';
import { DEFAULT_VIEW } from './viewport-controller';

describe('ViewerControls', () => {
  it('without a window/level only the sliders are disabled, not the transform buttons', () => {
    render(
      <>
        <Toolbar groups={groupsFor()} label="Image tools" />
        <ViewerControls windowLevel={null} disabled={false} onWindowLevel={vi.fn()} />
      </>,
    );
    expect(screen.getByRole('button', { name: 'Zoom in' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'More' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Fit / Reset' })).toBeEnabled();
    expect(screen.getByLabelText('Window width')).toBeDisabled();
    expect(screen.getByLabelText('Window level')).toBeDisabled();
  });
});

describe('ViewerReadout', () => {
  it('shows zoom, rotation and state badges', () => {
    const { rerender } = render(<ViewerReadout view={DEFAULT_VIEW} />);
    const readout = screen.getByTestId('viewer-readout');
    expect(readout).toHaveTextContent(/^Zoom 100% · Rot 0°$/);
    rerender(
      <ViewerReadout
        view={{ ...DEFAULT_VIEW, zoom: 1.5, rotation: 90, invert: true, flipH: true }}
      />,
    );
    expect(readout).toHaveTextContent('Zoom 150% · Rot 90°');
    expect(readout).toHaveTextContent('Inverted');
    expect(readout).toHaveTextContent('Mirrored');
    // Both axes flipped is a half turn, not a mirror image.
    rerender(<ViewerReadout view={{ ...DEFAULT_VIEW, flipH: true, flipV: true }} />);
    expect(readout).not.toHaveTextContent('Mirrored');
    expect(readout).not.toHaveTextContent('Inverted');
  });

  it('Mirrored is shown when exactly one image axis is flipped', () => {
    expect(isMirrored({ flipH: false, flipV: false })).toBe(false);
    expect(isMirrored({ flipH: true, flipV: false })).toBe(true);
    expect(isMirrored({ flipH: false, flipV: true })).toBe(true);
    expect(isMirrored({ flipH: true, flipV: true })).toBe(false);
  });
});
