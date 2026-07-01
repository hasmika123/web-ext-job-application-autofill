/**
 * Home view — the drawer's default surface. Warm canvas (no card), the real brand lockup, a
 * clickable account chip (→ dashboard), the resume picker, an accent "Scan & fill" CTA (opens
 * the on-page review overlay), "Save this job", auto-advance, and a trust footer. Engine logic
 * lives in home-actions.ts; this stays presentational.
 *
 * Uploading a resume hands the File straight to the panel's review view in memory (onReview).
 */
import { useEffect, useRef, useState } from "react";
import { Button, Select, Badge, Spinner, Switch, Skeleton, Check, IconButton } from "@kiwiply/ui";
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
    // Reflect a connect/disconnect (incl. a session expiring → tokens cleared) that lands while
    // the drawer is open — the chip flips to the connect prompt, or vice-versa, live.
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
    <div className="kiwi-fade-in flex min-h-screen w-full flex-col gap-4 bg-app-bg px-4 pb-4 pt-4 font-body text-ink">
      {/* Header — logo (left) + account chip · settings · close (right), all on one row */}
      <header className="flex items-center justify-between gap-2">
        <BrandLogo height={24} />
        <div className="flex min-w-0 items-center gap-1">
          {account.connected && (
            <button
              onClick={() => chrome.tabs.create({ url: WEB + "/dashboard" })}
              title="Open your kiwiply dashboard"
              aria-label={`Open dashboard — signed in as ${account.who}`}
              className="flex min-w-0 items-center gap-2 rounded-full py-1 pl-1 pr-2.5 transition-colors hover:bg-paper-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <Avatar name={account.who} />
              <span className="max-w-[96px] truncate text-[12.5px] font-semibold text-ink">{account.who}</span>
            </button>
          )}
          <IconButton title="Extension settings" aria-label="Extension settings" onClick={openSettings}>
            <GearIcon />
          </IconButton>
          <IconButton title="Close" aria-label="Close drawer" onClick={closePanel}>
            <CloseIcon />
          </IconButton>
        </div>
      </header>

      {/* Connect prompt — the sign-in path (no in-extension login); also where an expired session
          lands once its tokens are cleared. Only until an account is connected. */}
      {loaded && !account.connected && (
        <button
          onClick={() => chrome.tabs.create({ url: WEB + "/connect" })}
          className="flex w-full items-start gap-2.5 rounded-[var(--radius-lg)] border border-brown-2 bg-brown-soft px-3.5 py-3 text-left transition-colors hover:border-brown"
        >
          <LinkIcon />
          <span className="text-[12.5px] leading-snug text-brown-deep">
            <span className="font-semibold">Sign in on kiwiply.com</span> to connect the extension and sync your resumes →
          </span>
        </button>
      )}

      {/* Heading */}
      <div>
        <div className={eyebrow}>Autofill this page</div>
        <h1 className="mt-1 font-display text-[19px] font-semibold leading-tight text-ink">
          {firstName ? `Ready when you are, ${firstName}.` : "Pick a resume to fill."}
        </h1>
      </div>

      {/* Resume picker */}
      {!loaded ? (
        <div className="flex flex-col gap-2" aria-busy="true" aria-label="Loading resumes">
          <Skeleton className="h-3 w-24 rounded-[var(--radius-sm)]" />
          <Skeleton className="h-11 w-full rounded-[var(--radius)]" />
          <Skeleton className="h-4 w-40 rounded-[var(--radius-sm)]" />
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <label className="text-[12.5px] font-semibold text-ink-soft" htmlFor="resume-pick">
            Choose a resume
          </label>
          <Select
            id="resume-pick"
            value={selectedId}
            disabled={!pickable.length}
            aria-label="Choose a resume"
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
          <div className="flex min-h-[30px] items-center gap-2">
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
            <button
              onClick={() => fileRef.current?.click()}
              className="ml-auto inline-flex flex-none items-center gap-1.5 rounded-full border border-line bg-paper px-3 py-1.5 text-[12px] font-semibold text-ink-soft transition-colors hover:bg-paper-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <UploadIcon />
              Upload
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
      <div className="border-t border-line pt-3.5">
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

      {/* Trust footer */}
      <footer className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-line px-1 pt-3 text-[11px] text-muted">
        <span className="flex items-center gap-1.5">
          <Check className="h-3.5 w-3.5" />
          Reviews before filling · never submits
        </span>
        <button
          className="font-semibold transition-colors hover:text-ink"
          onClick={() => chrome.tabs.create({ url: chrome.runtime.getURL("options.html#bug") })}
        >
          Report a bug
        </button>
      </footer>
    </div>
  );
}

function Avatar({ name }: { name: string }) {
  const clean = (name || "").trim();
  const initial = clean && clean.toLowerCase() !== "your account" ? clean.charAt(0).toUpperCase() : "";
  return (
    <span className="grid h-7 w-7 flex-none place-items-center rounded-full bg-accent text-[12px] font-bold text-on-accent">
      {initial || <UserIcon />}
    </span>
  );
}

function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden>
      <circle cx="12" cy="8.5" r="3.5" stroke="currentColor" strokeWidth="1.7" />
      <path d="M5.5 19.5a6.5 6.5 0 0 1 13 0" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5" aria-hidden>
      <path
        d="M10 13V4m0 0L6.5 7.5M10 4l3.5 3.5M4 14v1.5A1.5 1.5 0 0 0 5.5 17h9a1.5 1.5 0 0 0 1.5-1.5V14"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
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
