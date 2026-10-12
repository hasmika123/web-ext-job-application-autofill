"use client";

import { createContext, useContext } from "react";
import type { Dispatch } from "react";
import type { EditorControls, TemplateCapabilities } from "@kiwiply/ui";
import type { CanvasAi } from "./ai/types";
import type { DocLimits, EditorAction } from "./state/types";

/** Where to put the caret once the next render has the field in the DOM. */
export interface FocusRequest {
  /** The `data-field` id (see `state/paths.ts`). */
  field: string;
  caret?: number | "end";
}

/**
 * What every block of the canvas needs and would otherwise be handed through four levels of props:
 * the dispatcher, the capabilities of the template (never `caps.ats`: the editor reads
 * `controls`, DESIGN 6.4), the limits, the field to ring after a 422 and the queue for "focus this
 * field after the next render".
 */
export interface CanvasContextValue {
  dispatch: Dispatch<EditorAction>;
  caps: TemplateCapabilities;
  controls: EditorControls;
  limits: DocLimits;
  /** The `data-field` id the last 422 pointed at (rung with `aria-invalid`), or null. */
  errorField: string | null;
  requestFocus: (req: FocusRequest) => void;
  canUndo: boolean;
  canRedo: boolean;
  /** The plan has builder AI (the Summary "Rewrite with AI" button is a lock when not). */
  aiAllowed: boolean;
  /** Rewrite with AI (R4.2): how the section header and bullet buttons start the flow. */
  ai: CanvasAi;
  /** The Swap Section panel is open: item rows show a drag grip and can be dragged (same `item/move`). */
  reorder: boolean;
}

const Ctx = createContext<CanvasContextValue | null>(null);

export const CanvasProvider = Ctx.Provider;

export function useCanvas(): CanvasContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useCanvas() must be used inside <DocumentCanvas>");
  return v;
}

/** Props that tie a control to the validator-path vocabulary and ring it when the last save pointed at it. */
export function useField(id: string): { "data-field": string; "aria-invalid"?: true } {
  const { errorField } = useCanvas();
  return errorField === id ? { "data-field": id, "aria-invalid": true } : { "data-field": id };
}
