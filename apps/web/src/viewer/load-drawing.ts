import { createAnnotationDrawing, type AnnotationDrawing } from './annotations/annotation-drawing';
import type { ImageMapper } from './annotations/annotation-geometry';
import type { Spacing } from './annotations/measure-math';
import { createSegPainting, type SegPainting } from './segmentation/seg-painting';
import { readPixelSource, type PixelViewport } from './segmentation/seg-pixels';
import { isSegmentationTool } from './segmentation/seg-types';
import { useSegmentStore } from './segmentation/segment-store';

/** What the viewport handlers feed: measurement drawing plus brush painting. */
export type ViewportDrawing = AnnotationDrawing & {
  /** Ctrl/Cmd+Z on the focused viewport. */
  undo?(): boolean;
};

/**
 * One object behind the viewport's existing eight handlers: segmentation tools
 * go to the painting, everything else to the measurement drawing (which also
 * selects shapes with the navigation tools). Cancel and dispose reach both.
 */
export function combineDrawings(
  drawing: AnnotationDrawing,
  painting: SegPainting,
): ViewportDrawing {
  return {
    pointerDown: (input) =>
      isSegmentationTool(input.tool) ? painting.pointerDown(input) : drawing.pointerDown(input),
    pointerMove: (id, point) => painting.pointerMove(id, point) || drawing.pointerMove(id, point),
    hover: (point) => drawing.hover(point),
    pointerUp: (id, point) => painting.pointerUp(id, point) || drawing.pointerUp(id, point),
    keyDown: (key) => painting.keyDown(key) || drawing.keyDown(key),
    undo: () => painting.undo(),
    cancel() {
      painting.cancel();
      drawing.cancel();
    },
    dispose() {
      painting.dispose();
      drawing.dispose();
    },
  };
}

type LoadDrawingOptions = {
  studyId: string;
  mapper: ImageMapper;
  spacing: Spacing | null;
  /** From the file's metadata; null when unknown (painting then does nothing). */
  metadata: { columns: number; rows: number; modality: string } | null;
  viewport: PixelViewport;
};

/** The drawing of ONE ready load; released with it in `releaseLoad`. */
export function createLoadDrawing({
  studyId,
  mapper,
  spacing,
  metadata,
  viewport,
}: LoadDrawingOptions): ViewportDrawing {
  const imageSize = metadata ? { width: metadata.columns, height: metadata.rows } : null;
  const ct = metadata?.modality === 'CT';
  // The Segments panel (main bundle) shows mm² and the CT hint from this.
  useSegmentStore.getState().setImageInfo(studyId, { spacing, ct });
  return combineDrawings(
    createAnnotationDrawing({ studyId, spacing, imageSize, mapper }),
    createSegPainting({
      studyId,
      imageSize,
      mapper,
      getPixels: () => readPixelSource(viewport),
      gateMode: ct ? 'hu' : 'stored',
    }),
  );
}
