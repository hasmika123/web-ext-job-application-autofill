/**
 * Side-panel glue: read the popup handoff and build the extension's ResumeUploadServices for
 * the shared @kiwiply/ui form. The form is persistence-agnostic; here `onSave`/`parseFile` are
 * backed by the engine (window.JAF) + the TrackingProvider seam.
 *
 * W3.2 implements the **save** flow (create a library resume). The **attach** flow
 * (capture → pushDraft → uploadApplicationAttachment → fill the job tab) lands in W3.3.
 */
import type { ResumeUploadServices, SaveInput, StructuredResume } from "@kiwiply/ui";

export type Handoff = {
  label: string;
  fileName: string;
  fileType: string;
  mode: "save" | "attach";
  jobTabId: number | null;
  file: File;
};

// The popup hands the file off via a temp IndexedDB key + the meta via chrome.storage.local.
const HANDOFF_KEY = "pendingResumeReview";
const TEMP_FILE_KEY = "__pending_review";

// Keep only the six structured fields the form + server care about (drop __rawText/__warning).
function struct6(s: unknown): StructuredResume {
  const o = (s ?? {}) as Record<string, unknown>;
  const arr = (v: unknown) => (Array.isArray(v) ? v : []);
  return {
    summary: typeof o.summary === "string" ? o.summary : "",
    skills: arr(o.skills).filter((x): x is string => typeof x === "string"),
    experience: arr(o.experience) as StructuredResume["experience"],
    education: arr(o.education) as StructuredResume["education"],
    languages: arr(o.languages) as StructuredResume["languages"],
    projects: arr(o.projects) as StructuredResume["projects"],
  };
}

export async function readHandoff(): Promise<Handoff | null> {
  const data = await new Promise<Record<string, unknown> | undefined>((res) =>
    chrome.storage.local.get(HANDOFF_KEY, (o) => res(o?.[HANDOFF_KEY] as Record<string, unknown> | undefined)),
  );
  const blob: Blob | null = await window.JAF.storage.getResumeFile(TEMP_FILE_KEY).catch(() => null);
  if (!data || !blob) return null;
  const fileName = typeof data.fileName === "string" ? data.fileName : "resume";
  const fileType = typeof data.fileType === "string" ? data.fileType : "application/pdf";
  return {
    label: typeof data.label === "string" ? data.label : "Resume",
    fileName,
    fileType,
    mode: data.mode === "attach" ? "attach" : "save",
    jobTabId: typeof data.jobTabId === "number" ? data.jobTabId : null,
    file: new File([blob], fileName, { type: fileType }),
  };
}

export async function cleanup(): Promise<void> {
  try {
    await new Promise<void>((res) => chrome.storage.local.remove(HANDOFF_KEY, () => res()));
    await window.JAF.storage.deleteResumeFile(TEMP_FILE_KEY);
  } catch {
    /* best-effort temp cleanup */
  }
}

export function makeServices(handoff: Handoff): ResumeUploadServices {
  const JAF = window.JAF;
  return {
    // Parse in the panel via the engine's parser.js (pdf.js / mammoth → shared parser-core).
    // The extension has no in-app bio, so bio is empty → the form's contact panel stays hidden.
    parseFile: async (file: File) => {
      const settings = await JAF.storage.getSettings();
      const structured = await JAF.parser.parse(file, settings);
      return { structured: struct6(structured), bio: {} };
    },
    onSave: async (input: SaveInput) => {
      // The side panel only ever CREATES (a freshly-uploaded resume) — it never reopens a saved
      // one for edit — so `input` is always the create variant (narrows to expose `input.file`).
      if (input.mode !== "create") return { ok: false, error: "The side panel can only create resumes." };
      const settings = await JAF.storage.getSettings();
      const provider = JAF.sync.providerFromSettings(settings, JAF.tracking.chromeTokenStore());
      if (!(await provider.isAuthenticated())) {
        return { ok: false, error: "Not connected — connect the extension on kiwiply.com first." };
      }
      if (handoff.mode === "attach") {
        // W3.3: capture the job → pushDraft → uploadApplicationAttachment → fill jobTabId.
        return { ok: false, error: "Fill-and-attach is coming in the next step (W3.3)." };
      }
      // save: create the library resume (reviewed = CONFIRMED), upload the file, refresh mirror.
      const saved = await provider.createResume({ label: input.label, parsedJson: input.parsedJson, status: "CONFIRMED" });
      const serverId = saved?.serverId ?? saved?.id ?? null;
      if (serverId == null) return { ok: false, error: "Couldn't save the resume (no id returned)." };
      await provider.uploadResumeFile(serverId, input.file, handoff.fileName);
      try {
        await JAF.sync.pullAll(provider, JAF.storage);
      } catch {
        /* offline-friendly; the next popup open will pull it */
      }
      return { ok: true, id: serverId, label: input.label };
    },
    // No onUpdateProfile → the form hides the "Detected contact" / base-profile panel.
  };
}
