import type { LucideIcon } from 'lucide-react';
import type { LayoutState } from '../layout/use-layout-state';
import type { ViewerCommands } from '../viewer/viewer-bridge';
import type { ViewTransform } from '../viewer/viewport-controller';

/**
 * `tool`   changes what a drag does; one tool is active (aria-pressed; menuitemradio in a menu).
 * `action` one-shot command (zoom step, rotate, flip, reset) or a panel toggle.
 * `menu`   opens a menu of further items (role="menu").
 */
export type ToolbarItemKind = 'tool' | 'action' | 'menu';

/** What the toolbar's handlers can reach. */
export type ToolbarContext = {
  /** Null unless an image is mounted and ready. */
  viewer: ViewerCommands | null;
  view: ViewTransform;
  layout: LayoutState & { reviewAttention: boolean };
  /** The current study's measurements (in-memory store, no Cornerstone). */
  measurements: MeasurementsContext;
};

export type MeasurementsContext = {
  count: number;
  hasSelection: boolean;
  deleteSelected(): void;
  clear(): void;
};

export type ToolbarItemSpec = {
  id: string;
  /** Visible label; the button's accessible name is exactly this text. */
  label: string;
  /** Hover/focus tooltip: what it does and its shortcut. */
  tooltip: string;
  icon: LucideIcon;
  kind: ToolbarItemKind;
  run?(ctx: ToolbarContext): void;
  /** Tools: the active one (aria-pressed). Menu items: checked state (menuitemcheckbox). */
  isActive?(ctx: ToolbarContext): boolean;
  /** Menu items only: expose a checked state. */
  checkable?: boolean;
  /** Defaults to "an image is ready". */
  isEnabled?(ctx: ToolbarContext): boolean;
  /** Disclosure buttons for side panels (aria-expanded / aria-controls). */
  panel?: {
    controls: string;
    isOpen(ctx: ToolbarContext): boolean;
    needsAttention?(ctx: ToolbarContext): boolean;
  };
  /**
   * Below 900px the item moves into the overflow menu (More); a moved menu
   * (Delete ▾) contributes its items instead of nesting a submenu.
   */
  narrow?: 'menu';
  items?: ToolbarItemSpec[];
};

export type ToolbarGroupSpec = { id: string; label: string; items: ToolbarItemSpec[] };

/** An item resolved against the current context: plain data the renderer draws. */
export type ToolbarItem = {
  id: string;
  label: string;
  tooltip: string;
  icon: LucideIcon;
  kind: ToolbarItemKind;
  disabled: boolean;
  onSelect(): void;
  pressed?: boolean;
  checked?: boolean;
  expanded?: boolean;
  controls?: string;
  attention?: boolean;
  items?: ToolbarItem[];
};

export type ToolbarGroup = { id: string; label: string; items: ToolbarItem[] };
