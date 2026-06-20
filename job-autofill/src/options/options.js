/* options.js */
const S = window.JAF.storage;
const SCH = window.JAF.schema;
const P = window.JAF.parser;
const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

const BIO_FIELDS = [
  ["firstName", "First name"], ["lastName", "Last name"], ["preferredName", "Preferred name"],
  ["email", "Email", "email"], ["phone", "Phone", "tel"],
  ["addressLine1", "Address", "text", true], ["addressLine2", "Address line 2"],
  ["city", "City"], ["state", "State / Province"], ["postalCode", "Postal code"], ["country", "Country"],
  ["linkedin", "LinkedIn URL"], ["github", "GitHub URL"], ["website", "Website / Portfolio"],
  ["authorizedToWork", "Authorized to work? (Yes/No)"], ["requireSponsorship", "Need sponsorship? (Yes/No)"],
];
const EEO_FIELDS = [
  ["gender", "Gender"], ["race", "Race / Ethnicity"], ["veteranStatus", "Veteran status"], ["disabilityStatus", "Disability status"],
];

/* ---------- tabs ---------- */
$$(".navbtn").forEach((b) => b.onclick = () => {
  $$(".navbtn").forEach((x) => x.classList.remove("active"));
  $$(".tab").forEach((x) => x.classList.remove("active"));
  b.classList.add("active");
  $("#tab-" + b.dataset.tab).classList.add("active");
});

/* ---------- bio ---------- */
function fieldHtml([key, label, type, full]) {
  return `<div class="field ${full ? "full" : ""}">
    <label for="bio_${key}">${label}</label>
    <input class="input" id="bio_${key}" type="${type || "text"}" />
  </div>`;
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
};

/* ---------- settings ---------- */
async function renderSettings() {
  const s = await S.getSettings();
  $("#llm").checked = !!s.llmEnabled;
  $("#apikey").value = s.apiKey || "";
  $("#eeo-default").checked = !!s.includeEEO;
  if ($("#autoadv-default")) $("#autoadv-default").checked = !!s.autoAdvance;
  if ($("#autoadd-default")) $("#autoadd-default").checked = s.autoAddRows !== false;
}
$("#save-settings").onclick = async () => {
  const s = await S.getSettings();
  s.llmEnabled = $("#llm").checked;
  s.apiKey = $("#apikey").value.trim();
  s.includeEEO = $("#eeo-default").checked;
  if ($("#autoadv-default")) s.autoAdvance = $("#autoadv-default").checked;
  if ($("#autoadd-default")) s.autoAddRows = $("#autoadd-default").checked;
  await S.saveSettings(s);
  flashSaved("#settings-saved");
};
$("#clear").onclick = async () => {
  if (!confirm("Delete your bio, all resumes and files? This cannot be undone.")) return;
  const list = await S.getResumes();
  for (const r of list) await S.deleteResume(r.id);
  await S.saveBio(SCH.emptyBio());
  await S.saveSettings({ llmEnabled: false, apiKey: "", includeEEO: false, lastResumeId: "", autoAdvance: false, autoAddRows: true });
  await renderAll();
  alert("All data deleted.");
};

function flashSaved(sel) { const e = $(sel); e.textContent = "Saved ✓"; setTimeout(() => (e.textContent = ""), 1800); }

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
  for (const file of files) {
    prog.textContent = `Parsing ${done + 1} of ${files.length}: ${file.name}…`;
    try {
      const structured = await P.parse(file, settings);
      const resume = SCH.emptyResume();
      resume.label = file.name.replace(/\.(pdf|docx|txt)$/i, "");
      resume.fileName = file.name;
      resume.summary = structured.summary || "";
      resume.skills = structured.skills || [];
      resume.experience = structured.experience || [];
      resume.education = structured.education || [];
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
  await renderResumes();
  await renderUsage();
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
    if (confirm("Delete this resume?")) { await S.deleteResume(b.dataset.del); await renderResumes(); await renderUsage(); }
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
        <div class="field"><label>Start</label><input class="input e-start" value="${esc(e.startDate || "")}"></div>
        <div class="field"><label>End</label><input class="input e-end" value="${esc(e.endDate || "")}"></div>
      </div>
      <div class="field"><label>Bullets (one per line)</label><textarea class="e-bullets">${esc((e.bullets || []).join("\n"))}</textarea></div>
    </div>`;
  const eduHtml = (e, i) => `
    <div class="entry" data-edu="${i}">
      <button class="removex" data-rmedu="${i}">remove</button>
      <div class="row2">
        <div class="field"><label>School</label><input class="input d-school" value="${esc(e.school || "")}"></div>
        <div class="field"><label>Degree</label><input class="input d-degree" value="${esc(e.degree || "")}"></div>
      </div>
      <div class="row2">
        <div class="field"><label>Field</label><input class="input d-field" value="${esc(e.field || "")}"></div>
        <div class="field"><label>Year</label><input class="input d-end" value="${esc(e.endDate || "")}"></div>
      </div>
    </div>`;

  $("#drawer").innerHTML = `
    <h2>Review resume</h2>
    <div class="field"><label>Label (how it appears in the picker)</label><input class="input wide" id="d-label" value="${esc(r.label)}"></div>
    <div class="field" style="margin-top:12px"><label>Summary</label><textarea class="wide" id="d-summary">${esc(r.summary || "")}</textarea></div>
    <div class="field" style="margin-top:12px"><label>Skills (comma separated)</label><textarea class="wide" id="d-skills">${esc((r.skills || []).join(", "))}</textarea></div>

    <div class="subhead">Experience</div>
    <div id="exp-wrap">${(r.experience || []).map(expHtml).join("")}</div>
    <button class="miniadd" id="add-exp">+ add role</button>

    <div class="subhead">Education</div>
    <div id="edu-wrap">${(r.education || []).map(eduHtml).join("")}</div>
    <button class="miniadd" id="add-edu">+ add education</button>

    <div class="actionbar">
      <button class="primary" id="d-save">Confirm &amp; save</button>
      <button class="ghost" id="d-cancel">Close</button>
    </div>`;
  $("#drawer-host").classList.remove("hidden");

  const host = $("#drawer-host");
  $("#drawer-back").onclick = () => host.classList.add("hidden");
  $("#d-cancel").onclick = () => host.classList.add("hidden");

  // live add/remove (re-bind by reopening for simplicity)
  const collect = () => {
    const exps = $$("#exp-wrap .entry").map((node) => ({
      company: node.querySelector(".e-company").value.trim(),
      title: node.querySelector(".e-title").value.trim(),
      startDate: node.querySelector(".e-start").value.trim(),
      endDate: node.querySelector(".e-end").value.trim(),
      current: /present|current/i.test(node.querySelector(".e-end").value),
      bullets: node.querySelector(".e-bullets").value.split("\n").map((s) => s.trim()).filter(Boolean),
    }));
    const edus = $$("#edu-wrap .entry").map((node) => ({
      school: node.querySelector(".d-school").value.trim(),
      degree: node.querySelector(".d-degree").value.trim(),
      field: node.querySelector(".d-field").value.trim(),
      endDate: node.querySelector(".d-end").value.trim(),
    }));
    return { exps, edus };
  };

  const persistAndReopen = async () => {
    const { exps, edus } = collect();
    r.label = $("#d-label").value.trim() || r.label;
    r.summary = $("#d-summary").value.trim();
    r.skills = $("#d-skills").value.split(",").map((s) => s.trim()).filter(Boolean);
    r.experience = exps;
    r.education = edus;
    await S.saveResume(r);
    openEditor(r.id);
  };

  $("#add-exp").onclick = async () => { const { exps, edus } = collect(); r.experience = exps; r.education = edus; r.experience.push({ company: "", title: "", startDate: "", endDate: "", bullets: [] }); await S.saveResume(r); openEditor(r.id); };
  $("#add-edu").onclick = async () => { const { exps, edus } = collect(); r.experience = exps; r.education = edus; r.education.push({ school: "", degree: "", field: "", endDate: "" }); await S.saveResume(r); openEditor(r.id); };
  $$("[data-rmexp]").forEach((b) => b.onclick = async () => { const { exps, edus } = collect(); exps.splice(+b.dataset.rmexp, 1); r.experience = exps; r.education = edus; await S.saveResume(r); openEditor(r.id); });
  $$("[data-rmedu]").forEach((b) => b.onclick = async () => { const { exps, edus } = collect(); edus.splice(+b.dataset.rmedu, 1); r.experience = exps; r.education = edus; await S.saveResume(r); openEditor(r.id); });

  $("#d-save").onclick = async () => {
    const { exps, edus } = collect();
    r.label = $("#d-label").value.trim() || r.label;
    r.summary = $("#d-summary").value.trim();
    r.skills = $("#d-skills").value.split(",").map((s) => s.trim()).filter(Boolean);
    r.experience = exps;
    r.education = edus;
    r.needsReview = false;
    await S.saveResume(r);
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

async function renderAll() { await renderBio(); await renderSettings(); await renderResumes(); await renderUsage(); }
renderAll();
