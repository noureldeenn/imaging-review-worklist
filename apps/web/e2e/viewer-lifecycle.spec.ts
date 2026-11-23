import { expect, test } from '@playwright/test';
import {
  canvasPixels,
  clickStudy,
  closeViewer,
  collectErrors,
  diffRatio,
  gotoWorklist,
  holdStudyFile,
  openStudy,
  paintedPixels,
  stats,
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

test('switching during a delayed load shows only the current image', async ({ page }) => {
  const held = await holdStudyFile(page, 'study-001');
  await clickStudy(page, 'study-001');
  await held.intercepted;

  await openStudy(page, 'study-002');
  await expect(page.getByText(/^File metadata:/)).toBeVisible();
  const current = await paintedPixels(page);
  // Taken after B is ready so the increment below can only be the late A load.
  const discardedBefore = (await stats(page)).loadsDiscarded;

  await held.release();
  await expect
    .poll(async () => (await stats(page)).loadsDiscarded)
    .toBeGreaterThanOrEqual(discardedBefore + 1);
  await waitForPaint(page);

  const s = await stats(page);
  expect(s.currentImageId).toMatch(/study-002\/file$/);
  expect(s.loadsDiscarded).toBeGreaterThanOrEqual(1);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByRole('img', { name: 'DICOM image for study-002' })).toBeVisible();
  // The late study-001 bytes must not have been drawn over study-002.
  expect(diffRatio(await canvasPixels(page), current)).toBeLessThan(0.01);
});

test('closing during a delayed load disposes without reopening', async ({ page }) => {
  const held = await holdStudyFile(page, 'study-001');
  await clickStudy(page, 'study-001');
  await held.intercepted;

  await page.getByRole('button', { name: 'Close viewer' }).click();
  await expect(page.getByTestId('viewport')).toHaveCount(0);
  const discardedBefore = (await stats(page)).loadsDiscarded;

  await held.release();
  // The late bytes are decoded by the disposed viewer and must be discarded.
  await expect
    .poll(async () => (await stats(page)).loadsDiscarded)
    .toBeGreaterThanOrEqual(discardedBefore + 1);
  await waitForPaint(page);

  const s = await stats(page);
  expect(s.engines).toBe(0);
  expect(s.observers).toBe(0);
  expect(s.currentImageId).toBeNull();
  await expect(page.getByTestId('viewport')).toHaveCount(0);
  await expect(page.getByText('Select a study to view it.')).toBeVisible();
});

test('five close/reopen cycles do not accumulate handlers or engines', async ({ page }) => {
  await openStudy(page, 'study-002');
  await closeViewer(page);
  const baseline = await stats(page);
  expect(baseline.engines).toBe(0);
  expect(baseline.observers).toBe(0);

  for (let cycle = 0; cycle < 5; cycle += 1) {
    await openStudy(page, 'study-002');
    await expect(page.getByText(/^File metadata:/)).toBeVisible();
    const open = await stats(page);
    expect(open.engines).toBe(1);
    expect(open.observers).toBe(1);
    expect(open.elementListeners).toBeGreaterThan(baseline.elementListeners);
    await closeViewer(page);
  }

  const s = await stats(page);
  expect(s.engines).toBe(0);
  expect(s.observers).toBe(0);
  expect(s.elementListeners).toBe(baseline.elementListeners);
  expect(s.loadsCompleted).toBe(baseline.loadsCompleted + 5);
});
