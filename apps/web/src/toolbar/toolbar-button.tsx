import { ChevronDown } from 'lucide-react';
import { forwardRef, type ComponentPropsWithoutRef, type FocusEvent } from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '../components/ui/tooltip';
import { cn } from '../lib/utils';
import type { ToolbarItem } from './toolbar-types';

// Desktop: icon above a short label (OHIF). Below 900px: icon-only 44px
// targets; the label stays in the DOM (sr-only) so the accessible name is the
// same at every width and the tooltip shows it to sighted users.
const base =
  'relative inline-flex shrink-0 flex-col items-center justify-center gap-1 rounded-md px-2 text-foreground/85 outline-none select-none ' +
  'transition-colors duration-150 hover:bg-white/8 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-black ' +
  'disabled:pointer-events-none disabled:opacity-35 aria-pressed:text-primary aria-expanded:text-primary ' +
  'h-14 min-w-14 max-[899px]:size-11 max-[899px]:min-w-11 max-[899px]:px-0';

type Props = Omit<ComponentPropsWithoutRef<'button'>, 'children'> & {
  item: ToolbarItem;
  /** Controlled tooltip (the menu button hides it while its menu is open). */
  tooltipOpen?: boolean;
  onTooltipOpenChange?(open: boolean): void;
};

/**
 * Radix opens a tooltip on any focus. Focus handed back programmatically after a
 * pointer action (closing the drawer, a menu) is not focus-visible: skip it there.
 */
function suppressPointerFocusTooltip(e: FocusEvent<HTMLButtonElement>) {
  try {
    if (!e.currentTarget.matches(':focus-visible')) e.preventDefault();
  } catch {
    // Selector unsupported (old engines, jsdom): keep the tooltip.
  }
}

export const ToolbarButton = forwardRef<HTMLButtonElement, Props>(function ToolbarButton(
  { item, className, tooltipOpen, onTooltipOpenChange, onFocus, ...props },
  ref,
) {
  const Icon = item.icon;
  const controlled =
    tooltipOpen === undefined ? {} : { open: tooltipOpen, onOpenChange: onTooltipOpenChange };
  return (
    <Tooltip {...controlled}>
      <TooltipTrigger asChild>
        <button
          ref={ref}
          type="button"
          data-toolbar-item={item.id}
          disabled={item.disabled}
          aria-pressed={item.pressed}
          aria-expanded={item.expanded}
          aria-controls={item.controls}
          data-attention={item.attention ? true : undefined}
          className={cn(base, className)}
          onFocus={(e) => {
            onFocus?.(e);
            suppressPointerFocusTooltip(e);
          }}
          {...props}
        >
          <Icon aria-hidden="true" strokeWidth={1.75} className="size-6 max-[899px]:size-5" />
          <span className="flex items-center gap-0.5 text-[12px] leading-none font-medium whitespace-nowrap max-[899px]:sr-only">
            {item.label}
            {item.kind === 'menu' && (
              <ChevronDown aria-hidden="true" strokeWidth={2.25} className="size-3" />
            )}
          </span>
          {item.attention && (
            <span
              aria-hidden="true"
              className="absolute top-1.5 right-2 size-2 rounded-full bg-warning ring-2 ring-black"
            />
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{item.tooltip}</TooltipContent>
    </Tooltip>
  );
});
