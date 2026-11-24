import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { commandsMock, groupsFor, segmentsStub } from '../test/toolbar-fixtures';
import { IDLE_VIEW } from '../viewer/viewer-bridge';
import { Toolbar } from './toolbar';

const button = (name: string) => screen.getByRole('button', { name });

function renderToolbar(...args: Parameters<typeof groupsFor>) {
  return render(<Toolbar groups={groupsFor(...args)} label="Image tools" />);
}

describe('Segmentation tools in the toolbar', () => {
  it('Segment ▾ is an APG menu of radio tools that call setTool', async () => {
    const user = userEvent.setup();
    const viewer = commandsMock();
    renderToolbar({ viewer });
    const segment = button('Segment');
    expect(segment).toHaveAttribute('aria-haspopup', 'menu');
    segment.focus();
    await user.keyboard('{ArrowDown}');
    const menu = screen.getByRole('menu', { name: 'Segmentation tools' });
    const brush = within(menu).getByRole('menuitemradio', { name: 'Brush (B)' });
    expect(brush).toHaveFocus();
    expect(brush).toHaveAttribute('aria-checked', 'false');
    await user.keyboard('{ArrowDown}');
    expect(within(menu).getByRole('menuitemradio', { name: 'Smart brush' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(viewer.setTool).toHaveBeenLastCalledWith('smartBrush');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(segment).toHaveFocus();
    await user.click(segment);
    await user.click(screen.getByRole('menuitemradio', { name: 'Brush (B)' }));
    expect(viewer.setTool).toHaveBeenLastCalledWith('brush');
  });

  it('an active brush tints Segment ▾ and describes it; the other tools are not pressed', async () => {
    const user = userEvent.setup();
    renderToolbar({ view: { ...IDLE_VIEW, tool: 'brush' } });
    expect(button('Segment')).toHaveClass('text-primary');
    expect(button('Segment')).toHaveAccessibleDescription('Active tool: Brush (B)');
    expect(button('Segment')).toHaveAccessibleName('Segment');
    for (const name of ['Levels (L)', 'Pan (P)', 'Zoom (Z)', 'Length']) {
      expect(button(name)).toHaveAttribute('aria-pressed', 'false');
    }
    await user.click(button('Segment'));
    expect(screen.getByRole('menuitemradio', { name: 'Brush (B)' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  it('Delete ▾ adds the Eraser (E) tool and Clear segments (enabled only with segments)', async () => {
    const user = userEvent.setup();
    const viewer = commandsMock();
    const segments = segmentsStub({ count: 0 });
    const { unmount } = renderToolbar({ viewer, segments });
    await user.click(button('Delete'));
    const menu = screen.getByRole('menu');
    expect(within(menu).getByRole('menuitem', { name: 'Clear segments' })).toBeDisabled();
    await user.click(within(menu).getByRole('menuitemradio', { name: 'Eraser (E)' }));
    expect(viewer.setTool).toHaveBeenLastCalledWith('eraser');
    unmount();

    const some = segmentsStub({ count: 2 });
    renderToolbar({ segments: some, view: { ...IDLE_VIEW, tool: 'eraser' } });
    expect(button('Delete')).toHaveAccessibleDescription('Active tool: Eraser (E)');
    await user.click(button('Delete'));
    await user.click(screen.getByRole('menuitem', { name: 'Clear segments' }));
    expect(some.clear).toHaveBeenCalledTimes(1);
  });

  it('without a ready image Segment ▾ is disabled', () => {
    renderToolbar({ viewer: null });
    expect(button('Segment')).toBeDisabled();
  });

  it('below 900px exactly seven buttons stay; the brushes and eraser are radio items in More', async () => {
    const user = userEvent.setup();
    const viewer = commandsMock();
    renderToolbar({ viewer, view: { ...IDLE_VIEW, tool: 'smartBrush' } }, true);
    expect(screen.getAllByRole('button')).toHaveLength(7);
    expect(screen.queryByRole('button', { name: 'Segment' })).not.toBeInTheDocument();
    expect(button('More')).toHaveAccessibleDescription('Active tool: Smart brush');
    await user.click(button('More'));
    const menu = screen.getByRole('menu');
    expect(within(menu).getByRole('menuitemradio', { name: 'Smart brush' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    for (const name of ['Brush (B)', 'Eraser (E)']) {
      expect(within(menu).getByRole('menuitemradio', { name })).toHaveAttribute(
        'aria-checked',
        'false',
      );
    }
    expect(within(menu).getByRole('menuitem', { name: 'Clear segments' })).toBeInTheDocument();
    expect(within(menu).queryByRole('menuitem', { name: 'Segment' })).not.toBeInTheDocument();
    await user.click(within(menu).getByRole('menuitemradio', { name: 'Eraser (E)' }));
    expect(viewer.setTool).toHaveBeenLastCalledWith('eraser');
  });
});
