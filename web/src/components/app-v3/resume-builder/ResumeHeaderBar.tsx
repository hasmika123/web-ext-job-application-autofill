"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  CalendarIcon,
  CheckIcon,
  ChevronDownIcon,
  ClockIcon,
  Dialog,
  DownloadIcon,
  FileTextIcon,
  IconButton,
  Input,
  LayersIcon,
  LockIcon,
  Menu,
  MoreVerticalIcon,
  PencilIcon,
  Popover,
  SavedTick,
  StarIcon,
  Tooltip,
  UsersIcon,
  cn,
  useSavedFlash,
  useToast,
} from "@kiwiply/ui";
import type { MenuEntry } from "@kiwiply/ui";
import { formatDate, timeAgo } from "@/lib/dates";
import { capabilitiesOf, type ResumeBuilderConfig } from "@/lib/resume-builder-config.shared";
import type { CheckpointResult, ResumeDocDTO } from "@/lib/resume-doc";
import { duplicateResume } from "@/lib/resume-list-api";
import {
  createCheckpoint,
  deleteResume,
  detachResume,
  getAccess,
  getLineage,
  getMeta,
  patchMeta,
  restoreVersion,
  revokeAccess,
  type ResumeLineage,
  type ResumeMeta,
  type ResumeVersion,
} from "@/lib/resume-meta";
import { useDateDisplay } from "@/lib/use-date-display";
import { useBuilderEnv } from "./builderEnv";
import ConfirmDialog from "./ConfirmDialog";
import { RecruiterPanel, VersionPanel, VisibilityPanel } from "./HeaderPanels";
import {
  UNTITLED,
  defaultVersionName,
  modifiedTitle,
  ownerLoginOf,
  recruiterLabel,
  typeLabel,
  typeShortLabel,
  versionChipLabel,
  visibilityLabel,
} from "./headerBar";
import SyncDiffSheet from "./SyncDiffSheet";
import VersionCompareSheet from "./VersionCompareSheet";
import VersionsSheet from "./VersionsSheet";
import { UNDO_TOAST_MS } from "./uiTiming";
import type { Viewport } from "./state/ui";

/** The chips of row 2 and the type pill share one look (DESIGN 10.16); `min-h-11` on touch, `min-h-9` from `sm`. */
const CHIP =
  "inline-flex min-h-11 flex-none items-center gap-2 whitespace-nowrap rounded-xl border border-v2-line bg-paper px-3 text-[13.5px] font-medium text-ink transition-colors hover:bg-paper-2 " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-blue disabled:opacity-60 sm:min-h-9";
const PLAIN = "inline-flex flex-none items-center gap-2 whitespace-nowrap text-[13.5px] text-v2-ink-soft";
// Only used when an older API does not send `share` / `versions` in the builder config (the API's declared defaults).
const FALLBACK_MAX_LINKS = 3;
const FALLBACK_RETENTION_AUTO = 30;
// config-literal-ok: the editor's relative-time repaint tick (display only), not a builder timing
const NOW_TICK_MS = 60_000;

type Pending =
  | { kind: "private" }
  | { kind: "recruitersOff" }
  | { kind: "revokePeople" }
  | { kind: "detach" }
  | { kind: "delete" }
  | { kind: "restore"; version: ResumeVersion };

export interface ResumeHeaderBarProps {
  resumeId: number;
  /** The resume's metadata read on the server; null = the bar reads it itself once mounted. */
  initialMeta: ResumeMeta | null;
  /** The name to show until the metadata arrives (the document's label). */
  fallbackName: string;
  config: ResumeBuilderConfig;
  /** The editor's layout class: row 2 shortens and scrolls as the room shrinks (DESIGN 10.16 "Responsive"). */
  viewport: Viewport;
  /** When the editor last saved (epoch ms): "Last modified" never reads older than the user's own save. */
  savedAt: number | null;
  /**
   * Saves what is pending and says whether the server now has the latest content. Server-side actions that read or
   * replace the saved document (Compare, Restore, Save as version, Pull changes) run only when it says yes. Stable.
   */
  ensureSaved: () => Promise<boolean>;
  /** Restore / Pull changes replaced the document on the server: the editor adopts this one. */
  onDocReplaced: (dto: ResumeDocDTO) => void;
  /** The server wrote something the editor's PDF status should notice (a version was saved, a restore). */
  onServerChange?: () => void;
  /**
   * Version ▾ -> Save version… (and the ⋮ entry): the editor flushes autosave, writes the named checkpoint and asks for
   * the PDF now (R3.3 `checkpointDoc`). Resolves to its result, or null when nothing was written. Without it the bar
   * writes the checkpoint itself (standalone use).
   */
  onSaveVersion?: (name?: string) => Promise<CheckpointResult | null>;
  /** Bumped when the editor wrote a version itself (Ctrl/Cmd+S): the history and the chip re-read. */
  versionsStamp?: number;
  /** The user's primary resume right now (null = unknown): "Set as primary" can then offer Undo. */
  primaryResumeId?: number | null;
  /** Opens the Tailor to Job panel. */
  onTailor: () => void;
  /** Opens Resume settings (R3.12): the header ⋮ entry and every "Manage in Resume settings" link. */
  onOpenSettings: () => void;
  /**
   * The resume's metadata as the editor holds it, shared with Resume settings: when it is a different object than the
   * one this bar last reported, the bar shows it (a rename or a share made in the settings sheet).
   */
  syncedMeta?: ResumeMeta | null;
  /** Every change this bar makes to the metadata, so the editor can hand it to Resume settings. */
  onMetaChange?: (meta: ResumeMeta) => void;
  className?: string;
}

/**
 * The resume header bar, above the document (DESIGN 10.16, board `editor-metadata-header.webp`). Row 1: the resume's name
 * with an in-place rename, the Master / Tailored type menu (the family: tailored copies, Open master, Pull changes from
 * master, Make this a master) and the ⋮ menu. Row 2: Created · Last modified · Visibility ▾ · Primary · Shared with
 * Recruiters ▾ · Version ▾. Everything here talks to `/api/resumes/:id/meta|lineage|access|doc/versions` through
 * `@/lib/resume-meta`; the name's truth is `resume.label` (DECISIONS #15), so a rename is `PATCH meta`, never the document.
 */
export default function ResumeHeaderBar({
  resumeId,
  initialMeta,
  fallbackName,
  config,
  viewport,
  savedAt,
  ensureSaved,
  onDocReplaced,
  onServerChange,
  onSaveVersion,
  versionsStamp = 0,
  primaryResumeId = null,
  onTailor,
  onOpenSettings: openSettings,
  syncedMeta = null,
  onMetaChange,
  className,
}: ResumeHeaderBarProps) {
  const router = useRouter();
  const toast = useToast();
  const env = useBuilderEnv();
  // What this session may do (the API decides and refuses the same actions): the one header bar hides the rest.
  const caps = capabilitiesOf(config);
  const display = useDateDisplay();
  const phone = viewport === "phone";
  const scrolling = viewport === "phone" || viewport === "tablet";
  const short = viewport === "desktop";

  const [meta, setMetaState] = useState<ResumeMeta | null>(initialMeta);
  // The metadata is shared with Resume settings: what this bar sets is reported up, what the sheet sets comes back in.
  const [reported, setReported] = useState<ResumeMeta | null>(initialMeta);
  const setMeta = useCallback(
    (next: ResumeMeta) => {
      setReported(next);
      setMetaState(next);
      onMetaChange?.(next);
    },
    [onMetaChange],
  );
  if (syncedMeta && syncedMeta !== reported) {
    setReported(syncedMeta);
    setMetaState(syncedMeta);
  }
  const [loadFailed, setLoadFailed] = useState(false);
  const [lineage, setLineage] = useState<ResumeLineage | null>(null);
  const [newestVersion, setNewestVersion] = useState<number | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<Pending | null>(null);
  const [saveVersionOpen, setSaveVersionOpen] = useState(false);
  const [versionName, setVersionName] = useState("");
  const [compare, setCompare] = useState<ResumeVersion | null>(null);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [syncOpen, setSyncOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const nameInput = useRef<HTMLInputElement>(null);
  const renameButton = useRef<HTMLButtonElement>(null);
  // The inline "saved" tick beside whichever control just persisted a change (DECISIONS #32).
  const saved = useSavedFlash<"name" | "type" | "visibility" | "primary" | "recruiters" | "version">();
  const flash = saved.flash;
  // Who is primary right now (starts as the server said; follows this bar's own changes), so Set as primary can be undone.
  const [primaryId, setPrimaryId] = useState<number | null>(primaryResumeId);

  const ownerLogin = ownerLoginOf(meta);
  const maxLinks = config.share?.maxLinks ?? FALLBACK_MAX_LINKS;
  const retentionAuto = config.versions?.retentionAuto ?? FALLBACK_RETENTION_AUTO;
  const shareLinksOn = (config.features.shareLinks ?? true) && caps.shareLinks;

  /* ── data ─────────────────────────────────────────────────────────────────────────────── */
  const refresh = useCallback(async () => {
    const res = await getMeta(resumeId);
    if (res.kind === "ok") {
      setMeta(res.value);
      setNewestVersion(null); // the fresh metadata carries the truth again
      setLoadFailed(false);
    } else setLoadFailed(true);
    setNow(Date.now());
  }, [resumeId, setMeta]);

  useEffect(() => {
    if (initialMeta) return;
    // Reading the metadata is this effect's whole job (the state is filled when the answer arrives).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [initialMeta, refresh]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), NOW_TICK_MS);
    return () => clearInterval(t);
  }, []);

  // The editor wrote a version on its own (Ctrl/Cmd+S): re-read the history and the chip, and say it stuck.
  const stampSeen = useRef(versionsStamp);
  useEffect(() => {
    if (versionsStamp === stampSeen.current) return;
    stampSeen.current = versionsStamp;
    // Mirroring a counter the editor bumped into this bar's own reload key is this effect's whole job.
    setReloadKey((k) => k + 1);
    void refresh().then(() => flash("version"));
  }, [versionsStamp, refresh, flash]);

  // The family, for the type menu: read when the resume has one (tailored copies, or a master with copies).
  const familyKey = meta ? `${meta.role}:${meta.lineage.children}:${meta.lineage.masterChanged}` : null;
  useEffect(() => {
    if (!familyKey) return;
    let cancelled = false;
    void getLineage(resumeId).then((res) => {
      if (!cancelled) setLineage(res.kind === "ok" ? res.value : null);
    });
    return () => {
      cancelled = true;
    };
  }, [resumeId, familyKey]);

  /* ── helpers ──────────────────────────────────────────────────────────────────────────── */
  /** Duplicate (same call as the list card's menu): save what is pending, copy it, open the copy; a plan cap is said, not hidden. */
  const duplicate = async () => {
    if (!(await ensureSaved())) {
      toast({ title: "Couldn't duplicate yet", description: "Your latest changes aren't saved. Fix the save problem shown above, then try again.", variant: "error" });
      return;
    }
    const res = await duplicateResume(resumeId);
    if (res.kind === "ok") {
      toast({ title: "Duplicated", description: "You're now editing the copy.", variant: "success" });
      router.push(env.editorHref(res.id));
    } else if (res.kind === "limit") {
      toast({ title: "Resume limit reached", description: res.message, variant: "error" });
    } else {
      toast({ title: "Couldn't duplicate the resume", description: res.message, variant: "error" });
    }
  };

  /** "Download original": the file this resume was made from, straight from the owner-scoped BFF route. */
  const downloadOriginal = () => {
    const a = document.createElement("a");
    a.href = `/api/resumes/${resumeId}/original`;
    a.download = "";
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  /** Runs one server change: busy while it runs, a toast when it fails; the caller uses what comes back. */
  const act = useCallback(
    async <T,>(fn: () => Promise<{ kind: "ok"; value: T } | { kind: "error"; message: string }>, failTitle: string): Promise<{ ok: true; value: T } | { ok: false }> => {
      if (busy) return { ok: false };
      setBusy(true);
      const res = await fn();
      setBusy(false);
      if (res.kind === "error") {
        toast({ title: failTitle, description: res.message, variant: "error" });
        return { ok: false };
      }
      return { ok: true, value: res.value };
    },
    [busy, toast],
  );

  const patch = async (body: Record<string, unknown>, failTitle = "Couldn't save that change") => {
    const r = await act(() => patchMeta(resumeId, body), failTitle);
    if (r.ok) setMeta(r.value);
    return r.ok;
  };

  /* ── rename ───────────────────────────────────────────────────────────────────────────── */
  const name = meta?.name ?? fallbackName;
  const startRename = () => {
    if (!meta || renaming) return;
    setDraft(meta.name);
    setRenaming(true);
  };
  useEffect(() => {
    if (renaming) {
      nameInput.current?.focus();
      nameInput.current?.select();
    }
  }, [renaming]);

  const finishRename = async (commit: boolean) => {
    if (!renaming) return;
    setRenaming(false);
    renameButton.current?.focus();
    if (!commit || !meta) return;
    const next = draft.trim() || UNTITLED;
    if (next === meta.name) return;
    if (await patch({ name: next }, "Couldn't rename the resume")) flash("name");
  };
  const onNameKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void finishRename(true);
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      void finishRename(false);
    }
  };

  /* ── actions ──────────────────────────────────────────────────────────────────────────── */
  /** Takes back a change by writing the earlier value (the Undo of a toast); says so on failure. */
  const undoPatch = async (body: Record<string, unknown>, tick: "visibility" | "recruiters") => {
    const r = await patchMeta(resumeId, body);
    if (r.kind === "error") {
      toast({ title: "Couldn't undo that", description: r.message, variant: "error" });
      return;
    }
    setMeta(r.value);
    flash(tick);
  };

  const setPrimary = async () => {
    if (!meta || meta.primary) return;
    const prev = primaryId !== null && primaryId !== resumeId ? primaryId : null;
    if (!(await patch({ primary: true }, "Couldn't set the primary resume"))) return;
    setPrimaryId(resumeId);
    flash("primary");
    toast({
      title: "Now your primary resume",
      description: "The extension attaches it by default.",
      variant: "success",
      duration: UNDO_TOAST_MS,
      // Undo hands "primary" back to the resume that had it (a resume cannot un-primary itself: another one must take over).
      action: prev === null ? undefined : { label: "Undo", onClick: () => void undoPrimary(prev) },
    });
  };
  const undoPrimary = async (prev: number) => {
    const r = await patchMeta(prev, { primary: true });
    if (r.kind === "error") {
      toast({ title: "Couldn't undo that", description: r.message, variant: "error" });
      return;
    }
    setPrimaryId(prev);
    await refresh();
    flash("primary");
  };

  /** Private, undoable when nobody else holds a grant (the grants of "Specific people" cannot be given back, so that case still asks). */
  const makePrivate = async () => {
    if (!meta) return;
    const wasOrg = meta.visibility.mode === "ORG";
    if (!(await patch({ visibility: "PRIVATE" }))) return;
    flash("visibility");
    toast({
      title: "Now private",
      description: "Only you can see this resume.",
      variant: "success",
      duration: UNDO_TOAST_MS,
      action: wasOrg ? { label: "Undo", onClick: () => void undoPatch({ shareWithOrg: true }, "visibility") } : undefined,
    });
  };

  /** Archive / unarchive: no confirm, an Undo toast (the resume goes to Archived and comes back untouched). */
  const archive = async () => {
    if (!meta) return;
    const next = !meta.archived;
    if (!(await patch({ archived: next }, next ? "Couldn't archive the resume" : "Couldn't unarchive the resume"))) return;
    if (!next) {
      toast({ title: "Resume unarchived", variant: "success" });
      return;
    }
    toast({
      title: "Resume archived",
      description: `"${name}" moved to Archived.`,
      variant: "success",
      duration: UNDO_TOAST_MS,
      action: {
        label: "Undo",
        onClick: () =>
          void patchMeta(resumeId, { archived: false }).then((r) =>
            r.kind === "error" ? toast({ title: "Couldn't undo that", description: r.message, variant: "error" }) : toast({ title: "Resume restored", variant: "success" }),
          ),
      },
    });
    router.push(env.listHref);
  };

  const confirm = async () => {
    const p = pending;
    if (!p || !meta) return;
    if (p.kind === "private") {
      if (await patch({ visibility: "PRIVATE" })) {
        flash("visibility");
        toast({ title: "Now private", description: "Only you can see this resume.", variant: "success" });
      }
    } else if (p.kind === "recruitersOff") {
      if (await patch({ recruiterSharing: false })) {
        flash("recruiters");
        toast({ title: "Recruiter links turned off", description: "Everyone with a link has lost access.", variant: "success" });
      }
    } else if (p.kind === "revokePeople") {
      const r = await act(async () => {
        const access = await getAccess(resumeId);
        if (access.kind === "error") return access;
        for (const g of access.value.grants) {
          const res = await revokeAccess(resumeId, g.id);
          if (res.kind === "error") return res;
        }
        return { kind: "ok" as const, value: null };
      }, "Couldn't remove everyone");
      if (r.ok) await refresh();
    } else if (p.kind === "detach") {
      const r = await act(() => detachResume(resumeId), "Couldn't make this a master");
      if (r.ok) {
        setMeta(r.value);
        flash("type");
        toast({ title: "Now a master resume", description: "It keeps its content and job, and no longer follows its master.", variant: "success" });
      }
    } else if (p.kind === "delete") {
      const r = await act(() => deleteResume(resumeId), "Couldn't delete the resume");
      if (r.ok) router.push(env.listHref);
    } else if (p.kind === "restore") {
      await doRestore(p.version);
    }
    setPending(null);
  };

  const doRestore = async (v: ResumeVersion) => {
    if (!(await ensureSaved())) {
      toast({ title: "Couldn't restore yet", description: "Your latest changes aren't saved. Fix the save problem shown above, then try again.", variant: "error" });
      return;
    }
    const r = await act(() => restoreVersion(resumeId, v.versionNo), "Couldn't restore that version");
    if (!r.ok) return;
    setCompare(null);
    onDocReplaced(r.value);
    setReloadKey((k) => k + 1);
    onServerChange?.();
    await refresh();
    flash("version");
    toast({ title: `Restored v${v.versionNo}`, description: "What you had before is saved as its own version.", variant: "success" });
  };

  /** Writes a named version (empty name = the server's MANUAL one). True when it was saved. */
  const saveVersionNamed = async (raw: string): Promise<boolean> => {
    const trimmed = raw.trim();
    if (onSaveVersion) {
      // The editor flushes autosave, writes the checkpoint (R3.3) and asks for the PDF now; it toasts its own failures.
      const cp = await onSaveVersion(trimmed || undefined);
      if (!cp || cp.kind !== "ok") return false;
      setReloadKey((k) => k + 1);
      onServerChange?.();
      await refresh();
      flash("version");
      toast({ title: `Version ${cp.versionNo} saved`, description: trimmed || undefined, variant: "success" });
      return true;
    }
    if (!(await ensureSaved())) {
      toast({ title: "Couldn't save the version yet", description: "Your latest changes aren't saved. Fix the save problem shown above, then try again.", variant: "error" });
      return false;
    }
    const r = await act(() => createCheckpoint(resumeId, trimmed || undefined), "Couldn't save the version");
    if (!r.ok) return false;
    setReloadKey((k) => k + 1);
    onServerChange?.();
    await refresh();
    flash("version");
    toast({ title: `Saved as v${r.value.versionNo}`, description: trimmed || undefined, variant: "success" });
    return true;
  };
  /** The dialog behind the ⋮ entry (phone overflow, keyboard): same call as the Version menu's inline field. */
  const saveVersion = async () => {
    if (await saveVersionNamed(versionName)) {
      setSaveVersionOpen(false);
      setVersionName("");
    }
  };

  const recruitersOn = async () => {
    if (!meta) return;
    const r = await act(() => patchMeta(resumeId, { recruiterSharing: true }), "Couldn't create the link");
    if (r.ok) {
      setMeta(r.value);
      flash("recruiters");
      toast({
        title: "Link created",
        description: "Anyone with it can open this resume until you turn it off.",
        variant: "success",
        duration: UNDO_TOAST_MS,
        action: { label: "Undo", onClick: () => void undoPatch({ recruiterSharing: false }, "recruiters") },
      });
    }
  };

  const toggleOrg = async () => {
    if (!meta) return;
    const on = !meta.shareWithOrg;
    if (!(await patch({ shareWithOrg: on }))) return;
    flash("visibility");
    toast({
      title: on ? "Shared with your organization" : "No longer shared with your organization",
      variant: "success",
      duration: UNDO_TOAST_MS,
      action: { label: "Undo", onClick: () => void undoPatch({ shareWithOrg: !on }, "visibility") },
    });
  };

  const peopleRow = () => {
    if (!meta) return;
    if (meta.visibility.people > 0) setPending({ kind: "revokePeople" });
    else openSettings();
  };

  const askVisibilityPrivate = (close: () => void) => {
    close();
    if (!meta || meta.visibility.mode === "PRIVATE") return;
    if (meta.visibility.people > 0) setPending({ kind: "private" });
    else void makePrivate();
  };

  /* ── derived text ─────────────────────────────────────────────────────────────────────── */
  const savedIso = savedAt !== null ? new Date(savedAt).toISOString() : null;
  // "Last modified" never reads older than the user's own latest save in this session.
  const savedIsNewer = savedIso !== null && (!meta?.updatedAt || Date.parse(savedIso) > Date.parse(meta.updatedAt));
  const modifiedIso = savedIsNewer ? savedIso : (meta?.updatedAt ?? null);
  const createdText = meta ? formatDate(meta.createdAt, { month: "short", day: "numeric", year: "numeric" }, display) : "";
  const modifiedAbsolute = modifiedIso ? formatDate(modifiedIso, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }, display) : "";
  const modifiedAgo = timeAgo(modifiedIso, now, display);
  const modifiedBy = !meta ? "" : savedIsNewer ? "by you" : modifiedTitle(meta, "", ownerLogin);
  const modifiedHint = modifiedAbsolute ? `${modifiedAbsolute} ${modifiedBy}` : modifiedBy;
  const versionCurrent = newestVersion ?? meta?.version.current ?? 0;
  const jobOf = (j: { title: string; company: string } | null | undefined) => (j ? `${j.title} @ ${j.company}` : null);

  /* ── menus ────────────────────────────────────────────────────────────────────────────── */
  const buildTypeItems = (): MenuEntry[] => {
    if (!meta) return [];
    const items: MenuEntry[] = [];
    const rowTime = (iso: string | null) => (iso ? ` · edited ${timeAgo(iso, now, display)}` : "");
    if (meta.role === "MASTER") {
      items.push({
        label: (
          <span className="flex flex-col">
            <span className="flex items-center gap-1.5 font-semibold">
              <CheckIcon size={14} /> Master Resume
            </span>
            <span className="text-[12px] text-muted">This is the base you tailor from</span>
          </span>
        ),
        onSelect: () => {},
        disabled: true,
      });
      items.push({ separator: true }, { heading: "Tailored versions" });
      const kids = lineage?.children ?? [];
      if (kids.length === 0) items.push({ label: "No tailored versions yet", onSelect: () => {}, disabled: true });
      for (const c of kids) {
        items.push({
          label: (
            <span className="flex items-center gap-2">
              <span className="min-w-0 truncate">{`${jobOf(c.job) ?? c.name}${rowTime(c.updatedAt)}`}</span>
              {c.masterChanged && <span className="flex-none rounded-full bg-v2-amber-soft px-1.5 py-0.5 text-[10.5px] font-semibold text-ink">Master changed</span>}
            </span>
          ),
          onSelect: () => router.push(env.editorHref(c.id)),
        });
      }
      if (config.features.tailor) items.push({ separator: true }, { label: "+ Tailor for a job…", onSelect: onTailor });
    } else {
      const tailoredFor = jobOf(meta.source.tailoredFrom?.job);
      items.push({ heading: tailoredFor ? `Tailored for ${tailoredFor}` : "Tailored resume" });
      items.push({ label: `Open master${lineage ? `: ${lineage.master.name}` : ""}`, onSelect: () => router.push(env.editorHref(meta.lineage.masterId)) });
      for (const c of (lineage?.children ?? []).filter((x) => x.id !== resumeId)) {
        items.push({ label: `${jobOf(c.job) ?? c.name}${rowTime(c.updatedAt)}`, onSelect: () => router.push(env.editorHref(c.id)) });
      }
      items.push({ separator: true });
      items.push({ label: meta.lineage.masterChanged ? "Pull changes from master" : "Pull changes from master (up to date)", onSelect: () => setSyncOpen(true), disabled: !meta.lineage.masterChanged });
      items.push({ label: "Make this a master", onSelect: () => setPending({ kind: "detach" }) });
    }
    return items;
  };

  const buildKebabItems = (): MenuEntry[] => {
    if (!meta) return [];
    const items: MenuEntry[] = [];
    if (phone) {
      items.push({ heading: "About" });
      items.push({ label: `Created ${createdText}`, onSelect: () => {}, disabled: true });
      items.push({ label: `Last modified ${modifiedAgo} ${modifiedBy}`, onSelect: () => {}, disabled: true });
      items.push({ separator: true });
    }
    if (caps.rename) items.push({ label: "Rename", icon: <PencilIcon size={15} />, onSelect: startRename });
    if (caps.duplicate) items.push({ label: "Duplicate", onSelect: () => void duplicate() });
    if (!meta.primary && caps.setPrimary) items.push({ label: "Set as primary", icon: <StarIcon size={15} />, onSelect: () => void setPrimary() });
    if (config.features.tailor && caps.tailor) items.push({ label: "Tailor for a job…", onSelect: onTailor });
    if (caps.versionRestore) {
      items.push({
        label: "Save version…",
        onSelect: () => {
          setVersionName(defaultVersionName(versionCurrent + 1));
          setSaveVersionOpen(true);
        },
      });
      items.push({ label: "Version history", onSelect: () => setVersionsOpen(true) });
    }
    if (meta.hasOriginal && caps.downloadOriginal) items.push({ label: "Download original", icon: <DownloadIcon size={15} />, onSelect: downloadOriginal });
    // Resume settings holds the name, tags, visibility, sharing, archive and delete: none of it is acting-for material
    if (caps.mode !== "marketer-act-for") {
      if (items.length > 0) items.push({ separator: true });
      items.push({ label: "Resume settings…", onSelect: openSettings });
    }
    if (caps.archiveResume) items.push({ label: meta.archived ? "Unarchive" : "Archive", onSelect: () => void archive() });
    if (caps.deleteResume) items.push({ label: "Delete", onSelect: () => setPending({ kind: "delete" }), danger: true });
    return items;
  };

  /* ── pieces ───────────────────────────────────────────────────────────────────────────── */
  /** A chip with its inline "saved" tick (tucked inside the chip's corner so a scrolling row never clips it). */
  const withTick = (id: "type" | "visibility" | "primary" | "recruiters" | "version", node: ReactNode) => (
    <span className="relative inline-flex flex-none">
      {node}
      <SavedTick flash={saved} id={id} className="absolute -right-1 top-0 z-10" />
    </span>
  );
  const typeChip = meta && (
    <Menu
      align="start"
      items={buildTypeItems()}
      menuClassName="min-w-[16rem] max-w-[22rem]"
      trigger={
        <span className={cn(CHIP, "border-v2-blue/30 bg-v2-blue-soft text-v2-blue hover:bg-v2-blue-soft/70")}>
          <LayersIcon size={16} />
          {phone ? typeShortLabel(meta.role) : typeLabel(meta.role)}
          <ChevronDownIcon size={14} />
        </span>
      }
    />
  );

  const dates = meta && !phone && (
    <>
      <span className={PLAIN}>
        <CalendarIcon size={16} className="text-v2-muted" />
        <span suppressHydrationWarning>{short ? createdText : `Created ${createdText}`}</span>
      </span>
      <span className={PLAIN} title={modifiedHint}>
        <ClockIcon size={16} className="text-v2-muted" />
        <span suppressHydrationWarning>{short ? modifiedAgo : `Last modified ${modifiedAgo}`}</span>
      </span>
    </>
  );

  const visibilityChip = meta && (
    <Popover
      label="Visibility"
      disabled={busy}
      trigger={(t) => (
        <button ref={t.ref} {...t.props} className={CHIP}>
          <LockIcon size={16} className="text-v2-ink-soft" />
          {visibilityLabel(meta.visibility)}
          <ChevronDownIcon size={14} />
        </button>
      )}
    >
      {({ close }) => (
        <VisibilityPanel
          visibility={meta.visibility}
          busy={busy}
          onPrivate={() => askVisibilityPrivate(close)}
          onToggleOrg={() => void toggleOrg()}
          onPeople={() => {
            close();
            peopleRow();
          }}
          onManage={() => {
            close();
            openSettings();
          }}
        />
      )}
    </Popover>
  );

  const primaryChip =
    meta &&
    (meta.primary ? (
      <span className={cn(CHIP, "cursor-default border-v2-green/40 bg-v2-green-soft font-semibold text-v2-green-ink hover:bg-v2-green-soft")}>
        <StarIcon size={16} className="fill-current" />
        {short || phone ? "Primary" : "Primary Resume"}
      </span>
    ) : caps.setPrimary ? (
      <button type="button" className={CHIP} disabled={busy} onClick={() => void setPrimary()}>
        <StarIcon size={16} className="text-v2-muted" />
        Set as primary
      </button>
    ) : null);

  const recruiterChip =
    meta &&
    shareLinksOn && (
      <Popover
        label="Shared with Recruiters"
        disabled={busy}
        trigger={(t) => (
          <button ref={t.ref} {...t.props} className={CHIP}>
            <UsersIcon size={16} className="text-v2-ink-soft" />
            {recruiterLabel(meta.recruiterSharing.on, short || scrolling)}
            <ChevronDownIcon size={14} />
          </button>
        )}
      >
        {({ close }) => (
          <RecruiterPanel
            resumeId={resumeId}
            meta={meta}
            maxLinks={maxLinks}
            display={display}
            now={now}
            busy={busy}
            onTurnOn={() => void recruitersOn()}
            onTurnOff={() => {
              close();
              setPending({ kind: "recruitersOff" });
            }}
            onChanged={() => void refresh()}
            onManage={() => {
              close();
              openSettings();
            }}
          />
        )}
      </Popover>
    );

  const versionChip = meta && (
    <Popover
      label="Versions"
      align="end"
      trigger={(t) => (
        <button ref={t.ref} {...t.props} className={cn(CHIP, "bg-v2-canvas")}>
          {versionChipLabel(versionCurrent, short || scrolling)}
          <ChevronDownIcon size={14} />
        </button>
      )}
    >
      {({ close }) => (
        <VersionPanel
          resumeId={resumeId}
          ownerLogin={ownerLogin}
          display={display}
          reloadKey={reloadKey}
          onLoaded={setNewestVersion}
          onCompare={(v) => {
            close();
            setCompare(v);
          }}
          onRestore={(v) => {
            close();
            setPending({ kind: "restore", version: v });
          }}
          defaultName={defaultVersionName(versionCurrent + 1)}
          onSaveVersion={async (versionLabel) => {
            const ok = await saveVersionNamed(versionLabel);
            if (ok) close();
            return ok;
          }}
          onAll={() => {
            close();
            setVersionsOpen(true);
          }}
        />
      )}
    </Popover>
  );

  /* ── dialogs' words ───────────────────────────────────────────────────────────────────── */
  const peopleN = meta?.visibility.people ?? 0;
  const dialog: { title: string; description?: string; confirm: string; danger?: boolean } | null = !pending
    ? null
    : pending.kind === "private"
      ? {
          title: "Make this resume private?",
          description:
            peopleN > 0
              ? `Remove ${peopleN} ${peopleN === 1 ? "person" : "people"} and stop sharing with your organization?`
              : "Stop sharing with your organization? Only you will see this resume.",
          confirm: "Make private",
        }
      : pending.kind === "recruitersOff"
        ? { title: "Turn off recruiter links?", description: "Everyone with the link will lose access.", confirm: "Turn off", danger: true }
        : pending.kind === "revokePeople"
          ? { title: "Remove everyone?", description: `${peopleN} ${peopleN === 1 ? "person" : "people"} will no longer be able to see this resume.`, confirm: "Remove everyone", danger: true }
          : pending.kind === "detach"
            ? { title: "Make this a master?", description: `It keeps its content and job, and stops following ${meta?.lineage.masterName ?? "its master"}.`, confirm: "Make this a master" }
            : pending.kind === "delete"
                ? { title: "Delete this resume?", description: `"${name}" and its versions are deleted for good. This can't be undone.`, confirm: "Delete", danger: true }
                : { title: `Restore v${pending.version.versionNo}?`, description: "Your current content is saved as a new version first.", confirm: "Restore" };

  const iconTile = (
    <span aria-hidden className="grid h-11 w-11 flex-none place-items-center rounded-xl bg-v2-blue-soft text-v2-blue">
      <FileTextIcon size={22} />
    </span>
  );

  return (
    <section aria-label="Resume details" data-viewport={viewport} className={cn("rounded-2xl border border-v2-line/70 bg-paper px-4 py-3 shadow-v2-soft", className)}>
      {/* row 1 */}
      <div className="flex items-center gap-3">
        {iconTile}
        {renaming ? (
          <Input
            ref={nameInput}
            value={draft}
            aria-label="Resume name"
            // config-literal-ok: meta.name maxLength is a server rule (ResumeMetaService.MAX_NAME_CHARS), not a builder tunable
            maxLength={200}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onNameKey}
            onBlur={() => void finishRename(true)}
            className="min-h-11 min-w-0 flex-1 font-display text-[22px] font-bold sm:min-h-0"
          />
        ) : (
          <h2 className="min-w-0 truncate font-display text-[22px] font-bold leading-tight text-ink" title={name}>
            {name}
          </h2>
        )}
        {!renaming && caps.rename && (
          <Tooltip content="Rename" side="bottom">
            <IconButton ref={renameButton} aria-label="Rename" onClick={startRename} disabled={!meta} className="h-11 w-11 flex-none sm:h-9 sm:w-9">
              <PencilIcon size={16} />
            </IconButton>
          </Tooltip>
        )}
        <SavedTick flash={saved} id="name" />
        {!phone && meta && withTick("type", typeChip)}
        <span className="flex-1" />
        {meta && buildKebabItems().length > 0 && (
          <Tooltip content="More actions" side="bottom">
            <Menu
              align="end"
              items={buildKebabItems()}
              trigger={
                <span data-rb-header-menu className="inline-flex h-11 w-11 flex-none items-center justify-center rounded-xl text-v2-ink-soft hover:bg-paper-2 hover:text-ink sm:h-9 sm:w-9">
                  <span className="sr-only">More actions</span>
                  <MoreVerticalIcon aria-hidden size={18} />
                </span>
              }
            />
          </Tooltip>
        )}
      </div>

      {/* row 2 */}
      {meta ? (
        <div
          role="group"
          aria-label="Resume status"
          className={cn("mt-3 flex items-center gap-x-3 gap-y-2", scrolling ? "scroll-slim -mx-1 flex-nowrap overflow-x-auto px-1 pb-1" : "flex-wrap")}
        >
          {phone && withTick("type", typeChip)}
          {dates}
          {caps.shareLinks && withTick("visibility", visibilityChip)}
          {primaryChip && withTick("primary", primaryChip)}
          {recruiterChip && withTick("recruiters", recruiterChip)}
          <span className={scrolling ? "" : "ml-auto"}>{caps.versionRestore && withTick("version", versionChip)}</span>
        </div>
      ) : (
        <p role="status" className="mt-3 text-[13px] text-muted">
          {loadFailed ? (
            <>
              Couldn&apos;t load this resume&apos;s details.{" "}
              <button type="button" onClick={() => void refresh()} className="font-semibold text-v2-blue hover:underline">
                Try again
              </button>
            </>
          ) : (
            "Loading details…"
          )}
        </p>
      )}

      {/* sheets, then dialogs (a dialog opened from a sheet must stack above it) */}
      <VersionCompareSheet
        open={compare !== null}
        resumeId={resumeId}
        version={compare}
        phone={phone}
        ensureSaved={ensureSaved}
        onRestore={(v) => setPending({ kind: "restore", version: v })}
        onClose={() => setCompare(null)}
      />
      <VersionsSheet
        open={versionsOpen}
        resumeId={resumeId}
        ownerLogin={ownerLogin}
        retentionAuto={retentionAuto}
        phone={phone}
        reloadKey={reloadKey}
        onCompare={(v) => setCompare(v)}
        onRestore={(v) => setPending({ kind: "restore", version: v })}
        onClose={() => setVersionsOpen(false)}
      />
      {meta && (
        <SyncDiffSheet
          open={syncOpen}
          resumeId={resumeId}
          masterName={meta.lineage.masterName}
          phone={phone}
          ensureSaved={ensureSaved}
          onApplied={(dto, n) => {
            setSyncOpen(false);
            onDocReplaced(dto);
            onServerChange?.();
            void refresh();
            toast({ title: `Applied ${n} ${n === 1 ? "change" : "changes"} from the master`, variant: "success" });
          }}
          onClose={() => setSyncOpen(false)}
        />
      )}

      <ConfirmDialog
        open={pending !== null && dialog !== null}
        title={dialog?.title ?? ""}
        description={dialog?.description}
        confirmLabel={dialog?.confirm ?? "Confirm"}
        danger={dialog?.danger}
        busy={busy}
        onConfirm={() => void confirm()}
        onCancel={() => setPending(null)}
      />

      <Dialog
        open={saveVersionOpen}
        onClose={() => setSaveVersionOpen(false)}
        title="Save version"
        description="Keep this exact state of your resume. Named versions are never removed."
        footer={
          <>
            <Button variant="ghost" onClick={() => setSaveVersionOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="accent" onClick={() => void saveVersion()} disabled={busy}>
              Save version
            </Button>
          </>
        }
      >
        <label className="block text-[13px] font-semibold text-ink" htmlFor="rb-version-name">
          Name (optional)
        </label>
        <Input
          id="rb-version-name"
          value={versionName}
          // config-literal-ok: a version name is at most 80 characters (ResumeDocVersionService.MAX_NAME_CHARS), a schema rule
          maxLength={80}
          placeholder="e.g. Sent to Acme"
          onChange={(e) => setVersionName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void saveVersion();
            }
          }}
          className="mt-1.5"
        />
      </Dialog>
    </section>
  );
}

