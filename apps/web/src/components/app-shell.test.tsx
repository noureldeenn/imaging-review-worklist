import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../app';
import { makeStudy } from '../test/handlers';
import { renderWithProviders } from '../test/render';
import { server } from '../test/server';

function stubViewport(narrow: boolean) {
  vi.stubGlobal(
    'matchMedia',
    (query: string) =>
      ({
        matches: narrow && query === '(max-width: 899px)',
        media: query,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }) as unknown as MediaQueryList,
  );
  vi.stubGlobal('scrollTo', vi.fn());
}

describe('AppShell pane focus', () => {
  beforeEach(() => {
    server.use(http.get('/api/studies/:id', () => HttpResponse.json(makeStudy(2))));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('below 900px: opening a study focuses the detail heading, Back returns focus to the row', async () => {
    stubViewport(true);
    const user = userEvent.setup();
    renderWithProviders(<App />);
    await user.click(await screen.findByRole('button', { name: 'Open study study-002' }));
    const heading = await screen.findByRole('heading', { name: /study-002 · / });
    await waitFor(() => expect(document.activeElement).toBe(heading));
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0 });

    await user.click(screen.getByRole('button', { name: 'Back to worklist' }));
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole('button', { name: 'Open study study-002' }),
      ),
    );
  });

  it('at 900px and wider: focus stays on the clicked row and nothing scrolls', async () => {
    stubViewport(false);
    const user = userEvent.setup();
    renderWithProviders(<App />);
    const row = await screen.findByRole('button', { name: 'Open study study-002' });
    await user.click(row);
    await screen.findByRole('heading', { name: /study-002 · / });
    expect(document.activeElement).toBe(row);
    expect(window.scrollTo).not.toHaveBeenCalled();
  });
});
