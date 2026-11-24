# Imaging Review Worklist

Two reviewers (`reviewer-a`, `reviewer-b`) share a worklist of DICOM studies. Each study can be claimed exactly once, opened in a real viewer (Cornerstone3D, rendering the actual pixels) and completed with a review note. The interesting parts are the ones the brief calls out: ownership that stays correct across two API processes, a UI that recovers safely from stale data, and a viewer that handles late loads, switching and closing without leaking. NestJS + Prisma + PostgreSQL on the back, Vite + React 18 + TanStack Query + Tailwind v4 on the front.

![Worklist at 1440px](docs/screenshots/01-worklist-1440.png)
![A study open in the viewer](docs/screenshots/02-study-open-1440.png)

Synthetic software-testing exercise. Not for diagnostic use.

## Quick start

Prerequisites: Node.js >= 22 (`.nvmrc` pins 24), npm >= 10, Docker (for PostgreSQL).

```bash
npm install
npm run db:up
npm run db:migrate
npm run dev
```

- Web app: http://localhost:5173
- API reference (Scalar): http://localhost:4000/docs
- API: http://localhost:4000/api (health: `/api/health`, readiness: `/api/readyz`)

If port 4000 is busy on your machine see [Port conflicts](#port-conflicts-and-environment-variables).

## One-command Docker run

```bash
npm run app:up      # builds the API and web images, starts Postgres + API + nginx
# open http://localhost:8080
npm run app:down    # stops the whole stack, Postgres included (the data volume is kept)
```

nginx serves the built SPA and proxies `/api` and `/docs` to the API. The API container applies migrations and the idempotent seed on start. The first build takes a few minutes.

## Commands

| Command                           | What it does                                                                                                                     |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `npm run db:up`                   | Start PostgreSQL in Docker (creates the `imaging` and `imaging_test` databases on first volume init). Idempotent.                |
| `npm run db:down`                 | Stop PostgreSQL. Data stays in the Docker volume.                                                                                |
| `npm run db:migrate`              | Apply Prisma migrations and run the create-if-absent seed. Safe to re-run; never overwrites existing rows.                       |
| `npm run db:reset`                | **Destructive, the only one.** Drops the dev database, re-migrates and re-seeds it. Does not ask.                                |
| `npm run dev`                     | API on :4000 and web on :5173. Touches no data: it never migrates, seeds or resets.                                              |
| `npm run build`                   | Production build of the API (`nest build`) and the web app (`vite build`).                                                       |
| `npm test`                        | API tests, then web tests (`test:api` then `test:web`). Needs `db:up` first.                                                     |
| `npm run test:api`                | API tests against the real `imaging_test` database (applies test migrations itself). Needs `db:up`.                              |
| `npm run test:web`                | React tests (Vitest, Testing Library, MSW). No database needed.                                                                  |
| `npm run test:contention`         | Two real API processes on :4101 and :4102 race 20 claims against one database. Needs `db:up`.                                    |
| `npm run test:e2e`                | Builds the API, then runs Playwright against the real API and viewer. Needs `db:up`; run `npx playwright install chromium` once. |
| `npm run verify`                  | `lint`, `typecheck`, then `npm test` as one command. Needs `db:up`.                                                              |
| `npm run lint` / `lint:fix`       | ESLint (strict TypeScript rules, no `console`, no `any`).                                                                        |
| `npm run typecheck`               | `tsc` for the API, the web app, the e2e project and the scripts.                                                                 |
| `npm run format` / `format:check` | Prettier write / check.                                                                                                          |
| `npm run import:dicom -- <dir>`   | Local-only import of your own DICOM files into the dev database (see below).                                                     |
| `npm run app:up` / `app:down`     | Build and start / stop the full Docker stack (see above).                                                                        |
| `npm run app:logs`                | Follow API and web container logs.                                                                                               |
| `npm run db:migrate:test`         | Apply migrations to `imaging_test` (the test scripts call this for you).                                                         |

Tests and e2e only ever write to `imaging_test`; your development data in `imaging` is not touched.

## How to use it

1. Open http://localhost:5173. The top-right **Reviewer** switch picks who you are (Reviewer A or Reviewer B). There is no login; the choice is the identity sent with every claim and completion.
2. Click a row to open a study. Anyone may look at any study, claimed or not. The image appears in the viewer with the controls described in [Viewer controls](#viewer-controls).
3. As Reviewer A, open an **Unassigned** study and press **Claim**. It becomes **InReview** and Reviewer A owns it.
4. Write a note in the completion form and press **Complete**. The study becomes **Completed**, the owner and the trimmed note are kept. Drafts are kept per study while you move around, and survive network errors.
5. Switch to Reviewer B and open the same study. B sees the saved note as a read-only card and cannot complete it. While a study is still InReview, B sees who owns it and gets no form.

The seeded studies (created by `db:migrate` if absent; the dates are 1 minute apart from 2026-10-07 09:00 UTC):

| Study       | Worklist modality | File           | Status     | Owner      |
| ----------- | ----------------- | -------------- | ---------- | ---------- |
| `study-001` | OT                | `gradient`     | Unassigned | none       |
| `study-002` | OT                | `checkerboard` | Unassigned | none       |
| `study-003` | OT                | `corrupt`      | Unassigned | none       |
| `study-004` | CT                | `gradient`     | InReview   | reviewer-a |
| `study-005` | MR                | `checkerboard` | InReview   | reviewer-b |
| `study-006` | CT                | `gradient`     | Completed  | reviewer-a |
| `study-007` | MR                | `checkerboard` | Completed  | reviewer-b |
| `study-008` | OT                | `gradient`     | Unassigned | none       |

`study-003` is deliberately the invalid `corrupt.dcm`: the viewer shows "Could not decode this file (not a valid DICOM image)", the worklist stays usable, and opening any valid study afterwards recovers without a page reload.

Other behaviour worth knowing:

- **No upload button.** The brief excludes uploads, and the file endpoint resolves only a fixed server-side map from study to fixture file (ADR 0004). There is no way for a client to name a path.
- **Completed is terminal.** One owner, one note. A second reviewer (or the owner again) cannot claim or complete it: the API answers `409 INVALID_STATE`, and the UI shows the saved note instead of a form.
- **Close viewer** clears the selection and disposes the viewer. On narrow screens the list and detail are separate panes with a Back button.

## Viewer controls

![Viewer toolbar at 1440px](docs/screenshots/15-viewer-controls-1440.png)
![Zoomed, rotated and inverted](docs/screenshots/16-viewer-transformed-1440.png)
![Toolbar wrapped at 390px](docs/screenshots/17-viewer-controls-390.png)

The toolbar above the image offers the basic controls of a diagnostic viewer. The required Fit / Reset button and the Window width / Window level sliders are unchanged.

| Control                     | Button                         | Key (viewport focused) | Notes                                                                                                                         |
| --------------------------- | ------------------------------ | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Window/Level tool (default) | Window/Level tool (toggle)     | `W`                    | Left-drag: right/left widens/narrows the window, down/up raises/lowers the level                                              |
| Pan tool                    | Pan tool (toggle)              | `P`                    | Left-drag moves the image                                                                                                     |
| Zoom tool                   | Zoom tool (toggle)             | `Z`                    | Left-drag up/down zooms about the press point                                                                                 |
| Zoom in / out               | Zoom in, Zoom out              | `+` or `=`, `-`        | 1.25x steps, clamped to 10%-2000% of fit                                                                                      |
| Rotate                      | Rotate left, Rotate right      | `Shift+R`, `R`         | 90 degree steps                                                                                                               |
| Flip                        | Flip horizontal, Flip vertical | `H`, `V`               | Flips what is on screen, also after a rotation                                                                                |
| Invert                      | Invert (toggle)                | `I`                    | Greyscale inversion relative to the image as loaded; MONOCHROME1 files load with the correct polarity and Reset returns to it |
| Pan by keyboard             |                                | Arrow keys             | 10% of the viewport per press; the page does not scroll                                                                       |
| Fit / Reset                 | Fit / Reset                    | `0`                    | Restores zoom, pan, rotation, flips, invert and window/level together (not the tool)                                          |

Always on: the mouse wheel zooms about the cursor, middle-button drag pans and right-button drag zooms. On touch, one finger uses the active tool and two fingers pinch to zoom and drag to pan. Click or tab to the image to use the keys; a **Shortcuts** disclosure lists them, and screen readers get the same list through the viewport's description. A readout in the image corner shows `Zoom 150% · Rot 90°` plus `Inverted`, `Flipped H` and `Flipped V` badges. The flip badges name the image's own axes, which Cornerstone mirrors before rotating, so after a quarter turn **Flip vertical** shows `Flipped H`. A real container resize (more than 8 px, or a width-only change of more than 20 px, measured from the size the image was last fitted to) refits zoom and pan; smaller changes such as a scrollbar appearing keep the zoom and the point at the centre. Rotation, flips, invert and window/level are kept either way.

Out of scope, because the brief excludes them: measurements and annotations, 3D/MPR, cine and multi-series navigation. The controls are our own pointer, wheel and keyboard handlers over the Cornerstone camera API, not `@cornerstonejs/tools` ([ADR 0001](docs/adr/0001-thin-cornerstone-viewer-over-ohif.md)). Their listeners are bound only once the current image has loaded and are counted in `window.__viewerStats`.

## Architecture

```mermaid
graph LR
  B[Browser<br/>React + Cornerstone3D]
  V[Vite dev server :5173<br/>proxy /api]
  N[nginx :8080<br/>static dist, proxy /api and /docs]
  A[NestJS API :4000<br/>Zod, Prisma, pino]
  P[(PostgreSQL)]
  F[/fixtures<br/>fixed fileKey map/]
  B -- dev --> V --> A
  B -- docker --> N --> A
  A --> P
  A -- GET /api/studies/:id/file --> F
```

More diagrams (viewer load and the stale guard, two reviewers claiming one study, request lifecycle) are in [docs/architecture.md](docs/architecture.md).

Architecture decision records:

- [ADR 0001: Thin Cornerstone3D viewer instead of OHIF](docs/adr/0001-thin-cornerstone-viewer-over-ohif.md)
- [ADR 0002: Database compare-and-swap for ownership](docs/adr/0002-database-compare-and-swap-for-ownership.md)
- [ADR 0003: CPU rendering for deterministic tests](docs/adr/0003-cpu-rendering-for-deterministic-tests.md)
- [ADR 0004: Fixed file map instead of uploads](docs/adr/0004-fixed-file-map-instead-of-uploads.md)

Component and sequence diagrams are in [docs/architecture.md](docs/architecture.md); the decisions behind them are the ADRs above.

## API summary

Interactive docs at `/docs` (OpenAPI JSON at `/docs/openapi.json`). The study DTO is `{ id, modality, createdAt, status, ownerId, reviewNote, version }`; it never contains the file key or any DICOM tag.

| Method | Path                             | Success | Notes                                                                                    |
| ------ | -------------------------------- | ------- | ---------------------------------------------------------------------------------------- |
| GET    | `/api/health`                    | 200     | `{ "ok": true }`                                                                         |
| GET    | `/api/readyz`                    | 200/503 | 503 when the database is unreachable                                                     |
| GET    | `/api/reviewers`                 | 200     | `[{ id, name }]`                                                                         |
| GET    | `/api/studies?status=&modality=` | 200     | Filters combined with AND, at most 100, ordered by `createdAt` then `id`; bad status 400 |
| GET    | `/api/studies/:id`               | 200     | Current metadata, owner and version; 404 `STUDY_NOT_FOUND`                               |
| POST   | `/api/studies/:id/claim`         | 200     | Body `{ reviewerId, expectedVersion }`; Unassigned to InReview                           |
| POST   | `/api/studies/:id/complete`      | 200     | Body `{ reviewerId, expectedVersion, reviewNote }`; InReview to Completed                |
| GET    | `/api/studies/:id/file`          | 200     | `application/dicom`, `Cache-Control: no-store`; 404 for an unknown study                 |

Errors share one envelope, `{ code, message, current? }`, where `current` is the up-to-date study on conflicts.

| Status | Code               | When                                                                                |
| ------ | ------------------ | ----------------------------------------------------------------------------------- |
| 400    | `VALIDATION_ERROR` | Malformed body, bad or missing `expectedVersion`, unknown `reviewerId`, bad note    |
| 404    | `STUDY_NOT_FOUND`  | Unknown study                                                                       |
| 412    | `STALE_VERSION`    | `expectedVersion` is not the current version; carries `current`                     |
| 409    | `INVALID_STATE`    | Claim of a non-Unassigned study, or completion of a non-InReview study              |
| 403    | `NOT_OWNER`        | Completion of an InReview study by a reviewer who does not own it (current version) |
| 404    | `NOT_FOUND`        | Unknown route                                                                       |
| 4xx    | `REQUEST_REJECTED` | Framework-level rejection, for example an oversized body (413)                      |

Checks run in a fixed order: **input, existence, version, status, ownership**. The review note is trimmed and must be 1 to 1000 characters. A failed or stale request changes nothing.

## How the hard parts are solved

### Ownership across processes

Every state change is one conditional statement in a transaction: `UPDATE study SET ..., version = version + 1 WHERE id = ? AND version = ? AND status = ? [AND ownerId = ?]`. Postgres row-locks the matching row, so concurrent writers serialise and exactly one sees a match; the loser's statement affects zero rows, the current row is re-read and the failure is classified (404, 412, 409, 403). No in-process lock is involved, so it holds for any number of API processes ([ADR 0002](docs/adr/0002-database-compare-and-swap-for-ownership.md)). Two layers prove it: an API test fires two concurrent claims at one app, and `scripts/contention-smoke.ts` builds the API, starts two separate processes on :4101 and :4102 against one database, and for 20 rounds fires a claim at each simultaneously, asserting exactly one 200 and one 412 per round.

### Safe UI recovery

- **Stale responses.** Worklist queries are keyed by the filter pair, so a slow response for an old filter lands in its own cache entry and cannot replace the current list. A delayed `GET /api/studies/:id` that resolves after a successful claim does not revert the panel.
- **Drafts scoped by study id.** Notes live in a store keyed by study id: A to B to A restores A's draft and B stays empty. A network error keeps the draft.
- **412 handling.** A stale claim or completion shows the server's current state, keeps the draft, and blocks both Claim and Complete for that study until the user presses **Refresh and continue**. The block survives switching A to B to A. The worklist row also refreshes to the server's current status.
- **Duplicate mutations.** Claim and Complete are disabled while a request is pending.

### Viewer late-loading

Every load takes a sequence token; a result carrying an old token (the user switched or closed) is discarded rather than drawn. Closing disposes the rendering engine, resize observer and element listeners, and a late resolve after disposal touches nothing. Counters are mirrored to `window.__viewerStats` (engines, observers, element listeners, loads, discarded loads) so both the unit tests and the browser lifecycle tests can assert on observable numbers instead of timing. The Cornerstone chunk is loaded lazily and wrapped in an error boundary. The viewer shows only modality, study date and image dimensions.

## Brief-to-test map

| Brief section                                            | What it requires                                                                       | Proven by                                                                                                                                              |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 01 Worklist and API                                      | Seed (8 studies, both reviewers), filters, ordering, 100 cap, DTO, file                | `apps/api/test/seed.test.ts`, `studies-read.test.ts`, `study-file.test.ts`                                                                             |
| 01 Claim, complete, note rules, terminal, version bump   | Transitions, 1-1000 trimmed note, retained owner and note                              | `apps/api/test/studies-mutations.test.ts`                                                                                                              |
| 02 Validation order and error codes                      | 400, 404, 412 with current, 409, 403, safe messages                                    | `apps/api/test/studies-mutations.test.ts`, `hardening.test.ts`                                                                                         |
| 02 One winner across two processes                       | One 200 and one 412; works across processes                                            | `studies-mutations.test.ts` (concurrent claims), `scripts/contention-smoke.ts` (`npm run test:contention`)                                             |
| 02 Failed completion changes nothing; persistence        | No fields change; survives restart                                                     | `studies-mutations.test.ts`, `apps/api/test/persistence.test.ts`                                                                                       |
| 03 Drafts, 412, errors, stale responses, duplicates      | Per-study drafts, 412 recovery, out-of-order filters, pending guard                    | `apps/web/src/components/study-panel.test.tsx`, `worklist.test.tsx`, `apps/web/e2e/review-flow.spec.ts`                                                |
| 03 Loading, empty, success, error states; keyboard       | States and labelled, keyboard-usable controls; pane focus                              | `worklist.test.tsx`, `study-panel.test.tsx`, `app-shell.test.tsx`, `study-header.test.tsx`                                                             |
| 04 Real viewer, fixtures, W/L, Fit/Reset, resize         | Real pixels differ per fixture, W/L changes them, Reset restores, resize               | `apps/web/e2e/viewer-render.spec.ts`                                                                                                                   |
| 04 Corrupt file and recovery                             | Visible error, list usable, next valid study renders                                   | `viewer-render.spec.ts`, `apps/web/src/viewer/use-dicom-viewer.test.ts`, `viewer-error-boundary.test.tsx`                                              |
| 04 Switching, closing, disposal, no PHI                  | Only the current image; dispose on close; no raw tags displayed or logged              | `use-dicom-viewer.test.ts`, `apps/web/e2e/viewer-lifecycle.spec.ts`, `apps/api/test/logging.test.ts`                                                   |
| 05 Lifecycle: five close/reopen cycles                   | No handler or engine accumulation                                                      | `use-dicom-viewer.test.ts`, `viewer-lifecycle.spec.ts` (`window.__viewerStats`)                                                                        |
| Extra: viewer controls (zoom, pan, rotate, flip, invert) | Each control changes real pixels, undo and Fit / Reset restore them; no listener leaks | `apps/web/e2e/viewer-controls.spec.ts`, `use-viewport-interactions.test.ts`, `viewer-math.test.ts`, `viewer-toolbar.test.tsx`, `study-viewer.test.tsx` |
| 05 README, migrations, seed, ordinary startup keeps data | Setup/start/reset/test commands; idempotent seed                                       | This file; `apps/api/prisma/migrations`, `apps/api/test/seed.test.ts` (re-seed never overwrites)                                                       |

## Test results

Recorded on 2026-11-24 (Windows 11, Node 24, Docker Desktop, PostgreSQL 15).

| Gate                      | Result                                                                                                                                               |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run lint`            | clean                                                                                                                                                |
| `npm run typecheck`       | clean                                                                                                                                                |
| `npm run format:check`    | clean                                                                                                                                                |
| `npm run verify`          | pass: API 49 tests in 8 files, web 70 tests in 13 files (119 total)                                                                                  |
| `npm run build`           | pass; entry 8.1 kB + vendor 113.8 kB gzip, Cornerstone (928 kB gzip) loaded lazily                                                                   |
| `npm run test:contention` | `rounds=20 ok=20` (also verified on a freshly created, empty test database)                                                                          |
| `npm run test:e2e`        | 19 passed (Playwright, chromium, real API and real viewer; 11 of them cover the viewer controls)                                                     |
| `npm run app:up` smoke    | `/api/health` 200, `/api/readyz` 200, `/docs` 200, `/api/studies/study-001/file` 200 `application/dicom`, study-001 renders at http://localhost:8080 |

## Design decisions and trade-offs

- **Worklist modality vs file modality.** The worklist `modality` is study metadata and is what the filter uses; it can differ from the file's own DICOM modality tag (all three fixtures are `OT`). That lets the modality filter be meaningful with only two image files. The viewer strip is labelled as file metadata and shows the file's value.
- **CPU rendering.** Cornerstone runs in CPU mode so canvas pixels are deterministic and readable in headless Chromium; the e2e tests assert on real pixels. The cost is speed on large or multi-frame images, which are out of scope ([ADR 0003](docs/adr/0003-cpu-rendering-for-deterministic-tests.md)).
- **Close viewer and Back.** "Close" in the brief's lifecycle rules is an explicit **Close viewer** button. Below 900px the app is master/detail and Back returns to the list, restoring scroll and focus.
- **412 blocks both actions.** After a stale response, Claim and Complete stay disabled for that study until "Refresh and continue", so a user never submits against state they have not seen.
- **OHIF not used.** OHIF shows patient identifiers by default and ships measurement and multi-series features that are out of scope, and its internals do not expose the listener and engine counts the lifecycle tests assert on. A thin viewer on `@cornerstonejs/core` keeps the metadata whitelist provable ([ADR 0001](docs/adr/0001-thin-cornerstone-viewer-over-ohif.md)).
- **Unpruned API image.** The API runtime image copies the workspace `node_modules` because the seed (`tsx`) and the Prisma CLI run at container start and are dev dependencies. The image is large; acceptable for a demo.
- **Hard-coded modality filter options.** The filter offers CT, MR, CR, US, DX, NM and OT from a constant in the web app instead of loading them from the API.
- **Instrumentation always on.** The `window.__viewerStats` counters are tiny and carry no PHI, so they are present in all builds rather than only in a test build.

## PHI and security notes

- All data is synthetic. Treat the app as software testing, not diagnostic use.
- The viewer reads and displays only modality, study date and image dimensions. No raw DICOM tags reach the UI, the API responses or the logs.
- Logging: pino logs method, URL, status and request id; request bodies are allowlisted (only `reviewerId` and `expectedVersion` are ever logged, never `reviewNote`), PHI-like field names are redacted, and `authorization` and `cookie` headers are redacted. `logging.test.ts` proves no raw value leaks.
- `GET /api/studies/:id/file` resolves a fixed server-side map; a path-like id cannot escape the fixtures directory.
- Helmet security headers on every response, CORS limited to the single configured web origin, `X-Request-Id` validated or regenerated, inputs validated with Zod.
- The development database password (`imaging`) is a local default for the Docker Postgres bound to `127.0.0.1`. It is not a secret; change it for anything beyond a local demo.

## Browsing your own DICOM files (local only)

A dev-only CLI imports a sample of your own DICOM files into the **development** database so you can browse them in the viewer. It is not an upload feature: the API still takes only a study id, and the brief's upload exclusion still holds.

```bash
npm run db:up && npm run db:migrate
# preview the plan, nothing is written
npm run import:dicom -- "C:/path/to/dicom" "C:/path/to/more" --limit 40 --dry-run
# import (defaults: --limit 40 --per-series 1)
npm run import:dicom -- "C:/path/to/dicom" "C:/path/to/more" --limit 40
```

Options: `--limit N` (default 40), `--per-series K` (default 1, the middle slice; K picks K evenly spaced slices), `--modalities CT,MR,CR,US,DX,OT,NM`, `--transfer-syntaxes UID,UID` (default: the supported list below), `--dry-run`.

- **What is imported.** Files ending `.dcm` or `.dicom`, found recursively. A series is the immediate parent directory. One slice per series is picked and series are taken round-robin across the folders you pass (and across modalities inside a folder), so a small `--limit` gives variety.
- **What is skipped (and counted in the summary).** Unreadable files, non-images (SR, PR, DOC, RTPLAN), multi-frame, anything not MONOCHROME1/2 (RGB, palette), unsupported transfer syntaxes, and modalities outside `--modalities`.
- **Privacy.** The tool reads only modality, rows, columns, frames, photometric interpretation, transfer syntax and study date, stops parsing before pixel data, and never prints, stores or displays patient tags (a unit test guards the tag allowlist). Worklist rows get synthetic ids (`local-001`...), the real modality, and a synthetic creation time.
- **Where files go.** Copies are written to `local-dicom/<uuid>.dcm` plus `local-dicom/manifest.json`. The directory is git-ignored, Docker-ignored and prettier/eslint-ignored, so it never reaches git, an image or the submission zip. Override the location with `LOCAL_DICOM_DIR` (the importer and the API both read it).
- **Warning.** Imported files may contain real patient data. Do not commit, share or screenshot them. `GET /api/studies/:id/file` serves the raw bytes of whatever you import, including every header tag, so use this only on your own machine.
- **Re-running.** Source files already in the manifest are skipped, so a second run is a no-op. `npm run db:reset` removes the imported rows; run the import again and any manifest entry whose row is gone is re-created (same files, no copy).
- **Rendering results** (Cornerstone3D, CPU rendering, checked in the browser): these render a real image with the metadata strip and no error: explicit VR little endian (1.2.840.10008.1.2.1), implicit VR little endian (1.2.840.10008.1.2), JPEG baseline/extended (4.50/4.51), JPEG lossless (4.57 and 4.70), JPEG 2000 (4.91) and RLE (1.2.840.10008.1.2.5). JPEG-LS (4.80/4.81) and JPEG 2000 lossless (4.90) are accepted by the importer, but no sample file was available to verify them.

## Port conflicts and environment variables

Defaults need ports 4000 (API), 5173 (web), 5432 (Postgres), 8080 (Docker web), 4101 and 4102 (contention script). If 4000 is already taken, run the API and the proxy on another port:

```bash
# terminal 1
PORT=4100 npm -w apps/api run dev
# terminal 2
API_PROXY_TARGET=http://localhost:4100 npm -w apps/web run dev
# end-to-end tests
E2E_API_PORT=4100 npm run test:e2e
```

| Variable            | Default                                                    | Used by                    | Meaning                                                                    |
| ------------------- | ---------------------------------------------------------- | -------------------------- | -------------------------------------------------------------------------- |
| `PORT`              | `4000`                                                     | API                        | API listen port                                                            |
| `DATABASE_URL`      | `postgresql://imaging:imaging@localhost:5432/imaging`      | API, Prisma                | Development database                                                       |
| `DATABASE_URL_TEST` | `postgresql://imaging:imaging@localhost:5432/imaging_test` | API tests, e2e, contention | Database used when `NODE_ENV=test`                                         |
| `WEB_ORIGIN`        | `http://localhost:5173`                                    | API                        | The one origin CORS allows (the Docker stack sets `http://localhost:8080`) |
| `API_DOCS_ENABLED`  | `true`                                                     | API                        | `false` removes `/docs` and `/docs/openapi.json`                           |
| `API_PROXY_TARGET`  | `http://localhost:4000`                                    | Vite dev server            | Where `/api` is proxied; must match `PORT`                                 |
| `E2E_API_PORT`      | `4000`                                                     | Playwright                 | Port of the API process Playwright starts                                  |

A commented copy is in [.env.example](.env.example). The apps read these from the shell environment.

## Repository layout

```text
apps/
  api/                    NestJS API
    prisma/               schema, migrations, seed (create-if-absent)
    src/                  studies, reviewers, health, common (errors, logging, OpenAPI)
    test/                 real-database API tests
    Dockerfile
  web/                    Vite + React app
    src/
      components/         worklist, study panel, header, completion form, ui/ primitives
      viewer/             Cornerstone hook, controls, error boundary, viewer stats
      queries/ stores/    TanStack Query hooks, session and draft store
      api/                typed client and Zod schemas
    e2e/                  Playwright specs (render, lifecycle, viewer controls, review flow)
    Dockerfile, nginx.conf
docker/                   docker-compose.yml (postgres, plus api and web under the app profile)
fixtures/                 gradient.dcm, checkerboard.dcm, corrupt.dcm
scripts/                  contention-smoke.ts (two-process race), import-dicom*.ts (local import)
docs/
  architecture.md         component and sequence diagrams
  adr/                    architecture decision records
  screenshots/            UI screenshots at 1440, 820, 768, 390 and 360 px
.github/workflows/ci.yml  lint, typecheck, tests, build
```

## Troubleshooting

- **Docker engine will not start (Windows).** Run `wsl --shutdown`, then restart Docker Desktop and retry `npm run db:up`.
- **Port 4000 is busy.** Use `PORT`, `API_PROXY_TARGET` and `E2E_API_PORT` as shown in [Port conflicts](#port-conflicts-and-environment-variables). Port 8080 for the Docker web container is fixed in `docker/docker-compose.yml`; stop whatever holds it or edit the mapping.
- **Postgres is up but `imaging_test` is missing.** The compose init scripts only run on the first initialisation of the volume. Recreate it: `docker compose -f docker/docker-compose.yml down -v`, then `npm run db:up` and `npm run db:migrate`. This deletes all development data.
- **Tests fail to connect.** Run `npm run db:up` first; `npm test`, `test:contention` and `test:e2e` need Postgres.
- **Playwright cannot find a browser.** Run `npx playwright install chromium` once.

## Known limitations

- Imported studies (`npm run import:dicom`) are local-only and git-ignored; the brief's upload exclusion still holds.
- The window width and level sliders use fixed 16-bit ranges, so they are coarse for a 16-bit image; the keyboard arrow keys give precise steps.
- The modality filter options are static (CT, MR, CR, US, DX, NM, OT), not loaded from the API.
- One generic viewer failure message covers every load failure (corrupt, unsupported, network).
- Completed is terminal with exactly one note, by design: no edit, release or reassignment.
- The API Docker image is not pruned and is large.
- The restart-persistence test recreates the Nest application on the same database inside one test process. Nothing is cached in memory, so this is equivalent to a restart; the contention script covers separate OS processes.
