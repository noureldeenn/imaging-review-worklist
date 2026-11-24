import { create } from 'zustand';
import type { ViewTransform, ViewerTool } from './viewport-controller';

/**
 * Commands the app toolbar sends to the mounted viewer. The toolbar lives in
 * the main bundle and must not import the viewer (Cornerstone stays in the
 * lazy chunk), so the viewer publishes these here while it is mounted.
 */
export type ViewerCommands = {
  setTool(tool: ViewerTool): void;
  zoomIn(): void;
  zoomOut(): void;
  rotateLeft(): void;
  rotateRight(): void;
  flipH(): void;
  flipV(): void;
  toggleInvert(): void;
  reset(): void;
};

// Kept in sync with DEFAULT_VIEW without importing the viewer module.
const IDLE_VIEW: ViewTransform = {
  zoom: 1,
  rotation: 0,
  flipH: false,
  flipV: false,
  invert: false,
  tool: 'windowLevel',
};

type BridgeState = {
  /** Null while no viewer is mounted. */
  commands: ViewerCommands | null;
  /** True once the current image is ready (controls enabled). */
  ready: boolean;
  view: ViewTransform;
  publish(next: { commands: ViewerCommands; ready: boolean; view: ViewTransform }): void;
  clear(): void;
};

export const useViewerBridge = create<BridgeState>((set) => ({
  commands: null,
  ready: false,
  view: IDLE_VIEW,
  publish: (next) => set(next),
  clear: () => set({ commands: null, ready: false, view: IDLE_VIEW }),
}));

export { IDLE_VIEW };
