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
 * The photo slot's behaviour (R7.4), handed to the header block: where the stored photo is served from, whether the template draws
 * it, and the three things a person can do - add or replace it (the dialog uploads the cropped picture), remove it (with an undo
 * toast) and show or hide it on this resume. `enabled` is false when the admin switch is off or the session may not change the
 * photo (acting for someone); the slot then only shows what is there.
 */
export interface CanvasPhoto {
  enabled: boolean;
  /** Where the stored photo is drawn from, or null when the resume has none. */
  src: string | null;
  /** The theme (or the template default) draws the photo. */
  shown: boolean;
  /** The person's country is one where photos on resumes are discouraged (admin list). */
  discouraged: boolean;
  /** Upload the cropped picture; also turns the photo on for this resume. */
  upload: (png: Blob) => Promise<{ ok: true } | { ok: false; message: string }>;
  remove: () => void;
  setShown: (on: boolean) => void;
}

/** No photo support: the slot shows what the document holds and offers nothing (isolated canvas tests, a session that may not change it). */
export const NO_PHOTO: CanvasPhoto = {
  enabled: false,
  src: null,
  shown: false,
  discouraged: false,
  upload: async () => ({ ok: false, message: "Photos are not available here." }),
  remove: () => {},
  setShown: () => {},
};

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
  /** The session offers AI at all (capabilities.ai). False = the rewrite buttons are not drawn, not even as an upsell lock (an organization workspace, acting for someone). */
  aiVisible: boolean;
  /** Rewrite with AI (R4.2): how the section header and bullet buttons start the flow. */
  ai: CanvasAi;
  /** The Swap Section panel is open: item rows show a drag grip and can be dragged (same `item/move`). */
  reorder: boolean;
  /** The photo slot of the header block (R7.4). */
  photo: CanvasPhoto;
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
