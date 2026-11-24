import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useSessionStore } from '../stores/session-store';
import { makeStudy } from '../test/handlers';
import { CompletionForm } from './completion-form';

const study = makeStudy(1, { status: 'InReview', ownerId: 'reviewer-a', version: 1 });

function renderWithDraft(draft: string) {
  act(() => useSessionStore.getState().setDraft(study.id, draft));
  render(<CompletionForm study={study} pending={false} onSubmit={() => undefined} />);
}

describe('CompletionForm note length', () => {
  it('allows 1000 characters followed by whitespace (the API trims first)', () => {
    renderWithDraft(`${'a'.repeat(1000)}\n `);
    expect(screen.getByRole('button', { name: 'Complete' })).toBeEnabled();
    expect(screen.getByText('1000/1000')).toBeInTheDocument();
  });

  it('disables Complete at 1001 non-space characters', () => {
    renderWithDraft('a'.repeat(1001));
    expect(screen.getByRole('button', { name: 'Complete' })).toBeDisabled();
  });
});
