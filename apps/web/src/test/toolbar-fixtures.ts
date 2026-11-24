import { vi } from 'vitest';
import type { LayoutState } from '../layout/use-layout-state';
import { TOOLBAR_GROUPS, resolveToolbar } from '../toolbar/toolbar-config';
import type { ToolbarContext } from '../toolbar/toolbar-types';
import { IDLE_VIEW, type ViewerCommands } from '../viewer/viewer-bridge';

export function commandsMock(): ViewerCommands {
  return {
    setTool: vi.fn(),
    zoomIn: vi.fn(),
    zoomOut: vi.fn(),
    rotateLeft: vi.fn(),
    rotateRight: vi.fn(),
    flipH: vi.fn(),
    flipV: vi.fn(),
    toggleInvert: vi.fn(),
    reset: vi.fn(),
  };
}

export function layoutStub(
  overrides: Partial<ToolbarContext['layout']> = {},
): LayoutState & { reviewAttention: boolean } {
  return {
    mode: 'push',
    hasSelection: true,
    worklistOpen: false,
    reviewOpen: true,
    openWorklist: vi.fn(),
    closeWorklist: vi.fn(),
    toggleWorklist: vi.fn(),
    openReview: vi.fn(),
    closeReview: vi.fn(),
    toggleReview: vi.fn(),
    revealReview: vi.fn(),
    reviewFocusOnOpen: true,
    feedbackUnseen: false,
    reviewAttention: false,
    ...overrides,
  };
}

export function measurementsStub(
  overrides: Partial<ToolbarContext['measurements']> = {},
): ToolbarContext['measurements'] {
  return { count: 0, hasSelection: false, deleteSelected: vi.fn(), clear: vi.fn(), ...overrides };
}

export function segmentsStub(
  overrides: Partial<ToolbarContext['segments']> = {},
): ToolbarContext['segments'] {
  return { count: 0, clear: vi.fn(), ...overrides };
}

export function groupsFor(ctx: Partial<ToolbarContext> = {}, narrow = false) {
  const full: ToolbarContext = {
    viewer: commandsMock(),
    view: IDLE_VIEW,
    layout: layoutStub(),
    measurements: measurementsStub(),
    segments: segmentsStub(),
    ...ctx,
  };
  return resolveToolbar(TOOLBAR_GROUPS, full, { narrow });
}
