# Development Changelog

Entries are chronological and preserve earlier records. Dates and commit hashes are only recorded when supported by evidence.

## CHANGE-001 — Current MVP Baseline Recorded

Date: 2026-11-02

Type: Documentation

### Description

Recorded the earliest known state of the project in the permanent development-history system. The current source, package manifest, README, tests, CI workflow, and UI were inspected. The project directory has no Git metadata, so this is a verified current baseline rather than a reconstructed first commit.

### Reason

Create a reliable starting point without inventing unavailable historical details.

### Features

- Poster upload and preview.
- Poster/non-poster classification.
- Sharp image validation and measurement.
- Gemini visual analysis.
- Deterministic rules, score caps, and weighted scoring.
- Structured art-director critique.
- Priority improvements and visual issue markers.
- Browser-local version history.
- Browser print-to-PDF flow.
- Demo/mock mode.
- Vitest coverage and GitHub Actions CI.

### Files Created

- `docs/development-history/README.md`
- `docs/development-history/PROJECT_OVERVIEW.md`
- `docs/development-history/FEATURE_REGISTRY.md`
- `docs/development-history/ARCHITECTURE_DECISIONS.md`
- `docs/development-history/REMOVED_FEATURES.md`
- `docs/development-history/CHANGELOG.md`
- `docs/development-history/snapshots/SNAPSHOT-001-baseline.md`
- `docs/development-history/releases/RELEASE-001-mvp-baseline.md`
- `scripts/update-history.mjs`
- `AGENTS.md`

### Files Modified

- `package.json`

### Files Removed

None.

### Dependencies

No dependencies added or removed. The history workflow uses Node.js built-ins only.

### Git

No commit hash available; the project directory is not a Git repository.

### Limitations and follow-up

- Earlier feature dates and removed features require a Git repository, backups, or other project records.
- The generated update workflow records file facts; future feature semantics must be reviewed against the source before updating the registry.
- PostgreSQL, server-side history, aggregate dashboard metrics, and deployment infrastructure are not part of this baseline.

## CHANGE-20261102T120946Z — Stabilized reliability test coverage

Date: 2026-11-02T12:09:46.053Z

Type: Fixed

### Description

Made the bounded retry-backoff test deterministic with fake timers and corrected the history updater to rescan after writing records.

### Reason

Ensure the verification suite is stable and future history scans do not immediately report the changelog update as an unrecorded change.

### Features

F-008 Provider reliability controls; development-history workflow

### Files Created

- None

### Files Modified

- scripts/update-history.mjs
- tests/analysis.test.ts

### Files Removed

- None

### Dependencies

No package manifest changes detected.

### Git

- Repository available: no
- Commit: unavailable

### Limitations and follow-up

Review future PENDING_UPDATE.md reports and update feature-level documentation when implementation changes affect behavior.
