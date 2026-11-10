/** Test helper: the document canvas wired to the real reducer, as `ResumeEditor` wires it. */
import { useReducer } from "react";
import { ATS_STRICT, ToastProvider } from "@kiwiply/ui";
import type { ResumeDocument, TemplateCapabilities } from "@kiwiply/ui";
import { DEFAULT_BUILDER_CONFIG } from "@/lib/resume-builder-config.shared";
import type { CanvasPhoto } from "./canvasContext";
import DocumentCanvas from "./DocumentCanvas";
import { canRedoEdit, canUndoEdit, currentDoc, editorReducer, initEditorState } from "./state/reducer";
import type { DocLimits } from "./state/types";

export function CanvasHarness({
  doc,
  caps = ATS_STRICT,
  errorField = null,
  aiAllowed = false,
  limits = DEFAULT_BUILDER_CONFIG.limits,
  onAddSection = () => {},
  reorder = false,
  photo,
}: {
  doc: ResumeDocument;
  caps?: TemplateCapabilities;
  errorField?: string | null;
  aiAllowed?: boolean;
  limits?: DocLimits;
  onAddSection?: () => void;
  reorder?: boolean;
  /** The photo slot's behaviour (R7.4); absent = the slot only shows what the document holds. */
  photo?: CanvasPhoto;
}) {
  const [state, dispatch] = useReducer(editorReducer, undefined, () => initEditorState({ doc, templateId: "modern", theme: null, docVersion: 1, limits }));
  return (
    <ToastProvider>
      <DocumentCanvas
        doc={currentDoc(state)}
        caps={caps}
        limits={state.limits}
        dispatch={dispatch}
        errorField={errorField}
        canUndo={canUndoEdit(state)}
        canRedo={canRedoEdit(state)}
        aiAllowed={aiAllowed}
        onAddSection={onAddSection}
        reorder={reorder}
        photo={photo}
      />
      <output data-testid="doc">{JSON.stringify(currentDoc(state))}</output>
    </ToastProvider>
  );
}

/** The live document as the harness's reducer holds it. */
export const liveDoc = (): ResumeDocument => JSON.parse(document.querySelector('[data-testid="doc"]')!.textContent ?? "{}") as ResumeDocument;
