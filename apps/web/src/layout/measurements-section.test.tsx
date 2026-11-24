import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetAnnotations, useAnnotationStore } from '../viewer/annotations/annotation-store';
import { EMPTY_MEASUREMENTS, MeasurementsSection } from './measurements-section';

const store = () => useAnnotationStore.getState();
const region = () => screen.getByRole('region', { name: 'Measurements' });

beforeEach(() => resetAnnotations());

describe('MeasurementsSection', () => {
  it('shows the empty state and a disabled Clear', () => {
    render(<MeasurementsSection studyId="A" />);
    expect(within(region()).getByText(EMPTY_MEASUREMENTS)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear measurements' })).toBeDisabled();
  });

  it('lists type and value with a labelled Delete per item; selecting selects on the image', async () => {
    const user = userEvent.setup();
    render(<MeasurementsSection studyId="A" />);
    let lengthId = '';
    act(() => {
      lengthId =
        store().add('A', {
          kind: 'length',
          points: [
            [0, 0],
            [30, 40],
          ],
          spacing: null,
        }) ?? '';
      store().add('A', {
        kind: 'angle',
        points: [
          [10, 0],
          [0, 0],
          [0, 10],
        ],
        spacing: null,
      });
      store().add('B', {
        kind: 'rectangle',
        points: [
          [0, 0],
          [5, 5],
        ],
        spacing: null,
      });
    });
    const items = within(region()).getAllByRole('listitem');
    expect(items.map((li) => within(li).getAllByRole('button')[0]?.textContent)).toEqual([
      'Length 50 px',
      'Angle 90.0°',
    ]);
    const item = screen.getByRole('button', { name: 'Length 50 px' });
    await user.click(item);
    expect(store().selectedIn('A')).toBe(lengthId);
    expect(item).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByRole('button', { name: 'Delete Angle 90.0°' }));
    expect(
      store()
        .list('A')
        .map((a) => a.kind),
    ).toEqual(['length']);

    await user.click(screen.getByRole('button', { name: 'Clear measurements' }));
    expect(store().list('A')).toEqual([]);
    expect(store().list('B')).toHaveLength(1);
    expect(within(region()).getByText(EMPTY_MEASUREMENTS)).toBeInTheDocument();
  });

  it('is keyboard operable', async () => {
    const user = userEvent.setup();
    act(() => {
      store().add('A', {
        kind: 'length',
        points: [
          [0, 0],
          [3, 4],
        ],
        spacing: { row: 1, column: 1 },
      });
    });
    render(<MeasurementsSection studyId="A" />);
    screen.getByRole('button', { name: 'Length 5.0 mm' }).focus();
    await user.keyboard('{Enter}');
    expect(store().selectedIn('A')).not.toBeNull();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Delete Length 5.0 mm' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(store().list('A')).toEqual([]);
  });
});
