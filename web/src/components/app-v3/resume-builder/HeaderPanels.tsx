"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button, CheckIcon, CopyIcon, Spinner, Switch, cn, useToast } from "@kiwiply/ui";
import { formatDate, timeAgo, type DateDisplay } from "@/lib/dates";
import {
  createLink,
  getAccess,
  listVersions,
  revokeAccess,
  setLinkDownload,
  versionLabel,
  type AccessGrant,
  type ResumeMeta,
  type ResumeVersion,
} from "@/lib/resume-meta";
import { actorText, expiryText, versionKindChip, viewsText, visibilityLabel } from "./headerBar";

/** The last N versions the header's Version menu lists (DESIGN 10.16); the rest are in All versions. */
export const VERSION_MENU_ROWS = 10;

const ROW = "flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-[13.5px] transition-colors hover:bg-paper-2 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent";

function Dot({ on }: { on: boolean }) {
  return (
    <span aria-hidden className={cn("grid h-4 w-4 flex-none place-items-center rounded-full border", on ? "border-accent-deep bg-accent-deep text-paper" : "border-line bg-paper")}>
      {on && <CheckIcon size={11} strokeWidth={3} />}
    </span>
  );
}

function Box({ on }: { on: boolean }) {
  return (
    <span aria-hidden className={cn("grid h-4 w-4 flex-none place-items-center rounded border", on ? "border-accent-deep bg-accent-deep text-paper" : "border-line bg-paper")}>
      {on && <CheckIcon size={11} strokeWidth={3} />}
    </span>
  );
}

const FOOTER = "mt-1 block w-full border-t border-line px-2.5 pb-1 pt-2.5 text-left text-[12.5px] font-semibold text-v2-blue hover:underline";

/* ── Visibility ▾: who inside Kiwiply can see this resume ───────────────────────────────── */

/**
 * The Visibility popover (DESIGN 10.16): Private (exclusive) · My organization (only with an org, and only usable at FULL
 * scope) · Specific people (n). It only reports what was picked; the header runs the calls and the confirmations.
 */
export function VisibilityPanel({
  visibility,
  busy,
  onPrivate,
  onToggleOrg,
  onPeople,
  onManage,
}: {
  visibility: ResumeMeta["visibility"];
  busy: boolean;
  onPrivate: () => void;
  onToggleOrg: () => void;
  onPeople: () => void;
  onManage: () => void;
}) {
  const hasOrg = visibility.orgPaired !== null;
  const orgUsable = hasOrg && visibility.orgScope === "FULL";
  const orgOn = visibility.mode === "ORG" || (orgUsable && visibility.shareWithOrg);
  return (
    <div className="w-[19rem] max-w-full" data-visibility-label={visibilityLabel(visibility)}>
      <p className="px-2.5 pb-1 pt-1 text-[11px] font-bold uppercase tracking-wide text-muted">Who can see this inside Kiwiply</p>
      <button type="button" className={ROW} aria-pressed={visibility.mode === "PRIVATE"} disabled={busy} onClick={onPrivate}>
        <Dot on={visibility.mode === "PRIVATE"} />
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-ink">Private</span>
          <span className="block text-[12.5px] text-muted">Only you</span>
        </span>
      </button>
      {hasOrg && (
        <div className={cn(ROW, "cursor-default hover:bg-transparent")}>
          <button type="button" className="flex min-w-0 flex-1 items-center gap-3 text-left disabled:opacity-60" aria-pressed={orgOn} disabled={busy || !orgUsable} onClick={onToggleOrg}>
            <Box on={orgOn} />
            <span className="min-w-0 flex-1">
              <span className="block font-semibold text-ink">My organization</span>
              <span className="block text-[12.5px] text-muted">
                {orgUsable ? `${visibility.orgPaired} (your marketer) can view and download` : `Requires Full sharing with ${visibility.orgPaired}`}
              </span>
            </span>
          </button>
          {!orgUsable && (
            <Link href="/settings/organizations" className="flex-none text-[12.5px] font-semibold text-v2-blue hover:underline">
              Change sharing
            </Link>
          )}
        </div>
      )}
      <button type="button" className={ROW} aria-pressed={visibility.people > 0} disabled={busy} onClick={onPeople}>
        <Box on={visibility.people > 0} />
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-ink">{visibility.people > 0 ? `Specific people (${visibility.people})` : "Specific people"}</span>
          <span className="block text-[12.5px] text-muted">{visibility.people > 0 ? "Uncheck to remove all of them" : "Add people by email in Resume settings"}</span>
        </span>
      </button>
      <button type="button" className={FOOTER} onClick={onManage}>
        Manage in Resume settings
      </button>
    </div>
  );
}

/* ── Shared with Recruiters ▾: revocable links for people outside Kiwiply ───────────────── */

/**
 * The recruiter-sharing popover (DESIGN 10.16, R3.11): Off / On, and while on the link rows (address with Copy, expiry,
 * views, an "Allow PDF download" switch, Revoke) and "+ Another link". Honest copy: a link is for someone without a
 * Kiwiply account, it is not a public listing. Loads the links when it opens and again whenever the link count changes.
 */
export function RecruiterPanel({
  resumeId,
  meta,
  maxLinks,
  display,
  now,
  busy,
  onTurnOn,
  onTurnOff,
  onChanged,
  onManage,
}: {
  resumeId: number;
  meta: ResumeMeta;
  maxLinks: number;
  display: DateDisplay;
  now: number;
  busy: boolean;
  onTurnOn: () => void;
  onTurnOff: () => void;
  /** A link was added, revoked or changed here: the header re-reads the resume. */
  onChanged: () => void;
  onManage: () => void;
}) {
  const toast = useToast();
  const [links, setLinks] = useState<AccessGrant[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const on = meta.recruiterSharing.on;
  const count = meta.recruiterSharing.links;

  const load = useCallback(async () => {
    const res = await getAccess(resumeId);
    if (res.kind === "ok") {
      setLinks(res.value.links.filter((l) => !l.expired));
      setError(null);
    } else setError(res.message);
  }, [resumeId]);

  useEffect(() => {
    if (!on) return;
    // Reading the links is this effect's whole job (the state is filled when the answer arrives).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [on, count, load]);

  const run = async (fn: () => Promise<{ kind: "ok" | "error"; message?: string }>) => {
    if (working) return;
    setWorking(true);
    const res = await fn();
    setWorking(false);
    if (res.kind === "error") toast({ title: "Couldn't change the link", description: res.message, variant: "error" });
    else {
      await load();
      onChanged();
    }
  };

  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: "Link copied", variant: "success" });
    } catch {
      toast({ title: "Couldn't copy the link", description: "Select the address and copy it by hand.", variant: "error" });
    }
  };

  const disabled = busy || working;
  return (
    <div className="w-[22rem] max-w-full">
      <p className="px-2.5 pb-1 pt-1 text-[12.5px] leading-snug text-muted">
        For recruiters and hiring managers without a Kiwiply account: anyone with the link can open it, until you turn it off. It is not a public listing.
      </p>
      <button type="button" className={ROW} aria-pressed={!on} disabled={disabled} onClick={() => on && onTurnOff()}>
        <Dot on={!on} />
        <span className="font-semibold text-ink">Off</span>
      </button>
      <button type="button" className={ROW} aria-pressed={on} disabled={disabled} onClick={() => !on && onTurnOn()}>
        <Dot on={on} />
        <span className="font-semibold text-ink">On</span>
        <span className="text-[12.5px] text-muted">creates a link</span>
      </button>

      {on && (
        <div className="mt-1 space-y-2 border-t border-line pt-2">
          {links === null && !error && (
            <p role="status" className="flex items-center gap-2 px-2.5 py-2 text-[13px] text-ink-soft">
              <Spinner role="presentation" aria-hidden className="h-4 w-4" />
              Loading links…
            </p>
          )}
          {error && (
            <p role="alert" className="px-2.5 text-[13px] text-danger">
              {error}
            </p>
          )}
          {links?.map((l) => (
            <div key={l.id} className="rounded-xl border border-line p-2.5" data-link-id={l.id}>
              <div className="flex items-center gap-2">
                <input readOnly value={l.url ?? ""} aria-label="Share link" onFocus={(e) => e.currentTarget.select()} className="min-w-0 flex-1 truncate rounded-md border border-line bg-paper-2 px-2 py-1.5 text-[12.5px] text-ink" />
                <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => l.url && void copy(l.url)}>
                  <CopyIcon size={14} />
                  Copy
                </Button>
              </div>
              <p className="mt-1.5 text-[12.5px] text-muted" title={l.expiresAt ? formatDate(l.expiresAt, { month: "short", day: "numeric", year: "numeric" }, display) : undefined}>
                <span suppressHydrationWarning>{expiryText(l.expiresAt, l.expired, now)}</span> · {viewsText(l.viewCount)}
                {l.lastViewedAt ? (
                  <>
                    {" "}
                    · last <span suppressHydrationWarning>{timeAgo(l.lastViewedAt, now, display)}</span>
                  </>
                ) : null}
              </p>
              <div className="mt-2 flex items-center justify-between gap-3">
                <Switch
                  checked={l.allowDownload === true}
                  disabled={disabled}
                  onCheckedChange={(v) => void run(() => setLinkDownload(resumeId, l.id, v))}
                  aria-label="Allow PDF download"
                  className="flex-none"
                />
                <span className="min-w-0 flex-1 text-[13px] text-ink">Allow PDF download</span>
                <Button variant="ghost" size="sm" disabled={disabled} onClick={() => void run(() => revokeAccess(resumeId, l.id))} aria-label={`Revoke link ${l.label ?? l.id}`}>
                  Revoke
                </Button>
              </div>
            </div>
          ))}
          {links !== null && count < maxLinks && (
            <button type="button" className={cn(ROW, "font-semibold text-v2-blue")} disabled={disabled} onClick={() => void run(() => createLink(resumeId))}>
              + Another link
            </button>
          )}
          {links !== null && count >= maxLinks && <p className="px-2.5 text-[12.5px] text-muted">You have {count} active links, the most one resume can have.</p>}
        </div>
      )}
      <button type="button" className={FOOTER} onClick={onManage}>
        Manage in Resume settings
      </button>
    </div>
  );
}

/* ── Version ▾: the last rows, with Restore and Compare ─────────────────────────────────── */

/**
 * The Version popover (DESIGN 10.16): the last ten versions ("v7 · Before tailoring", when, by whom, named or saved),
 * each with Compare and Restore; Save as version… and All versions at the foot. It reads the history when it opens.
 */
export function VersionPanel({
  resumeId,
  ownerLogin,
  display,
  reloadKey,
  onLoaded,
  onCompare,
  onRestore,
  onSaveVersion,
  onAll,
}: {
  resumeId: number;
  ownerLogin: string | null;
  display: DateDisplay;
  reloadKey: number;
  /** The newest version number the history shows (keeps the chip honest). */
  onLoaded: (newest: number) => void;
  onCompare: (v: ResumeVersion) => void;
  onRestore: (v: ResumeVersion) => void;
  onSaveVersion: () => void;
  onAll: () => void;
}) {
  const [state, setState] = useState<{ status: "loading" } | { status: "error"; message: string } | { status: "ready"; rows: ResumeVersion[]; now: number }>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    void listVersions(resumeId).then((res) => {
      if (cancelled) return;
      if (res.kind === "error") return setState({ status: "error", message: res.message });
      setState({ status: "ready", rows: res.value, now: Date.now() });
      if (res.value[0]) onLoaded(res.value[0].versionNo);
    });
    return () => {
      cancelled = true;
    };
  }, [resumeId, reloadKey, onLoaded]);

  return (
    <div className="w-[24rem] max-w-full">
      {state.status === "loading" && (
        <p role="status" className="flex items-center gap-2 px-2.5 py-3 text-[13px] text-ink-soft">
          <Spinner role="presentation" aria-hidden className="h-4 w-4" />
          Loading versions…
        </p>
      )}
      {state.status === "error" && (
        <p role="alert" className="px-2.5 py-3 text-[13px] text-danger">
          {state.message}
        </p>
      )}
      {state.status === "ready" && state.rows.length === 0 && <p className="px-2.5 py-3 text-[13px] text-ink-soft">No versions yet. Use Save as version… to keep one.</p>}
      {state.status === "ready" && (
        <ul className="max-h-[20rem] overflow-y-auto">
          {state.rows.slice(0, VERSION_MENU_ROWS).map((v) => {
            const chip = versionKindChip(v);
            return (
              <li key={v.versionNo} className="flex items-center gap-2 rounded-lg px-2.5 py-2 hover:bg-paper-2" data-version={v.versionNo}>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-[13.5px] text-ink">
                    <span className="font-semibold">v{v.versionNo}</span>
                    <span className="truncate">{versionLabel(v)}</span>
                    {chip && <span className="flex-none rounded-full bg-accent-soft px-1.5 py-0.5 text-[10.5px] font-semibold text-accent-deep">{chip}</span>}
                  </p>
                  <p className="text-[12px] text-muted">
                    <span suppressHydrationWarning>{timeAgo(v.createdAt, state.now, display)}</span> · {actorText(v.by, ownerLogin)}
                  </p>
                </div>
                <button type="button" onClick={() => onCompare(v)} aria-label={`Compare v${v.versionNo}`} className="flex-none rounded-md px-2 py-1 text-[12.5px] font-semibold text-v2-blue hover:bg-v2-blue-soft">
                  Compare
                </button>
                <button type="button" onClick={() => onRestore(v)} aria-label={`Restore v${v.versionNo}`} className="flex-none rounded-md px-2 py-1 text-[12.5px] font-semibold text-v2-blue hover:bg-v2-blue-soft">
                  Restore
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <div className="mt-1 flex items-center justify-between border-t border-line px-1 pt-2">
        <button type="button" onClick={onSaveVersion} className="rounded-md px-1.5 py-1 text-[12.5px] font-semibold text-v2-blue hover:bg-v2-blue-soft">
          Save as version…
        </button>
        <button type="button" onClick={onAll} className="rounded-md px-1.5 py-1 text-[12.5px] font-semibold text-v2-blue hover:bg-v2-blue-soft">
          All versions
        </button>
      </div>
    </div>
  );
}
