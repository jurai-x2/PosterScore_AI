# Architecture Decisions

These decisions describe the verified current implementation. They are not claims about the original author's intent unless explicitly marked as inferred.

## DEC-001 — Keep the Gemini key server-side

- Status: Active
- Recorded: 2026-11-02
- Evidence: `server/vision.ts`, `.env.example`, `README.md`
- Decision: The browser calls the Express API; only the server reads `GEMINI_API_KEY`.
- Reason: Prevent exposing the provider credential in Vite client variables or browser requests.
- Trade-off: The API must be running for real analysis.

## DEC-002 — Separate deterministic scoring from AI interpretation

- Status: Active
- Recorded: 2026-11-02
- Evidence: `server/rules.ts`, `server/analysis.ts`
- Decision: Code owns measurable rule results, caps, weights, and final score math; Gemini supplies interpretation and recommendations.
- Reason: Reduce score inflation and make failures explainable.

## DEC-003 — Process uploaded images in memory

- Status: Active
- Recorded: 2026-11-02
- Evidence: `server/app.ts`, `server/validation.ts`, `README.md`
- Decision: Multer stores uploads in memory and Sharp preprocesses them without application-level persistence.
- Reason: Keep the MVP simple and avoid introducing storage/database infrastructure.
- Trade-off: Reports are not durable on the server.

## DEC-004 — Use browser-local history rather than a database

- Status: Active limitation
- Recorded: 2026-11-02
- Evidence: `src/App.tsx`, `README.md`
- Decision: Store up to five recent reports in `localStorage`.
- Reason: Provide lightweight iteration history without authentication or backend persistence.
- Trade-off: History is device/browser-specific and can be cleared.

## DEC-005 — Export through the browser print flow

- Status: Active
- Recorded: 2026-11-02
- Evidence: `src/App.tsx`, `src/styles.css`
- Decision: The report uses `window.print()` and print CSS rather than a server PDF renderer.
- Reason: Avoid a PDF dependency in the MVP.
- Trade-off: PDF output depends on browser print settings.

## DEC-006 — Record uncertainty instead of inventing unavailable measurements

- Status: Active
- Recorded: 2026-11-02
- Evidence: `server/rules.ts`, `server/analysis.ts`, `src/App.tsx`
- Decision: Rules can be not evaluated when required facts or detection confidence are missing.
- Reason: Preserve trust when OCR, layout, or exact contrast measurements are unavailable.
