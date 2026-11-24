import {
  Contrast,
  FlipHorizontal2,
  FlipVertical2,
  Hand,
  Maximize,
  RotateCcw,
  RotateCw,
  Search,
  SunMedium,
  ZoomIn,
  ZoomOut,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '../components/ui/tooltip';
import { cn } from '../lib/utils';
import { ZOOM_STEP } from './viewer-math';
import { ShortcutsHelp } from './viewer-shortcuts';
import type { ViewTransform, ViewerTool } from './viewport-controller';

export type ToolbarActions = {
  zoomBy(factor: number): void;
  rotateBy(degrees: number): void;
  flipH(): void;
  flipV(): void;
  toggleInvert(): void;
  setTool(tool: ViewerTool): void;
  reset(): void;
};

type Props = { view: ViewTransform; disabled: boolean; actions: ToolbarActions };

// 32px icon buttons on desktop, 44px touch targets below 900px.
const iconButton = 'size-8 max-[899px]:size-11';
const pressed =
  'aria-pressed:bg-primary/15 aria-pressed:text-primary aria-pressed:hover:bg-primary/25';
const group = 'flex items-center gap-1';
// Unlabelled visual groups dissolve below 900px so the buttons wrap as one flow.
const flow = 'flex items-center gap-1 max-[899px]:contents';
const divider = 'hidden h-6 w-px bg-border min-[900px]:block';

function ToolButton(props: {
  label: string;
  hint: string;
  icon: LucideIcon;
  disabled: boolean;
  onClick(): void;
  pressed?: boolean;
}) {
  const { label, hint, icon: Icon, disabled, onClick } = props;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn(iconButton, pressed)}
          aria-label={label}
          aria-pressed={props.pressed}
          disabled={disabled}
          onClick={onClick}
        >
          <Icon aria-hidden="true" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{hint}</TooltipContent>
    </Tooltip>
  );
}

const TOOLS: ReadonlyArray<{ tool: ViewerTool; label: string; hint: string; icon: LucideIcon }> = [
  {
    tool: 'windowLevel',
    label: 'Window/Level tool',
    hint: 'Drag: left/right window, up/down level (W)',
    icon: SunMedium,
  },
  { tool: 'pan', label: 'Pan tool', hint: 'Drag to move the image (P)', icon: Hand },
  { tool: 'zoom', label: 'Zoom tool', hint: 'Drag up/down to zoom (Z)', icon: Search },
];

export function ViewerToolbar({ view, disabled, actions }: Props) {
  return (
    <div
      role="toolbar"
      aria-label="Image tools"
      className="viewer-toolbar flex flex-wrap items-center gap-x-2 gap-y-1"
    >
      <div role="group" aria-label="Drag tool" className={group}>
        {TOOLS.map(({ tool, label, hint, icon }) => (
          <ToolButton
            key={tool}
            label={label}
            hint={hint}
            icon={icon}
            disabled={disabled}
            pressed={view.tool === tool}
            onClick={() => actions.setTool(tool)}
          />
        ))}
      </div>
      <span aria-hidden="true" className={divider} />
      <div className={flow}>
        <ToolButton
          label="Zoom in"
          hint="Zoom in (+)"
          icon={ZoomIn}
          disabled={disabled}
          onClick={() => actions.zoomBy(ZOOM_STEP)}
        />
        <ToolButton
          label="Zoom out"
          hint="Zoom out (-)"
          icon={ZoomOut}
          disabled={disabled}
          onClick={() => actions.zoomBy(1 / ZOOM_STEP)}
        />
        <ToolButton
          label="Rotate left"
          hint="Rotate 90° left (Shift+R)"
          icon={RotateCcw}
          disabled={disabled}
          onClick={() => actions.rotateBy(-90)}
        />
        <ToolButton
          label="Rotate right"
          hint="Rotate 90° right (R)"
          icon={RotateCw}
          disabled={disabled}
          onClick={() => actions.rotateBy(90)}
        />
      </div>
      <span aria-hidden="true" className={divider} />
      <div className={flow}>
        <ToolButton
          label="Flip horizontal"
          hint="Flip horizontal (H)"
          icon={FlipHorizontal2}
          disabled={disabled}
          pressed={view.flipH}
          onClick={actions.flipH}
        />
        <ToolButton
          label="Flip vertical"
          hint="Flip vertical (V)"
          icon={FlipVertical2}
          disabled={disabled}
          pressed={view.flipV}
          onClick={actions.flipV}
        />
        <ToolButton
          label="Invert"
          hint="Invert greyscale (I)"
          icon={Contrast}
          disabled={disabled}
          pressed={view.invert}
          onClick={actions.toggleInvert}
        />
      </div>
      <span aria-hidden="true" className={divider} />
      <div className={flow}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={disabled}
              onClick={actions.reset}
            >
              <Maximize aria-hidden="true" />
              Fit / Reset
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            Restore zoom, pan, rotation, flips, invert and window/level (0)
          </TooltipContent>
        </Tooltip>
        <ShortcutsHelp />
      </div>
    </div>
  );
}
