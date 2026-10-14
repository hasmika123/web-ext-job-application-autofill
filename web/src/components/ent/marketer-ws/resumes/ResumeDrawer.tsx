"use client";

import { useEffect, useMemo, useState } from "react";
import { Button, ErrorState, Field, FileTextIcon, Input, SideSheet, Skeleton, Textarea, cn } from "@kiwiply/ui";
import {
  APPROVAL_LABELS, agoText, approveResume, dateText, fetchResumeDetail, patchResume, requestApproval,
  type ResumeDetail, type ResumeRow, type WriteResult,
} from "@/lib/ent/marketer-ws/resumes";

/**
 * The Resumes board's drawer. View = a read-only preview built from the resume's metadata, skills and experience rows (no file bytes exist).
 * Edit = the marketer's metadata edit (title, headline, summary, target role): a real change is a NEW VERSION and goes back to Pending Review.
 * E1: nothing here submits for a consultant, and a marketer only REQUESTS approval; the org admin approves.
 */

export type DrawerMode = "view" | "edit";
const APPROVAL_TONE: Record<ResumeRow["approval"], string> = {
  APPROVED: "bg-v2-green-soft text-v2-green-ink",
  PENDING: "bg-v2-amber-soft text-v2-amber-ink",
  NEEDS_UPDATE: "bg-v2-pink-soft text-v2-pink-ink",
};

export interface ResumeDrawerProps {
  orgId: number;
  /** The row the drawer was opened from; null = closed. */
  row: ResumeRow | null;
  mode: DrawerMode;
  canApprove: boolean;
  onClose: () => void;
  onModeChange: (mode: DrawerMode) => void;
  /** A write succeeded: the page reloads its list. */
  onChanged: (message: string) => void;
}

export default function ResumeDrawer({ orgId, row, mode, canApprove, onClose, onModeChange, onChanged }: ResumeDrawerProps) {
  const open = row !== null;
  const id = row?.id ?? null;
  const [state, setState] = useState<{ id: number; detail: ResumeDetail | null; status: "loading" | "ready" | "failed" | "denied" } | null>(null);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ title: string; headline: string; summary: string; targetRole: string } | null>(null);

  useEffect(() => {
    if (id === null) return;
    const ctl = new AbortController();
    let live = true;
    void (async () => {
      setState({ id, detail: null, status: "loading" });
      const r = await fetchResumeDetail(orgId, id, ctl.signal);
      if (!live) return;
      setState({ id, detail: r.kind === "OK" ? r.detail : null, status: r.kind === "OK" ? "ready" : r.kind === "DENIED" ? "denied" : "failed" });
    })();
    return () => {
      live = false;
      ctl.abort();
    };
  }, [orgId, id]);

  const detail = state && state.id === id ? state.detail : null;
  const status = state && state.id === id ? state.status : "loading";
  const current = detail?.row ?? row;
  // The form shows the saved values until the person types; the draft is dropped on save, cancel and close.
  const form = useMemo(() => draft ?? { title: detail?.row.title ?? "", headline: detail?.headline ?? "", summary: detail?.summary ?? "", targetRole: detail?.row.targetRole ?? "" }, [draft, detail]);
  const setForm = setDraft;

  const changes = useMemo(() => {
    if (!detail) return null;
    const body: { title?: string; headline?: string | null; summary?: string | null; targetRole?: string | null } = {};
    if (form.title.trim() !== detail.row.title) body.title = form.title.trim();
    if ((form.headline.trim() || null) !== detail.headline) body.headline = form.headline.trim() || null;
    if ((form.summary.trim() || null) !== detail.summary) body.summary = form.summary.trim() || null;
    if ((form.targetRole.trim() || null) !== detail.row.targetRole) body.targetRole = form.targetRole.trim() || null;
    return Object.keys(body).length ? body : null;
  }, [form, detail]);

  const settle = (r: WriteResult, done: string) => {
    setSaving(false);
    if (r.kind === "OK") {
      setState({ id: r.detail.row.id, detail: r.detail, status: "ready" });
      setProblem(null);
      setDraft(null);
      onChanged(done);
      return true;
    }
    setProblem(r.kind === "DENIED" ? "This resume isn't part of your role anymore." : r.message);
    return false;
  };

  const save = async () => {
    if (!current || !changes) return;
    if (!form.title.trim()) {
      setProblem("Give the resume a title.");
      return;
    }
    setSaving(true);
    if (settle(await patchResume(orgId, current.id, changes), `Saved "${form.title.trim()}" as a new version. It is waiting for approval.`)) onModeChange("view");
  };
  const ask = async () => {
    if (!current) return;
    setSaving(true);
    settle(await requestApproval(orgId, current.id), `Approval requested for "${current.title}".`);
  };
  const approve = async () => {
    if (!current) return;
    setSaving(true);
    settle(await approveResume(orgId, current.id), `Approved "${current.title}".`);
  };

  const footer =
    !current || status !== "ready" ? null : mode === "edit" ? (
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={() => {
            setDraft(null);
            setProblem(null);
            onModeChange("view");
          }}
          disabled={saving}
        >
          Cancel
        </Button>
        <Button variant="accent" size="sm" onClick={() => void save()} disabled={saving || !changes}>
          {saving ? "Saving..." : "Save as new version"}
        </Button>
      </div>
    ) : (
      <div className="flex flex-wrap items-center justify-end gap-2">
        {current.canEdit && current.approval !== "PENDING" ? (
          <Button variant="ghost" size="sm" onClick={() => void ask()} disabled={saving}>
            Request approval
          </Button>
        ) : null}
        {canApprove && current.approval === "PENDING" ? (
          <Button variant="ghost" size="sm" onClick={() => void approve()} disabled={saving}>
            Approve
          </Button>
        ) : null}
        {current.canEdit ? (
          <Button variant="accent" size="sm" onClick={() => onModeChange("edit")} disabled={saving}>
            Edit
          </Button>
        ) : null}
      </div>
    );

  return (
    <SideSheet
      side="right"
      mode="overlay"
      id="resume-drawer"
      open={open}
      onClose={() => {
        setDraft(null);
        setProblem(null);
        onClose();
      }}
      title={current?.title ?? "Resume"}
      description={current ? `${current.consultantName} - ${current.consultantTitle}` : undefined}
      icon={<FileTextIcon size={18} />}
      footer={footer}
    >
      <div data-resume-drawer data-mode={mode} className="flex flex-col gap-4 p-1 text-[13.5px] text-ink">
        {status === "loading" ? (
          <div aria-busy="true" className="flex flex-col gap-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : status === "denied" ? (
          <ErrorState what="this resume" title="This resume isn't part of your role" description="Ask an organization admin if you should see it." variant="inline" />
        ) : status === "failed" || !detail || !current ? (
          <ErrorState what="this resume" description="The preview didn't load. Nothing has changed." variant="inline" />
        ) : (
          <>
            {problem ? (
              <p role="alert" className="rounded-lg bg-v2-pink-soft px-3 py-2 text-v2-pink-ink">
                {problem}
              </p>
            ) : null}
            {mode === "edit" ? (
              <form
                aria-label="Edit resume details"
                className="flex flex-col gap-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  void save();
                }}
              >
                <Field label="Resume title">
                  <Input value={form.title} maxLength={200} onChange={(e) => setForm({ ...form, title: e.target.value })} />
                </Field>
                <Field label="Target role">
                  <Input value={form.targetRole} maxLength={120} onChange={(e) => setForm({ ...form, targetRole: e.target.value })} />
                </Field>
                <Field label="Headline">
                  <Input value={form.headline} maxLength={120} onChange={(e) => setForm({ ...form, headline: e.target.value })} />
                </Field>
                <Field label="Summary" hint="No personal numbers or IDs. Saving makes a new version that the org admin has to approve.">
                  <Textarea rows={6} value={form.summary} maxLength={1000} onChange={(e) => setForm({ ...form, summary: e.target.value })} />
                </Field>
              </form>
            ) : (
              <article aria-label="Resume preview" className="rounded-[var(--radius-lg)] border border-line bg-paper-2 p-4">
                <header className="flex flex-wrap items-center gap-2">
                  <h3 className="text-[17px] font-extrabold text-ink">{current.consultantName}</h3>
                  <span className="rounded-md bg-accent-soft px-2 py-0.5 text-[12px] font-semibold text-accent-deep">v{current.version}</span>
                  <span className={cn("rounded-md px-2 py-0.5 text-[12px] font-semibold", APPROVAL_TONE[current.approval])}>{APPROVAL_LABELS[current.approval]}</span>
                </header>
                {detail.headline ? <p className="mt-1 font-semibold text-ink-soft">{detail.headline}</p> : <p className="mt-1 text-muted">No headline yet.</p>}
                <p className="mt-0.5 text-[12px] text-muted">
                  Updated {dateText(current.lastModifiedAt)} ({agoText(current.lastModifiedAt)}){current.targetRole ? ` - Target role: ${current.targetRole}` : ""}
                </p>
                <section aria-label="Summary" className="mt-3">
                  <h4 className="text-[12px] font-bold uppercase tracking-wide text-muted">Summary</h4>
                  <p className="mt-1 whitespace-pre-line">{detail.summary ?? "No summary yet."}</p>
                </section>
                <section aria-label="Skills" className="mt-3">
                  <h4 className="text-[12px] font-bold uppercase tracking-wide text-muted">Skills</h4>
                  {detail.skills.length === 0 ? (
                    <p className="mt-1 text-muted">No skills listed.</p>
                  ) : (
                    <ul className="mt-1 flex flex-wrap gap-1.5">
                      {detail.skills.map((s) => (
                        <li key={s.name} className={cn("rounded-full px-2.5 py-0.5 text-[12px] font-semibold", s.primary ? "bg-accent-soft text-accent-deep" : "bg-paper text-ink-soft")}>
                          {s.name}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
                <section aria-label="Experience" className="mt-3">
                  <h4 className="text-[12px] font-bold uppercase tracking-wide text-muted">Experience</h4>
                  {detail.experience.length === 0 ? (
                    <p className="mt-1 text-muted">No experience entries.</p>
                  ) : (
                    <ul className="mt-1 flex flex-col gap-2">
                      {detail.experience.map((x, i) => (
                        <li key={`${x.employer}-${x.startYear}-${i}`}>
                          <span className="font-semibold">{x.title}</span> <span className="text-ink-soft">at {x.employer}</span>
                          <span className="block text-[12px] text-muted">
                            {x.startYear} - {x.endYear ?? "Present"}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
                <p className="mt-3 text-[12px] text-muted">{detail.fileName ? `${detail.fileName} - ` : ""}No file stored: this is a preview of the saved details.</p>
              </article>
            )}
            {mode === "view" && detail.history.length > 0 ? (
              <section aria-label="History">
                <h4 className="text-[12px] font-bold uppercase tracking-wide text-muted">History</h4>
                <ul className="mt-1 flex flex-col">
                  {detail.history.map((h) => (
                    <li key={h.id} className="flex items-center justify-between gap-2 border-b border-line py-1.5 last:border-0">
                      <span>{h.text}</span>
                      <span className="flex-none text-[12px] text-muted">{agoText(h.at)}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </>
        )}
      </div>
    </SideSheet>
  );
}
