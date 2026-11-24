import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { createDiffRecorder } from '../viewer/segmentation/mask-memory';
import { stampDisc } from '../viewer/segmentation/seg-math';
import {
  DROPPED_NOTICE,
  MAX_SEGMENTS,
  SEGMENT_LIMIT_NOTICE,
  TOO_LARGE_NOTICE,
} from '../viewer/segmentation/seg-types';
import { resetSegmentation, useSegmentStore } from '../viewer/segmentation/segment-store';
import { NOT_DIAGNOSTIC, STORED_VALUES_HINT } from './segment-controls';
import { EMPTY_SEGMENTS, SegmentsSection } from './segments-section';

const store = () => useSegmentStore.getState();
const region = () => screen.getByRole('region', { name: 'Segments' });
const heading = () => within(region()).getByRole('heading', { name: /Segments/ });
const announcer = () => screen.getByTestId('segments-announcer');
const status = () => screen.getByTestId('segments-status');
const btn = (name: string) => within(region()).getByRole('button', { name });

/** A brush stroke as the painting machine records it. */
function paint(studyId: string, centre: [number, number], radius = 1) {
  act(() => {
    const t = store().prepareStroke(studyId, 32, 32);
    if (!t) return;
    const diff = createDiffRecorder(32 * 32);
    const rect = stampDisc(t.mask, 32, 32, centre, radius, t.label, { diff });
    store().commitStroke(studyId, diff.pack(rect));
  });
}

beforeEach(() => resetSegmentation());

describe('SegmentsSection', () => {
  it('shows the empty state, disabled Clear and Undo, and mounted live regions', () => {
    render(<SegmentsSection studyId="A" />);
    expect(within(region()).getByText(EMPTY_SEGMENTS)).toBeInTheDocument();
    expect(btn('Clear segments')).toBeDisabled();
    expect(btn('Undo last stroke')).toBeDisabled();
    expect(announcer()).toHaveAttribute('role', 'status');
    expect(status()).toHaveAttribute('role', 'status');
    expect(status()).toHaveTextContent('');
  });

  it('adds segments; choosing one makes it the active (pressed) paint target', async () => {
    const user = userEvent.setup();
    render(<SegmentsSection studyId="A" />);
    await user.click(btn('Add segment'));
    await user.click(btn('Add segment'));
    expect(heading()).toHaveTextContent('Segments 2');
    expect(btn('Paint with Segment 2')).toHaveAttribute('aria-pressed', 'true');
    expect(btn('Paint with Segment 1')).toHaveAttribute('aria-pressed', 'false');
    await user.click(btn('Paint with Segment 1'));
    expect(btn('Paint with Segment 1')).toHaveAttribute('aria-pressed', 'true');
    expect(store().study('A').activeId).toBe(store().study('A').segments[0]?.id);
  });

  it('renames through a labelled field; Hide/Show names follow the state', async () => {
    const user = userEvent.setup();
    render(<SegmentsSection studyId="A" />);
    await user.click(btn('Add segment'));
    const name = within(region()).getByRole('textbox', { name: 'Name of segment 1' });
    await user.clear(name);
    await user.type(name, 'Liver');
    expect(store().study('A').segments[0]?.name).toBe('Liver');
    await user.click(btn('Hide Liver'));
    expect(store().study('A').segments[0]?.visible).toBe(false);
    await user.click(btn('Show Liver'));
    expect(store().study('A').segments[0]?.visible).toBe(true);
    // An emptied name falls back to a default on blur.
    await user.clear(name);
    fireEvent.blur(name);
    expect(store().study('A').segments[0]?.name).toBe('Segment 1');
  });

  it('delete keeps focus in the list (next, else previous, else heading) and announces each time', async () => {
    const user = userEvent.setup();
    render(<SegmentsSection studyId="A" />);
    for (let k = 0; k < 3; k += 1) await user.click(btn('Add segment'));
    await user.click(btn('Delete Segment 2'));
    expect(btn('Paint with Segment 3')).toHaveFocus();
    expect(announcer()).toHaveTextContent('Segment 2 deleted');
    const first = announcer().firstElementChild;
    await user.click(btn('Delete Segment 3'));
    expect(btn('Paint with Segment 1')).toHaveFocus();
    await user.click(btn('Add segment'));
    await user.click(btn('Delete Segment 4'));
    expect(btn('Paint with Segment 1')).toHaveFocus();
    await user.click(btn('Delete Segment 1'));
    expect(heading()).toHaveFocus();
    expect(within(region()).getByText(EMPTY_SEGMENTS)).toBeInTheDocument();
    // Each announcement is a fresh node, so a repeated text is read again.
    expect(announcer().firstElementChild).not.toBe(first);
  });

  it('repeated identical announcements replace the node (Segments cleared twice)', async () => {
    const user = userEvent.setup();
    render(<SegmentsSection studyId="A" />);
    await user.click(btn('Add segment'));
    await user.click(btn('Clear segments'));
    expect(announcer()).toHaveTextContent('Segments cleared');
    expect(heading()).toHaveFocus();
    const node = announcer().firstElementChild;
    await user.click(btn('Add segment'));
    await user.click(btn('Clear segments'));
    expect(announcer()).toHaveTextContent('Segments cleared');
    expect(announcer().firstElementChild).not.toBe(node);
  });

  it('shows the limit, too-large and dropped messages in the status region', async () => {
    const user = userEvent.setup();
    render(<SegmentsSection studyId="A" />);
    for (let k = 0; k < MAX_SEGMENTS; k += 1) await user.click(btn('Add segment'));
    expect(status()).toHaveTextContent(SEGMENT_LIMIT_NOTICE);
    expect(btn('Add segment')).toBeDisabled();
    act(() => {
      store().clear('A');
      store().prepareStroke('A', 5000, 5000);
    });
    expect(status()).toHaveTextContent(TOO_LARGE_NOTICE);
    act(() => resetSegmentation(32 * 32 + 64));
    paint('A', [3, 3]);
    paint('B', [3, 3]);
    expect(status()).toHaveTextContent(DROPPED_NOTICE);
  });

  it('area readout: px² without spacing, mm² with anisotropic Pixel Spacing (debounced)', async () => {
    render(<SegmentsSection studyId="A" />);
    paint('A', [4.5, 4.5]);
    await screen.findByText('5 px²', undefined, { timeout: 2000 });
    act(() => store().setImageInfo('A', { spacing: { row: 0.5, column: 2 }, ct: true }));
    expect(screen.getByTestId('segment-area')).toHaveTextContent('5.0 mm²');
  });

  it('brush size, opacity, smart range and Undo drive the store', async () => {
    const user = userEvent.setup();
    render(<SegmentsSection studyId="A" />);
    fireEvent.change(screen.getByRole('slider', { name: 'Brush size' }), {
      target: { value: '37' },
    });
    expect(store().brushSize).toBe(37);
    fireEvent.change(screen.getByRole('slider', { name: 'Opacity' }), { target: { value: '80' } });
    expect(store().opacity).toBe(80);
    const range = screen.getByRole('combobox', { name: 'Smart brush range' });
    expect(range).toHaveAccessibleDescription(new RegExp(NOT_DIAGNOSTIC.replace('.', '\\.')));
    await user.selectOptions(range, 'bone');
    expect(store().preset).toBe('bone');
    expect(screen.queryByRole('spinbutton', { name: 'Minimum' })).not.toBeInTheDocument();
    await user.selectOptions(range, 'custom');
    const min = screen.getByRole('spinbutton', { name: 'Minimum' });
    await user.clear(min);
    await user.type(min, '-190');
    expect(store().custom.min).toBe(-190);
    const max = screen.getByRole('spinbutton', { name: 'Maximum' });
    await user.clear(max);
    await user.type(max, '-30');
    expect(store().custom.max).toBe(-30);
    paint('A', [4.5, 4.5]);
    expect(btn('Undo last stroke')).toBeEnabled();
    await user.click(btn('Undo last stroke'));
    expect(store().study('A').undoDepth).toBe(0);
    expect(btn('Undo last stroke')).toBeDisabled();
  });

  it('Escape in the name field restores the name it had when focused', async () => {
    const user = userEvent.setup();
    render(<SegmentsSection studyId="A" />);
    await user.click(btn('Add segment'));
    const name = within(region()).getByRole('textbox', { name: 'Name of segment 1' });
    await user.click(name);
    await user.type(name, ' edited');
    expect(store().study('A').segments[0]?.name).toBe('Segment 1 edited');
    await user.keyboard('{Escape}');
    expect(store().study('A').segments[0]?.name).toBe('Segment 1');
    expect(name).toHaveValue('Segment 1');
  });

  it('an emptied or duplicate name falls back to the segment’s own number (names stay unique)', async () => {
    const user = userEvent.setup();
    render(<SegmentsSection studyId="A" />);
    for (let k = 0; k < 3; k += 1) await user.click(btn('Add segment'));
    await user.click(btn('Delete Segment 1'));
    // Segment 2 is now first in the list: an empty name must not become "Segment 1".
    const first = within(region()).getByRole('textbox', { name: 'Name of segment 1' });
    await user.clear(first);
    fireEvent.blur(first);
    expect(
      store()
        .study('A')
        .segments.map((x) => x.name),
    ).toEqual(['Segment 2', 'Segment 3']);
    const second = within(region()).getByRole('textbox', { name: 'Name of segment 2' });
    await user.clear(second);
    await user.type(second, 'Segment 2');
    fireEvent.blur(second);
    const names = store()
      .study('A')
      .segments.map((x) => x.name);
    expect(new Set(names).size).toBe(names.length);
    expect(within(region()).getAllByRole('button', { name: /^Delete / })).toHaveLength(2);
  });

  it('when a click disables its own button, focus moves to a neighbour, not the body', async () => {
    const user = userEvent.setup();
    render(<SegmentsSection studyId="A" />);
    paint('A', [4.5, 4.5]);
    await user.click(btn('Undo last stroke'));
    expect(btn('Undo last stroke')).toBeDisabled();
    expect(btn('Clear segments')).toHaveFocus();
    for (let k = 0; k < MAX_SEGMENTS - 2; k += 1) await user.click(btn('Add segment'));
    expect(btn('Add segment')).toBeEnabled();
    await user.click(btn('Add segment'));
    expect(btn('Add segment')).toBeDisabled();
    expect(
      within(region()).getByRole('textbox', { name: `Name of segment ${MAX_SEGMENTS}` }),
    ).toHaveFocus();
  });

  it('the status region stays rendered when empty and re-announces a repeated refusal', () => {
    render(<SegmentsSection studyId="A" />);
    expect(status()).toHaveClass('sr-only');
    expect(status()).not.toHaveClass('empty:hidden');
    act(() => {
      store().prepareStroke('A', 5000, 5000);
    });
    expect(status()).toHaveTextContent(TOO_LARGE_NOTICE);
    expect(status()).not.toHaveClass('sr-only');
    const node = status().firstElementChild;
    act(() => {
      store().prepareStroke('A', 5000, 5000);
    });
    expect(status()).toHaveTextContent(TOO_LARGE_NOTICE);
    expect(status().firstElementChild).not.toBe(node);
  });

  it('for non-CT images the HU presets are disabled and the stored-values hint shows', () => {
    act(() => store().setImageInfo('A', { spacing: null, ct: false }));
    render(<SegmentsSection studyId="A" />);
    const range = screen.getByRole('combobox', { name: 'Smart brush range' });
    expect(range).toHaveValue('custom');
    expect(range).toHaveAccessibleDescription(new RegExp(STORED_VALUES_HINT));
    expect(screen.getByRole('option', { name: 'Bone [150, 3000]' })).toBeDisabled();
    expect(screen.getByRole('option', { name: 'Custom' })).toBeEnabled();
    expect(screen.getByRole('spinbutton', { name: 'Minimum' })).toBeInTheDocument();
  });
});
