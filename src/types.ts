export type Priority = "HIGH" | "MEDIUM" | "LOW";

export type CategoryKey =
  | "layoutHierarchy"
  | "typography"
  | "readabilityContrast"
  | "imagery"
  | "messageCta"
  | "color"
  | "branding";

export type AnalysisContext = {
  targetPlatform: "General" | "Instagram post" | "Instagram story" | "A3 print" | "WhatsApp status" | "Billboard";
  goal: string;
  audience: string;
  brandInfo: string;
};

export type ObjectiveMeasurements = {
  width: number;
  height: number;
  aspectRatio: number;
  orientation: "portrait" | "landscape" | "square";
  dominantColors: string[];
  estimatedWhitespacePercent: number;
  estimatedImageCoveragePercent: number;
};

export type Check = { name: string; score: number; evidence: string };

export type Category = {
  score: number;
  checks: Check[];
  strengths: string[];
  issues: string[];
};

export type Improvement = {
  priority: Priority;
  category: CategoryKey;
  title: string;
  problem: string;
  evidence: string;
  whyItMatters: string;
  recommendation: string;
  anchor?: { x: number; y: number };
};

export type PosterElement = { id: string; label: string; location: string };
export type RuleResult = { ruleId: string; criterion: string; passed: boolean; status: "passed" | "failed" | "not_evaluated"; skipped?: boolean; severity: "critical" | "major" | "minor"; targets: string[]; evidence: string; scoreCap?: number; basis: "standard" | "principle" | "heuristic"; tradition?: string };
export type CritiqueIntent = { statement: string; audience: string; desiredAction: string; unclear: boolean; evidence: string };
export type CritiqueRootCause = { target: string; cause: string; evidence: string };
export type CritiqueTopFix = { target: string; criterion: "hierarchy" | "typography" | "composition" | "readability" | "color" | "cta" | "branding" | "clarity"; problem: string; evidence: string; measuredValue: string; fix: string; whyItMatters: string; expectedResult: string };
export type CritiqueAlternativeDirection = { name: string; concept: string; layout: string };
export type CritiqueKeep = { target: string; whatWorks: string };
export type CritiquePolish = { target: string; item: string };
export type ArtDirectorCritique = {
  intent: CritiqueIntent;
  rootCauses: CritiqueRootCause[];
  oneBigMove: { target: string; change: string };
  topFixes: CritiqueTopFix[];
  keep: CritiqueKeep[];
  alternativeDirections?: CritiqueAlternativeDirection[];
  polish: CritiquePolish[];
};

export type Analysis = {
  isPoster: boolean;
  posterType: string;
  posterPurpose: string;
  brandingApplicable: boolean;
  notPosterReason?: string;
  confidence: "high" | "medium" | "low";
  limitations: string[];
  firstNotice: string;
  secondNotice: string;
  thirdNotice: string;
  targetOrderAssessment: string;
  elementMap: PosterElement[];
  critique: ArtDirectorCritique;
  ruleResults?: RuleResult[];
  overallScore: number;
  ratingLabel: string;
  overallSummary: string;
  categories: Record<CategoryKey, Category>;
  strengths: string[];
  improvements: Improvement[];
  measurements?: ObjectiveMeasurements;
  context?: AnalysisContext;
  demoMode?: boolean;
  lowConfidence?: boolean;
};
