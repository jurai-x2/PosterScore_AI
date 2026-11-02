# PosterScore AI — Project Overview

## Baseline status

- Baseline ID: `SNAPSHOT-001`
- Recorded: 2026-11-02
- Historical certainty: current codebase verified; earlier project history unavailable
- Git commit: unavailable because the project directory is not a Git repository

PosterScore AI is a full-stack poster review MVP. A user uploads a JPG, PNG, or WEBP image, optionally supplies target context, and receives poster/non-poster classification, measured image facts, category scores, deterministic rule evidence, strengths, and prioritized art-director recommendations.

## Current stack

- React 19, TypeScript, Vite, and custom CSS for the browser UI.
- Node.js and Express 5 for the API.
- Multer for in-memory multipart uploads.
- Sharp for decoding, safety checks, orientation, measurements, resizing, and JPEG preprocessing.
- Google Gemini through `@google/genai` for visual reasoning.
- Zod for request and model-output validation.
- Vitest for unit, schema, reliability, and optional multipart integration tests.

## Current architecture

```text
Browser (React + Vite)
  -> multipart image + JSON context
Express API
  -> Multer memory upload and rate limit
  -> Sharp validation and image measurements
  -> deterministic rules and evidence
  -> Gemini classification and critique
  -> Zod validation and bounded correction loop
  -> deterministic weighted score and score caps
  -> browser report, markers, history, and print flow
```

## Current active capabilities

- Drag-and-drop and file-picker upload.
- Poster versus non-poster classification before scoring.
- Seven design categories with type-aware weighting.
- Evidence checks with passed, failed, and not-evaluated states.
- Stable visible-element IDs for critique grounding.
- Priority-filtered improvements and optional image markers.
- Low-confidence preservation when a valid report exists but the provider/correction budget ends.
- Browser-local version history and browser print-to-PDF export.
- Gemini error classification, bounded budgets, retries, and safe user-facing messages.
- Demo/mock mode for UI inspection without a provider key.
- GitHub Actions CI for tests and production build verification.

## Known limitations

- No PostgreSQL database, authentication, cloud image storage, or server-side report history exists in this MVP.
- Browser history uses `localStorage` and is limited to recent client-side results.
- PDF export uses the browser print dialog rather than a dedicated PDF renderer.
- No Vercel or Render deployment configuration is present in the repository.
- No deterministic OCR/layout detector supplies full text boxes, font metrics, or exact WCAG contrast measurements.
- Earlier versions, deleted files, and original product decisions cannot be reconstructed without Git or another historical source.
