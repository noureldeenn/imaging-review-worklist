import { expect, test, type Page } from '@playwright/test';
import {
  METADATA_TEXT,
  canvasPixels,
  closeViewer,
  collectErrors,
  diffRatio,
  gotoWorklist,
  openStudy,
  paintedPixels,
  stats,
  waitForPaint,
  type Pixels,
} from './helpers';

let errors: string[] = [];

test.beforeEach(async ({ page }) => {
  errors = collectErrors(page);
  await gotoWorklist(page);
});

test.afterEach(() => {
  expect(errors).toEqual([]);
});

const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
const readout = (page: Page) => page.getByTestId('viewer-readout');

async function click(page: Page, name: string): Promise<Pixels> {
  await button(page, name).click();
  await waitForPaint(page);
  return canvasPixels(page);
}

/** Opens study-001 (the horizontal gradient fixture) and returns its fitted pixels. */
async function openGradient(page: Page): Promise<Pixels> {
  await openStudy(page, 'study-001');
  await expect(page.getByText(METADATA_TEXT)).toBeVisible();
  return paintedPixels(page);
}

async function viewportCentre(page: Page): Promise<{ x: number; y: number }> {
  const box = await page.getByTestId('viewport').boundingBox();
  if (!box) throw new Error('viewport has no box');
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function drag(page: Page, dx: number, dy: number): Promise<void> {
  const { x, y } = await viewportCentre(page);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 8 });
  await page.mouse.up();
  await waitForPaint(page);
}

test('toolbar zoom, rotate, flip and invert change pixels and undo restores them', async ({
  page,
}) => {
  const base = await openGradient(page);
  await expect(readout(page)).toHaveText('Zoom 100% · Rot 0°');

  expect(diffRatio(await click(page, 'Zoom in'), base)).toBeGreaterThan(0.1);
  await expect(readout(page)).toHaveText('Zoom 125% · Rot 0°');
  expect(diffRatio(await click(page, 'Fit / Reset'), base)).toBeLessThan(0.01);

  const rotated = await click(page, 'Rotate right');
  expect(diffRatio(rotated, base)).toBeGreaterThan(0.1);
  await expect(readout(page)).toHaveText('Zoom 100% · Rot 90°');
  // The gradient is symmetric top-to-bottom, so flip vertical is checked on the rotated image.
  const flippedV = await click(page, 'Flip vertical');
  expect(diffRatio(flippedV, rotated)).toBeGreaterThan(0.1);
  // Rotated a quarter turn, a screen-vertical flip mirrors the image's own columns.
  await expect(readout(page)).toContainText('Flipped H');
  expect(diffRatio(await click(page, 'Flip vertical'), rotated)).toBeLessThan(0.01);
  expect(diffRatio(await click(page, 'Rotate left'), base)).toBeLessThan(0.01);

  expect(diffRatio(await click(page, 'Flip horizontal'), base)).toBeGreaterThan(0.1);
  await expect(readout(page)).toContainText('Flipped H');
  expect(diffRatio(await click(page, 'Flip horizontal'), base)).toBeLessThan(0.01);

  // A full-range gradient has the same mean when inverted, so compare per pixel.
  expect(diffRatio(await click(page, 'Invert'), base)).toBeGreaterThan(0.3);
  await expect(readout(page)).toContainText('Inverted');
  expect(diffRatio(await click(page, 'Invert'), base)).toBeLessThan(0.01);
});

test('Fit / Reset restores zoom, rotation, flips, invert and window/level together', async ({
  page,
}) => {
  const base = await openGradient(page);
  const ww = await page.getByLabel('Window width').inputValue();
  for (const name of ['Zoom in', 'Rotate right', 'Flip horizontal', 'Invert']) {
    await button(page, name).click();
  }
  await page.getByLabel('Window width').fill('100');
  await waitForPaint(page);
  expect(diffRatio(await canvasPixels(page), base)).toBeGreaterThan(0.1);

  expect(diffRatio(await click(page, 'Fit / Reset'), base)).toBeLessThan(0.01);
  await expect(readout(page)).toHaveText('Zoom 100% · Rot 0°');
  await expect(page.getByLabel('Window width')).toHaveValue(ww);
});

test('wheel zooms without scrolling the page', async ({ page }) => {
  const base = await openGradient(page);
  const { x, y } = await viewportCentre(page);
  const scrollY = await page.evaluate(() => window.scrollY);
  await page.mouse.move(x - 60, y);
  await page.mouse.wheel(0, -400);
  await waitForPaint(page);
  expect(diffRatio(await canvasPixels(page), base)).toBeGreaterThan(0.1);
  await expect(readout(page)).not.toHaveText('Zoom 100% · Rot 0°');
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollY);
  expect(diffRatio(await click(page, 'Fit / Reset'), base)).toBeLessThan(0.01);
});

test('pan and window/level drags move the image and sync the sliders', async ({ page }) => {
  const base = await openGradient(page);

  await button(page, 'Pan tool').click();
  await expect(button(page, 'Pan tool')).toHaveAttribute('aria-pressed', 'true');
  await drag(page, 90, 40);
  expect(diffRatio(await canvasPixels(page), base)).toBeGreaterThan(0.1);
  expect(diffRatio(await click(page, 'Fit / Reset'), base)).toBeLessThan(0.01);

  await button(page, 'Window/Level tool').click();
  const ww = Number(await page.getByLabel('Window width').inputValue());
  await drag(page, 120, 30);
  expect(diffRatio(await canvasPixels(page), base)).toBeGreaterThan(0.1);
  await expect
    .poll(async () => Number(await page.getByLabel('Window width').inputValue()))
    .toBeGreaterThan(ww);
  expect(diffRatio(await click(page, 'Fit / Reset'), base)).toBeLessThan(0.01);
});

test('keyboard shortcuts on the focused viewport match the buttons', async ({ page }) => {
  const base = await openGradient(page);
  const viewport = page.getByTestId('viewport');
  const press = async (key: string) => {
    await viewport.press(key);
    await waitForPaint(page);
    return canvasPixels(page);
  };

  const byButton = await click(page, 'Rotate right');
  await click(page, 'Fit / Reset');
  expect(diffRatio(await press('r'), byButton)).toBeLessThan(0.01);
  expect(diffRatio(await press('Shift+R'), base)).toBeLessThan(0.01);

  const flipped = await click(page, 'Flip horizontal');
  await click(page, 'Fit / Reset');
  expect(diffRatio(await press('h'), flipped)).toBeLessThan(0.01);
  expect(diffRatio(await press('0'), base)).toBeLessThan(0.01);

  const inverted = await click(page, 'Invert');
  await click(page, 'Fit / Reset');
  expect(diffRatio(await press('i'), inverted)).toBeLessThan(0.01);
  await expect(readout(page)).toContainText('Inverted');

  const scrollY = await page.evaluate(() => window.scrollY);
  expect(diffRatio(await press('ArrowRight'), inverted)).toBeGreaterThan(0.01);
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollY);
  expect(diffRatio(await press('0'), base)).toBeLessThan(0.01);
});

test('after using every control, five close/reopen cycles leave no handlers', async ({ page }) => {
  await openGradient(page);
  await closeViewer(page);
  const baseline = await stats(page);
  expect(baseline.engines).toBe(0);
  expect(baseline.observers).toBe(0);

  for (let cycle = 0; cycle < 5; cycle += 1) {
    await openGradient(page);
    const open = await stats(page);
    expect(open.engines).toBe(1);
    expect(open.observers).toBe(1);
    expect(open.elementListeners).toBeGreaterThan(baseline.elementListeners);
    for (const name of [
      'Zoom in',
      'Zoom out',
      'Rotate left',
      'Rotate right',
      'Flip horizontal',
      'Flip vertical',
      'Invert',
      'Pan tool',
      'Zoom tool',
      'Window/Level tool',
    ]) {
      await button(page, name).click();
    }
    await drag(page, 40, 20);
    await page.getByTestId('viewport').press('r');
    await page.mouse.wheel(0, -200);
    await button(page, 'Fit / Reset').click();
    // Ready-to-ready switches rebind the same viewport element: still exactly one engine.
    for (const id of ['study-002', 'study-001']) {
      await openStudy(page, id);
      await expect(readout(page)).toHaveText('Zoom 100% · Rot 0°');
      const switched = await stats(page);
      expect(switched.engines).toBe(1);
      expect(switched.observers).toBe(1);
      expect(switched.elementListeners).toBe(open.elementListeners);
      await button(page, 'Zoom in').click();
    }
    await closeViewer(page);
  }

  const s = await stats(page);
  expect(s.engines).toBe(0);
  expect(s.observers).toBe(0);
  expect(s.elementListeners).toBe(baseline.elementListeners);
});

test('a scrollbar-sized resize keeps the zoom, a real resize refits', async ({ page }) => {
  await openGradient(page);
  await button(page, 'Zoom in').click();
  await expect(readout(page)).toHaveText('Zoom 125% · Rot 0°');
  const size = page.viewportSize() ?? { width: 1280, height: 720 };

  await page.setViewportSize({ width: size.width - 12, height: size.height });
  await expect.poll(async () => (await canvasPixels(page)).mean).toBeGreaterThan(5);
  await expect(readout(page)).toHaveText('Zoom 125% · Rot 0°');

  await page.setViewportSize({ width: 900, height: size.height });
  await expect(readout(page)).toHaveText('Zoom 100% · Rot 0°');
  await expect.poll(async () => (await canvasPixels(page)).mean).toBeGreaterThan(5);
});

for (const width of [360, 390, 768, 820]) {
  test.describe(`toolbar at ${width}px`, () => {
    test.use({ viewport: { width, height: 844 } });

    test('wraps without horizontal overflow and has 44px targets', async ({ page }) => {
      await openGradient(page);
      await expect(page.getByRole('toolbar', { name: 'Image tools' })).toBeVisible();
      const m = await page.evaluate(() => {
        const de = document.documentElement;
        const tb = document.querySelector<HTMLElement>('[role="toolbar"]');
        if (!tb) throw new Error('toolbar missing');
        // Measure the controls themselves: below 900px their groups are
        // `display: contents` wrappers with empty boxes.
        const targets = [...tb.querySelectorAll('button, summary')].map((e) => {
          const r = e.getBoundingClientRect();
          return {
            name: e.getAttribute('aria-label') ?? e.textContent,
            w: r.width,
            h: r.height,
            right: r.right,
          };
        });
        return {
          page: de.scrollWidth - de.clientWidth,
          toolbar: tb.scrollWidth - tb.clientWidth,
          right: Math.max(...targets.map((t) => t.right)),
          clientWidth: de.clientWidth,
          small: targets.filter((t) => t.w < 44 || t.h < 44).map((t) => t.name),
          count: targets.length,
        };
      });
      expect(m.page).toBe(0);
      expect(m.toolbar).toBe(0);
      expect(m.right).toBeLessThanOrEqual(m.clientWidth);
      expect(m.count).toBe(12);
      expect(m.small).toEqual([]);
    });
  });
}
