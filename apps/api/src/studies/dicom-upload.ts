import dicomParser from 'dicom-parser';
import { ApiError } from '../common/api-error';

export const MAX_UPLOAD_BYTES = 64 * 1024 * 1024;

// Transfer syntaxes the browser viewer can decode (kept in step with scripts/import-dicom-plan.ts).
const SUPPORTED_TRANSFER_SYNTAXES = new Set([
  '1.2.840.10008.1.2',
  '1.2.840.10008.1.2.1',
  '1.2.840.10008.1.2.4.50',
  '1.2.840.10008.1.2.4.51',
  '1.2.840.10008.1.2.4.57',
  '1.2.840.10008.1.2.4.70',
  '1.2.840.10008.1.2.4.80',
  '1.2.840.10008.1.2.4.81',
  '1.2.840.10008.1.2.4.90',
  '1.2.840.10008.1.2.4.91',
  '1.2.840.10008.1.2.5',
]);
const MODALITIES = new Set(['CT', 'MR', 'CR', 'US', 'DX', 'OT', 'NM']);

function reject(message: string): ApiError {
  return new ApiError(400, 'VALIDATION_ERROR', message);
}

/**
 * Validates an uploaded buffer as a single-frame, monochrome DICOM image and returns
 * its modality. Reads only technical tags; no patient-identifying tag is requested.
 */
export function validateDicomUpload(bytes: Buffer): { modality: string } {
  if (bytes.length === 0) throw reject('The file is empty');
  let ds: dicomParser.DataSet;
  try {
    ds = dicomParser.parseDicom(bytes);
  } catch {
    throw reject('The file is not a readable DICOM file');
  }
  if (!ds.elements.x7fe00010 || !ds.elements.x00280010 || !ds.elements.x00280011) {
    throw reject('The DICOM file has no image data');
  }
  const str = (tag: string): string => (ds.string(tag) ?? '').trim();
  const frames = Number(str('x00280008'));
  if (Number.isFinite(frames) && frames > 1) throw reject('Multi-frame DICOM is not supported');
  const photometric = str('x00280004');
  if (photometric !== 'MONOCHROME1' && photometric !== 'MONOCHROME2') {
    throw reject('Only monochrome DICOM images are supported');
  }
  const transferSyntax = str('x00020010') || '1.2.840.10008.1.2';
  if (!SUPPORTED_TRANSFER_SYNTAXES.has(transferSyntax)) {
    throw reject('This DICOM compression format is not supported');
  }
  const modality = str('x00080060').toUpperCase();
  if (!MODALITIES.has(modality)) throw reject(`Unsupported modality "${modality || 'unknown'}"`);
  return { modality };
}
