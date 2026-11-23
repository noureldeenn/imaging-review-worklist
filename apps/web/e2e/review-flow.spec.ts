import { expect, test, type Page } from '@playwright/test';
import { collectErrors, gotoWorklist, openStudy } from './helpers';

// Two reviewers against the real stack. globalSetup reseeds once per run; the
// viewer specs only view studies (they never assert status), so completing
// study-008 and study-001 here does not affect them.

let errors: string[] = [];

test.beforeEach(async ({ page }) => {
  errors = collectErrors(page);
  await gotoWorklist(page);
});

test.afterEach(() => {
  expect(errors).toEqual([]);
});

async function switchReviewer(page: Page, id: 'reviewer-a' | 'reviewer-b'): Promise<void> {
  await page.getByRole('combobox', { name: 'Reviewer', exact: true }).selectOption(id);
}

async function claimAndComplete(page: Page, note: string): Promise<void> {
  await page.getByRole('button', { name: 'Claim' }).click();
  await expect(page.getByText('Study claimed.')).toBeVisible();
  await page.getByRole('textbox', { name: 'Review note', exact: true }).fill(note);
  await page.getByRole('button', { name: 'Complete' }).click();
  await expect(page.getByText('Study completed.')).toBeVisible();
}

function savedNote(page: Page) {
  return page.getByRole('region', { name: 'Saved review note' });
}

test('both reviewers write notes and each can read the other’s saved note', async ({ page }) => {
  const noteA = 'Reviewer A: no acute findings.\nRecommend routine follow-up.';
  const noteB = 'Reviewer B: gradient phantom looks uniform.';

  // Reviewer A claims and completes study-008.
  await openStudy(page, 'study-008');
  await expect(page.getByText('Claim this study to write a review note.')).toBeVisible();
  await claimAndComplete(page, noteA);
  await expect(savedNote(page).getByText('Completed by you')).toBeVisible();
  await expect(savedNote(page).getByText('Reviewer A: no acute findings.')).toBeVisible();

  // Reviewer B sees A's note read-only.
  await switchReviewer(page, 'reviewer-b');
  await openStudy(page, 'study-008');
  await expect(savedNote(page).getByText('Completed by reviewer-a')).toBeVisible();
  await expect(savedNote(page).getByText('Recommend routine follow-up.')).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Review note', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Complete' })).toHaveCount(0);

  // Reviewer B claims and completes study-001.
  await openStudy(page, 'study-001');
  await claimAndComplete(page, noteB);
  await expect(savedNote(page).getByText('Completed by you')).toBeVisible();

  // Reviewer A sees B's note.
  await switchReviewer(page, 'reviewer-a');
  await openStudy(page, 'study-001');
  await expect(savedNote(page).getByText('Completed by reviewer-b')).toBeVisible();
  await expect(savedNote(page).getByText(noteB)).toBeVisible();

  // study-005 is seeded InReview for reviewer-b: A gets an explanation, not a form.
  await openStudy(page, 'study-005');
  await expect(
    page.getByText('In review by reviewer-b. Only the owner can complete it.'),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Complete' })).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: 'Review note', exact: true })).toHaveCount(0);
});
