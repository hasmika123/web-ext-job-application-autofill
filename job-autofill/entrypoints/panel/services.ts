/**
 * Side-panel glue: build the extension's ResumeUploadServices for the shared @kiwiply/ui form.
 * The form is persistence-agnostic; here `onSave`/`parseFile` are backed by the engine
 * (window.JAF) + the TrackingProvider seam. The home view hands the chosen File over in memory
 * as a `Handoff` (no cross-document storage), so this module is pure service wiring.
 *
 * Two modes: **save** creates a library resume; **attach** captures the job → pushDraft →
 * uploadApplicationAttachment → fills the original job tab.
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

// --- attach-mode helpers (drive the fill on the original job tab) -----------------------------
// The content script is bundled into one self-contained file; inject THAT on the job tab if the
// manifest content_scripts didn't already cover it (activeTab). Mirrors popup.js / review.js.
const CONTENT_FILES = ["content-scripts/content.js"];

/* eslint-disable @typescript-eslint/no-explicit-any */
function sendTo(tabId: number, msg: unknown, frameId?: number): Promise<any> {
  return new Promise((resolve, reject) => {
    const opts: chrome.tabs.MessageSendOptions = frameId === undefined ? {} : { frameId };
    chrome.tabs.sendMessage(tabId, msg, opts, (resp) => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(resp);
    });
  });
}

async function ensureInjected(tabId: number): Promise<void> {
  try {
    const r = await sendTo(tabId, { type: "JAF_PING" }, 0);
    if (r && r.ok) return;
  } catch {
    /* not injected yet */
  }
  await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, files: CONTENT_FILES });
}

// Pick the frame with the best adapter/field match (ATS pages nest the form in an iframe).
async function pickFrame(tabId: number): Promise<number> {
  let frames: Array<{ frameId: number }> = [];
  try {
    frames = (await chrome.webNavigation.getAllFrames({ tabId })) ?? [];
  } catch {
    /* fall back to the top frame */
  }
  if (!frames.length) frames = [{ frameId: 0 }];
  const results: Array<{ frameId: number; adapter: string; fieldCount: number }> = [];
  for (const f of frames) {
    try {
      const r = await sendTo(tabId, { type: "JAF_PING" }, f.frameId);
      if (r && r.ok) results.push({ frameId: f.frameId, adapter: r.adapter, fieldCount: r.fieldCount });
    } catch {
      /* frame not injectable */
    }
  }
  if (!results.length) return 0;
  results.sort((a, b) => (b.adapter !== "generic" ? 1000 : 0) + b.fieldCount - ((a.adapter !== "generic" ? 1000 : 0) + a.fieldCount));
  return results[0].frameId;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1]);
    r.onerror = () => reject(new Error("file read failed"));
    r.readAsDataURL(blob);
  });
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
        // "Parse, don't add to list": fill THIS job page + attach the PDF to its application,
        // instead of saving a library resume. Ported from review.js `attachAndFill`.
        if (handoff.jobTabId == null) {
          return { ok: false, error: "Couldn't find the job tab — reopen this from the job page." };
        }
        const jobTabId = handoff.jobTabId;
        const bio = await JAF.storage.getBio();
        const struct = JSON.parse(input.parsedJson);

        // 1) Capture the job from the original tab → create/upsert its DRAFT application.
        await ensureInjected(jobTabId);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let capture: any = {};
        try {
          const r = await sendTo(jobTabId, { type: "JAF_CAPTURE_JOB" }, 0);
          capture = (r && r.capture) || {};
        } catch {
          /* capture is best-effort; pushDraft falls back to host/defaults */
        }
        let appId: number | null = null;
        try {
          const saved = await JAF.appTracking.pushDraft(provider, capture, null);
          appId = saved?.serverId ?? null;
        } catch {
          appId = null;
        }

        // 2) Attach the PDF to that application (the point of "don't add to list").
        if (appId != null) {
          try {
            await provider.uploadApplicationAttachment(appId, input.file, handoff.fileName);
          } catch {
            /* keep going — the fill is still useful */
          }
        }

        // 3) Fill the job page with the reviewed values (the on-page overlay confirms first).
        const values = JAF.schema.buildFillValues(bio, struct, { includeEEO: true });
        const fileObj = {
          name: JAF.schema.uploadResumeName(bio, handoff.fileName),
          type: handoff.fileType,
          base64: await blobToBase64(input.file),
        };
        const frameId = await pickFrame(jobTabId);
        const resp = await sendTo(
          jobTabId,
          {
            type: "JAF_FILL",
            values,
            file: fileObj,
            // No resume link — attach mode uploads the PDF to the application instead.
            options: { autoAdvance: !!settings.autoAdvance, autoAddRows: settings.autoAddRows !== false, resume: { serverId: null, label: input.label }, salary: capture.salary },
          },
          frameId,
        );
        try {
          await chrome.tabs.update(jobTabId, { active: true });
        } catch {
          /* focus best-effort */
        }
        if (resp && resp.ok) return { ok: true, id: appId ?? 0, label: input.label };
        return { ok: false, error: "Couldn't open the fill panel on the job page." };
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
