/**
 * How a match score is written on the Marketing boards. A score that was never computed (`0`, `null`, `undefined`: the API sends 0 for a
 * posting nobody scored) reads "Not scored", never "0%" (UI refresh Phase 1, plan s2.2). The data stays 0/null; only the text changes.
 */
export const NOT_SCORED = "Not scored";

export const isScored = (score: number | null | undefined): score is number => typeof score === "number" && Number.isFinite(score) && score > 0;

export const scoreText = (score: number | null | undefined): string => (isScored(score) ? `${Math.round(score)}%` : NOT_SCORED);
