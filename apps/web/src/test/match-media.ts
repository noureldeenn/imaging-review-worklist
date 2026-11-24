import { vi } from 'vitest';

/** Stubs matchMedia for a window `width` px wide (min-/max-width queries only). */
export function stubWindowWidth(width: number): void {
  vi.stubGlobal('matchMedia', (query: string) => {
    const min = /min-width:\s*(\d+)px/.exec(query);
    const max = /max-width:\s*(\d+)px/.exec(query);
    const matches =
      (min !== null || max !== null) &&
      (min === null || width >= Number(min[1])) &&
      (max === null || width <= Number(max[1]));
    return {
      matches,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    } as unknown as MediaQueryList;
  });
}
