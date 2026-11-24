import type { ViewTransform } from './viewport-controller';

const badge =
  'rounded border border-primary/40 bg-black/70 px-1.5 py-0.5 font-sans text-[11px] font-medium text-primary';

export function formatReadout(view: Pick<ViewTransform, 'zoom' | 'rotation'>): string {
  const rotation = Math.round(view.rotation * 10) / 10;
  return `Zoom ${Math.round(view.zoom * 100)}% · Rot ${rotation}°`;
}

/**
 * Read-only zoom / rotation readout with state badges. Rendered as an overlay
 * sibling of the viewport (never inside it) and ignores the pointer.
 */
export function ViewerReadout({ view }: { view: ViewTransform }) {
  return (
    <div
      data-testid="viewer-readout"
      className="pointer-events-none absolute top-2 left-2 flex max-w-[calc(100%-1rem)] flex-wrap items-center gap-1.5"
    >
      <p
        aria-live="off"
        className="rounded bg-black/70 px-1.5 py-0.5 font-mono text-[11px] text-foreground tabular-nums"
      >
        {formatReadout(view)}
      </p>
      {view.invert && <span className={badge}>Inverted</span>}
      {view.flipH && <span className={badge}>Flipped H</span>}
      {view.flipV && <span className={badge}>Flipped V</span>}
    </div>
  );
}
