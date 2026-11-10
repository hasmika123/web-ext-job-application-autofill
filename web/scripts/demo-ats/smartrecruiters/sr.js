/* Local stand-in of a SmartRecruiters "oneclick" application (development only; served by web/scripts/demo-ats-server.mjs).
 * Two steps: the application (contact, resume, profiles, message) and the company's screening questions. Next checks the step's
 * required fields; Submit only shows a confirmation on this page. Nothing is sent anywhere. */
(function () {
  "use strict";
  const form = document.getElementById("sr-form");
  const pages = Array.from(form.querySelectorAll(".sr-page"));
  const next = document.getElementById("sr-next");
  const back = document.getElementById("sr-back");
  const submit = document.getElementById("sr-submit");
  const errors = form.querySelector(".sr-errors");
  let current = 0;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);


  function missing(page) {
    const out = [];
    const seen = new Set();
    page.querySelectorAll("input[required], select[required], textarea[required], input[type=file][aria-required=true]").forEach((el) => {
      if (el.type === "radio") {
        if (seen.has(el.name)) return;
        seen.add(el.name);
        if (!page.querySelector(`input[name="${el.name}"]:checked`)) out.push(el);
        return;
      }
      if (el.type === "file") { if (!page.querySelector(".sr-file")) out.push(el); return; }
      if (!String(el.value || "").trim()) out.push(el);
    });
    const em = page.querySelector("#email-input"), ce = page.querySelector("#confirm-email-input");
    if (em && ce && ce.value && em.value.trim().toLowerCase() !== ce.value.trim().toLowerCase()) out.push(ce);
    return out;
  }
  function mark(list) {
    form.querySelectorAll(".sr-invalid").forEach((n) => n.classList.remove("sr-invalid"));
    form.querySelectorAll(".sr-msg").forEach((n) => n.remove());
    if (!list.length) { errors.hidden = true; return; }
    list.forEach((el) => {
      const box = el.closest(".sr-field, fieldset, .sr-card");
      box.classList.add("sr-invalid");
      const m = document.createElement("p");
      m.className = "sr-msg";
      m.textContent = el.id === "confirm-email-input" && el.value ? "Emails do not match" : "This field is required";
      (el.type === "file" ? box.querySelector(".sr-drop") : el).insertAdjacentElement("afterend", m);
    });
    errors.hidden = false;
    errors.innerHTML = `Please complete the ${list.length} highlighted field${list.length === 1 ? "" : "s"}.`;
  }
  function show(i) {
    pages.forEach((p, n) => { p.hidden = n !== i; });
    document.querySelectorAll(".sr-step").forEach((s, n) => { s.classList.toggle("on", n === i); s.classList.toggle("done", n < i); });
    back.hidden = i === 0;
    next.hidden = i === pages.length - 1;
    submit.hidden = i !== pages.length - 1;
    current = i;
    mark([]);
    window.scrollTo(0, 0);
  }
  next.addEventListener("click", () => {
    const list = missing(pages[current]);
    if (list.length) { mark(list); return; }
    show(current + 1);
  });
  back.addEventListener("click", () => show(current - 1));
  submit.addEventListener("click", () => {
    const list = missing(pages[current]);
    if (list.length) { mark(list); return; }
    const name = (form.querySelector("#first-name-input").value || "").trim();
    document.getElementById("st-application").innerHTML = `<section class="sr-thanks" data-test="application-confirmation"><div class="sr-check">✓</div><h1>Thank you for applying${name ? ", " + esc(name) : ""}!</h1><p>Your application for <b>Senior Staff Platform Engineer - Kubernetes - Federal</b> has been sent to ServiceNow.</p><p>We'll send you an email confirmation shortly. You can follow its status in your SmartRecruiters candidate account.</p></section>`;
    document.title = "Application sent | ServiceNow";
  });
  form.addEventListener("input", (e) => { const box = e.target.closest(".sr-invalid"); if (box && missing(pages[current]).indexOf(e.target) < 0) { box.classList.remove("sr-invalid"); box.querySelectorAll(".sr-msg").forEach((n) => n.remove()); } });
  form.addEventListener("change", (e) => {
    const t = e.target;
    if (t.type === "file") {
      const list = form.querySelector(".sr-files");
      list.innerHTML = "";
      Array.from(t.files || []).forEach((f) => {
        const row = document.createElement("div");
        row.className = "sr-file";
        row.innerHTML = `<span class="sr-file-ico">PDF</span><span class="sr-file-name">${esc(f.name)}</span><span class="sr-file-size">${Math.max(1, Math.round(f.size / 1024))} KB</span><button type="button" class="sr-file-x" aria-label="Remove ${esc(f.name)}">×</button>`;
        row.querySelector(".sr-file-x").onclick = () => { row.remove(); t.value = ""; };
        list.appendChild(row);
      });
    }
    const box = t.closest(".sr-invalid");
    if (box && missing(pages[current]).indexOf(t) < 0) { box.classList.remove("sr-invalid"); box.querySelectorAll(".sr-msg").forEach((n) => n.remove()); }
  });
})();
