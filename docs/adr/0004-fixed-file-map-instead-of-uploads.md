# ADR 0004: Fixed file map instead of uploads

- Status: Accepted
- Date: 2026-11-24

## Context

Each study points at a DICOM file, and the API must serve those bytes to the viewer. The
scope explicitly excludes uploading files. Any design where the client names a file path
risks path traversal and arbitrary file reads, and a general upload endpoint would add
validation, storage and cleanup work that nobody asked for.

## Decision

Studies store a `fileKey`, never a path. The API holds a fixed, server-side map from each
known `fileKey` to a file inside the fixtures directory. `GET /api/studies/:id/file`
looks the key up in that map and streams the file; an unknown key is an error. The client
never supplies, and never sees, a filesystem path.

## Consequences

- Path traversal is impossible by construction, because no user input reaches the
  filesystem layer.
- The core design has no upload endpoint, which matches the brief's scope (see the later addition below).
- Adding a new study image means adding a fixture and a map entry in code, which is a
  deliberate friction for a demo dataset.
- The dev-only local import (`npm run import:dicom`) adds a second, server-generated key
  form, `local:<uuid>`: it must match a strict regex and resolves to `<uuid>.dcm` inside
  `LOCAL_DICOM_DIR` (checked again after resolution). Clients still never send a key or a
  path.
- An optional `POST /api/studies/upload` was added later at the user's request, beyond the
  brief. It reuses the same `local:<uuid>` form: the server generates the uuid, validates the
  bytes as a supported DICOM image (64 MB cap, `application/dicom` only), and stores the file
  itself, so the path-traversal argument still holds. It has no authentication or quota.
- A real deployment would replace the map with object storage or a DICOMweb source behind
  the same `fileKey` abstraction.
