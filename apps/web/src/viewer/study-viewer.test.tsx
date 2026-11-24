import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fake } from '../test/fake-cornerstone';
import { layoutStub } from '../test/toolbar-fixtures';
import { AppToolbar } from '../toolbar/app-toolbar';
import { StudyViewer } from './study-viewer';

vi.mock('./cornerstone-init', () => ({ initCornerstone: () => Promise.resolve() }));
vi.mock('@cornerstonejs/core', () => import('../test/fake-cornerstone'));

class FakeResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
  fake.engines.length = 0;
  fake.stacks.length = 0;
  fake.calls.length = 0;
});

afterEach(() => vi.unstubAllGlobals());

async function renderReady() {
  // The app toolbar drives the viewer through the viewer bridge.
  render(
    <>
      <AppToolbar layout={layoutStub()} />
      <StudyViewer studyId="study-001" />
    </>,
  );
  await waitFor(() => expect(fake.stacks).toHaveLength(1));
  fake.stacks[0]?.d.resolve('ok');
  return screen.findByTestId('viewer-readout');
}

describe('StudyViewer controls', () => {
  it('the readout follows the toolbar and Fit / Reset restores it', async () => {
    const readout = await renderReady();
    const user = userEvent.setup();
    const click = (name: string) => user.click(screen.getByRole('button', { name }));
    const menu = async (role: 'menuitem' | 'menuitemcheckbox', name: string) => {
      await click('More');
      await user.click(within(screen.getByRole('menu')).getByRole(role, { name }));
    };
    const invertChecked = async () => {
      await click('More');
      const checked = screen
        .getByRole('menuitemcheckbox', { name: 'Invert (I)' })
        .getAttribute('aria-checked');
      await user.keyboard('{Escape}');
      return checked;
    };
    expect(readout).toHaveTextContent('Zoom 100% · Rot 0°');

    await click('Zoom in');
    await menu('menuitem', 'Rotate right (>)');
    await menu('menuitemcheckbox', 'Invert (I)');
    await menu('menuitem', 'Flip vertical (V)');
    expect(readout).toHaveTextContent('Zoom 125% · Rot 90°');
    expect(readout).toHaveTextContent('Inverted');
    expect(readout).toHaveTextContent('Mirrored');
    expect(await invertChecked()).toBe('true');

    await click('Fit / Reset');
    expect(readout).toHaveTextContent(/^Zoom 100% · Rot 0°$/);
    expect(await invertChecked()).toBe('false');
  });

  it('the viewport is focusable and describes its shortcuts', async () => {
    await renderReady();
    const viewport = screen.getByRole('img', { name: 'DICOM image for study-001' });
    expect(viewport).toHaveAttribute('tabindex', '0');
    expect(viewport).toHaveAttribute('aria-keyshortcuts');
    expect(viewport).toHaveAccessibleDescription(/Shift\+R: Rotate left/);
    // Measurement keys match the README table.
    expect(viewport).toHaveAccessibleDescription(
      /Delete \/ Backspace: Delete the selected measurement/,
    );
    expect(viewport).toHaveAccessibleDescription(
      /Esc: Cancel the measurement or brush stroke in progress/,
    );
    // Segmentation keys too.
    expect(viewport).toHaveAccessibleDescription(/B: Brush tool/);
    expect(viewport).toHaveAccessibleDescription(/E: Eraser tool/);
    expect(viewport).toHaveAccessibleDescription(/Ctrl\+Z \/ Cmd\+Z: Undo the last brush/);
    expect(viewport.getAttribute('aria-keyshortcuts')?.split(' ')).toEqual(
      expect.arrayContaining(['Delete', 'Backspace', 'Escape', 'B', 'E', 'Control+Z', 'Meta+Z']),
    );
    expect(viewport).toBeEmptyDOMElement();
  });
});
