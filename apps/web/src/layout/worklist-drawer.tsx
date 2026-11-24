import { X } from 'lucide-react';
import { useRef } from 'react';
import { Filters } from '../components/filters';
import { Button } from '../components/ui/button';
import { ScrollArea } from '../components/ui/scroll-area';
import { Worklist } from '../components/worklist';
import { cn } from '../lib/utils';
import { WORKLIST_DRAWER_ID } from './use-layout-state';
import { useDismiss, useFocusHandoff, useInert } from './use-dismiss';

const TRIGGER = `[aria-controls="${WORKLIST_DRAWER_ID}"]`;

/**
 * Left overlay drawer holding the filters and the worklist. It floats over the
 * viewer (no layout shift, so the viewport is never resized by it) and stays
 * mounted while closed, so the list query and its scroll position survive.
 */
export function WorklistDrawer({ open, onClose }: { open: boolean; onClose(): void }) {
  const ref = useRef<HTMLElement>(null);
  useDismiss({ active: open, ref, ignore: TRIGGER, onDismiss: onClose });
  useInert(ref, !open);
  useFocusHandoff({
    open,
    ref,
    focusOnOpen: true,
    initialFocus: () =>
      ref.current?.querySelector<HTMLElement>('[data-study-id][aria-pressed="true"]') ??
      ref.current?.querySelector<HTMLElement>('select, [data-study-id]') ??
      null,
    returnFocus: () => document.querySelector<HTMLElement>(TRIGGER),
  });

  return (
    <section
      ref={ref}
      id={WORKLIST_DRAWER_ID}
      aria-label="Worklist"
      tabIndex={-1}
      data-state={open ? 'open' : 'closed'}
      // Choosing a row closes the drawer, also when it is the study already open.
      onClick={(e) => {
        if ((e.target as Element).closest('[data-study-id]')) onClose();
      }}
      className={cn(
        'absolute inset-y-0 left-0 z-40 flex w-full max-w-[380px] flex-col border-r border-white/10 bg-card shadow-2xl shadow-black/60 outline-none',
        'duration-200 ease-out motion-reduce:transition-none',
        // Visibility flips at once on open (so focus can move in immediately) and
        // only after the slide on close.
        open
          ? 'visible translate-x-0 transition-[translate]'
          : 'invisible -translate-x-full transition-[translate,visibility]',
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b border-white/10 py-1.5 pr-1.5 pl-3">
        <h2 className="text-[13px] font-semibold tracking-wide text-foreground uppercase">
          Worklist
        </h2>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8 max-[899px]:size-11"
          aria-label="Close worklist"
          onClick={onClose}
        >
          <X aria-hidden="true" />
        </Button>
      </div>
      <div className="border-b border-white/10 p-3">
        <Filters />
      </div>
      <ScrollArea className="min-h-0 flex-1 p-2">
        <Worklist />
      </ScrollArea>
    </section>
  );
}
