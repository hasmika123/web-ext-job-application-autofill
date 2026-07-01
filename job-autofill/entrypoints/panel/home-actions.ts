/**
 * Home-view actions — the engine-coupled logic (window.JAF + chrome.*) for the drawer's home
 * surface (resume picker → scan & fill, save-a-job, connected-account status, mirror refresh).
 *
 * Moved verbatim from the old popup's actions.ts when the popup became the side-panel drawer
 * (the toolbar icon now opens the panel, not a popup). Framework-free; returns plain results the
 * React view turns into status. The in-panel resume upload no longer needs a cross-document
 * storage handoff — the home view hands the File straight to the review view in memory — so the
 * old `openReview` is gone.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
const JAF = () => window.JAF;

// The content script is bundled into one self-contained file; inject THAT on pages the manifest
// content_scripts don't already cover (activeTab).
const CONTENT_FILES = ["content-scripts/content.js"];

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

async function pickFrame(tabId: number): Promise<number> {
  let frames: Array<{ frameId: number }> = [];
  try {
    frames = (await chrome.webNavigation.getAllFrames({ tabId })) ?? [];
  } catch {
    /* top frame only */
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

function fileToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1]);
    r.onerror = () => reject(new Error("file read failed"));
    r.readAsDataURL(blob);
  });
}

export type Account = { connected: boolean; who: string };

/**
 * Read the live connected-account status straight from the session token (not the cached store),
 * so the connect prompt hides and the signed-in identity shows the moment the web /connect handoff
 * lands. Mirrors options/actions.ts readAccount.
 */
export async function readAccount(): Promise<Account> {
  const tok: any = await new Promise((res) =>
    chrome.storage.local.get("trackingAuth", (o) => res((o && o.trackingAuth) || {})),
  );
  return { connected: !!(tok && tok.access), who: tok.username || "your account" };
}

/** Read-only mirror: pull the latest profile + resumes (best-effort, throttled). */
export async function refreshMirror(): Promise<void> {
  const S = JAF().storage;
  try {
    const settings = await S.getSettings();
    if (!settings.apiBaseUrl) return;
    const provider = JAF().sync.providerFromSettings(settings, JAF().tracking.chromeTokenStore());
    if (!(await provider.isAuthenticated())) return;
    if (!settings.__migratedResumes) {
      const resumes = await S.getResumes();
      if (resumes.some((r: any) => r.serverId == null && !r.archived)) {
        try {
          await JAF().sync.pushAll(provider, S);
        } catch {
          /* offline-friendly */
        }
      }
      settings.__migratedResumes = true;
      await S.saveSettings(settings);
    }
    const now = Date.now();
    if (settings.__lastPull && now - settings.__lastPull < 90 * 1000) return; // throttle
    await JAF().sync.pullAll(provider, S);
    const s2 = await S.getSettings();
    s2.__lastPull = now;
    await S.saveSettings(s2);
  } catch {
    /* offline / not connected → use the cached mirror */
  }
}

export type HomeData = { bio: any; resumes: any[]; settings: any };

/** Load the home view's data after the mirror refresh. `resumes` are the pickable (non-archived) ones. */
export async function loadData(): Promise<HomeData> {
  const S = JAF().storage;
  const [bio, resumes, settings] = await Promise.all([S.getBio(), S.getResumes(), S.getSettings()]);
  return { bio, resumes: resumes.filter((r: any) => !r.archived), settings };
}

export type FillResult = { ok: true; adapter: string } | { ok: false; error: string };

export async function fillPage(resume: any, bio: any, autoAdvance: boolean): Promise<FillResult> {
  const S = JAF().storage;
  const SCH = JAF().schema;
  const settings = await S.getSettings();
  settings.lastResumeId = resume.id;
  settings.autoAdvance = autoAdvance;
  await S.saveSettings(settings);

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || tab.id == null || /^chrome:|^edge:|^about:/.test(tab.url || "")) return { ok: false, error: "Can't run on this page." };

  await ensureInjected(tab.id);
  const frameId = await pickFrame(tab.id);

  // Best-effort: read the job's salary from the TOP frame (JSON-LD / job metadata lives there, not
  // inside a nested ATS form iframe) so the review overlay can surface it while previewing the fill.
  let salary: string | undefined;
  try {
    const cap = await sendTo(tab.id, { type: "JAF_CAPTURE_JOB" }, 0);
    salary = cap && cap.capture && cap.capture.salary ? String(cap.capture.salary) : undefined;
  } catch {
    /* salary is best-effort context, never blocks the fill */
  }

  // EEO/demographic answers are always included (the user opts in via their web bio; blanks fill nothing).
  const values = SCH.buildFillValues(bio, resume, { includeEEO: true });

  let file: any = null;
  if (resume.hasFile) {
    const blob = await S.getResumeFile(resume.id);
    if (blob) file = { name: SCH.uploadResumeName(bio, resume.fileName), type: blob.type || "application/pdf", base64: await fileToBase64(blob) };
  }
  const resumeRef = { serverId: resume.serverId != null ? resume.serverId : null, label: resume.label };
  const resp = await sendTo(
    tab.id,
    { type: "JAF_FILL", values, file, options: { autoAdvance: settings.autoAdvance, autoAddRows: settings.autoAddRows !== false, resume: resumeRef, salary } },
    frameId,
  );
  if (resp && resp.ok) return { ok: true, adapter: resp.adapter };
  return { ok: false, error: "Could not open the review panel on this page." };
}

export type SaveJobResult = { ok: true; message: string } | { ok: false; error: string };

export async function saveJob(): Promise<SaveJobResult> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || tab.id == null || /^chrome:|^edge:|^about:/.test(tab.url || "")) return { ok: false, error: "Can't read this page." };
  await ensureInjected(tab.id);
  let capResp: any = null;
  try {
    capResp = await sendTo(tab.id, { type: "JAF_CAPTURE_JOB" }, 0);
  } catch {
    /* capture best-effort */
  }
  if (!capResp || !capResp.capture) return { ok: false, error: "Couldn't read job details on this page." };
  const res: any = await chrome.runtime.sendMessage({ type: "JAF_SAVE_JOB", capture: capResp.capture });
  if (res && res.ok) {
    const c = capResp.capture;
    return { ok: true, message: `Saved${c.company ? " · " + c.company : ""}${c.role ? " — " + c.role : ""}${c.salary ? " · " + c.salary : ""}` };
  }
  if (res && res.reason === "not-signed-in") return { ok: false, error: "Connect the extension on kiwiply.com to save jobs." };
  return { ok: false, error: "Couldn't save this job" + (res && res.reason ? ` (${res.reason})` : "") + "." };
}
