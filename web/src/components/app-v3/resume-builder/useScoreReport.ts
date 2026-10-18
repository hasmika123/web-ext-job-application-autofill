"use client";

import { useEffect, useRef, useState } from "react";
import { scoreResume } from "@kiwiply/ui";
import type { ResumeDocument, ResumeScoreConfig, ResumeScoreReport, ResumeTheme, TemplateCapabilities } from "@kiwiply/ui";

/** The live score recomputes this long after the last change (DESIGN 11.1: debounced 150 ms, <= 5 ms per run). */
// config-literal-ok: the live-score debounce is a fixed UX constant of DESIGN 11.1, not a settings key
export const SCORE_DEBOUNCE_MS = 150;

const currentMonth = () => new Date().toISOString().slice(0, 7);

/**
 * The Resume Score for the document being edited (DESIGN 11): the same `scoreResume` the BFF runs on save,
 * with the template's capabilities, the resolved theme and the builder's `resume.score.*` settings. The
 * first report is computed synchronously so the ring is never empty; later ones follow edits after the
 * debounce. `pages` is the measured page count when the editor knows it (null: unknown, F4 passes).
 */
export function useScoreReport(
  doc: ResumeDocument,
  caps: TemplateCapabilities,
  theme: ResumeTheme,
  config: ResumeScoreConfig,
  pages: number | null = null,
): ResumeScoreReport {
  const compute = (d: ResumeDocument) => scoreResume(d, { caps, theme, pages, jobExtract: null, now: currentMonth() }, config);
  const [report, setReport] = useState(() => compute(doc));
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(() => setReport(compute(doc)), SCORE_DEBOUNCE_MS);
    return () => clearTimeout(t);
    // `compute` closes over exactly these inputs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, caps, theme, config, pages]);
  return report;
}
