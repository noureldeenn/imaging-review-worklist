import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { useSessionStore } from '../stores/session-store';
import { server } from './server';

// jsdom has no canvas backend and logs "Not implemented" on every getContext
// call (the real viewer probes WebGL when a StudyPanel mounts). Report "no
// context" quietly instead; real rendering is exercised in the browser tests.
HTMLCanvasElement.prototype.getContext = (() =>
  null) as typeof HTMLCanvasElement.prototype.getContext;

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  cleanup();
  server.resetHandlers();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
});
afterAll(() => server.close());
