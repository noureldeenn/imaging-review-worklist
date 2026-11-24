# ADR 0006: First-party segmentation overlay

- Status: Accepted
- Date: 2026-11-24

## Context

The brief lists segmentation-like extras as out of scope. The user asked twice for the OHIF
`Segment ▾` tools (brush, threshold brush, eraser, a Segments panel), so they were added
as an isolated optional extra that must not weaken anything graded (lifecycle counters,
stale-load guards, interactions bound per ready load, no patient tags, small entry bundle).

Cornerstone renders labelmaps through `@cornerstonejs/tools` segmentation representations.
This app runs Cornerstone 5.19.4 in CPU mode (ADR 0003) and does not install the tools
package. What was checked:

- **Verified in `@cornerstonejs/core` 5.19.4 sources** (`StackViewport.js`): in CPU mode
  `addActor`, `addActors`, `getActors`, `getDefaultActor` and `getRenderer` are mapped to
  `getCPUFallbackError(...)` (an error "cannot be used during CPU Fallback mode"), and
  `customRenderViewportToCanvas` draws only the one image (`drawImageSync`). `addImages`,
  the stack overlay path, builds vtk image actors and calls `addActors`.
- **From the Cornerstone docs (Context7)**: labelmaps are added with
  `segmentation.addSegmentationRepresentations`; the newer Generic/planar viewport has a CPU
  `CanvasActor` path for overlays, but that is a different viewport class from the
  `StackViewport` used here.
- **Assumed, not verified** (the tools package is not installed and its sources were not
  read): that its stack-labelmap display goes through `addImages`/actors and would
  therefore fail or not render on a CPU `StackViewport`. Not tried at runtime.

## Decision

Build it in the app, under `apps/web/src/viewer/segmentation/`:

- **One label mask per study** (`Uint8Array(rows*columns)`, 0 = none, 1-8 = a segment's
  stable label). Painting segment N overwrites other labels, as in OHIF. Max 8 segments.
- **Memory**: masks above 16,777,216 pixels are refused with a message. Masks plus undo
  diffs of all studies share a 64 MB budget; the least recently used studies are dropped
  first and their Segments panel says so. In memory only, never persisted.
- **Undo**: each stroke is a sparse diff (changed indices + previous labels, 5 bytes per
  pixel, recorded in growable typed arrays with a first-write bitset, so a whole-image
  stroke cannot hit a `Map` size limit), 20 per study. Deleting a segment or clearing resets undo for that study.
- **Painting** is a state machine fed by the viewport's existing eight handlers
  (`INTERACTION_LISTENERS` stays 8). Discs are stamped along an interpolated path; the smart
  brush gates on the displayed image's pixel data (`getCornerstoneImage().getPixelData()`,
  HU = stored x slope + intercept unless the loader pre-scaled; stored values for non-CT).
  Escape, a second pointer, a tool switch, a study switch, close and dispose cancel a stroke
  and restore the mask.
- **Rendering**: an `aria-hidden` canvas sibling above the viewport. The mask is coloured
  into an offscreen image-sized canvas (dirty rectangles, once per frame) and drawn with the
  image -> canvas affine derived from the viewport mapper at (0,0), (1,0), (0,1), which is
  exact for zoom, pan, quarter turns and flips because the CPU path maps pixel (c, r) to
  [c, c+1) x [r, r+1).

## Consequences

- No new dependency and no Cornerstone labelmap state; the five-cycle listener baseline holds.
- The overlay's offscreen RGBA canvas costs 4 bytes per image pixel (64 MB at 4096 x 4096) on top of the 1-byte mask; it exists only for the open study and is freed on unmount.
- Only 2D single-frame painting: no automatic/AI segmentation, DICOM-SEG import/export, contours, 3D/MPR or persistence. Pixel-based area only (px², or mm² with Pixel Spacing).
- Thresholds are indicative presets for software testing, not diagnostic values. Removable by
  deleting the folder, the toolbar group, the Delete items and the panel section.
