import { X } from 'lucide-react';
import { useRef, type ReactNode } from 'react';
import { Button } from '../components/ui/button';
import { cn } from '../lib/utils';
import { REVIEW_PANEL_ID, type ReviewMode } from './use-layout-state';
import { useDismiss, useFocusHandoff, useInert } from './use-dismiss';

const TRIGGER = `[aria-controls="${REVIEW_PANEL_ID}"]`;

const placement: Record<ReviewMode, { open: string; closed: string }> = {
  // In the flex row next to the viewer: the viewport narrows and refits. No
  // transition here, so the viewport is resized once, not on every frame.
  push: {
    open: 'relative w-[360px] shrink-0 border-l',
    closed: 'absolute inset-y-0 right-0 w-[360px] invisible translate-x-full',
  },
  // Ends above the viewer's info strip (its height is published as --info-strip-h).
  overlay: {
    open: 'absolute top-0 right-0 bottom-(--info-strip-h,0px) z-30 w-[380px] max-w-[90vw] border-b border-l shadow-2xl shadow-black/60 visible translate-x-0',
    closed:
      'absolute top-0 right-0 bottom-(--info-strip-h,0px) z-30 w-[380px] max-w-[90vw] invisible translate-x-full',
  },
  sheet: {
    open: 'absolute inset-x-0 bottom-0 z-30 max-h-[70dvh] rounded-t-xl border-t shadow-2xl shadow-black/70 visible translate-y-0',
    closed: 'absolute inset-x-0 bottom-0 z-30 max-h-[70dvh] invisible translate-y-full',
  },
};

/**
 * Right-hand review panel (study header, Claim, note, mutation feedback). It
 * stays mounted while closed so per-study UI state and pending feedback
 * survive collapsing it. Overlay and sheet modes close on Esc, outside click
 * and the close button; focus moves in on open and back to the toolbar's
 * Review button on close.
 */
export function ReviewPanel({
  mode,
  open,
  focusOnOpen = true,
  onClose,
  children,
}: {
  mode: ReviewMode;
  open: boolean;
  /** False when feedback (not the user) opened the panel: focus stays where it is. */
  focusOnOpen?: boolean;
  onClose(): void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  const floating = mode !== 'push';
  useDismiss({ active: open && floating, ref, ignore: TRIGGER, onDismiss: onClose });
  useInert(ref, !open);
  useFocusHandoff({
    open,
    ref,
    focusOnOpen: floating && focusOnOpen,
    initialFocus: () => ref.current?.querySelector<HTMLElement>('h3[tabindex="-1"]') ?? null,
    returnFocus: () => document.querySelector<HTMLElement>(TRIGGER),
  });

  return (
    <section
      ref={ref}
      id={REVIEW_PANEL_ID}
      aria-label="Review"
      tabIndex={-1}
      data-mode={mode}
      data-state={open ? 'open' : 'closed'}
      className={cn(
        'flex min-h-0 flex-col border-white/10 bg-card outline-none',
        // Visibility flips at once on open (focus can move in) and after the slide on close.
        floating && 'duration-200 ease-out motion-reduce:transition-none',
        floating && (open ? 'transition-[translate]' : 'transition-[translate,visibility]'),
        open ? placement[mode].open : placement[mode].closed,
      )}
    >
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-white/10 py-1.5 pr-1.5 pl-3">
        {mode === 'sheet' && (
          <span
            aria-hidden="true"
            className="absolute top-1 left-1/2 h-1 w-10 -translate-x-1/2 rounded-full bg-white/20"
          />
        )}
        <h2 className="text-[13px] font-semibold tracking-wide text-foreground uppercase">
          Review
        </h2>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8 max-[899px]:size-11"
          aria-label="Close review panel"
          onClick={onClose}
        >
          <X aria-hidden="true" />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-width:thin]">
        {children}
      </div>
    </section>
  );
}
