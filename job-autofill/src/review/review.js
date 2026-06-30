/* review.js — in-extension "parse & save" resume review/editor (Phase 3b).
 *
 * The popup parses an uploaded file and hands off: the parsed structure + meta via
 * chrome.storage.local["pendingResumeReview"], and the file bytes via the IndexedDB temp
 * key "__pending_review". This page lets the user edit the parse, then saves it as a real
 * resume (metadata + file) on their account via the TrackingProvider seam, and refreshes
 * the local mirror so the popup picker shows it. Editing existing resumes still lives on the web.
 */
const S = window.JAF.storage;
const JAF = window.JAF;
const $ = (id) => document.getElementById(id);
const TEMP_FILE_KEY = "__pending_review";

let struct = null; // { summary, skills[], experience[], education[], languages[], projects[] }
let meta = null; // { label, fileName, fileType }
let blob = null; // the uploaded file (Blob)

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

async function init() {
  const data = await new Promise((res) => chrome.storage.local.get("pendingResumeReview", (o) => res(o && o.pendingResumeReview)));
  blob = await S.getResumeFile(TEMP_FILE_KEY).catch(() => null);
  if (!data || !data.structured || !blob) {
    $("loading").textContent = "Nothing to review here. Open this from the extension popup's “Upload a resume → Parse & save”.";
    return;
  }
  struct = data.structured;
  struct.experience = Array.isArray(struct.experience) ? struct.experience : [];
  struct.education = Array.isArray(struct.education) ? struct.education : [];
  meta = { label: data.label || "Resume", fileName: data.fileName || "resume", fileType: data.fileType || "application/pdf" };

  $("r-label").value = meta.label;
  $("r-summary").value = struct.summary || "";
  $("r-skills").value = (struct.skills || []).join(", ");
  renderExp();
  renderEdu();

  $("exp-add").onclick = () => {
    syncFromDom();
    struct.experience.push({ company: "", title: "", location: "", startDate: "", endDate: "", current: false, bullets: [] });
    renderExp();
  };
  $("edu-add").onclick = () => {
    syncFromDom();
    struct.education.push({ school: "", degree: "", field: "", startDate: "", endDate: "" });
    renderEdu();
  };
  $("r-save").onclick = () => save().catch((e) => setStatus(String((e && e.message) || e), true));
  $("r-cancel").onclick = () => cleanup().finally(() => window.close());

  $("loading").classList.add("hidden");
  $("editor").classList.remove("hidden");
}

function renderExp() {
  const host = $("exp-list");
  host.innerHTML = (struct.experience || [])
    .map(
      (e, i) => `
      <div class="entry" data-exp="${i}">
        <button class="removex" data-rm-exp="${i}" type="button">remove ✕</button>
        <div class="row2">
          <input class="input" data-f="company" placeholder="Company" value="${esc(e.company)}" />
          <input class="input" data-f="title" placeholder="Title" value="${esc(e.title)}" />
        </div>
        <div class="row2">
          <input class="input" data-f="location" placeholder="Location" value="${esc(e.location)}" />
          <input class="input" data-f="startDate" placeholder="Start (e.g. 2021)" value="${esc(e.startDate)}" />
        </div>
        <div class="row2">
          <input class="input" data-f="endDate" placeholder="End (e.g. 2023 / Present)" value="${esc(e.endDate)}" />
          <label class="check2"><input type="checkbox" data-f="current" ${e.current ? "checked" : ""} /> Current role</label>
        </div>
        <textarea class="wide" data-f="bullets" rows="3" placeholder="One bullet per line">${esc((e.bullets || []).join("\n"))}</textarea>
      </div>`,
    )
    .join("");
  host.querySelectorAll("[data-rm-exp]").forEach((b) =>
    b.addEventListener("click", () => {
      syncFromDom();
      struct.experience.splice(Number(b.getAttribute("data-rm-exp")), 1);
      renderExp();
    }),
  );
}

function renderEdu() {
  const host = $("edu-list");
  host.innerHTML = (struct.education || [])
    .map(
      (e, i) => `
      <div class="entry" data-edu="${i}">
        <button class="removex" data-rm-edu="${i}" type="button">remove ✕</button>
        <div class="row2">
          <input class="input" data-f="school" placeholder="School" value="${esc(e.school)}" />
          <input class="input" data-f="degree" placeholder="Degree" value="${esc(e.degree)}" />
        </div>
        <div class="row2">
          <input class="input" data-f="field" placeholder="Field of study" value="${esc(e.field)}" />
          <input class="input" data-f="endDate" placeholder="End (e.g. 2020)" value="${esc(e.endDate)}" />
        </div>
      </div>`,
    )
    .join("");
  host.querySelectorAll("[data-rm-edu]").forEach((b) =>
    b.addEventListener("click", () => {
      syncFromDom();
      struct.education.splice(Number(b.getAttribute("data-rm-edu")), 1);
      renderEdu();
    }),
  );
}

// Read every editable control back into `struct` (so add/remove re-renders and save are current).
function syncFromDom() {
  struct.summary = $("r-summary").value;
  struct.skills = $("r-skills").value.split(",").map((s) => s.trim()).filter(Boolean);
  $("exp-list").querySelectorAll("[data-exp]").forEach((card) => {
    const i = Number(card.getAttribute("data-exp"));
    const e = struct.experience[i];
    if (!e) return;
    card.querySelectorAll("[data-f]").forEach((el) => {
      const f = el.getAttribute("data-f");
      if (f === "current") e.current = el.checked;
      else if (f === "bullets") e.bullets = el.value.split("\n").map((b) => b.trim()).filter(Boolean);
      else e[f] = el.value;
    });
  });
  $("edu-list").querySelectorAll("[data-edu]").forEach((card) => {
    const i = Number(card.getAttribute("data-edu"));
    const e = struct.education[i];
    if (!e) return;
    card.querySelectorAll("[data-f]").forEach((el) => (e[el.getAttribute("data-f")] = el.value));
  });
}

function setStatus(msg, err) {
  const s = $("r-status");
  s.textContent = msg;
  s.style.color = err ? "var(--warn)" : "var(--ok)";
}

async function cleanup() {
  try {
    await new Promise((res) => chrome.storage.local.remove("pendingResumeReview", () => res()));
    await S.deleteResumeFile(TEMP_FILE_KEY);
  } catch (e) {
    /* best-effort temp cleanup */
  }
}

async function save() {
  syncFromDom();
  const label = ($("r-label").value || "").trim() || "Resume";

  setStatus("Saving…");
  $("r-save").disabled = true;
  try {
    const settings = await S.getSettings();
    const provider = JAF.sync.providerFromSettings(settings, JAF.tracking.chromeTokenStore());
    if (!(await provider.isAuthenticated())) {
      setStatus("Not connected — connect the extension on kiwiply.com first.", true);
      return;
    }
    // 1) Create the resume row with the reviewed structure (CONFIRMED = reviewed).
    const saved = await provider.createResume({ label, parsedJson: JSON.stringify(struct), status: "CONFIRMED" });
    const serverId = saved && saved.serverId != null ? saved.serverId : saved && saved.id != null ? saved.id : null;
    if (serverId == null) {
      setStatus("Couldn't save the resume (no id returned).", true);
      return;
    }
    // 2) Upload the file bytes.
    await provider.uploadResumeFile(serverId, blob, meta.fileName);
    // 3) Refresh the local mirror so the popup picker shows it (best-effort).
    try {
      await JAF.sync.pullAll(provider, S);
    } catch (e) {
      /* offline-friendly; the next popup open will pull it */
    }
    await cleanup();
    setStatus("Saved ✓ — it's on your board.");
    setTimeout(() => window.close(), 1200);
  } catch (e) {
    setStatus("Couldn't save: " + ((e && e.message) || e), true);
  } finally {
    $("r-save").disabled = false;
  }
}

init();
