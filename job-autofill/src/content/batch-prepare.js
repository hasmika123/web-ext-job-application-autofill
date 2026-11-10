/* batch-prepare.js — JAF.batchPrepare   (content side of "Prepare selected openings", X12.9 / E7.x)
 *
 * What a tab opened by a prepare batch does on the page:
 *   JAF_BATCH_CHECK  the service worker asks "what is this page?": a sign-in wall, a CAPTCHA
 *                    challenge, an application form, or nothing yet. We ANSWER; we never act on any of
 *                    them (no login, no CAPTCHA, no clicking). The "Prepared by Kiwiply" banner is
 *                    shown at the same time (top frame only).
 *   JAF_BATCH_FILL   run the NORMAL fill with the consultant's own mirrored profile and resume file.
 *                    The plan is written at once (the consultant's click was "Prepare" on the web) and
 *                    the panel turns into the review: what was filled, what is still theirs.
 *                    On a form split into steps (Workday: My Information, My Experience, ... Review) a step
 *                    that is complete is followed by the site's own Next / Continue button and the next step
 *                    is filled the same way, up to the last step before submission (fillSteps below).
 *   filled()         the filler reports (counts only) how many required fields still need the
 *                    consultant; watchGaps() keeps that number current while they work.
 *
 * Hard rules: the ONLY click this file makes is a step form's Next / Continue button, and only when the
 * step has no required field left empty and no submit-like button is on the page (that page is the last
 * step: it stays for the consultant). Submit / Apply / Send / Finish are never pressed; nothing here types
 * into the page or ticks a box. Attestation / consent / legal checkboxes are not touched (the filler's
 * plan never selects them). The banner's "Go" buttons only scroll to a field and focus it. Field labels
 * stay on the page; only counts leave it.
 */
(function () {
  const JAF = (globalThis.JAF = globalThis.JAF || {});

  const HOST_ID = "__kiwiply_batch_banner";
  const MESSAGE = "Prepared by Kiwiply: review every field. Nothing is submitted for you.";

  function visible(el) {
    const B = JAF.adapterBase;
    if (B && B.isVisible) return B.isVisible(el);
    if (!el || el.disabled) return false;
    const r = el.getBoundingClientRect ? el.getBoundingClientRect() : { width: 1, height: 1 };
    return r.width > 0 || r.height > 0;
  }

  // ---- what is this page? (read-only) ------------------------------------------------------
  const CHALLENGE_TEXT = /\b(verify (that )?you(?:'| a)?re (a )?human|are you a (robot|human)|checking your browser|press (and|&) hold|complete the (security )?check|just a moment)\b/i;
  const CAPTCHA_SEL = 'iframe[src*="recaptcha"], iframe[src*="hcaptcha"], iframe[src*="challenges.cloudflare.com"], .g-recaptcha, .h-captcha, .cf-turnstile, #px-captcha';
  const TEXTY = new Set(["text", "email", "tel", "url", "number", "search", "date", ""]);

  // -> "captcha" | "signin" | "form" | "none".   `captcha` is a CHALLENGE page (a short page whose point is
  // the check); the invisible reCAPTCHA many application forms carry at the bottom is not one.
  function classify(doc) {
    doc = doc || document;
    const body = doc.body;
    const bodyText = body ? (body.textContent || "").replace(/\s+/g, " ").trim() : "";
    const short = bodyText.length < 2000;
    const inputs = Array.from(doc.querySelectorAll("input")).filter(visible);
    const typed = inputs.filter((i) => TEXTY.has((i.getAttribute("type") || "").toLowerCase()));
    // A challenge page has (almost) no form of its own; the invisible reCAPTCHA at the bottom of an
    // application form does not make that form a challenge.
    if (short && (CHALLENGE_TEXT.test(bodyText) || (typed.length === 0 && bodyText.length < 300 && doc.querySelector(CAPTCHA_SEL)))) return "captcha";
    const hasPassword = inputs.some((i) => (i.getAttribute("type") || "").toLowerCase() === "password");
    if (hasPassword) {
      // A login form is a password and at most a username/email; a registration or application form has more.
      if (typed.length <= 2) return "signin";
    }
    let fields = 0;
    try { fields = (JAF.adapterBase.scanGeneric(doc) || []).length; } catch (e) { fields = inputs.length; }
    return fields >= 2 || typed.length >= 4 ? "form" : "none";
  }

  // ---- the banner (top frame only) ---------------------------------------------------------------
  function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

  function jumpTo(el) {
    try { el.scrollIntoView({ block: "center", behavior: "smooth" }); } catch (e) { try { el.scrollIntoView(); } catch (e2) {} }
    try { el.focus({ preventScroll: true }); } catch (e) { try { el.focus(); } catch (e2) {} }
    const prev = el.style.outline, prevOffset = el.style.outlineOffset;
    el.style.outline = "3px solid #94BD37";
    el.style.outlineOffset = "2px";
    setTimeout(() => { el.style.outline = prev; el.style.outlineOffset = prevOffset; }, 2200);
  }

  const CSS = `
    :host { all: initial; }
    * { box-sizing: border-box; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif; }
    .card { width: 330px; max-width: calc(100vw - 24px); background: #FBFAF6; color: #2D3133; border: 1px solid #D4D3C8;
      border-left: 4px solid #94BD37; border-radius: 14px; box-shadow: 0 12px 32px rgba(45,49,51,.22); padding: 12px 14px; }
    header { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
    .t { font-size: 13px; font-weight: 700; line-height: 1.35; }
    .x { border: 0; background: transparent; font-size: 18px; line-height: 1; cursor: pointer; color: #686962; padding: 0 2px; }
    .state { margin: 6px 0 0; font-size: 12.5px; color: #4F5557; line-height: 1.4; }
    .state.warn { color: #986A35; }
    ul { list-style: none; margin: 8px 0 0; padding: 0; display: flex; flex-direction: column; gap: 4px; max-height: 200px; overflow: auto; }
    .go { width: 100%; display: flex; align-items: center; gap: 8px; padding: 6px 8px; border: 1px solid #D4D3C8; border-radius: 9px;
      background: #fff; cursor: pointer; text-align: left; font-size: 12.5px; color: #2D3133; }
    .go:hover, .go:focus-visible { border-color: #94BD37; outline: none; }
    .dot { width: 8px; height: 8px; border-radius: 50%; background: #986A35; flex: none; }
    .nm { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .arrow { font-size: 12px; color: #5E7D1E; flex: none; }
    .pill { background: #FBFAF6; color: #2D3133; border: 1px solid #D4D3C8; border-left: 4px solid #94BD37; border-radius: 999px;
      padding: 6px 12px; font-size: 12px; font-weight: 600; cursor: pointer; box-shadow: 0 8px 20px rgba(45,49,51,.18); }
  `;

  let banner = null; // { host, root, info, collapsed }

  function ensureBanner() {
    if (window !== window.top) return null;
    if (banner && banner.host.isConnected) return banner;
    document.getElementById(HOST_ID)?.remove();
    const host = document.createElement("div");
    host.id = HOST_ID;
    host.style.cssText = "position:fixed;left:12px;bottom:12px;z-index:2147483646;";
    (document.body || document.documentElement).appendChild(host);
    banner = { host, root: host.attachShadow({ mode: "open" }), info: { kind: "none", reason: "" }, collapsed: false, lastSig: "" };
    const refresh = () => renderBanner();
    document.addEventListener("input", refresh, true);
    document.addEventListener("change", refresh, true);
    return banner;
  }

  // Required fields still empty in THIS frame (the list the consultant is asked to complete).
  function needs() {
    const A = JAF.requiredAudit;
    if (!A) return [];
    try { return A.findRequiredEmpty(document).map((el) => ({ el, name: A.describe(el) })); } catch (e) { return []; }
  }

  function stateLine(info, list) {
    if (info.kind === "captcha") return { warn: true, text: "This page is asking you to verify you are human. Complete it yourself, then continue." };
    if (info.kind === "signin") return { warn: true, text: "Sign in to the site on this tab. Kiwiply never signs in for you; fill the form once you are in." };
    if (info.kind === "none") return { warn: true, text: "No application form here yet. Open the form, then click the Kiwiply icon to fill it." };
    if (info.filled) {
      return list.length
        ? { warn: true, text: list.length + " required field" + (list.length === 1 ? "" : "s") + " need your input:" }
        : { warn: false, text: "Required fields are filled. Check everything, then submit it yourself." };
    }
    return { warn: false, text: "Filling the form from your profile. Review every answer when it is done." };
  }

  function renderBanner() {
    const b = ensureBanner();
    if (!b) return;
    const list = needs();
    const line = stateLine(b.info, list);
    const root = b.root;
    if (b.collapsed) {
      root.innerHTML = `<style>${CSS}</style><button class="pill" id="open" aria-label="Show Kiwiply notes">Kiwiply${list.length ? " · " + list.length + " to do" : ""}</button>`;
      root.querySelector("#open").onclick = () => { b.collapsed = false; renderBanner(); };
      return;
    }
    root.innerHTML = `<style>${CSS}</style>
      <section class="card" role="region" aria-label="Prepared by Kiwiply">
        <header><div class="t">${esc(MESSAGE)}</div><button class="x" aria-label="Minimise">×</button></header>
        <p class="state${line.warn ? " warn" : ""}" aria-live="polite">${esc(line.text)}</p>
        ${b.info.filled && list.length ? `<ul>${list.map((it, i) => `<li><button class="go" data-g="${i}"><span class="dot"></span><span class="nm">${esc(it.name)}</span><span class="arrow">Go →</span></button></li>`).join("")}</ul>` : ""}
      </section>`;
    root.querySelector(".x").onclick = () => { b.collapsed = true; renderBanner(); };
    root.querySelectorAll(".go").forEach((btn) => { btn.onclick = () => jumpTo(list[Number(btn.dataset.g)].el); });
  }

  function showBanner(info) {
    const b = ensureBanner();
    if (!b) return;
    b.info = Object.assign(b.info, info || {});
    renderBanner();
  }

  // ---- reporting (counts only) ----------------------------------------------------------------
  function send(msg) {
    try { if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.sendMessage) chrome.runtime.sendMessage(msg, () => { void (chrome.runtime && chrome.runtime.lastError); }); } catch (e) {}
  }

  let watching = null;
  function watchGaps(batch, initial) {
    if (watching) watching.stop();
    let last = initial;
    let timer = null;
    const check = () => {
      let n = 0;
      try { n = needs().length; } catch (e) {}
      if (n !== last) { last = n; send({ type: "JAF_BATCH_PROGRESS", batch, phase: "gaps", gaps: n }); }
    };
    const onEvt = () => { clearTimeout(timer); timer = setTimeout(check, 400); };
    document.addEventListener("input", onEvt, true);
    document.addEventListener("change", onEvt, true);
    watching = { stop() { clearTimeout(timer); document.removeEventListener("input", onEvt, true); document.removeEventListener("change", onEvt, true); watching = null; } };
  }

  // Called by the filler when the consultant has pressed "Fill selected" and the fill is done.
  // `gaps` is the number of required fields still empty (the filler already counted them).
  function filled(batch, r) {
    if (!batch) return;
    const gaps = Math.max(0, Math.floor(Number(r && r.gaps) || 0));
    send({ type: "JAF_BATCH_PROGRESS", batch, phase: "filled", filled: Number(r && r.filled) || 0, failed: Number(r && r.failed) || 0, gaps });
    showBanner({ filled: true });
    watchGaps(batch, gaps);
  }

  // ---- fill with the consultant's own mirrored profile ----------------------------------------------
  async function runFill(msg) {
    const S = JAF.schema;
    if (!S || !JAF.filler) return { ok: false, error: "engine not loaded" };
    if (!msg.bio) return { ok: false, error: "no profile" };
    const values = S.buildFillValues(msg.bio, msg.resume || S.emptyResume(), { includeEEO: true });
    // The service worker sends the stored file name; the upload name ("first_last_resume.pdf") is built here.
    const f = msg.file && msg.file.base64 ? { name: S.uploadResumeName(msg.bio, msg.file.rawName), type: msg.file.type, base64: msg.file.base64 } : null;
    // label: which of the consultant's resumes this file is (the review names it: a job may carry a resume tailored for it)
    if (f && msg.options && msg.options.resume && msg.options.resume.label) f.label = String(msg.options.resume.label).slice(0, 120);
    showBanner({ kind: "form" });
    // The person's own auto-advance setting is never used here; steps (below) are the batch's own, bounded walk.
    const base = Object.assign({}, msg.options || {}, { autoAdvance: false });
    const r = base.steps ? await fillSteps(values, f, base) : await JAF.filler.start(values, f, base);
    return Object.assign({ ok: true }, r);
  }

  // ---- forms split into steps ------------------------------------------------------------------
  const MAX_STEPS = 8;
  const NEXT_TEXT = /\b(next|continue|proceed|save\s*(and|&)\s*(continue|next))\b/i;
  // A button that would send the application, or leave the form. Never pressed; on the page it marks the last step.
  const SUBMIT_TEXT = /\b(submit|send|finish|complete|apply)\b/i;
  const btnText = (b) => String(b.innerText || b.textContent || b.value || b.getAttribute("aria-label") || "").replace(/\s+/g, " ").trim();
  function buttons() {
    const B = JAF.adapterBase;
    const all = B && B.deepQueryAll ? B.deepQueryAll(document, 'button, [role="button"], input[type="submit"], input[type="button"]') : Array.from(document.querySelectorAll('button, [role="button"], input[type="submit"], input[type="button"]'));
    // our own panel and banner live in shadow roots: their buttons are never the page's
    const ours = (b) => { const h = b.getRootNode && b.getRootNode().host; return !!h && (h.id === HOST_ID || h.id === "__jaf_host"); };
    return all.filter((b) => visible(b) && !ours(b));
  }
  function submitOnPage() {
    return buttons().some((b) => { const t = btnText(b); return t.length <= 40 && SUBMIT_TEXT.test(t) && !NEXT_TEXT.test(t); });
  }
  // The step form's forward button, or null: none, the page's last step (a submit-like button is on it), or a
  // button whose own words are not "Next / Continue" (an adapter's pick is checked by its text too).
  function nextStepButton() {
    if (submitOnPage()) return null;
    const B = JAF.adapterBase;
    let a = null;
    try { a = (JAF.adapters || []).find((x) => x.id !== "generic" && x.matches()); } catch (e) { a = null; }
    let btn = null;
    try { btn = (a && a.nextButton && a.nextButton()) || (B && B.findNextButton && B.findNextButton()); } catch (e) { btn = null; }
    if (!btn || !visible(btn)) return null;
    const t = btnText(btn);
    if (!t || t.length > 40 || SUBMIT_TEXT.test(t) || !NEXT_TEXT.test(t)) return null;
    return btn;
  }
  // What identifies the step on screen: its headings and the controls it shows.
  function stepSignature() {
    const heads = Array.from(document.querySelectorAll('h1, h2, h3, [role="heading"]')).filter(visible).map((h) => (h.textContent || "").trim()).join("|");
    const ctl = Array.from(document.querySelectorAll('input, select, textarea, button[aria-haspopup]')).filter(visible).slice(0, 80).map((e) => e.id || e.name || e.getAttribute("data-automation-id") || "").join(",");
    return heads + "#" + ctl;
  }
  const pause = (ms) => new Promise((r) => setTimeout(r, ms));
  function waitUntil(test, ms) {
    return new Promise((resolve) => {
      const t0 = Date.now();
      (function poll() {
        let ok = false; try { ok = test(); } catch (e) { ok = false; }
        if (ok) return resolve(true);
        if (Date.now() - t0 >= ms) return resolve(false);
        setTimeout(poll, 150);
      })();
    });
  }

  // Fill a step, and while the step is complete and the page offers Next (not Submit), press it and fill the next
  // one. Stops at the last step before submission, at a step with required fields still empty (the review lists
  // them), or when the site keeps the step after Next (its own check refused it).
  function fillSteps(values, file, base) {
    let step = 0;
    const run = (carry) => JAF.filler.start(values, carry && carry.fileStatus === "ok" ? null : file, Object.assign({}, base, { carry, onStep }));
    async function onStep(r) {
      if ((r.gaps && r.gaps.length) || step >= MAX_STEPS - 1) return false;
      const next = nextStepButton();
      if (!next) return false;
      const before = stepSignature();
      try { r.say("Step " + (step + 1) + " filled. Going on to the next step…"); } catch (e) { /* the panel may be gone */ }
      await pause(700);
      next.click();
      const moved = await waitUntil(() => stepSignature() !== before, 10000);
      if (!moved) return "stuck";
      await pause(900); // the next step draws its fields
      step++;
      const carry = { outcomes: r.outcomes, fileStatus: r.fileStatus, file: r.file, filled: r.filled, failed: r.failed, steps: step };
      setTimeout(() => { run(carry); }, 0);
      return true;
    }
    return run(null);
  }

  if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.onMessage && chrome.runtime.onMessage.addListener) {
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (!msg || (msg.type !== "JAF_BATCH_CHECK" && msg.type !== "JAF_BATCH_FILL")) return;
      // Only our own extension (the service worker) may drive these.
      if (sender && sender.tab) return;
      if (msg.type === "JAF_BATCH_CHECK") {
        let kind = "none";
        try { kind = classify(document); } catch (e) {}
        showBanner({ kind });
        sendResponse({ ok: true, kind });
        return true;
      }
      runFill(msg).then(sendResponse).catch((e) => sendResponse({ ok: false, error: String(e) }));
      return true; // async
    });
  }

  JAF.batchPrepare = { classify, showBanner, filled, watchGaps, nextStepButton, submitOnPage, fillSteps, MESSAGE, HOST_ID };
})();
