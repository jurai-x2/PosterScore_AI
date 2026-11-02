# PosterScore AI

PosterScore AI is a full-stack poster review tool that acts like a visual design director. It first checks whether an upload is actually a poster, then combines image-level measurements with Gemini visual reasoning to produce evidence-based category scores and a prioritized improvement plan.

## Main features

- JPG, JPEG, PNG, and WEBP upload with drag-and-drop
- 10 MB file limit, MIME/extension checks, corruption checks, and pixel-dimension safeguards
- Poster versus non-poster classification before scoring
- Seven design categories: layout, typography, readability, imagery, message/CTA, color, and branding
- Type-aware weighted scoring with conditional branding redistribution
- Evidence checks, visible limitations, confidence, three-second attention order, strengths, and prioritized recommendations
- Structured art-director critique with intent, root causes, one big move, element-ID targets, measured evidence, up to three top fixes, keep/polish guidance, and low-score alternative directions
- Deterministic rule registry with standard/principle/heuristic basis labels and honest not-evaluated states when detection confidence or required facts are missing
- Rule-focused Vitest fixtures covering baseline pass cases, element-targeted failures, confidence skips, vague critique rejection, critical-rule coverage, inflation guards, and score caps
- Optional issue markers only when Gemini returns valid coordinates
- Browser version history and print-to-PDF report export
- Demo/mock mode for UI work without Gemini

## Architecture

```text
React + Vite browser
        │  multipart image + JSON context
        ▼
Express API
  ├─ Multer memory upload + rate limit
  ├─ Sharp validation, orientation, measurements, JPEG preprocessing
  ├─ Deterministic design-rule registry with pass/fail/not-evaluated evidence
  ├─ Gemini provider with bounded retry policy
  ├─ Zod schema + rule-aware quality-control correction loop
  └─ deterministic weighted score with rule caps + report response
```

The Gemini key is server-only. It must never be placed in a `VITE_` variable or sent to the browser. Uploaded images are processed in memory and are not persisted by the backend.

## Technology stack

- React 19, TypeScript, and custom CSS
- Vite 6 for frontend development and bundling
- Node.js, Express 5, Multer, and CORS for the API
- Google Gemini through `@google/genai`
- Sharp for safe image decoding, orientation, resizing, flattening, and measurements
- Zod for strict model-output and context validation
- Vitest for scoring, validation, reliability, response-guard, and integration-test coverage

## Installation and local development

```bash
npm install
cp .env.example .env
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). `npm run dev` starts both the Vite frontend and Express API. Use `npm run dev:ui` when you only need the frontend.

### Demo mode

To inspect the complete UI without a Gemini key:

```bash
VITE_USE_MOCK_ANALYSIS=true DEMO_MODE=true npm run dev
```

The browser mock keeps the loading, report, filters, markers, history, and print flow testable. The server demo path is also available when the frontend calls the API and `DEMO_MODE=true` is set without a Gemini key.

## Environment variables

Copy `.env.example` to `.env` and fill in only local values:

| Variable | Purpose |
| --- | --- |
| `GEMINI_API_KEY` | Server-side Gemini API key. |
| `GEMINI_VISION_MODEL` | Primary model ID enabled for the Gemini project. |
| `GEMINI_FALLBACK_MODELS` | Optional comma-separated model IDs enabled for the same project; used only for model-unavailable errors. |
| `GEMINI_RETRY_ATTEMPTS` | Maximum attempts per configured model, capped by the server. |
| `GEMINI_RETRY_INITIAL_DELAY_MS` | Initial exponential-backoff delay. |
| `GEMINI_RETRY_MAX_DELAY_MS` | Maximum retry delay. |
| `GEMINI_TIMEOUT_MS` | Per-request provider timeout. |
| `DEMO_MODE` | Enables the server demo response when no key is configured. |
| `VITE_USE_MOCK_ANALYSIS` | Uses the browser-only mock analysis. |
| `PORT` | Express port; defaults to `8787`. |
| `CORS_ORIGIN` | Comma-separated browser origins allowed to call the API. |

Do not commit `.env` or live credentials. `.env.example` contains placeholders only.

## Analysis pipeline

1. The client validates the extension, MIME type, and 10 MB limit before upload.
2. The server validates the bytes with Sharp, rejects corrupt or unsafe dimensions, and measures dimensions, orientation, palette, whitespace estimate, and contrast-edge coverage.
3. Sharp rotates according to EXIF, resizes to a maximum of 2400px, flattens transparency, and produces a JPEG for Gemini.
4. Gemini classifies poster versus non-poster and returns category checks plus evidence, not final math. It also maps visible elements to stable IDs for grounded critique.
5. The deterministic rule registry evaluates measurable checks first. It reports pass/fail/not-evaluated with visible evidence; unavailable OCR/layout metrics are not guessed.
6. Gemini receives the rule results as ground truth, drafts the critique and category scores, and the server validates targets, quantified fixes, critical-rule coverage, contradictions, inflation, and alternative-direction limits.
7. If quality checks fail, the server allows at most two correction passes. A report that remains unreliable is rejected instead of being silently shown.
8. The backend calculates each category score from its 0–10 checks, applies deterministic rule caps, applies explicit poster-type weights, redistributes branding weight when branding is not judgeable, and clamps all final scores to 0–100.
9. The browser renders the score, rule evidence, measured facts, confidence, limitations, category scores, and the structured art-director critique. Alternative layout directions appear only when the normalized overall score is below 60/100.

## API

### `GET /api/health`

Returns server status, demo mode, provider, configured model, and whether a key is present. It never returns the key.

### `POST /api/analyze`

Accepts `multipart/form-data`:

- `image`: JPG, JPEG, PNG, or WEBP, up to 10 MB
- `context`: JSON with `targetPlatform`, `goal`, `audience`, and `brandInfo`

Successful responses return `{ success: true, analysis, requestId }`. Failures return a stable error code, a safe user-facing message, a retryable flag, and a request ID. Provider logs include request ID, model, category, retry count, and duration without logging keys or image data.

## Testing and production build

```bash
npm test
npm run build
```

The default test run does not bind a local socket because the managed execution sandbox blocks socket creation. Multipart API integration tests are included and can be run in a normal local environment with:

```bash
RUN_HTTP_INTEGRATION=true npm test
```

The test suite covers deterministic scoring, normalized weights, conditional branding, schema failures, quality-control corrections, upload validation, provider error classification, bounded retries, non-poster behavior, API response guarding, and the real multipart boundary when socket binding is available.

## Important limitations

- Whitespace and coverage are image-level estimates, not OCR or exact layout measurements.
- The current MVP does not include a deterministic OCR/layout detector. Rules that require text bounding boxes, font metrics, contrast ratios, or saliency are therefore shown as not evaluated until that detector is added; the app does not invent those facts.
- The app does not claim exact font-size detection, OCR accuracy, WCAG contrast ratios, or color-blind simulation.
- Gemini judgments are evidence-led interpretations, not objective truth.
- Structural judgments about legibility, hierarchy, spacing, and clarity are the most dependable signals. Style and concept feedback is presented as suggestions rather than facts; calibration data should be used to measure where the AI is reliable.
- Coordinates are displayed only when returned by the model and validated; the UI no longer invents locations.
- There is no database, authentication, cloud image storage, or server-side report history in this MVP.
- PDF export uses the browser print flow rather than a dedicated server PDF renderer.

## Production checklist

- Use a model ID confirmed as enabled for the Gemini project.
- Keep the Gemini key in server environment variables only.
- Set a production CORS allowlist instead of the development-wide default.
- Put the API behind HTTPS and a durable rate limiter when deployed across multiple instances.
- Run `npm test` and `npm run build` in CI before deployment.
