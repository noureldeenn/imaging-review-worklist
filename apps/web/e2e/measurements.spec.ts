import { expect, test, type Page } from '@playwright/test';
import {
  METADATA_TEXT,
  closeViewer,
  collectErrors,
  gotoWorklist,
  openReview,
  openStudy,
  paintedPixels,
  runControl,
  stats,
  toolbarButton,
  waitForPaint,
} from './helpers';
import {
  centre,
  clickOn,
  dist,
  dragOn,
  drawn,
  expectNear,
  fitScale,
  lumAt,
  pickTool,
  toPage,
  valueOf,
  type Pt,
} from './measure-helpers';

// First-party measurement overlay on the real (CPU-rendered) viewer. study-001
// is the synthetic horizontal gradient without Pixel Spacing, so values are px.

let errors: string[] = [];
test.use({ viewport: { width: 1440, height: 900 } });
test.beforeEach(async ({ page }) => {
  errors = collectErrors(page);
  await gotoWorklist(page);
});
test.afterEach(() => {
  expect(errors).toEqual([]);
});

const measurements = (page: Page) => page.getByRole('region', { name: 'Measurements' });

async function openGradient(page: Page): Promise<void> {
  await openStudy(page, 'study-001');
  await expect(page.getByText(METADATA_TEXT)).toBeVisible();
  await paintedPixels(page);
}

/** A length drawn from c + a to c + b (canvas offsets from the viewport centre). */
async function drawLength(page: Page, a: Pt, b: Pt) {
  const c = await centre(page);
  const from = { x: c.x + a.x, y: c.y + a.y };
  const to = { x: c.x + b.x, y: c.y + b.y };
  await pickTool(page, 'Length');
  await dragOn(page, from, to);
  return { from, to, c };
}

test('length in px stays on the same image pixels through zoom, rotation, flips and pan', async ({
  page,
}) => {
  await openGradient(page);
  // Full-width viewer: the info strip stays on one line when badges appear, so
  // the viewport keeps its size and the expected positions below are exact.
  await toolbarButton(page, 'Review').click();
  await expect(page.getByRole('region', { name: 'Review', exact: true })).toBeHidden();
  await paintedPixels(page);
  const { from, to, c } = await drawLength(page, { x: -150, y: -100 }, { x: 60, y: 70 });
  const scale = await fitScale(page);
  const [line] = await drawn(page);
  expect(line?.kind).toBe('length');
  expect(line?.label).toMatch(/^\d+ px$/);
  expect(Math.abs(valueOf(line?.label ?? '') - dist(from, to) / scale)).toBeLessThanOrEqual(1);
  const base = line?.handles ?? [];
  expectNear(base[0], from);
  expectNear(base[1], to);
  const lum = await Promise.all(base.map((h) => lumAt(page, h)));
  // The gradient runs along x: the two ends sit on clearly different grey levels.
  expect(Math.abs((lum[0] ?? 0) - (lum[1] ?? 0))).toBeGreaterThan(30);

  const after = async (control: string) => {
    await runControl(page, control);
    const [d] = await drawn(page);
    expect(d?.label).toBe(line?.label);
    for (const [i, h] of (d?.handles ?? []).entries()) {
      // About one grey level per image column: 3 levels ≈ 3 image pixels at most.
      expect(Math.abs((await lumAt(page, h)) - (lum[i] ?? 0))).toBeLessThanOrEqual(3);
    }
    return d?.handles ?? [];
  };
  // Zoom about the centre: p -> c + 1.25 (p - c).
  const zoomed = await after('Zoom in');
  expectNear(zoomed[0], { x: c.x + 1.25 * (from.x - c.x), y: c.y + 1.25 * (from.y - c.y) });
  await after('Fit / Reset');
  // A quarter turn clockwise on screen: (dx, dy) -> (-dy, dx).
  const rotated = await after('Rotate right (>)');
  expectNear(rotated[0], { x: c.x - (from.y - c.y), y: c.y + (from.x - c.x) });
  // Screen-axis mirrors after the rotation.
  const flipped = await after('Flip horizontal (H)');
  expectNear(flipped[0], { x: 2 * c.x - (rotated[0]?.x ?? 0), y: rotated[0]?.y ?? 0 });
  const flippedV = await after('Flip vertical (V)');
  expectNear(flippedV[0], { x: flipped[0]?.x ?? 0, y: 2 * c.y - (flipped[0]?.y ?? 0) });
  // None of the above resized the viewport (the centre used above still holds).
  expect(await centre(page)).toEqual(c);

  // Middle-button drag pans while the Length tool stays active.
  const p = await toPage(page, c);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down({ button: 'middle' });
  await page.mouse.move(p.x + 40, p.y + 25, { steps: 5 });
  await page.mouse.up({ button: 'middle' });
  const [panned] = await drawn(page);
  expectNear(panned?.handles[0], {
    x: (flippedV[0]?.x ?? 0) + 40,
    y: (flippedV[0]?.y ?? 0) + 25,
  });
  expect(await drawn(page)).toHaveLength(1);

  // Fit / Reset restores the view only: the measurement stays, back where it was drawn.
  const reset = await after('Fit / Reset');
  expectNear(reset[0], from);
  expectNear(reset[1], to);

  // The Review panel lists it; its Delete button removes it.
  await openReview(page);
  const item = measurements(page).getByRole('button', {
    name: `Length ${line?.label}`,
    exact: true,
  });
  await expect(item).toBeVisible();
  await measurements(page)
    .getByRole('button', { name: `Delete Length ${line?.label}` })
    .click();
  expect(await drawn(page)).toEqual([]);
  await expect(measurements(page)).toContainText('No measurements yet.');
});

test('angle, rectangle and ellipse values; Escape cancels; Delete and Clear remove', async ({
  page,
}) => {
  await openGradient(page);
  const c = await centre(page);
  const scale = await fitScale(page);

  // Angle: three clicks forming an axis-aligned L (vertex second), with a rubber band.
  await pickTool(page, 'Angle');
  await clickOn(page, { x: c.x + 120, y: c.y - 80 });
  await clickOn(page, { x: c.x - 40, y: c.y - 80 });
  const cursor = await toPage(page, { x: c.x - 20, y: c.y + 10 });
  await page.mouse.move(cursor.x, cursor.y, { steps: 3 });
  await expect(page.locator('[data-draft="angle"]')).toHaveCount(1);
  await clickOn(page, { x: c.x - 40, y: c.y + 90 });
  const angle = (await drawn(page)).find((d) => d.kind === 'angle');
  expect(angle?.label).toBe('90.0°');

  // Rectangle: w x h px².
  await pickTool(page, 'Rectangle');
  await dragOn(page, { x: c.x + 60, y: c.y + 40 }, { x: c.x + 230, y: c.y + 160 });
  const rect = (await drawn(page)).find((d) => d.kind === 'rectangle');
  const area = (170 / scale) * (120 / scale);
  expect(rect?.label).toMatch(/ px²$/);
  expect(Math.abs(valueOf(rect?.label ?? '') / area - 1)).toBeLessThan(0.02);

  // Ellipse: π·a·b of its bounding box.
  await pickTool(page, 'Ellipse');
  await dragOn(page, { x: c.x - 260, y: c.y + 60 }, { x: c.x - 100, y: c.y + 200 });
  const ellipse = (await drawn(page)).find((d) => d.kind === 'ellipse');
  const ellipseArea = Math.PI * (80 / scale) * (70 / scale);
  expect(Math.abs(valueOf(ellipse?.label ?? '') / ellipseArea - 1)).toBeLessThan(0.02);

  // Escape cancels a drawing in progress.
  await pickTool(page, 'Length');
  const a = await toPage(page, { x: c.x - 200, y: c.y - 200 });
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(a.x + 120, a.y + 30, { steps: 4 });
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await waitForPaint(page);
  await expect(page.locator('[data-draft]')).toHaveCount(0);
  expect(await drawn(page)).toHaveLength(3);

  // Clicking an outline selects it; Delete removes it, Backspace the next one.
  await clickOn(page, { x: c.x + 145, y: c.y + 40 });
  expect((await drawn(page)).find((d) => d.selected)?.kind).toBe('rectangle');
  await page.keyboard.press('Delete');
  expect((await drawn(page)).map((d) => d.kind).sort()).toEqual(['angle', 'ellipse']);
  await clickOn(page, { x: c.x + 40, y: c.y - 80 });
  expect((await drawn(page)).find((d) => d.selected)?.kind).toBe('angle');
  await page.keyboard.press('Backspace');
  expect((await drawn(page)).map((d) => d.kind)).toEqual(['ellipse']);

  // Delete ▾ > Clear measurements.
  await toolbarButton(page, 'Delete').click();
  await page.getByRole('menuitem', { name: 'Clear measurements' }).click();
  expect(await drawn(page)).toEqual([]);
});

test('each study keeps its own measurements (A→B→A); wheel zoom works with a tool active', async ({
  page,
}) => {
  await openGradient(page);
  await drawLength(page, { x: -100, y: 0 }, { x: 100, y: 0 });
  const [a] = await drawn(page);

  await openStudy(page, 'study-002');
  expect(await drawn(page)).toEqual([]);
  const c = await centre(page);
  await pickTool(page, 'Rectangle');
  await dragOn(page, { x: c.x - 50, y: c.y - 50 }, { x: c.x + 50, y: c.y + 50 });
  expect((await drawn(page)).map((d) => d.kind)).toEqual(['rectangle']);

  await openStudy(page, 'study-001');
  const back = await drawn(page);
  expect(back.map((d) => [d.kind, d.label])).toEqual([['length', a?.label]]);

  // Wheel zoom with a measurement tool active zooms and draws nothing.
  const p = await toPage(page, c);
  await page.mouse.move(p.x, p.y);
  await page.mouse.wheel(0, -300);
  await expect(page.getByTestId('viewer-readout')).not.toHaveText('Zoom 100% · Rot 0°');
  expect(await drawn(page)).toHaveLength(1);
});

test('after drawing every tool, five close/reopen cycles end at the listener baseline', async ({
  page,
}) => {
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
    // Each cycle draws in its own 25px band so no press lands on an earlier shape.
    const c = await centre(page);
    const y = -150 + 40 * cycle;
    await drawLength(page, { x: -200, y }, { x: -100, y });
    await pickTool(page, 'Rectangle');
    await dragOn(page, { x: c.x, y: c.y + y }, { x: c.x + 60, y: c.y + y + 25 });
    await pickTool(page, 'Ellipse');
    await dragOn(page, { x: c.x + 100, y: c.y + y }, { x: c.x + 160, y: c.y + y + 25 });
    await pickTool(page, 'Angle');
    await clickOn(page, { x: c.x + 220, y: c.y + y });
    await clickOn(page, { x: c.x + 260, y: c.y + y });
    expect(await drawn(page)).toHaveLength(3 * (cycle + 1));
    // Closing with an angle half-drawn must drop it too.
    await closeViewer(page);
    const closed = await stats(page);
    expect(closed.engines).toBe(0);
    expect(closed.observers).toBe(0);
    expect(closed.elementListeners).toBe(baseline.elementListeners);
  }
  await openGradient(page);
  // Five cycles x 3 finished shapes on the same study (the half-drawn angles were dropped).
  await openReview(page);
  await expect(measurements(page).getByRole('listitem')).toHaveCount(15);
});

test.describe('widths', () => {
  for (const width of [900, 1024]) {
    test(`the desktop row with the measurement tools fits at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await openGradient(page);
      const overflow = await page
        .getByRole('toolbar', { name: 'Image tools' })
        .evaluate((tb) => tb.scrollWidth - tb.clientWidth);
      expect(overflow).toBe(0);
      await expect(toolbarButton(page, 'Rectangle')).toBeVisible();
      await expect(toolbarButton(page, 'Delete')).toBeVisible();
    });
  }

  test('phone 390x844: the tools live in More and exactly seven buttons show', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openGradient(page);
    const visible = await page
      .getByRole('toolbar', { name: 'Image tools' })
      .getByRole('button')
      .evaluateAll((els) => els.filter((e) => e.getClientRects().length > 0).length);
    expect(visible).toBe(7);
    for (const name of ['Length', 'Angle', 'Ellipse', 'Rectangle', 'Delete']) {
      await expect(toolbarButton(page, name)).toHaveCount(0);
    }
    await toolbarButton(page, 'More').click();
    const menu = page.getByRole('menu');
    for (const name of ['Length', 'Angle', 'Ellipse', 'Rectangle']) {
      await expect(menu.getByRole('menuitemradio', { name, exact: true })).toBeVisible();
    }
    await expect(menu.getByRole('menuitem', { name: 'Clear measurements' })).toBeVisible();
    await page.keyboard.press('Escape');

    await pickTool(page, 'Length', true);
    const c = await centre(page);
    await dragOn(page, { x: c.x - 80, y: c.y }, { x: c.x + 80, y: c.y });
    expect((await drawn(page)).map((d) => d.kind)).toEqual(['length']);
  });
});
