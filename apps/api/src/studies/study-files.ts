import path from 'node:path';
import { ApiError } from '../common/api-error';

// Fixtures live at <repo>/fixtures. Both src/studies (ts-node/vitest) and
// dist/studies (nest build, rootDir=src) sit exactly four levels below the repo
// root, so a fixed relative hop from __dirname is deterministic and independent
// of process.cwd().
const FIXTURES_DIR = path.resolve(__dirname, '../../../../fixtures');

export type FixtureKey = 'gradient' | 'checkerboard' | 'corrupt';

export const FIXTURE_FILES: Record<FixtureKey, string> = {
  gradient: path.join(FIXTURES_DIR, 'gradient.dcm'),
  checkerboard: path.join(FIXTURES_DIR, 'checkerboard.dcm'),
  corrupt: path.join(FIXTURES_DIR, 'corrupt.dcm'),
};

/** Maps a stored fileKey to an absolute path; never builds paths from input. */
export function resolveStudyFile(fileKey: string): string {
  if (!Object.prototype.hasOwnProperty.call(FIXTURE_FILES, fileKey)) {
    throw new ApiError(404, 'STUDY_NOT_FOUND', 'Study not found');
  }
  return FIXTURE_FILES[fileKey as FixtureKey];
}
