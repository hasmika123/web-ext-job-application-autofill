/* popup.js */
const S = window.JAF.storage;
const SCH = window.JAF.schema;
const JAF = window.JAF;
const WEB = "https://kiwiply.com";

const CONTENT_FILES = [
  "src/lib/schema.js",
  "src/lib/field-cache.js",
  "src/content/adapters/base.js",
  "src/content/adapters/generic.js",
  "src/content/adapters/greenhouse.js",
  "src/content/adapters/lever.js",
  "src/content/adapters/ashby.js",
  "src/content/adapters/workable.js",
  "src/content/adapters/workday.js",
  "src/content/adapters/indeed.js",
  "src/lib/job-capture.js",
  "src/lib/app-tracking.js",
  "src/content/submit-detect.js",
  "src/content/filler.js",
  "src/content/content-script.js",
];

const $ = (id) => document.getElementById(id);

async function init() {
  $("manage").onclick = () => chrome.tabs.create({ url: WEB + "/dashboard" });
  $("settings-link").onclick = () => chrome.runtime.openOptionsPage();
  $("bio-warn").onclick = () => chrome.tabs.create({ url: WEB });

  await refreshMirror(); // read-only mirror: pull the latest profile + resumes (best-effort)

  const [bio, resumes, settings] = await Promise.all([S.getBio(), S.getResumes(), S.getSettings()]);

  const hasBio = bio && (bio.firstName || bio.email);
  $("bio-warn").classList.toggle("hidden", !!hasBio);

  // Archived resumes are kept (they preserve tracker links) but hidden from the
  // active picker — see the resume-archive guard (3.5).
  const pickable = resumes.filter((r) => !r.archived);
  const sel = $("resume");
  if (!pickable.length) {
    sel.innerHTML = `<option value="">${resumes.length ? "All resumes archived — manage on kiwiply.com" : "No resumes — add one on kiwiply.com"}</option>`;
    sel.disabled = true;
    $("fill").disabled = true;
  } else {
    sel.innerHTML = pickable
      .map((r) => `<option value="${r.id}" title="${escapeHtml(r.label)}">${escapeHtml(truncateLabel(r.label))}</option>`)
      .join("");
    if (settings.lastResumeId && pickable.find((r) => r.id === settings.lastResumeId))
      sel.value = settings.lastResumeId;
  }

  $("autoadv").checked = !!settings.autoAdvance;

  const showMeta = () => {
    const r = pickable.find((x) => x.id === sel.value);
    // Counts are numbers + static strings (no user input) → innerHTML is safe here.
    $("meta").innerHTML = r
      ? `${(r.skills || []).length} skills · ${(r.experience || []).length} roles · ` +
        `<span class="${r.hasFile ? "ok" : "no"}">${r.hasFile ? "file ✓" : "no file"}</span>`
      : "";
  };
  showMeta();
  sel.onchange = showMeta;

  $("fill").onclick = () => doFill(pickable, bio).catch((e) => setStatus(String(e.message || e), true));
  $("savejob").onclick = () => doSaveJob().catch((e) => setStatus(String(e.message || e), true));

  // Report a bug / idea — the form now lives on the options page (slim popup). Deep-link
  // straight to its "#bug" section so the header bug icon lands the user on the form.
  $("bug-link").onclick = () =>
    chrome.tabs.create({ url: chrome.runtime.getURL("src/options/options.html#bug") });

  // Upload a resume on the fly (Phase 3b): pick a file, then choose parse-&-save vs use-once.
  let pendingUpload = null;
  $("upload-resume").onclick = () => $("resume-file").click();
  $("resume-file").onchange = (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = ""; // allow re-picking the same file
    if (!f) return;
    pendingUpload = f;
    $("uc-name").textContent = "Use “" + f.name + "”…";
    $("upload-choice").classList.remove("hidden");
  };
  $("uc-cancel").onclick = () => {
    pendingUpload = null;
    $("upload-choice").classList.add("hidden");
  };
  $("uc-once").onclick = () => {
    const f = pendingUpload;
    pendingUpload = null;
    $("upload-choice").classList.add("hidden");
    if (f) openReview(f, "attach").catch((err) => setStatus(String(err.message || err), true));
  };
  $("uc-save").onclick = () => {
    const f = pendingUpload;
    pendingUpload = null;
    $("upload-choice").classList.add("hidden");
    if (f) openReview(f, "save").catch((err) => setStatus(String(err.message || err), true));
  };
}

// Keep only the fields the review editor + server care about (drop __rawText/__warning).
function sanitizeStructured(s) {
  s = s || {};
  return {
    summary: typeof s.summary === "string" ? s.summary : "",
    skills: Array.isArray(s.skills) ? s.skills.filter((x) => typeof x === "string") : [],
    experience: Array.isArray(s.experience) ? s.experience : [],
    education: Array.isArray(s.education) ? s.education : [],
    languages: Array.isArray(s.languages) ? s.languages : [],
    projects: Array.isArray(s.projects) ? s.projects : [],
  };
}

// Upload on the fly: parse locally, then hand the file + parsed structure to the dedicated
// review tab. mode "save" → review & save as a library resume; mode "attach" → review, fill
// THIS job page, and attach the PDF to the resulting application (no resume row). Both need a
// connected account (save creates a resume; attach uploads the PDF to the application).
async function openReview(file, mode) {
  const settings = await S.getSettings();
  // Authoritative connection check: read the session token directly — exactly what the options
  // page's "connected" status uses (stored by the kiwiply.com /connect handoff). This avoids any
  // provider-construction edge that could falsely report "not connected".
  const tok = await new Promise((res) => chrome.storage.local.get("trackingAuth", (o) => res((o && o.trackingAuth) || {})));
  if (!settings.apiBaseUrl || !tok.access) {
    return setStatus("Connect the extension first — open Settings → “Connect to kiwiply.com”.", true);
  }

  setStatus("Reading resume…");
  let structured;
  try {
    structured = await JAF.parser.parse(file, settings);
  } catch (e) {
    return setStatus("Couldn't read that file: " + (e.message || e), true);
  }

  // The review tab drives the fill on THIS job tab (mode "attach"), so capture its id now.
  let jobTabId = null;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) jobTabId = tab.id;
  } catch (e) {
    /* no active tab — attach mode will warn */
  }

  const label = (file.name || "Resume").replace(/\.[^.]+$/, "").trim() || "Resume";
  // Handoff: file bytes -> temp IndexedDB key; parsed structure + meta -> chrome.storage.local.
  await S.saveResumeFile("__pending_review", file);
  await new Promise((res) =>
    chrome.storage.local.set(
      {
        pendingResumeReview: {
          structured: sanitizeStructured(structured),
          label,
          fileName: file.name,
          fileType: file.type || "application/pdf",
          mode: mode === "attach" ? "attach" : "save",
          jobTabId,
        },
      },
      () => res(),
    ),
  );
  await chrome.tabs.create({ url: chrome.runtime.getURL("src/review/review.html") });
  window.close();
}

// Read-only mirror: pull the latest profile + resumes from the server (best-effort,
// throttled). Editing happens on the web; the extension only mirrors. Also runs a
// one-time push of any local-only resumes so nothing predating the web account is lost.
async function refreshMirror() {
  try {
    const settings = await S.getSettings();
    if (!settings.apiBaseUrl) return; // not connected yet
    const provider = JAF.sync.providerFromSettings(settings, JAF.tracking.chromeTokenStore());
    if (!(await provider.isAuthenticated())) return; // offline or signed out → use cache

    if (!settings.__migratedResumes) {
      const resumes = await S.getResumes();
      if (resumes.some((r) => r.serverId == null && !r.archived)) {
        try { await JAF.sync.pushAll(provider, S); } catch (e) {}
      }
      settings.__migratedResumes = true;
      await S.saveSettings(settings);
    }

    const now = Date.now();
    if (settings.__lastPull && now - settings.__lastPull < 90 * 1000) return; // throttle
    await JAF.sync.pullAll(provider, S);
    const s2 = await S.getSettings();
    s2.__lastPull = now;
    await S.saveSettings(s2);
  } catch (e) {
    /* offline / not connected → the popup uses the existing cached mirror */
  }
}

// state: "err" (or truthy) = error, "ok" = success, falsy = neutral.
function setStatus(msg, state) {
  const s = $("status");
  s.textContent = msg;
  s.classList.toggle("ok", state === "ok");
  s.classList.toggle("err", !!state && state !== "ok");
}

async function ensureInjected(tabId) {
  // Try a ping to the top frame; if no content script, inject into all frames.
  try {
    const r = await sendTo(tabId, { type: "JAF_PING" }, 0);
    if (r && r.ok) return;
  } catch (e) {}
  await chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    files: CONTENT_FILES,
  });
}

function sendTo(tabId, msg, frameId) {
  return new Promise((resolve, reject) => {
    const opts = frameId === undefined ? undefined : { frameId };
    chrome.tabs.sendMessage(tabId, msg, opts, (resp) => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(resp);
    });
  });
}

async function pickFrame(tabId) {
  let frames = [];
  try { frames = await chrome.webNavigation.getAllFrames({ tabId }); } catch (e) {}
  if (!frames || !frames.length) frames = [{ frameId: 0 }];
  const results = [];
  for (const f of frames) {
    try {
      const r = await sendTo(tabId, { type: "JAF_PING" }, f.frameId);
      if (r && r.ok) results.push({ frameId: f.frameId, ...r });
    } catch (e) {}
  }
  if (!results.length) return 0;
  results.sort((a, b) => {
    const sa = (a.adapter !== "generic" ? 1000 : 0) + a.fieldCount;
    const sb = (b.adapter !== "generic" ? 1000 : 0) + b.fieldCount;
    return sb - sa;
  });
  return results[0].frameId;
}

async function fileToBase64(blob) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result.split(",")[1]);
    r.onerror = () => rej(new Error("file read failed"));
    r.readAsDataURL(blob);
  });
}

async function doFill(resumes, bio) {
  const sel = $("resume");
  const resume = resumes.find((r) => r.id === sel.value);
  if (!resume) return setStatus("Pick a resume first.", true);

  const settings = await S.getSettings();
  settings.lastResumeId = resume.id;
  settings.autoAdvance = $("autoadv").checked;
  await S.saveSettings(settings);

  setStatus("Scanning page…");
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || /^chrome:|^edge:|^about:/.test(tab.url || "")) return setStatus("Can't run on this page.", true);

  await ensureInjected(tab.id);
  const frameId = await pickFrame(tab.id);

  // EEO / demographic answers are always included (the user opts in by entering
  // them in their bio on the web; blank answers simply fill nothing).
  const values = SCH.buildFillValues(bio, resume, { includeEEO: true });

  let file = null;
  if (resume.hasFile) {
    const blob = await S.getResumeFile(resume.id);
    // Upload under a generic firstname_lastname_resume.<ext> name (this attachment
    // only); the stored resume keeps its original fileName everywhere else.
    if (blob) file = { name: SCH.uploadResumeName(bio, resume.fileName), type: blob.type || "application/pdf", base64: await fileToBase64(blob) };
  }

  // Pass the picked resume so the auto-logged DRAFT application can link it (3.2).
  const resumeRef = { serverId: resume.serverId != null ? resume.serverId : null, label: resume.label };
  const resp = await sendTo(tab.id, { type: "JAF_FILL", values, file, options: { autoAdvance: settings.autoAdvance, autoAddRows: settings.autoAddRows !== false, resume: resumeRef } }, frameId);
  if (resp && resp.ok) {
    setStatus(`Review panel open (${resp.adapter}). Check values, then fill.`, "ok");
    setTimeout(() => window.close(), 1200);
  } else {
    setStatus("Could not open the review panel on this page.", true);
  }
}

// Save-a-job (3.3): capture the current page (top frame) and create a SAVED entry via
// the service worker — no resume attached. Works without a resume selected.
async function doSaveJob() {
  setStatus("Reading this job…");
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || /^chrome:|^edge:|^about:/.test(tab.url || "")) return setStatus("Can't read this page.", true);

  await ensureInjected(tab.id);
  let capResp = null;
  try { capResp = await sendTo(tab.id, { type: "JAF_CAPTURE_JOB" }, 0); } catch (e) {}
  if (!capResp || !capResp.capture) return setStatus("Couldn't read job details on this page.", true);

  const res = await chrome.runtime.sendMessage({ type: "JAF_SAVE_JOB", capture: capResp.capture });
  if (res && res.ok) {
    const c = capResp.capture;
    setStatus(`Saved${c.company ? " · " + c.company : ""}${c.role ? " — " + c.role : ""}`, "ok");
  } else if (res && res.reason === "not-signed-in") {
    setStatus("Connect the extension on kiwiply.com to save jobs.", true);
  } else {
    setStatus("Couldn't save this job" + (res && res.reason ? ` (${res.reason})` : "") + ".", true);
  }
}

// Keep the picker at a fixed field width: cap how much of a long resume name shows
// (the native option list otherwise grows to the longest name). Full name stays in
// the option's title for hover.
function truncateLabel(s, max = 38) {
  s = String(s);
  return s.length > max ? s.slice(0, max - 1).trimEnd() + "…" : s;
}

function escapeHtml(s) { return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

init();
