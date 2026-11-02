from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "output" / "pdf" / "posterscore-ai-project-overview.pdf"
OUTPUT.parent.mkdir(parents=True, exist_ok=True)
PAGE_W, PAGE_H = A4
INK = colors.HexColor("#18211e")
MUTED = colors.HexColor("#66746b")
LIME = colors.HexColor("#a6c93f")
PALE = colors.HexColor("#eef3e4")
LINE = colors.HexColor("#d9e2da")
SOFT = colors.HexColor("#f5f7f3")

FONT_DIR = Path("/System/Library/Fonts/Supplemental")
pdfmetrics.registerFont(TTFont("ProjectSans", str(FONT_DIR / "Arial.ttf")))
pdfmetrics.registerFont(TTFont("ProjectSans-Bold", str(FONT_DIR / "Arial Bold.ttf")))

styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name="CoverKicker", parent=styles["Normal"], fontName="ProjectSans-Bold", fontSize=9, leading=12, textColor=LIME, spaceAfter=12))
styles.add(ParagraphStyle(name="CoverTitle", parent=styles["Title"], fontName="ProjectSans-Bold", fontSize=31, leading=34, textColor=INK, spaceAfter=14))
styles.add(ParagraphStyle(name="CoverSub", parent=styles["Normal"], fontName="ProjectSans", fontSize=13, leading=19, textColor=MUTED, spaceAfter=18))
styles.add(ParagraphStyle(name="H1x", parent=styles["Heading1"], fontName="ProjectSans-Bold", fontSize=23, leading=27, textColor=INK, spaceBefore=4, spaceAfter=14))
styles.add(ParagraphStyle(name="H2x", parent=styles["Heading2"], fontName="ProjectSans-Bold", fontSize=14, leading=17, textColor=INK, spaceBefore=10, spaceAfter=6))
styles.add(ParagraphStyle(name="Bodyx", parent=styles["BodyText"], fontName="ProjectSans", fontSize=9.5, leading=14, textColor=MUTED, spaceAfter=7))
styles.add(ParagraphStyle(name="Mono", parent=styles["Code"], fontName="Courier", fontSize=8, leading=11, textColor=INK))
styles.add(ParagraphStyle(name="Callout", parent=styles["BodyText"], fontName="ProjectSans-Bold", fontSize=10, leading=14, textColor=INK, backColor=PALE, borderColor=LIME, borderWidth=1, borderPadding=10, spaceBefore=8, spaceAfter=10))
styles.add(ParagraphStyle(name="TableHead", parent=styles["BodyText"], fontName="ProjectSans-Bold", fontSize=8.5, leading=11, textColor=INK))
styles.add(ParagraphStyle(name="TableCell", parent=styles["BodyText"], fontName="ProjectSans", fontSize=8.2, leading=11, textColor=MUTED))


def P(text, style="Bodyx"):
    return Paragraph(text, styles[style])


def bullet(text):
    return Paragraph(f"<font color='#a6c93f'>+</font>&nbsp;&nbsp;{text}", styles["Bodyx"])


def make_table(rows, widths):
    cells = []
    for row_index, row in enumerate(rows):
        cells.append([cell if hasattr(cell, "wrap") else P(str(cell), "TableHead" if row_index == 0 else "TableCell") for cell in row])
    result = Table(cells, colWidths=widths, repeatRows=1, hAlign="LEFT")
    result.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("GRID", (0, 0), (-1, -1), 0.35, LINE),
        ("BACKGROUND", (0, 0), (-1, 0), PALE),
        ("LEFTPADDING", (0, 0), (-1, -1), 7),
        ("RIGHTPADDING", (0, 0), (-1, -1), 7),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    return result


def footer(canvas, doc):
    canvas.saveState()
    canvas.setStrokeColor(LINE)
    canvas.line(18 * mm, 15 * mm, PAGE_W - 18 * mm, 15 * mm)
    canvas.setFont("ProjectSans", 7.5)
    canvas.setFillColor(MUTED)
    canvas.drawString(18 * mm, 9 * mm, "POSTERSCORE AI  |  PROJECT OVERVIEW")
    canvas.drawRightString(PAGE_W - 18 * mm, 9 * mm, str(doc.page))
    canvas.restoreState()


story = [
    Spacer(1, 35 * mm),
    P("TECHNICAL PROJECT GUIDE", "CoverKicker"),
    P("PosterScore AI", "CoverTitle"),
    P("How the application was built, which technologies it uses, and how the poster analysis logic works.", "CoverSub"),
    Table([[P("UPLOAD", "TableHead"), P("MEASURE", "TableHead"), P("ANALYZE", "TableHead"), P("IMPROVE", "TableHead")]], colWidths=[39 * mm] * 4, style=TableStyle([("BACKGROUND", (0, 0), (-1, -1), PALE), ("BOX", (0, 0), (-1, -1), 0.6, LIME), ("INNERGRID", (0, 0), (-1, -1), 0.35, LINE), ("ALIGN", (0, 0), (-1, -1), "CENTER"), ("TOPPADDING", (0, 0), (-1, -1), 11), ("BOTTOMPADDING", (0, 0), (-1, -1), 11)])),
    Spacer(1, 22 * mm),
    P("PosterScore AI is a full-stack MVP that reviews a poster like a creative director. It identifies whether the upload is actually a poster, combines measured image facts with visual reasoning, calculates a type-aware score in backend code, and produces prioritized design fixes.", "Callout"),
    Spacer(1, 32 * mm),
    P("Local development", "H2x"),
    P("Frontend: http://localhost:5173/ &nbsp;&nbsp; Backend: http://localhost:8787 &nbsp;&nbsp; Start command: npm run dev", "Mono"),
    PageBreak(),
    P("1. Technology stack and architecture", "H1x"),
    P("The project is intentionally small and direct: a React client handles interaction, while an Express server owns image validation, Gemini calls, quality control, and scoring.", "Bodyx"),
    make_table([
        ["Layer", "Technology", "Purpose"],
        ["Frontend", "React 19 + TypeScript", "Upload flow, staged loading UI, report dashboard, responsive interactions."],
        ["Frontend tooling", "Vite 6", "Fast development server and production bundling."],
        ["Backend", "Node.js + Express 5", "API route, multipart upload handling, rate limiting, and provider errors."],
        ["AI", "Google Gemini via @google/genai", "Image understanding, poster classification, evidence checks, and recommendations."],
        ["Image processing", "Sharp", "Decode validation, rotation, resizing, JPEG preparation, and image measurements."],
        ["Validation", "Zod", "Strict analysis response validation and quality-control rules."],
        ["Testing", "Vitest", "Scoring, schema, correction-loop, and file-validation tests."],
    ], [31 * mm, 49 * mm, 91 * mm]),
    Spacer(1, 12),
    P("Project structure", "H2x"),
    P("src/App.tsx contains the main UI workflow. src/analysisApi.ts is the frontend API boundary. server/app.ts exposes the API. server/vision.ts calls Gemini. server/analysis.ts owns the scoring contract. server/validation.ts owns image safety and measurements.", "Bodyx"),
    P("The API key stays in the server-side .env file. It is never placed in a VITE_ variable and is never sent to the browser.", "Callout"),
    PageBreak(),
    P("2. End-to-end analysis workflow", "H1x"),
    make_table([
        ["Step", "Stage", "Logic"],
        ["01", "Upload", "The browser accepts JPG, JPEG, PNG, and WEBP files up to 10 MB. Drag-and-drop and file-picker flows use the same handler."],
        ["02", "Validate again", "Multer limits the request, then Sharp confirms the bytes are a decodable image. MIME type, extension, and size are checked."],
        ["03", "Prepare and measure", "The image is rotated, resized to a maximum of 2400px, flattened, and converted to JPEG. Width, height, aspect ratio, orientation, dominant colors, estimated whitespace, and coverage are measured."],
        ["04", "Add context", "Target platform, goal, audience, and brand information are included when supplied."],
        ["05", "Ask Gemini", "The prompt classifies poster versus non-poster, then requests seven categories with 2-4 evidence checks each."],
        ["06", "Validate and correct", "Zod validates the JSON. Quality checks reject contradictions, generic advice, duplicate recommendations, missing evidence, and identical category scores."],
        ["07", "Calculate score", "The backend averages evidence checks, applies poster-type weights, redistributes non-applicable branding weight, and assigns a rating label."],
        ["08", "Render report", "React shows confidence, limitations, the three-second test, category evidence, strengths, markers, improvements, and version history."],
    ], [13 * mm, 39 * mm, 119 * mm]),
    Spacer(1, 12),
    P("The visible loading stages mirror the real workflow so the user sees meaningful progress instead of an unexplained spinner.", "Callout"),
    PageBreak(),
    P("3. Scoring logic", "H1x"),
    P("The model never owns the final score. It returns small evidence checks; the server is the source of truth for all numbers shown in the report.", "Bodyx"),
    P("Categories", "H2x"),
    make_table([
        ["Category", "What it measures"],
        ["Layout & hierarchy", "Eye path, alignment, balance, spacing, and grouping."],
        ["Typography", "Font choice, pairing, size contrast, hierarchy, and line breaks."],
        ["Readability & contrast", "Text visibility, contrast clues, viewing distance, line length, and busy backgrounds."],
        ["Imagery / graphics", "Relevance, resolution clues, cropping, and integration with the message."],
        ["Message & CTA", "Message clarity, purpose, and visibility of the next action."],
        ["Color", "Palette, contrast relationships, and consistent accent use."],
        ["Branding", "Recognition and consistency when a logo or brand context makes it judgeable."],
    ], [48 * mm, 123 * mm]),
    Spacer(1, 10),
    P("A category score is calculated as the average of its 0-10 checks multiplied by 10. The overall score is a weighted sum of category scores.", "Bodyx"),
    P("Example type-aware weights", "H2x"),
    make_table([
        ["Poster type", "Highest emphasis"],
        ["Promotional Offer", "Layout 20%, Message & CTA 20%, Branding 15%"],
        ["Event", "Layout 20%, Typography 15%, Readability 15%, Imagery 15%"],
        ["Restaurant/Food", "Imagery 25%, Layout 15%, Readability 15%"],
        ["Corporate", "Typography 20%, Branding 20%, Readability 15%"],
        ["Other types", "Balanced base profile across all seven categories"],
    ], [46 * mm, 125 * mm]),
    Spacer(1, 10),
    P("Branding is conditional. When it cannot be judged, its weight becomes zero and is redistributed across the other categories instead of unfairly lowering the poster score.", "Callout"),
    PageBreak(),
    P("4. User interface and report", "H1x"),
    P("The interface is organized around a simple three-stage product story: upload, diagnose, improve.", "Bodyx"),
    make_table([
        ["Screen", "Main behavior"],
        ["Landing / upload", "Responsive hero layout, drag-and-drop zone, preview, file metadata, target platform, goal, audience, and brand context."],
        ["Loading", "Poster preview, animated scan line, and eight named analysis stages."],
        ["Non-poster result", "Explains that the upload is not a poster and asks for a designed poster instead of showing misleading scores."],
        ["Poster result", "Score ring, rating, confidence, limitations, intended use, three-second attention order, measured image facts, and category breakdown."],
        ["Improvement detail", "High/medium/low priority filters, numbered markers, problem, why it matters, and recommended fix."],
        ["Version history", "Recent analyses are retained in browser localStorage for quick comparison."],
        ["Export", "Browser print styles allow the report to be saved as a PDF."],
    ], [42 * mm, 129 * mm]),
    Spacer(1, 12),
    P("Responsive design", "H2x"),
    bullet("Desktop uses a two-column hero and report layout."),
    bullet("Tablet collapses major grids while preserving readable spacing."),
    bullet("Mobile uses single-column sections, flexible file names, compact category rows, and full-width actions."),
    bullet("Print styles hide navigation and interactive controls for a clean report."),
    PageBreak(),
    P("5. API, reliability, and security", "H1x"),
    P("API endpoints", "H2x"),
    make_table([["Endpoint", "Purpose"], ["GET /api/health", "Reports backend status, Gemini configuration, provider, and demo mode."], ["POST /api/analyze", "Accepts multipart image data plus a JSON context field and returns the validated report."]], [45 * mm, 126 * mm]),
    Spacer(1, 12),
    P("Gemini reliability", "H2x"),
    bullet("Retries transient 503 and 429 provider failures."),
    bullet("Tries the configured model, then Gemini 3.7 Flash and Gemini 3.6 Flash fallbacks."),
    bullet("Uses JSON mode and validates the complete response with Zod on the server."),
    bullet("Runs up to two skeptical correction passes after quality-control failures."),
    bullet("Maps invalid-key, quota, model, busy-provider, and response-format failures to clearer UI messages."),
    P("Security and limits", "H2x"),
    bullet("The Gemini key is server-only."),
    bullet("Uploaded files are processed in memory and are not persisted by the backend."),
    bullet("The endpoint limits files to 10 MB and applies an in-memory limit of 12 analyses per 10 minutes per client."),
    bullet("There is no database, account system, or cloud report history in this MVP."),
    PageBreak(),
    P("6. Testing, commands, and current limitations", "H1x"),
    P("Verification", "H2x"),
    P("The project includes automated tests for deterministic scoring, rating bands, poster-type weight behavior, conditional branding redistribution, malformed model responses, identical scores, correction passes, maximum correction attempts, MIME and extension validation, file-size limits, and corrupt image bytes.", "Bodyx"),
    P("Development commands", "H2x"),
    P("npm install\nnpm run dev        # frontend + backend\nnpm run dev:ui     # frontend only\nnpm test\nnpm run build", "Mono"),
    P("Environment modes", "H2x"),
    P("For UI-only testing without Gemini:\nVITE_USE_MOCK_ANALYSIS=true\nDEMO_MODE=true", "Mono"),
    P("Current limitations", "H2x"),
    bullet("Whitespace and coverage are image-level estimates, not OCR-based measurements."),
    bullet("Exact WCAG contrast ratios, font-size detection, and color-blind simulation are not yet implemented."),
    bullet("Arabic and RTL poster analysis is not yet specialized."),
    bullet("PDF export uses the browser print flow rather than a dedicated server PDF generator."),
    bullet("No persistent database, login, or cloud version history is included."),
    Spacer(1, 15),
    P("Summary", "H2x"),
    P("PosterScore AI is built so that Gemini supplies visual judgment and concrete evidence, while the application remains responsible for validation, scoring, reliability, and user experience. This separation keeps the MVP explainable, testable, and easier to improve as the analysis model evolves.", "Callout"),
]

document = SimpleDocTemplate(str(OUTPUT), pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm, topMargin=18 * mm, bottomMargin=22 * mm, title="PosterScore AI Project Overview", author="PosterScore AI")
document.build(story, onFirstPage=footer, onLaterPages=footer)
print(OUTPUT)
