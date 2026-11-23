import { ScanLine } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

const NARROW = '(max-width: 899px)';

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

  // Switching panes on a narrow screen starts the new pane at the top.
  useEffect(() => {
    if (typeof window.matchMedia === 'function' && window.matchMedia(NARROW).matches) {
      window.scrollTo({ top: 0 });
    }
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
