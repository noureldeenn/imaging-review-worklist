/**
 * Reads ONLY the allowlisted technical tags of a DICOM file. Parsing stops before
 * pixel data, and no patient-identifying tag is ever requested, stored or printed.
 */
import { closeSync, openSync, readFileSync, readSync } from 'node:fs';
import dicomParser from 'dicom-parser';
import type { DicomMeta } from './import-dicom-plan';

export const TAG_ALLOWLIST = {
  modality: 'x00080060',
  rows: 'x00280010',
  columns: 'x00280011',
  numberOfFrames: 'x00280008',
  photometricInterpretation: 'x00280004',
  transferSyntaxUid: 'x00020010',
  studyDate: 'x00080020',
} as const;

const HEAD_BYTES = 256 * 1024;

function readHead(file: string): Uint8Array {
  const fd = openSync(file, 'r');
  try {
    const buf = Buffer.alloc(HEAD_BYTES);
    const n = readSync(fd, buf, 0, HEAD_BYTES, 0);
    return buf.subarray(0, n);
  } finally {
    closeSync(fd);
  }
}

function parse(bytes: Uint8Array): dicomParser.DataSet {
  return dicomParser.parseDicom(bytes, { untilTag: 'x7fe00010' });
}

function metaFrom(ds: dicomParser.DataSet): DicomMeta {
  const str = (tag: string): string => (ds.string(tag) ?? '').trim();
  const frames = Number(str(TAG_ALLOWLIST.numberOfFrames));
  const num = (tag: string): number | null => (ds.elements[tag] ? (ds.uint16(tag) ?? null) : null);
  return {
    modality: str(TAG_ALLOWLIST.modality),
    rows: num(TAG_ALLOWLIST.rows),
    columns: num(TAG_ALLOWLIST.columns),
    frames: Number.isFinite(frames) && frames > 0 ? frames : 1,
    photometric: str(TAG_ALLOWLIST.photometricInterpretation),
    transferSyntax: str(TAG_ALLOWLIST.transferSyntaxUid),
    studyDate: str(TAG_ALLOWLIST.studyDate),
  };
}

/** Returns null when the file cannot be parsed as DICOM. */
export function readDicomMeta(file: string): DicomMeta | null {
  try {
    return metaFrom(parse(readHead(file)));
  } catch {
    // A header larger than the head window: retry on the whole file.
    try {
      return metaFrom(parse(readFileSync(file)));
    } catch {
      return null;
    }
  }
}
