import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { commandsMock, groupsFor, layoutStub } from '../test/toolbar-fixtures';
import { IDLE_VIEW } from '../viewer/viewer-bridge';
import { Toolbar } from './toolbar';

const DESKTOP_ORDER = [
  'Worklist',
  'Review',
  'Levels (L)',
  'Pan (P)',
  'Zoom (Z)',
  'Length',
  'Angle',
  'Ellipse',
  'Rectangle',
  'Zoom in',
  'Zoom out',
  'Fit / Reset',
  'Delete',
  'More',
];

function renderToolbar(...args: Parameters<typeof groupsFor>) {
  return render(<Toolbar groups={groupsFor(...args)} label="Image tools" />);
}

const button = (name: string) => screen.getByRole('button', { name });

/** Menu items of either role, in DOM order. */
const menuItems = (menu: HTMLElement) =>
  Array.from(
    menu.querySelectorAll<HTMLElement>(
      '[role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"]',
    ),
  );
const itemRole = (name: string) => (name.startsWith('Invert') ? 'menuitemcheckbox' : 'menuitem');

async function openMore(user: ReturnType<typeof userEvent.setup>) {
  await user.click(button('More'));
  return screen.getByRole('menu');
}

describe('Toolbar config', () => {
  it('renders the groups left to right with their labels as accessible names', () => {
    renderToolbar();
    const toolbar = screen.getByRole('toolbar', { name: 'Image tools' });
    const groups = within(toolbar).getAllByRole('group');
    expect(groups.map((g) => g.getAttribute('aria-label'))).toEqual([
      'Panels',
      'Drag tool',
      'Measurements',
      'Zoom steps',
      'Reset',
      'Delete',
      'More tools',
    ]);
    expect(
      within(toolbar)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(DESKTOP_ORDER);
    // WCAG label-in-name: the accessible name is the visible label.
    for (const name of DESKTOP_ORDER) expect(button(name)).toBeInTheDocument();
  });

  it('each button and menu item calls its command', async () => {
    const user = userEvent.setup();
    const viewer = commandsMock();
    const layout = layoutStub();
    renderToolbar({ viewer, layout });

    await user.click(button('Zoom in'));
    expect(viewer.zoomIn).toHaveBeenCalledTimes(1);
    await user.click(button('Zoom out'));
    expect(viewer.zoomOut).toHaveBeenCalledTimes(1);
    await user.click(button('Pan (P)'));
    expect(viewer.setTool).toHaveBeenLastCalledWith('pan');
    await user.click(button('Zoom (Z)'));
    expect(viewer.setTool).toHaveBeenLastCalledWith('zoom');
    await user.click(button('Levels (L)'));
    expect(viewer.setTool).toHaveBeenLastCalledWith('windowLevel');
    await user.click(button('Fit / Reset'));
    expect(viewer.reset).toHaveBeenCalledTimes(1);
    await user.click(button('Worklist'));
    expect(layout.toggleWorklist).toHaveBeenCalledTimes(1);
    await user.click(button('Review'));
    expect(layout.toggleReview).toHaveBeenCalledTimes(1);

    const menuCalls = [
      ['Invert (I)', viewer.toggleInvert],
      ['Rotate left (<)', viewer.rotateLeft],
      ['Rotate right (>)', viewer.rotateRight],
      ['Flip horizontal (H)', viewer.flipH],
      ['Flip vertical (V)', viewer.flipV],
    ] as const;
    for (const [name, fn] of menuCalls) {
      const menu = await openMore(user);
      await user.click(within(menu).getByRole(itemRole(name), { name }));
      expect(fn).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    }
  });

  it('tools are a pressed group (exactly one active); invert is a checkbox item; flips are plain', async () => {
    const user = userEvent.setup();
    renderToolbar({ view: { ...IDLE_VIEW, tool: 'pan', invert: true, flipV: true } });
    const pressed = (name: string) => button(name).getAttribute('aria-pressed');
    expect(pressed('Pan (P)')).toBe('true');
    expect(pressed('Levels (L)')).toBe('false');
    expect(pressed('Zoom (Z)')).toBe('false');
    expect(pressed('Zoom in')).toBeNull();
    expect(pressed('Fit / Reset')).toBeNull();
    const menu = await openMore(user);
    expect(within(menu).getByRole('menuitemcheckbox', { name: 'Invert (I)' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    // Flips act on screen axes; their state is the readout's Mirrored badge.
    const flip = within(menu).getByRole('menuitem', { name: 'Flip vertical (V)' });
    expect(flip).not.toHaveAttribute('aria-pressed');
    expect(flip).not.toHaveAttribute('aria-checked');
  });

  it('without a ready image only the panel toggles are enabled', () => {
    renderToolbar({
      viewer: null,
      layout: layoutStub({ hasSelection: false, reviewOpen: false }),
    });
    expect(button('Worklist')).toBeEnabled();
    expect(button('Review')).toBeDisabled();
    for (const name of DESKTOP_ORDER.slice(2)) expect(button(name)).toBeDisabled();
  });

  it('panel toggles expose aria-expanded and aria-controls', () => {
    renderToolbar({ layout: layoutStub({ worklistOpen: true, reviewOpen: false }) });
    expect(button('Worklist')).toHaveAttribute('aria-expanded', 'true');
    expect(button('Worklist')).toHaveAttribute('aria-controls', 'worklist-drawer');
    expect(button('Review')).toHaveAttribute('aria-expanded', 'false');
    expect(button('Review')).toHaveAttribute('aria-controls', 'review-panel');
  });

  it('below 900px: seven buttons; measurements, zoom steps and Delete items move into More', async () => {
    const user = userEvent.setup();
    renderToolbar({}, true);
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual([
      'Worklist',
      'Review',
      'Levels (L)',
      'Pan (P)',
      'Zoom (Z)',
      'Fit / Reset',
      'More',
    ]);
    const menu = await openMore(user);
    expect(menuItems(menu).map((i) => i.textContent)).toEqual([
      'Length',
      'Angle',
      'Ellipse',
      'Rectangle',
      'Zoom in',
      'Zoom out',
      'Delete selected',
      'Clear measurements',
      'Invert (I)',
      'Rotate left (<)',
      'Rotate right (>)',
      'Flip horizontal (H)',
      'Flip vertical (V)',
    ]);
  });
});

describe('Toolbar keyboard (roving tabindex)', () => {
  it('has one tab stop; arrows move and wrap, Home/End jump to the ends', async () => {
    const user = userEvent.setup();
    renderToolbar();
    const tabbable = () => screen.getAllByRole('button').filter((b) => b.tabIndex === 0);
    expect(tabbable()).toEqual([button('Worklist')]);

    await user.tab();
    expect(button('Worklist')).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(button('Review')).toHaveFocus();
    expect(tabbable()).toEqual([button('Review')]);
    await user.keyboard('{End}');
    expect(button('More')).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(button('Worklist')).toHaveFocus();
    await user.keyboard('{ArrowLeft}');
    expect(button('More')).toHaveFocus();
    await user.keyboard('{Home}');
    expect(button('Worklist')).toHaveFocus();
  });

  it('skips disabled items', async () => {
    const user = userEvent.setup();
    renderToolbar({ viewer: null, layout: layoutStub({ hasSelection: false }) });
    await user.tab();
    expect(button('Worklist')).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(button('Worklist')).toHaveFocus();
  });
});

describe('More menu keyboard', () => {
  it('Enter opens on the first item; Up/Down wrap; Home/End; Esc closes back to the button', async () => {
    const user = userEvent.setup();
    renderToolbar();
    button('More').focus();
    expect(button('More')).toHaveAttribute('aria-haspopup', 'menu');
    expect(button('More')).toHaveAttribute('aria-expanded', 'false');
    await user.keyboard('{Enter}');
    expect(button('More')).toHaveAttribute('aria-expanded', 'true');
    const items = menuItems(screen.getByRole('menu'));
    expect(items[0]).toHaveFocus();
    await user.keyboard('{ArrowUp}');
    expect(items.at(-1)).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(items[0]).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(items[1]).toHaveFocus();
    // Left/Right stay inside the open menu (they do not move the toolbar focus).
    await user.keyboard('{ArrowRight}');
    expect(items[1]).toHaveFocus();
    await user.keyboard('{End}');
    expect(items.at(-1)).toHaveFocus();
    await user.keyboard('{Home}');
    expect(items[0]).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(button('More')).toHaveFocus();
  });

  it('ArrowUp opens on the last item; Enter runs it and closes; Tab and outside clicks close', async () => {
    const user = userEvent.setup();
    const viewer = commandsMock();
    renderToolbar({ viewer });
    button('More').focus();
    await user.keyboard('{ArrowUp}');
    expect(screen.getByRole('menuitem', { name: 'Flip vertical (V)' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(viewer.flipV).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(button('More')).toHaveFocus();

    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menu')).toBeInTheDocument();
    await user.keyboard('{Tab}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(button('More')).toHaveFocus();

    await user.click(button('More'));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    await user.click(document.body);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});
