/**
 * Home view — the drawer's default surface (was the popup). Warm canvas + paper card, the real
 * brand lockup, resume picker, an accent "Scan & fill" CTA (opens the on-page review overlay),
 * "Save this job", auto-advance, and connected-account status. Engine logic lives in
 * home-actions.ts; this stays presentational.
 *
 * Uploading a resume hands the File straight to the panel's review view in memory (onReview) —
 * no cross-document storage handoff, since the home + review views are one document now.
 */
import { useEffect, useRef, useState } from "react";
import { Button, Select, Badge, Spinner, Switch, Skeleton, Check } from "@kiwiply/ui";
import { BrandLogo } from "../../lib/Brand";
import { closePanel } from "../../lib/panel-frame";
import { loadData, refreshMirror, fillPage, saveJob, readAccount, type HomeData, type Account } from "./home-actions";
import type { Handoff } from "./services";

const WEB = "https://kiwiply.com";

type Status = { msg: string; kind: "ok" | "err" | "neutral" };
const NEUTRAL: Status = { msg: "", kind: "neutral" };
const eyebrow = "text-[11px] font-bold uppercase tracking-[.1em] text-accent-deep";

function truncateLabel(s: string, max = 40): string {
  s = String(s);
  return s.length > max ? s.slice(0, max - 1).trimEnd() + "…" : s;
}

export function HomeView({ onReview }: { onReview: (handoff: Handoff) => void }) {
  const [data, setData] = useState<HomeData | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [autoAdv, setAutoAdv] = useState(false);
  const [status, setStatus] = useState<Status>(NEUTRAL);
  const [pending, setPending] = useState<File | null>(null); // chosen file → save/attach choice
  const [busy, setBusy] = useState(false);
  const [account, setAccount] = useState<Account>({ connected: false, who: "" });

  const activeTab = useRef<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
      activeTab.current = tab && tab.id != null ? tab.id : null;
    });
    readAccount().then(setAccount);
    // Reflect a connect/disconnect that lands while the drawer is open (the web /connect handoff
    // writes trackingAuth) — the prompt hides and the signed-in identity appears live.
    const onChange = (changes: { [k: string]: chrome.storage.StorageChange }, area: string) => {
      if (area === "local" && changes.trackingAuth) readAccount().then(setAccount);
    };
    chrome.storage.onChanged.addListener(onChange);
    (async () => {
      await refreshMirror();
      const d = await loadData();
      setData(d);
      setAutoAdv(!!d.settings.autoAdvance);
      const pickable = d.resumes;
      if (d.settings.lastResumeId && pickable.some((r) => r.id === d.settings.lastResumeId)) setSelectedId(d.settings.lastResumeId);
      else if (pickable.length) setSelectedId(pickable[0].id);
    })();
    return () => chrome.storage.onChanged.removeListener(onChange);
  }, []);

  const pickable = data?.resumes ?? [];
  const selectedResume = pickable.find((r) => r.id === selectedId) ?? null;
  const loaded = data !== null;
  const firstName = (data?.bio?.firstName as string) || "";

  async function onFill() {
    if (!selectedResume || !data) return;
    setBusy(true);
    setStatus({ msg: "Scanning page…", kind: "neutral" });
    const res = await fillPage(selectedResume, data.bio, autoAdv);
    if (res.ok) {
      // Close the drawer so the on-page fill-review overlay (the field list) is unobstructed.
      closePanel();
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
    if (!f) return;
    const label = (f.name || "Resume").replace(/\.[^.]+$/, "").trim() || "Resume";
    onReview({ label, fileName: f.name, fileType: f.type || "application/pdf", mode, jobTabId: activeTab.current, file: f });
  }

  // Options as its own tab. openOptionsPage is the nicer path (focuses an existing tab); fall back
  // to a plain create if it's unavailable in this framed context.
  function openSettings() {
    try {
      chrome.runtime.openOptionsPage?.();
    } catch {
      chrome.tabs.create({ url: chrome.runtime.getURL("options.html") });
    }
  }

  const statusColor = status.kind === "err" ? "text-danger" : status.kind === "ok" ? "text-accent-deep" : "text-muted";

  return (
    <div className="kiwi-fade-in flex min-h-screen w-full flex-col gap-3 bg-app-bg px-4 pb-4 pt-4 font-body text-ink">
      {/* Header — real brand lockup + a context subline (same structure as the review panel) */}
      <header className="flex items-start justify-between">
        <div className="flex min-w-0 flex-col gap-1">
          <BrandLogo height={24} />
          <span className="truncate text-[12px] text-muted">
            {account.connected ? (
              <>
                Signed in as <b className="font-semibold text-ink-soft">{account.who}</b>
              </>
            ) : (
              "Autofill for job applications"
            )}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            className="inline-flex h-8 w-8 items-center justify-center rounded-[var(--radius)] text-ink-soft transition-colors hover:bg-paper hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            title="Extension settings"
            aria-label="Extension settings"
            onClick={openSettings}
          >
            <GearIcon />
          </button>
          <button
            className="inline-flex h-8 w-8 items-center justify-center rounded-[var(--radius)] text-ink-soft transition-colors hover:bg-paper hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            title="Close"
            aria-label="Close drawer"
            onClick={closePanel}
          >
            <CloseIcon />
          </button>
        </div>
      </header>

      {/* Connect prompt — only until an account is connected */}
      {loaded && !account.connected && (
        <button
          onClick={() => chrome.tabs.create({ url: WEB + "/connect" })}
          className="flex w-full items-start gap-2.5 rounded-[var(--radius-lg)] border border-brown-2 bg-brown-soft px-3.5 py-3 text-left transition-colors hover:border-brown"
        >
          <LinkIcon />
          <span className="text-[12.5px] leading-snug text-brown-deep">
            <span className="font-semibold">Connect the extension</span> on kiwiply.com to sync your profile &amp; resumes →
          </span>
        </button>
      )}

      {/* Main card — the fill panel */}
      <div className="flex flex-col gap-3.5 rounded-[var(--radius-lg)] border border-line bg-paper p-4 shadow-[var(--shadow)]">
        <div>
          <div className={eyebrow}>Autofill this page</div>
          <h1 className="mt-1 font-display text-[19px] font-semibold leading-tight text-ink">
            {firstName ? `Ready when you are, ${firstName}.` : "Pick a resume to fill."}
          </h1>
        </div>

        {/* Resume picker */}
        {!loaded ? (
          <div className="flex flex-col gap-2" aria-busy="true" aria-label="Loading resumes">
            <Skeleton className="h-3 w-14 rounded-[var(--radius-sm)]" />
            <Skeleton className="h-11 w-full rounded-[var(--radius)]" />
            <Skeleton className="h-4 w-40 rounded-[var(--radius-sm)]" />
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <label className="text-[12.5px] font-semibold text-ink-soft" htmlFor="resume-pick">
              Resume
            </label>
            <Select
              id="resume-pick"
              value={selectedId}
              disabled={!pickable.length}
              aria-label="Resume variant"
              onChange={(e) => setSelectedId(e.target.value)}
            >
              {!pickable.length ? (
                <option value="">No resumes yet</option>
              ) : (
                pickable.map((r) => (
                  <option key={r.id} value={r.id} title={r.label}>
                    {truncateLabel(r.label)}
                  </option>
                ))
              )}
            </Select>
            <div className="flex min-h-[20px] items-center gap-2">
              {selectedResume ? (
                <>
                  <span className="text-[12px] text-muted">
                    {(selectedResume.skills || []).length} skills · {(selectedResume.experience || []).length} roles
                  </span>
                  <Badge variant={selectedResume.hasFile ? "ready" : "review"}>{selectedResume.hasFile ? "PDF" : "no file"}</Badge>
                </>
              ) : (
                <span className="text-[12px] leading-snug text-muted">Add one on kiwiply.com, or upload below.</span>
              )}
              <button className="ml-auto text-[12px] font-semibold text-accent-deep transition-opacity hover:opacity-80" onClick={() => fileRef.current?.click()}>
                + Upload
              </button>
            </div>
          </div>
        )}

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

        {/* Upload mode choice */}
        {pending && (
          <div className="flex flex-col gap-2 rounded-[var(--radius)] border border-line bg-paper-2 px-3 py-3">
            <div className="truncate text-[12px] font-semibold text-ink-soft">Use “{pending.name}”…</div>
            <Button variant="accent" size="sm" className="w-full" onClick={() => onUploadChosen("save")}>
              Parse &amp; add to my resumes
            </Button>
            <Button variant="ghost" size="sm" className="w-full" onClick={() => onUploadChosen("attach")}>
              Parse &amp; attach to this job only
            </Button>
            <button className="self-center text-[12px] font-semibold text-muted hover:text-ink" onClick={() => setPending(null)}>
              Cancel
            </button>
          </div>
        )}

        {/* Primary actions */}
        <div className="flex flex-col gap-2">
          <Button variant="accent" className="w-full" disabled={!selectedResume || busy} onClick={onFill}>
            {busy && status.kind === "neutral" ? <Spinner className="text-on-accent" /> : null}
            Scan &amp; fill this page
          </Button>
          <Button variant="ghost" className="w-full" disabled={busy} onClick={onSaveJob}>
            Save this job for later
          </Button>
        </div>

        {/* Auto-advance */}
        <div className="border-t border-line pt-3">
          <Switch checked={autoAdv} onCheckedChange={setAutoAdv} label="Auto-advance after filling" />
        </div>

        {/* Status — persistent live region */}
        <div role="status" aria-live="polite" className={`min-h-[16px] text-[12px] leading-snug ${statusColor}`}>
          {status.msg && (
            <span className="flex items-start gap-1.5">
              {busy && <Spinner className="mt-px shrink-0" />}
              <span>{status.msg}</span>
            </span>
          )}
        </div>
      </div>

      {/* Trust footer */}
      <footer className="mt-auto flex flex-wrap items-center justify-between gap-2 px-1 pt-1 text-[11px] text-muted">
        <span className="flex items-center gap-1.5">
          <Check className="h-3.5 w-3.5" />
          Reviews before filling · never submits
        </span>
        <span className="flex items-center gap-2">
          <button className="font-semibold transition-colors hover:text-ink" onClick={() => chrome.tabs.create({ url: WEB + "/dashboard" })}>
            Manage
          </button>
          <span className="text-line">·</span>
          <button className="font-semibold transition-colors hover:text-ink" onClick={() => chrome.tabs.create({ url: chrome.runtime.getURL("options.html#bug") })}>
            Bug
          </button>
        </span>
      </footer>
    </div>
  );
}

function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-[18px] w-[18px]" aria-hidden>
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-[18px] w-[18px]" aria-hidden>
      <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="mt-px h-4 w-4 flex-none text-brown-deep" aria-hidden>
      <path
        d="M9 15l6-6M10.5 6.5l1-1a4 4 0 0 1 5.66 5.66l-2 2M13.5 17.5l-1 1a4 4 0 0 1-5.66-5.66l2-2"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
