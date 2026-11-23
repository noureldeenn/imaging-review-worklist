# Imaging Review Worklist Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A two-reviewer DICOM study worklist (NestJS API + Postgres, React SPA with a Cornerstone3D viewer) whose claim/complete flow is race-safe across processes and whose UI and viewer never show stale state, with every brief requirement covered by a test.

**Architecture:** npm-workspaces monorepo. `apps/api` is NestJS 10 + Prisma on PostgreSQL; every mutation is one conditional `UPDATE … WHERE id AND version AND status [AND owner]` so two processes can never both win. `apps/web` is Vite + React 18 with TanStack Query for server data, a small Zustand session store for reviewer/selection/drafts, and a `useDicomViewer` hook that guards every `await` with a load-sequence token and tears down the Cornerstone rendering engine on unmount. Playwright drives the real viewer for render and lifecycle tests.

**Tech Stack:** Node 24, TypeScript 5 strict, NestJS 10, Prisma 5, PostgreSQL 15 (Docker), Zod, Vitest, supertest, React 18, Vite 5, TanStack Query 5, Zustand 4, @cornerstonejs/core 2.x + @cornerstonejs/dicom-image-loader 2.x (CPU rendering), MSW 2, React Testing Library, Playwright 1.4x.

**Spec:** `docs/superpowers/specs/2026-11-23-imaging-review-worklist-design.md` (inside the repo root below)

## Global Constraints

- Repo root is `d:\interview\node-react-imaging-task(2)\imaging-review-worklist\` (new git repo). Conventional Commits.
- TypeScript `strict: true` + `noUncheckedIndexedAccess: true` in every package. No `any` without a `// justified-any:` comment.
- API port 4000, web port 5173 (proxy `/api` → 4000), test API ports 4101/4102, Postgres 5432 with databases `imaging` and `imaging_test`.
- Error envelope always `{ code, message, current? }`. Codes: `VALIDATION_ERROR` 400, `STUDY_NOT_FOUND` 404, `STALE_VERSION` 412, `INVALID_STATE` 409, `NOT_OWNER` 403.
- Validation order: input → existence → version → status → ownership.
- reviewNote: trim, then length 1..1000. Version: integer, starts at 1, +1 per successful mutation.
- Study DTO fields exactly: `id, modality, createdAt (ISO), status, ownerId, reviewNote, version`. Never `fileKey`, never DICOM tags.
- Seed is create-if-absent. `npm run db:migrate` must never alter existing rows.
- No PHI: the viewer reads only modality, study date, rows, columns from DICOM metadata; the dataset is never logged.
- Files ≤ 300 lines. Named exports only. kebab-case filenames. Co-located tests `*.test.ts(x)`.
- Run one heavy job at a time on this machine. Playwright `workers: 1`. API Vitest `fileParallelism: false`. Root `test` = `npm run test:api && npm run test:web` (sequential).
- Viewer runs Cornerstone3D with `setUseCPURendering(true)`.
- A 412 on a study blocks both Claim and Complete for that study until "Refresh and continue".
- `npm run dev` never migrates, seeds or resets.
- Never `git push`.

## Review Focus

1. `expectedVersion` sent as the string `"1"`, a float, or negative → must be 400 `VALIDATION_ERROR`, not a silent coercion (test in Task 4).
2. `?status=bogus` or `?modality=` empty string → 400 for bad enum, empty string treated as "no filter" (test in Task 3).
3. A note of exactly 1000 chars wrapped in whitespace must be accepted; 1001 non-space chars rejected and the row unchanged (test in Task 4).
4. User switches the reviewer dropdown while viewing a study the other reviewer owns → Complete is disabled and the owner label updates without refetch confusion (test in Task 8).
5. Filter combination with zero matches shows the empty state, not the previous list and not a spinner (test in Task 7).

---

### Task 1: Monorepo scaffold, database container, fixtures

**Files:**

- Create: `imaging-review-worklist/package.json`, `.gitignore`, `.nvmrc`, `tsconfig.base.json`
- Create: `imaging-review-worklist/docker/docker-compose.yml`, `docker/init/01-create-test-db.sql`
- Create: `imaging-review-worklist/fixtures/{gradient,checkerboard,corrupt}.dcm` (copied from `../samples/`)
- Create: `imaging-review-worklist/README.md` (skeleton: title, prerequisites, command table to be completed in Task 11)
- Already present: `imaging-review-worklist/docs/superpowers/` (spec + this plan ship with the repo)

**Interfaces:**

- Produces: root scripts `db:up`, `db:down`, `db:migrate`, `db:reset`, `dev`, `build`, `test`, `test:api`, `test:web`, `test:e2e`, `test:contention` (bodies filled in later tasks; `db:up`/`db:down` work now).
- Produces: env var contract `DATABASE_URL=postgresql://imaging:imaging@localhost:5432/imaging`, `DATABASE_URL_TEST=postgresql://imaging:imaging@localhost:5432/imaging_test`, `PORT`.

- [ ] **Step 1: Create the root `package.json`** with `"workspaces": ["apps/*"]`, `"private": true`, `engines.node >=22`, and the script names above. `db:up` = `docker compose -f docker/docker-compose.yml up -d`, `db:down` = same with `down`.
- [ ] **Step 2: Write `docker/docker-compose.yml`** — service `postgres` image `postgres:15`, user/password/db `imaging`, port 5432, volume `pgdata`, mount `./init:/docker-entrypoint-initdb.d`. `01-create-test-db.sql` = `CREATE DATABASE imaging_test;`.
- [ ] **Step 3: Copy fixtures** `../samples/*.dcm` → `fixtures/`. Verify sizes: 131946, 131946, 52 bytes.
- [ ] **Step 4: `tsconfig.base.json`** — `strict`, `noUncheckedIndexedAccess`, `target ES2022`, `module NodeNext` is NOT used here; keep `module: ESNext`, `moduleResolution: Bundler` for web and override in api to `commonjs`.
- [ ] **Step 5: Verify** `npm run db:up` then `docker exec -i $(docker compose -f docker/docker-compose.yml ps -q postgres) psql -U imaging -c '\l'` lists `imaging` and `imaging_test`.
- [ ] **Step 6: `git init`, commit** `chore: scaffold monorepo, postgres compose, fixtures, design docs`.

---

### Task 2: API skeleton, Prisma schema, migration, idempotent seed

**Files:**

- Create: `apps/api/package.json`, `apps/api/tsconfig.json`, `apps/api/nest-cli.json`, `apps/api/vitest.config.ts` (`fileParallelism: false`, `include: ['test/**/*.test.ts']`)
- Create: `apps/api/src/main.ts`, `src/app.module.ts`, `src/config.ts`, `src/prisma/prisma.module.ts`, `src/prisma/prisma.service.ts`, `src/health/health.controller.ts`
- Create: `apps/api/prisma/schema.prisma`, `prisma/migrations/<ts>_init/migration.sql`, `prisma/seed.ts`, `prisma/seed-data.ts`
- Create: `apps/api/test/db.ts` (test helper), `apps/api/test/seed.test.ts`

**Interfaces:**

- Produces: `loadConfig(): { port: number; databaseUrl: string }` in `src/config.ts` — reads `PORT` (default 4000) and `DATABASE_URL`, or `DATABASE_URL_TEST` when `NODE_ENV === 'test'`. Only file that touches `process.env`.
- Produces: `PrismaService extends PrismaClient` with `onModuleInit/onModuleDestroy`.
- Produces: `SEED_REVIEWERS: Array<{id, name}>` and `SEED_STUDIES: Array<{id, modality, createdAt, status, ownerId, reviewNote, fileKey}>` in `prisma/seed-data.ts` exactly as the spec table (8 studies, createdAt `2026-10-07T09:00:00Z` + 1 min each). `seed(prisma): Promise<{created: number}>` in `prisma/seed.ts` — `createMany({ skipDuplicates: true })` for both tables.
- Produces: test helper `resetTestDb(prisma)` = `TRUNCATE "Study", "Reviewer" CASCADE` then `seed()`; `createTestApp(): Promise<INestApplication>`.
- Produces: `GET /api/health` → `{ ok: true }`.

- [ ] **Step 1: Install** in `apps/api`: `@nestjs/{core,common,platform-express,cli}`, `prisma`, `@prisma/client`, `zod`, `reflect-metadata`, `rxjs`; dev: `vitest`, `supertest`, `@types/supertest`, `tsx`, `typescript`, `unplugin-swc` + `@swc/core` (vitest decorator support).
- [ ] **Step 2: Write `schema.prisma`** per spec §7.1 (enum `StudyStatus`, `Reviewer`, `Study` with indexes). `datasource` url `env("DATABASE_URL")`.
- [ ] **Step 3: Generate the migration** `DATABASE_URL=<imaging> npx prisma migrate dev --name init` (dev DB). Commit the SQL.
- [ ] **Step 4: Write the failing test `test/seed.test.ts`**:

```ts
it('seeds 2 reviewers and 8 studies in the spec order', async () => {
  await resetTestDb(prisma);
  const studies = await prisma.study.findMany({ orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
  expect(studies.map(s => s.id)).toEqual(['study-001', …, 'study-008']);
  expect(studies.filter(s => s.status === 'InReview').map(s => s.ownerId)).toEqual(['reviewer-a', 'reviewer-b']);
});
it('re-running seed never overwrites existing rows', async () => {
  await resetTestDb(prisma);
  await prisma.study.update({ where: { id: 'study-001' }, data: { status: 'InReview', ownerId: 'reviewer-a', version: 7 } });
  const r = await seed(prisma);
  expect(r.created).toBe(0);
  expect(await prisma.study.findUnique({ where: { id: 'study-001' } })).toMatchObject({ status: 'InReview', version: 7 });
});
```

- [ ] **Step 5: Run** `npx vitest run test/seed.test.ts` → FAIL (module not found).
- [ ] **Step 6: Implement** `config.ts`, `prisma.service.ts`, `seed-data.ts`, `seed.ts`, `health.controller.ts`, `app.module.ts`, `main.ts` (`app.setGlobalPrefix('api')`, listen on config port). Wire `prisma.seed` in `apps/api/package.json` to `tsx prisma/seed.ts`.
- [ ] **Step 7: Run** test → PASS. `npx tsc --noEmit` clean.
- [ ] **Step 8: Fill root scripts** `db:migrate` = `npm -w apps/api run prisma:deploy && npm -w apps/api run prisma:seed` (`prisma migrate deploy`), `db:reset` = `prisma migrate reset --force` (which runs seed). Verify `npm run db:migrate` twice leaves data untouched.
- [ ] **Step 9: Commit** `feat(api): nest skeleton, prisma schema, idempotent seed`.

---

### Task 3: Error envelope, Zod pipe, read endpoints

**Files:**

- Create: `apps/api/src/common/api-error.ts`, `src/common/api-error.filter.ts`, `src/common/zod-validation.pipe.ts`
- Create: `apps/api/src/reviewers/reviewers.controller.ts`, `src/reviewers/reviewers.module.ts`
- Create: `apps/api/src/studies/studies.dto.ts`, `src/studies/studies.mapper.ts`, `src/studies/studies.service.ts`, `src/studies/studies.controller.ts`, `src/studies/studies.module.ts`
- Test: `apps/api/test/studies-read.test.ts`

**Interfaces:**

- Produces: `class ApiError extends HttpException { constructor(status: number, code: ApiErrorCode, message: string, current?: StudyDto) }`; `type ApiErrorCode = 'VALIDATION_ERROR'|'STUDY_NOT_FOUND'|'STALE_VERSION'|'INVALID_STATE'|'NOT_OWNER'`.
- Produces: `ApiErrorFilter` (global) → body `{ code, message, current? }`; unknown errors → 500 `{ code: 'INTERNAL', message: 'Unexpected error' }`.
- Produces: `ZodValidationPipe(schema)` → throws `ApiError(400, 'VALIDATION_ERROR', firstIssueMessage)`.
- Produces: Zod schemas `ListStudiesQuery = { status?: StudyStatus, modality?: string(min 1, uppercased) }` (empty string → undefined via preprocess), `StudyDtoSchema`.
- Produces: `toStudyDto(study: Study): StudyDto`.
- Produces: `StudiesService.list(q): Promise<StudyDto[]>`, `getOne(id): Promise<StudyDto>` (throws 404).

- [ ] **Step 1: Write failing tests** in `test/studies-read.test.ts` (uses `createTestApp` + `resetTestDb` in `beforeEach`):

```ts
it('GET /api/reviewers returns both seeded reviewers', …) // [{id:'reviewer-a',name:…},{id:'reviewer-b',…}]
it('GET /api/studies returns all 8 ordered by createdAt then id and exposes no fileKey', …)
it('AND-combines status and modality', …) // ?status=InReview&modality=CT → ['study-004']
it('treats empty modality as no filter', …) // ?modality= → 8
it('rejects an unknown status with 400 VALIDATION_ERROR', …)
it('caps results at 100', …) // insert 120 Unassigned OT rows via prisma, expect length 100
it('GET /api/studies/:id returns metadata, ownership and version', …) // study-004 → ownerId reviewer-a, version 1
it('GET /api/studies/:id → 404 STUDY_NOT_FOUND', …)
```

- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** the common files, reviewers controller (`@Get('reviewers')`), studies dto/mapper/service/controller (`@Get('studies')`, `@Get('studies/:id')`). `list` uses `findMany({ where, orderBy: [{createdAt:'asc'},{id:'asc'}], take: 100 })`. Register filter globally in `main.ts` and in `createTestApp`.
- [ ] **Step 4: Run** → PASS. `tsc --noEmit` clean.
- [ ] **Step 5: Commit** `feat(api): error envelope, zod validation, study read endpoints`.

---

### Task 4: Claim and complete with database compare-and-swap

**Files:**

- Modify: `apps/api/src/studies/studies.dto.ts`, `studies.service.ts`, `studies.controller.ts`
- Create: `apps/api/src/studies/study-mutations.ts` (CAS + classification, keeps service < 300 lines)
- Test: `apps/api/test/studies-mutations.test.ts`, `apps/api/test/persistence.test.ts`

**Interfaces:**

- Produces: `ClaimBody = { reviewerId: string(min 1), expectedVersion: number int ≥ 1 }` (Zod, no coercion); `CompleteBody = ClaimBody & { reviewNote: string → trim → min 1 max 1000 }`.
- Produces: `StudiesService.claim(id, body): Promise<StudyDto>`, `complete(id, body): Promise<StudyDto>`.
- Produces: in `study-mutations.ts`: `runCas(prisma, { id, expectedVersion, where: Prisma.StudyWhereInput, data }): Promise<Study | null>` (transaction: `updateMany` then `findUniqueOrThrow` if count === 1) and `classifyFailure(current: Study | null, expectedVersion, kind: 'claim'|'complete', reviewerId): never` (throws 404/412/409/403 in spec order).

- [ ] **Step 1: Write failing tests** `test/studies-mutations.test.ts`:

```ts
// claim
it('claims an Unassigned study: InReview, owner set, version 2', …)
it('400 VALIDATION_ERROR when expectedVersion is the string "1"', …)
it('400 VALIDATION_ERROR when expectedVersion is 1.5 or missing', …)
it('400 VALIDATION_ERROR for unknown reviewerId, study untouched', …)
it('404 STUDY_NOT_FOUND for unknown study', …)
it('412 STALE_VERSION with current record when version is behind', …) // body.current.version === 1
it('409 INVALID_STATE when claiming an InReview study with the current version', …)
it('two concurrent claims from the same version → exactly one 200 and one 412', …)
  // Promise.all([post(a), post(b)]); sorted statuses [200, 412]; db: InReview, version 2, owner is the winner
// complete
it('owner completes with current version: Completed, note retained, owner retained, version +1', …)
it('403 NOT_OWNER when the other reviewer completes with the current version; nothing changes', …)
it('412 STALE_VERSION on stale complete; nothing changes', …)
it('409 INVALID_STATE completing an Unassigned or Completed study', …)
it('400 for empty, whitespace-only and 1001-char notes; nothing changes', …)
it('accepts a 1000-char note wrapped in whitespace and stores it trimmed', …)
it('Completed is terminal: claim → 409, complete → 409', …)
```

and `test/persistence.test.ts`:

```ts
it('ownership, note and version survive an application restart', async () => {
  // app1: claim study-001 by reviewer-a (v1→2), complete with note 'persisted' (v2→3); await app1.close()
  // app2 = await createTestApp() (no reset); GET study-001 → { status:'Completed', ownerId:'reviewer-a', reviewNote:'persisted', version:3 }
});
```

- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** `study-mutations.ts` and the service methods. Claim `where: { status: 'Unassigned' }`, `data: { status: 'InReview', ownerId, version: { increment: 1 } }`. Complete `where: { status: 'InReview', ownerId: reviewerId }`, `data: { status: 'Completed', reviewNote, version: { increment: 1 } }`. Both include `id` and `version: expectedVersion` in `where`. Reviewer existence check (`findUnique`) before the CAS → 400. Controllers: `@Post('studies/:id/claim')`, `@Post('studies/:id/complete')`, `@HttpCode(200)`.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(api): race-safe claim and complete with stable error codes`.

---

### Task 5: DICOM file endpoint

**Files:**

- Create: `apps/api/src/studies/study-files.ts`
- Modify: `apps/api/src/studies/studies.controller.ts`
- Test: `apps/api/test/study-file.test.ts`

**Interfaces:**

- Produces: `FIXTURE_FILES: Record<'gradient'|'checkerboard'|'corrupt', string>` (absolute paths resolved from `apps/api` to `../../fixtures/*.dcm`) and `resolveStudyFile(fileKey: string): string` (throws `ApiError(404, 'STUDY_NOT_FOUND')` for an unmapped key).
- Produces: `GET /api/studies/:id/file` → `StreamableFile`, headers `Content-Type: application/dicom`, `Cache-Control: no-store`, `Content-Length`.

- [ ] **Step 1: Failing tests**:

```ts
it('streams the mapped fixture bytes for study-002 (checkerboard)', …) // buffer equals fs.readFile(fixtures/checkerboard.dcm), content-type application/dicom, cache-control no-store
it('serves the corrupt fixture bytes for study-003 unchanged (52 bytes)', …)
it('404 STUDY_NOT_FOUND for unknown id', …)
it('path-like ids cannot escape: GET /api/studies/..%2F..%2Fpackage.json/file → 404', …)
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(api): serve study DICOM bytes by fixed mapping`.

---

### Task 6: Two-process contention smoke test

**Files:**

- Create: `scripts/contention-smoke.ts`
- Modify: root `package.json` (`test:contention` = `npm -w apps/api run build && tsx scripts/contention-smoke.ts`; `test` = `npm run test:api && npm run test:web`)

**Interfaces:**

- Consumes: built API at `apps/api/dist/main.js`, env `PORT`, `NODE_ENV=test` (uses `imaging_test`).
- Produces: exit 0 with `rounds=20 ok=20` on stdout; exit 1 with the failing round printed otherwise.

- [ ] **Step 1: Write the script**: spawn two `node apps/api/dist/main.js` children (PORT 4101, 4102); poll `/api/health` until both respond (max 15 s). For each of 20 rounds: via a direct `PrismaClient` on `DATABASE_URL_TEST` set study-001 to `{status:'Unassigned', ownerId:null, reviewNote:null}` and read its version `v`; `Promise.all` of POST `:4101/claim {reviewer-a, v}` and `:4102/claim {reviewer-b, v}`; assert sorted statuses `[200, 412]` and the 412 body has `code === 'STALE_VERSION'` and `current.version === v + 1`. Always kill children in `finally`.
- [ ] **Step 2: Run** `npm run test:contention` → `rounds=20 ok=20`, exit 0.
- [ ] **Step 3: Commit** `test(api): two-process contention smoke test`.

---

### Task 7: Web scaffold, API client, session store, reviewer select, filters, worklist

**Files:**

- Create: `apps/web/package.json`, `vite.config.ts` (proxy `/api`, vitest `environment: jsdom`, `setupFiles`), `tsconfig.json`, `index.html`
- Create: `apps/web/src/main.tsx`, `src/app.tsx`, `src/app.css`
- Create: `apps/web/src/api/schemas.ts` (Zod: `StudyDto`, `ReviewerDto`, `ApiErrorBody`), `src/api/client.ts`
- Create: `apps/web/src/queries/studies-queries.ts`
- Create: `apps/web/src/stores/session-store.ts`
- Create: `apps/web/src/components/reviewer-select.tsx`, `filters.tsx`, `worklist.tsx`
- Create: `apps/web/src/test/setup.ts`, `src/test/deferred.ts`, `src/test/handlers.ts`, `src/test/render.tsx`
- Test: `src/components/worklist.test.tsx`

**Interfaces:**

- Produces: `Deferred<T> = { promise: Promise<T>; resolve(v: T): void; reject(e: unknown): void }`, `deferred<T>()`.
- Produces: `api.listStudies(filters: StudyFilters): Promise<StudyDto[]>`, `api.getStudy(id)`, `api.listReviewers()`, `api.claim(id, body)`, `api.complete(id, body)`. Non-2xx → throws `ApiRequestError { status, code, message, current? }`; network failure → throws `NetworkError`.
- Produces: `StudyFilters = { status?: StudyStatus; modality?: string }`; query keys `studiesKeys.list(filters)`, `studiesKeys.detail(id)`, `reviewersKey`; hooks `useStudies(filters)`, `useStudy(id | null)`, `useReviewers()`.
- Produces: `useSessionStore` with `{ reviewerId: string; selectedStudyId: string | null; filters: StudyFilters; drafts: Record<string,string>; blocked: Record<string,true>; setReviewer, selectStudy(id: string | null), setFilters, setDraft(id, text), block(id), unblock(id) }`. No persistence middleware. `selectStudy(null)` is "Close viewer".
- Produces: `Worklist` renders rows as `<button aria-pressed>` with `aria-label="Open study {id}"`, plus states: `role="status"` "Loading studies…", "No studies match these filters.", `role="alert"` on error with a Retry button.

- [ ] **Step 1: Install** `react react-dom @tanstack/react-query zustand zod`; dev `vite @vitejs/plugin-react typescript vitest jsdom @testing-library/{react,jest-dom,user-event} msw`.
- [ ] **Step 2: Failing tests** `worklist.test.tsx` (MSW handlers that `await` a `Deferred` per request, keyed by query string):

```ts
it('a delayed older filter response cannot replace the current list', async () => {
  // request 1 (?status=) deferred d1; user picks status=Completed → request 2 deferred d2
  // d2.resolve([study-006, study-007]) → rows show 006, 007
  // d1.resolve([all 8]) → still exactly 006, 007
});
it('shows the empty state when the filter combination has no matches', …) // status=Completed&modality=OT → "No studies match these filters."
it('shows loading then rows, and an error with Retry on 500', …)
```

- [ ] **Step 3: Run** → FAIL. **Step 4: Implement** the files above. `QueryClient` defaults: `retry: false`, `staleTime: 0`. `app.tsx` lays out header (title + `ReviewerSelect` labeled "Reviewer"), left column (`Filters` with labeled selects "Status"/"Modality", `Worklist`), right column placeholder for Task 8.
- [ ] **Step 5: Run** → PASS. `tsc --noEmit` clean. `npm run dev` shows the list against the real API.
- [ ] **Step 6: Commit** `feat(web): worklist with reviewer select, filters and safe out-of-order handling`.

---

### Task 8: Study panel, claim, completion form, drafts, 412 recovery

**Files:**

- Create: `apps/web/src/components/study-panel.tsx`, `completion-form.tsx`, `mutation-status.tsx`
- Create: `apps/web/src/queries/study-mutations.ts`
- Modify: `apps/web/src/app.tsx`
- Test: `src/components/study-panel.test.tsx`

**Interfaces:**

- Consumes: Task 7 store, hooks, `ApiRequestError`.
- Produces: `useClaimStudy()`, `useCompleteStudy()` — `useMutation` wrappers. `onSuccess`: `await cancelQueries(detail(id))`, then `setQueryData(detail(id), dto)` + `invalidateQueries(list)`. `onError` with `status === 412`: `await cancelQueries(detail(id))`, `setQueryData(detail(id), err.current)`, `store.block(id)`. Other errors: leave draft, surface message.
- Produces: `StudyPanel({ studyId })` shows id, modality, status, owner ("you" when equals current reviewer), version, and a **Close viewer** button (`selectStudy(null)`); when `selectedStudyId` is null `app.tsx` renders `<p>Select a study to view it.</p>` instead of the panel. `Claim` button (enabled only when `status === 'Unassigned' && !blocked[id]` and no pending mutation); `CompletionForm` (textarea labeled "Review note", value = `drafts[studyId] ?? ''`, `Complete` enabled only when `status === 'InReview' && ownerId === reviewerId && !blocked[id] && !pending && trimmed length 1..1000`); a `role="status"` line for success / network error "Could not reach the server. Your note is kept." / 412 "This study changed (now version N). Review the current state, then press Refresh and continue." with a button **Refresh and continue** → `unblock(id)` + refetch detail.
- Produces: slot `<StudyViewer studyId=… />` placeholder (Task 9).

- [ ] **Step 1: Failing tests**:

```ts
it('drafts are scoped to study id: A→B→A restores A, B stays empty', …)
it('stale completion (412) keeps the draft, shows current version, disables Complete until Refresh and continue', …)
  // complete handler returns 412 { code:'STALE_VERSION', current:{…version:3, status:'InReview', ownerId:'reviewer-a'} }
  // textarea still 'note A'; text /now version 3/; Complete disabled; click 'Refresh and continue' → enabled
it('network error on complete keeps the draft and shows a retry message', …) // HttpResponse.error()
it('switching reviewer to the non-owner disables Complete and relabels the owner', …)
it('Claim is disabled while the claim request is pending (deferred) and a second click sends no second request', …)
it('a delayed GET study response resolving after a successful claim does not revert the panel', …)
  // detail GET deferred d1 (returns Unassigned v1); claim resolves first → panel shows InReview v2; d1.resolve(...) → still InReview v2 (cancelQueries discarded d1)
it('a 412 on claim also disables Claim until Refresh and continue', …)
it('Close viewer clears the panel and shows "Select a study to view it."', …)
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(web): study panel with claim, scoped drafts and 412 recovery`.

---

### Task 9: Cornerstone3D viewer with load guards, disposal and instrumentation

**Files:**

- Create: `apps/web/src/viewer/cornerstone-init.ts`, `viewer-stats.ts`, `use-dicom-viewer.ts`, `study-viewer.tsx`, `viewer-controls.tsx`, `viewer-metadata.tsx`
- Modify: `apps/web/vite.config.ts` (`optimizeDeps.exclude: ['@cornerstonejs/dicom-image-loader']`, `worker.format: 'es'`)
- Modify: `apps/web/src/components/study-panel.tsx` (mount `StudyViewer`)
- Test: `src/viewer/use-dicom-viewer.test.ts` (unit, with the cornerstone modules mocked at module level — the only place module mocks are allowed, because the real engine needs a browser; the real engine is covered in Task 10)

**Interfaces:**

- Produces: `initCornerstone(): Promise<void>` (idempotent; `csCore.init()`, `csCore.setUseCPURendering(true)`, `dicomImageLoader.init({ maxWebWorkers: 1 })`).
- Produces: `viewerStats` module: `{ engines: number; observers: number; elementListeners: number; loadsCompleted: number; loadsDiscarded: number; currentImageId: string | null }` mirrored to `window.__viewerStats`; helpers `trackEngine(+1|-1)`, `instrumentElement(el)` (wraps add/removeEventListener on that element).
- Produces: `useDicomViewer(studyId: string | null): { containerRef, state: 'idle'|'loading'|'ready'|'error', error: string | null, metadata: { modality, studyDate, rows, columns } | null, setWindowLevel(ww: number, wl: number), resetView(), windowLevel: { ww, wl } | null }`.
  - Image id `wadouri:/api/studies/${studyId}/file`.
  - Every `await` is followed by `if (seq !== loadSeq.current || disposed.current) { loadsDiscarded++; return; }`.
  - Corrupt/undecodable → `state: 'error'`, `error: 'Could not decode this file (not a valid DICOM image).'`, engine kept alive, next study loads normally.
  - Cleanup (study change and unmount): bump seq, disconnect `ResizeObserver`, `renderingEngine.destroy()`, `cache.removeImageLoadObject(imageId)` guarded by try/catch, `trackEngine(-1)`.
- Produces: `StudyViewer({ studyId })` renders the container `<div data-testid="viewport" role="img" aria-label="DICOM image for {studyId}">`, `ViewerControls` (buttons "Fit / Reset", range inputs labeled "Window width" and "Window level"), `ViewerMetadata` strip "File metadata: OT · 2026-10-07 · 256×256", loading text `role="status"` "Loading image…", error `role="alert"`.

- [ ] **Step 1: Install** `@cornerstonejs/core @cornerstonejs/dicom-image-loader dicom-parser` (pin 2.x matching versions).
- [ ] **Step 2: Failing unit tests** for the hook (mock `@cornerstonejs/core` with a fake `RenderingEngine` whose `setStack` returns a controllable `Deferred`):

```ts
it('a delayed load for study A does not apply after switching to B', …) // resolve A after B → currentImageId ends with study-B, loadsDiscarded === 1
it('closing during a pending load destroys the engine and the late resolve touches nothing', …) // engines 0, no throw
it('five mount/unmount cycles leave engines=0, observers=0, elementListeners at baseline', …)
it('a rejected load sets state error with the decode message and keeps the engine', …)
```

- [ ] **Step 3: Run** → FAIL. **Step 4: Implement** the viewer files. Window/level applied through `viewport.setProperties({ voiRange: { lower: wl - ww/2, upper: wl + ww/2 } })`; initial ww/wl read from `viewport.getProperties().voiRange` after first render. Reset = `resetCamera()`, `resetProperties()`, `render()`. Metadata from `metaData.get('generalSeriesModule'|'generalStudyModule'|'imagePixelModule', imageId)`; format `StudyDate` `YYYYMMDD` → `YYYY-MM-DD`.
- [ ] **Step 5: Run** → PASS. `npm run dev`: gradient and checkerboard render visibly different images; corrupt shows the alert; list still works.
- [ ] **Step 6: Commit** `feat(web): cornerstone viewer with load guards, disposal and stats`.

---

### Task 10: Playwright browser and lifecycle tests against the real viewer

**Files:**

- Create: `apps/web/playwright.config.ts` (`workers: 1`, `webServer`: api on 4000 with `NODE_ENV=test` + web on 5173, chromium default launch; CPU rendering needs no GPU flags), `apps/web/e2e/helpers.ts`, `e2e/viewer-render.spec.ts`, `e2e/viewer-lifecycle.spec.ts`
- Modify: root `package.json` `test:e2e` = `npm -w apps/web run test:e2e` (which runs `db:migrate` for the test DB first via a `globalSetup` calling `resetTestDb`).

**Interfaces:**

- Consumes: `window.__viewerStats`, `data-testid="viewport"`, control labels from Task 9, study ids from seed (`study-001` gradient, `study-002` checkerboard, `study-003` corrupt).
- Produces: helper `canvasPixels(page): Promise<{ mean: number; data: number[] }>` via `page.evaluate` reading `getImageData` from the 2D canvas that CPU rendering produces; `diffRatio(a, b)` = fraction of pixels whose luminance differs by more than 8.

- [ ] **Step 1: Write `viewer-render.spec.ts`**:

```ts
test('renders gradient and checkerboard with different real pixels', …)
  // open study-001 → wait metadata 'OT · 2026-10-07 · 256×256'; p1 = canvasPixels; expect mean between 5 and 250 (not blank)
  // open study-002 → p2; expect diffRatio(p1.png, p2.png) > 0.2
test('window/level changes pixels and Fit / Reset restores them', …) // set WW to min → diffRatio > 0.1; click reset → diffRatio(reset, p1) < 0.01
test('viewport follows container resize', …) // page.setViewportSize smaller → canvas boundingBox width changes, image still non-blank
test('corrupt fixture shows an error, list stays usable, valid study recovers', …) // study-003 → role=alert /Could not decode/; click study-001 → metadata strip visible, non-blank
```

- [ ] **Step 2: Write `viewer-lifecycle.spec.ts`** using `page.route('**/api/studies/study-001/file', …)` to hold A's response in a deferred:

```ts
test('switching during a delayed load shows only the current image', …) // open 001 (held) → open 002 → wait ready → release 001 → stats.currentImageId endsWith 'study-002/file', loadsDiscarded ≥ 1, no alert
test('closing during a delayed load disposes without reopening', …) // open 001 (held) → click 'Close viewer' → release → engines === 0, viewport not in DOM, no console errors
test('five close/reopen cycles do not accumulate handlers or engines', …) // baseline = stats after first close; loop 5× open 002 / close; expect engines 0, observers 0, elementListeners === baseline
```

- [ ] **Step 3: Install** `@playwright/test`; `npx playwright install chromium`. Run `npm run test:e2e` → all 7 pass.
- [ ] **Step 4: Commit** `test(web): playwright viewer render and lifecycle tests`.

---

### Task 11: API hardening — OpenAPI, security headers, structured logging, readiness

**Files:**

- Create: `apps/api/src/common/openapi.ts`, `src/common/logging.ts`, `src/common/request-id.middleware.ts`
- Modify: `apps/api/src/main.ts`, `src/app.module.ts`, `src/health/health.controller.ts`, `src/studies/studies.controller.ts`, `src/reviewers/reviewers.controller.ts`, `src/config.ts`
- Test: `apps/api/test/hardening.test.ts`

**Interfaces:**

- Produces: `GET /api/readyz` → 200 `{ ok: true, db: 'up' }` or 503 `{ ok: false, db: 'down' }` (runs `SELECT 1`). `GET /api/health` unchanged.
- Produces: `GET /docs` (Scalar UI via `@scalar/nestjs-api-reference`) and `GET /docs/openapi.json` (OpenAPI 3.x built with `@nestjs/swagger` `DocumentBuilder`; Zod DTOs surfaced by converting each schema with `z.toJSONSchema` into `@ApiBody({ schema })` / `@ApiResponse({ schema })`). Every route has `@ApiOperation`, an `@ApiResponse` for each status it returns (400/403/404/409/412 examples use the error envelope with synthetic values), and a tag (`studies`, `reviewers`, `health`). Gated by `API_DOCS_ENABLED` (default `true`) read in `loadConfig()`.
- Produces: `helmet()` with defaults; CORS allowing only `WEB_ORIGIN` (default `http://localhost:5173`, read in `loadConfig()`); `X-Request-Id` echoed if supplied, otherwise a generated uuid, on every response.
- Produces: `nestjs-pino` logger with `redact.paths` = the PHI list (`patientName, patientId, mrn, dob, birthDate, studyDescription, accessionNumber, referringPhysicianName, performingPhysicianName, requestingPhysician, patientAddress, patientPhone, patientEmail, ssn`, each under `req.body.*`), `autoLogging` on, `pino-pretty` transport only when `NODE_ENV !== 'production'`. No `console.*` anywhere in `apps/api/src`.
- Produces: `app.enableShutdownHooks()`; `PrismaService.onModuleDestroy` disconnects.

- [ ] **Step 1: Failing tests** `test/hardening.test.ts`:

```ts
it('GET /api/readyz reports db up', …)                       // 200 { ok: true, db: 'up' }
it('GET /docs/openapi.json is OpenAPI 3 and documents the claim route with a 412 response', …) // body.openapi startsWith '3', paths['/api/studies/{id}/claim'].post.responses['412'] defined
it('responses carry security headers and X-Request-Id', …)  // x-content-type-options nosniff; x-request-id present; a supplied X-Request-Id is echoed back unchanged
it('CORS allows the web origin only', …)                    // Origin http://localhost:5173 → access-control-allow-origin set; Origin http://evil.test → header absent
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS; full api suite green; `nest build` OK; `npm run test:contention` still green.
- [ ] **Step 5: Commit** `feat(api): openapi docs, security headers, pino logging, readiness`.

---

### Task 12: Tooling — ESLint, Prettier, Husky, commitlint, line endings

**Files:**

- Create: `eslint.config.mjs` (root flat config: `typescript-eslint` recommended for `apps/*/src`, `scripts/`, `apps/web/e2e`; `eslint-plugin-react-hooks` for web; rules `no-console: error` in `apps/api/src` and `apps/web/src`, `max-lines: ['error', { max: 300, skipBlankLines: true, skipComments: true }]`), `.prettierrc` (`singleQuote: true, printWidth: 100, trailingComma: 'all', semi: true`), `.prettierignore`, `.editorconfig`, `.gitattributes` (`* text=auto eol=lf` plus the existing `*.dcm binary`), `.husky/pre-commit`, `.husky/commit-msg`, `commitlint.config.cjs`, `.lintstagedrc.json`, `scripts/tsconfig.json`
- Modify: root `package.json` (`lint`, `lint:fix`, `format`, `format:check`, `typecheck` = api + web + scripts, `verify` = `npm run lint && npm run typecheck && npm test`, `prepare` = `husky`)

- [ ] **Step 1: Install** at root: `eslint`, `typescript-eslint`, `eslint-plugin-react-hooks`, `prettier`, `husky`, `lint-staged`, `@commitlint/cli`, `@commitlint/config-conventional`.
- [ ] **Step 2: Write the configs.** lint-staged: `*.{ts,tsx}` → `eslint --max-warnings=0 --fix` then `prettier --write`; `*.{json,md,yml,yaml}` → `prettier --write`. `commit-msg` runs `npx --no -- commitlint --edit "$1"`.
- [ ] **Step 3: Normalise**: after the `.gitattributes` change run `git add --renormalize .`; run `npm run format` once over the repo; run `npm run lint:fix`; fix remaining lint errors by hand (no `eslint-disable` without a reason comment).
- [ ] **Step 4: Verify** `npm run verify` is green; a commit with the message `bad message` is rejected by the hook (record the output), then commit properly.
- [ ] **Step 5: Commit** `style: format repo with prettier` (if large) then `chore: eslint, prettier, husky hooks, commitlint, lf line endings`.

---

### Task 13: Delivery — Dockerfiles, full-app compose profile, GitHub Actions CI

**Files:**

- Create: `apps/api/Dockerfile` (multi-stage: deps → build (`prisma generate`, `nest build`) → runtime `node:22-alpine`, non-root user, fixtures copied to `/app/fixtures` so the existing `__dirname` resolution still finds `../../../../fixtures` — adjust the copy path to match), `apps/api/docker-entrypoint.sh` (`prisma migrate deploy` then seed, then `node dist/main.js`), `apps/web/Dockerfile` (Vite build → `nginx:alpine`), `apps/web/nginx.conf` (`location /api/ { proxy_pass http://api:4000; }`, SPA fallback `try_files $uri /index.html`), `.dockerignore`
- Modify: `docker/docker-compose.yml` — services `api` (build `../apps/api` with context `..`, `profiles: ["app"]`, env `DATABASE_URL=postgresql://imaging:imaging@postgres:5432/imaging`, `WEB_ORIGIN=http://localhost:8080`, `NODE_ENV=production`, depends_on postgres healthy) and `web` (build, `profiles: ["app"]`, port `8080:80`, depends_on api)
- Create: `.github/workflows/ci.yml`
- Modify: root `package.json` (`app:up` = `docker compose -f docker/docker-compose.yml --profile app up -d --build`, `app:down` = same with `down`)

**Interfaces:**

- Produces: `npm run app:up` → app at http://localhost:8080 with a migrated and seeded DB; `npm run app:down`.
- Produces: CI job `verify` (ubuntu-latest, Node 22, `postgres:15` service with the `imaging`/`imaging_test` databases, `npm ci`, `npm run lint`, `npm run typecheck`, `npm run db:migrate:test`, `npm run test:api`, `npm run test:web`, `npm run build`, `npm run test:contention`) and job `e2e` (needs verify; `npx playwright install --with-deps chromium`; `npm run test:e2e`; upload `apps/web/playwright-report` on failure).

- [ ] **Step 1: Write the Dockerfiles, entrypoint, nginx.conf, compose services.** Seeding in the image: ship `tsx` and `prisma/seed.ts` in the runtime image, or compile the seed with the Nest build; pick one and note it in the report.
- [ ] **Step 2: Verify** `npm run app:up`; `curl http://localhost:8080/api/health` → `{"ok":true}`; `curl -I http://localhost:8080/api/studies/study-001/file` → `application/dicom`; open http://localhost:8080 in a browser (Playwright MCP) and claim a study; `npm run app:down`. Record outputs.
- [ ] **Step 3: Write `ci.yml`**; validate with `actionlint` if available, else by `node -e "require('yaml').parse(...)"`.
- [ ] **Step 4: Commit** `build: dockerfiles, app compose profile, github actions ci`.

---

### Task 14: Web polish and documentation — lazy viewer, error boundary, ADRs, architecture diagram

**Files:**

- Create: `apps/web/src/viewer/viewer-error-boundary.tsx`, `apps/web/src/viewer/study-viewer-lazy.tsx`
- Modify: `apps/web/src/components/study-panel.tsx` (mount the lazy viewer inside the boundary with a `role="status"` "Loading viewer…" fallback), `apps/web/vite.config.ts` (`build.rollupOptions.output.manualChunks` putting `@cornerstonejs/*` and `dicom-parser` into a `cornerstone` chunk)
- Create: `docs/adr/0001-thin-cornerstone-viewer-over-ohif.md`, `docs/adr/0002-database-compare-and-swap-for-ownership.md`, `docs/adr/0003-cpu-rendering-for-deterministic-tests.md`, `docs/adr/0004-fixed-file-map-instead-of-uploads.md` (format: Status / Context / Decision / Consequences, ≤ 60 lines each; no internal URLs or company-internal paths)
- Create: `docs/architecture.md` (Mermaid: component diagram browser → Vite dev proxy or nginx → NestJS → Postgres; sequence diagram of the viewer load with the stale-guard; sequence diagram of the claim compare-and-swap with two reviewers)
- Test: `apps/web/src/viewer/viewer-error-boundary.test.tsx`

- [ ] **Step 1: Failing test**: a child that throws renders `role="alert"` with text `The viewer crashed. Close and reopen the study.`; content outside the boundary still renders.
- [ ] **Step 2: Implement** the boundary and `React.lazy(() => import('./study-viewer'))` wrapped in `Suspense`. Web unit tests green; then run `npm run test:e2e` once (the lazy chunk must not break the Playwright helpers, which already wait for the strip/alert).
- [ ] **Step 3: Write the four ADRs and `docs/architecture.md`.**
- [ ] **Step 4: Verify** `npm -w apps/web run build` emits a separate `cornerstone-*.js` chunk and the main entry chunk is under 400 kB gzip; record the sizes.
- [ ] **Step 5: Commit** `feat(web): lazy viewer with error boundary` then `docs: adrs and architecture diagrams`.

---

### Task 15: README, full verification, submission packaging

**Files:**

- Modify: `README.md`
- Create: `.env.example`

- [ ] **Step 1: Write README**: prerequisites (Node ≥ 22, npm ≥ 10, Docker), exact commands (spec §7.5 plus `app:up`/`app:down`, `verify`, `lint`, `format`, and the `/docs` URL), the Mermaid diagram from `docs/architecture.md`, links to the ADRs, what each test suite proves (table mapping brief sections 01–05 to test files), the design decisions from spec §9 (worklist modality vs file modality, CPU rendering, Close viewer, 412 block), the PHI note, and "`npm run dev` touches no data; `npm run db:migrate` is safe to re-run; `db:reset` is the only destructive command".
- [ ] **Step 2: Run the full gate one job at a time**: `npm run verify` (lint + typecheck + api + web), `npm run build`, `npm run test:contention`, `npm run test:e2e`, then `npm run app:up` smoke and `app:down`. Record pass counts in the README.
- [ ] **Step 3: Fresh-clone check**: copy the repo to a temp dir, `npm install`, `npm run db:up`, `npm run db:migrate`, `npm run dev`, open http://localhost:5173, claim and complete a study, restart `npm run dev`, confirm the completion persisted.
- [ ] **Step 4: Commit** `docs: README with setup, commands and test map`.
