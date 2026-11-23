# ADR 0002: Database compare-and-swap for ownership

- Status: Accepted
- Date: 2026-11-24

## Context

Two reviewers may try to claim the same study at the same moment, and the API may run as
more than one process. Only one claim may win, and a completion must only be accepted from
the current owner at the version the client last saw. An in-process lock (mutex, queue)
cannot protect two API processes, so the guarantee has to live in the database.

## Decision

Every state change is a single conditional statement inside a transaction:

`UPDATE study SET ... WHERE id = ? AND version = ? AND status = ? [AND ownerId = ?]`

Postgres takes a row lock for the update, so concurrent writers serialise and exactly one
sees a matching row. The statement bumps `version`. When it affects one row, the row is
read back inside the same transaction and returned; that read-back is the ownership guard
the response is built from. When it affects zero rows, the current row is re-read and the
failure is classified in a fixed order: 404 not found, 412 stale version, 409 invalid
state, 403 not the owner.

## Consequences

- Exactly one winner for any number of concurrent claimants and any number of processes.
- The loser receives 412 with the current study, so the client can refresh and continue.
- No lock table, no distributed lock and no retry loop on the server.
- The classification step needs a second read, which is acceptable on the failure path.
- All writers must go through this one helper; a direct `update` elsewhere would bypass
  the version check.
