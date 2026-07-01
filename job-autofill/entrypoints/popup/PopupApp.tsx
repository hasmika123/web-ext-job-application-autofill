/**
 * Popup UI — the extension's home surface, redesigned on the shared @kiwiply/ui design
 * system (W5.2). Clear hierarchy: header → resume picker (+ meta) → upload entry → options
 * → primary actions → status → trust footer. Engine logic lives in actions.ts (unchanged);
 * this stays presentational. The engine itself stays framework-free.
 */
import { useEffect, useRef, useState } from "react";
import { Button, Select, Field, Badge, Spinner, Switch, Skeleton } from "@kiwiply/ui";
import { loadData, refreshMirror, fillPage, saveJob, openReview, type PopupData } from "./actions";

const WEB = "https://kiwiply.com";

type Status = { msg: string; kind: "ok" | "err" | "neutral" };
const NEUTRAL: Status = { msg: "", kind: "neutral" };

function truncateLabel(s: string, max = 42): string {
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
  const loaded = data !== null;

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

  const statusColor = status.kind === "err" ? "text-danger" : status.kind === "ok" ? "text-accent-deep" : "text-muted";

  return (
    <div className="kiwi-fade-in flex w-[322px] flex-col bg-paper px-4 pb-3.5 pt-3.5 font-body text-ink">
      {/* Header — brand + quick links */}
      <header className="mb-3.5 flex items-center justify-between border-b border-line pb-3">
        <img src="/icons/logo.png" alt="Kiwiply" className="block h-[24px] w-auto" />
        <div className="flex items-center gap-1">
          <button className={linkCls} title="Manage your profile & resumes on kiwiply.com" onClick={() => chrome.tabs.create({ url: WEB + "/dashboard" })}>
            Manage
          </button>
          <button
            className={iconBtnCls}
            title="Extension settings"
            aria-label="Extension settings"
            onClick={() => chrome.runtime.openOptionsPage()}
          >
            <GearIcon />
          </button>
        </div>
      </header>

      {/* Connect prompt — only until the bio mirror is populated */}
      {loaded && !hasBio && (
        <button
          onClick={() => chrome.tabs.create({ url: WEB })}
          className="mb-3.5 flex w-full items-start gap-2 rounded-[var(--radius)] border border-brown-2 bg-brown-soft px-3 py-2.5 text-left text-[12.5px] leading-snug text-brown-deep transition-colors hover:border-brown"
        >
          <span className="mt-px text-sm leading-none">🔗</span>
          <span>
            <span className="font-semibold">Connect the extension</span> &amp; build your profile on kiwiply.com →
          </span>
        </button>
      )}

      {/* Resume picker — skeleton while the mirror pulls */}
      {!loaded ? (
        <div className="flex flex-col gap-2" aria-busy="true" aria-label="Loading resumes">
          <Skeleton className="h-3.5 w-16 rounded-[var(--radius-sm)]" />
          <Skeleton className="h-11 w-full rounded-[var(--radius)]" />
          <div className="mt-0.5 flex gap-1.5">
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-5 w-14 rounded-full" />
            <Skeleton className="h-5 w-12 rounded-full" />
          </div>
        </div>
      ) : (
        <>
          <Field label="Resume" className="gap-1.5">
            <Select
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
          </Field>

          {/* Selected-resume meta / empty hint — muted meta text + a file-status badge (web style) */}
          <div className="mt-2 flex min-h-[22px] items-center gap-2">
            {selectedResume ? (
              <>
                <span className="text-[12px] text-muted">
                  {(selectedResume.skills || []).length} skills · {(selectedResume.experience || []).length} roles
                </span>
                <Badge variant={selectedResume.hasFile ? "ready" : "review"}>{selectedResume.hasFile ? "file" : "no file"}</Badge>
              </>
            ) : (
              <p className="text-[11.5px] leading-snug text-muted">Add a resume on kiwiply.com, or upload one below.</p>
            )}
          </div>
        </>
      )}

      {/* Upload entry */}
      <button className="mt-2 self-start text-[12px] font-semibold text-accent-deep transition-opacity hover:opacity-80" onClick={() => fileRef.current?.click()}>
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
        <div className="mt-2.5 flex flex-col gap-2 rounded-[var(--radius-lg)] border border-line bg-paper-2 px-3 py-3">
          <div className="truncate text-[12px] font-semibold text-ink-soft">
            Use “{pending.name}”…
          </div>
          <Button variant="accent" size="sm" className="w-full" onClick={() => onUploadChosen("save")}>
            Parse &amp; add to my resumes
          </Button>
          <Button variant="ghost" size="sm" className="w-full" onClick={() => onUploadChosen("attach")}>
            Parse &amp; attach to this job only
          </Button>
          <button className={`${linkCls} self-center`} onClick={() => setPending(null)}>
            Cancel
          </button>
        </div>
      )}

      {/* Options */}
      <div className="mt-3.5 rounded-[var(--radius)] border border-line bg-paper-2 px-3 py-2.5">
        <Switch checked={autoAdv} onCheckedChange={setAutoAdv} label="Auto-advance to next step after filling" />
      </div>

      {/* Primary actions */}
      <div className="mt-3.5 flex flex-col gap-2">
        <Button variant="accent" className="w-full" disabled={!selectedResume || busy} onClick={onFill}>
          {busy && status.kind === "neutral" ? <Spinner className="text-on-accent" /> : null}
          Scan &amp; fill this page
        </Button>
        <Button variant="ghost" className="w-full" disabled={busy} onClick={onSaveJob}>
          Save this job
        </Button>
      </div>

      {/* Status — a persistent live region so updates are announced */}
      <div role="status" aria-live="polite" className={`mt-2.5 min-h-[16px] text-[12px] leading-snug ${statusColor}`}>
        {status.msg && (
          <span className="flex items-start gap-1.5">
            {busy && <Spinner className="mt-px shrink-0" />}
            <span>{status.msg}</span>
          </span>
        )}
      </div>

      {/* Trust footer */}
      <footer className="mt-3.5 flex items-center justify-between gap-2 border-t border-line pt-3 text-[10.5px] text-muted">
        <span className="flex items-center gap-1.5">
          <span className="inline-grid h-3.5 w-3.5 place-items-center rounded-full bg-accent text-[9px] font-extrabold text-on-accent">✓</span>
          Reviews before filling · never submits
        </span>
        <button className="font-semibold text-muted transition-colors hover:text-ink" onClick={() => chrome.tabs.create({ url: chrome.runtime.getURL("options.html#bug") })}>
          Report a bug
        </button>
      </footer>
    </div>
  );
}

const linkCls = "rounded-[var(--radius-sm)] px-2 py-1 text-[12px] font-semibold text-ink-soft transition-colors hover:bg-paper-2 hover:text-ink";
const iconBtnCls =
  "inline-flex h-7 w-7 items-center justify-center rounded-[var(--radius-sm)] text-ink-soft transition-colors hover:bg-paper-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-[18px] w-[18px]" aria-hidden>
      <path
        d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M19.4 13a7.7 7.7 0 0 0 .05-2l1.6-1.25-1.6-2.77-1.9.77a7.6 7.6 0 0 0-1.73-1l-.29-2.02h-3.2l-.29 2.02c-.62.24-1.2.58-1.73 1l-1.9-.77-1.6 2.77L6.55 11a7.7 7.7 0 0 0 0 2l-1.6 1.25 1.6 2.77 1.9-.77c.53.42 1.11.76 1.73 1l.29 2.02h3.2l.29-2.02c.62-.24 1.2-.58 1.73-1l1.9.77 1.6-2.77L19.4 13Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}
