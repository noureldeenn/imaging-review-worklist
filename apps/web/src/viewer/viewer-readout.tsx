import type { ViewTransform } from './viewport-controller';

const badge =
  'rounded border border-primary/40 bg-primary/10 px-1.5 py-px font-sans text-[11px] font-medium text-primary';

export function formatReadout(view: Pick<ViewTransform, 'zoom' | 'rotation'>): string {
  const rotation = Math.round(view.rotation * 10) / 10;
  return `Zoom ${Math.round(view.zoom * 100)}% · Rot ${rotation}°`;
}

/**
 * The image is shown mirrored when exactly one image axis is flipped
 * (flipping both equals a 180 degree rotation, which is not a mirror image).
 */
export function isMirrored(view: Pick<ViewTransform, 'flipH' | 'flipV'>): boolean {
  return view.flipH !== view.flipV;
}

/** Read-only zoom / rotation readout with state badges, shown in the info strip. */
export function ViewerReadout({ view }: { view: ViewTransform }) {
  return (
    <div data-testid="viewer-readout" className="flex flex-wrap items-center gap-1.5">
      <p aria-live="off" className="font-mono text-[11px] text-foreground/90 tabular-nums">
        {formatReadout(view)}
      </p>
      {view.invert && <span className={badge}>Inverted</span>}
      {isMirrored(view) && <span className={badge}>Mirrored</span>}
    </div>
  );
}
