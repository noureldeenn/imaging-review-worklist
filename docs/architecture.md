# Architecture

## Components

In development the browser talks to the Vite dev server, which proxies `/api` to NestJS.
In the Docker `app` profile, nginx serves the built SPA and proxies `/api` and `/docs`.

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

## Viewer load and the stale guard

Every load takes a sequence token. A result that arrives after the user switched or
closed the study carries an old token and is discarded instead of being drawn.

```mermaid
sequenceDiagram
  participant U as Reviewer
  participant H as Viewer hook
  participant C as Cornerstone
  participant A as API
  U->>H: select study A
  H->>H: token = 1, state loading
  H->>C: setStack(A)
  C->>A: GET /api/studies/A/file
  U->>H: select study B
  H->>H: token = 2, tear down A, state loading
  H->>C: setStack(B)
  A-->>C: bytes for A (late)
  C-->>H: A resolved
  H->>H: token 1 is not current, discard
  A-->>C: bytes for B
  C-->>H: B resolved
  H->>H: token 2 is current, render, state ready
```

## Two reviewers claiming one study

```mermaid
sequenceDiagram
  participant R1 as Reviewer A
  participant R2 as Reviewer B
  participant API as NestJS
  participant DB as PostgreSQL
  R1->>API: POST /claim (version 1)
  R2->>API: POST /claim (version 1)
  API->>DB: UPDATE study ... WHERE id AND version=1 AND status=Unassigned
  API->>DB: UPDATE study ... WHERE id AND version=1 AND status=Unassigned
  Note over DB: row lock serialises the two statements
  DB-->>API: 1 row (A wins, version 2)
  DB-->>API: 0 rows (B)
  API->>DB: read back current row
  API-->>R1: 200 study, owner A
  API-->>R2: 412 with current study
```

## Request lifecycle

Each request gets an `X-Request-Id` (a valid incoming one is reused, otherwise generated),
which is echoed in the response and attached to every pino log line for that request;
pino redacts sensitive fields. Validation uses Zod. Failures leave the API in one error
envelope, `{ code, message, current? }`, where `current` is the up-to-date study on 412/409/403
conflicts so the client can refresh without another call.

## Known trade-offs

- Image size: the API runtime image copies the whole workspace `node_modules` and is not
  pruned. The seed runs through `tsx` and migrations through the Prisma CLI at container
  start, and both are dev dependencies, so a clean prune would mean reshuffling
  dependencies. Prod image is therefore large; acceptable for a demo.
- CPU rendering: deterministic pixels for tests, but slow for large or multi-frame
  images (ADR 0003).
- The modality filter options are hard-coded in the web app rather than loaded from the API.
- There is no upload endpoint; studies map to fixed fixture files, or to server-generated
  `local:<uuid>` keys from the dev-only local import, resolved inside `LOCAL_DICOM_DIR` (ADR 0004).
