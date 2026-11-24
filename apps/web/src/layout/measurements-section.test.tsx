import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  MAX_ANNOTATIONS,
  resetAnnotations,
  useAnnotationStore,
} from '../viewer/annotations/annotation-store';
import type { Annotation } from '../viewer/annotations/measure-math';
import { EMPTY_MEASUREMENTS, MeasurementsSection } from './measurements-section';

const store = () => useAnnotationStore.getState();
const region = () => screen.getByRole('region', { name: 'Measurements' });
const heading = () => within(region()).getByRole('heading', { name: /Measurements/ });
const announcer = () => screen.getByTestId('measurements-announcer');

type Shape = Omit<Annotation, 'id'>;
const LENGTH_50: Shape = {
  kind: 'length',
  points: [
    [0, 0],
    [30, 40],
  ],
  spacing: null,
};
const ANGLE_90: Shape = {
  kind: 'angle',
  points: [
    [10, 0],
    [0, 0],
    [0, 10],
  ],
  spacing: null,
};
const add = (studyId: string, ...shapes: Shape[]) =>
  act(() => {
    shapes.forEach((s) => store().add(studyId, s));
  });

beforeEach(() => resetAnnotations());

describe('MeasurementsSection', () => {
  it('shows the empty state and a disabled Clear', () => {
    render(<MeasurementsSection studyId="A" />);
    expect(within(region()).getByText(EMPTY_MEASUREMENTS)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear measurements' })).toBeDisabled();
    // Live regions are mounted (empty) before anything is announced.
    expect(announcer()).toHaveAttribute('role', 'status');
    expect(announcer()).toHaveTextContent('');
  });

  it('lists numbered type and value with a labelled Delete per item; selecting selects on the image', async () => {
    const user = userEvent.setup();
    render(<MeasurementsSection studyId="A" />);
    add('A', LENGTH_50, ANGLE_90, LENGTH_50);
    add('B', {
      kind: 'rectangle',
      points: [
        [0, 0],
        [5, 5],
      ],
      spacing: null,
    });
    const items = within(region()).getAllByRole('listitem');
    expect(items.map((li) => within(li).getAllByRole('button')[0]?.textContent)).toEqual([
      'Length 1, 50 px',
      'Angle 1, 90.0°',
      'Length 2, 50 px',
    ]);
    const item = screen.getByRole('button', { name: 'Length 1, 50 px' });
    await user.click(item);
    expect(store().selectedIn('A')).toBe(store().list('A')[0]?.id);
    expect(item).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByRole('button', { name: 'Delete Angle 1, 90.0°' }));
    expect(
      store()
        .list('A')
        .map((a) => a.kind),
    ).toEqual(['length', 'length']);

    await user.click(screen.getByRole('button', { name: 'Clear measurements' }));
    expect(store().list('A')).toEqual([]);
    expect(store().list('B')).toHaveLength(1);
    expect(within(region()).getByText(EMPTY_MEASUREMENTS)).toBeInTheDocument();
  });

  it('keyboard: after Delete focus moves to the next item, else the previous, else the heading', async () => {
    const user = userEvent.setup();
    add('A', LENGTH_50, ANGLE_90, LENGTH_50);
    render(<MeasurementsSection studyId="A" />);

    screen.getByRole('button', { name: 'Delete Length 1, 50 px' }).focus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('button', { name: 'Angle 1, 90.0°' })).toHaveFocus();
    expect(announcer()).toHaveTextContent('Length 1, 50 px deleted');

    screen.getByRole('button', { name: 'Delete Length 1, 50 px' }).focus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('button', { name: 'Angle 1, 90.0°' })).toHaveFocus();

    await user.tab();
    expect(screen.getByRole('button', { name: 'Delete Angle 1, 90.0°' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(heading()).toHaveFocus();
    expect(announcer()).toHaveTextContent('Angle 1, 90.0° deleted');
  });

  it('keyboard: Clear moves focus to the heading and announces it', async () => {
    const user = userEvent.setup();
    add('A', LENGTH_50, ANGLE_90);
    render(<MeasurementsSection studyId="A" />);
    screen.getByRole('button', { name: 'Clear measurements' }).focus();
    await user.keyboard('{Enter}');
    expect(heading()).toHaveFocus();
    expect(announcer()).toHaveTextContent('Measurements cleared');
    expect(document.activeElement).not.toBe(document.body);
  });

  /** Counts DOM mutations inside the announcer (a repeat must still change the DOM). */
  function watchAnnouncer() {
    const records: MutationRecord[] = [];
    const observer = new MutationObserver((r) => records.push(...r));
    observer.observe(announcer(), { childList: true, subtree: true, characterData: true });
    return {
      count: () => {
        records.push(...observer.takeRecords());
        return records.length;
      },
      stop: () => observer.disconnect(),
    };
  }

  it('re-announces an identical delete message (a fresh DOM change each time)', async () => {
    const user = userEvent.setup();
    add('A', LENGTH_50, LENGTH_50);
    render(<MeasurementsSection studyId="A" />);
    const watch = watchAnnouncer();

    await user.click(screen.getByRole('button', { name: 'Delete Length 1, 50 px' }));
    expect(announcer()).toHaveTextContent('Length 1, 50 px deleted');
    const afterFirst = watch.count();
    expect(afterFirst).toBeGreaterThan(0);

    // The remaining shape is renumbered to the same name: same text, announced again.
    await user.click(screen.getByRole('button', { name: 'Delete Length 1, 50 px' }));
    expect(announcer()).toHaveTextContent('Length 1, 50 px deleted');
    expect(watch.count()).toBeGreaterThan(afterFirst);
    watch.stop();
  });

  it('re-announces "Measurements cleared" after a draw in between', async () => {
    const user = userEvent.setup();
    add('A', LENGTH_50);
    render(<MeasurementsSection studyId="A" />);
    const watch = watchAnnouncer();
    await user.click(screen.getByRole('button', { name: 'Clear measurements' }));
    const afterFirst = watch.count();
    expect(afterFirst).toBeGreaterThan(0);
    add('A', ANGLE_90);
    await user.click(screen.getByRole('button', { name: 'Clear measurements' }));
    expect(announcer()).toHaveTextContent('Measurements cleared');
    expect(watch.count()).toBeGreaterThan(afterFirst);
    watch.stop();
  });

  it('the limit message lives in an always-mounted status region', () => {
    render(<MeasurementsSection studyId="A" />);
    const limit = screen.getByTestId('measurements-limit');
    expect(limit).toHaveAttribute('role', 'status');
    expect(limit).toHaveTextContent('');
    add('A', ...Array.from({ length: MAX_ANNOTATIONS }, () => LENGTH_50));
    expect(limit).toHaveTextContent(`Limit of ${MAX_ANNOTATIONS} measurements reached`);
  });
});
