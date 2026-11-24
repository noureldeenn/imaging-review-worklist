import { ListX, Trash2 } from 'lucide-react';
import { useLayoutEffect, useRef, useState } from 'react';
import { Button } from '../components/ui/button';
import { cn } from '../lib/utils';
import {
  LIMIT_NOTICE,
  MAX_ANNOTATIONS,
  useAnnotationStore,
} from '../viewer/annotations/annotation-store';
import { numberedNames } from '../viewer/annotations/measure-math';
import { useAnnotations } from '../viewer/annotations/use-annotations';

export const EMPTY_MEASUREMENTS =
  'No measurements yet. Choose Length, Angle, Ellipse or Rectangle in the toolbar.';

/** Where focus goes once the list has re-rendered: an item id, or the heading. */
type FocusTarget = { id: string } | 'heading' | null;

/**
 * The current study's measurements as a list: the keyboard and screen-reader
 * path (drawing itself is pointer-only, as in OHIF). Choosing an item selects
 * that shape on the image; each item has its own Delete button. Deleting
 * keeps focus in the list (next item, else previous, else the heading) and is
 * announced in a polite live region that is always mounted.
 */
export function MeasurementsSection({ studyId }: { studyId: string }) {
  const { annotations, selectedId } = useAnnotations(studyId);
  const store = useAnnotationStore.getState;
  const count = annotations.length;
  const names = numberedNames(annotations);
  // Every announcement gets a new key, so even an identical message replaces the
  // node inside the live region and is read again.
  const [announcement, setAnnouncementState] = useState({ text: '', key: 0 });
  const setAnnouncement = (text: string) => setAnnouncementState((a) => ({ text, key: a.key + 1 }));
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
    const a = annotations[index];
    if (!a) return;
    const next = annotations[index + 1] ?? annotations[index - 1];
    focusTarget.current = next ? { id: next.id } : 'heading';
    setAnnouncement(`${names.get(a.id) ?? ''} deleted`);
    store().remove(studyId, a.id);
  };
  const clear = () => {
    focusTarget.current = 'heading';
    setAnnouncement('Measurements cleared');
    store().clear(studyId);
  };

  return (
    <section
      aria-label="Measurements"
      className="flex flex-col gap-2 border-t border-white/10 p-3 sm:p-4"
    >
      <div className="flex items-center justify-between gap-2">
        <h3
          ref={headingRef}
          tabIndex={-1}
          className="text-[13px] font-semibold tracking-wide text-foreground uppercase outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Measurements{' '}
          <span className="font-mono text-xs font-normal text-muted-foreground">{count}</span>
        </h3>
        <Button type="button" variant="ghost" size="sm" disabled={count === 0} onClick={clear}>
          <ListX aria-hidden="true" />
          Clear measurements
        </Button>
      </div>
      {count === 0 ? (
        <p className="text-sm text-muted-foreground">{EMPTY_MEASUREMENTS}</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {annotations.map((a, index) => {
            const name = names.get(a.id) ?? '';
            const selected = a.id === selectedId;
            return (
              <li key={a.id} className="flex items-center gap-1">
                <button
                  ref={(el) => {
                    if (el) items.current.set(a.id, el);
                    else items.current.delete(a.id);
                  }}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => store().select(studyId, selected ? null : a.id)}
                  className={cn(
                    'min-h-9 flex-1 rounded-md px-2.5 text-left font-mono text-sm tabular-nums outline-none hover:bg-white/8 focus-visible:ring-2 focus-visible:ring-ring max-[899px]:min-h-11',
                    selected ? 'bg-primary/15 text-primary' : 'text-foreground/90',
                  )}
                >
                  {name}
                </button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="max-[899px]:size-11"
                  aria-label={`Delete ${name}`}
                  title={`Delete ${name}`}
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
      <p
        data-testid="measurements-limit"
        role="status"
        className="text-xs text-warning empty:hidden"
      >
        {count >= MAX_ANNOTATIONS ? LIMIT_NOTICE : ''}
      </p>
      <p data-testid="measurements-announcer" role="status" className="sr-only">
        <span key={announcement.key}>{announcement.text}</span>
      </p>
      <p className="text-xs text-muted-foreground">
        Kept in memory for this session only (cleared on reload). Fit / Reset keeps them.
      </p>
    </section>
  );
}
