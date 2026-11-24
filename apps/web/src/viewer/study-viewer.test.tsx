import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fake } from '../test/fake-cornerstone';
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
  render(<StudyViewer studyId="study-001" />);
  await waitFor(() => expect(fake.stacks).toHaveLength(1));
  fake.stacks[0]?.d.resolve('ok');
  return screen.findByTestId('viewer-readout');
}

describe('StudyViewer controls', () => {
  it('the readout follows the toolbar and Fit / Reset restores it', async () => {
    const readout = await renderReady();
    const click = (name: string) => userEvent.click(screen.getByRole('button', { name }));
    expect(readout).toHaveTextContent('Zoom 100% · Rot 0°');

    await click('Zoom in');
    await click('Rotate right');
    await click('Invert');
    await click('Flip vertical');
    expect(readout).toHaveTextContent('Zoom 125% · Rot 90°');
    expect(readout).toHaveTextContent('Inverted');
    expect(readout).toHaveTextContent('Flipped V');
    expect(screen.getByRole('button', { name: 'Invert' })).toHaveAttribute('aria-pressed', 'true');

    await click('Fit / Reset');
    expect(readout).toHaveTextContent(/^Zoom 100% · Rot 0°$/);
    expect(screen.getByRole('button', { name: 'Invert' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('the viewport is focusable and describes its shortcuts', async () => {
    await renderReady();
    const viewport = screen.getByRole('img', { name: 'DICOM image for study-001' });
    expect(viewport).toHaveAttribute('tabindex', '0');
    expect(viewport).toHaveAttribute('aria-keyshortcuts');
    expect(viewport).toHaveAccessibleDescription(/Shift\+R: Rotate left/);
    expect(viewport).toBeEmptyDOMElement();
  });
});
