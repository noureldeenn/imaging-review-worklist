import { expect, test, type Page } from '@playwright/test';
import {
  METADATA_TEXT,
  backingSize,
  collectErrors,
  gotoWorklist,
  openReview,
  openStudy,
  openWorklist,
  paintedPixels,
  stats,
  toolbarButton,
} from './helpers';

// Viewer-first layout (OHIF style): one big viewport, a worklist drawer and a
// review panel that pushes (>= 1280px), floats (900-1279px) or is a bottom sheet.

let errors: string[] = [];

test.beforeEach(async ({ page }) => {
  errors = collectErrors(page);
  await gotoWorklist(page);
});

test.afterEach(() => {
  expect(errors).toEqual([]);
});

type Box = { x: number; y: number; width: number; height: number };

async function viewportBox(page: Page): Promise<Box> {
  const box = await page.getByTestId('viewport').boundingBox();
  if (!box) throw new Error('viewport has no box');
  return box;
}

async function pageOverflow(page: Page): Promise<{ x: number; y: number }> {
  return page.evaluate(() => {
    const de = document.documentElement;
    return { x: de.scrollWidth - de.clientWidth, y: de.scrollHeight - window.innerHeight };
  });
}

async function openGradient(page: Page): Promise<void> {
  await openStudy(page, 'study-001');
  await expect(page.getByText(METADATA_TEXT)).toBeVisible();
  await paintedPixels(page);
}

test.describe('desktop 1440x900', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('the viewport fills the frame and the page does not scroll', async ({ page }) => {
    await openGradient(page);
    const box = await viewportBox(page);
    expect(box.height).toBeGreaterThanOrEqual(0.8 * 900);
    expect(box.width).toBeGreaterThanOrEqual(0.55 * 1440);
    expect(await pageOverflow(page)).toEqual({ x: 0, y: 0 });
    // The info strip and sliders are siblings below the viewport, not over it.
    const slider = await page.getByLabel('Window width').boundingBox();
    expect(slider?.y ?? 0).toBeGreaterThanOrEqual(box.y + box.height);
  });

  test('collapsing the pushed review panel widens the viewport and refits the canvas', async ({
    page,
  }) => {
    await openGradient(page);
    await expect(page.getByRole('region', { name: 'Review', exact: true })).toBeVisible();
    const before = await viewportBox(page);
    const backing = await backingSize(page);

    await toolbarButton(page, 'Review').click();
    await expect(page.getByRole('region', { name: 'Review', exact: true })).toBeHidden();
    await expect.poll(async () => (await viewportBox(page)).width).toBeGreaterThan(before.width);
    await expect.poll(async () => (await backingSize(page)).width).not.toBe(backing.width);
    expect((await paintedPixels(page)).mean).toBeGreaterThan(5);

    await toolbarButton(page, 'Review').click();
    await expect.poll(async () => (await viewportBox(page)).width).toBeCloseTo(before.width, 0);
  });

  test('the worklist drawer closes on selection and reopens over the viewer', async ({ page }) => {
    const drawer = page.getByRole('region', { name: 'Worklist', exact: true });
    await expect(drawer).toBeVisible();
    await openGradient(page);
    await expect(drawer).toBeHidden();
    const before = await viewportBox(page);

    await toolbarButton(page, 'Worklist').click();
    await expect(drawer).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open study study-001' })).toBeFocused();
    // An overlay: the viewport keeps its size.
    expect(await viewportBox(page)).toEqual(before);
    await page.keyboard.press('Escape');
    await expect(drawer).toBeHidden();
    await expect(toolbarButton(page, 'Worklist')).toBeFocused();
  });

  test('More menu: arrows move, Esc closes and returns focus', async ({ page }) => {
    await openGradient(page);
    const more = toolbarButton(page, 'More');
    await more.focus();
    await page.keyboard.press('ArrowDown');
    const menu = page.getByRole('menu');
    await expect(menu).toBeVisible();
    await expect(menu.getByRole('menuitemcheckbox', { name: 'Invert (I)' })).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(menu.getByRole('menuitem', { name: 'Rotate left (<)' })).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowUp');
    await expect(menu.getByRole('menuitem', { name: 'Flip vertical (V)' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await expect(more).toBeFocused();
    // Toolbar roving focus: Home goes to the first item.
    await page.keyboard.press('Home');
    await expect(toolbarButton(page, 'Worklist')).toBeFocused();
  });

  test('A→B→A through the drawer keeps one engine, and five cycles end at baseline', async ({
    page,
  }) => {
    await openGradient(page);
    const open = await stats(page);
    for (let cycle = 0; cycle < 5; cycle += 1) {
      for (const id of ['study-002', 'study-001']) {
        await openStudy(page, id);
        const s = await stats(page);
        expect(s.engines).toBe(1);
        expect(s.observers).toBe(1);
        expect(s.elementListeners).toBe(open.elementListeners);
      }
    }
    await expect(page.getByText(METADATA_TEXT)).toBeVisible();
  });
});

test.describe('overlay 1024x768', () => {
  test.use({ viewport: { width: 1024, height: 768 } });

  test('the review overlay does not resize the viewport', async ({ page }) => {
    await openGradient(page);
    await expect(page.getByRole('region', { name: 'Review', exact: true })).toBeHidden();
    const before = await viewportBox(page);
    const backing = await backingSize(page);
    await openReview(page);
    await expect(page.getByRole('button', { name: 'Close viewer' })).toBeVisible();
    expect(await viewportBox(page)).toEqual(before);
    expect(await backingSize(page)).toEqual(backing);
    expect(await pageOverflow(page)).toEqual({ x: 0, y: 0 });
  });

  test('the review overlay and the worklist drawer end above the info strip', async ({ page }) => {
    await openGradient(page);
    // True when the slider's centre is not covered by anything (it can be clicked).
    const sliderOnTop = (label: string) =>
      page.getByLabel(label).evaluate((el) => {
        const r = el.getBoundingClientRect();
        const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        return hit === el || el.contains(hit);
      });
    const stripTop = async () =>
      (await page.locator('.viewer-info').boundingBox())?.y ?? Number.NaN;

    for (const name of ['Review', 'Worklist'] as const) {
      if (name === 'Review') await openReview(page);
      else await openWorklist(page);
      const surface = page.getByRole('region', { name, exact: true });
      await expect
        .poll(async () => {
          const b = await surface.boundingBox();
          return (b?.y ?? 0) + (b?.height ?? 0);
        })
        .toBeLessThanOrEqual(await stripTop());
      for (const label of ['Window width', 'Window level']) {
        await expect(page.getByLabel(label)).toBeVisible();
        expect(await sliderOnTop(label)).toBe(true);
      }
      await expect(page.getByText(METADATA_TEXT)).toBeVisible();
    }
    // Clickable for real: a click on the slider lands on it (and dismisses the drawer).
    await page.getByLabel('Window width').click();
    await expect(page.getByLabel('Window width')).toBeFocused();
  });
});

test.describe('phone 390x844', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('full-height viewer, icon toolbar, review as a bottom sheet', async ({ page }) => {
    await openGradient(page);
    const box = await viewportBox(page);
    expect(box.height).toBeGreaterThanOrEqual(0.65 * 844);
    expect(await pageOverflow(page)).toEqual({ x: 0, y: 0 });

    const buttons = page.getByRole('toolbar', { name: 'Image tools' }).getByRole('button');
    const sizes = await buttons.evaluateAll((els) =>
      els
        .filter((e) => e.getClientRects().length > 0)
        .map((e) => {
          const r = e.getBoundingClientRect();
          return [r.width, r.height];
        }),
    );
    expect(sizes.length).toBe(7);
    for (const [w, h] of sizes) {
      expect(w).toBeGreaterThanOrEqual(44);
      expect(h).toBeGreaterThanOrEqual(44);
    }

    await openReview(page);
    const sheet = page.getByRole('region', { name: 'Review', exact: true });
    // Wait for the slide-in to finish, then the sheet sits on the bottom edge.
    await expect
      .poll(async () => {
        const b = await sheet.boundingBox();
        return Math.round((b?.y ?? 0) + (b?.height ?? 0));
      })
      .toBe(844);
    const sheetBox = await sheet.boundingBox();
    expect(sheetBox?.height ?? 0).toBeLessThanOrEqual(0.7 * 844 + 1);
    const claim = page.getByRole('button', { name: 'Claim' });
    await expect(claim).toBeVisible();
    const claimBox = await claim.boundingBox();
    expect(claimBox?.height ?? 0).toBeGreaterThanOrEqual(44);
    expect(await pageOverflow(page)).toEqual({ x: 0, y: 0 });

    await page.getByRole('button', { name: 'Close review panel' }).click();
    await expect(sheet).toBeHidden();
    await openWorklist(page);
    await expect(page.getByRole('button', { name: 'Open study study-002' })).toBeVisible();
  });
});
