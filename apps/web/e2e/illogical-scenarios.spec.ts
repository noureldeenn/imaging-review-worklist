import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { clickStudy, closeViewer, gotoWorklist, openStudy, openWorklist, stats } from './helpers';

// "Illogical" end-to-end scenarios against the real stack: hostile or nonsensical input,
// contradictory actions, racing browsers, and rapid misuse of the viewer. Each one asserts
// that the system refuses cleanly (right status and code, no 500, no uncaught page error)
// and that nothing it refused changed any state.

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));
const FIXTURES = fileURLToPath(new URL('../../../fixtures/', import.meta.url));
const gradient = readFileSync(`${FIXTURES}gradient.dcm`);
const corrupt = readFileSync(`${FIXTURES}corrupt.dcm`);

test.beforeAll(() => {
  const result = spawnSync('npm -w apps/api run db:reset:test', {
    cwd: repoRoot,
    shell: true,
    stdio: 'inherit',
  });
  if (result.status !== 0) throw new Error(`db:reset:test failed (exit ${String(result.status)})`);
});

let pageErrors: string[] = [];
test.beforeEach(({ page }) => {
  pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(err.stack ?? err.message));
});
test.afterEach(() => {
  expect(pageErrors).toEqual([]);
});

type Study = { id: string; status: string; ownerId: string | null; version: number };

async function study(request: APIRequestContext, id: string): Promise<Study> {
  const res = await request.get(`/api/studies/${id}`);
  expect(res.status()).toBe(200);
  return (await res.json()) as Study;
}

async function expectError(
  res: Awaited<ReturnType<APIRequestContext['post']>>,
  status: number,
  code: string,
): Promise<void> {
  expect(res.status()).toBe(status);
  expect(((await res.json()) as { code: string }).code).toBe(code);
}

test('nonsense and contradictory API calls are refused with the right code and change nothing', async ({
  request,
}) => {
  const [s2, s4, s6] = (await Promise.all(
    ['study-002', 'study-004', 'study-006'].map((id) => study(request, id)),
  )) as [Study, Study, Study];
  const claim = (id: string, data: unknown) => request.post(`/api/studies/${id}/claim`, { data });
  const complete = (id: string, data: unknown) =>
    request.post(`/api/studies/${id}/complete`, { data });
  const ok = { reviewerId: 'reviewer-a', expectedVersion: s2.version };

  // Malformed bodies: 400, never 500.
  for (const bad of [
    {},
    { reviewerId: 'reviewer-a' },
    { ...ok, expectedVersion: -1 },
    { ...ok, expectedVersion: 1.5 },
    { ...ok, expectedVersion: 99_999_999_999 },
    { ...ok, expectedVersion: '1' },
    { reviewerId: 42, expectedVersion: 1 },
  ]) {
    await expectError(await claim('study-002', bad), 400, 'VALIDATION_ERROR');
  }
  await expectError(
    await claim('study-002', { ...ok, reviewerId: 'nobody' }),
    400,
    'VALIDATION_ERROR',
  );
  await expectError(await claim('study-999', ok), 404, 'STUDY_NOT_FOUND');

  // Impossible transitions.
  await expectError(await complete('study-002', { ...ok, reviewNote: 'x' }), 409, 'INVALID_STATE');
  await expectError(
    await claim('study-004', { reviewerId: 'reviewer-b', expectedVersion: s4.version }),
    409,
    'INVALID_STATE',
  );
  await expectError(
    await complete('study-004', {
      reviewerId: 'reviewer-b',
      expectedVersion: s4.version,
      reviewNote: 'not mine',
    }),
    403,
    'NOT_OWNER',
  );
  await expectError(
    await complete('study-006', {
      reviewerId: 'reviewer-a',
      expectedVersion: s6.version,
      reviewNote: 'again',
    }),
    409,
    'INVALID_STATE',
  );

  // A stale version carries the current study.
  const stale = await claim('study-002', { ...ok, expectedVersion: s2.version + 7 });
  expect(stale.status()).toBe(412);
  const body = (await stale.json()) as { code: string; current: Study };
  expect(body.code).toBe('STALE_VERSION');
  expect(body.current.id).toBe('study-002');

  // Blank and oversized notes on a legitimately claimed study.
  const claimed = await claim('study-002', ok);
  expect(claimed.status()).toBe(200);
  const v = ((await claimed.json()) as Study).version;
  for (const note of ['', '   \n\t ', 'x'.repeat(10_001)]) {
    await expectError(
      await complete('study-002', {
        reviewerId: 'reviewer-a',
        expectedVersion: v,
        reviewNote: note,
      }),
      400,
      'VALIDATION_ERROR',
    );
  }

  // Routes that do not exist, and traversal through the file route.
  expect((await request.post('/api/studies', { data: ok })).status()).toBe(404);
  expect((await request.delete('/api/studies/study-002')).status()).toBe(404);
  for (const id of ['..%2f..%2fetc%2fpasswd', '%2e%2e%2f%2e%2e%2fpackage.json', 'local:x']) {
    expect((await request.get(`/api/studies/${id}/file`)).status()).toBe(404);
  }

  // Only the one legitimate claim changed anything.
  const [a2, a4, a6] = await Promise.all(
    ['study-002', 'study-004', 'study-006'].map((id) => study(request, id)),
  );
  expect(a2).toMatchObject({ status: 'InReview', ownerId: 'reviewer-a', version: v });
  expect(a4).toEqual(s4);
  expect(a6).toEqual(s6);
});

test('upload refuses wrong types, empty bodies and non-DICOM bytes and stores nothing', async ({
  request,
}) => {
  const count = async () => ((await (await request.get('/api/studies')).json()) as []).length;
  const start = await count();
  const send = (type: string, data: Buffer) =>
    request.post('/api/studies/upload', { headers: { 'Content-Type': type }, data });

  for (const type of ['text/plain', 'application/octet-stream', 'multipart/form-data']) {
    await expectError(await send(type, gradient), 415, 'REQUEST_REJECTED');
  }
  await expectError(await send('application/dicom', Buffer.alloc(0)), 400, 'VALIDATION_ERROR');
  await expectError(
    await send('application/dicom', Buffer.from('MZ not dicom')),
    400,
    'VALIDATION_ERROR',
  );
  await expectError(await send('application/dicom', corrupt), 400, 'VALIDATION_ERROR');
  // A DICOM file cut short must not slip through.
  await expectError(
    await send('application/dicom', gradient.subarray(0, 200)),
    400,
    'VALIDATION_ERROR',
  );
  // The size cap is enforced from the declared length, before the body is read.
  await expectError(
    await send('application/dicom', Buffer.alloc(65 * 1024 * 1024, 1)),
    413,
    'REQUEST_REJECTED',
  );
  expect(await count()).toBe(start);
});

function drawer(page: Page) {
  return page.getByRole('region', { name: 'Worklist', exact: true });
}
function uploadStatus(page: Page) {
  return drawer(page).locator('p[role="status"], p[role="alert"]').last();
}

test('uploading junk, a corrupt file and a mixed batch through the UI', async ({ page }) => {
  await gotoWorklist(page);
  await openWorklist(page);
  const input = page.getByTestId('upload-input');
  const heading = drawer(page).getByText(/^\d+ studies$/i);
  await expect(heading).toBeVisible();
  const before = (await heading.textContent()) ?? '';

  // A text file wearing a .dcm name, an empty file and a corrupt DICOM: each is rejected by name.
  await input.setInputFiles([
    { name: 'notes.dcm', mimeType: 'application/dicom', buffer: Buffer.from('hello world') },
    { name: 'empty.dcm', mimeType: 'application/dicom', buffer: Buffer.alloc(0) },
    { name: 'broken.dcm', mimeType: 'application/dicom', buffer: corrupt },
  ]);
  await expect(uploadStatus(page)).toContainText('notes.dcm:');
  await expect(uploadStatus(page)).toContainText('empty.dcm:');
  await expect(uploadStatus(page)).toContainText('broken.dcm:');
  await expect(uploadStatus(page)).not.toContainText('Uploaded');
  await expect(heading).toHaveText(before);

  // A mixed batch: the two good files are kept, the bad one is reported, the app keeps working.
  await input.setInputFiles([
    { name: 'one.dcm', mimeType: 'application/dicom', buffer: gradient },
    { name: 'bad.dcm', mimeType: 'application/dicom', buffer: Buffer.from('nope') },
    { name: 'two.dcm', mimeType: 'application/dicom', buffer: gradient },
  ]);
  await expect(uploadStatus(page)).toContainText('Uploaded 2 studies.');
  await expect(uploadStatus(page)).toContainText('bad.dcm:');
  await expect(page.locator('[data-study-id^="upload-"]')).toHaveCount(2);

  // An uploaded study is a normal study: open it, claim it, complete it.
  await page.locator('[data-study-id^="upload-"]').first().click();
  await expect(page.getByText(/^File metadata:/)).toBeVisible();
  await page.getByRole('button', { name: 'Claim' }).click();
  await expect(page.getByText('Study claimed.')).toBeVisible();
  await page.getByRole('textbox', { name: 'Review note', exact: true }).fill('uploaded and read');
  await page.getByRole('button', { name: 'Complete' }).click();
  await expect(page.getByText('Study completed.')).toBeVisible();
});

test('two browsers race for one study: the loser gets a recoverable notice, not a double claim', async ({
  browser,
}) => {
  const a = await browser.newPage();
  const b = await browser.newPage();
  try {
    await gotoWorklist(a);
    await gotoWorklist(b);
    await b.getByRole('combobox', { name: 'Reviewer', exact: true }).selectOption('reviewer-b');
    await openStudy(a, 'study-008');
    await openStudy(b, 'study-008');

    await a.getByRole('button', { name: 'Claim' }).click();
    await expect(a.getByText('Study claimed.')).toBeVisible();

    // B still sees an Unassigned study and acts on stale data.
    await b.getByRole('button', { name: 'Claim' }).click();
    await expect(b.getByText(/This study changed/)).toBeVisible();
    await expect(b.getByRole('button', { name: 'Claim' })).toBeDisabled();

    await b.getByRole('button', { name: 'Refresh and continue' }).click();
    await expect(
      b.getByText('In review by reviewer-a. Only the owner can complete it.'),
    ).toBeVisible();
    await expect(b.getByRole('button', { name: 'Complete' })).toHaveCount(0);
    await expect(b.getByRole('textbox', { name: 'Review note', exact: true })).toHaveCount(0);

    const res = await b.request.get('/api/studies/study-008');
    expect(await res.json()).toMatchObject({ status: 'InReview', ownerId: 'reviewer-a' });
  } finally {
    await a.close();
    await b.close();
  }
});

test('double-click Claim claims once; blank notes cannot be completed; a finished study is final', async ({
  page,
  request,
}) => {
  await gotoWorklist(page);
  // study-002 may already be claimed by the API scenario above; use a fresh upload instead.
  const up = await request.post('/api/studies/upload', {
    headers: { 'Content-Type': 'application/dicom' },
    data: gradient,
  });
  expect(up.status()).toBe(201);
  const id = ((await up.json()) as Study).id;
  await page.reload();
  await openStudy(page, id);

  const before = await study(request, id);
  await page.getByRole('button', { name: 'Claim' }).dblclick();
  await expect(page.getByText('Study claimed.')).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  const claimed = await study(request, id);
  expect(claimed).toMatchObject({ status: 'InReview', ownerId: 'reviewer-a' });
  expect(claimed.version).toBe(before.version + 1);

  const note = page.getByRole('textbox', { name: 'Review note', exact: true });
  const submit = page.getByRole('button', { name: 'Complete' });
  await note.fill('   \n  ');
  await expect(submit).toBeDisabled();
  await note.fill('x'.repeat(10_001));
  await expect(submit).toBeDisabled();
  await note.fill('  final read  ');
  await submit.dblclick();
  await expect(page.getByText('Study completed.')).toBeVisible();

  const done = await study(request, id);
  expect(done).toMatchObject({ status: 'Completed', ownerId: 'reviewer-a' });
  expect(done.version).toBe(claimed.version + 1);

  // Completed is terminal: no form, and the API refuses a second completion.
  await page.reload();
  await openStudy(page, id);
  await expect(page.getByRole('button', { name: 'Complete' })).toHaveCount(0);
  await expectError(
    await request.post(`/api/studies/${id}/complete`, {
      data: { reviewerId: 'reviewer-a', expectedVersion: done.version, reviewNote: 'again' },
    }),
    409,
    'INVALID_STATE',
  );
});

test('rapid study switching, corrupt images and closing mid-load leave no viewer resources behind', async ({
  page,
}) => {
  await gotoWorklist(page);
  for (const id of ['study-003', 'study-001', 'study-003', 'study-007', 'study-003', 'study-001']) {
    await clickStudy(page, id);
  }
  await expect(page.getByText(/^File metadata:/)).toBeVisible();
  expect((await stats(page)).engines).toBeLessThanOrEqual(1);

  // Corrupt image: an error is shown, the next valid study still renders.
  await openStudy(page, 'study-003');
  await expect(page.getByRole('alert')).toBeVisible();
  await openStudy(page, 'study-001');
  await expect(page.getByText(/^File metadata:/)).toBeVisible();

  // Open and close five times, the last one closed immediately after the click.
  for (let i = 0; i < 4; i += 1) {
    await openStudy(page, 'study-001');
    await closeViewer(page);
  }
  await clickStudy(page, 'study-001');
  await closeViewer(page);
  await expect
    .poll(async () => {
      const s = await stats(page);
      return [s.engines, s.observers, s.elementListeners];
    })
    .toEqual([0, 0, 0]);
});
