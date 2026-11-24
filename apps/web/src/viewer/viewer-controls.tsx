import { Label } from '../components/ui/label';
import { WL_MAX, WL_MIN, WW_MAX, WW_MIN, type WindowLevel } from './viewer-session';

type Props = {
  windowLevel: WindowLevel | null;
  disabled: boolean;
  onWindowLevel(ww: number, wl: number): void;
};

// The 44px-tall range input below 900px gives the thumb a touch-sized hit area;
// the visible track stays thin. Desktop keeps the sliders compact in the info strip.
const slider =
  'h-11 w-full min-w-0 cursor-pointer accent-primary outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-black disabled:cursor-not-allowed min-[900px]:h-6 min-[900px]:w-24 min-[1280px]:w-32';
const field =
  'flex min-w-0 flex-1 flex-col items-stretch gap-0 text-[11px] font-medium tracking-wide whitespace-nowrap text-muted-foreground uppercase min-[900px]:flex-row min-[900px]:items-center min-[900px]:gap-2';

function SliderValue({ value }: { value: string }) {
  // Visual only (aria-valuetext carries the value for assistive tech).
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute top-0 right-0 font-mono text-[11px] text-foreground/80 tabular-nums min-[900px]:static min-[900px]:w-9 min-[900px]:text-right"
    >
      {value}
    </span>
  );
}

/** Window width / level sliders (siblings of the viewport, never inside it). */
export function ViewerControls({ windowLevel, disabled, onWindowLevel }: Props) {
  const ww = windowLevel?.ww ?? WW_MIN;
  const wl = windowLevel?.wl ?? 0;
  const off = disabled || windowLevel === null;
  return (
    <div className="viewer-controls grid min-w-0 grid-cols-2 gap-3 max-[899px]:basis-full min-[900px]:flex min-[900px]:items-center min-[900px]:gap-4">
      {/* Inputs are direct children of their labels so the label text stays exact. */}
      <div className="relative flex min-w-0 items-center gap-2">
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
      <div className="relative flex min-w-0 items-center gap-2">
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
    </div>
  );
}
