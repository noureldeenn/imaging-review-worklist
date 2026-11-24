import {
  CircleEllipsis,
  ClipboardPenLine,
  Contrast,
  FlipHorizontal2,
  FlipVertical2,
  ListChecks,
  Maximize,
  Move,
  RotateCcw,
  RotateCw,
  Search,
  SunMoon,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { REVIEW_PANEL_ID, WORKLIST_DRAWER_ID } from '../layout/use-layout-state';
import type { ViewerTool } from '../viewer/viewport-controller';
import { DELETE_GROUP, MEASURE_GROUP } from './toolbar-measurements';
import { SEGMENT_GROUP } from './toolbar-segments';
import type {
  ToolbarContext,
  ToolbarGroup,
  ToolbarGroupSpec,
  ToolbarItem,
  ToolbarItemSpec,
} from './toolbar-types';

function tool(
  id: string,
  viewerTool: ViewerTool,
  label: string,
  tooltip: string,
  icon: ToolbarItemSpec['icon'],
): ToolbarItemSpec {
  return {
    id,
    label,
    tooltip,
    icon,
    kind: 'tool',
    run: (ctx) => ctx.viewer?.setTool(viewerTool),
    isActive: (ctx) => ctx.view.tool === viewerTool,
  };
}

/**
 * The toolbar, left to right. Groups are separated by thin rules; later
 * features (measurements, segmentation) add a group here without touching the
 * renderer. Labels carry the shortcut where OHIF does.
 */
export const TOOLBAR_GROUPS: ToolbarGroupSpec[] = [
  {
    id: 'panels',
    label: 'Panels',
    items: [
      {
        id: 'worklist',
        label: 'Worklist',
        tooltip: 'Show or hide the worklist',
        icon: ListChecks,
        kind: 'action',
        run: (ctx) => ctx.layout.toggleWorklist(),
        isEnabled: () => true,
        panel: { controls: WORKLIST_DRAWER_ID, isOpen: (ctx) => ctx.layout.worklistOpen },
      },
      {
        id: 'review',
        label: 'Review',
        tooltip: 'Show or hide the review panel (claim, note, status)',
        icon: ClipboardPenLine,
        kind: 'action',
        run: (ctx) => ctx.layout.toggleReview(),
        isEnabled: (ctx) => ctx.layout.hasSelection,
        panel: {
          controls: REVIEW_PANEL_ID,
          isOpen: (ctx) => ctx.layout.reviewOpen,
          needsAttention: (ctx) => ctx.layout.reviewAttention && !ctx.layout.reviewOpen,
        },
      },
    ],
  },
  {
    id: 'tools',
    label: 'Drag tool',
    items: [
      tool(
        'levels',
        'windowLevel',
        'Levels (L)',
        'Levels: drag sideways for width, up/down for level (L)',
        Contrast,
      ),
      tool('pan', 'pan', 'Pan (P)', 'Pan: drag to move the image (P)', Move),
      tool('zoom', 'zoom', 'Zoom (Z)', 'Zoom: drag up/down to zoom (Z)', Search),
    ],
  },
  MEASURE_GROUP,
  SEGMENT_GROUP,
  {
    id: 'zoom-steps',
    label: 'Zoom steps',
    items: [
      {
        id: 'zoom-in',
        label: 'Zoom in',
        tooltip: 'Zoom in (+)',
        icon: ZoomIn,
        kind: 'action',
        run: (ctx) => ctx.viewer?.zoomIn(),
        narrow: 'menu',
      },
      {
        id: 'zoom-out',
        label: 'Zoom out',
        tooltip: 'Zoom out (-)',
        icon: ZoomOut,
        kind: 'action',
        run: (ctx) => ctx.viewer?.zoomOut(),
        narrow: 'menu',
      },
    ],
  },
  {
    id: 'reset',
    label: 'Reset',
    items: [
      {
        id: 'fit-reset',
        label: 'Fit / Reset',
        tooltip:
          'Fit the image and reset zoom, pan, rotation, flips, invert and window/level (0); measurements and segments stay',
        icon: Maximize,
        kind: 'action',
        run: (ctx) => ctx.viewer?.reset(),
      },
    ],
  },
  DELETE_GROUP,
  {
    id: 'more',
    label: 'More tools',
    items: [
      {
        id: 'more',
        label: 'More',
        tooltip: 'More tools',
        icon: CircleEllipsis,
        kind: 'menu',
        items: [
          {
            id: 'invert',
            label: 'Invert (I)',
            tooltip: 'Invert greyscale (I)',
            icon: SunMoon,
            kind: 'action',
            checkable: true,
            run: (ctx) => ctx.viewer?.toggleInvert(),
            isActive: (ctx) => ctx.view.invert,
          },
          {
            id: 'rotate-left',
            label: 'Rotate left (<)',
            tooltip: 'Rotate 90° left (<)',
            icon: RotateCcw,
            kind: 'action',
            run: (ctx) => ctx.viewer?.rotateLeft(),
          },
          {
            id: 'rotate-right',
            label: 'Rotate right (>)',
            tooltip: 'Rotate 90° right (>)',
            icon: RotateCw,
            kind: 'action',
            run: (ctx) => ctx.viewer?.rotateRight(),
          },
          {
            id: 'flip-h',
            label: 'Flip horizontal (H)',
            tooltip: 'Mirror left-right on screen (H)',
            icon: FlipHorizontal2,
            kind: 'action',
            run: (ctx) => ctx.viewer?.flipH(),
          },
          {
            id: 'flip-v',
            label: 'Flip vertical (V)',
            tooltip: 'Mirror top-bottom on screen (V)',
            icon: FlipVertical2,
            kind: 'action',
            run: (ctx) => ctx.viewer?.flipV(),
          },
        ],
      },
    ],
  },
];

function resolveItem(spec: ToolbarItemSpec, ctx: ToolbarContext): ToolbarItem {
  const items = spec.items?.map((child) => resolveItem(child, ctx));
  const enabled = items
    ? items.some((child) => !child.disabled)
    : (spec.isEnabled?.(ctx) ?? ctx.viewer !== null);
  const item: ToolbarItem = {
    id: spec.id,
    label: spec.label,
    tooltip: spec.tooltip,
    icon: spec.icon,
    kind: spec.kind,
    disabled: !enabled,
    onSelect: () => spec.run?.(ctx),
  };
  if (items) {
    item.items = items;
    const active = items.find((child) => child.pressed);
    if (active) item.activeTool = active.label;
  }
  if (spec.kind === 'tool') item.pressed = spec.isActive?.(ctx) ?? false;
  if (spec.checkable) item.checked = spec.isActive?.(ctx) ?? false;
  if (spec.panel) {
    item.expanded = spec.panel.isOpen(ctx);
    item.controls = spec.panel.controls;
    item.attention = spec.panel.needsAttention?.(ctx) ?? false;
  }
  return item;
}

/**
 * Resolves the config against the current state. Below 900px (`narrow`)
 * items marked `narrow: 'menu'` move to the front of the last menu (a moved
 * menu contributes its own items: no nested submenus), so the phone row keeps
 * seven 44px buttons.
 */
export function resolveToolbar(
  groups: ToolbarGroupSpec[],
  ctx: ToolbarContext,
  { narrow }: { narrow: boolean },
): ToolbarGroup[] {
  const moved: ToolbarItemSpec[] = [];
  const kept = groups.map((group) => ({
    ...group,
    items: group.items.filter((item) => {
      if (!narrow || item.narrow !== 'menu') return true;
      moved.push(...(item.kind === 'menu' ? (item.items ?? []) : [item]));
      return false;
    }),
  }));
  const menu = [...kept]
    .reverse()
    .flatMap((g) => g.items)
    .find((i) => i.kind === 'menu');
  return kept
    .filter((group) => group.items.length > 0)
    .map((group) => ({
      id: group.id,
      label: group.label,
      items: group.items.map((spec) =>
        resolveItem(
          spec === menu && moved.length > 0
            ? { ...spec, items: [...moved, ...(spec.items ?? [])] }
            : spec,
          ctx,
        ),
      ),
    }));
}
