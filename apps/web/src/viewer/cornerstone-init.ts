import { getConfiguration, init, setUseCPURendering } from "@cornerstonejs/core";
import dicomImageLoader from "@cornerstonejs/dicom-image-loader";

let ready: Promise<void> | null = null;

/**
 * Idempotent one-time setup of Cornerstone3D core + the DICOM image loader.
 *
 * CPU rendering is selected before any engine exists: deterministic 2D
 * canvas, no GPU dependency in headless Chromium, same loader/viewport/VOI
 * code path. In 5.x `setUseCPURendering()` also flips the "initialized" flag,
 * so calling it before `init()` would turn `init()` into a no-op and skip the
 * web-worker manager the loader needs. The flag is therefore passed through
 * `init()`'s config and re-asserted right after.
 */
export function initCornerstone(): Promise<void> {
  if (ready === null) {
    ready = Promise.resolve().then(() => {
      const defaults = getConfiguration();
      init({ ...defaults, rendering: { ...defaults.rendering, useCPURendering: true } });
      setUseCPURendering(true, false);
      // Registers the wadouri: scheme and the metadata providers.
      dicomImageLoader.init({ maxWebWorkers: 1 });
    });
    ready.catch(() => {
      ready = null;
    });
  }
  return ready;
}
