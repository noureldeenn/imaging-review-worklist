import { ScanLine } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * Viewer-first frame (OHIF style): a slim title bar, one toolbar row, then the
 * viewer filling every remaining pixel. The page itself never scrolls; the
 * worklist drawer and the review panel float over (or, at >= 1280px, sit
 * beside) the viewer and scroll internally.
 */
export function AppShell({
  headerActions,
  toolbar,
  viewer,
  drawer,
  panel,
}: {
  headerActions: ReactNode;
  toolbar: ReactNode;
  viewer: ReactNode;
  drawer: ReactNode;
  panel: ReactNode;
}) {
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-black">
      <header className="flex h-11 shrink-0 items-center justify-between gap-3 px-3 max-[899px]:h-13">
        <div className="flex min-w-0 items-center gap-2">
          <span aria-hidden="true" className="grid size-6 shrink-0 place-items-center text-primary">
            <ScanLine className="size-5" />
          </span>
          <h1 className="truncate text-[15px] font-semibold tracking-tight">Imaging Review</h1>
        </div>
        <div className="shrink-0">{headerActions}</div>
      </header>
      <div className="shrink-0 border-b border-white/10 px-2 py-1 max-[899px]:px-1.5">
        {toolbar}
      </div>
      {/* The viewer publishes its info-strip height here (--info-strip-h) so the
          floating drawer and review overlay end above the strip. */}
      <div data-viewer-frame="" className="relative flex min-h-0 flex-1 overflow-hidden">
        <main aria-label="Study viewer" className="flex min-h-0 min-w-0 flex-1 flex-col">
          {viewer}
        </main>
        {panel}
        {drawer}
      </div>
    </div>
  );
}
