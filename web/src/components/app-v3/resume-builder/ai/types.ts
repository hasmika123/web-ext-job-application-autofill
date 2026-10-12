import type { RewriteMode } from "@/lib/resume-ai";

/** What the "Rewrite with AI" buttons ask the editor for: these lines, as this scope ("Summary", "Experience", "this bullet"). */
export interface RewriteRequest {
  refs: string[];
  /** The words the sheet uses for what is being rewritten. */
  scope: string;
  /** Where the request came from, for the analytics event. */
  from: "section" | "bullet" | "tip";
}

/** What the canvas hands its blocks to start the rewrite flow. */
export interface CanvasAi {
  /** Open the diff sheet and ask for the rewrite. */
  start: (request: RewriteRequest, mode: RewriteMode) => void;
  /** `config.ai.rewriteMaxRefs`: how many lines one rewrite may cover. */
  maxRefs: number;
  /** A locked (Free) Rewrite button was pressed. */
  onLocked: (from: RewriteRequest["from"]) => void;
}

export const NO_AI: CanvasAi = { start: () => {}, maxRefs: 12, onLocked: () => {} };
