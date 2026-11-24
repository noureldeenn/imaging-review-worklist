import { Keyboard } from 'lucide-react';

/** Keyboard shortcuts of the focused viewport, in the order the help lists them. */
export const VIEWER_SHORTCUTS: ReadonlyArray<readonly [keys: string, action: string]> = [
  ['+ / =', 'Zoom in'],
  ['-', 'Zoom out'],
  ['R', 'Rotate right'],
  ['Shift+R', 'Rotate left'],
  ['H / V', 'Flip horizontal / vertical'],
  ['I', 'Invert'],
  ['0', 'Fit / Reset'],
  ['Arrows', 'Pan'],
  ['W / P / Z', 'Window/Level, Pan, Zoom tool'],
];

export const ARIA_KEYSHORTCUTS =
  '+ = - R Shift+R H V I 0 ArrowUp ArrowDown ArrowLeft ArrowRight W P Z';

export const SHORTCUTS_DESCRIPTION_ID = 'viewer-shortcuts-description';

const GESTURES =
  'Drag uses the active tool (window/level by default). Mouse wheel zooms. Middle-button drag pans, right-button drag zooms. Two fingers pinch to zoom and drag to pan.';

/** Visually hidden description the viewport points at with aria-describedby. */
export function ShortcutsDescription() {
  return (
    <p id={SHORTCUTS_DESCRIPTION_ID} className="sr-only">
      {GESTURES} Keyboard, when the image is focused:{' '}
      {VIEWER_SHORTCUTS.map(([keys, action]) => `${keys}: ${action}`).join('; ')}.
    </p>
  );
}

/** Small disclosure listing the shortcuts (static text, no JS state). */
export function ShortcutsHelp() {
  return (
    <details className="group relative">
      <summary className="flex h-8 cursor-pointer list-none items-center gap-1.5 rounded-md px-2.5 text-sm font-medium text-muted-foreground outline-none select-none hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card max-[899px]:min-h-11 [&::-webkit-details-marker]:hidden">
        <Keyboard aria-hidden="true" className="size-4" />
        Shortcuts
      </summary>
      <div className="absolute top-full right-0 z-20 mt-1 w-72 max-w-[calc(100vw-2rem)] rounded-md border bg-popover p-3 text-xs text-popover-foreground shadow-lg">
        <p className="mb-2 text-muted-foreground">{GESTURES}</p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
          {VIEWER_SHORTCUTS.map(([keys, action]) => (
            <div key={keys} className="contents">
              <dt className="font-mono text-foreground">{keys}</dt>
              <dd className="text-muted-foreground">{action}</dd>
            </div>
          ))}
        </dl>
      </div>
    </details>
  );
}
