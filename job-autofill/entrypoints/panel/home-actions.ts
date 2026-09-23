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

type FrameScan = { frameId: number; adapter: string; fieldCount: number };

// Ping every frame in the tab and return the ones running the content script (with their detected
// adapter + fillable field count). This is the SAME view the filler uses to choose a target frame,
// so anything the filler can fill shows up here — used both to pick the fill frame and to decide
// whether the page actually has a job form (so the "not a job page" warning never contradicts fill).
async function scanFrames(tabId: number): Promise<FrameScan[]> {
  let frames: Array<{ frameId: number }> = [];
  try {
    frames = (await chrome.webNavigation.getAllFrames({ tabId })) ?? [];
  } catch {
    /* top frame only */
  }
  if (!frames.length) frames = [{ frameId: 0 }];
  const results: FrameScan[] = [];
  for (const f of frames) {
    try {
      const r = await sendTo(tabId, { type: "JAF_PING" }, f.frameId);
      if (r && r.ok) results.push({ frameId: f.frameId, adapter: r.adapter, fieldCount: r.fieldCount });
    } catch {
      /* frame not injectable */
    }
  }
  return results;
}

// A frame is a fill target if it matched a real ATS adapter, or has ≥2 mapped fields (a job form
// always has at least a couple; a random page has 0–1). Kept lenient on purpose — the warning
// should fire only when there's clearly nothing to fill.
function framesHaveForm(frames: FrameScan[]): boolean {
  return frames.some((f) => f.adapter !== "generic" || f.fieldCount >= 2);
}

async function pickFrame(tabId: number): Promise<number> {
  const results = await scanFrames(tabId);
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

/**
 * Push the answers the filler learned from the user's corrections up to the server and merge
 * the server's set back down, so they follow the user to their other devices and to ATS hosts
 * they haven't filled on yet. Deliberately NOT part of `syncNow` here: this call site gates
 * `pushAll` behind the one-time resume migration, and syncNow would re-push every resume on
 * every drawer open. Best-effort — a field-cache failure must not break the mirror refresh.
 *
 * The profile id must match the one the filler writes under (`values.email`, see
 * content/filler.js), or `exportAll` returns nothing.
 */
async function syncLearnedAnswers(provider: any): Promise<void> {
  const cache = JAF().fieldCache;
  if (!cache) return;
  try {
    const bio = await JAF().storage.getBio();
    cache.setProfile((bio && bio.email) || "default");
    await JAF().sync.syncFieldCache(provider, cache);
  } catch {
    /* offline / server without the endpoint → keep the local answers */
  }
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
    // 11.3: ask instead of guessing. The old 90 s throttle skipped refreshes that were
    // needed and allowed ones that weren't; `checkAndPull` GETs the server's profile version
    // and pulls only when it differs from the one we hold. It stamps __profileVersion +
    // __lastPull itself, so there is nothing to save here.
    await JAF().sync.checkAndPull(provider, S, settings);
    // Learned answers are a separate, local-first store — a push+merge, not part of the
    // profile version — so it runs whether or not the mirror moved. It used to sit behind
    // the same throttle, so it now runs on every drawer open rather than at most once per
    // 90 s: a user-initiated, best-effort round-trip, and the answers land sooner.
    await syncLearnedAnswers(provider);
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
export type PageCapture =
  | { ok: true; capture: any; signal: boolean; hasForm: boolean }
  | { ok: false; error: string };

/**
 * Read the current page's job details from the TOP frame (JSON-LD/og live there) and scan every
 * frame for a fillable form. `signal` = top-frame job-posting signal (ATS adapter / schema.org
 * JobPosting / known board). `hasForm` = any frame has a real ATS adapter or fillable fields (the
 * same frames the filler targets — so an iframed ATS form like Workday counts). Both feed the
 * WARN-not-block checks before Save/Fill.
 */
export async function capturePage(): Promise<PageCapture> {
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
  const hasForm = framesHaveForm(await scanFrames(tab.id));
  return { ok: true, capture: capResp.capture, signal: !!capResp.signal, hasForm };
}

/**
 * Phase 13.2 — which of my resumes fits the job on this page? Pro only, and only once the user has
 * turned on Kiwiply AI with consent in Options (the scores come from the same server AI). Runs on
 * a real job description: the generic page-summary fallback is too thin to score, so it's skipped.
 * The server caches per (posting × resumes), so reopening the drawer on the same job is free.
 * Resolves to null whenever there is nothing worth showing; never throws.
 */
export type ResumeFit = { localId: string; label: string; score: number; why: string };
/** The job on this page, as the fit checks need it (13.3 reuses 13.2's capture — no second read). */
export type PageJob = { jobDescription: string; role: string; company: string };
/** `scores` = 13.2's match % per LOCAL resume id — the one number the drawer shows for a resume. */
export type ResumeFitResult = { best: ResumeFit | null; job: PageJob; scores: Record<string, number> } | { optIn: true } | null;

export async function matchResumesForPage(resumes: any[]): Promise<ResumeFitResult> {
  try {
    const settings = await JAF().storage.getSettings();
    if (!settings.apiBaseUrl || settings.plan !== "PRO") return null;
    if (!resumes.some((r) => r.serverId != null)) return null;
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || tab.id == null || /^chrome:|^edge:|^about:/.test(tab.url || "")) return null;
    await ensureInjected(tab.id);
    const resp: any = await sendTo(tab.id, { type: "JAF_CAPTURE_JOB" }, 0).catch(() => null);
    const cap = resp && resp.capture;
    const jd = String((cap && cap.jobDescription) || "");
    if (!cap || (cap.sources && cap.sources.jobDescription === "generic") || jd.length < 200) return null;
    if (!(settings.serverAiEnabled && settings.serverAiConsent)) return { optIn: true };

    const provider = JAF().sync.providerFromSettings(settings, JAF().tracking.chromeTokenStore());
    if (!(await provider.isAuthenticated())) return null;
    const job: PageJob = { jobDescription: jd, role: String(cap.role || ""), company: String(cap.company || "") };
    let best: ResumeFit | null = null;
    const scores: Record<string, number> = {};
    try {
      const r: any = await provider.resumeMatch({ ...job, consent: true });
      const localOf = (serverId: any) => resumes.find((x) => x.serverId != null && String(x.serverId) === String(serverId));
      for (const s of (r && r.scores) || []) {
        const l = localOf(s.resumeId);
        if (l) scores[l.id] = Number(s.score) || 0;
      }
      const b = r && r.best;
      const local = b && localOf(b.resumeId);
      if (local) best = { localId: local.id, label: local.label || b.label, score: Number(b.score) || 0, why: String(b.why || "") };
    } catch {
      /* no best-match line — the job-fit check can still run */
    }
    return { best, job, scores };
  } catch {
    return null; // offline, Free after all (402), provider down — the picker just works as before
  }
}

/**
 * Phase 13.3 — the job-fit report for one resume against the job on this page: match %, what it
 * covers, what it's missing, and red flags. Run on request (it's the heavier call); cached by the
 * server per (posting × resume × the profile answers red flags read), so asking again is free.
 */
export type JobFitData = { score: number; summary: string; matched: string[]; missing: string[]; redFlags: string[] };
export type JobFitOutcome = { fit: JobFitData } | { message: string };

export async function checkJobFit(resume: any, job: PageJob): Promise<JobFitOutcome> {
  if (!resume || resume.serverId == null) return { message: "Save this resume to your account first — then Kiwiply can check it." };
  try {
    const settings = await JAF().storage.getSettings();
    const provider = JAF().sync.providerFromSettings(settings, JAF().tracking.chromeTokenStore());
    const r: any = await provider.jobFit({ resumeId: resume.serverId, ...job, consent: true });
    if (r && r.fit) {
      const f = r.fit;
      const list = (v: any) => (Array.isArray(v) ? v.map(String) : []);
      return { fit: { score: Number(f.score) || 0, summary: String(f.summary || ""), matched: list(f.matched), missing: list(f.missing), redFlags: list(f.redFlags) } };
    }
    if (r && r.quotaExceeded) {
      const d = r.resetsAt ? new Date(r.resetsAt) : null;
      const when = d && !isNaN(d.getTime()) ? d.toLocaleDateString(undefined, { month: "long", day: "numeric", timeZone: "UTC" }) : "";
      return { message: `You've used this month's Kiwiply AI${when ? ` — it resets on ${when}` : ""}.` };
    }
    if (r && r.disabled) return { message: "The job-fit check is switched off right now." };
    return { message: "Couldn't check the fit right now. Please try again." };
  } catch (e: any) {
    if (e && e.code === "PRO_REQUIRED") return { message: "The job-fit check is part of Pro." };
    return { message: "Couldn't check the fit right now. Please try again." };
  }
}

/** Push the (possibly user-edited) capture to the board as a SAVED entry. */
export async function commitSaveJob(capture: any): Promise<SaveJobResult> {
  const res: any = await chrome.runtime.sendMessage({ type: "JAF_SAVE_JOB", capture });
  if (res && res.ok) {
    const c = capture || {};
    return { ok: true, message: `Saved${c.company ? " · " + c.company : ""}${c.role ? " — " + c.role : ""}${c.salary ? " · " + c.salary : ""}` };
  }
  if (res && res.reason === "not-signed-in") return { ok: false, error: "Connect the extension on kiwiply.com to save jobs." };
  return { ok: false, error: "Couldn't save this job" + (res && res.reason ? ` (${res.reason})` : "") + "." };
}
