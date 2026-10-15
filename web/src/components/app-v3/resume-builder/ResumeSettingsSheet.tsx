"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, ChipInput, CopyIcon, DownloadIcon, Field, Input, Spinner, Switch, cn, getTemplate, useToast } from "@kiwiply/ui";
import { track } from "@/lib/analytics";
import { formatDate, timeAgo } from "@/lib/dates";
import { DEFAULT_BUILDER_CONFIG, capabilitiesOf, type ResumeBuilderConfig } from "@/lib/resume-builder-config.shared";
import { useBuilderEnv } from "./builderEnv";
import {
  createLink,
  deleteResume,
  getAccess,
  getMeta,
  getViews,
  grantUser,
  patchMeta,
  revokeAccess,
  setLinkDownload,
  type AccessGrant,
  type AccessOverview,
  type Res,
  type ResumeMeta,
  type ResumeView,
} from "@/lib/resume-meta";
import { useDateDisplay } from "@/lib/use-date-display";
import BodyPortal from "./BodyPortal";
import ConfirmDialog from "./ConfirmDialog";
import { expiryText, orgScopeCopy, orgSeesResume, sourceLine, viewsText, visibilitySummary } from "./headerBar";
import ViewsSheet from "./ViewsSheet";

// The fields' limits are the API's schema rules (ResumeMetaService / ResumeTags / ResumeAccessService), not tunables.
// config-literal-ok: meta.name maxLength (ResumeMetaService.MAX_NAME_CHARS)
const MAX_NAME = 200;
const MAX_TARGET = 80;
const MAX_TAGS = 10;
const MAX_TAG_CHARS = 24;
const MAX_LABEL = 80;
// config-literal-ok: the debounce of the details fields (DESIGN 10.12: 500 ms), a UI timing
const DEBOUNCE_MS = 500;
// config-literal-ok: the relative-time repaint tick (display only)
const NOW_TICK_MS = 60_000;

const CARD = "rounded-2xl border border-line bg-paper p-4";
const H3 = "font-display text-[15px] font-bold text-ink";
const ROW = "flex flex-wrap items-center gap-x-3 gap-y-2";
const SUBTLE = "text-[12.5px] text-muted";
const LINK_BTN = "rounded-md px-1.5 py-1 text-[13px] font-semibold text-v2-blue hover:bg-v2-blue-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-blue disabled:opacity-60";

type Confirm = { kind: "person"; grant: AccessGrant } | { kind: "link"; grant: AccessGrant } | { kind: "archive" } | { kind: "delete" };

/** `<input type="date">` value (YYYY-MM-DD, the user's calendar day) -> the end of that day as an ISO instant. */
function endOfDay(day: string): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return undefined;
  const d = new Date(`${day}T23:59:59`);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

/** Today as a date input value (the earliest expiry that can be picked is tomorrow). */
function tomorrow(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export interface ResumeSettingsSheetProps {
  resumeId: number;
  /** The resume's metadata, shared with the header bar. Null until it has been read. */
  meta: ResumeMeta | null;
  /** A change made here (or re-read from the server): the editor hands it to the header too. */
  onMeta: (meta: ResumeMeta) => void;
  config: ResumeBuilderConfig;
  /** The sheet is on screen: who can see the resume is read each time it opens. */
  active: boolean;
  phone: boolean;
  /** The editor's live Resume Score (the stored one lags the last save). */
  liveScore?: number | null;
}

/**
 * Resume settings (DESIGN 10.12, R3.12): the full home of everything about one resume, in the right side-nav. 1 Name,
 * target role and tags (`PATCH …/meta`, debounced and optimistic) - 2 Primary - 3 Visibility (the computed summary, My
 * organization, People, Links, Activity) - 4 About - 5 Danger (Archive, Delete). The header bar is the quick layer over the
 * same calls. Rules live in Spring (name length, exactly-one primary, share limits); this component shows what the server
 * refused in words. Dialogs and the "See all" sheet are portalled out of the (transformed) side sheet.
 */
export default function ResumeSettingsSheet({ resumeId, meta, onMeta, config, active, phone, liveScore = null }: ResumeSettingsSheetProps) {
  const router = useRouter();
  const env = useBuilderEnv();
  // What this session may do (the API refuses the same things): a section the session cannot use is not drawn.
  const caps = capabilitiesOf(config);
  const toast = useToast();
  const display = useDateDisplay();
  const share = config.share ?? DEFAULT_BUILDER_CONFIG.share;
  const shareLinksOn = config.features.shareLinks ?? true;
  const [now, setNow] = useState(() => Date.now());

  const onMetaRef = useRef(onMeta);
  useEffect(() => {
    onMetaRef.current = onMeta;
  }, [onMeta]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), NOW_TICK_MS);
    return () => clearInterval(t);
  }, []);

  /* ── 1. Name · Target role · Tags ──────────────────────────────────────────────────────── */
  const [name, setName] = useState(meta?.name ?? "");
  const [target, setTarget] = useState(meta?.target ?? "");
  const [tags, setTags] = useState<string[]>(meta?.tags ?? []);
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [prevMeta, setPrevMeta] = useState(meta);
  if (meta !== prevMeta) {
    // The header (or a refresh) changed the resume: show it, unless the person is in the middle of typing here.
    setPrevMeta(meta);
    if (meta && !dirty) {
      setName(meta.name);
      setTarget(meta.target ?? "");
      setTags(meta.tags);
    }
  }
  const pending = useRef<Record<string, unknown>>({});
  const timer = useRef<number | null>(null);
  const chain = useRef<Promise<void>>(Promise.resolve());

  const flush = useCallback((): Promise<void> => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    const body = pending.current;
    if (Object.keys(body).length === 0) return chain.current;
    pending.current = {};
    chain.current = chain.current.then(async () => {
      setSaveState("saving");
      const res = await patchMeta(resumeId, body);
      const idle = Object.keys(pending.current).length === 0 && timer.current === null;
      if (res.kind === "ok") {
        onMetaRef.current(res.value);
        setDetailsError(null);
        setSaveState("saved");
        if (idle) setDirty(false);
        for (const field of Object.keys(body)) track("resume_meta_changed", { field });
      } else {
        setDetailsError(res.message);
        setSaveState("idle");
      }
    });
    return chain.current;
  }, [resumeId]);

  const queue = useCallback(
    (patch: Record<string, unknown>) => {
      Object.assign(pending.current, patch);
      setDirty(true);
      setSaveState("idle");
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => void flush(), DEBOUNCE_MS);
    },
    [flush],
  );

  // Closing the sheet (or leaving the editor) never drops what was typed in the last half second.
  useEffect(
    () => () => {
      void flush();
    },
    [flush],
  );

  const nameBlank = name.trim() === "";
  const onName = (v: string) => {
    setName(v);
    if (v.trim() !== "") queue({ name: v.trim() });
    else setDirty(true);
  };
  const onTarget = (v: string) => {
    setTarget(v);
    queue({ target: v.trim() === "" ? null : v.trim() });
  };
  const onTags = (next: string[]) => {
    setTags(next);
    queue({ tags: next });
  };

  /* ── data: who can see it ──────────────────────────────────────────────────────────────── */
  const [access, setAccess] = useState<AccessOverview | null>(null);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [lastView, setLastView] = useState<ResumeView | null>(null);

  const loadAccess = useCallback(async () => {
    const res = await getAccess(resumeId);
    if (res.kind === "ok") {
      setAccess(res.value);
      setAccessError(null);
    } else setAccessError(res.message);
    const views = await getViews(resumeId, 1);
    if (views.kind === "ok") setLastView(views.value[0] ?? null);
    setNow(Date.now());
  }, [resumeId]);

  const hasMeta = meta !== null;
  useEffect(() => {
    if (!active || !hasMeta) return;
    // Reading who can see the resume is this effect's whole job (the state is filled when the answer arrives).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadAccess();
  }, [active, hasMeta, loadAccess]);

  const refreshMeta = useCallback(async () => {
    const res = await getMeta(resumeId);
    if (res.kind === "ok") onMetaRef.current(res.value);
    return res.kind === "ok";
  }, [resumeId]);

  /* ── actions ───────────────────────────────────────────────────────────────────────────── */
  const [busy, setBusy] = useState(false);
  const [dangerError, setDangerError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [viewsOpen, setViewsOpen] = useState(false);
  const [announce, setAnnounce] = useState<{ text: string; n: number } | null>(null);
  const seeAllRef = useRef<HTMLButtonElement>(null);

  /** Runs one change: busy while it runs; a failure is a toast, the answer is handed back. */
  const act = async <T,>(fn: () => Promise<Res<T>>, failTitle: string): Promise<{ ok: true; value: T } | { ok: false; error: Extract<Res<T>, { kind: "error" }> }> => {
    if (busy) return { ok: false, error: { kind: "error", status: 0, message: "Another change is still saving." } };
    setBusy(true);
    const res = await fn();
    setBusy(false);
    if (res.kind === "error") {
      toast({ title: failTitle, description: res.message, variant: "error" });
      return { ok: false, error: res };
    }
    return { ok: true, value: res.value };
  };

  const afterSharingChange = async () => {
    await loadAccess();
    await refreshMeta();
  };

  const setPrimary = async (on: boolean) => {
    if (!on || !meta || meta.primary) return;
    await flush();
    const r = await act(() => patchMeta(resumeId, { primary: true }), "Couldn't set the primary resume");
    if (r.ok) {
      onMeta(r.value);
      track("resume_primary_set");
      toast({ title: "Now your primary resume", description: "The extension attaches it by default.", variant: "success" });
    }
  };

  const setShareWithOrg = async (on: boolean) => {
    const r = await act(() => patchMeta(resumeId, { shareWithOrg: on }), "Couldn't change sharing");
    if (r.ok) {
      onMeta(r.value);
      track("resume_shared", { kind: "org" });
      await loadAccess();
    }
  };

  /* People */
  const [adding, setAdding] = useState(false);
  const [email, setEmail] = useState("");
  const [personExpiry, setPersonExpiry] = useState("");
  const [personError, setPersonError] = useState<string | null>(null);

  const addPerson = async () => {
    const value = email.trim();
    if (!value) {
      setPersonError("Enter their email address.");
      return;
    }
    setPersonError(null);
    setBusy(true);
    const res = await grantUser(resumeId, { email: value, expiresAt: endOfDay(personExpiry) });
    setBusy(false);
    if (res.kind === "error") {
      // config-literal-ok: HTTP 404 (no Kiwiply account has that email)
      setPersonError(res.status === 404 || res.code === "USER_NOT_FOUND" ? "They need a Kiwiply account — send them a link instead" : res.message);
      return;
    }
    track("resume_shared", { kind: "user" });
    setAdding(false);
    setEmail("");
    setPersonExpiry("");
    toast({ title: "Shared", description: `${res.value.name || res.value.login || value} can now view this resume.`, variant: "success" });
    await afterSharingChange();
  };

  /* Links */
  const [creating, setCreating] = useState(false);
  const [linkLabel, setLinkLabel] = useState("");
  const [linkExpiry, setLinkExpiry] = useState("");
  const [linkDownload, setLinkDownloadAllowed] = useState(share.allowDownloadDefault);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [newLinkId, setNewLinkId] = useState<number | null>(null);

  const startCreate = () => {
    setLinkLabel("");
    setLinkExpiry("");
    setLinkDownloadAllowed(share.allowDownloadDefault);
    setLinkError(null);
    setCreating(true);
  };

  const makeLink = async () => {
    setLinkError(null);
    setBusy(true);
    const res = await createLink(resumeId, { label: linkLabel.trim() || undefined, expiresAt: endOfDay(linkExpiry), allowDownload: linkDownload });
    setBusy(false);
    if (res.kind === "error") {
      setLinkError(res.message);
      return;
    }
    track("resume_shared", { kind: "link" });
    setCreating(false);
    setNewLinkId(res.value.id);
    toast({ title: "Link created", description: "Copy it and send it. Anyone with it can open this resume until it expires or you revoke it.", variant: "success" });
    await afterSharingChange();
  };

  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setAnnounce((a) => ({ text: "Link copied", n: (a?.n ?? 0) + 1 }));
      toast({ title: "Link copied", variant: "success" });
    } catch {
      toast({ title: "Couldn't copy the link", description: "Select the address and copy it by hand.", variant: "error" });
    }
  };

  const changeDownload = async (g: AccessGrant, v: boolean) => {
    const r = await act(() => setLinkDownload(resumeId, g.id, v), "Couldn't change the link");
    if (r.ok) await loadAccess();
  };

  /* Danger */
  const archived = meta?.archived ?? false;
  const runConfirmed = async () => {
    const c = confirm;
    if (!c || !meta) return;
    if (c.kind === "person" || c.kind === "link") {
      const r = await act(() => revokeAccess(resumeId, c.grant.id), c.kind === "person" ? "Couldn't remove them" : "Couldn't revoke the link");
      setConfirm(null);
      if (r.ok) await afterSharingChange();
      return;
    }
    if (c.kind === "archive") {
      setDangerError(null);
      await flush();
      const next = !meta.archived;
      const r = await act(() => patchMeta(resumeId, { archived: next }), next ? "Couldn't archive the resume" : "Couldn't unarchive the resume");
      setConfirm(null);
      if (!r.ok) {
        // 409 PRIMARY_REQUIRED: the primary can't be archived while other resumes exist - the server's sentence says what to do.
        setDangerError(r.error.message);
        return;
      }
      onMeta(r.value);
      if (next) router.push(env.listHref);
      else toast({ title: "Resume unarchived", variant: "success" });
      return;
    }
    setDangerError(null);
    const r = await act(() => deleteResume(resumeId), "Couldn't delete the resume");
    setConfirm(null);
    if (!r.ok) {
      setDangerError(r.error.message);
      return;
    }
    router.push(env.listHref);
  };

  const confirmWords: { title: string; description?: ReactNode; confirm: string; danger?: boolean } | null = !confirm
    ? null
    : confirm.kind === "person"
      ? { title: "Remove this person?", description: `${confirm.grant.name || confirm.grant.login || "They"} will no longer be able to see this resume.`, confirm: "Remove", danger: true }
      : confirm.kind === "link"
        ? { title: "Revoke this link?", description: "Anyone who has it will lose access right away.", confirm: "Revoke link", danger: true }
        : confirm.kind === "archive"
          ? archived
            ? { title: "Unarchive this resume?", description: `"${meta?.name ?? ""}" goes back to your active resumes.`, confirm: "Unarchive" }
            : {
                title: "Archive this resume?",
                description: meta?.primary
                  ? `"${meta.name}" moves to Archived. It is your primary resume: if you have others, make one of them primary first.`
                  : `"${meta?.name ?? ""}" moves to Archived. You can bring it back any time.`,
                confirm: "Archive",
              }
          : { title: "Delete this resume?", description: `"${meta?.name ?? ""}" and its versions are deleted for good. This can't be undone.`, confirm: "Delete", danger: true };

  /* ── render ────────────────────────────────────────────────────────────────────────────── */
  if (!meta) {
    return (
      <p role="status" className="flex items-center gap-2 py-6 text-[13.5px] text-ink-soft">
        <Spinner role="presentation" aria-hidden className="h-4 w-4" />
        Loading details…{" "}
        <button type="button" className={LINK_BTN} onClick={() => void refreshMeta()}>
          Try again
        </button>
      </p>
    );
  }

  const built = meta.kind === "BUILT";
  const fmt = (iso: string | null | undefined) => (iso ? formatDate(iso, { month: "short", day: "numeric", year: "numeric" }, display) : "");
  const by = (a: { label: string } | null) => (a ? ` by ${a.label}` : "");
  const templateName = meta.templateId ? getTemplate(meta.templateId).meta.name : null;
  const lastPdf = meta.pdf?.generatedAt ?? meta.lastExportedAt;
  const score = liveScore ?? meta.score;
  const orgInfo = access?.org ?? null;
  const orgIsFull = orgInfo?.scope === "FULL";
  const grants = access?.grants ?? [];
  const links = access?.links ?? [];
  const liveLinks = links.filter((l) => !l.expired).length;
  const liveGrants = grants.filter((g) => !g.expired).length;
  const viewers = access?.viewers ?? 0;
  const needsApproval = meta.source.approvalRequired && !meta.source.approvedAt;
  const summaryText = visibilitySummary(meta);
  const isPrivate = !orgSeesResume(meta.visibility, meta.shareWithOrg) && meta.visibility.people === 0 && meta.recruiterSharing.links === 0;

  return (
    <div className="flex flex-col gap-4 pb-2" data-testid="resume-settings">
      {/* 1. Name, target role, tags */}
      <section aria-labelledby="rb-set-details" className={CARD}>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 id="rb-set-details" className={H3}>
            Details
          </h3>
          <span role="status" aria-live="polite" className={SUBTLE}>
            {saveState === "saving" ? "Saving…" : saveState === "saved" && !dirty ? "All changes saved" : ""}
          </span>
        </div>
        <Field label="Name" required error={nameBlank ? "Give your resume a name." : undefined}>
          <Input value={name} maxLength={MAX_NAME} onChange={(e) => onName(e.target.value)} onBlur={() => void flush()} />
        </Field>
        <Field label="Target role">
          <Input value={target} maxLength={MAX_TARGET} placeholder="e.g. Backend Engineer" onChange={(e) => onTarget(e.target.value)} onBlur={() => void flush()} />
        </Field>
        <ChipInput
          label="Tags"
          showLabel
          value={tags}
          onChange={onTags}
          maxChips={MAX_TAGS}
          maxChipLength={MAX_TAG_CHARS}
          placeholder="Add a tag and press Enter"
          className="mb-1"
        />
        {detailsError && (
          <p role="alert" className="mt-2 text-[13px] text-danger-text">
            Couldn&apos;t save: {detailsError}
          </p>
        )}
      </section>

      {/* 2. Primary */}
      {caps.setPrimary && (
      <section aria-labelledby="rb-set-primary" className={CARD}>
        <h3 id="rb-set-primary" className={cn(H3, "mb-3")}>
          Primary resume
        </h3>
        <Switch
          label="Use as my primary resume"
          description="The extension attaches this one by default."
          checked={meta.primary}
          disabled={busy || meta.primary || archived}
          onCheckedChange={(v) => void setPrimary(v)}
        />
        {meta.primary && <p className={cn(SUBTLE, "mt-2")}>Pick another resume as primary to turn this off</p>}
        {!meta.primary && archived && <p className={cn(SUBTLE, "mt-2")}>An archived resume can&apos;t be your primary resume.</p>}
      </section>
      )}

      {/* 3. Visibility (sharing is not part of an organization workspace: capabilities.shareLinks) */}
      {caps.shareLinks && (
      <section aria-labelledby="rb-set-visibility" className={CARD}>
        <h3 id="rb-set-visibility" className={H3}>
          Visibility
        </h3>
        <p data-testid="visibility-summary" className={cn("mt-1 text-[14px] font-semibold", isPrivate ? "text-ink" : "text-v2-green-ink")}>
          {summaryText}
        </p>
        {accessError && (
          <p role="alert" className="mt-2 text-[13px] text-danger-text">
            {accessError}{" "}
            <button type="button" className={LINK_BTN} onClick={() => void loadAccess()}>
              Try again
            </button>
          </p>
        )}
        {!built && <p className={cn(SUBTLE, "mt-2")}>Only resumes built in Kiwiply can be shared. An uploaded file has no page to show.</p>}
        {built && access === null && !accessError && (
          <p role="status" className="mt-3 flex items-center gap-2 text-[13px] text-ink-soft">
            <Spinner role="presentation" aria-hidden className="h-4 w-4" />
            Loading who can see this…
          </p>
        )}

        {built && access !== null && (
          <div className="mt-3 flex flex-col gap-4">
            {/* My organization */}
            {orgInfo && (
              <div className="rounded-xl border border-line p-3" data-testid="org-row">
                <p className="text-[13.5px] font-semibold text-ink">My organization</p>
                <p className={cn(SUBTLE, "mt-0.5")}>{orgScopeCopy(orgInfo.scope, orgInfo.pairedWith)}</p>
                <div className="mt-2 flex flex-col gap-2">
                  {orgIsFull && (
                    <Switch
                      label="Include this resume"
                      description={`${orgInfo.pairedWith ? `${orgInfo.pairedWith} (your marketer)` : "Your marketer"} can open and download it`}
                      checked={meta.shareWithOrg}
                      disabled={busy}
                      onCheckedChange={(v) => void setShareWithOrg(v)}
                    />
                  )}
                  <Link href="/settings/organizations" className="w-fit text-[13px] font-semibold text-v2-blue hover:underline">
                    Change sharing
                  </Link>
                </div>
              </div>
            )}

            {/* People */}
            <div data-testid="people-block">
              <div className={cn(ROW, "justify-between")}>
                <p className="text-[13.5px] font-semibold text-ink">People{liveGrants > 0 ? ` (${liveGrants})` : ""}</p>
                {!adding && (
                  <button type="button" className={LINK_BTN} disabled={busy || liveGrants >= share.maxGrants} onClick={() => setAdding(true)}>
                    + Add person
                  </button>
                )}
              </div>
              {grants.length === 0 && !adding && <p className={cn(SUBTLE, "mt-1")}>Only you, for now. Add people who have a Kiwiply account.</p>}
              {liveGrants >= share.maxGrants && <p className={cn(SUBTLE, "mt-1")}>You have shared with {liveGrants} people, the most one resume can have.</p>}
              {grants.length > 0 && (
                <ul className="mt-2 divide-y divide-line rounded-xl border border-line">
                  {grants.map((g) => (
                    <li key={g.id} className={cn(ROW, "p-2.5")} data-grant-id={g.id}>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13.5px] font-medium text-ink">{g.name || g.login || g.label}</p>
                        <p className={SUBTLE}>
                          Can view · <span suppressHydrationWarning>{expiryText(g.expiresAt, g.expired, now)}</span>
                        </p>
                      </div>
                      <Button variant="ghost" size="sm" disabled={busy} onClick={() => setConfirm({ kind: "person", grant: g })} aria-label={`Remove ${g.name || g.login || "this person"}`}>
                        Remove
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
              {adding && (
                <form
                  className="mt-2 flex flex-col gap-2 rounded-xl border border-line p-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void addPerson();
                  }}
                >
                  <Field label="Their email" className="mb-0" error={personError ?? undefined}>
                    <Input type="email" value={email} autoComplete="off" placeholder="name@example.com" onChange={(e) => setEmail(e.target.value)} />
                  </Field>
                  <Field label="Access ends (optional)" className="mb-0" hint="Leave empty for no end date.">
                    <Input type="date" min={tomorrow()} value={personExpiry} onChange={(e) => setPersonExpiry(e.target.value)} />
                  </Field>
                  <div className="flex items-center gap-2">
                    <Button type="submit" variant="accent" size="sm" disabled={busy}>
                      Add person
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setAdding(false);
                        setPersonError(null);
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              )}
            </div>

            {/* Links */}
            {shareLinksOn && (
              <div data-testid="links-block">
                <div className={cn(ROW, "justify-between")}>
                  <p className="text-[13.5px] font-semibold text-ink">Links{liveLinks > 0 ? ` (${liveLinks})` : ""}</p>
                  {!creating && (
                    <button type="button" className={LINK_BTN} disabled={busy || liveLinks >= share.maxLinks} onClick={startCreate}>
                      + Create link
                    </button>
                  )}
                </div>
                <p className={cn(SUBTLE, "mt-1")}>For recruiters and hiring managers without a Kiwiply account. Anyone with a link can open it until it expires or you revoke it; it is not a public listing.</p>
                {liveLinks >= share.maxLinks && <p className={cn(SUBTLE, "mt-1")}>You have {liveLinks} active links, the most one resume can have.</p>}
                {links.length > 0 && (
                  <ul className="mt-2 flex flex-col gap-2">
                    {links.map((l) => (
                      <li key={l.id} className={cn("rounded-xl border p-3", l.id === newLinkId ? "border-v2-green" : "border-line", l.expired && "opacity-70")} data-link-id={l.id}>
                        <div className={cn(ROW, "justify-between")}>
                          <p className="min-w-0 truncate text-[13.5px] font-medium text-ink">{l.label || "Share link"}</p>
                          <Button variant="ghost" size="sm" disabled={busy} onClick={() => setConfirm({ kind: "link", grant: l })} aria-label={`Revoke link ${l.label ?? l.id}`}>
                            Revoke
                          </Button>
                        </div>
                        <p className={cn(SUBTLE, "mt-0.5")} title={l.expiresAt ? formatDate(l.expiresAt, { month: "short", day: "numeric", year: "numeric" }, display) : undefined}>
                          Created <span suppressHydrationWarning>{timeAgo(l.createdAt, now, display)}</span> · <span suppressHydrationWarning>{expiryText(l.expiresAt, l.expired, now)}</span> · {viewsText(l.viewCount)}
                        </p>
                        {!l.expired && l.url && (
                          <div className="mt-2 flex items-center gap-2">
                            <input
                              readOnly
                              value={l.url}
                              aria-label="Share link"
                              onFocus={(e) => e.currentTarget.select()}
                              className="min-w-0 flex-1 truncate rounded-md border border-line bg-paper-2 px-2 py-1.5 text-[12.5px] text-ink"
                            />
                            <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => void copy(l.url as string)}>
                              <CopyIcon size={14} />
                              Copy
                            </Button>
                          </div>
                        )}
                        {!l.expired && (
                          <div className="mt-2">
                            <Switch
                              label="Allow PDF download"
                              checked={l.allowDownload === true}
                              disabled={busy}
                              onCheckedChange={(v) => void changeDownload(l, v)}
                            />
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                {creating && (
                  <form
                    className="mt-2 flex flex-col gap-2 rounded-xl border border-line p-3"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void makeLink();
                    }}
                  >
                    <Field label="Label (optional)" className="mb-0" hint="A note for yourself, e.g. Sent to recruiter at Acme.">
                      <Input value={linkLabel} maxLength={MAX_LABEL} onChange={(e) => setLinkLabel(e.target.value)} />
                    </Field>
                    <Field
                      label="Link ends (optional)"
                      className="mb-0"
                      hint={share.linkDefaultDays > 0 ? `Leave empty and it works for ${share.linkDefaultDays} days.` : "Leave empty and it never expires."}
                    >
                      <Input type="date" min={tomorrow()} value={linkExpiry} onChange={(e) => setLinkExpiry(e.target.value)} />
                    </Field>
                    <Switch label="Allow PDF download" checked={linkDownload} onCheckedChange={setLinkDownloadAllowed} />
                    {linkError && (
                      <p role="alert" className="text-[13px] text-danger-text">
                        {linkError}
                      </p>
                    )}
                    <div className="flex items-center gap-2">
                      <Button type="submit" variant="accent" size="sm" disabled={busy}>
                        Create link
                      </Button>
                      <Button type="button" variant="ghost" size="sm" onClick={() => setCreating(false)}>
                        Cancel
                      </Button>
                    </div>
                  </form>
                )}
              </div>
            )}

            {/* Activity */}
            <div data-testid="activity-row" className={cn(ROW, "justify-between")}>
              <p className="min-w-0 text-[13.5px] text-ink">
                <span className="font-semibold">Activity</span>
                <span className="text-ink-soft">
                  {" · "}
                  {viewers === 0 ? "Not viewed yet" : `Viewed ${viewers} ${viewers === 1 ? "time" : "times"}`}
                  {lastView ? (
                    <>
                      {" · last by "}
                      {lastView.viewerLabel} <span suppressHydrationWarning>{timeAgo(lastView.viewedAt, now, display)}</span>
                    </>
                  ) : null}
                </span>
              </p>
              {viewers > 0 && (
                <button ref={seeAllRef} type="button" className={LINK_BTN} onClick={() => setViewsOpen(true)}>
                  See all
                </button>
              )}
            </div>
          </div>
        )}
      </section>
      )}

      {/* 4. About */}
      <section aria-labelledby="rb-set-about" className={CARD}>
        <h3 id="rb-set-about" className={cn(H3, "mb-2")}>
          About
        </h3>
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-[13.5px]">
          <dt className="text-muted">Source</dt>
          <dd className="min-w-0 text-ink">
            {sourceLine(meta, templateName)}
            {needsApproval && (
              <Button variant="ghost" size="sm" className="ml-2" disabled title="Approving marketer-made resumes arrives with the marketer workspace">
                Approve
              </Button>
            )}
          </dd>
          <dt className="text-muted">Created</dt>
          <dd className="text-ink" suppressHydrationWarning>
            {fmt(meta.createdAt)}
            {by(meta.createdBy)}
          </dd>
          <dt className="text-muted">Last modified</dt>
          <dd className="text-ink" suppressHydrationWarning>
            {fmt(meta.updatedAt)}
            {by(meta.updatedBy)}
          </dd>
          {built && (
            <>
              <dt className="text-muted">Last PDF</dt>
              <dd className="text-ink" suppressHydrationWarning>
                {lastPdf ? fmt(lastPdf) : "Not made yet"}
              </dd>
              <dt className="text-muted">Score</dt>
              <dd className="text-ink">{score !== null && score !== undefined ? `${score}%` : "Not scored yet"}</dd>
            </>
          )}
        </dl>
        {meta.hasOriginal && caps.downloadOriginal && (
          <a
            href={`/api/resumes/${resumeId}/original`}
            download
            className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl border border-line px-3 text-[13.5px] font-semibold text-ink hover:bg-paper-2 sm:min-h-9"
          >
            <DownloadIcon size={15} />
            Download original
          </a>
        )}
      </section>

      {/* 5. Danger */}
      {(caps.archiveResume || caps.deleteResume) && (
      <section aria-labelledby="rb-set-danger" className={cn(CARD, "border-danger/30")}>
        <h3 id="rb-set-danger" className={cn(H3, "mb-1 text-danger-text")}>
          Danger zone
        </h3>
        <p className={cn(SUBTLE, "mb-3")}>Archiving keeps everything and hides the resume from your active list. Deleting removes it for good.</p>
        <div className="flex flex-wrap items-center gap-2">
          {caps.archiveResume && (
            <Button variant="ghost" disabled={busy} onClick={() => setConfirm({ kind: "archive" })} className="min-h-11 sm:min-h-9">
              {archived ? "Unarchive" : "Archive"}
            </Button>
          )}
          {caps.deleteResume && (
            <Button variant="danger" disabled={busy} onClick={() => setConfirm({ kind: "delete" })} className="min-h-11 sm:min-h-9">
              Delete
            </Button>
          )}
        </div>
        {dangerError && (
          <p role="alert" className="mt-3 text-[13px] text-danger-text">
            {dangerError}
          </p>
        )}
      </section>
      )}

      <p key={announce?.n ?? 0} role="status" aria-live="polite" className="sr-only">
        {announce?.text ?? ""}
      </p>

      <BodyPortal>
        <ViewsSheet open={viewsOpen} resumeId={resumeId} phone={phone} onClose={() => setViewsOpen(false)} returnFocusTo={seeAllRef} />
        <ConfirmDialog
          open={confirm !== null && confirmWords !== null}
          title={confirmWords?.title ?? ""}
          description={confirmWords?.description}
          confirmLabel={confirmWords?.confirm ?? "Confirm"}
          danger={confirmWords?.danger}
          busy={busy}
          onConfirm={() => void runConfirmed()}
          onCancel={() => setConfirm(null)}
        />
      </BodyPortal>
    </div>
  );
}
