import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import type { StudyDto } from '../api/schemas';
import { studiesKeys } from '../queries/studies-queries';
import { deferred, type Deferred } from '../test/deferred';
import { makeStudy, seededStudies } from '../test/handlers';
import { renderWithProviders } from '../test/render';
import { server } from '../test/server';
import { Filters } from './filters';
import { Worklist } from './worklist';

function ui() {
  return (
    <>
      <Filters />
      <Worklist />
    </>
  );
}

function rowIds(): string[] {
  return screen
    .getAllByRole('button', { name: /^Open study / })
    .map((b) => b.getAttribute('aria-label')?.replace('Open study ', '') ?? '');
}

describe('Worklist', () => {
  it('a delayed older filter response cannot replace the current list', async () => {
    const gates = new Map<string, Deferred<StudyDto[]>>();
    const arrived: string[] = [];
    server.use(
      http.get('/api/studies', async ({ request }) => {
        const key = new URL(request.url).search;
        const d = deferred<StudyDto[]>();
        gates.set(key, d);
        arrived.push(key);
        return HttpResponse.json(await d.promise);
      }),
    );
    const user = userEvent.setup();
    const { queryClient } = renderWithProviders(ui());
    await waitFor(() => expect(arrived).toEqual(['']));

    await user.selectOptions(screen.getByLabelText('Status'), 'Completed');
    await waitFor(() => expect(arrived).toEqual(['', '?status=Completed']));

    const d1 = gates.get('');
    const d2 = gates.get('?status=Completed');
    if (!d1 || !d2) throw new Error('requests not captured');

    d2.resolve([makeStudy(6, { status: 'Completed' }), makeStudy(7, { status: 'Completed' })]);
    await waitFor(() => expect(rowIds()).toEqual(['study-006', 'study-007']));

    d1.resolve(seededStudies);
    // Wait until the stale response has actually landed in its own cache entry.
    await waitFor(() =>
      expect(queryClient.getQueryState(studiesKeys.list({}))?.status).toBe('success'),
    );
    await waitFor(() => expect(rowIds()).toEqual(['study-006', 'study-007']));
  });

  it('shows the empty state when the filter combination has no matches', async () => {
    server.use(
      http.get('/api/studies', ({ request }) => {
        const p = new URL(request.url).searchParams;
        if (p.get('status') === 'Completed' && p.get('modality') === 'OT') {
          return HttpResponse.json([]);
        }
        return HttpResponse.json(seededStudies);
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(ui());
    await screen.findByRole('button', { name: 'Open study study-001' });
    await user.selectOptions(screen.getByLabelText('Status'), 'Completed');
    await user.selectOptions(screen.getByLabelText('Modality'), 'OT');
    expect(await screen.findByText('No studies match these filters.')).toBeInTheDocument();
  });

  it('shows loading then rows, and an error with Retry on 500', async () => {
    let fail = true;
    const gate = deferred<void>();
    server.use(
      http.get('/api/studies', async () => {
        await gate.promise;
        if (fail) {
          return HttpResponse.json({ code: 'INTERNAL', message: 'boom' }, { status: 500 });
        }
        return HttpResponse.json(seededStudies);
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<Worklist />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading studies…');
    gate.resolve();
    const alert = await screen.findByRole('alert');
    fail = false;
    await user.click(within(alert).getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('button', { name: 'Open study study-001' })).toBeInTheDocument();
    expect(rowIds()).toHaveLength(8);
  });
});
