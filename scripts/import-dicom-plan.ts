/**
 * Pure selection logic for the local DICOM import. No I/O, no DICOM parsing:
 * it only sees the allowlisted technical metadata produced by the reader.
 */

export const SUPPORTED_TRANSFER_SYNTAXES: readonly string[] = [
  '1.2.840.10008.1.2', // implicit VR little endian
  '1.2.840.10008.1.2.1', // explicit VR little endian
  '1.2.840.10008.1.2.4.50', // JPEG baseline
  '1.2.840.10008.1.2.4.51', // JPEG extended
  '1.2.840.10008.1.2.4.57', // JPEG lossless
  '1.2.840.10008.1.2.4.70', // JPEG lossless SV1
  '1.2.840.10008.1.2.4.80', // JPEG-LS lossless
  '1.2.840.10008.1.2.4.81', // JPEG-LS near-lossless
  '1.2.840.10008.1.2.4.90', // JPEG 2000 lossless
  '1.2.840.10008.1.2.4.91', // JPEG 2000
  '1.2.840.10008.1.2.5', // RLE
];

export const DEFAULT_MODALITIES: readonly string[] = ['CT', 'MR', 'CR', 'US', 'DX', 'OT', 'NM'];

/** Technical metadata of one file. Never contains patient-identifying data. */
export interface DicomMeta {
  modality: string;
  rows: number | null;
  columns: number | null;
  frames: number;
  photometric: string;
  transferSyntax: string;
  studyDate: string;
}

export interface Candidate {
  /** Absolute source path with forward slashes. */
  sourcePath: string;
  /** Index of the command-line root directory the file was found under. */
  rootIndex: number;
  /** Immediate parent directory, the series key. */
  series: string;
  meta: DicomMeta;
}

export type SkipReason =
  | 'unreadable'
  | 'not-an-image'
  | 'multi-frame'
  | 'not-monochrome'
  | 'unsupported-transfer-syntax'
  | 'modality-filtered';

export interface PlanOptions {
  limit: number;
  perSeries: number;
  modalities: readonly string[];
  transferSyntaxes: readonly string[];
}

export function classify(meta: DicomMeta, options: PlanOptions): SkipReason | null {
  if (meta.rows === null || meta.columns === null || meta.rows <= 0 || meta.columns <= 0) {
    return 'not-an-image';
  }
  if (meta.frames > 1) return 'multi-frame';
  if (meta.photometric !== 'MONOCHROME1' && meta.photometric !== 'MONOCHROME2') {
    return 'not-monochrome';
  }
  if (!options.transferSyntaxes.includes(meta.transferSyntax)) {
    return 'unsupported-transfer-syntax';
  }
  if (!options.modalities.includes(meta.modality.toUpperCase())) return 'modality-filtered';
  return null;
}

const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** K evenly spaced indexes into n items; K=1 gives the middle one. */
export function evenlySpacedIndexes(n: number, k: number): number[] {
  const count = Math.min(Math.max(k, 1), n);
  return Array.from({ length: count }, (_, j) => Math.floor(((j + 0.5) * n) / count));
}

interface Series {
  modality: string;
  picks: Candidate[];
}

function seriesForRoot(files: Candidate[], perSeries: number): Series[] {
  const groups = new Map<string, Candidate[]>();
  for (const f of files) groups.set(f.series, [...(groups.get(f.series) ?? []), f]);
  const series: Series[] = [...groups.entries()]
    .sort(([a], [b]) => compare(a, b))
    .map(([, list]) => {
      const sorted = [...list].sort((a, b) => compare(a.sourcePath, b.sourcePath));
      return {
        modality: sorted[0]?.meta.modality.toUpperCase() ?? '',
        picks: evenlySpacedIndexes(sorted.length, perSeries).map((i) => sorted[i] as Candidate),
      };
    });
  // Interleave modalities so a small limit still gets variety from one folder.
  const byModality = new Map<string, Series[]>();
  for (const s of series) byModality.set(s.modality, [...(byModality.get(s.modality) ?? []), s]);
  const queues = [...byModality.values()];
  const ordered: Series[] = [];
  for (let round = 0; ordered.length < series.length; round += 1) {
    for (const q of queues) if (q[round]) ordered.push(q[round] as Series);
  }
  return ordered;
}

/** Picks files: middle slice per series, round-robin across roots, stopping at the limit. */
export function planSelection(candidates: Candidate[], options: PlanOptions): Candidate[] {
  const eligible = candidates.filter((c) => classify(c.meta, options) === null);
  const rootIndexes = [...new Set(eligible.map((c) => c.rootIndex))].sort((a, b) => a - b);
  const queues = rootIndexes.map((r) =>
    seriesForRoot(
      eligible.filter((c) => c.rootIndex === r),
      options.perSeries,
    ),
  );
  const picked: Candidate[] = [];
  for (let round = 0; picked.length < options.limit; round += 1) {
    let progressed = false;
    for (const q of queues) {
      const next = q[round];
      if (!next) continue;
      progressed = true;
      for (const c of next.picks) {
        if (picked.length < options.limit) picked.push(c);
      }
    }
    if (!progressed) break;
  }
  return picked;
}

const LOCAL_ID = /^local-(\d+)$/;

export function formatStudyId(n: number): string {
  return `local-${String(n).padStart(3, '0')}`;
}

/** First free number after the highest existing local-NNN id. */
export function nextLocalNumber(existingIds: readonly string[]): number {
  let max = 0;
  for (const id of existingIds) {
    const m = LOCAL_ID.exec(id);
    if (m?.[1]) max = Math.max(max, Number(m[1]));
  }
  return max + 1;
}

export function localNumber(id: string): number | null {
  const m = LOCAL_ID.exec(id);
  return m?.[1] ? Number(m[1]) : null;
}

const BASE_TIME_MS = Date.parse('2026-11-01T09:00:00Z');

/** Synthetic, deterministic: one minute per local study number. */
export function syntheticCreatedAt(n: number): Date {
  return new Date(BASE_TIME_MS + (n - 1) * 60_000);
}
