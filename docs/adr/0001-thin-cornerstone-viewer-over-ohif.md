# ADR 0001: Thin Cornerstone3D viewer instead of OHIF

- Status: Accepted
- Date: 2026-11-24

## Context

The app needs to show one single-frame DICOM image per study, with window/level, fit and
reset. OHIF is the obvious off-the-shelf option and is built on Cornerstone3D. Three
things argued against adopting it here:

- OHIF displays patient identifiers by default. This app must show only a whitelist of
  non-identifying tags, and that rule has to be provable from the code.
- OHIF ships features that are explicitly out of scope: measurements, 3D rendering,
  multi-series layouts.
- The lifecycle tests assert that closing and reopening a study leaves no extra event
  listeners or rendering engines behind. OHIF does not expose those counts.

A related pattern is to run OHIF as a standalone application in a sandboxed iframe fed by
a DICOMweb endpoint, rather than embedding its npm packages in the host app. Embedding the
packages couples the host build to OHIF's dependency tree and release cadence.

## Decision

Build a thin viewer directly on `@cornerstonejs/core` and
`@cornerstonejs/dicom-image-loader`. The viewer owns its engine lifecycle, exposes small
instrumentation counters (listeners, engines, loads), renders only whitelisted metadata,
and is loaded lazily so the worklist does not pay for it up front.

## Consequences

- The metadata whitelist and lifecycle guarantees are enforced and tested in our own code.
- Scope stays small; there is no measurement, 3D or multi-series code to maintain.
- We maintain the glue (init, session guard, controls) ourselves.
- The OHIF-style controls (window/level, pan and zoom drag tools, wheel and pinch zoom,
  rotation, flips, invert, keyboard shortcuts) are our own pointer, wheel and keyboard
  handlers over the Cornerstone camera and property API (`setZoom`, `setCamera`,
  `setViewPresentation`, `setProperties`, `resetCamera`, `resetProperties`).
  `@cornerstonejs/tools` is deliberately not used: our handlers are bound only once the
  current load is ready, removed on study change and close, and counted by the same
  `window.__viewerStats` instrumentation, so the listener lifecycle stays observable and
  tested. Under CPU rendering in 5.19.4, rotation must go through `setViewPresentation`
  because the CPU `setCamera` path ignores it, and flips are mirrored in image axes before
  rotation, so the buttons map screen flips onto image axes.
  MONOCHROME1 images are shown inverted by the CPU renderer's own viewport flag, which the
  StackViewport `invert` property does not reflect, so Invert is applied relative to the
  file's photometric interpretation and re-applied after `resetProperties()`.
- If a full diagnostic viewer is later required, the iframe plus DICOMweb pattern is the
  preferred route, and it would sit beside this viewer rather than replace it.
