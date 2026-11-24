import { Check } from 'lucide-react';
import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type MutableRefObject,
} from 'react';
import { useDismiss } from '../layout/use-dismiss';
import { ToolbarButton } from './toolbar-button';
import type { ToolbarItem } from './toolbar-types';

type Props = {
  item: ToolbarItem;
  tabIndex: number;
  onFocus(): void;
};

/**
 * Menu button (WAI-ARIA APG): Enter, Space or ArrowDown open the menu on its
 * first item, ArrowUp on its last; Up/Down/Home/End move; Enter/Space run the
 * item and close; Esc or Tab close and return focus to the button; a pointer-down
 * outside closes it.
 */
export const ToolbarMenu = forwardRef<HTMLButtonElement, Props>(function ToolbarMenu(
  { item, tabIndex, onFocus },
  forwardedRef,
) {
  const [open, setOpen] = useState(false);
  const [tooltip, setTooltip] = useState(false);
  const focusOnOpen = useRef<'first' | 'last'>('first');
  const wrapper = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement | null>(null);
  const menu = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const items = item.items ?? [];

  const setButton = (el: HTMLButtonElement | null) => {
    button.current = el;
    if (typeof forwardedRef === 'function') forwardedRef(el);
    else if (forwardedRef)
      (forwardedRef as MutableRefObject<HTMLButtonElement | null>).current = el;
  };
  const enabledItems = () =>
    Array.from(
      menu.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]:not(:disabled)') ?? [],
    );
  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) button.current?.focus();
  };
  const show = (where: 'first' | 'last') => {
    focusOnOpen.current = where;
    setTooltip(false);
    setOpen(true);
  };

  useDismiss({ active: open, ref: wrapper, onDismiss: () => close(false) });
  useEffect(() => {
    if (!open) return;
    const list = enabledItems();
    (focusOnOpen.current === 'first' ? list[0] : list.at(-1))?.focus();
  }, [open]);
  // A disabled menu (no image) must not stay open.
  useEffect(() => {
    if (item.disabled) setOpen(false);
  }, [item.disabled]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const fromButton = e.target === button.current;
    if (open && (e.key === 'Escape' || e.key === 'Tab')) {
      e.preventDefault();
      e.stopPropagation();
      close(true);
      return;
    }
    if (fromButton) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        show(e.key === 'ArrowDown' ? 'first' : 'last');
      }
      return; // Left/Right/Home/End bubble to the toolbar's roving focus.
    }
    const list = enabledItems();
    const index = list.indexOf(document.activeElement as HTMLElement);
    const go = (i: number) => list[(i + list.length) % list.length]?.focus();
    if (e.key === 'ArrowDown') go(index + 1);
    else if (e.key === 'ArrowUp') go(index - 1);
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(list.length - 1);
    else if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    // Inside the menu the toolbar's arrow handling must not run.
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <div ref={wrapper} className="relative" onKeyDown={onKeyDown}>
      <ToolbarButton
        ref={setButton}
        item={item}
        tabIndex={tabIndex}
        onFocus={onFocus}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        tooltipOpen={tooltip && !open}
        onTooltipOpenChange={setTooltip}
        onClick={() => (open ? close(true) : show('first'))}
      />
      {open && (
        <div
          ref={menu}
          id={menuId}
          role="menu"
          aria-label={item.tooltip}
          className="absolute top-full right-0 z-50 mt-1 flex max-h-[calc(100dvh-7rem)] min-w-56 flex-col overflow-y-auto overscroll-contain rounded-md border border-white/10 bg-popover p-1 shadow-xl shadow-black/60 max-[899px]:right-0"
        >
          {items.map((child) => {
            const Icon = child.icon;
            // A drag tool moved into the menu is a radio item (one tool is active).
            const radio = child.kind === 'tool';
            const checkable = radio || child.checked !== undefined;
            const checked = radio ? child.pressed === true : child.checked;
            return (
              <button
                key={child.id}
                type="button"
                role={radio ? 'menuitemradio' : checkable ? 'menuitemcheckbox' : 'menuitem'}
                aria-checked={checkable ? checked : undefined}
                tabIndex={-1}
                disabled={child.disabled}
                title={child.tooltip}
                onClick={() => {
                  child.onSelect();
                  close(true);
                }}
                className="flex min-h-9 items-center gap-3 rounded-sm px-2.5 text-left text-sm text-foreground/90 outline-none hover:bg-white/8 focus-visible:bg-primary/15 focus-visible:text-foreground disabled:opacity-40 max-[899px]:min-h-11"
              >
                <Icon aria-hidden="true" strokeWidth={1.75} className="size-4.5 shrink-0" />
                <span className="flex-1">{child.label}</span>
                {checkable && (
                  <Check
                    aria-hidden="true"
                    className={checked ? 'size-4 text-primary' : 'size-4 opacity-0'}
                  />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
});
