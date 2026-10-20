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
 *   filled()         the filler reports (counts only) how many required fields still need the
 *                    consultant; watchGaps() keeps that number current while they work.
 *
 * Hard rules: nothing in this file clicks, submits, dispatches events, ticks a box or types into the
 * page. Attestation / consent / legal checkboxes are not touched (the filler's plan never selects
 * them). The banner's "Go" buttons only scroll to a field and focus it. Field labels stay on the
 * page; only counts leave it.
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
    // Whatever the sender asked for, a batch tab never presses Next/Continue on its own.
    const r = await JAF.filler.start(values, f, Object.assign({}, msg.options || {}, { autoAdvance: false }));
    return Object.assign({ ok: true }, r);
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

  JAF.batchPrepare = { classify, showBanner, filled, watchGaps, MESSAGE, HOST_ID };
})();
