# Imaging Review Worklist

Two reviewers (`reviewer-a`, `reviewer-b`) share a worklist of DICOM studies. Each study can be claimed exactly once, opened in a real viewer (Cornerstone3D, rendering the actual pixels) and completed with a review note. The interesting parts are the ones the brief calls out: ownership that stays correct across two API processes, a UI that recovers safely from stale data, and a viewer that handles late loads, switching and closing without leaking. NestJS + Prisma + PostgreSQL on the back, Vite + React 18 + TanStack Query + Tailwind v4 on the front.

![A study open in the viewer-first layout at 1440px](docs/screenshots/01-viewer-1440.png)
![The worklist drawer over the viewer, review panel collapsed](docs/screenshots/02-worklist-drawer-1440.png)

Synthetic software-testing exercise. Not for diagnostic use.

> **Scope: the brief vs optional additions.** The brief's requirements (worklist and API, ownership across processes, safe UI recovery, the real viewer with its lifecycle rules) are the core and are proven by the original tests. The viewer controls, the viewer-first layout and toolbar, measurements, segmentation and the local DICOM import are optional additions requested beyond the brief (which lists measurements, uploads, 3D and multi-series as out of scope). Each viewer addition (controls, layout and toolbar, measurements, segmentation) is isolated from the graded paths and has its own lifecycle (no-leak) tests; none of them persists data or calls a new API endpoint. The local DICOM import is different: it is a dev-only command-line tool that copies files into the git-ignored `local-dicom/` folder and creates studies in your development database. The one API addition is the regex-gated `local:<uuid>` file-key resolver, used only by that import.

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
2. The app is viewer-first, like OHIF: a slim title bar, one toolbar row and one big viewer that fills the rest of the window. With nothing selected the **Worklist** drawer is open on the left, with the Status and Modality filters. Click a row (or focus it and press Enter) to open a study; the drawer closes and the image fills the viewer. The **Worklist** toolbar button brings the list back (Esc or a click outside closes it again). Anyone may look at any study, claimed or not. The viewer controls are described in [Viewer controls](#viewer-controls).
3. The **Review** panel on the right holds the study header, **Claim**, the note form or saved note and the status messages. At 1280px and wider it sits beside the viewer and is open by default (collapsing it widens the image); between 900 and 1279px it floats over the viewer; below 900px it is a bottom sheet. The **Review** toolbar button opens and closes it. As Reviewer A, open an **Unassigned** study and press **Claim**. It becomes **InReview** and Reviewer A owns it.
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

- **No upload button.** The brief excludes uploads, and the file endpoint resolves only a fixed server-side map from study to fixture file (ADR 0004), plus server-generated `local:<uuid>` keys (regex-checked, resolved inside `LOCAL_DICOM_DIR`) written by the dev-only local import. There is no way for a client to name a path.
- **Completed is terminal.** One owner, one note. A second reviewer (or the owner again) cannot claim or complete it: the API answers `409 INVALID_STATE`, and the UI shows the saved note instead of a form.
- **Close viewer** (in the Review panel header) clears the selection, disposes the viewer and reopens the worklist drawer.
- **Feedback is never hidden.** If the Review panel is collapsed when a Claim or Complete finishes or a `412` arrives, it opens again so the message and **Refresh and continue** are visible; a stale study also puts a dot on the Review button.

## Viewer controls

![Review panel as an overlay at 1024px](docs/screenshots/03-review-overlay-1024.png)
![Phone viewer at 390px](docs/screenshots/04-viewer-390.png)
![Review bottom sheet at 390px](docs/screenshots/05-review-sheet-390.png)
![Stale-version notice](docs/screenshots/06-stale-412-1440.png)

One toolbar row in the OHIF style: icon above a short label with the shortcut in it, the active tool in teal, groups separated by thin rules, and a **More** menu for the rest. Left to right: `Worklist`, `Review` | `Levels (L)`, `Pan (P)`, `Zoom (Z)` | `Length`, `Angle`, `Ellipse`, `Rectangle` | `Segment ▾` (`Brush (B)`, `Smart brush`) | `Zoom in`, `Zoom out` | `Fit / Reset` | `Delete ▾` (`Delete selected`, `Clear measurements`, `Eraser (E)`, `Clear segments`) | `More` (`Invert (I)`, `Rotate left (<)`, `Rotate right (>)`, `Flip horizontal (H)`, `Flip vertical (V)`). Levels, Pan, Zoom, the four measurement tools, Brush, Smart brush and Eraser are one exclusive tool choice (a tool inside a menu is a radio item, and the menu button is tinted and described as `Active tool: …` while it holds the active tool). Below 900px the row is seven 44px icon buttons (Worklist, Review, Levels, Pan, Zoom, Fit / Reset, More); the four measurement tools, the Segment ▾ items, Zoom in / Zoom out and the Delete ▾ items move into More (the tools as radio items). Between 900 and 1099px the buttons (44px minimum) and separators are tighter so the full row fits without scrolling. Every button has a tooltip with its name and shortcut. The toolbar is one tab stop (Left/Right, Home/End move inside it) and the More menu follows the WAI-ARIA menu-button pattern (Up/Down, Home/End, Esc). It is built from a config array in `apps/web/src/toolbar/toolbar-config.ts`. The required Fit / Reset button and the Window width / Window level sliders stay; the sliders live in the info strip under the image.

| Control          | Toolbar                                                 | Key (viewport focused)          | Notes                                                                                                                         |
| ---------------- | ------------------------------------------------------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Levels (default) | Levels (L), a tool                                      | `L` (`W` also works)            | Left-drag: right/left widens/narrows the window, down/up raises/lowers the level                                              |
| Pan              | Pan (P), a tool                                         | `P`                             | Left-drag moves the image                                                                                                     |
| Zoom             | Zoom (Z), a tool                                        | `Z`                             | Left-drag up/down zooms about the press point                                                                                 |
| Zoom in / out    | Zoom in, Zoom out (in More below 900px)                 | `+` or `=`, `-`                 | 1.25x steps, clamped to 10%-2000% of fit                                                                                      |
| Rotate           | More: Rotate left (<), Rotate right (>)                 | `<` `,` `Shift+R` / `>` `.` `R` | 90 degree steps                                                                                                               |
| Flip             | More: Flip horizontal (H), Flip vertical (V)            | `H`, `V`                        | Flips what is on screen, also after a rotation                                                                                |
| Invert           | More: Invert (I), a checkbox item                       | `I`                             | Greyscale inversion relative to the image as loaded; MONOCHROME1 files load with the correct polarity and Reset returns to it |
| Pan by keyboard  |                                                         | Arrow keys                      | 10% of the viewport per press; the page does not scroll                                                                       |
| Fit / Reset      | Fit / Reset                                             | `0`                             | Restores zoom, pan, rotation, flips, invert and window/level together (not the tool, the measurements or the segments)        |
| Measurements     | Length, Angle, Ellipse, Rectangle, tools                | none (pointer-only drawing)     | See [Measurements](#measurements); in More below 900px                                                                        |
| Delete selected  | Delete ▾: Delete selected                               | `Delete` or `Backspace`         | Removes the selected measurement                                                                                              |
| Cancel drawing   |                                                         | `Esc`                           | Drops a measurement that is being drawn (or an endpoint drag), or the brush stroke in progress                                |
| Segmentation     | Segment ▾: Brush (B), Smart brush; Delete ▾: Eraser (E) | `B`, `E`                        | See [Segmentation](#segmentation); in More below 900px                                                                        |
| Undo stroke      | Segments panel: Undo last stroke                        | `Ctrl+Z` / `Cmd+Z`              | Reverts the last brush or eraser stroke of the open study (20 kept)                                                           |
| Clear            | Delete ▾: Clear measurements, Clear segments            |                                 | Removes every measurement (or segment) of the open study; also in the Review panel                                            |

Always on: the mouse wheel zooms about the cursor, middle-button drag pans and right-button drag zooms. On touch, one finger uses the active tool and two fingers pinch to zoom and drag to pan. Click or tab to the image to use the keys; a **Shortcuts** disclosure in the info strip lists them (desktop), and screen readers get the same list through the viewport's description. The info strip under the image (never over it) shows the file metadata line, a readout such as `Zoom 150% · Rot 90°` with `Inverted` and `Mirrored` badges, and the two sliders. `Mirrored` appears when the image shows exactly one flip (two flips are a half turn, not a mirror image). A real container resize (more than 8 px, or a width-only change of more than 20 px, measured from the size the image was last fitted to) refits zoom and pan; smaller changes such as a scrollbar appearing keep the zoom and the point at the centre. Rotation, flips, invert and window/level are kept either way.

The brief puts measurements and segmentation-like extras out of scope; both were added later on request as optional, isolated extras (below). Still not part of this version: automatic/AI segmentation, DICOM-SEG, 3D/MPR, cine and multi-series navigation. The controls are our own pointer, wheel and keyboard handlers over the Cornerstone camera API, not `@cornerstonejs/tools` ([ADR 0001](docs/adr/0001-thin-cornerstone-viewer-over-ohif.md)). Their listeners are bound only once the current image has loaded and are counted in `window.__viewerStats`.

### Measurements

![Length, angle, ellipse and rectangle on the gradient study, with the Measurements list](docs/screenshots/07-measurements-1440.png)
![The measurement tools inside More at 390px](docs/screenshots/08-measurements-390.png)

- **Tools.** `Length`: press, drag, release between two points. `Angle`: click three points, the second is the vertex (a rubber band follows the pointer; a first press that drags draws the first arm). `Ellipse` and `Rectangle`: press, drag, release across the bounding box. A press that moves less than 4 px draws nothing. `Esc` cancels a shape in progress; a second finger, a tool change, a study switch or closing the viewer cancels it too.
- **Labels.** Next to each shape, white on a dark halo so they read on black and white: Length `12.3 mm`, Angle `67.2°` (0-180°, `—` when an arm has no length), Ellipse and Rectangle as area `1,234 mm²` (π·a·b and w·h). Millimetres come from the file's Pixel Spacing (0028,0030), row and column spacing applied separately; without it (the synthetic studies) values are in image pixels (`45 px`, `px²`). No patient tag is read; the metadata strip is unchanged.
- **Selecting and editing.** A press within a few pixels of an existing shape's outline (6 px with a mouse, 14 px with touch) selects that shape with the navigation and measurement tools (Levels, Pan, Zoom, Length, Angle, Ellipse, Rectangle) instead of starting a window/level change, a pan or a new shape (cyan, larger handles). A press on a handle of the selected shape drags that handle (a line end, a rectangle corner, an ellipse axis end) instead of changing W/L or panning. `Delete`/`Backspace` on the focused image or `Delete ▾ > Delete selected` removes it. The segmentation tools (Brush, Smart brush, Eraser) do not select: they paint over measurements.
- **Attached to the image.** Points are stored in image pixel coordinates and re-projected after every zoom, pan, rotation, flip and resize, so a shape stays on the same pixels (the e2e test checks the grey level under each end). Wheel zoom, middle-drag pan and two-finger pinch keep working while a measurement tool is active.
- **Per study, in memory.** Each study has its own list (A → B → A shows A's again), up to 100 per study. Nothing is persisted: not to the server, not to localStorage; a reload clears them. `Fit / Reset` restores the view only; `Clear measurements` removes the shapes.
- **Accessible path.** Drawing is pointer-only, as in OHIF. The Review panel's **Measurements** section lists the open study's shapes numbered per type (`Length 1, 12.3 mm`, so two equal shapes never share a name), selects one on the image when chosen, and has a `Delete Length 1, 12.3 mm` button per item plus `Clear measurements`; all of it works by keyboard and screen reader. After a delete, focus moves to the next item (else the previous, else the section heading), and a polite status region announces `Length 1, 12.3 mm deleted` or `Measurements cleared`. A refused 101st shape is announced there and shown briefly in the info strip. The SVG overlay itself is `aria-hidden` and takes no pointer events (selection is hit-tested by geometry in the viewport's own handlers).
- **Limits.** No persistence or export, no text annotations, no ROI statistics (mean/SD), no calibration of images without Pixel Spacing. See [ADR 0005](docs/adr/0005-first-party-measurement-overlay.md).

### Segmentation

![Two painted segments on the gradient study, with the Segments panel](docs/screenshots/09-segmentation-1440.png)
![The segmentation tools inside More at 390px](docs/screenshots/10-segmentation-390.png)

Manual 2D segmentation in the style of OHIF's `Segment ▾` menu, added on request beyond the brief and isolated from the graded viewer ([ADR 0006](docs/adr/0006-first-party-segmentation-overlay.md)). This is software testing, not diagnostic use.

- **Tools.** `Brush (B)`: press and drag to paint the active segment with a filled disc. `Smart brush`: the same, but writes only pixels whose value lies inside the chosen range. `Eraser (E)` (in `Delete ▾`): removes any segment's paint under the disc, including paint of hidden segments. One stroke is press to release; fast drags are interpolated so they leave no gaps. `Esc` drops the stroke in progress (so do a second finger, a tool change, a study switch and closing the viewer). `Ctrl+Z` / `Cmd+Z` on the focused image, or `Undo last stroke` in the panel, reverts the last stroke (20 per study). The first stroke creates `Segment 1` if there is none. Wheel zoom, middle-drag pan and two-finger pinch keep working while a segmentation tool is active.
- **Brush size and opacity.** The Segments panel sets the brush radius in image pixels (`Brush size`, 1-100, default 10) and the overlay `Opacity` (10-100 %, default 50 %).
- **Smart brush ranges.** Presets in Hounsfield units for CT (HU = stored value x Rescale Slope + Rescale Intercept): `Adipose [-190, -30]`, `Soft tissue [-29, 150]`, `Bone [150, 3000]`, and `Custom` with inclusive Minimum / Maximum fields. They are indicative values for software testing, **not diagnostic thresholds**. For any other modality (the synthetic studies are `OT`) the presets are disabled, the range applies to stored pixel values, and the panel says so (`Thresholds apply to stored pixel values`). MONOCHROME1 images paint the pixels as shown (the mask is in image pixels, independent of display polarity).
- **One label per pixel.** A study has up to 8 segments and one label mask: painting a segment replaces another segment's paint there, as in OHIF.
- **Attached to the image.** The mask is in image pixels and drawn through the current zoom, pan, rotation and flips (the e2e test checks the overlay colour at the analytically transformed position). `Fit / Reset` restores the view only; `Clear segments` (in `Delete ▾` and the panel) removes the segments.
- **Per study, in memory.** Segments are kept per study (A → B → A shows A's again) and never persisted (not to the server, not to localStorage); a reload clears them. Masks plus undo history of all studies share a 64 MB budget: the least recently used studies are dropped first, and their Segments panel then says `This study's segments were dropped to stay within the memory limit…`. Images larger than 16,777,216 pixels (4096 x 4096) are refused with `This image is too large to segment…`.
- **Accessible path.** Painting is pointer-only, as in OHIF. The Review panel's **Segments** section is the keyboard and screen-reader path: `Add segment`, a `Paint with Segment 1` button per segment (pressed when it is the one the brush paints) with its colour swatch, a labelled name field, `Hide Segment 1` / `Show Segment 1`, `Delete Segment 1` (focus moves to the next item, else the previous, else the heading; announced politely, repeats included), the area (`px²`, or `mm²` with Pixel Spacing), the brush settings, `Undo last stroke` and `Clear segments`. Refusals and the memory notice appear in an always-mounted status region. The overlay canvas is `aria-hidden` and takes no pointer events.
- **Not included.** No automatic or AI segmentation, no DICOM-SEG import or export, no contours or sculpting, no 3D/MPR, no persistence.

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
- [ADR 0005: First-party measurement overlay](docs/adr/0005-first-party-measurement-overlay.md)
- [ADR 0006: First-party segmentation overlay](docs/adr/0006-first-party-segmentation-overlay.md)

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

| Brief section                                            | What it requires                                                                        | Proven by                                                                                                                                                                     |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 01 Worklist and API                                      | Seed (8 studies, both reviewers), filters, ordering, 100 cap, DTO, file                 | `apps/api/test/seed.test.ts`, `studies-read.test.ts`, `study-file.test.ts`                                                                                                    |
| 01 Claim, complete, note rules, terminal, version bump   | Transitions, 1-1000 trimmed note, retained owner and note                               | `apps/api/test/studies-mutations.test.ts`                                                                                                                                     |
| 02 Validation order and error codes                      | 400, 404, 412 with current, 409, 403, safe messages                                     | `apps/api/test/studies-mutations.test.ts`, `hardening.test.ts`                                                                                                                |
| 02 One winner across two processes                       | One 200 and one 412; works across processes                                             | `studies-mutations.test.ts` (concurrent claims), `scripts/contention-smoke.ts` (`npm run test:contention`)                                                                    |
| 02 Failed completion changes nothing; persistence        | No fields change; survives restart                                                      | `studies-mutations.test.ts`, `apps/api/test/persistence.test.ts`                                                                                                              |
| 03 Drafts, 412, errors, stale responses, duplicates      | Per-study drafts, 412 recovery, out-of-order filters, pending guard                     | `apps/web/src/components/study-panel.test.tsx`, `worklist.test.tsx`, `apps/web/e2e/review-flow.spec.ts`                                                                       |
| 03 Loading, empty, success, error states; keyboard       | States and labelled, keyboard-usable controls; drawer/panel focus                       | `worklist.test.tsx`, `study-panel.test.tsx`, `layout.test.tsx`, `use-layout-state.test.ts`, `study-header.test.tsx`, `apps/web/e2e/layout.spec.ts`                            |
| 04 Real viewer, fixtures, W/L, Fit/Reset, resize         | Real pixels differ per fixture, W/L changes them, Reset restores, resize                | `apps/web/e2e/viewer-render.spec.ts`                                                                                                                                          |
| 04 Corrupt file and recovery                             | Visible error, list usable, next valid study renders                                    | `viewer-render.spec.ts`, `apps/web/src/viewer/use-dicom-viewer.test.ts`, `viewer-error-boundary.test.tsx`                                                                     |
| 04 Switching, closing, disposal, no PHI                  | Only the current image; dispose on close; no raw tags displayed or logged               | `use-dicom-viewer.test.ts`, `apps/web/e2e/viewer-lifecycle.spec.ts`, `apps/api/test/logging.test.ts`                                                                          |
| 05 Lifecycle: five close/reopen cycles                   | No handler or engine accumulation                                                       | `use-dicom-viewer.test.ts`, `viewer-lifecycle.spec.ts` (`window.__viewerStats`)                                                                                               |
| Extra: viewer controls (zoom, pan, rotate, flip, invert) | Each control changes real pixels, undo and Fit / Reset restore them; no listener leaks  | `apps/web/e2e/viewer-controls.spec.ts`, `use-viewport-interactions.test.ts`, `viewer-math.test.ts`, `toolbar.test.tsx`, `viewer-info-strip.test.tsx`, `study-viewer.test.tsx` |
| Extra: measurements (beyond the brief, on request)       | Values in px/mm, glued to image pixels, per-study, list path; no listener leaks         | `apps/web/e2e/measurements.spec.ts`, `annotations/*.test.ts(x)`, `measurement-interactions.test.ts`, `measurements-section.test.tsx`, `toolbar-measurements.test.tsx`         |
| Extra: segmentation (beyond the brief, on request)       | Brush, smart brush, eraser glued to image pixels; undo; per study; panel path; no leaks | `apps/web/e2e/segmentation.spec.ts`, `segmentation/*.test.ts`, `segmentation-interactions.test.ts`, `segments-section.test.tsx`, `toolbar-segments.test.tsx`                  |
| 05 README, migrations, seed, ordinary startup keeps data | Setup/start/reset/test commands; idempotent seed                                        | This file; `apps/api/prisma/migrations`, `apps/api/test/seed.test.ts` (re-seed never overwrites)                                                                              |

## Test results

Recorded on 2026-11-24 (Windows 11, Node 24). The first full run used Docker Desktop with PostgreSQL 15; every row marked (PG 17) was re-run later the same day against a private local PostgreSQL 17 because Docker was unavailable.

| Gate                      | Result                                                                                                                                                                                                                                         |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run lint`            | clean                                                                                                                                                                                                                                          |
| `npm run typecheck`       | clean                                                                                                                                                                                                                                          |
| `npm run format:check`    | clean                                                                                                                                                                                                                                          |
| `npm run verify`          | pass (PG 17): API 71 tests in 10 files, web 250 tests in 34 files (web run twice)                                                                                                                                                              |
| `npm run build`           | pass; entry 20.8 kB + vendor 115.7 kB gzip, lazy viewer chunk 13.1 kB and Cornerstone (928 kB gzip) loaded lazily                                                                                                                              |
| `npm run test:contention` | `rounds=20 ok=20` (PG 17; earlier also on PG 15 and on a freshly created, empty test database)                                                                                                                                                 |
| `npm run test:e2e`        | 42 passed (Playwright, chromium, real API and real viewer; 11 cover the viewer controls, 8 the layout, 7 the measurements, 8 the segmentation)                                                                                                 |
| `npm run app:up` smoke    | Run once on PG 15/Docker BEFORE the layout, measurement, segmentation and local-import changes: `/api/health`, `/api/readyz`, `/docs` 200, file 200 `application/dicom`, study-001 rendered at :8080. Not re-run since: Docker was unavailable |

The viewer-first layout, measurements and segmentation changes each re-ran lint, typecheck, format, the web tests, the web build and the e2e suite against the private PostgreSQL 17. The local DICOM import changed the API (the `local:<uuid>` file-key resolver, its config and tests), so the final pass also re-ran the API suite (71 tests in 10 files, including `study-file-local.test.ts` and `import-dicom-plan.test.ts`) and the contention script on PostgreSQL 17.

## Design decisions and trade-offs

- **Worklist modality vs file modality.** The worklist `modality` is study metadata and is what the filter uses; it can differ from the file's own DICOM modality tag (all three fixtures are `OT`). That lets the modality filter be meaningful with only two image files. The viewer strip is labelled as file metadata and shows the file's value.
- **CPU rendering.** Cornerstone runs in CPU mode so canvas pixels are deterministic and readable in headless Chromium; the e2e tests assert on real pixels. The cost is speed on large or multi-frame images, which are out of scope ([ADR 0003](docs/adr/0003-cpu-rendering-for-deterministic-tests.md)).
- **Viewer-first layout.** The image gets the whole window; the worklist is an overlay drawer (it never resizes the viewport) and the review panel pushes only where there is room (>= 1280px). "Close" in the brief's lifecycle rules is the explicit **Close viewer** button in the Review panel header. The toolbar reaches the lazily loaded viewer through a small store (`viewer-bridge.ts`), so Cornerstone stays out of the main bundle.
- **412 blocks both actions.** After a stale response, Claim and Complete stay disabled for that study until "Refresh and continue", so a user never submits against state they have not seen.
- **First-party measurements.** Measurements are a small SVG overlay and a pointer state machine routed through the viewport's existing handlers, not `@cornerstonejs/tools`: no new dependency, CPU-rendering safe, and the lifecycle counters stay exact ([ADR 0005](docs/adr/0005-first-party-measurement-overlay.md)).
- **First-party segmentation.** In CPU mode Cornerstone 5.19.4's `StackViewport` refuses vtk actors (`addActor`/`addActors` throw; verified in the core sources). That `@cornerstonejs/tools` stack labelmaps would therefore not render is an inference (the tools package was not installed or run; see ADR 0006). So the brush paints a one-byte-per-pixel label mask drawn on a canvas sibling and fed by the same eight viewport handlers ([ADR 0006](docs/adr/0006-first-party-segmentation-overlay.md)).
- **OHIF not used.** OHIF shows patient identifiers by default and ships measurement and multi-series features that are out of scope, and its internals do not expose the listener and engine counts the lifecycle tests assert on. A thin viewer on `@cornerstonejs/core` keeps the metadata whitelist provable ([ADR 0001](docs/adr/0001-thin-cornerstone-viewer-over-ohif.md)).
- **Unpruned API image.** The API runtime image copies the workspace `node_modules` because the seed (`tsx`) and the Prisma CLI run at container start and are dev dependencies. The image is large; acceptable for a demo.
- **Hard-coded modality filter options.** The filter offers CT, MR, CR, US, DX, NM and OT from a constant in the web app instead of loading them from the API.
- **Instrumentation always on.** The `window.__viewerStats` counters are tiny and carry no PHI, so they are present in all builds rather than only in a test build.

## PHI and security notes

- All data is synthetic. Treat the app as software testing, not diagnostic use (this includes the measurement values and the segmentation threshold presets).
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

| Variable            | Default                                                    | Used by                    | Meaning                                                                      |
| ------------------- | ---------------------------------------------------------- | -------------------------- | ---------------------------------------------------------------------------- |
| `PORT`              | `4000`                                                     | API                        | API listen port                                                              |
| `DATABASE_URL`      | `postgresql://imaging:imaging@localhost:5432/imaging`      | API, Prisma                | Development database                                                         |
| `DATABASE_URL_TEST` | `postgresql://imaging:imaging@localhost:5432/imaging_test` | API tests, e2e, contention | Database used when `NODE_ENV=test`                                           |
| `WEB_ORIGIN`        | `http://localhost:5173`                                    | API                        | The one origin CORS allows (the Docker stack sets `http://localhost:8080`)   |
| `API_DOCS_ENABLED`  | `true`                                                     | API                        | `false` removes `/docs` and `/docs/openapi.json`                             |
| `API_PROXY_TARGET`  | `http://localhost:4000`                                    | Vite dev server            | Where `/api` is proxied; must match `PORT`                                   |
| `E2E_API_PORT`      | `4000`                                                     | Playwright                 | Port of the API process Playwright starts                                    |
| `LOCAL_DICOM_DIR`   | `<repo>/local-dicom`                                       | API, `import:dicom`        | Where the dev-only local import copies files and `local:<uuid>` keys resolve |

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
      components/         app shell, worklist, study panel, header, completion form, ui/ primitives
      layout/             layout state, worklist drawer, review panel, dismiss/focus hooks
      toolbar/            data-driven toolbar config, renderer (roving focus), More menu
      viewer/             Cornerstone hook, info strip, viewer bridge, error boundary, viewer stats
        annotations/      measurement math, in-memory store, drawing state machine, image mapper, SVG overlay
        segmentation/     label-mask store (LRU budget, undo diffs), stamping and threshold math, painting state machine, canvas overlay
      queries/ stores/    TanStack Query hooks, session and draft store
      api/                typed client and Zod schemas
    e2e/                  Playwright specs (render, lifecycle, viewer controls, layout, measurements, segmentation, review flow)
    Dockerfile, nginx.conf
docker/                   docker-compose.yml (postgres, plus api and web under the app profile)
fixtures/                 gradient.dcm, checkerboard.dcm, corrupt.dcm
scripts/                  contention-smoke.ts (two-process race), import-dicom*.ts (local import)
docs/
  architecture.md         component and sequence diagrams
  adr/                    architecture decision records
  screenshots/            UI screenshots at 1440, 1024 and 390 px (synthetic studies only)
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
- Measurements live in memory only (cleared on reload) and drawing them needs a pointer; the Review panel's list is the keyboard path.
- Segments live in memory only (64 MB across studies, least recently used dropped first) and painting needs a pointer; the Segments panel is the keyboard path. Smart brush ranges are indicative, not diagnostic.
- The modality filter options are static (CT, MR, CR, US, DX, NM, OT), not loaded from the API.
- One generic viewer failure message covers every load failure (corrupt, unsupported, network).
- Completed is terminal with exactly one note, by design: no edit, release or reassignment.
- The API Docker image is not pruned and is large.
- The restart-persistence test recreates the Nest application on the same database inside one test process. Nothing is cached in memory, so this is equivalent to a restart; the contention script covers separate OS processes.
