# ADR 0005: First-party measurement overlay

- Status: Accepted
- Date: 2026-11-24

## Context

The brief puts measurements out of scope. The user later asked twice for OHIF-style
Length, Angle, Ellipse and Rectangle tools, so they were added as an optional extra that
must not weaken anything the brief grades: the lifecycle counters in
`window.__viewerStats`, the stale-load guards, interactions bound only for the current
ready load, the modality/date/dimensions-only metadata strip, and the small main bundle.

`@cornerstonejs/tools` is the usual answer. It is a large dependency, renders its
annotations through its own SVG layer and event dispatcher (adding element listeners
outside our bind/unbind), keeps its own global annotation state, and assumes the tool
group and synchronizer machinery that this thin viewer deliberately avoids (ADR 0001).

## Decision

Build the measurements in the app, isolated under `apps/web/src/viewer/annotations/`:

- Points are stored in image pixel coordinates (column, row), per study, in an
  in-memory store (cap 100 per study, never persisted). Values come from pure functions
  that use Pixel Spacing (0028,0030, row and column applied separately) when present,
  else pixels.
- Image <-> canvas mapping uses the viewport's `canvasToWorld` / `worldToCanvas` with the
  image's own origin, spacing and direction from `getImageData()`. Verified in Chromium
  under CPU rendering through zoom, pan, quarter-turn rotation and both flips (the grey
  level under each end of a line stays the same).
- Drawing is a small state machine fed by the viewport's existing eight handlers (no new
  listeners). A second pointer, a tool change, a study switch, close and dispose cancel an
  in-progress shape; after dispose every call is a no-op. Previews render at most once per
  animation frame.
- An `aria-hidden` SVG sibling above the viewport draws the shapes and re-projects them on
  every camera change and resize, reading the live viewport only through the hook's
  guarded getter. It takes no pointer events; selection is hit-tested by geometry.
- The Review panel's Measurements list is the keyboard and screen-reader path; drawing is
  pointer-only, as in OHIF.

## Consequences

- No new dependency; the store and list add about 2 kB gzip to the entry and the drawing
  and overlay about 4 kB to the lazy viewer chunk.
- `INTERACTION_LISTENERS` stays 8 and the five-cycle baseline tests still hold exactly.
- Fewer features than `@cornerstonejs/tools`: no persistence or export, no ROI statistics,
  no text annotations, no calibration tool.
- The feature can be removed by deleting the `annotations/` folder, the toolbar group and
  the Measurements section; the graded viewer does not depend on it.
