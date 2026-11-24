import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { commandsMock, groupsFor, measurementsStub } from '../test/toolbar-fixtures';
import { IDLE_VIEW } from '../viewer/viewer-bridge';
import { Toolbar } from './toolbar';

const MEASURE = ['Length', 'Angle', 'Ellipse', 'Rectangle'] as const;
const button = (name: string) => screen.getByRole('button', { name });

function renderToolbar(...args: Parameters<typeof groupsFor>) {
  return render(<Toolbar groups={groupsFor(...args)} label="Image tools" />);
}

describe('Measurement tools in the toolbar', () => {
  it('join the exclusive drag-tool choice (aria-pressed) and call setTool', async () => {
    const user = userEvent.setup();
    const viewer = commandsMock();
    renderToolbar({ viewer, view: { ...IDLE_VIEW, tool: 'angle' } });
    expect(button('Angle')).toHaveAttribute('aria-pressed', 'true');
    for (const name of ['Levels (L)', 'Pan (P)', 'Zoom (Z)', 'Length', 'Ellipse', 'Rectangle']) {
      expect(button(name)).toHaveAttribute('aria-pressed', 'false');
    }
    for (const name of MEASURE) {
      await user.click(button(name));
      expect(viewer.setTool).toHaveBeenLastCalledWith(name.toLowerCase());
    }
  });

  it('visible label equals the accessible name; disabled without an image', () => {
    renderToolbar({ viewer: null });
    for (const name of MEASURE) {
      expect(button(name)).toHaveTextContent(name);
      expect(button(name)).toBeDisabled();
    }
    expect(button('Delete')).toBeDisabled();
  });

  it('Delete ▾ is an APG menu: Delete selected and Clear measurements, enabled by state', async () => {
    const user = userEvent.setup();
    const measurements = measurementsStub({ count: 2, hasSelection: false });
    renderToolbar({ measurements });
    const del = button('Delete');
    expect(del).toHaveAttribute('aria-haspopup', 'menu');
    del.focus();
    await user.keyboard('{ArrowDown}');
    const menu = screen.getByRole('menu');
    const selected = within(menu).getByRole('menuitem', { name: 'Delete selected' });
    const clear = within(menu).getByRole('menuitem', { name: 'Clear measurements' });
    expect(selected).toBeDisabled();
    // Focus lands on the first ENABLED item; Enter runs it and returns to the button.
    expect(clear).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(measurements.clear).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(del).toHaveFocus();
  });

  it('Delete selected runs when something is selected; Esc closes back to the button', async () => {
    const user = userEvent.setup();
    const measurements = measurementsStub({ count: 1, hasSelection: true });
    renderToolbar({ measurements });
    await user.click(button('Delete'));
    await user.click(screen.getByRole('menuitem', { name: 'Delete selected' }));
    expect(measurements.deleteSelected).toHaveBeenCalledTimes(1);
    await user.click(button('Delete'));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(button('Delete')).toHaveFocus();
  });

  it('below 900px exactly seven buttons stay; the tools are radio items inside More', async () => {
    const user = userEvent.setup();
    const viewer = commandsMock();
    renderToolbar({ viewer, view: { ...IDLE_VIEW, tool: 'ellipse' } }, true);
    expect(screen.getAllByRole('button')).toHaveLength(7);
    // The active tool is inside More, so More is tinted like an active tool.
    expect(button('More')).toHaveClass('text-primary');
    for (const name of [...MEASURE, 'Delete']) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
    }
    await user.click(button('More'));
    const menu = screen.getByRole('menu');
    expect(within(menu).getByRole('menuitemradio', { name: 'Ellipse' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(within(menu).getByRole('menuitemradio', { name: 'Length' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
    // Delete ▾ contributes its items (no nested submenu).
    expect(within(menu).getByRole('menuitem', { name: 'Delete selected' })).toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: 'Clear measurements' })).toBeInTheDocument();
    expect(within(menu).queryByRole('menuitem', { name: 'Delete' })).not.toBeInTheDocument();
    await user.click(within(menu).getByRole('menuitemradio', { name: 'Rectangle' }));
    expect(viewer.setTool).toHaveBeenLastCalledWith('rectangle');
  });
});
