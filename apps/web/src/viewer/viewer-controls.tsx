import { Maximize } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Label } from '../components/ui/label';
import { Tooltip, TooltipContent, TooltipTrigger } from '../components/ui/tooltip';
import { WL_MAX, WL_MIN, WW_MAX, WW_MIN, type WindowLevel } from './viewer-session';

type Props = {
  windowLevel: WindowLevel | null;
  disabled: boolean;
  onWindowLevel(ww: number, wl: number): void;
  onReset(): void;
};

// Below 640px the toolbar stacks: Fit / Reset, then one full-width row per slider
// (label above the track, value right-aligned). The 44px-tall range input gives the
// thumb a touch-sized hit area; the visible track stays thin.
const slider =
  'h-11 w-full min-w-20 cursor-pointer accent-primary outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card disabled:cursor-not-allowed disabled:opacity-40 sm:h-6 sm:flex-1';
const field =
  'flex min-w-0 flex-col items-stretch gap-0 text-[11px] whitespace-nowrap uppercase sm:min-w-[200px] sm:flex-1 sm:flex-row sm:items-center sm:gap-2';

function SliderValue({ value }: { value: string }) {
  // Visual only (the <output> and aria-valuetext carry the value for assistive tech).
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute top-0 right-0 font-mono text-[11px] text-muted-foreground tabular-nums sm:hidden"
    >
      {value}
    </span>
  );
}

export function ViewerControls({ windowLevel, disabled, onWindowLevel, onReset }: Props) {
  const ww = windowLevel?.ww ?? WW_MIN;
  const wl = windowLevel?.wl ?? 0;
  const off = disabled || windowLevel === null;
  return (
    <div className="viewer-controls flex flex-col gap-1 border-b bg-card px-3 py-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-4 sm:gap-y-2 sm:px-2 sm:py-1.5">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="self-start"
            disabled={off}
            onClick={onReset}
          >
            <Maximize aria-hidden="true" />
            Fit / Reset
          </Button>
        </TooltipTrigger>
        <TooltipContent>Restore the default window/level and zoom</TooltipContent>
      </Tooltip>
      {/* Inputs are direct children of their labels so the label text stays exact. */}
      <div className="relative min-w-0 sm:flex sm:flex-1">
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
      <div className="relative min-w-0 sm:flex sm:flex-1">
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
        className="viewer-wl hidden min-w-28 font-mono text-xs text-muted-foreground tabular-nums sm:block"
        aria-live="off"
      >
        {windowLevel ? `W ${ww} / L ${wl}` : ''}
      </output>
    </div>
  );
}
