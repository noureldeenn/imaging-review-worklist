import { Undo2 } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Label } from '../components/ui/label';
import { NativeSelect } from '../components/ui/native-select';
import {
  BRUSH_MAX,
  BRUSH_MIN,
  OPACITY_MAX,
  OPACITY_MIN,
  PRESETS,
  type PresetId,
} from '../viewer/segmentation/seg-types';
import { useSegmentStore } from '../viewer/segmentation/segment-store';

export const STORED_VALUES_HINT = 'Thresholds apply to stored pixel values';
export const NOT_DIAGNOSTIC = 'Indicative ranges for software testing, not for diagnostic use.';

const field = 'flex flex-col gap-1.5';
const row = 'flex items-center gap-2';
const slider =
  'h-6 min-w-0 flex-1 cursor-pointer accent-primary outline-none focus-visible:ring-2 focus-visible:ring-ring max-[899px]:h-11';
const number =
  'h-9 w-full min-w-0 rounded-md border border-input bg-background/60 px-2 font-mono text-sm text-foreground tabular-nums outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 max-[899px]:h-11';
const value = 'w-12 text-right font-mono text-xs text-foreground/80 tabular-nums';

// Uncontrolled number inputs: a half-typed value such as "-" is kept as typed
// and only complete numbers reach the store.
const toNumber = (raw: string): number | null => {
  const n = Number(raw);
  return raw.trim() !== '' && Number.isFinite(n) ? n : null;
};

/**
 * Brush size, opacity, the smart brush range and Undo. For non-CT images the
 * HU presets are disabled and the custom range applies to stored pixel values.
 */
export function SegmentControls({
  studyId,
  onUndoExhausted,
}: {
  studyId: string;
  /** Called when Undo disabled itself (no strokes left), so focus can move on. */
  onUndoExhausted?(): void;
}) {
  const brushSize = useSegmentStore((s) => s.brushSize);
  const opacity = useSegmentStore((s) => s.opacity);
  const preset = useSegmentStore((s) => s.preset);
  const custom = useSegmentStore((s) => s.custom);
  const undoDepth = useSegmentStore((s) => s.byStudy[studyId]?.undoDepth ?? 0);
  // Unknown until the image has loaded: presets stay available (CT is the common case).
  const ct = useSegmentStore((s) => s.imageInfo[studyId]?.ct ?? true);
  const store = useSegmentStore.getState;
  const shown: PresetId = ct ? preset : 'custom';
  const hintId = `segment-range-hint-${studyId}`;

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3 max-[379px]:grid-cols-1">
        <div className={field}>
          <Label htmlFor={`brush-size-${studyId}`}>Brush size</Label>
          <div className={row}>
            <input
              id={`brush-size-${studyId}`}
              type="range"
              className={slider}
              min={BRUSH_MIN}
              max={BRUSH_MAX}
              step={1}
              value={brushSize}
              aria-valuetext={`${brushSize} pixels radius`}
              onChange={(e) => store().setBrushSize(Number(e.target.value))}
            />
            <span aria-hidden="true" className={value}>
              {brushSize} px
            </span>
          </div>
        </div>
        <div className={field}>
          <Label htmlFor={`opacity-${studyId}`}>Opacity</Label>
          <div className={row}>
            <input
              id={`opacity-${studyId}`}
              type="range"
              className={slider}
              min={OPACITY_MIN}
              max={OPACITY_MAX}
              step={5}
              value={opacity}
              aria-valuetext={`${opacity}%`}
              onChange={(e) => store().setOpacity(Number(e.target.value))}
            />
            <span aria-hidden="true" className={value}>
              {opacity}%
            </span>
          </div>
        </div>
      </div>
      <div className={field}>
        <Label htmlFor={`smart-range-${studyId}`}>Smart brush range</Label>
        <NativeSelect
          id={`smart-range-${studyId}`}
          value={shown}
          aria-describedby={hintId}
          onChange={(e) => store().setPreset(e.target.value as PresetId)}
        >
          {PRESETS.map((p) => (
            <option key={p.id} value={p.id} disabled={!ct && p.id !== 'custom'}>
              {p.label}
            </option>
          ))}
        </NativeSelect>
        <p id={hintId} className="text-xs text-muted-foreground">
          {ct ? 'Hounsfield units (CT). ' : `${STORED_VALUES_HINT}. `}
          {NOT_DIAGNOSTIC}
        </p>
      </div>
      {shown === 'custom' && (
        <div className="grid grid-cols-2 gap-3">
          <div className={field}>
            <Label htmlFor={`range-min-${studyId}`}>Minimum</Label>
            <input
              id={`range-min-${studyId}`}
              type="number"
              inputMode="numeric"
              className={number}
              defaultValue={custom.min}
              onChange={(e) => {
                const n = toNumber(e.target.value);
                if (n !== null) store().setCustom({ min: n });
              }}
            />
          </div>
          <div className={field}>
            <Label htmlFor={`range-max-${studyId}`}>Maximum</Label>
            <input
              id={`range-max-${studyId}`}
              type="number"
              inputMode="numeric"
              className={number}
              defaultValue={custom.max}
              onChange={(e) => {
                const n = toNumber(e.target.value);
                if (n !== null) store().setCustom({ max: n });
              }}
            />
          </div>
        </div>
      )}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="self-start"
        disabled={undoDepth === 0}
        onClick={() => {
          store().undo(studyId);
          if ((store().byStudy[studyId]?.undoDepth ?? 0) === 0) onUndoExhausted?.();
        }}
      >
        <Undo2 aria-hidden="true" />
        Undo last stroke
      </Button>
    </div>
  );
}
