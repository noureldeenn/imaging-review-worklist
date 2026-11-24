import { expect, test, type Page } from '@playwright/test';
import {
  closeViewer,
  collectErrors,
  gotoWorklist,
  openReview,
  openStudy,
  runControl,
  stats,
  toolbarButton,
  waitForPaint,
} from './helpers';
import { centre, fitScale, lumAt, openGradient, toPage, type Pt } from './measure-helpers';
import { hasSegment1, isClear, pickSegTool, segmentsRegion, stroke } from './segment-helpers';

// First-party segmentation overlay on the real (CPU-rendered) viewer. study-001 is
// the synthetic horizontal gradient (256 x 256, OT, stored value ≈ column x 16).

let errors: string[] = [];
test.use({ viewport: { width: 1440, height: 900 } });
test.beforeEach(async ({ page }) => {
  errors = collectErrors(page);
  await gotoWorklist(page);
});
test.afterEach(() => {
  expect(errors).toEqual([]);
});

const at = (c: Pt, dx: number, dy: number): Pt => ({ x: c.x + dx, y: c.y + dy });

/** Brush stroke from c + (-150, -60) to c + (-30, -60); returns a point on it and one well off it. */
async function paintLine(page: Page, c: Pt) {
  await stroke(page, at(c, -150, -60), at(c, -30, -60));
  return { on: at(c, -90, -60), off: at(c, -90, 40) };
}

test('brush paint stays on the same image pixels through zoom, rotation, flip and pan', async ({
  page,
}) => {
  await openGradient(page);
  const c = await centre(page);
  await pickSegTool(page, 'Brush (B)');
  await expect(toolbarButton(page, 'Segment')).toHaveAccessibleDescription(
    'Active tool: Brush (B)',
  );
  const { on, off } = await paintLine(page, c);
  expect(await hasSegment1(page, on)).toBe(true);
  expect(await isClear(page, off)).toBe(true);
  await expect(
    segmentsRegion(page).getByRole('textbox', { name: 'Name of segment 1' }),
  ).toHaveValue('Segment 1');

  // Zoom about the centre: p -> c + 1.25 (p - c).
  const zoom = (p: Pt) => at(c, 1.25 * (p.x - c.x), 1.25 * (p.y - c.y));
  await runControl(page, 'Zoom in');
  expect(await hasSegment1(page, zoom(on))).toBe(true);
  expect(await isClear(page, zoom(off))).toBe(true);
  await runControl(page, 'Fit / Reset');
  expect(await hasSegment1(page, on)).toBe(true);
  // A quarter turn clockwise on screen: (dx, dy) -> (-dy, dx).
  const rot = (p: Pt) => at(c, -(p.y - c.y), p.x - c.x);
  await runControl(page, 'Rotate right (>)');
  expect(await hasSegment1(page, rot(on))).toBe(true);
  expect(await isClear(page, rot(off))).toBe(true);
  // Then a screen-axis mirror: x -> 2 cx - x.
  const flip = (p: Pt) => ({ x: 2 * c.x - rot(p).x, y: rot(p).y });
  await runControl(page, 'Flip horizontal (H)');
  expect(await hasSegment1(page, flip(on))).toBe(true);
  expect(await isClear(page, flip(off))).toBe(true);
  // Middle-button drag pans while the Brush stays active (and paints nothing).
  const p = await toPage(page, c);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down({ button: 'middle' });
  await page.mouse.move(p.x + 40, p.y + 25, { steps: 5 });
  await page.mouse.up({ button: 'middle' });
  await waitForPaint(page);
  expect(await hasSegment1(page, at(flip(on), 40, 25))).toBe(true);
  expect(await isClear(page, at(flip(off), 40, 25))).toBe(true);
  // Fit / Reset restores the view only: the paint is back where it was drawn.
  await runControl(page, 'Fit / Reset');
  expect(await hasSegment1(page, on)).toBe(true);
  expect(await isClear(page, off)).toBe(true);
});

test('hide/show, eraser, Ctrl+Z and Undo, Escape and Clear segments', async ({ page }) => {
  await openGradient(page);
  const c = await centre(page);
  await pickSegTool(page, 'Brush (B)');
  const { on } = await paintLine(page, c);
  const region = segmentsRegion(page);

  await region.getByRole('button', { name: 'Hide Segment 1' }).click();
  expect(await isClear(page, on)).toBe(true);
  await region.getByRole('button', { name: 'Show Segment 1' }).click();
  expect(await hasSegment1(page, on)).toBe(true);

  await pickSegTool(page, 'Eraser (E)');
  await expect(toolbarButton(page, 'Delete')).toHaveAccessibleDescription(
    'Active tool: Eraser (E)',
  );
  await stroke(page, at(c, -170, -60), at(c, -10, -60));
  expect(await isClear(page, on)).toBe(true);
  // The viewport took focus on the press: Ctrl+Z reverts the eraser stroke.
  await page.keyboard.press('Control+z');
  expect(await hasSegment1(page, on)).toBe(true);
  // The panel's Undo reverts the brush stroke before it.
  await region.getByRole('button', { name: 'Undo last stroke' }).click();
  expect(await isClear(page, on)).toBe(true);
  await expect(region.getByRole('button', { name: 'Undo last stroke' })).toBeDisabled();

  // Escape drops a stroke in progress.
  await pickSegTool(page, 'Brush (B)');
  await paintLine(page, c);
  const a = await toPage(page, at(c, -150, 60));
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(a.x + 120, a.y, { steps: 4 });
  await page.keyboard.press('Escape');
  await page.mouse.up();
  expect(await isClear(page, at(c, -90, 60))).toBe(true);
  expect(await hasSegment1(page, on)).toBe(true);

  // Delete ▾ > Clear segments empties the study and announces it.
  await toolbarButton(page, 'Delete').click();
  await page.getByRole('menuitem', { name: 'Clear segments' }).click();
  expect(await isClear(page, on)).toBe(true);
  await expect(region).toContainText('No segments yet.');
  await expect(region.getByTestId('segments-announcer')).toHaveText('Segments cleared');
});

test('smart brush with a custom range paints only where the stored value is inside it', async ({
  page,
}) => {
  await openGradient(page);
  const c = await centre(page);
  const s = await fitScale(page);
  // Canvas x of the centre of image column `col` (image centred at fit, no rotation).
  const col = (n: number): Pt => ({ x: c.x - 128 * s + (n + 0.5) * s, y: c.y });
  await openReview(page);
  const region = segmentsRegion(page);
  // OT, not CT: the custom range applies to stored values; the HU presets are disabled.
  const range = region.getByRole('combobox', { name: 'Smart brush range' });
  await expect(range).toHaveValue('custom');
  await expect(region).toContainText('Thresholds apply to stored pixel values');
  await region.getByRole('spinbutton', { name: 'Minimum' }).fill('0');
  await region.getByRole('spinbutton', { name: 'Maximum' }).fill('1000');
  await pickSegTool(page, 'Smart brush');
  await stroke(page, col(10), col(230), 20);
  // Columns up to ~62 hold stored values <= 1000 (dark); brighter columns are outside.
  expect(await lumAt(page, col(30))).toBeLessThan(await lumAt(page, col(200)));
  expect(await hasSegment1(page, col(30))).toBe(true);
  expect(await hasSegment1(page, col(55))).toBe(true);
  expect(await isClear(page, col(70))).toBe(true);
  expect(await isClear(page, col(200))).toBe(true);
});

test('each study keeps its own segments (A→B→A); wheel zoom works with the brush', async ({
  page,
}) => {
  await openGradient(page);
  const c = await centre(page);
  await pickSegTool(page, 'Brush (B)');
  const { on } = await paintLine(page, c);

  await openStudy(page, 'study-002');
  await waitForPaint(page);
  expect(await isClear(page, on)).toBe(true);
  await expect(segmentsRegion(page)).toContainText('No segments yet.');
  await stroke(page, at(c, 50, 50), at(c, 120, 50));
  expect(await hasSegment1(page, at(c, 85, 50))).toBe(true);

  await openStudy(page, 'study-001');
  expect(await hasSegment1(page, on)).toBe(true);
  expect(await isClear(page, at(c, 85, 50))).toBe(true);
  await expect(segmentsRegion(page).getByRole('listitem')).toHaveCount(1);

  // Wheel zoom with the brush active zooms and paints nothing.
  const p = await toPage(page, c);
  await page.mouse.move(p.x, p.y);
  await page.mouse.wheel(0, -300);
  await expect(page.getByTestId('viewer-readout')).not.toHaveText('Zoom 100% · Rot 0°');
  await expect(segmentsRegion(page).getByRole('listitem')).toHaveCount(1);
});

test('phone 390x844: the tools live in More, seven buttons show, Segments is in the sheet', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openGradient(page);
  const visible = await page
    .getByRole('toolbar', { name: 'Image tools' })
    .getByRole('button')
    .evaluateAll((els) => els.filter((e) => e.getClientRects().length > 0).length);
  expect(visible).toBe(7);
  await expect(toolbarButton(page, 'Segment')).toHaveCount(0);
  await toolbarButton(page, 'More').click();
  const menu = page.getByRole('menu');
  for (const name of ['Brush (B)', 'Smart brush', 'Eraser (E)']) {
    await expect(menu.getByRole('menuitemradio', { name, exact: true })).toBeVisible();
  }
  await expect(menu.getByRole('menuitem', { name: 'Clear segments' })).toBeVisible();
  await page.keyboard.press('Escape');

  await pickSegTool(page, 'Brush (B)', true);
  await expect(toolbarButton(page, 'More')).toHaveAccessibleDescription('Active tool: Brush (B)');
  const c = await centre(page);
  await stroke(page, at(c, -60, 0), at(c, 60, 0));
  expect(await hasSegment1(page, c)).toBe(true);
  await openReview(page);
  const region = segmentsRegion(page);
  await region.getByRole('button', { name: 'Hide Segment 1' }).scrollIntoViewIfNeeded();
  await expect(region.getByRole('button', { name: 'Hide Segment 1' })).toBeVisible();
  await expect(region.getByRole('slider', { name: 'Brush size' })).toBeAttached();
});

test('after painting with every tool, five close/reopen cycles end at the listener baseline', async ({
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
    const c = await centre(page);
    const y = -150 + 40 * cycle;
    await pickSegTool(page, 'Brush (B)');
    await stroke(page, at(c, -200, y), at(c, -100, y));
    await pickSegTool(page, 'Smart brush');
    await stroke(page, at(c, 0, y), at(c, 60, y));
    await pickSegTool(page, 'Eraser (E)');
    await stroke(page, at(c, -150, y), at(c, -140, y));
    expect(await hasSegment1(page, at(c, -190, y))).toBe(true);
    await closeViewer(page);
    const closed = await stats(page);
    expect(closed.engines).toBe(0);
    expect(closed.observers).toBe(0);
    expect(closed.elementListeners).toBe(baseline.elementListeners);
  }
});

for (const width of [900, 1280]) {
  test(`the desktop row with Segment ▾ fits at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await openGradient(page);
    const overflow = await page
      .getByRole('toolbar', { name: 'Image tools' })
      .evaluate((tb) => tb.scrollWidth - tb.clientWidth);
    expect(overflow).toBe(0);
    for (const name of ['Segment', 'Delete', 'More']) {
      await expect(toolbarButton(page, name)).toBeInViewport({ ratio: 1 });
    }
  });
}
