// Tests the import planner in scripts/ (pure logic shared with the CLI); this is why
// apps/api/tsconfig.json sets rootDir to ../.. instead of src.
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MODALITIES,
  SUPPORTED_TRANSFER_SYNTAXES,
  classify,
  formatStudyId,
  nextLocalNumber,
  planSelection,
  syntheticCreatedAt,
  type Candidate,
  type DicomMeta,
  type PlanOptions,
} from '../../../scripts/import-dicom-plan';
import { TAG_ALLOWLIST } from '../../../scripts/import-dicom-reader';

const OPTIONS: PlanOptions = {
  limit: 40,
  perSeries: 1,
  modalities: DEFAULT_MODALITIES,
  transferSyntaxes: SUPPORTED_TRANSFER_SYNTAXES,
};

const meta = (over: Partial<DicomMeta> = {}): DicomMeta => ({
  modality: 'CT',
  rows: 512,
  columns: 512,
  frames: 1,
  photometric: 'MONOCHROME2',
  transferSyntax: '1.2.840.10008.1.2.4.57',
  studyDate: '20261001',
  ...over,
});

const file = (root: number, series: string, name: string, over: Partial<DicomMeta> = {}) =>
  ({
    sourcePath: `/src/r${root}/${series}/${name}`,
    rootIndex: root,
    series: `/src/r${root}/${series}`,
    meta: meta(over),
  }) satisfies Candidate;

const series = (root: number, name: string, count: number, over: Partial<DicomMeta> = {}) =>
  Array.from({ length: count }, (_, i) =>
    file(root, name, `i${String(i).padStart(3, '0')}.dcm`, over),
  );

describe('classify', () => {
  it.each([
    ['multi-frame', { frames: 12 }],
    ['not-monochrome', { photometric: 'RGB' }],
    ['not-an-image', { rows: null, columns: null, modality: 'SR' }],
    ['unsupported-transfer-syntax', { transferSyntax: '1.2.840.10008.1.2.4.100' }],
    ['modality-filtered', { modality: 'RTPLAN' }],
  ] as const)('skips %s', (reason, over) => {
    expect(classify(meta(over), OPTIONS)).toBe(reason);
  });

  it('accepts a single-frame monochrome supported file', () => {
    expect(classify(meta(), OPTIONS)).toBeNull();
  });
});

describe('planSelection', () => {
  it('picks the middle slice of a series sorted by filename', () => {
    const picks = planSelection(series(0, 's1', 5).reverse(), OPTIONS);
    expect(picks.map((p) => p.sourcePath)).toEqual(['/src/r0/s1/i002.dcm']);
  });

  it('picks K evenly spaced slices with --per-series', () => {
    const picks = planSelection(series(0, 's1', 9), { ...OPTIONS, perSeries: 3 });
    expect(picks.map((p) => p.sourcePath.slice(-8))).toEqual(['i001.dcm', 'i004.dcm', 'i007.dcm']);
  });

  it('round-robins across roots so a small limit yields variety', () => {
    const all = [
      ...series(0, 'a', 3),
      ...series(0, 'b', 3),
      ...series(1, 'c', 3),
      ...series(2, 'd', 3),
    ];
    const picks = planSelection(all, { ...OPTIONS, limit: 3 });
    expect(new Set(picks.map((p) => p.rootIndex))).toEqual(new Set([0, 1, 2]));
  });

  it('interleaves modalities inside one root', () => {
    const all = [
      ...series(0, 'a', 3),
      ...series(0, 'b', 3),
      ...series(0, 'c', 3, { modality: 'MR' }),
    ];
    const picks = planSelection(all, { ...OPTIONS, limit: 2 });
    expect(picks.map((p) => p.meta.modality).sort()).toEqual(['CT', 'MR']);
  });

  it('respects the limit', () => {
    const all = [...series(0, 'a', 3), ...series(0, 'b', 3), ...series(1, 'c', 3)];
    expect(planSelection(all, { ...OPTIONS, limit: 2 })).toHaveLength(2);
    expect(planSelection(all, { ...OPTIONS, limit: 99 })).toHaveLength(3);
  });

  it('never selects ineligible files', () => {
    const all = [
      ...series(0, 'multi', 3, { frames: 4 }),
      ...series(0, 'rgb', 3, { photometric: 'RGB' }),
      ...series(0, 'sr', 3, { rows: null, columns: null, modality: 'SR' }),
      ...series(0, 'syntax', 3, { transferSyntax: '1.2.840.10008.1.2.4.100' }),
    ];
    expect(planSelection(all, OPTIONS)).toEqual([]);
  });
});

describe('study ids', () => {
  it('continues after existing local ids and ignores others', () => {
    expect(nextLocalNumber(['study-001', 'local-001', 'local-007'])).toBe(8);
    expect(nextLocalNumber(['study-001'])).toBe(1);
  });

  it('zero-pads and spaces creation times a minute apart', () => {
    expect(formatStudyId(8)).toBe('local-008');
    expect(formatStudyId(1234)).toBe('local-1234');
    expect(syntheticCreatedAt(1).toISOString()).toBe('2026-11-01T09:00:00.000Z');
    expect(syntheticCreatedAt(3).toISOString()).toBe('2026-11-01T09:02:00.000Z');
  });
});

describe('PHI guard', () => {
  it('the reader tag allowlist contains no patient name, id or birth date tag', () => {
    const tags = Object.values(TAG_ALLOWLIST) as string[];
    for (const forbidden of ['x00100010', 'x00100020', 'x00100030']) {
      expect(tags).not.toContain(forbidden);
    }
    expect(tags.some((t) => t.startsWith('x0010'))).toBe(false);
  });
});
