import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../app';
import type { StudyDto } from '../api/schemas';
import { useSessionStore } from '../stores/session-store';
import { ATTENTION_DESCRIPTION } from '../toolbar/toolbar-button';
import { deferred } from '../test/deferred';
import { makeStudy } from '../test/handlers';
import { stubWindowWidth } from '../test/match-media';
import { renderWithProviders } from '../test/render';
import { server } from '../test/server';

const button = (name: string) => screen.getByRole('button', { name });
const drawer = () => screen.getByRole('region', { name: 'Worklist' });
const panel = () => document.getElementById('review-panel');

function setup(width: number) {
  stubWindowWidth(width);
  vi.stubGlobal('scrollTo', vi.fn());
  const user = userEvent.setup();
  renderWithProviders(<App />);
  return user;
}

beforeEach(() => {
  server.use(
    http.get('/api/studies/:id', ({ params }) =>
      HttpResponse.json(makeStudy(Number(String(params['id']).slice(-3)))),
    ),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe('Worklist drawer', () => {
  it('is open with no selection; the viewer area shows the empty state', async () => {
    setup(1440);
    await screen.findByRole('button', { name: 'Open study study-001' });
    expect(button('Worklist')).toHaveAttribute('aria-expanded', 'true');
    expect(button('Worklist')).toHaveAttribute('aria-controls', drawer().id);
    expect(drawer()).toHaveAttribute('data-state', 'open');
    expect(button('Review')).toBeDisabled();
    expect(screen.getByText('Select a study to view it.')).toBeInTheDocument();
  });

  it('keyboard: selecting a row closes it and returns focus to Worklist; reopening focuses the open row', async () => {
    const user = setup(1440);
    const row = await screen.findByRole('button', { name: 'Open study study-002' });
    row.focus();
    await user.keyboard('{Enter}');
    await screen.findByRole('heading', { name: /study-002 · / });
    expect(useSessionStore.getState().selectedStudyId).toBe('study-002');
    expect(drawer()).toHaveAttribute('data-state', 'closed');
    expect(button('Worklist')).toHaveAttribute('aria-expanded', 'false');
    expect(button('Worklist')).toHaveFocus();

    await user.click(button('Worklist'));
    expect(drawer()).toHaveAttribute('data-state', 'open');
    expect(button('Open study study-002')).toHaveFocus();
    // The page itself never scrolls to show a pane.
    expect(window.scrollTo).not.toHaveBeenCalled();
  });

  it('choosing the study that is already open also closes it', async () => {
    const user = setup(1440);
    await user.click(await screen.findByRole('button', { name: 'Open study study-003' }));
    await user.click(button('Worklist'));
    expect(drawer()).toHaveAttribute('data-state', 'open');
    await user.click(button('Open study study-003'));
    expect(drawer()).toHaveAttribute('data-state', 'closed');
  });

  it('Esc and an outside click close it; Esc returns focus to the trigger', async () => {
    const user = setup(1440);
    await screen.findByRole('button', { name: 'Open study study-001' });
    button('Open study study-001').focus();
    await user.keyboard('{Escape}');
    expect(drawer()).toHaveAttribute('data-state', 'closed');
    expect(button('Worklist')).toHaveFocus();

    await user.click(button('Worklist'));
    expect(drawer()).toHaveAttribute('data-state', 'open');
    fireEvent.pointerDown(screen.getByRole('main', { name: 'Study viewer' }));
    expect(drawer()).toHaveAttribute('data-state', 'closed');
  });
});

describe('Review panel modes', () => {
  it('>= 1280px: pushes the layout and is open by default; collapsing keeps it mounted', async () => {
    const user = setup(1440);
    await user.click(await screen.findByRole('button', { name: 'Open study study-001' }));
    await screen.findByRole('heading', { name: /study-001 · / });
    expect(panel()).toHaveAttribute('data-mode', 'push');
    expect(panel()).toHaveAttribute('data-state', 'open');
    expect(button('Review')).toHaveAttribute('aria-expanded', 'true');
    // Static panel: opening a study does not steal focus from the toolbar.
    expect(button('Worklist')).toHaveFocus();
    await user.click(button('Review'));
    expect(panel()).toHaveAttribute('data-state', 'closed');
    expect(screen.getByRole('heading', { name: /study-001 · / })).toBeInTheDocument();
  });

  it('900-1279px: an overlay, closed by default; opens with focus inside, outside click closes', async () => {
    const user = setup(1024);
    await user.click(await screen.findByRole('button', { name: 'Open study study-001' }));
    const heading = await screen.findByRole('heading', { name: /study-001 · / });
    expect(panel()).toHaveAttribute('data-mode', 'overlay');
    expect(panel()).toHaveAttribute('data-state', 'closed');
    await user.click(button('Review'));
    expect(panel()).toHaveAttribute('data-state', 'open');
    await waitFor(() => expect(heading).toHaveFocus());
    fireEvent.pointerDown(screen.getByRole('main', { name: 'Study viewer' }));
    expect(panel()).toHaveAttribute('data-state', 'closed');
  });

  it('< 900px: a bottom sheet, closed by default; Esc and the close button return focus to Review', async () => {
    const user = setup(390);
    await user.click(await screen.findByRole('button', { name: 'Open study study-002' }));
    const heading = await screen.findByRole('heading', { name: /study-002 · / });
    expect(panel()).toHaveAttribute('data-mode', 'sheet');
    expect(panel()).toHaveAttribute('data-state', 'closed');
    // Selecting closed the drawer and handed focus back to its trigger.
    expect(button('Worklist')).toHaveFocus();

    await user.click(button('Review'));
    await waitFor(() => expect(heading).toHaveFocus());
    expect(button('Claim')).toBeEnabled();
    await user.keyboard('{Escape}');
    expect(panel()).toHaveAttribute('data-state', 'closed');
    expect(button('Review')).toHaveFocus();

    await user.click(button('Review'));
    await user.click(button('Close review panel'));
    expect(panel()).toHaveAttribute('data-state', 'closed');
    expect(button('Review')).toHaveFocus();
  });
});

describe('Mutation feedback reaches a collapsed panel', () => {
  async function claimThenCollapse(user: ReturnType<typeof userEvent.setup>) {
    await user.click(await screen.findByRole('button', { name: 'Open study study-001' }));
    await user.click(button('Review'));
    const claim = await screen.findByRole('button', { name: 'Claim' });
    await waitFor(() => expect(claim).toBeEnabled());
    await user.click(claim);
    await user.keyboard('{Escape}');
    expect(panel()).toHaveAttribute('data-state', 'closed');
  }

  it('a finished Claim reopens the panel with its status line', async () => {
    const gate = deferred<StudyDto>();
    server.use(
      http.post('/api/studies/:id/claim', async () => HttpResponse.json(await gate.promise)),
    );
    const user = setup(1024);
    await claimThenCollapse(user);
    act(() =>
      gate.resolve(makeStudy(1, { status: 'InReview', ownerId: 'reviewer-a', version: 1 })),
    );
    expect(await screen.findByText('Study claimed.')).toBeInTheDocument();
    expect(panel()).toHaveAttribute('data-state', 'open');
  });

  it('a 412 reopens the panel so Refresh and continue is reachable; closing it again badges Review', async () => {
    const gate = deferred<void>();
    const current = makeStudy(1, { status: 'InReview', ownerId: 'reviewer-b', version: 3 });
    server.use(
      http.post('/api/studies/:id/claim', async () => {
        await gate.promise;
        return HttpResponse.json(
          { code: 'STALE_VERSION', message: 'stale', current },
          { status: 412 },
        );
      }),
    );
    const user = setup(1024);
    await claimThenCollapse(user);
    act(() => gate.resolve());
    expect(await screen.findByText(/now version 3/)).toBeInTheDocument();
    expect(panel()).toHaveAttribute('data-state', 'open');
    expect(button('Refresh and continue')).toBeEnabled();

    await user.click(button('Close review panel'));
    expect(button('Review')).toHaveAttribute('data-attention', 'true');
    await user.click(button('Review'));
    button('Refresh and continue').focus();
    await user.keyboard('{Enter}');
    await waitFor(() => expect(screen.queryByText(/now version/)).not.toBeInTheDocument());
    expect(button('Review')).not.toHaveAttribute('data-attention');
  });

  it('feedback reveals the panel without moving focus into it', async () => {
    const gate = deferred<StudyDto>();
    server.use(
      http.post('/api/studies/:id/claim', async () => HttpResponse.json(await gate.promise)),
    );
    const user = setup(1024);
    await claimThenCollapse(user);
    button('Worklist').focus();
    act(() =>
      gate.resolve(makeStudy(1, { status: 'InReview', ownerId: 'reviewer-a', version: 1 })),
    );
    expect(await screen.findByText('Study claimed.')).toBeInTheDocument();
    expect(panel()).toHaveAttribute('data-state', 'open');
    // Focus stays on the toolbar; nothing inside the panel took it.
    expect(button('Worklist')).toHaveFocus();
    expect(panel()?.contains(document.activeElement)).toBe(false);
  });

  it('feedback never closes an open Worklist drawer; the Review dot (with a description) is the cue', async () => {
    const gate = deferred<void>();
    const current = makeStudy(1, { status: 'InReview', ownerId: 'reviewer-b', version: 3 });
    server.use(
      http.post('/api/studies/:id/claim', async () => {
        await gate.promise;
        return HttpResponse.json(
          { code: 'STALE_VERSION', message: 'stale', current },
          { status: 412 },
        );
      }),
    );
    const user = setup(1024);
    await claimThenCollapse(user);
    await user.click(button('Worklist'));
    expect(drawer()).toHaveAttribute('data-state', 'open');
    const focused = document.activeElement;

    act(() => gate.resolve());
    await waitFor(() => expect(button('Review')).toHaveAttribute('data-attention', 'true'));
    expect(drawer()).toHaveAttribute('data-state', 'open');
    expect(panel()).toHaveAttribute('data-state', 'closed');
    expect(document.activeElement).toBe(focused);
    expect(button('Review')).toHaveAttribute('aria-description', ATTENTION_DESCRIPTION);

    // The 412 recovery stays reachable from the badged button.
    await user.click(button('Review'));
    expect(drawer()).toHaveAttribute('data-state', 'closed');
    button('Refresh and continue').focus();
    await user.keyboard('{Enter}');
    await waitFor(() => expect(screen.queryByText(/now version/)).not.toBeInTheDocument());
  });
});
