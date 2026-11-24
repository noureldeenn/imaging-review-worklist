import { describe, expect, it, vi } from 'vitest';
import { readPixelSpacing } from './viewer-session';

const plane = vi.hoisted(() => ({ value: undefined as unknown, asked: [] as string[] }));
vi.mock('@cornerstonejs/core', () => ({
  metaData: {
    get: (type: string) => {
      plane.asked.push(type);
      return type === 'imagePlaneModule' ? plane.value : undefined;
    },
  },
}));

describe('readPixelSpacing (technical tag 0028,0030 only)', () => {
  it('reads row spacing first, column spacing second (anisotropic)', () => {
    plane.value = { pixelSpacing: [2, 0.5], usingDefaultValues: false };
    expect(readPixelSpacing('img')).toEqual({ row: 2, column: 0.5 });
  });

  it('is null without the tag or when the loader substituted defaults', () => {
    plane.value = { pixelSpacing: undefined, rowPixelSpacing: 1, usingDefaultValues: true };
    expect(readPixelSpacing('img')).toBeNull();
    plane.value = { pixelSpacing: [1, 1], usingDefaultValues: true };
    expect(readPixelSpacing('img')).toBeNull();
    plane.value = undefined;
    expect(readPixelSpacing('img')).toBeNull();
    plane.value = { pixelSpacing: [0, 'x'] };
    expect(readPixelSpacing('img')).toBeNull();
  });

  it('never asks for a patient module', () => {
    expect(plane.asked.every((t) => t === 'imagePlaneModule')).toBe(true);
  });
});
