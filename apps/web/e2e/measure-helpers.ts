import { expect, type Page } from '@playwright/test';
import { METADATA_TEXT, openStudy, paintedPixels, toolbarButton, waitForPaint } from './helpers';

export type Pt = { x: number; y: number };
export type Drawn = { id: string; kind: string; label: string; selected: boolean; handles: Pt[] };

/** Image size of the synthetic studies (256 x 256, no Pixel Spacing). */
export const IMAGE_SIZE = 256;

/** Viewport box in page coordinates. */
export async function viewportBox(page: Page) {
  const box = await page.getByTestId('viewport').boundingBox();
  if (!box) throw new Error('viewport has no box');
  return box;
}

/** CPU fit scale (canvas px per image px) of a 256 x 256 image at zoom 100 %. */
export async function fitScale(page: Page): Promise<number> {
  const size = await page.getByTestId('viewport').evaluate((el) => ({
    w: el.clientWidth,
    h: el.clientHeight,
  }));
  return Math.min(size.w / IMAGE_SIZE, size.h / IMAGE_SIZE);
}

/** Canvas point (relative to the viewport) -> page point. */
export async function toPage(page: Page, p: Pt): Promise<Pt> {
  const box = await viewportBox(page);
  return { x: box.x + p.x, y: box.y + p.y };
}

/** Viewport centre in canvas coordinates. */
export async function centre(page: Page): Promise<Pt> {
  return page.getByTestId('viewport').evaluate((el) => ({
    x: el.clientWidth / 2,
    y: el.clientHeight / 2,
  }));
}

/** Chooses a measurement tool: a toolbar button, or (below 900px) a radio item in More. */
export async function pickTool(page: Page, name: string, narrow = false): Promise<void> {
  if (narrow) {
    await toolbarButton(page, 'More').click();
    await page.getByRole('menu').getByRole('menuitemradio', { name, exact: true }).click();
    return;
  }
  await toolbarButton(page, name).click();
  await expect(toolbarButton(page, name)).toHaveAttribute('aria-pressed', 'true');
}

/** The Review panel's Measurements section. */
export const measurements = (page: Page) => page.getByRole('region', { name: 'Measurements' });

/** Opens study-001 (synthetic gradient, no Pixel Spacing) and waits for real pixels. */
export async function openGradient(page: Page): Promise<void> {
  await openStudy(page, 'study-001');
  await expect(page.getByText(METADATA_TEXT)).toBeVisible();
  await paintedPixels(page);
}

/** A length drawn from c + a to c + b (canvas offsets from the viewport centre). */
export async function drawLength(page: Page, a: Pt, b: Pt) {
  const c = await centre(page);
  const from = { x: c.x + a.x, y: c.y + a.y };
  const to = { x: c.x + b.x, y: c.y + b.y };
  await pickTool(page, 'Length');
  await dragOn(page, from, to);
  return { from, to, c };
}

/** Press, drag and release between two canvas points with the left button. */
export async function dragOn(page: Page, from: Pt, to: Pt): Promise<void> {
  const a = await toPage(page, from);
  const b = await toPage(page, to);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 8 });
  await page.mouse.up();
  await waitForPaint(page);
}

export async function clickOn(page: Page, p: Pt): Promise<void> {
  const a = await toPage(page, p);
  await page.mouse.click(a.x, a.y);
}

/** The measurement overlay's annotations as drawn (handles in canvas px). */
export async function drawn(page: Page): Promise<Drawn[]> {
  await waitForPaint(page);
  return page.evaluate(() =>
    Array.from(document.querySelectorAll<SVGGElement>('[data-annotation-id]')).map((g) => ({
      id: g.dataset['annotationId'] ?? '',
      kind: g.dataset['kind'] ?? '',
      label: g.dataset['label'] ?? '',
      selected: g.dataset['selected'] === 'true',
      handles: Array.from(g.querySelectorAll('circle')).map((c) => ({
        x: Number(c.getAttribute('cx')),
        y: Number(c.getAttribute('cy')),
      })),
    })),
  );
}

/** Numeric value of a label such as `1,234 px²`, `85 px` or `90.0°`. */
export const valueOf = (label: string) => Number(label.replace(/[^\d.]/g, ''));

/** Luminance of the rendered image under a canvas point (CPU canvas). */
export async function lumAt(page: Page, p: Pt): Promise<number> {
  return page.evaluate(({ x, y }) => {
    const canvas = document.querySelector<HTMLCanvasElement>('[data-testid="viewport"] canvas');
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) throw new Error('no 2D viewport canvas');
    const dpr = canvas.width / canvas.clientWidth;
    const d = ctx.getImageData(Math.round(x * dpr), Math.round(y * dpr), 1, 1).data;
    return Math.round(0.299 * (d[0] ?? 0) + 0.587 * (d[1] ?? 0) + 0.114 * (d[2] ?? 0));
  }, p);
}

export const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

/** Asserts two canvas points agree within `tol` px. */
export function expectNear(actual: Pt | undefined, expected: Pt, tol = 1.5): void {
  expect(actual).toBeDefined();
  expect(Math.abs((actual?.x ?? NaN) - expected.x)).toBeLessThanOrEqual(tol);
  expect(Math.abs((actual?.y ?? NaN) - expected.y)).toBeLessThanOrEqual(tol);
}
