/**
 * Pure measurement math. Points are IMAGE pixel coordinates (x = column,
 * y = row), so values do not depend on zoom, pan, rotation, flips or invert.
 * No Cornerstone imports: the review panel's Measurements list (main bundle)
 * formats labels with these too.
 */
export type Point = [number, number];
export type MeasurementKind = 'length' | 'angle' | 'ellipse' | 'rectangle';
/** Pixel Spacing (0028,0030) in mm: `row` = between rows (y), `column` = between columns (x). */
export type Spacing = { row: number; column: number };

export type Annotation = {
  id: string;
  kind: MeasurementKind;
  /** length: 2 ends; angle: arm, vertex, arm; ellipse/rectangle: 2 opposite bounding-box corners. */
  points: Point[];
  /** Captured from the image when drawn; null when the file has no Pixel Spacing. */
  spacing: Spacing | null;
};

export type Quantity<U extends string> = { value: number; unit: U };

export const MEASUREMENT_KINDS: readonly MeasurementKind[] = [
  'length',
  'angle',
  'ellipse',
  'rectangle',
];

export function isMeasurementTool(tool: string): tool is MeasurementKind {
  return (MEASUREMENT_KINDS as readonly string[]).includes(tool);
}

export const KIND_LABELS: Record<MeasurementKind, string> = {
  length: 'Length',
  angle: 'Angle',
  ellipse: 'Ellipse',
  rectangle: 'Rectangle',
};

/** Physical (mm) or pixel offset of b from a. */
function delta(a: Point, b: Point, spacing: Spacing | null): Point {
  const sx = spacing?.column ?? 1;
  const sy = spacing?.row ?? 1;
  return [(b[0] - a[0]) * sx, (b[1] - a[1]) * sy];
}

export function distance(a: Point, b: Point, spacing: Spacing | null): Quantity<'mm' | 'px'> {
  const [dx, dy] = delta(a, b, spacing);
  return { value: Math.hypot(dx, dy), unit: spacing ? 'mm' : 'px' };
}

/** Angle at `vertex` between the arms to `a` and `b`, 0..180°; null if an arm has no length. */
export function angleDegrees(
  a: Point,
  vertex: Point,
  b: Point,
  spacing: Spacing | null,
): number | null {
  const u = delta(vertex, a, spacing);
  const v = delta(vertex, b, spacing);
  const lu = Math.hypot(u[0], u[1]);
  const lv = Math.hypot(v[0], v[1]);
  if (lu < 1e-9 || lv < 1e-9) return null;
  const cos = (u[0] * v[0] + u[1] * v[1]) / (lu * lv);
  return (Math.acos(Math.min(1, Math.max(-1, cos))) * 180) / Math.PI;
}

/** Area of the rectangle, or of the ellipse inscribed in it (π·a·b). */
export function areaOf(
  kind: 'ellipse' | 'rectangle',
  a: Point,
  b: Point,
  spacing: Spacing | null,
): Quantity<'mm²' | 'px²'> {
  const [w, h] = delta(a, b, spacing).map(Math.abs) as Point;
  const value = kind === 'rectangle' ? w * h : Math.PI * (w / 2) * (h / 2);
  return { value, unit: spacing ? 'mm²' : 'px²' };
}

const fmt = (digits: number) =>
  new Intl.NumberFormat('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
const ONE_DECIMAL = fmt(1);
const WHOLE = fmt(0);

export function formatLength({ value, unit }: Quantity<'mm' | 'px'>): string {
  return `${(unit === 'mm' ? ONE_DECIMAL : WHOLE).format(value)} ${unit}`;
}

export function formatAngle(degrees: number | null): string {
  return degrees === null ? '—' : `${ONE_DECIMAL.format(degrees)}°`;
}

export function formatArea({ value, unit }: Quantity<'mm²' | 'px²'>): string {
  return `${(value < 100 ? ONE_DECIMAL : WHOLE).format(value)} ${unit}`;
}

/** The value drawn next to the shape, e.g. `12.3 mm`, `67.2°`, `1,234 px²`. */
export function labelFor({ kind, points, spacing }: Annotation): string {
  const [a = [0, 0], b = a, c = b] = points;
  if (kind === 'length') return formatLength(distance(a, b, spacing));
  if (kind === 'angle') return formatAngle(angleDegrees(a, b, c, spacing));
  return formatArea(areaOf(kind, a, b, spacing));
}

/** Type and value, e.g. `Length 12.3 mm` (the Measurements list). */
export function describeAnnotation(annotation: Annotation): string {
  return `${KIND_LABELS[annotation.kind]} ${labelFor(annotation)}`;
}
