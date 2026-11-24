import { useCallback, useState } from 'react';
import { NARROW_QUERY, WIDE_QUERY, useMediaQuery } from '@/lib/viewport';

/**
 * How the review panel is laid out:
 * - `push`    >= 1280px: beside the viewer (the viewport narrows), open by default;
 * - `overlay` 900-1279px: floats over the viewer's right edge, closed by default;
 * - `sheet`   < 900px: bottom sheet, closed by default.
 */
export type ReviewMode = 'push' | 'overlay' | 'sheet';

export const WORKLIST_DRAWER_ID = 'worklist-drawer';
export const REVIEW_PANEL_ID = 'review-panel';

export function useReviewMode(): ReviewMode {
  const wide = useMediaQuery(WIDE_QUERY, true);
  const narrow = useMediaQuery(NARROW_QUERY, false);
  if (narrow) return 'sheet';
  return wide ? 'push' : 'overlay';
}

export type LayoutState = {
  mode: ReviewMode;
  hasSelection: boolean;
  worklistOpen: boolean;
  /** Effective state: never open without a selected study. */
  reviewOpen: boolean;
  openWorklist(): void;
  closeWorklist(): void;
  toggleWorklist(): void;
  openReview(): void;
  closeReview(): void;
  toggleReview(): void;
};

/**
 * Open/closed state of the worklist drawer and the review panel.
 * No selection -> the drawer is open (the first screen is the worklist);
 * selecting a study closes it; clearing the selection opens it again.
 * Only one floating surface at a time: opening the drawer closes an
 * overlay/sheet review panel and vice versa (the push panel is not floating).
 */
export function useLayoutState(selectedStudyId: string | null): LayoutState {
  const mode = useReviewMode();
  const hasSelection = selectedStudyId !== null;
  const [worklistOpen, setWorklistOpen] = useState(!hasSelection);
  const [reviewWanted, setReviewWanted] = useState(mode === 'push');
  const [seen, setSeen] = useState({ id: selectedStudyId, mode });

  // Adjust state while rendering (not in an effect) so no frame shows the
  // drawer over a freshly selected study.
  if (seen.id !== selectedStudyId || seen.mode !== mode) {
    if (seen.id !== selectedStudyId) setWorklistOpen(selectedStudyId === null);
    if (seen.mode !== mode) setReviewWanted(mode === 'push');
    setSeen({ id: selectedStudyId, mode });
  }

  const floating = mode !== 'push';
  const openWorklist = useCallback(() => {
    setWorklistOpen(true);
    if (floating) setReviewWanted(false);
  }, [floating]);
  const closeWorklist = useCallback(() => setWorklistOpen(false), []);
  const openReview = useCallback(() => {
    setReviewWanted(true);
    if (floating) setWorklistOpen(false);
  }, [floating]);
  const closeReview = useCallback(() => setReviewWanted(false), []);

  const reviewOpen = reviewWanted && hasSelection;
  return {
    mode,
    hasSelection,
    worklistOpen,
    reviewOpen,
    openWorklist,
    closeWorklist,
    toggleWorklist: worklistOpen ? closeWorklist : openWorklist,
    openReview,
    closeReview,
    toggleReview: reviewOpen ? closeReview : openReview,
  };
}
