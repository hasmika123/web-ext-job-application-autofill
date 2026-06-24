/* options.js */
const S = window.JAF.storage;
const SCH = window.JAF.schema;
const P = window.JAF.parser;
const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

const YESNO = ["Yes", "No"];
const US_STATES = ["Alabama","Alaska","Arizona","Arkansas","California","Colorado","Connecticut","Delaware","District of Columbia","Florida","Georgia","Hawaii","Idaho","Illinois","Indiana","Iowa","Kansas","Kentucky","Louisiana","Maine","Maryland","Massachusetts","Michigan","Minnesota","Mississippi","Missouri","Montana","Nebraska","Nevada","New Hampshire","New Jersey","New Mexico","New York","North Carolina","North Dakota","Ohio","Oklahoma","Oregon","Pennsylvania","Rhode Island","South Carolina","South Dakota","Tennessee","Texas","Utah","Vermont","Virginia","Washington","West Virginia","Wisconsin","Wyoming"];
const COUNTRIES = ["United States","Canada","United Kingdom","Ireland","Australia","New Zealand","India","Germany","France","Netherlands","Spain","Italy","Switzerland","Sweden","Singapore","Japan","China","Brazil","Mexico","South Africa","Nigeria","Other"];
const GENDERS = ["Male", "Female", "Non-binary", "Prefer not to say"];
const RACES = ["American Indian or Alaska Native","Asian","Black or African American","Hispanic or Latino","Native Hawaiian or Other Pacific Islander","White","Two or More Races","Prefer not to say"];
const VETERAN = ["I am not a protected veteran","I identify as one or more classifications of a protected veteran","Prefer not to say"];
const DISABILITY = ["Yes, I have a disability (or previously had one)","No, I do not have a disability","Prefer not to answer"];

// descriptor: [key, label, kind, full, options]  kind: text|email|tel|select|datalist
const BIO_FIELDS = [
  ["firstName", "First name"], ["lastName", "Last name"], ["preferredName", "Preferred name"],
  ["email", "Email", "email"], ["phone", "Phone", "tel"],
  ["addressLine1", "Address", "text", true], ["addressLine2", "Address line 2"],
  ["city", "City"], ["state", "State / Province", "datalist", false, US_STATES],
  ["postalCode", "Postal code"], ["country", "Country", "datalist", false, COUNTRIES],
  ["linkedin", "LinkedIn URL"], ["github", "GitHub URL"], ["website", "Website / Portfolio"],
  ["authorizedToWork", "Authorized to work?", "select", false, YESNO],
  ["requireSponsorship", "Need sponsorship?", "select", false, YESNO],
];
const EEO_FIELDS = [
  ["gender", "Gender", "select", false, GENDERS],
  ["ethnicity", "Hispanic / Latino?", "select", false, ["Yes", "No", "Prefer not to say"]],
  ["race", "Race", "select", false, RACES],
  ["veteranStatus", "Veteran status", "select", false, VETERAN],
  ["disabilityStatus", "Disability status", "select", false, DISABILITY],
];

/* ---------- tabs ---------- */
$$(".navbtn").forEach((b) => b.onclick = () => {
  $$(".navbtn").forEach((x) => x.classList.remove("active"));
  $$(".tab").forEach((x) => x.classList.remove("active"));
  b.classList.add("active");
  $("#tab-" + b.dataset.tab).classList.add("active");
});

/* ---------- bio ---------- */
function fieldHtml([key, label, kind, full, options]) {
  const id = "bio_" + key;
  const cls = `field ${full ? "full" : ""}`;
  if (kind === "select") {
    const opts = ['<option value=""></option>'].concat((options || []).map((o) => `<option value="${esc(o)}">${esc(o)}</option>`)).join("");
    return `<div class="${cls}"><label for="${id}">${label}</label><select class="input" id="${id}">${opts}</select></div>`;
  }
  if (kind === "datalist") {
    const lid = id + "_list";
    const opts = (options || []).map((o) => `<option value="${esc(o)}"></option>`).join("");
    return `<div class="${cls}"><label for="${id}">${label}</label><input class="input" id="${id}" list="${lid}" autocomplete="off" /><datalist id="${lid}">${opts}</datalist></div>`;
  }
  return `<div class="${cls}"><label for="${id}">${label}</label><input class="input" id="${id}" type="${kind || "text"}" /></div>`;
}
/* ---------- date controls (Month + Year dropdowns) ---------- */
const MONTH_ABBR = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function parseYM(str) {
  if (!str) return { y: "", m: "" };
  const s = String(str);
  let mm = s.match(/(\d{4})[-\/.](\d{1,2})/); if (mm) return { y: mm[1], m: String(+mm[2]) };
  mm = s.match(/(\d{1,2})[-\/.](\d{4})/); if (mm) return { y: mm[2], m: String(+mm[1]) };
  const mon = s.toLowerCase().match(/jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec/);
  const yr = (s.match(/\b(19|20)\d{2}\b/) || [])[0] || "";
  return { y: yr, m: mon ? String(MONTH_ABBR.findIndex((a) => a.toLowerCase() === mon[0]) + 1) : "" };
}
function monthOptions(sel) { return ['<option value=""></option>'].concat(MONTH_ABBR.map((nm, i) => `<option value="${i + 1}" ${String(i + 1) === String(sel) ? "selected" : ""}>${nm}</option>`)).join(""); }
function yearOptions(sel) { let o = '<option value=""></option>'; const now = new Date().getFullYear(); for (let y = now + 8; y >= 1965; y--) o += `<option value="${y}" ${String(y) === String(sel) ? "selected" : ""}>${y}</option>`; return o; }
function dateControl(prefix, value, withMonth, disabled) {
  const { y, m } = parseYM(value); const dis = disabled ? "disabled" : "";
  return `<div class="daterow">${withMonth ? `<select class="input dsel ${prefix}-m" ${dis}>${monthOptions(m)}</select>` : ""}<select class="input dsel ${prefix}-y" ${dis}>${yearOptions(y)}</select></div>`;
}
function ymVal(node, prefix, withMonth) {
  const ye = node.querySelector("." + prefix + "-y"); const y = ye ? ye.value : "";
  const me = withMonth ? node.querySelector("." + prefix + "-m") : null; const m = me ? me.value : "";
  if (!y) return ""; return m ? `${y}-${String(m).padStart(2, "0")}` : y;
}

async function renderBio() {
  $("#bio-grid").innerHTML = BIO_FIELDS.map(fieldHtml).join("");
  $("#eeo-grid").innerHTML = EEO_FIELDS.map(fieldHtml).join("");
  const bio = await S.getBio();
  [...BIO_FIELDS, ...EEO_FIELDS].forEach(([k]) => { const el = $("#bio_" + k); if (el) el.value = bio[k] || ""; });
}
$("#save-bio").onclick = async () => {
  const bio = SCH.emptyBio();
  [...BIO_FIELDS, ...EEO_FIELDS].forEach(([k]) => { const el = $("#bio_" + k); if (el) bio[k] = el.value.trim(); });
  await S.saveBio(bio);
  flashSaved("#bio-saved");
  pushIfSignedIn("bio");
};

/* ---------- settings ---------- */
async function renderSettings() {
  const s = await S.getSettings();
  $("#llm").checked = !!s.llmEnabled;
  $("#apikey").value = s.apiKey || "";
  if ($("#server-ai")) $("#server-ai").checked = !!s.serverAiEnabled;
  if ($("#server-ai-consent")) $("#server-ai-consent").checked = !!s.serverAiConsent;
  $("#eeo-default").checked = !!s.includeEEO;
  if ($("#analytics")) $("#analytics").checked = !s.analyticsOptOut; // on by default
  if ($("#autoadv-default")) $("#autoadv-default").checked = !!s.autoAdvance;
  if ($("#autoadd-default")) $("#autoadd-default").checked = s.autoAddRows !== false;
  if ($("#rules-url")) $("#rules-url").value = s.rulesUrl || "";
  renderRulesInfo();
}
function renderRulesInfo() {
  if (!window.JAF.rules || !$("#rules-version")) return;
  const i = window.JAF.rules.info();
  $("#rules-version").value = `v${i.version} (${i.source}${i.updatedAt ? ", " + i.updatedAt : ""})`;
}
$("#save-settings").onclick = async () => {
  const s = await S.getSettings();
  s.llmEnabled = $("#llm").checked;
  s.apiKey = $("#apikey").value.trim();
  if ($("#server-ai")) s.serverAiEnabled = $("#server-ai").checked;
  // Server AI only runs with BOTH the toggle and explicit consent; clear consent if turned off.
  if ($("#server-ai-consent")) s.serverAiConsent = $("#server-ai-consent").checked && !!s.serverAiEnabled;
  s.includeEEO = $("#eeo-default").checked;
  if ($("#analytics")) s.analyticsOptOut = !$("#analytics").checked;
  if ($("#autoadv-default")) s.autoAdvance = $("#autoadv-default").checked;
  if ($("#autoadd-default")) s.autoAddRows = $("#autoadd-default").checked;
  if ($("#rules-url")) s.rulesUrl = $("#rules-url").value.trim();
  await S.saveSettings(s);
  flashSaved("#settings-saved");
};
if ($("#rules-check")) $("#rules-check").onclick = async () => {
  const url = $("#rules-url").value.trim();
  const s = await S.getSettings(); s.rulesUrl = url; await S.saveSettings(s);
  $("#rules-status").textContent = "Checking…";
  const res = await window.JAF.rules.checkForUpdates(url);
  if (!res.ok) $("#rules-status").textContent = "✗ " + res.error;
  else if (!res.updated) $("#rules-status").textContent = `Up to date (v${res.version})`;
  else $("#rules-status").textContent = `✓ Updated to v${res.version}`;
  renderRulesInfo();
};
if ($("#rules-reset")) $("#rules-reset").onclick = async () => {
  await window.JAF.rules.reset();
  $("#rules-status").textContent = "Reset to bundled";
  renderRulesInfo();
};
$("#clear").onclick = async () => {
  if (!confirm("Delete your bio, all resumes and files? This cannot be undone.")) return;
  const list = await S.getResumes();
  for (const r of list) await S.deleteResume(r.id);
  await S.saveBio(SCH.emptyBio());
  await S.saveSettings({ llmEnabled: false, apiKey: "", includeEEO: false, lastResumeId: "", autoAdvance: false, autoAddRows: true, rulesUrl: "", apiBaseUrl: "https://api.kiwiply.com" });
  try { if (acctTokenStore) await acctTokenStore.clear(); } catch (e) {}
  try { await window.JAF.rules.reset(); } catch (e) {}
  await renderAll();
  alert("All data deleted.");
};

function flashSaved(sel) { const e = $(sel); e.textContent = "Saved ✓"; setTimeout(() => (e.textContent = ""), 1800); }
function flashText(sel, text) { const e = $(sel); if (!e) return; e.textContent = text; setTimeout(() => (e.textContent = ""), 3000); }

/* ---------- account & sync ---------- */
const SYNC = window.JAF.sync;
const TRK = window.JAF.tracking;
// One persistent token store for the page; the provider reads/writes it.
const acctTokenStore = TRK ? TRK.chromeTokenStore() : null;

async function currentProvider() {
  const s = await S.getSettings();
  return SYNC.providerFromSettings(s, acctTokenStore);
}
// Build a provider from the URL currently in the field, persisting it first.
async function providerFromForm() {
  const s = await S.getSettings();
  const url = ($("#api-base") ? $("#api-base").value.trim() : "") || s.apiBaseUrl || "";
  if (url !== s.apiBaseUrl) { s.apiBaseUrl = url; await S.saveSettings(s); }
  return SYNC.providerFromSettings({ apiBaseUrl: url }, acctTokenStore);
}

async function renderAccount() {
  if (!$("#tab-account") || !SYNC) return;
  const s = await S.getSettings();
  if ($("#api-base")) $("#api-base").value = s.apiBaseUrl || "";
  let signedIn = false;
  try { signedIn = await (await currentProvider()).isAuthenticated(); } catch (e) {}
  $("#signed-in").classList.toggle("hidden", !signedIn);
  $("#signed-out").classList.toggle("hidden", signedIn);
  if (signedIn && acctTokenStore) {
    const t = await acctTokenStore.get();
    $("#acct-who").textContent = t.username || "your account";
  }
}

// Best-effort push after a local change — never let a sync failure break the
// local save (offline-first).
async function pushIfSignedIn(kind, payload) {
  if (!SYNC) return;
  try {
    const provider = await currentProvider();
    if (!(await provider.isAuthenticated())) return;
    if (kind === "bio") await SYNC.pushBio(provider, S);
    if (kind === "resume" && payload) await SYNC.pushResume(provider, S, payload);
  } catch (e) { /* stay offline-friendly */ }
}

if ($("#api-base")) $("#api-base").onchange = async () => {
  const s = await S.getSettings(); s.apiBaseUrl = $("#api-base").value.trim(); await S.saveSettings(s);
};
if ($("#acct-signin")) $("#acct-signin").onclick = async () => {
  $("#acct-status").textContent = "Signing in…";
  try {
    const provider = await providerFromForm();
    const username = $("#acct-user").value.trim();
    await provider.login({ username, password: $("#acct-pass").value });
    await acctTokenStore.set(Object.assign({}, await acctTokenStore.get(), { username }));
    $("#acct-status").textContent = "Syncing…";
    const sum = await SYNC.pullAll(provider, S);
    $("#acct-pass").value = "";
    await renderAll();
    flashText("#acct-status2", `Signed in. Pulled ${sum.resumeCount} resume(s).`);
  } catch (e) { $("#acct-status").textContent = "✗ " + (e.message || e); }
};
if ($("#acct-signup")) $("#acct-signup").onclick = async () => {
  $("#acct-status").textContent = "Creating account…";
  try {
    const provider = await providerFromForm();
    await provider.register({ login: $("#acct-user").value.trim(), email: $("#acct-email").value.trim(), password: $("#acct-pass").value });
    $("#acct-status").textContent = "Account created. Activate it via email, then sign in. (Local dev: use a seeded account.)";
  } catch (e) { $("#acct-status").textContent = "✗ " + (e.message || e); }
};
if ($("#acct-sync")) $("#acct-sync").onclick = async () => {
  $("#acct-status2").textContent = "Syncing…";
  try {
    const provider = await currentProvider();
    // The field cache is namespaced by the profile the filler uses (the bio email),
    // so point it at the same identity before syncing learned answers.
    let cache = null;
    try {
      if (window.JAF && window.JAF.fieldCache) {
        const bio = await S.getBio();
        window.JAF.fieldCache.setProfile((bio && bio.email) || "default");
        cache = window.JAF.fieldCache;
      }
    } catch (e) {}
    const sum = await SYNC.syncNow(provider, S, cache);
    await renderAll();
    const fc = sum.fieldCache ? ` · ${sum.fieldCache.count} field answer(s)` : "";
    flashText("#acct-status2", `Synced — ${sum.resumeCount} resume(s)${fc}.`);
  } catch (e) { $("#acct-status2").textContent = "✗ " + (e.message || e); }
};
if ($("#acct-signout")) $("#acct-signout").onclick = async () => {
  try { await (await currentProvider()).logout(); } catch (e) {}
  await renderAccount();
};

/* ---------- resumes: upload + parse ---------- */
$("#choose").onclick = () => $("#files").click();
$("#files").onchange = (e) => handleFiles([...e.target.files]);
const drop = $("#drop");
["dragover", "dragenter"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("drag"); }));
["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("drag"); }));
drop.addEventListener("drop", (e) => handleFiles([...e.dataTransfer.files]));

async function handleFiles(files) {
  files = files.filter((f) => /\.(pdf|docx|txt)$/i.test(f.name));
  if (!files.length) return;
  const settings = await S.getSettings();
  const prog = $("#progress");
  let done = 0;
  let firstBio = null;
  for (const file of files) {
    prog.textContent = `Parsing ${done + 1} of ${files.length}: ${file.name}…`;
    try {
      const structured = await P.parse(file, settings);
      if (!firstBio) {
        try { const b = P.parseBio(structured.__rawText || ""); if (b && Object.keys(b).length) firstBio = b; } catch (e) {}
      }
      const resume = SCH.emptyResume();
      resume.label = file.name.replace(/\.(pdf|docx|txt)$/i, "");
      resume.fileName = file.name;
      resume.summary = structured.summary || "";
      resume.skills = structured.skills || [];
      resume.experience = structured.experience || [];
      resume.education = structured.education || [];
      resume.languages = structured.languages || [];
      resume.projects = structured.projects || [];
      resume.hasFile = true;
      resume.needsReview = true;
      await S.saveResume(resume);
      await S.saveResumeFile(resume.id, file);
    } catch (err) {
      prog.textContent = `Failed on ${file.name}: ${err.message}`;
      await new Promise((r) => setTimeout(r, 1400));
    }
    done++;
  }
  prog.textContent = `Done — ${done} file${done === 1 ? "" : "s"} parsed. Open each to review.`;
  await maybePopulateBio(firstBio);
  await renderResumes();
  await renderUsage();
}

// Always offer to update the single shared Bio profile from a freshly-parsed
// resume whenever the resume carries any new OR differing contact details. Both
// empty fields and existing values are offered (existing ones shown as old → new),
// and nothing changes without the user's confirmation.
async function maybePopulateBio(parsed) {
  if (!parsed) return;
  const LBL = { firstName: "First name", lastName: "Last name", email: "Email", phone: "Phone", addressLine1: "Address", addressLine2: "Address line 2", city: "City", state: "State", postalCode: "Postal code", country: "Country", linkedin: "LinkedIn", github: "GitHub", website: "Website" };
  const bio = await S.getBio();
  const cands = SCH.bioUpdateCandidates(bio, parsed);
  if (!cands.length) return; // resume adds nothing new — nothing to ask about
  const empties = cands.filter((c) => c.isEmpty);
  const changes = cands.filter((c) => !c.isEmpty);
  let msg = "Update your Bio profile with details from this resume?\n\n";
  if (empties.length) msg += "Fill these empty fields:\n" + empties.map((c) => `  • ${LBL[c.key] || c.key}: ${c.to}`).join("\n") + "\n\n";
  if (changes.length) msg += "Replace these existing values:\n" + changes.map((c) => `  • ${LBL[c.key] || c.key}: ${c.from} → ${c.to}`).join("\n") + "\n\n";
  msg += "Choose Cancel to keep your Bio unchanged. You can edit everything in the Bio tab.";
  if (!confirm(msg)) return;
  cands.forEach((c) => { bio[c.key] = c.to; });
  await S.saveBio(bio);
  await renderBio();
}

async function renderResumes() {
  const list = await S.getResumes();
  const wrap = $("#reslist");
  if (!list.length) { wrap.innerHTML = `<p class="hint">No resumes yet.</p>`; return; }
  wrap.innerHTML = list.map((r) => `
    <div class="rescard">
      <div>
        <div class="rt">${esc(r.label)}${r.needsReview ? '<span class="badge">needs review</span>' : ""}</div>
        <div class="rm">${(r.skills || []).length} skills · ${(r.experience || []).length} roles · ${(r.education || []).length} education${r.hasFile ? " · file ✓" : ""}</div>
      </div>
      <div class="acts">
        <button class="iconbtn" data-edit="${r.id}">Review / edit</button>
        <button class="iconbtn del" data-del="${r.id}">Delete</button>
      </div>
    </div>`).join("");
  wrap.querySelectorAll("[data-edit]").forEach((b) => b.onclick = () => openEditor(b.dataset.edit));
  wrap.querySelectorAll("[data-del]").forEach((b) => b.onclick = async () => {
    if (confirm("Delete this resume?")) {
      const gone = (await S.getResumes()).find((x) => x.id === b.dataset.del);
      await S.deleteResume(b.dataset.del);
      if (gone && gone.serverId != null) {
        try { const p = await currentProvider(); if (await p.isAuthenticated()) await p.deleteResume(gone.serverId); } catch (e) {}
      }
      await renderResumes(); await renderUsage();
    }
  });
}

/* ---------- resume editor drawer ---------- */
async function openEditor(id) {
  const r = await S.getResume(id);
  if (!r) return;
  const expHtml = (e, i) => `
    <div class="entry" data-exp="${i}">
      <button class="removex" data-rmexp="${i}">remove</button>
      <div class="row2">
        <div class="field"><label>Company</label><input class="input e-company" value="${esc(e.company || "")}"></div>
        <div class="field"><label>Title</label><input class="input e-title" value="${esc(e.title || "")}"></div>
      </div>
      <div class="row2">
        <div class="field"><label>Start</label>${dateControl("e-start", e.startDate, true)}</div>
        <div class="field"><label>End</label>${dateControl("e-end", e.endDate, true, e.current)}</div>
      </div>
      <label class="check2"><input type="checkbox" class="e-current" ${e.current ? "checked" : ""} /> I currently work here</label>
      <div class="field"><label>Location</label><input class="input e-location" value="${esc(e.location || "")}" placeholder="City, ST  ·  Remote"></div>
      <div class="field"><label>Bullets (one per line)</label><textarea class="e-bullets">${esc((e.bullets || []).map((b) => "• " + b).join("\n"))}</textarea></div>
    </div>`;
  const eduHtml = (e, i) => `
    <div class="entry" data-edu="${i}">
      <button class="removex" data-rmedu="${i}">remove</button>
      <div class="row2">
        <div class="field"><label>School</label><input class="input d-school" value="${esc(e.school || "")}"></div>
        <div class="field"><label>Degree</label><input class="input d-degree" value="${esc(e.degree || "")}"></div>
      </div>
      <div class="row2">
        <div class="field"><label>Field of study</label><input class="input d-field" value="${esc(e.field || "")}"></div>
        <div class="field"><label>Location</label><input class="input d-location" value="${esc(e.location || "")}" placeholder="City, ST"></div>
      </div>
      <div class="row2">
        <div class="field"><label>Start</label>${dateControl("d-start", e.startDate, true)}</div>
        <div class="field"><label>End / graduation</label>${dateControl("d-end", e.endDate, true)}</div>
      </div>
    </div>`;

  const langHtml = (e, i) => `
    <div class="entry" data-lang="${i}">
      <button class="removex" data-rmlang="${i}">remove</button>
      <div class="row2">
        <div class="field"><label>Language</label><input class="input l-name" value="${esc(e.name || "")}"></div>
        <div class="field"><label>Proficiency</label><input class="input l-prof" value="${esc(e.proficiency || "")}" placeholder="e.g. Fluent, Native, Conversational"></div>
      </div>
    </div>`;

  const projHtml = (e, i) => `
    <div class="entry" data-proj="${i}">
      <button class="removex" data-rmproj="${i}">remove</button>
      <div class="field"><label>Project name</label><input class="input p-name" value="${esc(e.name || "")}"></div>
      <div class="field"><label>Bullets (one per line)</label><textarea class="p-bullets">${esc((e.bullets || []).map((b) => "• " + b).join("\n"))}</textarea></div>
    </div>`;

  $("#drawer").innerHTML = `
    <h2>Review resume</h2>
    <div class="field"><label>Label (how it appears in the picker)</label><input class="input wide" id="d-label" value="${esc(r.label)}"></div>
    <div class="field" style="margin-top:12px"><label>Summary</label><textarea class="wide" id="d-summary">${esc(r.summary || "")}</textarea></div>
    <div class="field" style="margin-top:12px"><label>Skills</label>
      <div class="chips" id="d-skills-chips">
        ${(r.skills || []).map((s) => `<span class="chip" data-skill="${esc(s)}">${esc(s)}<button type="button" class="chip-x" aria-label="remove">×</button></span>`).join("")}
        <input class="chip-input" id="d-skills-input" placeholder="Add a skill — Enter or comma">
      </div>
    </div>

    <div class="subhead">Experience</div>
    <div id="exp-wrap">${(r.experience || []).map(expHtml).join("")}</div>
    <button class="miniadd" id="add-exp">+ add role</button>

    <div class="subhead">Education</div>
    <div id="edu-wrap">${(r.education || []).map(eduHtml).join("")}</div>
    <button class="miniadd" id="add-edu">+ add education</button>

    <div class="subhead">Languages</div>
    <div id="lang-wrap">${(r.languages || []).map(langHtml).join("")}</div>
    <button class="miniadd" id="add-lang">+ add language</button>

    <div class="subhead">Projects <span class="hint" style="font-weight:400">— kept separate from work experience; only filled when an application asks for projects</span></div>
    <div id="proj-wrap">${(r.projects || []).map(projHtml).join("")}</div>
    <button class="miniadd" id="add-proj">+ add project</button>

    <div class="actionbar">
      <button class="primary" id="d-save">Confirm &amp; save</button>
      <button class="ghost" id="d-cancel">Close</button>
    </div>`;
  $("#drawer-host").classList.remove("hidden");

  const host = $("#drawer-host");
  $("#drawer-back").onclick = () => host.classList.add("hidden");
  $("#d-cancel").onclick = () => host.classList.add("hidden");

  // live add/remove (re-bind by reopening for simplicity)
  const STRIP = (s) => s.replace(/^\s*(?:[-–—•*▪◦‣·●○▸►▹◆◇∙⁃・]\s*|\d{1,2}[.)]\s+)/, "").trim();
  const collect = () => {
    const exps = $$("#exp-wrap .entry").map((node) => {
      const current = !!(node.querySelector(".e-current") && node.querySelector(".e-current").checked);
      return {
        company: node.querySelector(".e-company").value.trim(),
        title: node.querySelector(".e-title").value.trim(),
        location: node.querySelector(".e-location").value.trim(),
        startDate: ymVal(node, "e-start", true),
        endDate: current ? "" : ymVal(node, "e-end", true),
        current,
        bullets: node.querySelector(".e-bullets").value.split("\n").map(STRIP).filter(Boolean),
      };
    });
    const edus = $$("#edu-wrap .entry").map((node) => ({
      school: node.querySelector(".d-school").value.trim(),
      degree: node.querySelector(".d-degree").value.trim(),
      field: node.querySelector(".d-field").value.trim(),
      location: node.querySelector(".d-location").value.trim(),
      startDate: ymVal(node, "d-start", true),
      endDate: ymVal(node, "d-end", true),
    }));
    const langs = $$("#lang-wrap .entry").map((node) => ({
      name: node.querySelector(".l-name").value.trim(),
      proficiency: node.querySelector(".l-prof").value.trim(),
    })).filter((l) => l.name);
    const projs = $$("#proj-wrap .entry").map((node) => ({
      name: node.querySelector(".p-name").value.trim(),
      bullets: node.querySelector(".p-bullets").value.split("\n").map(STRIP).filter(Boolean),
    })).filter((p) => p.name);
    const skills = $$("#d-skills-chips .chip").map((c) => c.dataset.skill).filter(Boolean);
    return { exps, edus, langs, projs, skills };
  };

  // Skills chips: add via Enter/comma (pasted blobs are split), remove via × or
  // Backspace on an empty input. Read back from the DOM by collect().
  const skillsInput = $("#d-skills-input");
  const skillsBox = $("#d-skills-chips");
  const addSkills = (text) => {
    const have = $$("#d-skills-chips .chip").map((c) => c.dataset.skill.toLowerCase());
    (SCH.splitSkills ? SCH.splitSkills(text) : [text]).forEach((s) => {
      if (!s || have.includes(s.toLowerCase())) return;
      have.push(s.toLowerCase());
      const span = document.createElement("span");
      span.className = "chip"; span.dataset.skill = s;
      span.innerHTML = `${esc(s)}<button type="button" class="chip-x" aria-label="remove">×</button>`;
      skillsBox.insertBefore(span, skillsInput);
    });
    skillsInput.value = "";
  };
  if (skillsInput) {
    skillsInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addSkills(skillsInput.value); }
      else if (e.key === "Backspace" && !skillsInput.value) {
        const chips = $$("#d-skills-chips .chip"); if (chips.length) chips[chips.length - 1].remove();
      }
    });
    skillsInput.addEventListener("blur", () => { if (skillsInput.value.trim()) addSkills(skillsInput.value); });
    skillsBox.addEventListener("click", (e) => { if (e.target.classList.contains("chip-x")) e.target.closest(".chip").remove(); });
  }

  // current-role checkbox disables the End date dropdowns
  $$(".e-current").forEach((cb) => cb.onchange = () => {
    const entry = cb.closest(".entry");
    entry.querySelectorAll(".e-end-m, .e-end-y").forEach((sel) => { sel.disabled = cb.checked; if (cb.checked) sel.value = ""; });
  });

  const persistAndReopen = async () => {
    const { exps, edus, langs, projs, skills } = collect();
    r.label = $("#d-label").value.trim() || r.label;
    r.summary = $("#d-summary").value.trim();
    r.skills = skills;
    r.experience = exps;
    r.education = edus;
    r.languages = langs;
    r.projects = projs;
    await S.saveResume(r);
    openEditor(r.id);
  };

  $("#add-exp").onclick = async () => { const { exps, edus, langs, projs, skills } = collect(); r.experience = exps; r.education = edus; r.languages = langs; r.projects = projs; r.skills = skills; r.experience.push({ company: "", title: "", startDate: "", endDate: "", bullets: [] }); await S.saveResume(r); openEditor(r.id); };
  $("#add-edu").onclick = async () => { const { exps, edus, langs, projs, skills } = collect(); r.experience = exps; r.education = edus; r.languages = langs; r.projects = projs; r.skills = skills; r.education.push({ school: "", degree: "", field: "", endDate: "" }); await S.saveResume(r); openEditor(r.id); };
  $("#add-lang").onclick = async () => { const { exps, edus, langs, projs, skills } = collect(); r.experience = exps; r.education = edus; r.languages = langs; r.projects = projs; r.skills = skills; r.languages.push({ name: "", proficiency: "" }); await S.saveResume(r); openEditor(r.id); };
  $("#add-proj").onclick = async () => { const { exps, edus, langs, projs, skills } = collect(); r.experience = exps; r.education = edus; r.languages = langs; r.projects = projs; r.skills = skills; r.projects.push({ name: "", bullets: [] }); await S.saveResume(r); openEditor(r.id); };
  $$("[data-rmexp]").forEach((b) => b.onclick = async () => { const { exps, edus, langs, projs, skills } = collect(); exps.splice(+b.dataset.rmexp, 1); r.experience = exps; r.education = edus; r.languages = langs; r.projects = projs; r.skills = skills; await S.saveResume(r); openEditor(r.id); });
  $$("[data-rmedu]").forEach((b) => b.onclick = async () => { const { exps, edus, langs, projs, skills } = collect(); edus.splice(+b.dataset.rmedu, 1); r.experience = exps; r.education = edus; r.languages = langs; r.projects = projs; r.skills = skills; await S.saveResume(r); openEditor(r.id); });
  $$("[data-rmlang]").forEach((b) => b.onclick = async () => { const { exps, edus, langs, projs, skills } = collect(); langs.splice(+b.dataset.rmlang, 1); r.experience = exps; r.education = edus; r.languages = langs; r.projects = projs; r.skills = skills; await S.saveResume(r); openEditor(r.id); });
  $$("[data-rmproj]").forEach((b) => b.onclick = async () => { const { exps, edus, langs, projs, skills } = collect(); projs.splice(+b.dataset.rmproj, 1); r.experience = exps; r.education = edus; r.languages = langs; r.projects = projs; r.skills = skills; await S.saveResume(r); openEditor(r.id); });

  $("#d-save").onclick = async () => {
    const { exps, edus, langs, projs, skills } = collect();
    r.label = $("#d-label").value.trim() || r.label;
    r.summary = $("#d-summary").value.trim();
    r.skills = skills;
    r.experience = exps;
    r.education = edus;
    r.languages = langs;
    r.projects = projs;
    r.needsReview = false;
    await S.saveResume(r);
    pushIfSignedIn("resume", r);
    host.classList.add("hidden");
    await renderResumes();
  };
}

/* ---------- usage ---------- */
async function renderUsage() {
  const list = await S.getResumes();
  const est = await S.estimateUsage();
  let line = `${list.length} resume${list.length === 1 ? "" : "s"} stored`;
  if (est && est.usage != null) line += ` · ${(est.usage / 1048576).toFixed(1)} MB used`;
  $("#usage").textContent = line;
}

function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

async function renderAll() { try { await window.JAF.rules.init(); } catch (e) {} await renderBio(); await renderSettings(); await renderAccount(); await renderResumes(); await renderUsage(); }
renderAll();
