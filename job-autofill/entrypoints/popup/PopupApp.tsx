/**
 * Popup UI (W4.1) — the functional React port of the old popup.js/popup.html, on the shared
 * design tokens (Tailwind). Engine logic lives in actions.ts. The engine stays framework-free.
 */
import { useEffect, useRef, useState } from "react";
import { loadData, refreshMirror, fillPage, saveJob, openReview, type PopupData } from "./actions";

const WEB = "https://kiwiply.com";

type Status = { msg: string; kind: "ok" | "err" | "neutral" };
const NEUTRAL: Status = { msg: "", kind: "neutral" };

function truncateLabel(s: string, max = 38): string {
  s = String(s);
  return s.length > max ? s.slice(0, max - 1).trimEnd() + "…" : s;
}

export function PopupApp() {
  const [data, setData] = useState<PopupData | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [autoAdv, setAutoAdv] = useState(false);
  const [status, setStatus] = useState<Status>(NEUTRAL);
  const [pending, setPending] = useState<File | null>(null); // chosen file → save/attach choice
  const [busy, setBusy] = useState(false);

  const activeTabId = useRef<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Pre-capture the active tab for the side-panel open gesture (see openReview).
    chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
      activeTabId.current = tab && tab.id != null ? tab.id : null;
    });
    (async () => {
      await refreshMirror();
      const d = await loadData();
      setData(d);
      setAutoAdv(!!d.settings.autoAdvance);
      const pickable = d.resumes;
      if (d.settings.lastResumeId && pickable.some((r) => r.id === d.settings.lastResumeId)) setSelectedId(d.settings.lastResumeId);
      else if (pickable.length) setSelectedId(pickable[0].id);
    })();
  }, []);

  const pickable = data?.resumes ?? [];
  const selectedResume = pickable.find((r) => r.id === selectedId) ?? null;
  const hasBio = !!(data?.bio && (data.bio.firstName || data.bio.email));

  async function onFill() {
    if (!selectedResume || !data) return;
    setBusy(true);
    setStatus({ msg: "Scanning page…", kind: "neutral" });
    const res = await fillPage(selectedResume, data.bio, autoAdv);
    if (res.ok) {
      setStatus({ msg: `Review panel open (${res.adapter}). Check values, then fill.`, kind: "ok" });
      setTimeout(() => window.close(), 1200);
    } else {
      setStatus({ msg: res.error, kind: "err" });
      setBusy(false);
    }
  }

  async function onSaveJob() {
    setBusy(true);
    setStatus({ msg: "Reading this job…", kind: "neutral" });
    const res = await saveJob();
    setStatus(res.ok ? { msg: res.message, kind: "ok" } : { msg: res.error, kind: "err" });
    setBusy(false);
  }

  function onUploadChosen(mode: "save" | "attach") {
    const f = pending;
    setPending(null);
    if (f) {
      // sidePanel.open must run synchronously in this click gesture — openReview does it first.
      openReview(f, mode, activeTabId.current).then(() => window.close());
    }
  }

  const statusColor = status.kind === "err" ? "text-warn" : status.kind === "ok" ? "text-accent-deep" : "text-muted";

  return (
    <div className="w-[322px] rounded-[18px] bg-paper px-4 pb-3 pt-[15px] font-body text-ink">
      {/* Header */}
      <header className="mb-3.5 flex items-center justify-between border-b border-line pb-3">
        <img src="/icons/logo.png" alt="Kiwiply" className="block h-[25px] w-auto" />
        <div className="flex items-center gap-0.5">
          <button className={linkCls} title="Manage your profile & resumes on kiwiply.com" onClick={() => chrome.tabs.create({ url: WEB + "/dashboard" })}>
            Manage
          </button>
          <button className={`${linkCls} text-[14px] leading-none`} title="Report a bug or idea" aria-label="Report a bug or idea" onClick={() => chrome.tabs.create({ url: chrome.runtime.getURL("options.html#bug") })}>
            🐛
          </button>
          <button className={linkCls} title="Extension settings" onClick={() => chrome.runtime.openOptionsPage()}>
            Settings
          </button>
        </div>
      </header>

      {!hasBio && (
        <button
          onClick={() => chrome.tabs.create({ url: WEB })}
          className="mb-3 w-full rounded-[10px] border border-[#D8C7A8] bg-brown-soft px-[11px] py-[9px] text-left text-xs leading-snug text-warn hover:border-warn"
        >
          Connect the extension &amp; build your profile on kiwiply.com →
        </button>
      )}

      <label className="mb-1.5 block text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted" htmlFor="resume">Resume variant</label>
      <div className="relative">
        <select
          id="resume"
          value={selectedId}
          disabled={!pickable.length}
          onChange={(e) => setSelectedId(e.target.value)}
          className="w-full appearance-none rounded-[11px] border border-line bg-white py-[10px] pl-3 pr-8 text-[13.5px] text-ink outline-none focus:border-accent focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_26%,transparent)] disabled:cursor-not-allowed disabled:bg-paper-2 disabled:text-muted"
        >
          {!pickable.length ? (
            <option value="">{data && data.resumes.length === 0 ? "No resumes — add one on kiwiply.com" : "No resumes — add one on kiwiply.com"}</option>
          ) : (
            pickable.map((r) => (
              <option key={r.id} value={r.id} title={r.label}>
                {truncateLabel(r.label)}
              </option>
            ))
          )}
        </select>
        <svg className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </div>

      <div className="mx-0.5 mt-[7px] min-h-[15px] text-[11.5px] leading-snug text-muted">
        {selectedResume && (
          <>
            {(selectedResume.skills || []).length} skills · {(selectedResume.experience || []).length} roles ·{" "}
            <span className={selectedResume.hasFile ? "font-semibold text-accent-deep" : "font-semibold text-warn"}>{selectedResume.hasFile ? "file ✓" : "no file"}</span>
          </>
        )}
      </div>

      <button className="self-start px-0.5 pt-1.5 text-[11.5px] font-semibold text-accent-deep hover:underline" onClick={() => fileRef.current?.click()}>
        + Upload a resume
      </button>
      <input
        ref={fileRef}
        type="file"
        accept=".pdf,.docx,.txt,application/pdf,text/plain"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) setPending(f);
        }}
      />

      {pending && (
        <div className="mt-2.5 flex flex-col gap-[7px] rounded-xl border border-line bg-[color-mix(in_srgb,var(--paper-2)_36%,var(--paper))] px-3 py-[11px]">
          <div className="mb-px overflow-hidden text-ellipsis whitespace-nowrap text-xs font-bold text-ink-soft">Use “{pending.name}”…</div>
          <button className={primaryCls} onClick={() => onUploadChosen("save")}>Parse &amp; add to resumes list</button>
          <button className={ghostCls + " mt-0"} onClick={() => onUploadChosen("attach")}>Parse, don&apos;t add to list</button>
          <button className={`${linkCls} self-center`} onClick={() => setPending(null)}>Cancel</button>
        </div>
      )}

      <div className="my-3.5 flex flex-col gap-[9px] rounded-xl border border-line bg-[color-mix(in_srgb,var(--paper-2)_36%,var(--paper))] px-3 py-[11px]">
        <label className="flex cursor-pointer items-center gap-[9px] text-[12.5px] text-ink-soft">
          <input type="checkbox" checked={autoAdv} onChange={(e) => setAutoAdv(e.target.checked)} className="h-[15px] w-[15px] flex-none accent-[var(--accent)]" />
          <span>Auto-advance to next step after filling</span>
        </label>
      </div>

      <button className={primaryCls} disabled={!selectedResume || busy} onClick={onFill}>Scan &amp; fill this page</button>
      <button className={ghostCls} disabled={busy} onClick={onSaveJob}>Save this job</button>

      <div className={`mt-2.5 min-h-4 text-xs leading-snug ${statusColor}`}>{status.msg}</div>

      <div className="mt-3 flex items-center justify-center gap-1.5 border-t border-line pt-[11px] text-[10.5px] text-muted">
        <span className="inline-grid h-3.5 w-3.5 place-items-center rounded-full bg-accent text-[9px] font-extrabold text-on-accent">✓</span>
        Reviews before filling · never clicks Submit
      </div>
    </div>
  );
}

const linkCls = "rounded-[9px] px-[9px] py-1.5 text-xs font-semibold text-ink-soft transition-colors hover:bg-paper-2 hover:text-ink";
const primaryCls =
  "w-full rounded-xl bg-accent px-3 py-3 text-[13.5px] font-bold text-on-accent shadow-[0_1px_2px_rgba(45,49,51,0.08)] transition-colors hover:bg-[color-mix(in_srgb,var(--accent)_88%,var(--ink))] disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none";
const ghostCls =
  "mt-2 w-full rounded-[11px] border border-line bg-transparent px-3 py-2.5 text-[13px] font-semibold text-ink-soft transition-colors hover:bg-paper-2 hover:text-ink disabled:cursor-not-allowed disabled:opacity-45";
