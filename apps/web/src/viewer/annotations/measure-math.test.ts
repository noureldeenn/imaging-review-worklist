import { describe, expect, it } from 'vitest';
import {
  angleDegrees,
  areaOf,
  describeAnnotation,
  distance,
  formatAngle,
  formatArea,
  formatLength,
  labelFor,
  type Annotation,
} from './measure-math';

const ISO = { row: 0.5, column: 0.5 };
// Rows 2 mm apart (vertical), columns 0.5 mm apart (horizontal).
const ANISO = { row: 2, column: 0.5 };

const ann = (
  kind: Annotation['kind'],
  points: Annotation['points'],
  spacing = null as Annotation['spacing'],
): Annotation => ({
  id: 'a',
  kind,
  points,
  spacing,
});

describe('distance', () => {
  it('falls back to image pixels without spacing', () => {
    expect(distance([0, 0], [30, 40], null)).toEqual({ value: 50, unit: 'px' });
  });
  it('uses isotropic pixel spacing in mm', () => {
    expect(distance([0, 0], [30, 40], ISO)).toEqual({ value: 25, unit: 'mm' });
  });
  it('scales x by column spacing and y by row spacing (anisotropic)', () => {
    // 10 columns * 0.5 mm = 5 mm across; 10 rows * 2 mm = 20 mm down.
    expect(distance([0, 0], [10, 0], ANISO).value).toBeCloseTo(5);
    expect(distance([0, 0], [0, 10], ANISO).value).toBeCloseTo(20);
    expect(distance([0, 0], [10, 10], ANISO).value).toBeCloseTo(Math.hypot(5, 20));
  });
});

describe('angleDegrees (vertex is the middle point)', () => {
  it('is 90 for an axis-aligned L', () => {
    expect(angleDegrees([10, 0], [0, 0], [0, 10], null)).toBeCloseTo(90);
  });
  it('is 180 for a straight line and 0 for folded arms', () => {
    expect(angleDegrees([-5, 0], [0, 0], [7, 0], null)).toBeCloseTo(180);
    expect(angleDegrees([5, 0], [0, 0], [9, 0], null)).toBeCloseTo(0);
  });
  it('is 45 for a diagonal and stays within 0..180', () => {
    expect(angleDegrees([10, 0], [0, 0], [10, 10], null)).toBeCloseTo(45);
    expect(angleDegrees([10, 0], [0, 0], [10, -10], null)).toBeCloseTo(45);
  });
  it('is null when an arm has zero length', () => {
    expect(angleDegrees([0, 0], [0, 0], [5, 5], null)).toBeNull();
    expect(angleDegrees([3, 4], [0, 0], [0, 0], null)).toBeNull();
  });
  it('accounts for anisotropic spacing (physical angle)', () => {
    // In pixels this is 45°, physically the arm (10 cols, 10 rows) is 5 mm x 20 mm.
    const physical = (Math.atan2(20, 5) * 180) / Math.PI;
    expect(angleDegrees([10, 0], [0, 0], [10, 10], ANISO)).toBeCloseTo(physical);
  });
});

describe('areaOf', () => {
  it('rectangle is w*h in px² without spacing (corners in any order)', () => {
    expect(areaOf('rectangle', [20, 30], [0, 0], null)).toEqual({ value: 600, unit: 'px²' });
  });
  it('rectangle uses both spacings', () => {
    expect(areaOf('rectangle', [0, 0], [10, 10], ANISO).value).toBeCloseTo(5 * 20);
  });
  it('ellipse is π·a·b from its bounding box', () => {
    expect(areaOf('ellipse', [0, 0], [20, 10], null).value).toBeCloseTo(Math.PI * 10 * 5);
    expect(areaOf('ellipse', [0, 0], [20, 10], ISO)).toEqual({
      value: Math.PI * 5 * 2.5,
      unit: 'mm²',
    });
  });
});

describe('formatting', () => {
  it('length: one decimal in mm, whole pixels in px', () => {
    expect(formatLength({ value: 12.34, unit: 'mm' })).toBe('12.3 mm');
    expect(formatLength({ value: 12.36, unit: 'mm' })).toBe('12.4 mm');
    expect(formatLength({ value: 1234.5, unit: 'mm' })).toBe('1,234.5 mm');
    expect(formatLength({ value: 44.6, unit: 'px' })).toBe('45 px');
  });
  it('angle: one decimal with a degree sign, dash when degenerate', () => {
    expect(formatAngle(67.25)).toBe('67.3°');
    expect(formatAngle(90)).toBe('90.0°');
    expect(formatAngle(null)).toBe('—');
  });
  it('area: grouped whole numbers, one decimal below 100', () => {
    expect(formatArea({ value: 1234.4, unit: 'mm²' })).toBe('1,234 mm²');
    expect(formatArea({ value: 56.78, unit: 'px²' })).toBe('56.8 px²');
  });
});

describe('labels', () => {
  it('labelFor and describeAnnotation per kind', () => {
    expect(
      labelFor(
        ann('length', [
          [0, 0],
          [30, 40],
        ]),
      ),
    ).toBe('50 px');
    expect(
      labelFor(
        ann(
          'length',
          [
            [0, 0],
            [30, 40],
          ],
          ISO,
        ),
      ),
    ).toBe('25.0 mm');
    expect(
      labelFor(
        ann('angle', [
          [10, 0],
          [0, 0],
          [0, 10],
        ]),
      ),
    ).toBe('90.0°');
    expect(
      labelFor(
        ann('angle', [
          [0, 0],
          [0, 0],
          [0, 10],
        ]),
      ),
    ).toBe('—');
    expect(
      labelFor(
        ann('rectangle', [
          [0, 0],
          [40, 50],
        ]),
      ),
    ).toBe('2,000 px²');
    expect(
      labelFor(
        ann(
          'ellipse',
          [
            [0, 0],
            [20, 10],
          ],
          ISO,
        ),
      ),
    ).toBe('39.3 mm²');
    expect(
      describeAnnotation(
        ann('length', [
          [0, 0],
          [30, 40],
        ]),
      ),
    ).toBe('Length 50 px');
    expect(
      describeAnnotation(
        ann('rectangle', [
          [0, 0],
          [40, 50],
        ]),
      ),
    ).toBe('Rectangle 2,000 px²');
  });
});
