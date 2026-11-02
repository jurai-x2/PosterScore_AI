# SNAPSHOT-001 — Verified MVP Baseline

Date: 2026-11-02

Git commit: unavailable; no `.git` directory exists in the project root.

## Project structure

```text
server/       Express API, Gemini provider, rules, validation, scoring support
src/          React UI, API client, types, browser-side rules and styling
tests/        Vitest suites
scripts/      smoke and report/history utilities
.github/      CI workflow
docs/         project and development-history documentation
```

## Active features

See `FEATURE_REGISTRY.md`. The verified baseline includes upload, classification, image measurements, Gemini analysis, deterministic rules, weighted scoring, structured critique, priority improvements, markers, browser history, print flow, demo mode, and CI.

## Major decisions

See `ARCHITECTURE_DECISIONS.md`: server-only provider key, in-memory image processing, deterministic score ownership, browser-local history, browser print export, and explicit uncertainty.

## Dependencies

The runtime and test dependencies are recorded in the root `package.json` and `package-lock.json`. No dependency list is duplicated here so the snapshot does not drift.

## Current-state limitations

No database, authentication, cloud storage, server-side history dashboard, or deployment configuration is verified in this snapshot.
