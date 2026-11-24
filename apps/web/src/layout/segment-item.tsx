import { Eye, EyeOff, Trash2 } from 'lucide-react';
import { useRef } from 'react';
import { Button } from '../components/ui/button';
import { cn } from '../lib/utils';
import type { Segment } from '../viewer/segmentation/seg-types';
import { useSegmentStore } from '../viewer/segmentation/segment-store';

const iconButton = 'max-[899px]:size-11';

type Props = {
  studyId: string;
  segment: Segment;
  /** 1-based position in the list (the name field's stable label). */
  position: number;
  active: boolean;
  area: string;
  onDelete(): void;
  selectRef(el: HTMLButtonElement | null): void;
  nameRef(el: HTMLInputElement | null): void;
};

/**
 * One row of the Segments list: the paint-with (active) swatch button, the name
 * field (Escape restores the name it had on focus; an empty or duplicate name
 * falls back to `Segment N` by the segment's own number), the area, Hide/Show
 * and Delete.
 */
export function SegmentItem({
  studyId,
  segment: s,
  position,
  active,
  area,
  onDelete,
  selectRef,
  nameRef,
}: Props) {
  const store = useSegmentStore.getState;
  const original = useRef(s.name);
  return (
    <li
      className={cn(
        'flex items-center gap-1.5 rounded-md py-0.5 pr-0.5 pl-1',
        active && 'bg-primary/10 ring-1 ring-primary/40',
      )}
    >
      <button
        ref={selectRef}
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
        ref={nameRef}
        type="text"
        value={s.name}
        aria-label={`Name of segment ${position}`}
        maxLength={40}
        onFocus={() => {
          original.current = s.name;
        }}
        onChange={(e) => store().renameSegment(studyId, s.id, e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== 'Escape') return;
          // Undo the edit; the panel's own Escape (close) must not also run.
          e.preventDefault();
          e.stopPropagation();
          store().renameSegment(studyId, s.id, original.current);
        }}
        onBlur={() => store().finishRename(studyId, s.id)}
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
        onClick={onDelete}
      >
        <Trash2 aria-hidden="true" />
      </Button>
    </li>
  );
}
