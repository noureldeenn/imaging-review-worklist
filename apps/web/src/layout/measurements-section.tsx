import { ListX, Trash2 } from 'lucide-react';
import { Button } from '../components/ui/button';
import { cn } from '../lib/utils';
import { MAX_ANNOTATIONS, useAnnotationStore } from '../viewer/annotations/annotation-store';
import { describeAnnotation } from '../viewer/annotations/measure-math';
import { useAnnotations } from '../viewer/annotations/use-annotations';

export const EMPTY_MEASUREMENTS =
  'No measurements yet. Choose Length, Angle, Ellipse or Rectangle in the toolbar.';

/**
 * The current study's measurements as a list: the keyboard and screen-reader
 * path (drawing itself is pointer-only, as in OHIF). Choosing an item selects
 * that shape on the image; each item has its own Delete button.
 */
export function MeasurementsSection({ studyId }: { studyId: string }) {
  const { annotations, selectedId } = useAnnotations(studyId);
  const store = useAnnotationStore.getState;
  const count = annotations.length;

  return (
    <section
      aria-label="Measurements"
      className="flex flex-col gap-2 border-t border-white/10 p-3 sm:p-4"
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[13px] font-semibold tracking-wide text-foreground uppercase">
          Measurements{' '}
          <span className="font-mono text-xs font-normal text-muted-foreground">{count}</span>
        </h3>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={count === 0}
          onClick={() => store().clear(studyId)}
        >
          <ListX aria-hidden="true" />
          Clear measurements
        </Button>
      </div>
      {count === 0 ? (
        <p className="text-sm text-muted-foreground">{EMPTY_MEASUREMENTS}</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {annotations.map((a) => {
            const text = describeAnnotation(a);
            const selected = a.id === selectedId;
            return (
              <li key={a.id} className="flex items-center gap-1">
                <button
                  type="button"
                  aria-pressed={selected}
                  onClick={() => store().select(studyId, selected ? null : a.id)}
                  className={cn(
                    'min-h-9 flex-1 rounded-md px-2.5 text-left font-mono text-sm tabular-nums outline-none hover:bg-white/8 focus-visible:ring-2 focus-visible:ring-ring max-[899px]:min-h-11',
                    selected ? 'bg-primary/15 text-primary' : 'text-foreground/90',
                  )}
                >
                  {text}
                </button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="max-[899px]:size-11"
                  aria-label={`Delete ${text}`}
                  title={`Delete ${text}`}
                  onClick={() => store().remove(studyId, a.id)}
                >
                  <Trash2 aria-hidden="true" />
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      {count >= MAX_ANNOTATIONS && (
        <p role="status" className="text-xs text-warning">
          Limit of {MAX_ANNOTATIONS} measurements reached; delete one to draw more.
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        Kept in memory for this session only (cleared on reload). Fit / Reset keeps them.
      </p>
    </section>
  );
}
