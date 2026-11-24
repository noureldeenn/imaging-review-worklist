import { useEffect, useLayoutEffect, useRef } from 'react';
import type { ImageMapper } from '../annotations/annotation-geometry';
import { createMaskRenderer, type MaskRenderer } from './mask-renderer';
import type { Segment } from './seg-types';
import { useSegmentStore } from './segment-store';

type Props = {
  studyId: string;
  /** The view transform (kept for parity with the measurement overlay; any render re-projects). */
  revision: unknown;
  getMapper(): ImageMapper | null;
  /** Columns x rows of the loaded image (the mask size). */
  imageSize: { width: number; height: number };
};

const EMPTY: Segment[] = [];

/**
 * Segmentation layer: a `<canvas aria-hidden>` SIBLING above the viewport (never
 * inside Cornerstone's element or a transformed ancestor), without pointer
 * events (the viewport's own handlers feed the brush). It re-projects on every
 * controller publish and resize, reading the viewport only through the guarded
 * mapper getter. Nothing animates. See `mask-renderer` for the drawing.
 */
export function SegmentationOverlay({ studyId, getMapper, imageSize }: Props) {
  const segments = useSegmentStore((s) => s.byStudy[studyId]?.segments ?? EMPTY);
  // Subscribed only so an opacity change re-renders (and so re-projects).
  useSegmentStore((s) => s.opacity);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderer = useRef<MaskRenderer | null>(null);
  const { width, height } = imageSize;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const r = createMaskRenderer({ canvas, studyId, width, height, getMapper });
    renderer.current = r;
    return () => {
      r.dispose();
      renderer.current = null;
    };
  }, [studyId, width, height, getMapper]);

  useEffect(() => renderer.current?.recolor(), [segments]);
  // Every render of the viewer follows a controller publish (zoom, pan, rotation,
  // flip, resize) or an opacity change: re-project before paint. A pan keeps the
  // same `view` object, so this deliberately has no dependency list.
  useLayoutEffect(() => renderer.current?.project());

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      data-testid="segmentation-overlay"
      className="pointer-events-none absolute inset-0 size-full"
    />
  );
}
