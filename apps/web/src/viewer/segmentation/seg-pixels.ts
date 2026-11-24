import type { PixelSource } from './seg-math';

/**
 * The fields of a Cornerstone 5.19.4 `IImage` the smart brush reads. Under CPU
 * rendering `StackViewport.getCornerstoneImage()` returns the displayed image;
 * `getPixelData()` is its stored sample array (row-major, one sample per pixel
 * for greyscale). The DICOM image loader pre-scales by default: when
 * `preScale.scaled` is true the samples already hold stored x slope + intercept.
 */
type CornerstoneImageLike = {
  getPixelData(): ArrayLike<number>;
  slope?: number;
  intercept?: number;
  color?: boolean;
  numberOfComponents?: number;
  preScale?: { scaled?: boolean };
};

export type PixelViewport = { getCornerstoneImage?(): CornerstoneImageLike | undefined };

/** Greyscale samples of the displayed image, or null (colour, missing, unreadable). */
export function readPixelSource(viewport: PixelViewport): PixelSource | null {
  try {
    const image = viewport.getCornerstoneImage?.();
    if (!image || image.color === true || (image.numberOfComponents ?? 1) > 1) return null;
    const data = image.getPixelData();
    return {
      data,
      slope: Number.isFinite(image.slope) ? (image.slope ?? 1) : 1,
      intercept: Number.isFinite(image.intercept) ? (image.intercept ?? 0) : 0,
      prescaled: image.preScale?.scaled === true,
    };
  } catch {
    return null;
  }
}
