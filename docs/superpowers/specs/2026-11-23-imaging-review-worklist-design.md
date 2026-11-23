# Imaging Review Worklist — Design

Date: 2026-11-23
Source brief: `Imaging Review Worklist.pdf` (Craft Crew engineering assessment)
Fixtures: `samples/gradient.dcm`, `samples/checkerboard.dcm`, `samples/corrupt.dcm`

## 1. Intent

A take-home assessment for Craft Crew. Build a small two-reviewer worklist: each study can be claimed once,
opened in a real DICOM viewer, and completed with a note. The graders explicitly care about three things:

1. **Competing ownership** — two reviewers racing for one study, across two API processes, must yield exactly
   one winner.
2. **Safe UI recovery** — stale responses never clobber current state; drafts survive errors and 412s.
3. **A viewer that handles late loading** — switching or closing mid-load never shows the wrong image, never
   touches a disposed container, never leaks handlers.

Craft Crew's own repos (pacs-fe, pacs-be) use NestJS + Prisma + PostgreSQL, Zod at every boundary, stable error
codes, optimistic version tokens, small files, strict TypeScript, real-database tests. The submission should
read like a scaled-down version of that house style.

## 2. Goals

- Every bullet in the brief is implemented and has a test that proves it.
- A reviewer can clone, run four commands, and have the app and all tests running.
- Code is small, typed, and obviously correct. No speculative abstractions.

## 3. Non-goals

Explicitly out of scope per the brief: authentication, edit/release/upload/delete of studies, extra codecs,
measurements, 3D, multi-series navigation, draft persistence across reload, CI pipeline.

## 4. Anti-goals (would fail the assessment even if it "works")

- An in-process mutex as the concurrency guard. Must be a database-level compare-and-swap.
- Rendering a PNG or canvas dump instead of real DICOM pixels through a real loader.
- Timing-based sleeps in React tests.
- Mocked canvas in the browser test.
- Any patient-identifying DICOM tag displayed or logged.
- Caller-controlled file paths in the file endpoint.
- Startup that wipes existing data.

## 5. Constraints

- Node 24 / npm 11 on the dev machine. Docker available.
- Dev machine freezes under parallel heavy jobs: run one build or test suite at a time; Playwright with one worker.
- Fixtures: both valid files are 256×256, 16-bit, MONOCHROME2, Explicit VR Little Endian, modality `OT`,
  study date `20261007`, no PatientName. `corrupt.dcm` is 52 bytes of ASCII text.

## 6. Approaches considered

### Backend framework and database

| Option | Trade-off |
| --- | --- |
| **NestJS + Prisma + PostgreSQL (chosen)** | Matches Craft Crew's stack exactly. Postgres is the natural reading of "two API processes sharing a database". Costs: Docker dependency, more boilerplate than Fastify. |
| Fastify + Prisma + PostgreSQL | Leaner, fewer files. Loses the house-style signal. |
| Express/Fastify + SQLite | Zero infra, but weaker story for cross-process contention and not what the brief implies by "relational database" in a PACS context. |

### Viewer library

| Option | Trade-off |
| --- | --- |
| **Cornerstone3D (`@cornerstonejs/core` + `@cornerstonejs/dicom-image-loader`) (chosen)** | The current standard; used under OHIF, which pacs-fe already embeds. Handles uncompressed MONOCHROME2 natively, exposes window/level, resetCamera, resize, and explicit `destroy()`. |
| Legacy cornerstone-core + cornerstone-wado-image-loader | Simpler API but deprecated; a reviewer would notice. |
| dcmjs + hand-drawn canvas | Violates "do not implement a parser / raw pixel dump is not sufficient". |

### Frontend shell

| Option | Trade-off |
| --- | --- |
| **Vite + React 18 SPA (chosen)** | Right size for a single-page worklist. Fast tests with Vitest. |
| Next.js | pacs-fe uses it, but Server Components add nothing here and complicate Cornerstone (browser-only). |

### Concurrency guard

| Option | Trade-off |
| --- | --- |
| **Single conditional `UPDATE … WHERE id AND version = expected AND status = X [AND owner] RETURNING *` (chosen)** | One atomic statement; Postgres row lock guarantees one winner across any number of processes. On zero rows, re-read and classify the failure. |
| `SELECT … FOR UPDATE` in a transaction, then check, then update | Also correct, more code, same guarantee. |
| In-process lock | Explicitly rejected by the brief. |

## 7. Architecture

npm workspaces monorepo in a new folder `imaging-review-worklist/` beside this brief, its own git repo (the
submission is that repo, zipped without `node_modules`). This spec and its plan live inside it under `docs/`.

```
imaging-review-worklist/
├── apps/
│   ├── api/            NestJS 10, Prisma, Zod DTOs            port 4000
│   └── web/            Vite + React 18 + TS, TanStack Query   port 5173 (proxies /api → 4000)
├── fixtures/           gradient.dcm, checkerboard.dcm, corrupt.dcm (copied from samples/)
├── docker/             docker-compose.yml (postgres:15, two databases: imaging, imaging_test)
├── docs/               this spec, plan
├── scripts/            contention-smoke.ts
├── package.json        workspace root scripts
└── README.md
```

### 7.1 Data model (Prisma, PostgreSQL)

```prisma
enum StudyStatus { Unassigned InReview Completed }

model Reviewer {
  id        String  @id            // "reviewer-a", "reviewer-b"
  name      String
  studies   Study[]
}

model Study {
  id          String      @id       // "study-001" …  (fixed, seeded)
  modality    String                // CT | MR | OT | …  worklist metadata (my call: may differ from file tag)
  createdAt   DateTime
  status      StudyStatus @default(Unassigned)
  ownerId     String?
  owner       Reviewer?   @relation(fields: [ownerId], references: [id])
  reviewNote  String?
  version     Int         @default(1)
  fileKey     String                // "gradient" | "checkerboard" | "corrupt" — key into a fixed server map
  @@index([status, modality])
  @@index([createdAt, id])
}
```

`fileKey` is resolved server-side through a hard-coded `Record<fileKey, absolutePath>`. The client never
supplies a path.

Seed (idempotent, **create-if-absent only**, never overwrites existing rows so ordinary startup preserves data):

| id | modality | file | status | owner | note |
| --- | --- | --- | --- | --- | --- |
| study-001 | OT | gradient | Unassigned | | |
| study-002 | OT | checkerboard | Unassigned | | |
| study-003 | OT | corrupt | Unassigned | | |
| study-004 | CT | gradient | InReview | reviewer-a | |
| study-005 | MR | checkerboard | InReview | reviewer-b | |
| study-006 | CT | gradient | Completed | reviewer-a | "Seeded complete" |
| study-007 | MR | checkerboard | Completed | reviewer-b | "Seeded complete" |
| study-008 | OT | gradient | Unassigned | | |

createdAt values are fixed timestamps one minute apart so ordering is deterministic.

### 7.2 API

All responses JSON. Study DTO:

```ts
{ id, modality, createdAt, status, ownerId, reviewNote, version }   // never fileKey, never DICOM tags
```

| Method | Path | Behaviour |
| --- | --- | --- |
| GET | /api/reviewers | `[{id,name}]` |
| GET | /api/studies?status=&modality= | AND filter, max 100, `ORDER BY createdAt ASC, id ASC` |
| GET | /api/studies/:id | 404 if unknown |
| POST | /api/studies/:id/claim | body `{reviewerId, expectedVersion}` |
| POST | /api/studies/:id/complete | body `{reviewerId, expectedVersion, reviewNote}` |
| GET | /api/studies/:id/file | `application/dicom`, `Cache-Control: no-store`, streamed from mapped path; 404 unknown id |

Error envelope: `{ code: string, message: string, current?: StudyDto }`.

Validation order (fixed by brief): input → existence → version → status → ownership.

| Situation | Status | code |
| --- | --- | --- |
| malformed body, bad expectedVersion, note outside 1–1000 after trim, unknown reviewerId | 400 | `VALIDATION_ERROR` |
| unknown study | 404 | `STUDY_NOT_FOUND` |
| expectedVersion ≠ current | 412 | `STALE_VERSION` + `current` |
| claim on non-Unassigned / complete on non-InReview | 409 | `INVALID_STATE` |
| complete by non-owner | 403 | `NOT_OWNER` |

Unknown reviewerId is a 400 per the brief; checked against the Reviewer table before touching the study.

Mutation algorithm (StudiesService):

```
claim(id, reviewerId, expectedVersion):
  assertReviewerExists(reviewerId)            -> 400
  rows = UPDATE study SET status='InReview', owner_id=$r, version=version+1
         WHERE id=$id AND version=$v AND status='Unassigned' RETURNING *
  if rows == 1 -> 200 dto
  current = SELECT * WHERE id=$id
  if !current            -> 404
  if current.version != v -> 412 {current}
  else                   -> 409

complete(id, reviewerId, expectedVersion, note):
  note = note.trim(); assert 1..1000            -> 400 (Zod, before any DB call)
  assertReviewerExists(reviewerId)              -> 400
  rows = UPDATE … SET status='Completed', review_note=$n, version=version+1
         WHERE id=$id AND version=$v AND status='InReview' AND owner_id=$r RETURNING *
  if rows == 1 -> 200
  classify as above, plus: status=='InReview' && owner!=r -> 403
```

One statement, one row lock, so two processes can never both succeed. A failed attempt writes nothing.

### 7.3 Web app

Layout (single page):

```
┌──────────────────────────────────────────────────────────────────────┐
│ Imaging Review Worklist          Reviewer: [reviewer-a ▼]            │
├───────────────────────────┬──────────────────────────────────────────┤
│ Status [All ▼] Modality [All ▼]  │ study-004 · CT · InReview · owner: you   [Close viewer] │
│───────────────────────────│ [Fit/Reset]  WW [=====] WL [=====]        │
│ ▸ study-001 OT Unassigned │ ┌──────────────────────────────────┐    │
│ ▸ study-002 OT Unassigned │ │                                  │    │
│ ● study-004 CT InReview   │ │        cornerstone viewport      │    │
│   study-006 CT Completed  │ │                                  │    │
│   …                       │ └──────────────────────────────────┘    │
│                           │ File metadata: OT · 2026-10-07 · 256×256│
│ (loading / empty / error) │ Review note                              │
│                           │ [textarea……………………………………]           │
│                           │ [Claim]  [Complete]        status line   │
└───────────────────────────┴──────────────────────────────────────────┘
```

When no study is selected the right panel shows "Select a study to view it." **Close viewer** clears the
selection, which unmounts `StudyViewer` and disposes the engine. "Close" in the lifecycle rules means this
button; "switch" means selecting another row.

State:

- **Server data**: TanStack Query. Keys: `['studies', {status, modality}]`, `['study', id]`, `['reviewers']`.
  Query v5 already discards out-of-order responses for a key; the list test asserts it with deferred promises.
- **Client state (Zustand, no persistence)**: `reviewerId`, `selectedStudyId`, `drafts: Record<studyId, string>`,
  `blocked: Record<studyId, true>` (set after any 412 on that study; disables both Claim and Complete for it
  until the user clicks "Refresh and continue", which clears the flag and refetches the study). The draft is
  kept in the store regardless; the completion form is only shown while the study is InReview and owned by
  the current reviewer, so a draft for a study someone else completed is retained but not displayed.
- **Mutations**: `useMutation` for claim and complete. Buttons disabled while `isPending`. On success
  `cancelQueries(['study', id])` first (so an in-flight GET cannot revert the cache afterwards), then set
  `['study', id]` data and invalidate `['studies']`. On 412: set `['study', id]` to `error.current`, keep draft, set
  blocked flag. On network error: keep draft, show retry message. On 409/403: show message, refetch study.
- **Viewer** (`StudyViewer` component, `useDicomViewer` hook):
  - `setUseCPURendering(true)` at init. The single 256×256 frame does not need WebGL; CPU rendering draws to
    a 2D canvas, so pixel readback in tests is deterministic and headless Chromium needs no GPU flags. It is
    still Cornerstone's real loader, cache, viewport, VOI and camera code.
  - One `RenderingEngine` per mount, id `viewer-<n>`; one STACK viewport.
  - Image id: `wadouri:/api/studies/<id>/file`.
  - Load guard: `loadSeq` ref incremented on each study change and on unmount; after each `await`, bail if
    `seq !== loadSeq.current || disposed.current`.
  - `ResizeObserver` on the container → `renderingEngine.resize()`.
  - Window/level: two range inputs bound to `viewport.setProperties({ voiRange })`; Fit/Reset →
    `resetCamera()` + `resetProperties()` + `render()`.
  - Metadata strip labelled "File metadata": modality, study date, rows×columns read from Cornerstone's metadata provider for the
    loaded image (modules `generalSeriesModule`, `generalStudyModule`, `imagePixelModule`). Nothing else from
    the dataset is read, and the dataset is never logged.
  - Corrupt file: loader rejects → viewer shows "Could not decode this file (not a valid DICOM image)" with
    the study still selected; worklist unaffected; selecting another study loads normally.
  - Cleanup on unmount / study change: cancel pending (via seq), disconnect observer, remove listeners,
    `renderingEngine.destroy()`, purge cache for the image id.
  - **Instrumentation** (always compiled, harmless in prod): module-level counters exposed on
    `window.__viewerStats = { engines: number, listeners: number, loadsCompleted: number, loadsDiscarded: number }`.
    `listeners` is maintained by wrapping `addEventListener/removeEventListener` on the viewport element only.
    The lifecycle test asserts `engines === 1` while open, `0` after close, and `listeners` returns to baseline
    across five cycles.
- **Accessibility**: every control has a visible or aria label; list rows are buttons; keyboard reachable.

### 7.4 Tests

| Layer | Tool | Cases |
| --- | --- | --- |
| API (real Postgres, `imaging_test` DB, truncated + reseeded per file) | Vitest + supertest | filters AND + ordering + limit; 404; claim happy path; concurrent claims (Promise.all of 2 → one 200, one 412); non-owner complete 403; stale complete 412 changes nothing; invalid notes (empty, whitespace, 1001 chars) 400 and unchanged; unknown reviewer 400; INVALID_STATE 409; file route 404 + bytes equal fixture + no-store; **restart persistence**: mutate, close Nest app, boot a fresh app on same DB, read back |
| Two-process contention | `scripts/contention-smoke.ts` | builds api, spawns two instances on 4101/4102 against `imaging_test`, resets study-001 to Unassigned, fires claim to each simultaneously ×20 rounds, asserts exactly one 200 and one 412 per round |
| React | Vitest + RTL + MSW, `Deferred<T>` helper | out-of-order filter responses (first request resolves last, list shows second); a delayed GET study response resolving after a successful claim does not revert the panel; switch A→B with draft, B empty, back to A restores; stale completion 412 keeps draft, shows current state, Claim and Complete disabled until "Refresh and continue" |
| Browser | Playwright (chromium, 1 worker) against real api+web | for each valid fixture: canvas non-blank and the two fixtures' pixel histograms differ; change WW/WL → canvas pixels change; reset → pixels return; resize container → canvas size changes; open corrupt → error visible, list still interactive, then open gradient → renders |
| Lifecycle | Playwright with route delay on `/file` | select A, immediately select B while A delayed → only B's image id rendered (`loadsDiscarded ≥ 1`); open then close during delay → `engines === 0` and no error; five open/close cycles → `listeners` equals baseline and `engines === 0` |

Test isolation: API Vitest runs with `fileParallelism: false`; the root `npm test` runs `test:api` then `test:web`
sequentially; the contention script and Playwright are separate commands. All test-side writes go to `imaging_test`.
`npm run dev` never migrates, seeds or resets.

### 7.5 Commands (README)

```
npm install
npm run db:up          # docker compose up -d postgres (creates imaging + imaging_test)
npm run db:migrate     # prisma migrate deploy + idempotent seed   (safe to re-run; keeps data)
npm run dev            # api :4000 + web :5173 (touches no data)
npm run db:reset       # drop + migrate + seed (destructive, asks nothing)
npm test               # api + web unit/integration
npm run test:contention
npm run test:e2e       # playwright (needs db + builds)
```

## 8. Decisions left to the builder

- Exact Cornerstone3D version pinning and Vite config for its web workers / wasm.
- Whether `reviewNote` 400 vs reviewer 400 ordering within validation (both are 400; brief does not care).
- Styling. Plain CSS modules, no UI library.
- Whether the file endpoint uses `StreamableFile` or `res.sendFile`.

## 9. Calls I made that the brief leaves open

- Worklist `modality` is study metadata and may differ from the file's `OT` tag; the viewer strip is labelled
  "File metadata" and shows the file's tag. Lets the modality filter be meaningful with only two image files.
  Called out in the README.
- An explicit "Close viewer" button exists; "close" in the brief's lifecycle rules means that button.
- The viewer runs Cornerstone3D in CPU-rendering mode (see §7.3) for determinism; GPU mode is out of scope.
- A 412 blocks both Claim and Complete for that study until "Refresh and continue".
- Version is an integer starting at 1, returned as a number.
- Unknown reviewer is checked via the Reviewer table (400), before study lookup.
- Draft blocked-after-412 state is per study and cleared by an explicit "Refresh and continue" button.
- Instrumentation counters are always present (tiny, no PHI) rather than test-only builds.
