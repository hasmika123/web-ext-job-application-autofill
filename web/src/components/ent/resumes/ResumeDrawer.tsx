"use client";

/* eslint-disable react-hooks/set-state-in-effect -- data loader: the effect starts a fetch and the answer is stored (the pattern of the other admin pages) */

import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";
import {
  BottomSheet,
  Button,
  CalendarIcon,
  ClockIcon,
  Dialog,
  DownloadIcon,
  ErrorState,
  EyeIcon,
  FileTextIcon,
  MemberAvatar,
  PencilIcon,
  PrinterIcon,
  Select,
  ShieldIcon,
  SideSheet,
  Skeleton,
  StarIcon,
  Switch,
  UserIcon,
  buttonVariants,
  cn,
  useToast,
} from "@kiwiply/ui";
import {
  errorSentence,
  exportUrl,
  fileSizeText,
  formatDate,
  resumesApi,
  versionText,
  VISIBILITY_OPTIONS,
  type Approval,
  type ResumeDetail,
  type Visibility,
} from "@/lib/ent/resumes";
import { ApprovalPill } from "./parts";
import ResumePaper from "./ResumePaper";

export type DrawerMode = "push" | "overlay" | "sheet";

/** The board's secondary buttons: outlined in the brand colour. */
const OUTLINE = "border-accent text-accent-deep hover:bg-accent-soft";
const UNDO_MS = 9000; // config-literal-ok: how long an Undo stays offered (UI timing)

export interface ResumeDrawerProps {
  orgId: number | string;
  resumeId: number | null;
  mode: DrawerMode;
  onClose: () => void;
  /** The detail changed (primary, visibility, decision): the table row and the tiles refresh from it. */
  onChanged: (d: ResumeDetail) => void;
  /** Bumped by the page when something outside the drawer changed this resume. */
  reloadToken: number;
  returnFocusTo?: RefObject<HTMLElement | null>;
  /** The help card, shown at the foot of a docked drawer. */
  footer?: ReactNode;
  /** Where a resume made in the Resume Builder is edited (the Marketing workspace's builder route), or null when this viewer cannot edit it. */
  builderHref?: (rowId: number) => string | null;
}

type State = { status: "idle" } | { status: "loading" } | { status: "gone" } | { status: "error"; message: string } | { status: "ok"; detail: ResumeDetail };

function Field({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-2 text-[11px]">
      <span aria-hidden className="mt-0.5 flex-none text-[var(--ent-x-4b5a8a)]">
        {icon}
      </span>
      <div className="min-w-0">
        <dt className="text-[10px] text-[var(--ent-soft)]">{label}</dt>
        <dd className="min-w-0 break-words text-[11px] font-semibold text-[var(--ent-title)]">{children}</dd>
      </div>
    </div>
  );
}

function Loading() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading resume">
      <div className="flex items-center gap-3">
        <Skeleton className="h-14 w-14 rounded-full" />
        <div className="space-y-2">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-28" />
        </div>
      </div>
      <Skeleton className="h-56 w-full" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-2/3" />
    </div>
  );
}

/** Prints the generated page in a hidden frame (no pop-up, nothing is stored). */
export function printHtml(html: string): void {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
  frame.srcdoc = html;
  frame.onload = () => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    setTimeout(() => frame.remove(), 60_000); // the print dialog may still be open
  };
  document.body.appendChild(frame);
}

export default function ResumeDrawer(p: ResumeDrawerProps) {
  const toast = useToast();
  const [state, setState] = useState<State>({ status: "idle" });
  const [busy, setBusy] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  const open = p.resumeId !== null;
  const seq = useRef(0);

  const load = useCallback(
    async (id: number, quiet: boolean) => {
      const mine = ++seq.current;
      if (!quiet) setState({ status: "loading" });
      const r = await resumesApi.detail(p.orgId, id);
      if (mine !== seq.current) return null;
      if (r.ok) {
        setState({ status: "ok", detail: r.data });
        return r.data;
      }
      setState(r.status === 404 ? { status: "gone" } : { status: "error", message: errorSentence(r) });
      return null;
    },
    [p.orgId],
  );

  useEffect(() => {
    if (p.resumeId === null) {
      seq.current++;
      setState({ status: "idle" });
      return;
    }
    void load(p.resumeId, false);
  }, [p.resumeId, load]);

  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (p.resumeId !== null) void load(p.resumeId, true);
  }, [p.reloadToken, p.resumeId, load]);

  const accept = useCallback(
    (d: ResumeDetail) => {
      setState({ status: "ok", detail: d });
      p.onChanged(d);
    },
    [p],
  );

  /* ── autosaved changes, each with an Undo ─────────────────────────────────────── */

  const setPrimary = useCallback(
    async (d: ResumeDetail, on: boolean, quiet = false) => {
      setBusy("primary");
      const r = await resumesApi.setPrimary(p.orgId, d.row.id, on);
      setBusy(null);
      if (!r.ok) {
        toast({ title: on ? "Couldn't set the primary resume" : "Couldn't clear the primary resume", description: errorSentence(r), variant: "error" });
        void load(d.row.id, true);
        return;
      }
      accept(r.data.detail);
      if (quiet) return;
      const lost = r.data.previousPrimaryId;
      toast({
        title: on ? `${d.row.name} is now the primary resume` : `${d.row.name} is no longer primary`,
        variant: "success",
        duration: UNDO_MS,
        action: {
          label: "Undo",
          onClick: () =>
            void (async () => {
              const u = on
                ? lost
                  ? await resumesApi.setPrimary(p.orgId, lost, true)
                  : await resumesApi.setPrimary(p.orgId, d.row.id, false)
                : await resumesApi.setPrimary(p.orgId, d.row.id, true);
              toast(u.ok ? { title: "Undone", variant: "success" } : { title: "Couldn't undo", description: errorSentence(u), variant: "error" });
              if (u.ok) p.onChanged(u.data.detail);
              void load(d.row.id, true);
            })(),
        },
      });
    },
    [p, toast, accept, load],
  );

  const setVisibility = useCallback(
    async (d: ResumeDetail, v: Visibility) => {
      if (v === d.row.visibility) return;
      setBusy("visibility");
      const r = await resumesApi.setVisibility(p.orgId, d.row.id, v);
      setBusy(null);
      if (!r.ok) {
        toast({ title: "Couldn't change who can see this", description: errorSentence(r), variant: "error" });
        void load(d.row.id, true);
        return;
      }
      accept(r.data.detail);
      const before = r.data.previous;
      toast({
        title: `Visibility is now ${VISIBILITY_OPTIONS.find((o) => o.value === v)?.label ?? v}`,
        variant: "success",
        duration: UNDO_MS,
        action: {
          label: "Undo",
          onClick: () =>
            void resumesApi.setVisibility(p.orgId, d.row.id, before).then((u) => {
              toast(u.ok ? { title: "Undone", variant: "success" } : { title: "Couldn't undo", description: errorSentence(u), variant: "error" });
              if (u.ok) p.onChanged(u.data.detail);
              void load(d.row.id, true);
            }),
        },
      });
    },
    [p, toast, accept, load],
  );

  const decide = useCallback(
    async (d: ResumeDetail, decision: "APPROVE" | "REJECT" | "REOPEN") => {
      setBusy("decision");
      const r = await resumesApi.decide(p.orgId, d.row.id, decision);
      setBusy(null);
      if (!r.ok) {
        toast({ title: "Couldn't record that", description: errorSentence(r), variant: "error" });
        void load(d.row.id, true);
        return;
      }
      accept(r.data.detail);
      const before: Approval = r.data.previous;
      const title = decision === "APPROVE" ? `${d.row.name} is approved` : decision === "REJECT" ? `${d.row.name} was rejected` : `${d.row.name} is waiting for approval again`;
      toast({
        title,
        variant: "success",
        duration: UNDO_MS,
        action: {
          label: "Undo",
          onClick: () =>
            void (async () => {
              const undo = decision === "REOPEN" ? (before === "REJECTED" ? "REJECT" : "APPROVE") : "REOPEN";
              const u = await resumesApi.decide(p.orgId, d.row.id, undo);
              toast(u.ok ? { title: "Undone", variant: "success" } : { title: "Couldn't undo", description: errorSentence(u), variant: "error" });
              if (u.ok) p.onChanged(u.data.detail);
              void load(d.row.id, true);
            })(),
        },
      });
    },
    [p, toast, accept, load],
  );

  const print = useCallback(
    async (d: ResumeDetail) => {
      setBusy("print");
      const r = await resumesApi.html(p.orgId, d.row.id);
      setBusy(null);
      if (!r.ok) {
        toast({ title: "Couldn't print", description: r.message, variant: "error" });
        return;
      }
      printHtml(r.html);
    },
    [p.orgId, toast],
  );

  /* ── body ─────────────────────────────────────────────────────────────────────── */

  const body = (() => {
    if (state.status === "idle" || state.status === "loading") return <Loading />;
    if (state.status === "gone") return <ErrorState variant="inline" what="this resume" description="It is no longer in your view. It may have been removed or moved out of your scope." />;
    if (state.status === "error") return <ErrorState variant="inline" what="this resume" description={state.message} onRetry={() => p.resumeId !== null && void load(p.resumeId, false)} />;
    const d = state.detail;
    const r = d.row;
    const c = r.consultant;
    const approved = r.approvalStatus === "APPROVED";
    return (
      <div data-detail-body data-resume-id={r.id} className="space-y-3 p-3">
        <div className="flex items-start gap-2.5 pr-8">
          <MemberAvatar name={c.name} size={46} />
          <div className="min-w-0 flex-1 space-y-1.5 pt-0.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <h3 className="truncate text-[12.5px] font-bold text-[var(--ent-title)]">{c.name}</h3>
              {c.status === "ACTIVE" && (
                <span className="ent-pill" data-tone="green" data-shape="round">
                  Active
                </span>
              )}
            </div>
            {c.jobTitle && (
              <span className="ent-pill" data-tone="purple" data-shape="round">
                {c.jobTitle}
              </span>
            )}
            <ul className="sr-only" data-contact>
              {c.email && <li>{c.email}</li>}
              {c.location && (
                <li>
                  {c.location}
                  {c.workMode ? ` (${c.workMode.toLowerCase()})` : ""}
                </li>
              )}
            </ul>
          </div>
        </div>

        <div className="relative max-h-[345px] overflow-hidden rounded-[9px] border border-[var(--ent-x-e6ecf5)] bg-[var(--ent-x-f3f6fb)] p-2" data-preview-frame>
          <ResumePaper detail={d} />
          <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-[var(--ent-x-f3f6fb)] to-transparent" />
        </div>
        <p className="sr-only">Preview drawn from this record&apos;s summary, skills and experience. No file is stored.</p>

        <dl className="grid grid-cols-2 gap-x-3 gap-y-2.5" data-facts>
          <Field icon={<FileTextIcon size={14} />} label="File Name">
            {r.fileName ?? <span className="font-normal text-muted">No file name</span>}
          </Field>
          <Field icon={<CalendarIcon size={14} />} label="Created">
            {formatDate(r.createdAt) || "—"}
          </Field>
          <Field icon={<ShieldIcon size={14} />} label="Version">
            {versionText(r.version)} (Latest)
          </Field>
          <Field icon={<ClockIcon size={14} />} label="Last Modified">
            {formatDate(r.updatedAt) || "—"}
            {r.updatedBy ? <span className="font-normal text-muted" data-modified-by> by {r.updatedBy}</span> : null}
          </Field>
          <Field icon={<FileTextIcon size={14} />} label="File Size">
            {fileSizeText(r.fileSizeKb) || <span className="font-normal text-muted">Not stored</span>}
          </Field>
          <Field icon={<UserIcon size={14} />} label="Owner">
            {r.owner ? (
              <span className="flex items-center gap-1.5">
                <MemberAvatar name={r.owner.name} size={22} />
                <span className="truncate">{r.owner.name}</span>
              </span>
            ) : (
              <span className="font-normal text-muted">Not set</span>
            )}
          </Field>
        </dl>

        <div className="space-y-2.5 border-t border-[var(--ent-table-line)] pt-3">
          <div className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-[11.5px] font-medium text-[var(--ent-title)]">
              <StarIcon aria-hidden size={14} className="text-[var(--ent-x-4b5a8a)]" /> Primary Resume
            </span>
            <span className="flex items-center gap-2 text-[11px] text-[var(--ent-title)]">
              <Switch
                aria-label="Primary resume"
                checked={r.primary}
                disabled={!d.actions.setPrimary || busy === "primary" || (!approved && !r.primary)}
                onCheckedChange={(on) => void setPrimary(d, on)}
              />
              {r.primary ? "Yes" : "No"}
            </span>
          </div>
          {!approved && d.actions.setPrimary && !r.primary && <p className="-mt-1.5 text-[10.5px] text-muted">Only an approved resume can be the primary one.</p>}

          <div className="flex items-center justify-between gap-2">
            <span className="flex flex-none items-center gap-2 text-[11.5px] font-medium text-[var(--ent-title)]">
              <EyeIcon aria-hidden size={14} className="text-[var(--ent-x-4b5a8a)]" /> Visibility
            </span>
            <div className="ent-vis w-[148px] min-w-0">
              <Select
                aria-label="Visibility"
                value={r.visibility}
                disabled={!d.actions.setVisibility || busy === "visibility"}
                onChange={(v) => void setVisibility(d, v as Visibility)}
                options={VISIBILITY_OPTIONS.map((o) => ({ value: o.value, label: o.long }))}
              />
            </div>
          </div>

          <div className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-[11.5px] font-medium text-[var(--ent-title)]">
              <ShieldIcon aria-hidden size={14} className="text-[var(--ent-x-4b5a8a)]" /> Approval Status
            </span>
            <span className="flex flex-wrap items-center justify-end gap-1.5">
              <ApprovalPill status={r.approvalStatus} />
              {d.actions.decide && r.approvalStatus === "PENDING" && r.resumeId == null && (
                <>
                  <Button type="button" size="sm" variant="accent-soft" className="!px-2.5 !py-1 !text-[11px]" disabled={busy === "decision"} onClick={() => void decide(d, "APPROVE")}>
                    Approve
                  </Button>
                  <Button type="button" size="sm" variant="ghost" className="!px-2.5 !py-1 !text-[11px]" disabled={busy === "decision"} onClick={() => void decide(d, "REJECT")}>
                    Reject
                  </Button>
                </>
              )}
              {d.actions.decide && r.approvalStatus !== "PENDING" && r.resumeId == null && (
                <button type="button" disabled={busy === "decision"} onClick={() => void decide(d, "REOPEN")} className="text-[10.5px] font-semibold text-accent-deep underline disabled:opacity-50">
                  Move back to pending
                </button>
              )}
            </span>
          </div>
          {r.approvalStatus === "PENDING" && r.resumeId != null && <p className="text-[10.5px] text-muted" data-consultant-approves>Made in the resume builder: the consultant approves it.</p>}
          {r.approvalStatus === "PENDING" && r.resumeId == null && !d.actions.decide && <p className="text-[10.5px] text-muted">Waiting for someone with approval access. The person who prepared a resume cannot approve it.</p>}
        </div>

        <div className="ent-actions grid grid-cols-2 gap-2" data-actions>
          <Button type="button" variant="accent" size="md" onClick={() => setPreview(true)}>
            <EyeIcon aria-hidden size={16} /> Preview
          </Button>
          <a href={exportUrl(p.orgId, r.id, "txt")} download className={buttonVariants("ghost", "md", OUTLINE)}>
            <DownloadIcon aria-hidden size={16} /> Download
          </a>
          <Button type="button" variant="ghost" size="md" className={OUTLINE} disabled={busy === "print"} onClick={() => void print(d)}>
            <PrinterIcon aria-hidden size={16} /> Print
          </Button>
          <Button type="button" variant="ghost" size="md" className={OUTLINE} disabled={!d.actions.setPrimary || r.primary || !approved || busy === "primary"} onClick={() => void setPrimary(d, true)}>
            <StarIcon aria-hidden size={16} /> Set as Primary
          </Button>
          {r.resumeId != null && p.builderHref?.(r.id) ? (
            <a href={p.builderHref(r.id) ?? undefined} data-edit-in-builder className={buttonVariants("ghost", "md", cn(OUTLINE, "col-span-2"))}>
              <PencilIcon aria-hidden size={16} /> Edit in the resume builder
            </a>
          ) : null}
        </div>
        {p.footer}
        <Dialog open={preview} onClose={() => setPreview(false)} title={r.name} description={`${c.name} - ${versionText(r.version)}`} className="max-w-3xl">
          <ResumePaper detail={d} large />
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <a href={exportUrl(p.orgId, r.id, "txt")} download className={buttonVariants("ghost", "sm")}>
              <DownloadIcon aria-hidden size={15} /> Download
            </a>
            <Button type="button" variant="ghost" size="sm" onClick={() => void print(d)}>
              <PrinterIcon aria-hidden size={15} /> Print
            </Button>
          </div>
        </Dialog>
      </div>
    );
  })();

  const title = state.status === "ok" ? state.detail.row.name : "Resume";
  const description = state.status === "ok" ? `${versionText(state.detail.row.version)} (Latest)` : undefined;

  if (p.mode === "sheet") {
    return (
      <BottomSheet id="ent-resume-sheet" open={open} onClose={p.onClose} title={title} description={description} returnFocusTo={p.returnFocusTo} defaultSnap="partial">
        {body}
      </BottomSheet>
    );
  }
  const sheet = (
    <SideSheet id="ent-resume-sheet" side="right" mode={p.mode} bare className="ent-drawer" width={p.mode === "push" ? 287 : 400} open={open} onClose={p.onClose} title={title} description={description} returnFocusTo={p.returnFocusTo}>
      {body}
    </SideSheet>
  );
  if (p.mode === "push") {
    return <div className={`ent-drawer-slot sticky top-2 shrink-0 self-start ${open ? "ml-[15px]" : ""}`}>{sheet}</div>;
  }
  return sheet;
}

