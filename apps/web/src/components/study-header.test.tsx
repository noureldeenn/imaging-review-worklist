import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { makeStudy } from '../test/handlers';
import { StudyHeader } from './study-header';

function Pane({ id }: { id: string }) {
  return (
    <section aria-label="Review">
      <StudyHeader study={makeStudy(Number(id.slice(-3)))} owner="none" autoFocus>
        <button type="button">Claim</button>
      </StudyHeader>
    </section>
  );
}

// autoFocus: the header sits in an open floating review panel (overlay or bottom sheet).
describe('StudyHeader focus (floating review panel)', () => {
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

describe('StudyHeader focus (push panel)', () => {
  it('never moves focus when not in a floating panel', () => {
    const outside = document.createElement('button');
    document.body.append(outside);
    outside.focus();
    render(
      <section aria-label="Review">
        <StudyHeader study={makeStudy(2)} owner="none">
          <button type="button">Claim</button>
        </StudyHeader>
      </section>,
    );
    expect(document.activeElement).toBe(outside);
    outside.remove();
  });
});
