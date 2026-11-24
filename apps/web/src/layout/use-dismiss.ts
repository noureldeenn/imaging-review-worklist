import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';

type DismissOptions = {
  /** Listen only while the surface is open (and dismissable). */
  active: boolean;
  /** The surface itself: pointer-downs inside it do not dismiss. */
  ref: RefObject<HTMLElement | null>;
  /** Elements matching this selector (the toggle button) do not dismiss either. */
  ignore?: string;
  onDismiss(): void;
};

/**
 * Esc and outside pointer-down close a floating surface. A keydown that an
 * inner widget already handled (defaultPrevented, e.g. Esc closing a menu)
 * is left alone.
 */
export function useDismiss({ active, ref, ignore, onDismiss }: DismissOptions): void {
  const callback = useRef(onDismiss);
  useLayoutEffect(() => {
    callback.current = onDismiss;
  });

  useEffect(() => {
    if (!active) return undefined;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      e.preventDefault();
      callback.current();
    };
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target;
      if (!(target instanceof Element)) return;
      if (ref.current?.contains(target)) return;
      if (ignore && target.closest(ignore)) return;
      callback.current();
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [active, ref, ignore]);
}

type FocusOptions = {
  open: boolean;
  ref: RefObject<HTMLElement | null>;
  /** Move focus into the surface when it opens after mount. */
  focusOnOpen: boolean;
  /** Where focus goes on open (falls back to the surface itself). */
  initialFocus(): HTMLElement | null;
  /** Where focus returns on close, if it was inside the surface. */
  returnFocus(): HTMLElement | null;
};

/** Focus moves into a surface when it opens and back to its trigger when it closes. */
export function useFocusHandoff({
  open,
  ref,
  focusOnOpen,
  initialFocus,
  returnFocus,
}: FocusOptions): void {
  const previous = useRef(open);
  const handlers = useRef({ initialFocus, returnFocus });
  useLayoutEffect(() => {
    handlers.current = { initialFocus, returnFocus };
  });

  useEffect(() => {
    const was = previous.current;
    previous.current = open;
    const surface = ref.current;
    if (was === open || !surface) return;
    if (open) {
      if (!focusOnOpen || surface.contains(document.activeElement)) return;
      (handlers.current.initialFocus() ?? surface).focus({ preventScroll: true });
      return;
    }
    const active = document.activeElement;
    if (active === null || active === document.body || surface.contains(active)) {
      handlers.current.returnFocus()?.focus({ preventScroll: true });
    }
  }, [open, ref, focusOnOpen]);
}

/** Keeps a closed surface out of the tab order and the accessibility tree. */
export function useInert(ref: RefObject<HTMLElement | null>, inert: boolean): void {
  useEffect(() => {
    const el = ref.current;
    if (el) el.inert = inert;
  }, [ref, inert]);
}
