import { expect, type Page, type Route } from '@playwright/test';
import type { ViewerStats } from '../src/viewer/viewer-stats';

export type Pixels = { mean: number; data: number[] };

export const METADATA_TEXT = 'File metadata: OT · 2026-10-07 · 256×256';

/** Loads the app and waits for the seeded worklist. */
export async function gotoWorklist(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Open study study-001' })).toBeVisible();
}

/** Clicks a worklist row without waiting for the image (for delayed loads). */
export async function clickStudy(page: Page, id: string): Promise<void> {
  await page.getByRole('button', { name: `Open study ${id}` }).click();
  await expect(page.getByRole('img', { name: `DICOM image for ${id}` })).toBeAttached();
}

/** Opens a study and waits until the viewer reports metadata or a decode error. */
export async function openStudy(page: Page, id: string): Promise<void> {
  await clickStudy(page, id);
  await expect(page.getByText(/^File metadata:/).or(page.getByRole('alert'))).toBeVisible();
}

export async function closeViewer(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Close viewer' }).click();
  await expect(page.getByTestId('viewport')).toHaveCount(0);
}

/** Snapshot of the viewer's live lifecycle counters. */
export async function stats(page: Page): Promise<ViewerStats> {
  const snapshot = await page.evaluate(() =>
    window.__viewerStats ? { ...window.__viewerStats } : null,
  );
  if (snapshot === null) throw new Error('window.__viewerStats is not defined');
  return snapshot;
}

/** Waits two animation frames: the viewer sets `ready` one frame before it paints. */
export async function waitForPaint(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
}

/**
 * Reads the real viewport canvas (CPU rendering draws into a 2D canvas) and
 * returns the luminance of every 4th pixel plus the mean luminance.
 */
export async function canvasPixels(page: Page): Promise<Pixels> {
  return page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('[data-testid="viewport"] canvas');
    if (!canvas) throw new Error('viewport canvas not found');
    const { width, height } = canvas;
    let ctx = canvas.getContext('2d');
    if (!ctx) {
      // Not a 2D canvas (e.g. a GPU context): copy it into an offscreen 2D canvas.
      const copy = document.createElement('canvas');
      copy.width = width;
      copy.height = height;
      ctx = copy.getContext('2d');
      if (!ctx) throw new Error('no 2D context available');
      ctx.drawImage(canvas, 0, 0);
    }
    const rgba = ctx.getImageData(0, 0, width, height).data;
    const data: number[] = [];
    let sum = 0;
    for (let px = 0; px < width * height; px += 4) {
      const i = px * 4;
      const lum = Math.round(
        0.299 * (rgba[i] ?? 0) + 0.587 * (rgba[i + 1] ?? 0) + 0.114 * (rgba[i + 2] ?? 0),
      );
      data.push(lum);
      sum += lum;
    }
    return { mean: data.length > 0 ? sum / data.length : 0, data };
  });
}

/** Fraction of sampled pixels whose luminance differs by more than 8. */
export function diffRatio(a: Pixels, b: Pixels): number {
  const n = Math.max(a.data.length, b.data.length);
  if (n === 0) return 0;
  let differing = 0;
  for (let i = 0; i < n; i += 1) {
    const x = a.data[i];
    const y = b.data[i];
    if (x === undefined || y === undefined || Math.abs(x - y) > 8) differing += 1;
  }
  return differing / n;
}

/** Waits for paint, polls until the canvas is non-blank, then returns its pixels. */
export async function paintedPixels(page: Page): Promise<Pixels> {
  await waitForPaint(page);
  await expect.poll(async () => (await canvasPixels(page)).mean).toBeGreaterThan(5);
  return canvasPixels(page);
}

export type HeldRoute = {
  /** Resolves once the browser has requested the file. */
  intercepted: Promise<void>;
  /** Lets the held request(s) through with the real bytes; resolves when fulfilled. */
  release(): Promise<void>;
};

function deferred(): { promise: Promise<void>; resolve(): void } {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

/** Holds every request for a study's file until `release()` is called. */
export async function holdStudyFile(page: Page, id: string): Promise<HeldRoute> {
  const seen = deferred();
  const gate = deferred();
  const handled: Promise<void>[] = [];
  await page.route(`**/api/studies/${id}/file`, (route: Route) => {
    seen.resolve();
    const done = gate.promise.then(async () => {
      try {
        const response = await route.fetch();
        await route.fulfill({ response });
      } catch {
        // The page may have aborted the request after the viewer was closed.
      }
    });
    handled.push(done);
    return done;
  });
  return {
    intercepted: seen.promise,
    release: async () => {
      gate.resolve();
      await Promise.all(handled);
    },
  };
}

/** Collects console errors and uncaught page errors for later assertion. */
export function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`);
  });
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.stack ?? err.message}`));
  return errors;
}
