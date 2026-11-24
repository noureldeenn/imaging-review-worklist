import { metaData } from '@cornerstonejs/core';

export type ViewerState = 'idle' | 'loading' | 'ready' | 'error';
export type ViewerMetadataValue = {
  modality: string;
  studyDate: string;
  rows: number;
  columns: number;
};
export type WindowLevel = { ww: number; wl: number };

export const DECODE_ERROR = 'Could not decode this file (not a valid DICOM image).';
export const INIT_ERROR = 'The image viewer could not start.';
export const VIEWPORT_ID = 'study-viewport';

export const WW_MIN = 1;
export const WW_MAX = 65535;
export const WL_MIN = -32768;
export const WL_MAX = 65535;

type Point3 = [number, number, number];

/** Minimal surface of a StackViewport the hook and the view controller rely on. */
export type StackViewportLike = {
  setStack(imageIds: string[]): Promise<string>;
  render(): void;
  getProperties(): { voiRange?: { lower: number; upper: number }; invert?: boolean };
  setProperties(props: { voiRange?: { lower: number; upper: number }; invert?: boolean }): void;
  resetCamera(): unknown;
  resetProperties(): void;
  getZoom(): number;
  setZoom(zoom: number): void;
  getCamera(): { focalPoint?: Point3; position?: Point3 };
  setCamera(camera: {
    focalPoint?: Point3;
    position?: Point3;
    flipHorizontal?: boolean;
    flipVertical?: boolean;
  }): void;
  canvasToWorld(canvasPos: [number, number]): Point3;
  setViewPresentation(presentation: { rotation?: number }): void;
};

export function imageIdFor(studyId: string): string {
  return `wadouri:/api/studies/${encodeURIComponent(studyId)}/file`;
}

export function formatStudyDate(raw: unknown): string {
  const s = typeof raw === 'string' ? raw.trim() : '';
  const m = /^(\d{4})(\d{2})(\d{2})$/.exec(s);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : s || 'unknown date';
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function clampWindowLevel(ww: number, wl: number): WindowLevel {
  return {
    ww: clamp(Math.round(ww), WW_MIN, WW_MAX),
    wl: clamp(Math.round(wl), WL_MIN, WL_MAX),
  };
}

export function voiRangeFor({ ww, wl }: WindowLevel) {
  return { lower: wl - ww / 2, upper: wl + ww / 2 };
}

export function readWindowLevel(viewport: StackViewportLike): WindowLevel | null {
  const voi = viewport.getProperties().voiRange;
  if (!voi) return null;
  return clampWindowLevel(voi.upper - voi.lower, (voi.upper + voi.lower) / 2);
}

/**
 * Reads exactly the four display fields from the loader's metadata providers.
 * Deliberately never touches patient-identifying modules and never logs.
 */
export function readMetadata(imageId: string): ViewerMetadataValue | null {
  const series = metaData.get('generalSeriesModule', imageId) as { modality?: unknown } | undefined;
  const study = metaData.get('generalStudyModule', imageId) as { studyDate?: unknown } | undefined;
  const pixel = metaData.get('imagePixelModule', imageId) as
    { rows?: unknown; columns?: unknown } | undefined;
  if (!series && !study && !pixel) return null;
  return {
    modality: typeof series?.modality === 'string' ? series.modality : 'unknown',
    studyDate: formatStudyDate(study?.studyDate),
    rows: Number(pixel?.rows ?? 0),
    columns: Number(pixel?.columns ?? 0),
  };
}

/**
 * True when the file is shown inverted as loaded (MONOCHROME1). The CPU
 * renderer applies this through its own viewport flag, which the
 * StackViewport's `invert` property does not reflect. Technical tag only.
 */
export function readBaselineInvert(imageId: string): boolean {
  const pixel = metaData.get('imagePixelModule', imageId) as
    { photometricInterpretation?: unknown } | undefined;
  return pixel?.photometricInterpretation === 'MONOCHROME1';
}
