import { Label } from '../components/ui/label';
import { ViewerToolbar, type ToolbarActions } from './viewer-toolbar';
import { WL_MAX, WL_MIN, WW_MAX, WW_MIN, type WindowLevel } from './viewer-session';
import type { ViewTransform } from './viewport-controller';

type Props = {
  windowLevel: WindowLevel | null;
  view: ViewTransform;
  disabled: boolean;
  onWindowLevel(ww: number, wl: number): void;
  actions: ToolbarActions;
};

// Below 900px the controls stack: the wrapping toolbar, then one full-width row per slider
// (label above the track, value right-aligned). The 44px-tall range input gives the
// thumb a touch-sized hit area; the visible track stays thin.
const slider =
  'h-11 w-full min-w-20 cursor-pointer accent-primary outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card disabled:cursor-not-allowed min-[900px]:h-6 min-[900px]:flex-1';
const field =
  'flex min-w-0 flex-col items-stretch gap-0 text-[11px] whitespace-nowrap uppercase min-[900px]:min-w-[200px] min-[900px]:flex-1 min-[900px]:flex-row min-[900px]:items-center min-[900px]:gap-2';

function SliderValue({ value }: { value: string }) {
  // Visual only (the <output> and aria-valuetext carry the value for assistive tech).
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute top-0 right-0 font-mono text-[11px] text-muted-foreground tabular-nums min-[900px]:hidden"
    >
      {value}
    </span>
  );
}

export function ViewerControls({ windowLevel, view, disabled, onWindowLevel, actions }: Props) {
  const ww = windowLevel?.ww ?? WW_MIN;
  const wl = windowLevel?.wl ?? 0;
  const off = disabled || windowLevel === null;
  return (
    <div className="viewer-controls flex flex-col gap-2 border-b bg-card px-3 py-2 min-[900px]:gap-1.5 min-[900px]:px-2 min-[900px]:py-1.5">
      <ViewerToolbar view={view} disabled={disabled} actions={actions} />
      {/* Sliders: one row on desktop, stacked full-width rows below 900px. */}
      <div className="flex min-w-0 flex-col gap-1 min-[900px]:flex-row min-[900px]:items-center min-[900px]:gap-4">
        {/* Inputs are direct children of their labels so the label text stays exact. */}
        <div className="relative min-w-0 min-[900px]:flex min-[900px]:flex-1">
          <Label className={field}>
            Window width
            <input
              type="range"
              className={slider}
              min={WW_MIN}
              max={WW_MAX}
              step={1}
              value={ww}
              disabled={off}
              aria-valuetext={`${ww}`}
              onChange={(e) => onWindowLevel(Number(e.target.value), wl)}
            />
          </Label>
          {windowLevel && <SliderValue value={`${ww}`} />}
        </div>
        <div className="relative min-w-0 min-[900px]:flex min-[900px]:flex-1">
          <Label className={field}>
            Window level
            <input
              type="range"
              className={slider}
              min={WL_MIN}
              max={WL_MAX}
              step={1}
              value={wl}
              disabled={off}
              aria-valuetext={`${wl}`}
              onChange={(e) => onWindowLevel(ww, Number(e.target.value))}
            />
          </Label>
          {windowLevel && <SliderValue value={`${wl}`} />}
        </div>
        <output
          className="viewer-wl hidden min-w-28 font-mono text-xs text-muted-foreground tabular-nums min-[900px]:block"
          aria-live="off"
        >
          {windowLevel ? `W ${ww} / L ${wl}` : ''}
        </output>
      </div>
    </div>
  );
}
