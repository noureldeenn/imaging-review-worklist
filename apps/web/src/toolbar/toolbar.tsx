import { Fragment, useRef, useState, type KeyboardEvent } from 'react';
import { ToolbarButton } from './toolbar-button';
import { ToolbarMenu } from './toolbar-menu';
import type { ToolbarGroup } from './toolbar-types';

// 900-1099px: tighter spacing so the full desktop row (with the measurement
// tools) still fits without scrolling.
const separator =
  'mx-1 h-9 w-px shrink-0 self-center bg-white/15 max-[1099px]:mx-0 max-[899px]:hidden';

/**
 * Renders resolved toolbar groups as one WAI-ARIA toolbar with a roving tab
 * stop: Tab enters at the last focused (or first enabled) item, Left/Right
 * move between enabled items (wrapping), Home/End jump to the ends.
 */
export function Toolbar({ groups, label }: { groups: ToolbarGroup[]; label: string }) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const refs = useRef(new Map<string, HTMLButtonElement>());
  const order = groups
    .flatMap((g) => g.items)
    .filter((i) => !i.disabled)
    .map((i) => i.id);
  const tabStop = activeId !== null && order.includes(activeId) ? activeId : order[0];

  const register = (id: string) => (el: HTMLButtonElement | null) => {
    if (el) refs.current.set(id, el);
    else refs.current.delete(id);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (order.length === 0) return;
    const current = (e.target as HTMLElement).closest<HTMLElement>('[data-toolbar-item]');
    const index = current ? order.indexOf(current.dataset['toolbarItem'] ?? '') : -1;
    if (index < 0) return;
    let next: number;
    if (e.key === 'ArrowRight') next = (index + 1) % order.length;
    else if (e.key === 'ArrowLeft') next = (index - 1 + order.length) % order.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = order.length - 1;
    else return;
    e.preventDefault();
    const id = order[next];
    if (id === undefined) return;
    setActiveId(id);
    refs.current.get(id)?.focus();
  };

  return (
    <div
      role="toolbar"
      aria-label={label}
      aria-orientation="horizontal"
      onKeyDown={onKeyDown}
      className="flex min-w-0 items-center gap-0.5 max-[899px]:justify-between max-[899px]:gap-1"
    >
      {groups.map((group, g) => (
        <Fragment key={group.id}>
          {g > 0 && <span aria-hidden="true" className={separator} />}
          <div
            role="group"
            aria-label={group.label}
            className="flex items-center gap-0.5 max-[899px]:gap-1"
          >
            {group.items.map((item) =>
              item.kind === 'menu' ? (
                <ToolbarMenu
                  key={item.id}
                  ref={register(item.id)}
                  item={item}
                  tabIndex={item.id === tabStop ? 0 : -1}
                  onFocus={() => setActiveId(item.id)}
                />
              ) : (
                <ToolbarButton
                  key={item.id}
                  ref={register(item.id)}
                  item={item}
                  tabIndex={item.id === tabStop ? 0 : -1}
                  onFocus={() => setActiveId(item.id)}
                  onClick={item.onSelect}
                />
              ),
            )}
          </div>
        </Fragment>
      ))}
    </div>
  );
}
