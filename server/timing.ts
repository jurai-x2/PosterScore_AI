export type StageTimer = {
  mark: (stage: string, details?: Record<string, unknown>) => void;
};

export function createStageTimer(requestId: string): StageTimer {
  const startedAt = Date.now();
  let previousAt = startedAt;
  return {
    mark(stage, details = {}) {
      const now = Date.now();
      console.info(JSON.stringify({
        event: "analysis_stage",
        requestId,
        stage,
        durationMs: now - previousAt,
        elapsedMs: now - startedAt,
        ...details
      }));
      previousAt = now;
    }
  };
}
