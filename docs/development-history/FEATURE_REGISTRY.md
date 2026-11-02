# Feature Registry

Status values: `Active`, `Modified`, `Deprecated`, or `Removed`.

Last automated scan: 2026-11-02T12:09:46.053Z — CHANGE-20261102T120946Z

Because Git history is unavailable, `First introduced` means the earliest verified appearance in the current baseline, not the true historical introduction date.

## Active features

| ID | Feature | Description | Status | First introduced | Last verified | Related files | Dependencies | History |
|---|---|---|---|---|---|---|---|---|
| F-001 | Poster upload | JPG/JPEG/PNG/WEBP picker, drag-and-drop, 10 MB limit, preview, and removal | Active | Unknown; verified in baseline | 2026-11-02 | `src/App.tsx`, `server/app.ts`, `server/validation.ts` | React, Express, Multer, Sharp | CHANGE-001 |
| F-002 | Poster classification | Distinguishes designed posters from non-poster images before scoring | Active | Unknown; verified in baseline | 2026-11-02 | `server/vision.ts`, `server/analysis.ts`, `src/App.tsx` | Gemini, Zod | CHANGE-001 |
| F-003 | Image measurement pipeline | Measures dimensions, orientation, dominant colors, whitespace estimate, and image coverage | Active | Unknown; verified in baseline | `server/validation.ts`, `server/rules.ts` | Sharp | CHANGE-001 |
| F-004 | Gemini visual analysis | Generates structured visual checks, intent, critique, strengths, and improvements | Active | Unknown; verified in baseline | `server/vision.ts`, `server/app.ts` | `@google/genai`, Gemini API | CHANGE-001 |
| F-005 | Deterministic rule engine | Evaluates evidence rules with pass/fail/not-evaluated states and score caps | Active | Unknown; verified in baseline | `server/rules.ts`, `src/rules.ts` | TypeScript | CHANGE-001 |
| F-006 | Weighted scoring | Calculates category and overall scores, applies poster-type weights and caps | Active | Unknown; verified in baseline | `server/analysis.ts`, `server/score.ts`, `src/score.ts` | TypeScript, Zod | CHANGE-001 |
| F-007 | Structured art-director critique | Shows intent, root causes, one big move, top fixes, keep, polish, and alternatives | Active | Unknown; verified in baseline | `server/analysis.ts`, `src/App.tsx`, `src/types.ts` | React, Zod | CHANGE-001 |
| F-008 | Provider reliability controls | Uses request IDs, timing logs, bounded retries, provider classification, and analysis budgets | Active | 2026-10-30; verified from current source history in workspace context | `server/budget.ts`, `server/provider.ts`, `server/timing.ts`, `server/vision.ts` | Gemini SDK, Node.js | CHANGE-001 |
| F-009 | Priority improvements | Sorts recommendations and filters high/medium/low priority items | Active | Unknown; verified in baseline | `src/App.tsx`, `src/analysisApi.ts`, `src/styles.css` | React | CHANGE-001 |
| F-010 | Visual issue markers | Displays validated model-provided anchors over the poster image | Active | Unknown; verified in baseline | `src/App.tsx`, `src/styles.css`, `src/types.ts` | React, CSS | CHANGE-001 |
| F-011 | Browser version history | Stores up to five recent reports in browser `localStorage` | Active | Unknown; verified in baseline | `src/App.tsx` | Browser localStorage | CHANGE-001 |
| F-012 | Print-to-PDF report | Opens the browser print flow with print-specific CSS | Active | Unknown; verified in baseline | `src/App.tsx`, `src/styles.css` | Browser print API | CHANGE-001 |
| F-013 | Demo/mock analysis | Supports UI testing without Gemini through Vite mock mode and server demo mode | Active | Unknown; verified in baseline | `src/analysisApi.ts`, `server/app.ts`, `.env.example` | Vite, Express | CHANGE-001 |
| F-014 | Automated CI verification | Runs install, Vitest, and production build on pushes and pull requests | Active | Unknown; verified in baseline | `.github/workflows/ci.yml` | GitHub Actions, npm | CHANGE-001 |

## Not implemented in the verified baseline

These are not registered as active features because the source contains no implementation evidence:

- PostgreSQL persistence or evaluation-record schema.
- Server-side historical review dashboard or aggregate scoring metrics.
- Vercel deployment configuration.
- Render deployment configuration.
- Authentication and user accounts.

When one of these is implemented, add a new feature ID and a changelog entry. Do not rewrite this section as if it had existed earlier.
