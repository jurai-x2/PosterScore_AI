# Project instructions for future coding sessions

## Development history is required

Before making a significant change, read `docs/development-history/README.md`, `PROJECT_OVERVIEW.md`, the relevant feature entries, and recent `CHANGELOG.md` entries.

After completing a meaningful change:

1. Run `npm run history:update`.
2. Review `docs/development-history/PENDING_UPDATE.md`.
3. Record factual changes with `npm run history:update -- --record ...`.
4. Update `FEATURE_REGISTRY.md` for added, modified, deprecated, or removed features.
5. Update `ARCHITECTURE_DECISIONS.md`, `REMOVED_FEATURES.md`, snapshots, or releases when applicable.

Preserve all earlier entries. Never silently erase documented history, invent dates/reasons/commit hashes, or claim a feature existed without source, documentation, or Git evidence. If classification is uncertain, say `requires review` and leave the fact unresolved.

## General project rules

- Keep provider credentials server-only; never commit `.env` or expose keys through `VITE_` variables.
- Run `npm test` and `npm run build` after meaningful implementation changes.
- Do not commit, push, reset, or alter Git configuration unless explicitly requested.
