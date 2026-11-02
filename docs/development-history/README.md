# PosterScore AI Development History

This folder is the permanent record of how PosterScore AI evolves. It is based on the source code, package manifests, existing documentation, and Git evidence when Git is available.

## Accuracy policy

- Verified facts are taken from the current codebase or available Git history.
- Inferred explanations are labelled as inferred.
- Unknown dates, reasons, and commit hashes are recorded as unknown; they are never fabricated.
- Removed features remain documented in `REMOVED_FEATURES.md`.
- The current project has no `.git` directory, so `CHANGE-001` is the earliest known baseline rather than a claim about the true first version.

## Files

- `PROJECT_OVERVIEW.md` — current baseline, scope, stack, and known limitations.
- `FEATURE_REGISTRY.md` — feature inventory and implementation references.
- `ARCHITECTURE_DECISIONS.md` — verified architectural choices and their rationale.
- `REMOVED_FEATURES.md` — features removed from versions that can be verified.
- `CHANGELOG.md` — chronological change records.
- `snapshots/` — milestone descriptions of the project state.
- `releases/` — milestone/release notes.
- `PENDING_UPDATE.md` — generated file-level scan awaiting review, when changes are detected.

## Updating the history

Run this after a meaningful change:

```bash
npm run history:update
```

This performs a read-only scan and writes `PENDING_UPDATE.md`. It reports added, modified, and deleted files since the last recorded scan without guessing which product feature changed.

After reviewing the report, record the factual change with:

```bash
npm run history:update -- --record \
  --title "Short change title" \
  --type Modified \
  --description "What changed in the implementation" \
  --reason "Why it changed"
```

Supported change types are `Added`, `Modified`, `Removed`, `Fixed`, `Refactored`, `Security`, `Documentation`, and `Infrastructure`. Optional `--features` and `--follow-up` values may be supplied as quoted text. The script updates the changelog and scan state; feature-level wording should be reviewed in `FEATURE_REGISTRY.md` so it remains accurate.

The script does not commit, push, reset, delete, or alter Git configuration. If Git is available, its status and commit are included as evidence. If Git is unavailable, the file-hash scan is used.

## Questions this record should answer

- What was the earliest known project state? Read `PROJECT_OVERVIEW.md` and `snapshots/`.
- What changed last week? Search `CHANGELOG.md` by date.
- Which features are active? Read `FEATURE_REGISTRY.md`.
- Which features were removed? Read `REMOVED_FEATURES.md`.
- Why was an architectural choice made? Read `ARCHITECTURE_DECISIONS.md`.
- Which files changed for a feature? Follow the file lists in the relevant changelog entry.
- What did the app look like at a milestone? Read the corresponding snapshot; use Git only when a historical commit exists.
- Can a removed feature be restored? Check its restoration note in `REMOVED_FEATURES.md` and the available source/Git evidence.

## Future AI coding sessions

Before a significant change, inspect this folder. After completing a meaningful change, run the history workflow, review the generated facts, update the feature registry or decision log when needed, and preserve all earlier entries.
