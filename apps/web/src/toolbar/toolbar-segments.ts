import { BrushCleaning, Eraser, Paintbrush, Shapes, WandSparkles } from 'lucide-react';
import type { SegmentationTool } from '../viewer/segmentation/seg-types';
import type { ToolbarGroupSpec, ToolbarItemSpec } from './toolbar-types';

function segmentTool(
  tool: SegmentationTool,
  label: string,
  tooltip: string,
  icon: ToolbarItemSpec['icon'],
): ToolbarItemSpec {
  return {
    id: tool,
    label,
    tooltip,
    icon,
    kind: 'tool',
    run: (ctx) => ctx.viewer?.setTool(tool),
    isActive: (ctx) => ctx.view.tool === tool,
  };
}

/**
 * `Segment ▾` (OHIF's Segment menu): the brushes are part of the same exclusive
 * drag-tool choice as Levels, Pan, Zoom and the measurement tools. Painting is
 * pointer-only; the Review panel's Segments section is the keyboard path.
 */
export const SEGMENT_GROUP: ToolbarGroupSpec = {
  id: 'segment',
  label: 'Segmentation',
  items: [
    {
      id: 'segment',
      label: 'Segment',
      tooltip: 'Segmentation tools',
      icon: Shapes,
      kind: 'menu',
      narrow: 'menu',
      items: [
        segmentTool(
          'brush',
          'Brush (B)',
          'Brush: drag to paint the active segment (B)',
          Paintbrush,
        ),
        segmentTool(
          'smartBrush',
          'Smart brush',
          'Smart brush: paints only pixels inside the threshold range set in the Segments panel',
          WandSparkles,
        ),
      ],
    },
  ],
};

/** `Delete ▾` additions: the eraser tool and clearing the open study's segments. */
export const ERASER_ITEM = segmentTool(
  'eraser',
  'Eraser (E)',
  'Eraser: drag to remove painted segments (E)',
  Eraser,
);

export const CLEAR_SEGMENTS_ITEM: ToolbarItemSpec = {
  id: 'clear-segments',
  label: 'Clear segments',
  tooltip: 'Remove every segment of this image',
  icon: BrushCleaning,
  kind: 'action',
  run: (ctx) => ctx.segments.clear(),
  isEnabled: (ctx) => ctx.viewer !== null && ctx.segments.count > 0,
};
