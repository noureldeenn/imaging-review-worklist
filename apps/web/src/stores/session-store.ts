import { create } from 'zustand';
import type { StudyFilters } from '../api/client';

export type SessionState = {
  reviewerId: string;
  selectedStudyId: string | null;
  filters: StudyFilters;
  drafts: Record<string, string>;
  blocked: Record<string, true>;
  setReviewer: (id: string) => void;
  selectStudy: (id: string | null) => void;
  setFilters: (filters: StudyFilters) => void;
  setDraft: (id: string, text: string) => void;
  block: (id: string) => void;
  unblock: (id: string) => void;
};

export const useSessionStore = create<SessionState>((set) => ({
  reviewerId: 'reviewer-a',
  selectedStudyId: null,
  filters: {},
  drafts: {},
  blocked: {},
  setReviewer: (id) => set({ reviewerId: id }),
  selectStudy: (id) => set({ selectedStudyId: id }),
  setFilters: (filters) => set({ filters }),
  setDraft: (id, text) => set((s) => ({ drafts: { ...s.drafts, [id]: text } })),
  block: (id) => set((s) => ({ blocked: { ...s.blocked, [id]: true } })),
  unblock: (id) =>
    set((s) => {
      const rest = { ...s.blocked };
      delete rest[id];
      return { blocked: rest };
    }),
}));
