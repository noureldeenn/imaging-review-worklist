import type { StudyStatus } from '@prisma/client';

export interface SeedReviewer {
  id: string;
  name: string;
}

export interface SeedStudy {
  id: string;
  modality: string;
  createdAt: Date;
  status: StudyStatus;
  ownerId: string | null;
  reviewNote: string | null;
  fileKey: string;
}

export const SEED_REVIEWERS: SeedReviewer[] = [
  { id: 'reviewer-a', name: 'Reviewer A' },
  { id: 'reviewer-b', name: 'Reviewer B' },
];

const BASE_TIME = Date.parse('2026-10-07T09:00:00Z');

type Row = [string, string, string, StudyStatus, string | null, string | null];

const ROWS: Row[] = [
  ['study-001', 'OT', 'gradient', 'Unassigned', null, null],
  ['study-002', 'OT', 'checkerboard', 'Unassigned', null, null],
  ['study-003', 'OT', 'corrupt', 'Unassigned', null, null],
  ['study-004', 'CT', 'gradient', 'InReview', 'reviewer-a', null],
  ['study-005', 'MR', 'checkerboard', 'InReview', 'reviewer-b', null],
  ['study-006', 'CT', 'gradient', 'Completed', 'reviewer-a', 'Seeded complete'],
  ['study-007', 'MR', 'checkerboard', 'Completed', 'reviewer-b', 'Seeded complete'],
  ['study-008', 'OT', 'gradient', 'Unassigned', null, null],
];

export const SEED_STUDIES: SeedStudy[] = ROWS.map(
  ([id, modality, fileKey, status, ownerId, reviewNote], i) => ({
    id,
    modality,
    createdAt: new Date(BASE_TIME + i * 60_000),
    status,
    ownerId,
    reviewNote,
    fileKey,
  }),
);
