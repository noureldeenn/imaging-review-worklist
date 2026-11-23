import { WL_MAX, WL_MIN, WW_MAX, WW_MIN, type WindowLevel } from './viewer-session';

type Props = {
  windowLevel: WindowLevel | null;
  disabled: boolean;
  onWindowLevel(ww: number, wl: number): void;
  onReset(): void;
};

export function ViewerControls({ windowLevel, disabled, onWindowLevel, onReset }: Props) {
  const ww = windowLevel?.ww ?? WW_MIN;
  const wl = windowLevel?.wl ?? 0;
  const off = disabled || windowLevel === null;
  return (
    <div className="viewer-controls">
      <button type="button" disabled={off} onClick={onReset}>
        Fit / Reset
      </button>
      <label className="field">
        Window width
        <input
          type="range"
          min={WW_MIN}
          max={WW_MAX}
          step={1}
          value={ww}
          disabled={off}
          aria-valuetext={`${ww}`}
          onChange={(e) => onWindowLevel(Number(e.target.value), wl)}
        />
      </label>
      <label className="field">
        Window level
        <input
          type="range"
          min={WL_MIN}
          max={WL_MAX}
          step={1}
          value={wl}
          disabled={off}
          aria-valuetext={`${wl}`}
          onChange={(e) => onWindowLevel(ww, Number(e.target.value))}
        />
      </label>
      <output className="viewer-wl" aria-live="off">
        {windowLevel ? `W ${ww} / L ${wl}` : ''}
      </output>
    </div>
  );
}
