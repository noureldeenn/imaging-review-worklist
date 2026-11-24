import { MASK_BUDGET_BYTES, MAX_MASK_PIXELS, MAX_UNDO_STROKES, type Rect } from './seg-types';

/** One stroke as a sparse diff: the pixels it changed and their previous labels. */
export type StrokeDiff = { indices: Uint32Array; old: Uint8Array; rect: Rect | null };

export type MaskEntry = {
  mask: Uint8Array;
  width: number;
  height: number;
  /** Oldest first; at most MAX_UNDO_STROKES. */
  undo: StrokeDiff[];
};

export type EnsureResult = { entry: MaskEntry; dropped: string[] } | { tooLarge: true };

const diffBytes = (d: StrokeDiff) => d.indices.byteLength + d.old.byteLength;
const entryBytes = (e: MaskEntry) => e.undo.reduce((n, d) => n + diffBytes(d), e.mask.byteLength);

/** Packs a stroke's first-old-value map into typed arrays (5 bytes per changed pixel). */
export function packDiff(diff: Map<number, number>, rect: Rect | null): StrokeDiff {
  const indices = new Uint32Array(diff.size);
  const old = new Uint8Array(diff.size);
  let k = 0;
  diff.forEach((value, index) => {
    indices[k] = index;
    old[k] = value;
    k += 1;
  });
  return { indices, old, rect };
}

/** Writes a diff's previous labels back into the mask (undo, or a cancelled stroke). */
export function restoreDiff(mask: Uint8Array, { indices, old }: StrokeDiff): void {
  for (let k = 0; k < indices.length; k += 1) mask[indices[k] ?? 0] = old[k] ?? 0;
}

/**
 * The label masks of the most recently used studies, within a byte budget
 * (masks plus undo diffs). Map order is the LRU order: oldest first. A study
 * that is evicted loses its mask and undo history; the caller tells the user.
 */
export function createMaskMemory(budget = MASK_BUDGET_BYTES) {
  const entries = new Map<string, MaskEntry>();
  const total = () => [...entries.values()].reduce((n, e) => n + entryBytes(e), 0);
  const touch = (studyId: string, entry: MaskEntry) => {
    entries.delete(studyId);
    entries.set(studyId, entry);
  };
  /** Evicts least recently used studies other than `keep` until within budget. */
  const fit = (keep: string): string[] => {
    const dropped: string[] = [];
    for (const id of [...entries.keys()]) {
      if (total() <= budget) break;
      if (id === keep) continue;
      entries.delete(id);
      dropped.push(id);
    }
    // Still over (one huge study): its oldest undo steps go before anything else.
    const own = entries.get(keep);
    while (own && own.undo.length > 0 && total() > budget) own.undo.shift();
    return dropped;
  };

  return {
    get: (studyId: string): MaskEntry | undefined => entries.get(studyId),
    /** The study's mask (created or resized as needed) and the studies evicted to make room. */
    ensure(studyId: string, width: number, height: number): EnsureResult {
      if (width * height > MAX_MASK_PIXELS || width <= 0 || height <= 0) return { tooLarge: true };
      let entry = entries.get(studyId);
      if (!entry || entry.width !== width || entry.height !== height) {
        entry = { mask: new Uint8Array(width * height), width, height, undo: [] };
      }
      touch(studyId, entry);
      return { entry, dropped: fit(studyId) };
    },
    /** Records a finished stroke (oldest dropped past the cap); returns evicted studies. */
    pushUndo(studyId: string, diff: StrokeDiff): string[] {
      const entry = entries.get(studyId);
      if (!entry) return [];
      entry.undo.push(diff);
      while (entry.undo.length > MAX_UNDO_STROKES) entry.undo.shift();
      touch(studyId, entry);
      return fit(studyId);
    },
    popUndo: (studyId: string): StrokeDiff | undefined => entries.get(studyId)?.undo.pop(),
    clearUndo(studyId: string): void {
      const entry = entries.get(studyId);
      if (entry) entry.undo = [];
    },
    delete: (studyId: string): void => void entries.delete(studyId),
    totalBytes: total,
    studies: (): string[] => [...entries.keys()],
  };
}

export type MaskMemory = ReturnType<typeof createMaskMemory>;
