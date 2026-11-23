# ADR 0003: CPU rendering for deterministic tests

- Status: Accepted
- Date: 2026-11-24

## Context

The end-to-end tests read back real canvas pixels to prove that the gradient and
checkerboard fixtures render differently and that window/level and resize change the
output. WebGL output in headless Chromium depends on the GPU, driver and flags, and the
canvas is not always readable. A flaky pixel assertion is worse than none.

The studies are single 256 by 256 frames, so there is no performance reason to prefer the
GPU path.

## Decision

Initialise Cornerstone3D with CPU rendering enabled (`setUseCPURendering`, passed through
the `init()` configuration). The frame is drawn to a plain 2D canvas, which is
deterministic and readable in headless Chromium without GPU flags.

## Consequences

- Pixel assertions are stable on any CI runner and on developer machines.
- No special browser launch flags are needed.
- Large or multi-frame studies would render slower than on the GPU. That is outside this
  app's scope and is recorded as a known trade-off.
- Switching to GPU rendering later is a one-line configuration change, but the pixel tests
  would then need tolerance-based comparison.
