/**
 * Home view — the drawer's default surface. Warm canvas (no card), the real brand lockup, a
 * clickable account chip (→ dashboard), the resume picker, an accent "Scan & fill" CTA (opens
 * the on-page review overlay), "Save this job", auto-advance, and a trust footer. Engine logic
 * lives in home-actions.ts; this stays presentational.
 *
 * Uploading a resume hands the File straight to the panel's review view in memory (onReview).
 */
import { useEffect, useRef, useState } from "react";
import {
  Button,
  Select,
  Badge,
  Spinner,
  Switch,
  Skeleton,
  Check,
  IconButton,
  JobFitReport,
  useToast,
  GearIcon as SharedGearIcon,
  LinkIcon as SharedLinkIcon,
  UploadIcon as SharedUploadIcon,
  UserIcon as SharedUserIcon,
  XIcon,
} from "@kiwiply/ui";
import { BrandLogo } from "../../lib/Brand";
import { closePanel } from "../../lib/panel-frame";
import { extensionAlive } from "../../lib/ext-context";
import {
  loadData,
  refreshMirror,
  fillPage,
  capturePage,
  readAccount,
  matchResumesForPage,
  checkJobFit,
  type HomeData,
  type Account,
  type ResumeFitResult,
  type JobFitOutcome,
} from "./home-actions";
import { SaveJobDialog } from "./SaveJobDialog";
import { MarketerView } from "./MarketerView";
import { AssignedChip, AssignedJobsList } from "./AssignedJobs";
import {
  readWorkspaceState,
  refreshWorkspaces,
  chooseWorkspace,
  loadAssigned,
  matchAssigned,
  type WorkspaceState,
  type AssignedJob,
} from "./workspace-actions";
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
  // Save-a-job confirmation modal (captured details, editable before saving to the board).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [saveModal, setSaveModal] = useState<{ capture: any; signal: boolean } | null>(null);
  // Soft warning shown before filling a page that doesn't look like a job page.
  const [fillWarn, setFillWarn] = useState(false);
  // 13.2 (Pro): which resume fits the job on this page — null until known, or when there's nothing to say.
  const [fit, setFit] = useState<ResumeFitResult>(null);
  // 13.3 (Pro): the job-fit report for the selected resume — run on request, reset when it changes.
  const [jobFit, setJobFit] = useState<JobFitOutcome | null>(null);
  const [jobFitBusy, setJobFitBusy] = useState(false);
  useEffect(() => {
    setJobFit(null);
  }, [selectedId]);

  // WP5 — org workspaces. `ws` is Personal (no orgs, or chosen) or one of the user's orgs. The mode
  // decides the drawer: personal/consultant = today's fill drawer (consultant adds the Jobs tab and
  // the "Assigned by" chip); marketer-only = ONLY "Save for consultant…" (no resumes, no fill, and
  // no profile/mirror read at all — see loadHome's guard).
  const [ws, setWs] = useState<WorkspaceState>({ workspaces: [], setting: "personal" });
  const [tab, setTab] = useState<"fill" | "jobs">("fill");
  const [match, setMatch] = useState<{ job: AssignedJob; by: string } | null>(null);
  const mode = window.JAF.workspace.modeOf(ws.workspaces, ws.setting) as {
    kind: "personal" | "marketer" | "consultant" | "org";
    org: { orgId: number; name: string } | null;
  };
  const modeKind = useRef(mode.kind);
  modeKind.current = mode.kind;
  const homeLoaded = useRef(false);

  const toast = useToast();
  const activeTab = useRef<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // The personal data path: refresh the mirror of the signed-in user's OWN profile, then read it.
  // Never runs in a marketer-only workspace (the caller checks `modeKind`), and only once.
  async function loadHome() {
    if (homeLoaded.current) return;
    homeLoaded.current = true;
    await refreshMirror();
    const d = await loadData();
    setData(d);
    setAutoAdv(!!d.settings.autoAdvance);
    const pickable = d.resumes;
    // Preselect: the last-used resume if still available, else the user's default/base resume,
    // else the first one.
    if (d.settings.lastResumeId && pickable.some((r) => r.id === d.settings.lastResumeId)) {
      setSelectedId(d.settings.lastResumeId);
    } else {
      const preferred = pickable.find((r) => r.defaultResume) ?? pickable[0];
      if (preferred) setSelectedId(preferred.id);
    }
    // After the picker is ready, so a slow score never delays filling. Never auto-selects:
    // it suggests, and the user decides.
    matchResumesForPage(pickable).then(setFit);
  }

  async function onPickWorkspace(value: string) {
    const setting = value === "personal" ? "personal" : Number(value);
    await chooseWorkspace(setting);
    setTab("fill");
    setMatch(null);
    setWs((w) => ({ ...w, setting }));
    const next = window.JAF.workspace.modeOf(ws.workspaces, setting);
    if (next.kind !== "marketer") void loadHome();
  }

  // Consultant workspace: is THIS page one of my assigned jobs? (Identity, then normalised URL.)
  useEffect(() => {
    setMatch(null);
    if (mode.kind !== "consultant" || !mode.org) return;
    const orgId = mode.org.orgId;
    let alive = true;
    (async () => {
      try {
        const r = await loadAssigned(orgId);
        if (!r || !alive) return;
        const cap = await capturePage();
        if (!cap.ok || !alive) return;
        const m = await matchAssigned(r.items, cap.capture);
        if (alive) setMatch(m);
      } catch {
        /* the chip is a convenience; the Jobs tab still lists everything */
      }
    })();
    return () => {
      alive = false;
    };
  }, [mode.kind, mode.org?.orgId]);

  useEffect(() => {
    // Orphaned drawer (extension reloaded/updated while open) → chrome.* is dead; bow out.
    if (!extensionAlive()) {
      closePanel();
      return;
    }
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
    // The background re-pulled the mirror because the web app signalled a change (11.1) —
    // repaint from the fresh store so a resume saved on kiwiply.com appears here at once.
    const onMirror = (msg: { type?: string }) => {
      if (msg && msg.type === "KIWIPLY_MIRROR_UPDATED" && modeKind.current !== "marketer") loadData().then(setData);
    };
    chrome.runtime.onMessage.addListener(onMirror);
    (async () => {
      // Local read first (instant, offline-safe): decides whether the personal data path may run.
      const local = await readWorkspaceState();
      setWs(local);
      if (window.JAF.workspace.modeOf(local.workspaces, local.setting).kind !== "marketer") void loadHome();
      // Then the server's current memberships; a role change flips the drawer without a reopen.
      const fresh = await refreshWorkspaces();
      setWs(fresh);
      if (window.JAF.workspace.modeOf(fresh.workspaces, fresh.setting).kind !== "marketer") void loadHome();
    })();
    return () => {
      chrome.storage.onChanged.removeListener(onChange);
      chrome.runtime.onMessage.removeListener(onMirror);
    };
  }, []);

  const pickable = data?.resumes ?? [];
  const selectedResume = pickable.find((r) => r.id === selectedId) ?? null;
  const bestFit = fit && "best" in fit ? fit.best : null;
  const loaded = data !== null;
  const firstName = (data?.bio?.firstName as string) || "";

  async function onFill(force = false) {
    if (!selectedResume || !data) return;
    if (!extensionAlive()) return setStatus({ msg: "Kiwiply was updated — close and reopen this drawer.", kind: "err" });
    setFillWarn(false);
    setBusy(true);
    // Soft check first: warn (never block) only when the page has no fillable form in ANY frame —
    // so an iframed ATS (Workday/Greenhouse/…) the filler CAN fill never gets a false warning.
    if (!force) {
      setStatus({ msg: "Scanning page…", kind: "neutral" });
      const cap = await capturePage();
      if (cap.ok && !cap.hasForm) {
        setBusy(false);
        setStatus(NEUTRAL);
        setFillWarn(true);
        return;
      }
      // cap not ok → let fillPage surface the real error below.
    }
    setStatus({ msg: "Scanning page…", kind: "neutral" });
    // A consultant filling an assigned job: the fill carries {orgId,id} so the confirmed submit can
    // be reported. Still their OWN profile and resume — nothing about the marketer's side changes it.
    const opportunity = mode.kind === "consultant" && mode.org && match ? { orgId: mode.org.orgId, id: match.job.id } : null;
    const res = await fillPage(selectedResume, data.bio, autoAdv, opportunity);
    if (res.ok) {
      // Close the drawer so the on-page fill-review overlay (the field list) is unobstructed.
      closePanel();
    } else {
      setBusy(false);
      setStatus(NEUTRAL);
      toast({ variant: "error", title: "Couldn’t fill this page", description: res.error });
    }
  }

  async function onSaveJob() {
    if (!extensionAlive()) return setStatus({ msg: "Kiwiply was updated — close and reopen this drawer.", kind: "err" });
    setBusy(true);
    setStatus({ msg: "Reading this job…", kind: "neutral" });
    const cap = await capturePage();
    setBusy(false);
    setStatus(NEUTRAL);
    if (!cap.ok) {
      toast({ variant: "error", title: "Couldn’t read this job", description: cap.error });
      return;
    }
    // Show the editable confirmation modal; the actual push happens on confirm. Treat it as a job
    // page if it's a recognizable posting OR has a fillable form (either is a strong signal).
    setSaveModal({ capture: cap.capture, signal: cap.signal || cap.hasForm });
  }

  function onUploadChosen(mode: "save" | "attach") {
    const f = pending;
    setPending(null);
    if (!f) return;
    const label = (f.name || "Resume").replace(/\.[^.]+$/, "").trim() || "Resume";
    const existingLabels = pickable.map((r) => String(r.label || "")).filter(Boolean);
    onReview({ label, fileName: f.name, fileType: f.type || "application/pdf", mode, jobTabId: activeTab.current, file: f, existingLabels });
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

  const statusColor = status.kind === "err" ? "text-danger-text" : status.kind === "ok" ? "text-accent-deep" : "text-muted";

  // Header — logo (left) + account chip · settings · close (right), all on one row
  const headerEl = (
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
  );

  // Workspace chip: Personal / <Org>. Shown only for users who belong to an org — everyone else
  // sees the drawer exactly as before.
  const wsRow =
    ws.workspaces.length > 0 ? (
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-bold uppercase tracking-[.1em] text-muted">Workspace</span>
        <Select
          variant="pill"
          aria-label="Workspace"
          value={ws.setting === "personal" ? "personal" : String(ws.setting)}
          onChange={(v) => void onPickWorkspace(v)}
        >
          <option value="personal">Personal</option>
          {ws.workspaces.map((w) => (
            <option key={w.orgId} value={String(w.orgId)}>
              {w.name}
            </option>
          ))}
        </Select>
      </div>
    ) : null;

  const rootCls = "kiwi-fade-in flex min-h-screen w-full flex-col gap-4 bg-app-bg px-4 pb-4 pt-4 font-body text-ink";

  // Marketer-only workspace: ONLY "Save for consultant…". No resumes, no fill, no profile read.
  if (mode.kind === "marketer" && mode.org) {
    return (
      <div className={rootCls}>
        {headerEl}
        {wsRow}
        <MarketerView key={mode.org.orgId} orgId={mode.org.orgId} orgName={mode.org.name} />
        <footer className="mt-auto border-t border-line px-1 pt-3 text-[11px] text-muted">
          Saving hands a job to your consultant · they apply themselves
        </footer>
      </div>
    );
  }

  return (
    <div className={rootCls}>
      {headerEl}
      {wsRow}

      {/* Consultant workspace: Autofill | Jobs */}
      {mode.kind === "consultant" && mode.org && (
        <div role="tablist" aria-label="Drawer sections" className="flex gap-1 rounded-full bg-paper-2 p-1">
          {(["fill", "jobs"] as const).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={`min-h-[36px] flex-1 rounded-full text-[12.5px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-accent ${
                tab === t ? "bg-paper text-ink shadow-sm" : "text-muted hover:text-ink"
              }`}
            >
              {t === "fill" ? "Autofill" : "Jobs"}
            </button>
          ))}
        </div>
      )}

      {mode.kind === "consultant" && mode.org && tab === "jobs" && <AssignedJobsList orgId={mode.org.orgId} orgName={mode.org.name} />}

      {mode.kind === "consultant" && mode.org && tab === "fill" && match && (
        <AssignedChip
          orgId={mode.org.orgId}
          job={match.job}
          manualApplied={window.JAF.workspace.needsManualApplied(match.job.atsPlatform)}
          onApplied={() => setMatch(null)}
        />
      )}

      {!(mode.kind === "consultant" && tab === "jobs") && (<>

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
            onChange={(v) => setSelectedId(v)}
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
          {bestFit && (
            <div className="flex items-center gap-2 rounded-[var(--radius)] bg-accent-soft px-3 py-2 text-[12.5px]" title={bestFit.why}>
              <span className="min-w-0 flex-1 truncate text-ink">
                {bestFit.localId === selectedId ? (
                  <>
                    <b>Best match for this job</b> · {bestFit.score}%
                  </>
                ) : (
                  <>
                    Best match: <b>{truncateLabel(bestFit.label, 28)}</b> · {bestFit.score}%
                  </>
                )}
              </span>
              {bestFit.localId !== selectedId && (
                <button
                  type="button"
                  onClick={() => setSelectedId(bestFit.localId)}
                  className="flex-none rounded-full px-2 py-0.5 text-[12px] font-bold text-accent-deep hover:underline focus-visible:outline-2 focus-visible:outline-accent"
                >
                  Use
                </button>
              )}
            </div>
          )}
          {fit && "job" in fit && selectedResume && (
            <div className="rounded-[var(--radius)] border border-line bg-paper p-3">
              {jobFit && "fit" in jobFit ? (
                // One number per resume: the ranking's score when there is one (see JobFitReport).
                <JobFitReport fit={{ ...jobFit.fit, score: fit.scores[selectedResume.id] ?? jobFit.fit.score }} />
              ) : (
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 text-[12.5px] leading-snug text-ink-soft">
                    {jobFit && "message" in jobFit ? jobFit.message : "Missing keywords and red flags for this job, for the resume above."}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={jobFitBusy}
                    onClick={async () => {
                      if (!("job" in fit)) return;
                      setJobFitBusy(true);
                      setJobFit(await checkJobFit(selectedResume, fit.job));
                      setJobFitBusy(false);
                    }}
                  >
                    {jobFitBusy ? <Spinner className="h-3.5 w-3.5" /> : "Check fit"}
                  </Button>
                </div>
              )}
            </div>
          )}
          {fit && "optIn" in fit && (
            <p className="text-[12px] leading-snug text-muted">
              Turn on Kiwiply AI in{" "}
              <button type="button" onClick={() => chrome.runtime.openOptionsPage()} className="font-semibold text-accent-deep hover:underline">
                Options
              </button>{" "}
              to see which resume fits this job.
            </p>
          )}
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
            Save to my resumes
          </Button>
          <Button variant="ghost" size="sm" className="w-full" onClick={() => onUploadChosen("attach")}>
            Use once for this job
          </Button>
          <button className="self-center text-[12px] font-semibold text-muted hover:text-ink" onClick={() => setPending(null)}>
            Cancel
          </button>
        </div>
      )}

      {/* Primary actions */}
      <div className="flex flex-col gap-2">
        <Button variant="accent" className="w-full" disabled={!selectedResume || busy} onClick={() => onFill()}>
          {busy && status.kind === "neutral" ? <Spinner className="text-on-accent" /> : null}
          Scan &amp; fill this page
        </Button>
        <Button variant="ghost" className="w-full" disabled={busy} onClick={onSaveJob}>
          Save this job for later
        </Button>
      </div>

      {/* Soft warning — page doesn't look like a job page; fill is still allowed. */}
      {fillWarn && (
        <div className="flex flex-col gap-2 rounded-[var(--radius)] border border-brown-2 bg-brown-soft px-3 py-3 text-[12.5px] leading-snug text-brown-deep">
          <span>This doesn’t look like a job application page. Fill it anyway?</span>
          <div className="flex gap-2">
            <Button variant="accent" size="sm" className="flex-1" onClick={() => onFill(true)}>
              Fill anyway
            </Button>
            <Button variant="ghost" size="sm" className="flex-1" onClick={() => setFillWarn(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

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

      </>)}

      {/* Save-a-job confirmation modal */}
      {saveModal && (
        <SaveJobDialog
          capture={saveModal.capture}
          signal={saveModal.signal}
          onCancel={() => setSaveModal(null)}
          onSaved={(message) => {
            setSaveModal(null);
            toast({ variant: "success", title: "Saved to your board", description: message.replace(/^Saved\s*·?\s*/, "") || undefined });
          }}
        />
      )}
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

// Shared icons (@kiwiply/ui), wrapped to keep this surface's established sizes/weights.
function UserIcon() {
  return <SharedUserIcon strokeWidth={1.7} className="h-4 w-4" />;
}

function UploadIcon() {
  return <SharedUploadIcon className="h-3.5 w-3.5" />;
}

function GearIcon() {
  return <SharedGearIcon strokeWidth={1.7} className="h-[18px] w-[18px]" />;
}

function CloseIcon() {
  return <XIcon className="h-[18px] w-[18px]" />;
}

function LinkIcon() {
  return <SharedLinkIcon className="mt-px h-4 w-4 flex-none text-brown-deep" />;
}
