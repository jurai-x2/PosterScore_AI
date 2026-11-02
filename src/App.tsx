import { type ChangeEvent, type CSSProperties, type DragEvent, useEffect, useState } from "react";
import { AnalysisRequestError, analyzePoster } from "./analysisApi";
import type { Analysis, AnalysisContext, ArtDirectorCritique, Category, CategoryKey, Improvement, PosterElement, RuleResult } from "./types";

const categoryMeta: Array<{ key: CategoryKey; label: string }> = [
  { key: "layoutHierarchy", label: "Layout & hierarchy" },
  { key: "typography", label: "Typography" },
  { key: "readabilityContrast", label: "Readability & contrast" },
  { key: "imagery", label: "Imagery / graphics" },
  { key: "messageCta", label: "Message & CTA" },
  { key: "color", label: "Color" },
  { key: "branding", label: "Branding" }
];

const baseWeights: Record<CategoryKey, number> = { layoutHierarchy: .20, typography: .15, readabilityContrast: .15, imagery: .15, messageCta: .15, color: .10, branding: .10 };
const typeWeights: Record<string, Partial<Record<CategoryKey, number>>> = {
  "Promotional Offer": { layoutHierarchy: .20, typography: .10, readabilityContrast: .15, imagery: .10, messageCta: .20, color: .10, branding: .15 },
  Event: { layoutHierarchy: .20, typography: .15, readabilityContrast: .15, imagery: .15, messageCta: .10, color: .10, branding: .15 },
  "Restaurant/Food": { layoutHierarchy: .15, typography: .10, readabilityContrast: .15, imagery: .25, messageCta: .10, color: .10, branding: .15 },
  Corporate: { layoutHierarchy: .15, typography: .20, readabilityContrast: .15, imagery: .15, messageCta: .05, color: .10, branding: .20 }
};

const stageLabels = ["Detecting poster type", "Measuring image signals", "Checking layout & hierarchy", "Evaluating type and readability", "Reviewing imagery and color", "Checking accessibility clues", "Preparing priority fixes", "Building your report"];
const defaultContext: AnalysisContext = { targetPlatform: "General", goal: "", audience: "", brandInfo: "" };

function displayWeights(analysis: Analysis) {
  const weights = { ...baseWeights, ...(typeWeights[analysis.posterType] || {}) };
  if (!analysis.brandingApplicable) {
    const branding = weights.branding;
    weights.branding = 0;
    for (const item of categoryMeta) if (item.key !== "branding") weights[item.key] += (weights[item.key] / (1 - branding)) * branding;
  }
  return weights;
}

function App() {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [view, setView] = useState<"home" | "loading" | "results">("home");
  const [stage, setStage] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [history, setHistory] = useState<Analysis[]>([]);
  const [error, setError] = useState("");
  const [retryAvailable, setRetryAvailable] = useState(false);
  const [context, setContext] = useState<AnalysisContext>(defaultContext);

  useEffect(() => {
    try { setHistory(JSON.parse(localStorage.getItem("posterscore-history") || "[]") as Analysis[]); } catch { setHistory([]); }
  }, []);

  const chooseFile = (nextFile?: File) => {
    if (!nextFile) return;
    const extension = nextFile.name.slice(nextFile.name.lastIndexOf(".")).toLowerCase();
    const supportedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
    const supportedExtensions = new Set([".jpg", ".jpeg", ".png", ".webp"]);
    if (!supportedTypes.has(nextFile.type) || !supportedExtensions.has(extension)) { setError("Please choose a JPG, PNG, or WEBP image."); return; }
    if (nextFile.size > 10 * 1024 * 1024) { setError("That file is over 10 MB. Choose a smaller image to continue."); return; }
    setError("");
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(nextFile); setPreviewUrl(URL.createObjectURL(nextFile));
  };
  const onPicker = (event: ChangeEvent<HTMLInputElement>) => chooseFile(event.target.files?.[0]);
  const onDrop = (event: DragEvent<HTMLDivElement>) => { event.preventDefault(); setIsDragging(false); chooseFile(event.dataTransfer.files?.[0]); };
  const analyze = async () => {
    if (!file) { setError("Add a poster first — the creative director is ready when you are."); setRetryAvailable(false); return; }
    setError(""); setRetryAvailable(false); setView("loading"); setStage(0); setElapsedSeconds(0);
    const timer = window.setInterval(() => {
      setElapsedSeconds((current) => current + 1);
      setStage((current) => Math.min(current + 1, stageLabels.length - 2));
    }, 1000);
    try {
      const result = await analyzePoster(file, context);
      await new Promise((resolve) => window.setTimeout(resolve, 650));
      setAnalysis(result); setHistory((current) => { const next = [result, ...current].slice(0, 5); try { localStorage.setItem("posterscore-history", JSON.stringify(next)); } catch { /* browser storage is optional */ } return next; });
      setStage(stageLabels.length); setView("results");
    } catch (requestError) { setView("home"); setError(requestError instanceof Error ? requestError.message : "Something went wrong. Try again."); setRetryAvailable(requestError instanceof AnalysisRequestError && requestError.retryable); }
    finally { window.clearInterval(timer); }
  };
  const reset = () => { if (previewUrl) URL.revokeObjectURL(previewUrl); setView("home"); setAnalysis(null); setFile(null); setPreviewUrl(""); setStage(0); setElapsedSeconds(0); setError(""); setRetryAvailable(false); };
  const updateContext = (field: keyof AnalysisContext, value: string) => setContext((current) => ({ ...current, [field]: value }));

  return <div className="app-shell">
    <header className="topbar"><button className="brand" onClick={reset} aria-label="PosterScore home"><span className="brand-mark"><span /><span /><span /></span><span>PosterScore <em>AI</em></span></button><div className="topbar-right"><span className="mode-pill"><i /> Free analysis</span><button className="text-button" onClick={() => document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth" })}>How it works</button></div></header>
    {view === "home" && <Home file={file} previewUrl={previewUrl} isDragging={isDragging} error={error} retryAvailable={retryAvailable} context={context} onContextChange={updateContext} onDrop={onDrop} onPicker={onPicker} setIsDragging={setIsDragging} clearFile={() => { if (previewUrl) URL.revokeObjectURL(previewUrl); setFile(null); setPreviewUrl(""); setError(""); setRetryAvailable(false); }} analyze={analyze} />}
    {view === "loading" && <Loading previewUrl={previewUrl} stage={stage} elapsedSeconds={elapsedSeconds} />}
    {view === "results" && analysis && <Results analysis={analysis} previewUrl={previewUrl} history={history} reset={reset} />}
    <footer className="footer"><span>POSTERSCORE AI</span><span>Measured for sharper creative decisions.</span><span>JPG · PNG · WEBP · 10MB MAX</span></footer>
  </div>;
}

function Home({ file, previewUrl, isDragging, error, retryAvailable, context, onContextChange, onDrop, onPicker, setIsDragging, clearFile, analyze }: { file: File | null; previewUrl: string; isDragging: boolean; error: string; retryAvailable: boolean; context: AnalysisContext; onContextChange: (field: keyof AnalysisContext, value: string) => void; onDrop: (event: DragEvent<HTMLDivElement>) => void; onPicker: (event: ChangeEvent<HTMLInputElement>) => void; setIsDragging: (value: boolean) => void; clearFile: () => void; analyze: () => void; }) {
  return <main className="home-page"><section className="hero-grid"><div className="hero-copy"><div className="eyebrow"><span className="eyebrow-line" /> AI CREATIVE DIRECTOR <span className="eyebrow-dot" /></div><h1>Know exactly<br /><span>what’s wrong</span><br />with your poster.</h1><p className="hero-subtitle">Upload your design and get an evidence-led score, sharper feedback, and the next three fixes that actually matter.</p><div className="hero-meta"><span>01 — Upload</span><span>02 — Diagnose</span><span>03 — Improve</span></div></div><div className="upload-column"><div className="upload-card"><div className="card-kicker"><span>01</span><span>START WITH YOUR DESIGN</span></div><div className={`drop-zone ${isDragging ? "dragging" : ""} ${file ? "has-file" : ""}`} onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }} onDragLeave={() => setIsDragging(false)} onDrop={onDrop}>{previewUrl ? <img src={previewUrl} className="preview-image" alt="Selected poster preview" /> : <><div className="upload-symbol"><span>↑</span></div><strong>Drop your poster here</strong><small>or click to browse your files</small></>}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={onPicker} aria-label="Upload poster" /></div>{file && <div className="file-row"><span className="file-icon">✦</span><div><strong>{file.name}</strong><small>{(file.size / 1024 / 1024).toFixed(2)} MB · Ready to review</small></div><button onClick={clearFile} aria-label="Remove selected file">×</button></div>}<div className="context-fields"><label>Where will this run?<select value={context.targetPlatform} onChange={(event) => onContextChange("targetPlatform", event.target.value as AnalysisContext["targetPlatform"])}><option>General</option><option>Instagram post</option><option>Instagram story</option><option>A3 print</option><option>WhatsApp status</option><option>Billboard</option></select></label><label>What should it do? <span>optional</span><input value={context.goal} onChange={(event) => onContextChange("goal", event.target.value)} placeholder="Sell, inform, register…" /></label><details><summary>Add audience or brand context <small>optional</small></summary><label>Audience<input value={context.audience} onChange={(event) => onContextChange("audience", event.target.value)} placeholder="Who should notice this?" /></label><label>Brand information<input value={context.brandInfo} onChange={(event) => onContextChange("brandInfo", event.target.value)} placeholder="Colors, logo, brand rules…" /></label></details></div>{error && <div className="error-wrap"><p className="error-message" role="alert">{error}</p>{retryAvailable && <button className="retry-button" onClick={analyze}>Try again</button>}</div>}<button className="primary-button" onClick={analyze}><span>Analyze my poster</span><b>↗</b></button><p className="fine-print">Your image is used only to generate this report.</p></div><div className="trust-row"><span><i>✓</i> Evidence checks</span><span><i>✓</i> Type-aware weights</span><span><i>✓</i> Priority fixes</span></div></div></section><section id="how-it-works" className="how-section"><div className="section-intro"><span className="section-number">02</span><div><p className="eyebrow">HOW IT WORKS</p><h2>Less guessing.<br />More direction.</h2></div><p>PosterScore identifies the poster type, combines objective image signals with visual judgment, and explains what to fix first.</p></div><div className="steps"><div><span>01</span><h3>Classify</h3><p>Separate a real poster from a random image before scoring it.</p></div><div><span>02</span><h3>Measure</h3><p>Use image dimensions, palette, whitespace, and coverage as evidence.</p></div><div><span>03</span><h3>Improve</h3><p>Leave with a ranked, practical plan — not generic AI compliments.</p></div></div></section><section className="principles-section"><div className="principles-title"><p className="eyebrow">WHAT WE LOOK AT</p><h2>Design is a system.</h2></div><div className="principles-grid">{categoryMeta.map((item, index) => <div className="principle" key={item.key}><span>0{index + 1}</span><strong>{item.label}</strong><small>evidence checks</small></div>)}</div></section></main>;
}

function Loading({ previewUrl, stage, elapsedSeconds }: { previewUrl: string; stage: number; elapsedSeconds: number }) { return <main className="loading-page"><div className="loading-header"><div className="eyebrow"><span className="eyebrow-line" /> ANALYSIS IN PROGRESS</div><h1>Reading the design<br /><span>between the lines.</span></h1><p>We’re combining visible evidence, image measurements, and the poster’s intended use.</p></div><div className="analysis-workspace"><div className="loading-poster">{previewUrl && <img src={previewUrl} alt="Poster being analyzed" />}<div className="scan-line" /></div><div className="stage-panel"><div className="stage-top"><span>CREATIVE DIRECTOR REVIEW</span><span>{Math.min(stage + 1, stageLabels.length)} / {stageLabels.length} · {elapsedSeconds}s</span></div><div className="stage-list">{stageLabels.map((label, index) => <div className={index < stage ? "done" : index === stage ? "active" : ""} key={label}><span>{index < stage ? "✓" : index === stage ? "◌" : "·"}</span>{label}<small>{index < stage ? "DONE" : index === stage ? "NOW" : "NEXT"}</small></div>)}</div><div className="loading-bar"><span style={{ width: `${Math.min((stage / stageLabels.length) * 100, 96)}%` }} /></div><p className="loading-note">{stage < stageLabels.length ? "Looking closely at the visible evidence…" : "Generating your design report…"}</p></div></div></main>; }

function Results({ analysis, previewUrl, history, reset }: { analysis: Analysis; previewUrl: string; history: Analysis[]; reset: () => void }) {
  const [activeImprovement, setActiveImprovement] = useState(0);
  const weights = displayWeights(analysis);
  const exportReport = () => window.print();
  const selectImprovement = (index: number) => {
    setActiveImprovement(index);
    window.requestAnimationFrame(() => document.getElementById("art-director-critique")?.scrollIntoView({ behavior: "smooth", block: "center" }));
  };
  if (!analysis.isPoster) return <main className="results-page"><div className="results-top"><button className="back-button" onClick={reset}>← New analysis</button><div className="result-tag"><i /> IMAGE CHECK</div></div><section className="non-poster-card"><p className="eyebrow"><span className="eyebrow-line" /> NOT A POSTER</p><h1>This image doesn’t look like a poster.</h1><p>{analysis.notPosterReason || analysis.overallSummary}</p><p className="non-poster-note">Upload a designed poster with a clear message, audience, or call to action to receive category scores and recommendations.</p>{previewUrl && <img src={previewUrl} className="non-poster-thumb" alt="Uploaded image" />}<button className="primary-button" onClick={reset}><span>Analyze another image</span><b>↗</b></button></section></main>;
  const resultHeadline = analysis.overallScore >= 80 ? "strong foundations." : analysis.overallScore >= 60 ? "a clear next move." : "a sharper rebuild ahead.";
  return <main className="results-page"><div className="results-top"><button className="back-button" onClick={reset}>← New analysis</button><div className="results-actions"><button className="secondary-button" onClick={exportReport}>Export / print PDF</button><div className="result-tag"><i /> REPORT READY {analysis.demoMode && <em>DEMO MODE</em>}{analysis.lowConfidence && <em>LOW CONFIDENCE</em>}</div></div></div><section className="report-hero"><div className="report-intro"><p className="eyebrow"><span className="eyebrow-line" /> {analysis.posterType.toUpperCase()}</p><h1>Your poster has<br /><span>{resultHeadline}</span></h1><p>{analysis.overallSummary}</p><div className="poster-purpose"><span>INTENDED USE</span><strong>{analysis.context?.targetPlatform || "General"}{analysis.context?.goal ? ` · ${analysis.context.goal}` : ""}</strong></div><div className="confidence-note"><span>CONFIDENCE: {analysis.confidence.toUpperCase()}{analysis.lowConfidence ? " · LOW CONFIDENCE" : ""}</span>{analysis.limitations.length > 0 && <small>{analysis.lowConfidence ? "This report completed before every validation correction finished. " : ""}{analysis.limitations[0]}</small>}</div></div><div className="score-ring" style={{ "--score": `${analysis.overallScore * 3.6}deg` } as CSSProperties}><div><strong>{analysis.overallScore}</strong><span>/ 100</span><small>{analysis.ratingLabel}</small></div></div><div className="annotated-poster">{previewUrl && <img src={previewUrl} className="report-thumb" alt="Analyzed poster" />}{analysis.improvements.map((item, index) => item.anchor ? <button className={`poster-marker ${index === activeImprovement ? "active" : ""}`} key={item.title} style={{ left: `${item.anchor.x}%`, top: `${item.anchor.y}%` }} onClick={() => selectImprovement(index)} aria-label={`Show improvement ${index + 1}: ${item.title}`}>{index + 1}</button> : null)}</div></section><section className="squint-section"><div><p className="eyebrow">THE 3-SECOND TEST</p><h2>What gets noticed first?</h2></div><div className="notice-order"><div><span>01</span><strong>{analysis.firstNotice}</strong></div><div><span>02</span><strong>{analysis.secondNotice}</strong></div><div><span>03</span><strong>{analysis.thirdNotice}</strong></div><p>{analysis.targetOrderAssessment}</p></div></section>{analysis.measurements && <section className="facts-strip"><p className="eyebrow">MEASURED IMAGE FACTS</p><div><span><strong>{analysis.measurements.width}×{analysis.measurements.height}</strong> resolution</span><span><strong>{analysis.measurements.aspectRatio}</strong> aspect ratio</span><span><strong>{analysis.measurements.estimatedWhitespacePercent}%</strong> estimated whitespace</span><span><strong>{analysis.measurements.dominantColors.length}</strong> dominant colors</span></div></section>}{analysis.ruleResults && <RuleChecks rules={analysis.ruleResults} />}<section className="report-body"><div className="report-section-head"><p className="eyebrow">THE BREAKDOWN</p><h2>A score with a reason.</h2><p>Weighted for {analysis.posterType.toLowerCase()} work, then derived from evidence checks.</p></div><div className="category-grid">{categoryMeta.map((item) => <CategoryBar key={item.key} label={item.label} weight={`${Math.round(weights[item.key] * 100)}%`} category={analysis.categories[item.key]} />)}</div></section><ArtDirectorCritique critique={analysis.critique} elements={analysis.elementMap} showAlternatives={analysis.overallScore < 60} />{history.length > 1 && <section className="history-strip"><div><p className="eyebrow">VERSION HISTORY</p><h2>Keep iterating.</h2></div><div className="history-list">{history.slice(0, 4).map((version, index) => <div key={`${version.overallScore}-${index}`} className={index === 0 ? "current" : ""}><span>{index === 0 ? "CURRENT" : `VERSION ${history.length - index}`}</span><strong>{version.overallScore}</strong><small>{version.posterType}</small></div>)}</div></section>}<section className="bottom-cta"><p>Ready to make the next version sharper?</p><button className="primary-button" onClick={reset}><span>Analyze another poster</span><b>↗</b></button></section></main>;
}

function ArtDirectorCritique({ critique, elements, showAlternatives }: { critique: ArtDirectorCritique; elements: PosterElement[]; showAlternatives: boolean }) {
  const elementLabel = (id: string) => elements.find((element) => element.id === id)?.label || id;
  return <section id="art-director-critique" className="art-director-critique">
    <div className="critique-heading"><div><p className="eyebrow">ART DIRECTOR REVIEW</p><h2>Direct feedback.<br /><span>Specific next moves.</span></h2></div><div className="critique-boundary"><strong>RELIABILITY BOUNDARY</strong><p>Legibility, hierarchy, structure, spacing, and clarity are the strongest signals. Style and concept comments are suggestions, not objective facts; calibration data should show where this review is dependable.</p></div></div>
    <section className="critique-panel intent-panel"><div className="critique-label">01 — INTENT</div><div className="intent-grid"><div><span>POSTER INTENT</span><p>{critique.intent.statement}</p></div><div><span>AUDIENCE</span><p>{critique.intent.audience}</p></div><div><span>DESIRED ACTION</span><p>{critique.intent.desiredAction}</p></div><div className={critique.intent.unclear ? "intent-unclear" : "intent-clear"}><span>CLARITY FLAG</span><p>{critique.intent.unclear ? "Intent is unclear from the visible elements." : "Intent is clear from the visible elements."}</p></div></div><p className="critique-evidence">Evidence: {critique.intent.evidence}</p></section>
    <section className="critique-panel"><div className="critique-label">ROOT CAUSES</div><div className="root-cause-list">{critique.rootCauses.map((item) => <article key={`${item.target}-${item.cause}`}><span className="element-id">[{item.target}] · {elementLabel(item.target)}</span><h3>{item.cause}</h3><p>{item.evidence}</p></article>)}</div></section>
    <section className="one-big-move"><div className="critique-label">ONE BIG MOVE</div><div><span className="element-id">[{critique.oneBigMove.target}] · {elementLabel(critique.oneBigMove.target)}</span><p>{critique.oneBigMove.change}</p></div></section>
    <section className="critique-panel"><div className="critique-label">TOP FIXES · {critique.topFixes.length}/3</div><div className="top-fix-list">{critique.topFixes.map((item, index) => <article key={`${item.target}-${index}`}><div className="fix-index">0{index + 1}</div><div><span className="element-id">[{item.target}] · {elementLabel(item.target)}</span><h3>{item.problem}</h3><dl><div><dt>EVIDENCE</dt><dd>{item.evidence}</dd></div><div><dt>MEASURED VALUE</dt><dd>{item.measuredValue}</dd></div><div><dt>FIX</dt><dd>{item.fix}</dd></div><div><dt>WHY IT MATTERS</dt><dd>{item.whyItMatters}</dd></div><div><dt>EXPECTED RESULT</dt><dd>{item.expectedResult}</dd></div></dl></div></article>)}</div></section>
    <section className="critique-panel keep-panel"><div className="critique-label">KEEP</div><div className="keep-grid">{critique.keep.map((item) => <article key={item.target}><span className="element-id">[{item.target}] · {elementLabel(item.target)}</span><p>{item.whatWorks}</p></article>)}</div></section>
    {showAlternatives && critique.alternativeDirections && <section className="critique-panel alternatives-panel"><div className="critique-label">ALTERNATIVE DIRECTIONS</div><div className="alternative-grid">{critique.alternativeDirections.map((direction) => <article key={direction.name}><h3>{direction.name}</h3><p><strong>CONCEPT</strong>{direction.concept}</p><p><strong>LAYOUT</strong>{direction.layout}</p></article>)}</div></section>}
    <section className="critique-panel polish-panel"><div className="critique-label">POLISH</div><ul>{critique.polish.map((item) => <li key={`${item.target}-${item.item}`}><span className="element-id">[{item.target}] · {elementLabel(item.target)}</span><p>{item.item}</p></li>)}</ul></section>
  </section>;
}

function RuleChecks({ rules }: { rules: RuleResult[] }) {
  return <section className="rule-checks"><div><p className="eyebrow">DETERMINISTIC DESIGN RULES</p><h2>Facts before taste.</h2><p>Rules own measured pass/fail decisions and score caps. Missing OCR or layout metrics remain not evaluated.</p></div><div className="rule-list">{rules.map((rule) => <div key={rule.ruleId}><span className={`rule-status ${rule.status}`}>{rule.status.replace("_", " ")}</span><strong>{rule.ruleId}<small>{rule.basis}</small></strong><small>{rule.evidence}{rule.scoreCap === undefined ? "" : ` · cap ${rule.scoreCap}/10`}</small></div>)}</div></section>;
}

function CategoryBar({ label, weight, category }: { label: string; weight: string; category: Category }) { return <div className="category-row"><div className="category-label"><strong>{label}</strong><small>{weight} weight</small></div><div className="bar-track"><span style={{ width: `${category.score}%` }} /></div><strong className="category-score">{category.score}</strong><details className="category-evidence"><summary>Evidence checks</summary><div>{category.checks.map((check) => <p key={check.name}><strong>{check.name} · {check.score}/10</strong><span>{check.evidence}</span></p>)}</div></details></div>; }
function ImprovementDetail({ item }: { item?: Improvement }) { if (!item) return null; return <div className="improvement-detail"><div className={`priority-label ${item.priority.toLowerCase()}`}><span /> {item.priority} PRIORITY · {item.category}</div><h3>{item.title}</h3><div className="detail-block"><span>THE PROBLEM</span><p>{item.problem}</p></div><div className="detail-block"><span>VISIBLE EVIDENCE</span><p>{item.evidence}</p></div><div className="detail-block"><span>WHY IT MATTERS</span><p>{item.whyItMatters}</p></div><div className="recommendation"><span>↗</span><div><small>RECOMMENDED FIX</small><p>{item.recommendation}</p></div></div></div>; }
export default App;
