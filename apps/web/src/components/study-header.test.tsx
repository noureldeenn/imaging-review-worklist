import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeStudy } from '../test/handlers';
import { StudyHeader } from './study-header';

function Pane({ id }: { id: string }) {
  return (
    <section aria-label="Study viewer">
      <StudyHeader study={makeStudy(Number(id.slice(-3)))} owner="none">
        <button type="button">Claim</button>
      </StudyHeader>
    </section>
  );
}

describe('StudyHeader focus (narrow viewport)', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'matchMedia',
      (query: string) =>
        ({
          matches: query === '(max-width: 899px)',
          media: query,
          addEventListener: () => undefined,
          removeEventListener: () => undefined,
        }) as unknown as MediaQueryList,
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not steal focus from Claim when re-rendered with the same study', () => {
    const { rerender } = render(<Pane id="study-002" />);
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: /study-002/ }));
    const claim = screen.getByRole('button', { name: 'Claim' });
    claim.focus();
    rerender(<Pane id="study-002" />);
    expect(document.activeElement).toBe(claim);
  });

  it('does not move focus when the user was already inside the pane on mount', () => {
    const outside = document.createElement('button');
    document.body.append(outside);
    const { rerender } = render(<Pane id="study-002" />);
    screen.getByRole('button', { name: 'Claim' }).focus();
    rerender(<Pane id="study-002" />);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Claim' }));
    outside.remove();
  });

  it('moves focus to the heading when a different study opens', () => {
    const { rerender } = render(<Pane id="study-002" />);
    screen.getByRole('button', { name: 'Claim' }).focus();
    rerender(<Pane id="study-003" />);
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: /study-003/ }));
  });
});
