/**
 * Shared types and limits of the first-party segmentation (ADR 0006). No
 * Cornerstone imports: the toolbar and the Segments panel (main bundle) use them.
 */
export type SegmentationTool = 'brush' | 'smartBrush' | 'eraser';

export const SEGMENTATION_TOOLS: readonly SegmentationTool[] = ['brush', 'smartBrush', 'eraser'];

export function isSegmentationTool(tool: string): tool is SegmentationTool {
  return (SEGMENTATION_TOOLS as readonly string[]).includes(tool);
}

export type Segment = {
  id: string;
  /** Value written into the label mask (1-8); stable for the segment's life. */
  label: number;
  name: string;
  color: string;
  visible: boolean;
};

/** Half-open pixel rectangle [x0, x1) x [y0, y1) in image pixels. */
export type Rect = { x0: number; y0: number; x1: number; y1: number };

/** Inclusive [min, max] gate of the smart brush (HU for CT, stored values otherwise). */
export type Range = { min: number; max: number };

export type PresetId = 'adipose' | 'softTissue' | 'bone' | 'custom';

/** Indicative software-testing presets, not diagnostic thresholds. */
export const PRESETS: ReadonlyArray<{ id: PresetId; label: string; range: Range | null }> = [
  { id: 'adipose', label: 'Adipose [-190, -30]', range: { min: -190, max: -30 } },
  { id: 'softTissue', label: 'Soft tissue [-29, 150]', range: { min: -29, max: 150 } },
  { id: 'bone', label: 'Bone [150, 3000]', range: { min: 150, max: 3000 } },
  { id: 'custom', label: 'Custom', range: null },
];

export const MAX_SEGMENTS = 8;
/** Largest image (rows x columns) a mask is created for: 4096 x 4096. */
export const MAX_MASK_PIXELS = 16_777_216;
/** Total bytes of masks plus undo diffs kept across studies (least recently used dropped first). */
export const MASK_BUDGET_BYTES = 64 * 1024 * 1024;
export const MAX_UNDO_STROKES = 20;

export const BRUSH_MIN = 1;
export const BRUSH_MAX = 100;
export const BRUSH_DEFAULT = 10;
export const OPACITY_MIN = 10;
export const OPACITY_MAX = 100;
export const OPACITY_DEFAULT = 50;

/**
 * Eight distinct hues that stay visible over black and white greyscale and are
 * told apart by name in the panel (colour is never the only cue).
 */
export const PALETTE: readonly string[] = [
  '#ef4444',
  '#22c55e',
  '#3b82f6',
  '#f59e0b',
  '#d946ef',
  '#14b8a6',
  '#f97316',
  '#a3e635',
];

export const TOO_LARGE_NOTICE = `This image is too large to segment (more than ${MAX_MASK_PIXELS.toLocaleString('en-US')} pixels).`;
export const SEGMENT_LIMIT_NOTICE = `Limit of ${MAX_SEGMENTS} segments reached; delete one to add more.`;
export const DROPPED_NOTICE =
  "This study's segments were dropped to stay within the memory limit (most recently used studies are kept).";
export const COLOR_IMAGE_NOTICE = 'Smart brush needs a greyscale image; nothing was painted.';
