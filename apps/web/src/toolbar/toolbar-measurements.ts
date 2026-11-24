import { Circle, DraftingCompass, ListX, Ruler, Square, Trash2, X } from 'lucide-react';
import type { MeasurementKind } from '../viewer/annotations/measure-math';
import { CLEAR_SEGMENTS_ITEM, ERASER_ITEM } from './toolbar-segments';
import type { ToolbarGroupSpec, ToolbarItemSpec } from './toolbar-types';

function measureTool(
  kind: MeasurementKind,
  label: string,
  tooltip: string,
  icon: ToolbarItemSpec['icon'],
): ToolbarItemSpec {
  return {
    id: kind,
    label,
    tooltip,
    icon,
    kind: 'tool',
    run: (ctx) => ctx.viewer?.setTool(kind),
    isActive: (ctx) => ctx.view.tool === kind,
    narrow: 'menu',
  };
}

/**
 * Measurement tools: part of the same exclusive drag-tool choice as Levels,
 * Pan and Zoom (one tool is active). Drawing is pointer-only; the Review
 * panel's Measurements list is the keyboard path. No shortcut keys.
 */
export const MEASURE_GROUP: ToolbarGroupSpec = {
  id: 'measure',
  label: 'Measurements',
  items: [
    measureTool('length', 'Length', 'Length: press, drag and release between two points', Ruler),
    measureTool(
      'angle',
      'Angle',
      'Angle: click three points; the second is the vertex (Esc cancels)',
      DraftingCompass,
    ),
    measureTool('ellipse', 'Ellipse', 'Ellipse: drag its bounding box to measure the area', Circle),
    measureTool(
      'rectangle',
      'Rectangle',
      'Rectangle: drag two corners to measure the area',
      Square,
    ),
  ],
};

/** `Delete ▾`: measurement deletes, then the Eraser tool and Clear segments. */
export const DELETE_GROUP: ToolbarGroupSpec = {
  id: 'delete',
  label: 'Delete',
  items: [
    {
      id: 'delete',
      label: 'Delete',
      tooltip: 'Delete measurements and segments',
      icon: X,
      kind: 'menu',
      narrow: 'menu',
      items: [
        {
          id: 'delete-selected',
          label: 'Delete selected',
          tooltip: 'Delete the selected measurement (Delete or Backspace on the image)',
          icon: Trash2,
          kind: 'action',
          run: (ctx) => ctx.measurements.deleteSelected(),
          isEnabled: (ctx) => ctx.viewer !== null && ctx.measurements.hasSelection,
        },
        {
          id: 'clear-measurements',
          label: 'Clear measurements',
          tooltip: 'Remove every measurement on this image',
          icon: ListX,
          kind: 'action',
          run: (ctx) => ctx.measurements.clear(),
          isEnabled: (ctx) => ctx.viewer !== null && ctx.measurements.count > 0,
        },
        ERASER_ITEM,
        CLEAR_SEGMENTS_ITEM,
      ],
    },
  ],
};
