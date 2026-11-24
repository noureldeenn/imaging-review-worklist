import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ViewerReadout } from './viewer-readout';
import { ViewerToolbar, type ToolbarActions } from './viewer-toolbar';
import { DEFAULT_VIEW } from './viewport-controller';

function actions(): ToolbarActions {
  return {
    zoomBy: vi.fn(),
    rotateBy: vi.fn(),
    flipH: vi.fn(),
    flipV: vi.fn(),
    toggleInvert: vi.fn(),
    setTool: vi.fn(),
    reset: vi.fn(),
  };
}

describe('ViewerToolbar', () => {
  it('each button calls its action', async () => {
    const a = actions();
    render(<ViewerToolbar view={DEFAULT_VIEW} disabled={false} actions={a} />);
    const click = (name: string) => userEvent.click(screen.getByRole('button', { name }));

    await click('Zoom in');
    expect(a.zoomBy).toHaveBeenLastCalledWith(1.25);
    await click('Zoom out');
    expect(a.zoomBy).toHaveBeenLastCalledWith(0.8);
    await click('Rotate left');
    expect(a.rotateBy).toHaveBeenLastCalledWith(-90);
    await click('Rotate right');
    expect(a.rotateBy).toHaveBeenLastCalledWith(90);
    await click('Flip horizontal');
    expect(a.flipH).toHaveBeenCalledTimes(1);
    await click('Flip vertical');
    expect(a.flipV).toHaveBeenCalledTimes(1);
    await click('Invert');
    expect(a.toggleInvert).toHaveBeenCalledTimes(1);
    await click('Pan tool');
    expect(a.setTool).toHaveBeenLastCalledWith('pan');
    await click('Zoom tool');
    expect(a.setTool).toHaveBeenLastCalledWith('zoom');
    await click('Window/Level tool');
    expect(a.setTool).toHaveBeenLastCalledWith('windowLevel');
    await click('Fit / Reset');
    expect(a.reset).toHaveBeenCalledTimes(1);
  });

  it('tool and toggle buttons expose aria-pressed', () => {
    const view = { ...DEFAULT_VIEW, tool: 'pan' as const, flipV: true };
    render(<ViewerToolbar view={view} disabled={false} actions={actions()} />);
    const pressed = (name: string) =>
      screen.getByRole('button', { name }).getAttribute('aria-pressed');
    expect(pressed('Pan tool')).toBe('true');
    expect(pressed('Window/Level tool')).toBe('false');
    expect(pressed('Zoom tool')).toBe('false');
    expect(pressed('Invert')).toBe('false');
    // Flips are actions on the screen axes; their image-axis state is shown in the readout.
    expect(pressed('Flip vertical')).toBeNull();
    expect(pressed('Zoom in')).toBeNull();
  });

  it('disables every button while the image is not ready', () => {
    render(<ViewerToolbar view={DEFAULT_VIEW} disabled actions={actions()} />);
    for (const b of screen.getAllByRole('button')) expect(b).toBeDisabled();
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
    expect(readout).toHaveTextContent('Flipped H');
    expect(readout).not.toHaveTextContent('Flipped V');
  });
});
