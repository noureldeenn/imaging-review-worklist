import { ScanLine } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { isNarrowViewport } from '@/lib/viewport';

/**
 * Workstation frame: slim top bar (product name, reviewer switcher) over a
 * two-pane body. At >= 900px both panes sit side by side and scroll
 * independently. Below 900px it is master/detail: only the list without a
 * selection, only the detail with one. Panes are hidden with CSS, never
 * unmounted, so the list's query and scroll state survive.
 */
export function AppShell({
  headerActions,
  worklist,
  detail,
  selectedKey,
}: {
  headerActions: ReactNode;
  worklist: ReactNode;
  detail: ReactNode;
  selectedKey: string | null;
}) {
  const hasSelection = selectedKey !== null;

  const previousKey = useRef<string | null>(selectedKey);
  const listScrollY = useRef(0);

  // Remember where the list was scrolled while it is the visible pane.
  useEffect(() => {
    if (hasSelection) return undefined;
    const onScroll = () => {
      listScrollY.current = window.scrollY;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [hasSelection]);

  // Narrow screens only: opening a study starts the detail at the top (the detail
  // heading takes focus, see StudyHeader); going back restores the list's scroll
  // position and returns focus to the row that was open.
  useEffect(() => {
    const before = previousKey.current;
    previousKey.current = selectedKey;
    if (!isNarrowViewport() || before === selectedKey) return;
    if (selectedKey !== null) {
      window.scrollTo({ top: 0 });
      return;
    }
    if (before === null) return;
    window.scrollTo({ top: listScrollY.current });
    const row = Array.from(document.querySelectorAll<HTMLElement>('[data-study-id]')).find(
      (el) => el.dataset['studyId'] === before,
    );
    row?.focus({ preventScroll: true });
  }, [selectedKey]);

  return (
    <div className="flex min-h-dvh flex-col min-[900px]:h-dvh">
      <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b bg-card/60 px-3 backdrop-blur sm:px-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            aria-hidden="true"
            className="grid size-7 shrink-0 place-items-center rounded-md bg-primary/15 text-primary"
          >
            <ScanLine className="size-4" />
          </span>
          <h1 className="truncate text-[15px] font-semibold tracking-tight">
            Imaging Review{' '}
            <span className="hidden font-normal text-muted-foreground sm:inline">Worklist</span>
          </h1>
        </div>
        <div className="shrink-0">{headerActions}</div>
      </header>
      <main className="grid flex-1 grid-cols-1 gap-3 p-3 min-[900px]:min-h-0 min-[900px]:grid-cols-[minmax(340px,1fr)_2fr]">
        <section
          aria-label="Worklist"
          className={cn(
            'flex min-h-0 min-w-0 flex-col rounded-lg border bg-card',
            hasSelection && 'max-[899px]:hidden',
          )}
        >
          {worklist}
        </section>
        <section
          aria-label="Study viewer"
          className={cn(
            'flex min-h-[320px] min-w-0 flex-col rounded-lg border bg-card min-[900px]:min-h-0',
            !hasSelection && 'max-[899px]:hidden',
          )}
        >
          {detail}
        </section>
      </main>
    </div>
  );
}
