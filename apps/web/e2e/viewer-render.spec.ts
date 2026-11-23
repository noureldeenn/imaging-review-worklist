import { expect, test } from '@playwright/test';
import {
  METADATA_TEXT,
  backingSize,
  canvasPixels,
  collectErrors,
  diffRatio,
  gotoWorklist,
  openStudy,
  paintedPixels,
  waitForPaint,
} from './helpers';

let errors: string[] = [];

test.beforeEach(async ({ page }) => {
  errors = collectErrors(page);
  await gotoWorklist(page);
});

test.afterEach(() => {
  expect(errors).toEqual([]);
});

test('renders gradient and checkerboard with different real pixels', async ({ page }) => {
  await openStudy(page, 'study-001');
  await expect(page.getByText(METADATA_TEXT)).toBeVisible();
  const p1 = await paintedPixels(page);
  expect(p1.mean).toBeGreaterThan(5);
  expect(p1.mean).toBeLessThan(250);

  await openStudy(page, 'study-002');
  await expect(page.getByText(/^File metadata:/)).toBeVisible();
  const p2 = await paintedPixels(page);
  expect(p2.mean).toBeGreaterThan(5);
  expect(p2.mean).toBeLessThan(250);
  expect(diffRatio(p1, p2)).toBeGreaterThan(0.2);
});

test('window/level changes pixels and Fit / Reset restores them', async ({ page }) => {
  await openStudy(page, 'study-001');
  await expect(page.getByText(METADATA_TEXT)).toBeVisible();
  const p1 = await paintedPixels(page);

  await page.getByLabel('Window width').fill('1');
  await waitForPaint(page);
  await expect.poll(async () => diffRatio(await canvasPixels(page), p1)).toBeGreaterThan(0.1);

  await page.getByRole('button', { name: 'Fit / Reset' }).click();
  await waitForPaint(page);
  await expect.poll(async () => diffRatio(await canvasPixels(page), p1)).toBeLessThan(0.01);
});

test('viewport follows container resize', async ({ page }) => {
  await openStudy(page, 'study-001');
  await paintedPixels(page);
  const canvas = page.getByTestId('viewport').locator('canvas');
  const before = await canvas.boundingBox();
  expect(before).not.toBeNull();
  const width = before?.width ?? 0;
  const backingBefore = await backingSize(page);

  const height = page.viewportSize()?.height ?? 720;
  await page.setViewportSize({ width: 800, height });
  // CSS size follows the container regardless; only the backing store proves
  // that ResizeObserver -> engine.resize() actually ran.
  await expect.poll(async () => (await canvas.boundingBox())?.width ?? width).toBeLessThan(width);
  await expect
    .poll(async () => {
      const now = await backingSize(page);
      return now.width !== backingBefore.width || now.height !== backingBefore.height;
    })
    .toBe(true);

  const after = await paintedPixels(page);
  expect(after.mean).toBeGreaterThan(5);
  expect(after.mean).toBeLessThan(250);
});

test('corrupt fixture shows an error, list stays usable, valid study recovers', async ({
  page,
}) => {
  await openStudy(page, 'study-003');
  await expect(page.getByRole('alert')).toHaveText(/Could not decode/);

  await openStudy(page, 'study-001');
  await expect(page.getByText(METADATA_TEXT)).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  const pixels = await paintedPixels(page);
  expect(pixels.mean).toBeGreaterThan(5);
  expect(pixels.mean).toBeLessThan(250);
});
