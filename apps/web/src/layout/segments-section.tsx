import { BrushCleaning, Eye, EyeOff, Plus, Trash2 } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Button } from '../components/ui/button';
import { cn } from '../lib/utils';
import { areaOf, formatArea } from '../viewer/segmentation/seg-math';
import { MAX_SEGMENTS, type Segment } from '../viewer/segmentation/seg-types';
import { segmentAreas, statusFor, useSegmentStore } from '../viewer/segmentation/segment-store';
import { SegmentControls } from './segment-controls';

export const EMPTY_SEGMENTS =
  'No segments yet. Choose Brush or Smart brush in the toolbar to start painting.';
/** Areas are recounted at most this often while painting (ms). */
export const AREA_DEBOUNCE_MS = 200;

const EMPTY: Segment[] = [];
type FocusTarget = { id: string } | 'heading' | null;

/** Pixel counts per label, recomputed (debounced) when the study's mask changes. */
function useAreas(studyId: string): Map<number, number> {
  const revision = useSegmentStore((s) => s.byStudy[studyId]?.revision ?? 0);
  const [areas, setAreas] = useState(() => segmentAreas(studyId));
  useEffect(() => {
    const timer = setTimeout(() => setAreas(segmentAreas(studyId)), AREA_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [studyId, revision]);
  return areas;
}

const iconButton = 'max-[899px]:size-11';

/**
 * The open study's segments: the keyboard and screen-reader path for managing
 * them (painting itself is pointer-only, as in OHIF). Choosing a segment makes
 * it the one the brush paints; each has a name field, Hide/Show and Delete.
 * Deleting keeps focus in the list (next item, else previous, else the
 * heading) and is announced in an always-mounted polite live region.
 */
export function SegmentsSection({ studyId }: { studyId: string }) {
  const segments = useSegmentStore((s) => s.byStudy[studyId]?.segments ?? EMPTY);
  const activeId = useSegmentStore((s) => s.byStudy[studyId]?.activeId ?? null);
  const status = useSegmentStore((s) => statusFor(s, studyId));
  const announcement = useSegmentStore((s) => s.announcement);
  const spacing = useSegmentStore((s) => s.imageInfo[studyId]?.spacing ?? null);
  const areas = useAreas(studyId);
  const store = useSegmentStore.getState;
  const count = segments.length;
  const focusTarget = useRef<FocusTarget>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const items = useRef(new Map<string, HTMLButtonElement>());

  useLayoutEffect(() => {
    const target = focusTarget.current;
    if (target === null) return;
    focusTarget.current = null;
    const el = target === 'heading' ? headingRef.current : items.current.get(target.id);
    (el ?? headingRef.current)?.focus();
  });

  const remove = (index: number) => {
    const s = segments[index];
    if (!s) return;
    const next = segments[index + 1] ?? segments[index - 1];
    focusTarget.current = next ? { id: next.id } : 'heading';
    store().announce(`${s.name} deleted`);
    store().removeSegment(studyId, s.id);
  };
  const clear = () => {
    focusTarget.current = 'heading';
    store().clear(studyId);
  };

  return (
    <section
      aria-label="Segments"
      className="flex flex-col gap-3 border-t border-white/10 p-3 sm:p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3
          ref={headingRef}
          tabIndex={-1}
          className="text-[13px] font-semibold tracking-wide text-foreground uppercase outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Segments{' '}
          <span className="font-mono text-xs font-normal text-muted-foreground">{count}</span>
        </h3>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={count >= MAX_SEGMENTS}
            onClick={() => store().addSegment(studyId)}
          >
            <Plus aria-hidden="true" />
            Add segment
          </Button>
          <Button type="button" variant="ghost" size="sm" disabled={count === 0} onClick={clear}>
            <BrushCleaning aria-hidden="true" />
            Clear segments
          </Button>
        </div>
      </div>
      {count === 0 ? (
        <p className="text-sm text-muted-foreground">{EMPTY_SEGMENTS}</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {segments.map((s, index) => {
            const active = s.id === activeId;
            const area = formatArea(areaOf(areas.get(s.label) ?? 0, spacing));
            return (
              <li
                key={s.id}
                className={cn(
                  'flex items-center gap-1.5 rounded-md py-0.5 pr-0.5 pl-1',
                  active && 'bg-primary/10 ring-1 ring-primary/40',
                )}
              >
                <button
                  ref={(el) => {
                    if (el) items.current.set(s.id, el);
                    else items.current.delete(s.id);
                  }}
                  type="button"
                  aria-pressed={active}
                  aria-label={`Paint with ${s.name}`}
                  title={`Paint with ${s.name}`}
                  onClick={() => store().setActive(studyId, s.id)}
                  className="grid size-9 shrink-0 place-items-center rounded-md outline-none hover:bg-white/8 focus-visible:ring-2 focus-visible:ring-ring max-[899px]:size-11"
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      'size-4 rounded-full border-2 border-black/60',
                      !s.visible && 'opacity-35',
                      active && 'ring-2 ring-primary ring-offset-1 ring-offset-card',
                    )}
                    style={{ backgroundColor: s.color }}
                  />
                </button>
                <input
                  type="text"
                  value={s.name}
                  aria-label={`Name of segment ${index + 1}`}
                  maxLength={40}
                  onChange={(e) => store().renameSegment(studyId, s.id, e.target.value)}
                  onBlur={(e) => {
                    if (!e.target.value.trim())
                      store().renameSegment(studyId, s.id, `Segment ${index + 1}`);
                  }}
                  className="h-9 min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1.5 text-sm text-foreground outline-none hover:border-input focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 max-[899px]:h-11"
                />
                <span
                  data-testid="segment-area"
                  className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums"
                >
                  {area}
                </span>
                {/* The name says the action (Hide / Show), so no aria-pressed on top (APG). */}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className={iconButton}
                  aria-label={`${s.visible ? 'Hide' : 'Show'} ${s.name}`}
                  title={`${s.visible ? 'Hide' : 'Show'} ${s.name}`}
                  onClick={() => store().toggleVisible(studyId, s.id)}
                >
                  {s.visible ? <Eye aria-hidden="true" /> : <EyeOff aria-hidden="true" />}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className={iconButton}
                  aria-label={`Delete ${s.name}`}
                  title={`Delete ${s.name}`}
                  onClick={() => remove(index)}
                >
                  <Trash2 aria-hidden="true" />
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      {/* Always mounted so a change of text is announced. */}
      <p data-testid="segments-status" role="status" className="text-xs text-warning empty:hidden">
        {status}
      </p>
      <p data-testid="segments-announcer" role="status" className="sr-only">
        <span key={announcement.key}>{announcement.text}</span>
      </p>
      <SegmentControls studyId={studyId} />
      <p className="text-xs text-muted-foreground">
        One label per pixel (painting a segment replaces another). Kept in memory for this session
        only (cleared on reload); Fit / Reset keeps them. Painting is pointer-only.
      </p>
    </section>
  );
}
