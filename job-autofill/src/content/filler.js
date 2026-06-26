/* filler.js — orchestration + the review overlay. window.JAF.filler */
(function () {
  const JAF = (window.JAF = window.JAF || {});
  const B = JAF.adapterBase;

  function pickAdapter() {
    const list = JAF.adapters || [];
    const specific = list.filter((a) => a.id !== "generic" && safe(() => a.matches()));
    if (specific.length) return specific[0];
    return JAF.genericAdapter;
  }
  function safe(fn) { try { return fn(); } catch (e) { return false; } }

  function buildPlan(values) {
    const adapter = pickAdapter();
    let items = safe(() => adapter.plan(values)) || [];
    // fallback: fill any canonical field the adapter missed, via generic scan
    if (adapter.id !== "generic") {
      const covered = new Set(items.map((i) => i.field));
      const usedEls = new Set(items.map((i) => i.el));
      const extra = safe(() => JAF.genericAdapter.plan(values)) || [];
      for (const e of extra) {
        if (!covered.has(e.field) && !usedEls.has(e.el)) { items.push(e); covered.add(e.field); usedEls.add(e.el); }
      }
    }
    // de-dupe: one item per element
    const seen = new Set();
    items = items.filter((i) => { if (seen.has(i.el)) return false; seen.add(i.el); return true; });
    return { adapter, items };
  }

  function b64ToBlob(b64, type) {
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: type || "application/pdf" });
  }

  // --- Overlay UI (shadow DOM, isolated from page styles) ------------------
  function renderOverlay({ adapter, items }, file, onClose, opts) {
    opts = opts || {};
    const autoAdvance = !!opts.autoAdvance;
    document.getElementById("__jaf_host")?.remove();
    const host = document.createElement("div");
    host.id = "__jaf_host";
    host.style.cssText = "position:fixed;inset:0;z-index:2147483647;";
    document.documentElement.appendChild(host);
    const root = host.attachShadow({ mode: "open" });

    const L = JAF.schema.LABELS;
    const fillable = items.filter((i) => i.kind !== "manual" && i.kind !== "info");
    const manual = items.filter((i) => i.kind === "manual");
    const info = items.filter((i) => i.kind === "info");

    const rowHtml = (i, idx) =>
      `<label class="row${i.assisted ? " assisted" : ""}">
         <input type="checkbox" data-i="${idx}" checked />
         <span class="field">${esc(i.label || L[i.field] || i.field)}${i.assisted ? ' <span class="aibadge">AI</span>' : ""}</span>
         <span class="val">${esc(truncate(String(i.value), 60))}</span>
         ${i.assisted ? `<button type="button" class="regen" data-regen="${idx}" title="Regenerate this draft">↻</button>` : ""}
       </label>`;

    root.innerHTML = `
      <style>${CSS_TEXT}</style>
      <div class="backdrop"></div>
      <aside class="panel" role="dialog" aria-label="Review autofill">
        <header>
          <div class="brand">Kiwiply</div>
          <div class="sub">${esc(adapter.label)} detected · ${fillable.length} field${fillable.length === 1 ? "" : "s"} ready</div>
          <button class="x" title="Close">×</button>
        </header>
        <div class="body">
          ${fillable.length ? `<div class="group-title">Review &amp; uncheck anything you don't want</div>` : (manual.length || info.length ? "" : `<div class="empty">No matching fields found on this step. Try the next step, or this site may need a custom selector.</div>`)}
          <div class="rows">${fillable.map(rowHtml).join("")}</div>
          ${file ? `<label class="row file"><input type="checkbox" id="filechk" checked /><span class="field">Attach résumé file</span><span class="val">${esc(file.name)}</span></label>` : ""}
          ${manual.length ? `<div class="group-title warn">Enter these yourself (custom dropdowns / typeaheads)</div>
            <div class="rows">${manual.map((i) => `<div class="row manual"><span class="field">${esc(L[i.field] || i.field)}</span><span class="val">${esc(String(i.value))}</span>${i.note ? `<span class="mnote">${esc(i.note)}</span>` : ""}</div>`).join("")}</div>` : ""}
          ${info.length ? `<div class="rows">${info.map((i) => `<div class="infonote">${esc(String(i.value))}</div>`).join("")}</div>` : ""}
        </div>
        <footer>
          <button class="ghost" id="cancel">Cancel</button>
          <button class="primary" id="fill" ${fillable.length || file ? "" : "disabled"}>Fill selected</button>
        </footer>
        <div class="note">${autoAdvance
          ? `Auto-advance is <b>on</b>: after filling, Kiwiply clicks the step's <b>Next / Continue</b> button. It never clicks Submit.`
          : `Nothing is submitted. After filling, review the page and click the site's own button.`}</div>
      </aside>`;

    const close = () => { host.remove(); onClose && onClose(); };
    root.querySelector(".x").onclick = close;
    root.querySelector("#cancel").onclick = close;
    root.querySelector(".backdrop").onclick = close;

    root.querySelector("#fill").onclick = async () => {
      const fillBtn = root.querySelector("#fill");
      fillBtn.disabled = true;
      fillBtn.textContent = "Filling…";
      const checks = Array.from(root.querySelectorAll('.rows input[type="checkbox"][data-i]'));
      let filled = 0;
      const failed = [];
      for (const c of checks) {
        if (!c.checked) continue;
        const item = fillable[Number(c.dataset.i)];
        const ok = await B.applyItemAsync(item);
        // Learn from any later user correction to this field (local cache).
        try { JAF.fieldCache && JAF.fieldCache.watch(item); } catch (e) {}
        if (ok) filled++;
        else if (item.kind === "combo" || item.kind === "combo-multi") failed.push(L[item.field] || item.field);
      }
      let fileMsg = "";
      const fchk = root.querySelector("#filechk");
      if (file && fchk && fchk.checked) {
        const input = adapter.fileInput && adapter.fileInput();
        if (input) {
          const ok = await B.attachFile(input, b64ToBlob(file.base64, file.type), file.name);
          fileMsg = ok ? " · résumé attached" : " · résumé attach failed (upload manually)";
        } else fileMsg = " · no file field found";
      }
      // Auto-log this fill as a DRAFT application (best-effort; never blocks the fill)
      // and arm submission detection so a confirmation flips the entry to APPLIED. The
      // service worker owns the network and survives the post-submit navigation.
      try {
        if (JAF.jobCapture && typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.sendMessage) {
          const capture = JAF.jobCapture.captureJob();
          chrome.runtime.sendMessage({ type: "JAF_LOG_FILL", capture, resume: opts.resume || null });
          if (JAF.submitDetect) JAF.submitDetect.arm();
        }
      } catch (e) {}

      const failMsg = failed.length ? ` · couldn't auto-pick ${failed.length} dropdown${failed.length === 1 ? "" : "s"} (${truncate(failed.join(", "), 40)}) — set those by hand` : "";
      let advanceMsg = "";
      if (autoAdvance) {
        const nextBtn = (adapter.nextButton && adapter.nextButton()) || B.findNextButton();
        if (nextBtn) {
          fillBtn.textContent = "Advancing…";
          flash(root, `Filled ${filled} field${filled === 1 ? "" : "s"}${fileMsg}${failMsg}. Advancing…`);
          await new Promise((r) => setTimeout(r, 600));
          nextBtn.click();
          setTimeout(close, 700);
          return;
        }
        advanceMsg = " · couldn't find a Next button — advance manually";
      }
      flash(root, `Filled ${filled} field${filled === 1 ? "" : "s"}${fileMsg}${failMsg}${advanceMsg}. Review before submitting.`);
      setTimeout(close, 2400);
    };

    // Regenerate an AI draft in place — re-asks the service worker for that question.
    root.querySelectorAll(".regen").forEach((btn) => {
      btn.onclick = async (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const item = fillable[Number(btn.dataset.regen)];
        if (!item || !item.assisted || !(JAF.assist && JAF.assist.draft)) return;
        const valEl = btn.closest(".row").querySelector(".val");
        const prev = item.value;
        btn.disabled = true;
        valEl.textContent = "Drafting…";
        try {
          const r = await JAF.assist.draft(item.question, item.context);
          if (r && r.answer) { item.value = r.answer; valEl.textContent = truncate(String(r.answer), 60); }
          else { valEl.textContent = truncate(String(prev), 60); }
        } catch (e) {
          valEl.textContent = truncate(String(prev), 60);
        } finally {
          btn.disabled = false;
        }
      };
    });
  }

  function flash(root, msg) {
    const f = document.createElement("div");
    f.className = "flash";
    f.textContent = msg;
    root.querySelector(".panel").appendChild(f);
  }

  function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
  function truncate(s, n) { return s.length > n ? s.slice(0, n - 1) + "…" : s; }

  async function start(values, file, options) {
    options = options || {};
    // Optionally let the adapter create extra repeating rows (e.g. Workday
    // "Add Another" work-experience blocks) so every resume role can be filled.
    const adapter0 = pickAdapter();
    if (options.autoAddRows !== false && typeof adapter0.ensureRows === "function") {
      try { await adapter0.ensureRows(values); } catch (e) {}
    }
    const plan = buildPlan(values);
    // Optional AI layer: draft answers to open-ended screening questions.
    try {
      if (options.assist !== false && JAF.assist) {
        const extra = await JAF.assist.run(plan.items, values);
        if (extra && extra.length) plan.items = plan.items.concat(extra);
      }
    } catch (e) {}
    // Prefer the user's previously-learned answers for this profile (local cache).
    try {
      if (JAF.fieldCache) {
        JAF.fieldCache.setProfile(values.email || "default");
        await JAF.fieldCache.preferCached(plan.items);
      }
    } catch (e) {}
    renderOverlay(plan, file, null, options);
    return { adapter: plan.adapter.id, candidates: plan.items.length };
  }

  const CSS_TEXT = `
    /* Kiwiply palette mirrored inline — the overlay lives in a Shadow DOM and must NOT
       inherit page CSS, so tokens are declared on :host (mirrors web globals.css §3.1). */
    :host { all: initial;
      --ink:#2D3133; --ink-soft:#4F5557; --paper:#FBFAF6; --paper-2:#E7E6DD;
      --line:#D4D3C8; --muted:#73746E; --accent:#94BD37; --accent-deep:#5E7D1E;
      --on-accent:#2D3133; --warn:#986A35; --brown-soft:#ECE2D1; }
    * { box-sizing: border-box; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif; }
    .backdrop { position: fixed; inset: 0; background: rgba(45,49,51,.32); }
    .panel { position: fixed; top: 0; right: 0; height: 100%; width: 380px; max-width: 92vw;
      background: var(--paper); color: var(--ink); box-shadow: -12px 0 40px rgba(45,49,51,.22);
      display: flex; flex-direction: column; border-left: 4px solid var(--accent); }
    header { padding: 18px 18px 12px; border-bottom: 1px solid var(--line); position: relative; }
    .brand { font-weight: 700; letter-spacing: .14em; text-transform: uppercase; font-size: 13px; color: var(--ink); }
    .sub { font-size: 12.5px; color: var(--muted); margin-top: 4px; }
    .x { position: absolute; top: 12px; right: 12px; border: 0; background: transparent; font-size: 22px;
      line-height: 1; cursor: pointer; color: var(--muted); }
    .x:hover { color: var(--ink); }
    .body { padding: 12px 16px; overflow-y: auto; flex: 1; }
    .group-title { font-size: 11px; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); margin: 8px 2px 6px; }
    .group-title.warn { color: var(--warn); }
    .rows { display: flex; flex-direction: column; gap: 2px; }
    .row { display: grid; grid-template-columns: 18px 110px 1fr; align-items: center; gap: 8px;
      padding: 8px 8px; border-radius: 8px; cursor: pointer; }
    .row:hover { background: var(--paper-2); }
    .row.assisted { grid-template-columns: 18px 110px 1fr auto; }
    .regen { border: 1px solid var(--line); background: var(--paper); color: var(--accent-deep);
      border-radius: 6px; font-size: 13px; line-height: 1; cursor: pointer; padding: 4px 7px; }
    .regen:hover:not(:disabled) { border-color: var(--accent); }
    .regen:disabled { opacity: .5; cursor: default; }
    .row.manual { grid-template-columns: 128px 1fr; cursor: default; background: var(--brown-soft); gap: 3px 8px; }
    .row.manual .mnote { grid-column: 1 / -1; font-size: 11px; color: var(--warn); line-height: 1.35; }
    .infonote { font-size: 12px; color: var(--ink-soft); background: var(--paper-2); border: 1px solid var(--line);
      border-radius: 8px; padding: 9px 11px; margin-top: 8px; line-height: 1.45; }
    /* AI badge: charcoal-on-lime (white/cream on lime is unreadable) */
    .aibadge { display: inline-block; font-size: 9px; font-weight: 800; letter-spacing: .08em;
      color: var(--on-accent); background: var(--accent); border-radius: 4px; padding: 1px 4px; vertical-align: middle; }
    .row.file { margin-top: 8px; border-top: 1px dashed var(--line); padding-top: 12px; }
    .field { font-size: 12.5px; color: var(--ink-soft); font-weight: 600; }
    .val { font-size: 12.5px; color: var(--ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    input[type=checkbox] { accent-color: var(--accent); width: 15px; height: 15px; }
    .empty { font-size: 13px; color: var(--muted); padding: 14px 6px; line-height: 1.5; }
    footer { padding: 12px 16px; border-top: 1px solid var(--line); display: flex; gap: 10px; justify-content: flex-end; }
    button.primary { background: var(--ink); color: var(--paper); border: 0; padding: 9px 16px; border-radius: 8px;
      font-weight: 600; cursor: pointer; font-size: 13px; }
    button.primary:disabled { opacity: .4; cursor: not-allowed; }
    button.primary:hover:not(:disabled) { background: var(--ink-soft); }
    button.ghost { background: transparent; border: 1px solid var(--line); color: var(--ink-soft); padding: 9px 14px;
      border-radius: 8px; cursor: pointer; font-size: 13px; }
    .note { font-size: 11px; color: var(--muted); padding: 0 16px 14px; line-height: 1.4; }
    .flash { position: absolute; left: 16px; right: 16px; bottom: 16px; background: var(--ink); color: var(--paper);
      padding: 12px 14px; border-radius: 10px; font-size: 12.5px; box-shadow: 0 8px 24px rgba(0,0,0,.2); }
  `;

  JAF.filler = { start, buildPlan };
})();
