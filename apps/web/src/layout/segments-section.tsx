import { BrushCleaning, Plus } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Button } from '../components/ui/button';
import { areaOf, formatArea } from '../viewer/segmentation/seg-math';
import { MAX_SEGMENTS, type Segment } from '../viewer/segmentation/seg-types';
import { segmentAreas, statusFor, useSegmentStore } from '../viewer/segmentation/segment-store';
import { SegmentControls } from './segment-controls';
import { SegmentItem } from './segment-item';

export const EMPTY_SEGMENTS =
  'No segments yet. Choose Brush or Smart brush in the toolbar to start painting.';
/** Areas are recounted at most this often while painting (ms). */
export const AREA_DEBOUNCE_MS = 200;

const EMPTY: Segment[] = [];
/** Where focus goes after the next render: a segment's swatch or name field, or the heading. */
type FocusTarget = { id: string } | { name: string } | 'heading' | null;

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
  const statusKey = useSegmentStore((s) =>
    s.status?.studyId === studyId ? s.status.at : s.byStudy[studyId]?.dropped ? -1 : 0,
  );
  const announcement = useSegmentStore((s) => s.announcement);
  const spacing = useSegmentStore((s) => s.imageInfo[studyId]?.spacing ?? null);
  const areas = useAreas(studyId);
  const store = useSegmentStore.getState;
  const count = segments.length;
  const focusTarget = useRef<FocusTarget>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const items = useRef(new Map<string, HTMLButtonElement>());
  const names = useRef(new Map<string, HTMLInputElement>());
  const clearRef = useRef<HTMLButtonElement>(null);

  useLayoutEffect(() => {
    const target = focusTarget.current;
    if (target === null) return;
    focusTarget.current = null;
    const el =
      target === 'heading'
        ? headingRef.current
        : 'name' in target
          ? names.current.get(target.name)
          : items.current.get(target.id);
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
  const add = () => {
    const created = store().addSegment(studyId);
    // The 8th segment disables Add segment: continue in the new segment's name field.
    if (created && count + 1 >= MAX_SEGMENTS) focusTarget.current = { name: created.id };
  };
  // Undo last stroke disabled itself: Clear segments (or the heading) takes focus.
  const undoExhausted = () => {
    const next = clearRef.current && !clearRef.current.disabled ? clearRef.current : null;
    (next ?? headingRef.current)?.focus();
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
            onClick={add}
          >
            <Plus aria-hidden="true" />
            Add segment
          </Button>
          <Button
            ref={clearRef}
            type="button"
            variant="ghost"
            size="sm"
            disabled={count === 0}
            onClick={clear}
          >
            <BrushCleaning aria-hidden="true" />
            Clear segments
          </Button>
        </div>
      </div>
      {count === 0 ? (
        <p className="text-sm text-muted-foreground">{EMPTY_SEGMENTS}</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {segments.map((s, index) => (
            <SegmentItem
              key={s.id}
              studyId={studyId}
              segment={s}
              position={index + 1}
              active={s.id === activeId}
              area={formatArea(areaOf(areas.get(s.label) ?? 0, spacing))}
              onDelete={() => remove(index)}
              selectRef={(el) => {
                if (el) items.current.set(s.id, el);
                else items.current.delete(s.id);
              }}
              nameRef={(el) => {
                if (el) names.current.set(s.id, el);
                else names.current.delete(s.id);
              }}
            />
          ))}
        </ul>
      )}
      {/* Always rendered (visually hidden while empty) so a change is announced; each
          refusal is a fresh keyed node, so a repeated message is read again. */}
      <p
        data-testid="segments-status"
        role="status"
        className={status ? 'text-xs text-warning' : 'sr-only'}
      >
        <span key={statusKey}>{status}</span>
      </p>
      <p data-testid="segments-announcer" role="status" className="sr-only">
        <span key={announcement.key}>{announcement.text}</span>
      </p>
      <SegmentControls studyId={studyId} onUndoExhausted={undoExhausted} />
      <p className="text-xs text-muted-foreground">
        One label per pixel (painting a segment replaces another). Kept in memory for this session
        only (cleared on reload); Fit / Reset keeps them. Painting is pointer-only.
      </p>
    </section>
  );
}
