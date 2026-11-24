import { expect, type Page } from '@playwright/test';
import { toolbarButton, waitForPaint } from './helpers';
import { toPage, type Pt } from './measure-helpers';

/** Segment 1's colour (first palette entry, #ef4444). */
export const SEGMENT_1_RGB = [239, 68, 68] as const;

/** The Review panel's Segments section. */
export const segmentsRegion = (page: Page) => page.getByRole('region', { name: 'Segments' });

const MENU_OF: Record<string, string> = {
  'Brush (B)': 'Segment',
  'Smart brush': 'Segment',
  'Eraser (E)': 'Delete',
};

/** Chooses a segmentation tool from Segment ▾ / Delete ▾ (or, below 900px, from More). */
export async function pickSegTool(page: Page, name: string, narrow = false): Promise<void> {
  await toolbarButton(page, narrow ? 'More' : (MENU_OF[name] ?? 'Segment')).click();
  await page.getByRole('menu').getByRole('menuitemradio', { name, exact: true }).click();
  await expect(page.getByRole('menu')).toHaveCount(0);
}

/** Left-button drag between two canvas points (relative to the viewport), then paint. */
export async function stroke(page: Page, from: Pt, to: Pt, steps = 8): Promise<void> {
  const a = await toPage(page, from);
  const b = await toPage(page, to);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps });
  await page.mouse.up();
  await waitForPaint(page);
}

/** RGBA of the segmentation overlay canvas under a canvas point (CSS px). */
export async function overlayAt(page: Page, p: Pt): Promise<number[]> {
  await waitForPaint(page);
  return page.evaluate(({ x, y }) => {
    const canvas = document.querySelector<HTMLCanvasElement>(
      '[data-testid="segmentation-overlay"]',
    );
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) throw new Error('no segmentation overlay canvas');
    const dpr = canvas.width / canvas.clientWidth;
    return Array.from(ctx.getImageData(Math.round(x * dpr), Math.round(y * dpr), 1, 1).data);
  }, p);
}

/** True when the overlay shows Segment 1's colour (at any opacity) at `p`. */
export async function hasSegment1(page: Page, p: Pt): Promise<boolean> {
  const [r = 0, g = 0, b = 0, a = 0] = await overlayAt(page, p);
  if (a < 40) return false;
  return (
    Math.abs(r - SEGMENT_1_RGB[0]) <= 6 &&
    Math.abs(g - SEGMENT_1_RGB[1]) <= 6 &&
    Math.abs(b - SEGMENT_1_RGB[2]) <= 6
  );
}

/** True when nothing is painted on the overlay at `p`. */
export async function isClear(page: Page, p: Pt): Promise<boolean> {
  const [, , , a = 0] = await overlayAt(page, p);
  return a === 0;
}
