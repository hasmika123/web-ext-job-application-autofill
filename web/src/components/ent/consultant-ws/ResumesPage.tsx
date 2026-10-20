"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  Button,
  CheckCircleIcon,
  ChevronRightIcon,
  CopyIcon,
  DownloadIcon,
  Dialog,
  ErrorState,
  FileTextIcon,
  Input,
  LayoutGridIcon,
  Menu,
  MoreVerticalIcon,
  PencilIcon,
  PlusIcon,
  PrinterIcon,
  Select,
  ShareNodesIcon,
  Skeleton,
  StarIcon,
  cn,
  useToast,
} from "@kiwiply/ui";

import PageHeader from "@/components/ent/shell/ShellContext";
import NewResumeSheet from "@/components/app-v3/resume-builder/NewResumeSheet";
import { BuilderEnvProvider, consultantEnv, useBuilderEnv } from "@/components/app-v3/resume-builder/builderEnv";
import CapDialog from "@/components/app-v3/resume-builder/list/CapDialog";
import { EMPTY_PROFILE, capNotice, type CapNotice, type ProfileSummary, type ResumeChoice, type SourceId } from "@/components/app-v3/resume-builder/new-resume/model";
import { createBuilt } from "@/lib/resume-doc";

import { BASE, Card, Empty, Pill, TABLE, TD, TableHead, useWorkspaceData } from "./parts";
import { EditSheet, PreviewSheet } from "./ResumesSheets";

import {
  approveResume,
  requestResumeChanges,
  SORT_OPTIONS,
  VISIBILITY_LABELS,
  dateOf,
  duplicateResume,
  fetchPreview,
  fetchResumes,
  fetchResumeSources,
  type ResumeSources,
  fileNameOf,
  recordActivity,
  resumeHtml,
  resumeText,
  setPrimary,
  sortResumes,
  timeOf,
  verdictOf,
  type ResumePreview,
  type ResumeRow,
  type ResumesView,
  type SortKey,
} from "@/lib/ent/consultant-ws/resumes";

/**
 * Consultant My Resumes (design/enterprise-consultant/resumes.webp): one call to `GET /api/orgs/{orgId}/me-workspace/resumes` (through
 * the BFF) draws the page for the signed-in consultant's OWN resumes. Nothing on it is sample data. There is no stored resume file:
 * View, Download, Print and Share are generated from the structured fields the preview endpoint returns, and each use is recorded
 * (views, downloads, shares) so the tiles are real counts.
 */

const PROFILE = `${BASE}/profile`;

/* ── browser-side outputs ───────────────────────────────────────────────────────────── */

function saveFile(name: string, mime: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function printHtml(html: string) {
  const f = document.createElement("iframe");
  f.setAttribute("aria-hidden", "true");
  f.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
  f.srcdoc = html;
  f.onload = () => {
    try {
      f.contentWindow?.focus();
      f.contentWindow?.print();
    } finally {
      setTimeout(() => f.remove(), 1500);
    }
  };
  document.body.appendChild(f);
}

/* ── the table ──────────────────────────────────────────────────────────────────────── */

const ICON_BTN = "grid h-8 w-8 flex-none place-items-center rounded-lg border border-line bg-paper text-ink-soft hover:bg-paper-2 disabled:opacity-50";
const TEXT_BTN = "inline-flex min-h-8 items-center rounded-lg border border-line bg-paper px-3.5 text-[13px] font-semibold text-accent-deep hover:bg-accent-soft";

interface RowActions {
  busy: number | null;
  onView: (r: ResumeRow) => void;
  /** Opens the resume in the Resume Builder (inside this workspace); a record with no builder document opens its details instead. */
  onEdit: (r: ResumeRow) => void;
  /** "Open in builder": the editor for a resume with a builder document; for a record without one, an editable copy made from its fields, opened in the editor. */
  onBuilder: (r: ResumeRow) => void;
  /** The name / visibility sheet. */
  onDetails: (r: ResumeRow) => void;
  onDuplicate: (r: ResumeRow) => void;
  onDownload: (r: ResumeRow) => void;
  onPrint: (r: ResumeRow) => void;
  onShare: (r: ResumeRow) => void;
  onPrimary: (r: ResumeRow) => void;
  /** A resume a marketer made for the consultant: approve it, or send it back. */
  onApprove: (r: ResumeRow) => void;
  onSendBack: (r: ResumeRow) => void;
}

function ResumeTable({ rows, actions }: { rows: ResumeRow[]; actions: RowActions }) {
  return (
    <div className="relative overflow-x-auto">
      <table className={TABLE}>
        <TableHead cols={["Resume Title", "Primary", "Last Updated", "Visibility", "Versions", "Actions"]} />
        <tbody className="divide-y divide-line">
          {rows.map((r) => {
            const v = VISIBILITY_LABELS[r.visibility];
            const off = actions.busy === r.id;
            return (
              <tr key={r.id} data-resume={r.id} data-primary={r.primary}>
                <td className={TD}>
                  <span className="flex items-center gap-2.5">
                    <FileTextIcon size={20} className="flex-none text-accent-deep" aria-hidden />
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{r.title}</span>
                      <span className="block truncate text-[12px] text-muted">{r.targetRole ?? ""}</span>
                      {r.awaitingMyApproval ? (
                        <span className="block text-[11.5px] font-medium text-v2-amber-ink" data-awaiting-me>
                          Made for you &middot; waiting for your approval
                        </span>
                      ) : r.approvalStatus === "PENDING" ? (
                        <span className="block text-[11.5px] font-medium text-v2-amber-ink">Awaiting approval</span>
                      ) : null}
                    </span>
                  </span>
                </td>
                <td className={TD}>
                  {r.primary ? (
                    <Pill tone="blue">
                      <StarIcon size={13} className="mr-1" aria-hidden />
                      Primary
                    </Pill>
                  ) : (
                    <span aria-label="Not primary" className="text-muted">
                      &mdash;
                    </span>
                  )}
                </td>
                <td className={cn(TD, "whitespace-nowrap")}>
                  <span className="block text-ink">{dateOf(r.updatedAt)}</span>
                  <span className="block text-[12px] text-muted">{timeOf(r.updatedAt)}</span>
                  {r.updatedBy ? (
                    <span className="block max-w-[11rem] truncate text-[12px] text-muted" data-modified-by title={`Last modified ${dateOf(r.updatedAt)} ${timeOf(r.updatedAt)} by ${r.updatedBy}`}>
                      by {r.updatedBy}
                    </span>
                  ) : null}
                </td>
                <td className={TD}>
                  <Pill tone={v.tone}>{v.label}</Pill>
                </td>
                <td className={cn(TD, "whitespace-nowrap")}>v{r.versionNo}</td>
                <td className={TD}>
                  <span className="flex flex-wrap items-center gap-1.5">
                    <button type="button" className={TEXT_BTN} aria-label={`View ${r.title}`} onClick={() => actions.onView(r)}>
                      View
                    </button>
                    <button type="button" className={TEXT_BTN} aria-label={`Edit ${r.title}`} onClick={() => actions.onEdit(r)}>
                      Edit
                    </button>
                    {r.awaitingMyApproval ? (
                      <>
                        <button type="button" className={TEXT_BTN} aria-label={`Approve ${r.title}`} disabled={off} onClick={() => actions.onApprove(r)} data-approve>
                          Approve
                        </button>
                        <button type="button" className={TEXT_BTN} aria-label={`Send back ${r.title}`} disabled={off} onClick={() => actions.onSendBack(r)} data-send-back>
                          Send back
                        </button>
                      </>
                    ) : null}
                    <button type="button" className={ICON_BTN} aria-label={`Duplicate ${r.title}`} disabled={off} onClick={() => actions.onDuplicate(r)}>
                      <CopyIcon size={15} />
                    </button>
                    <button type="button" className={ICON_BTN} aria-label={`Download ${r.title}`} disabled={off} onClick={() => actions.onDownload(r)}>
                      <DownloadIcon size={15} />
                    </button>
                    <button type="button" className={ICON_BTN} aria-label={`Print ${r.title}`} disabled={off} onClick={() => actions.onPrint(r)}>
                      <PrinterIcon size={15} />
                    </button>
                    <button type="button" className={ICON_BTN} aria-label={`Share ${r.title}`} disabled={off} onClick={() => actions.onShare(r)}>
                      <ShareNodesIcon size={15} />
                    </button>
                    <Menu
                      trigger={
                        <button type="button" aria-label={`More actions for ${r.title}`} className="grid h-8 w-8 flex-none place-items-center rounded-lg text-muted hover:bg-paper-2">
                          <MoreVerticalIcon size={16} />
                        </button>
                      }
                      items={[
                        { label: "Set as primary", icon: <StarIcon size={15} />, disabled: r.primary || r.awaitingMyApproval, onSelect: () => actions.onPrimary(r) },
                        { label: "Open in builder", icon: <FileTextIcon size={15} />, disabled: off, onSelect: () => actions.onBuilder(r) },
                        { label: "Edit details", icon: <PencilIcon size={15} />, onSelect: () => actions.onDetails(r) },
                      ]}
                    />
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ── the lower cards ────────────────────────────────────────────────────────────────── */

function ResumeStrength({ view }: { view: ResumesView }) {
  const r = view.resumeStrength;
  const pct = r.percent;
  return (
    <Card id="resumes-strength" title="Resume strength" icon={LayoutGridIcon} extra={<span className="flex-none text-[13px] font-bold text-ink">{pct}%</span>}>
      <p className="text-[13.5px] font-semibold text-ink">{r.hasResume ? verdictOf(pct) : "Add a resume to get started."}</p>
      <ul className="mt-3 grid min-w-0 gap-2 sm:grid-cols-2 xl:grid-cols-3" aria-label="Resume checklist">
        {r.checks.map((c) => (
          <li key={c.key} data-check={c.key} data-done={c.done} className="text-[13px] text-ink">
            {c.done ? (
              <span className="flex items-center gap-2">
                <CheckCircleIcon size={18} className="flex-none text-v2-green-ink" />
                <span className="min-w-0 flex-1 truncate">{c.label}</span>
              </span>
            ) : (
              <Link href={PROFILE} className="flex items-center gap-2 hover:text-accent-deep">
                <span aria-hidden className="h-[18px] w-[18px] flex-none rounded-full border-2 border-line" />
                <span className="min-w-0 flex-1 truncate">{c.label}</span>
                <ChevronRightIcon size={15} className="flex-none text-muted" />
              </Link>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}

/* ── the page ───────────────────────────────────────────────────────────────────────── */

/** What the new-resume chooser needs, read on the server from the one builder's own data (profile counts, the template default, the license's cap). */
export interface ConsultantBuilderData {
  profile: ProfileSummary;
  defaultTemplateId: string;
  /** The live resumes the account holds and the organization license's cap, as the API reports them. */
  cap: { count: number; max: number };
  targetSuggestions: string[];
}

export interface ResumesPageProps {
  orgId: number;
  firstName: string;
  builder?: ConsultantBuilderData;
}

const NO_BUILDER: ConsultantBuilderData = { profile: EMPTY_PROFILE, defaultTemplateId: "modern", cap: { count: 0, max: Number.MAX_SAFE_INTEGER }, targetSuggestions: [] };

/** My Resumes, and the one Resume Builder reached from it: create (from my profile, an upload, a copy or scratch) and edit run INSIDE this workspace. */
export default function ConsultantResumesPage(props: ResumesPageProps) {
  return (
    <BuilderEnvProvider env={consultantEnv(props.orgId)}>
      <ResumesPageBody {...props} />
    </BuilderEnvProvider>
  );
}

function ResumesPageBody({ orgId, builder = NO_BUILDER }: ResumesPageProps) {
  const { view, status, reload } = useWorkspaceData(useCallback(() => fetchResumes(orgId), [orgId]));
  const toast = useToast();
  const router = useRouter();
  const env = useBuilderEnv();
  const [newOpen, setNewOpen] = useState(false);
  const [newSource, setNewSource] = useState<SourceId | undefined>(undefined);
  const [limit, setLimit] = useState<CapNotice | null>(null);
  const [sendBack, setSendBack] = useState<ResumeRow | null>(null);
  const [note, setNote] = useState("");
  const [sort, setSort] = useState<SortKey>("updated");
  const [busy, setBusy] = useState<number | null>(null);
  const [previewFor, setPreviewFor] = useState<ResumeRow | null>(null);
  const [previewState, setPreviewState] = useState<"loading" | "ready" | "failed">("loading");
  const [preview, setPreview] = useState<ResumePreview | null>(null);
  const [editFor, setEditFor] = useState<ResumeRow | null>(null);


  /** "New resume": the license's cap is checked BEFORE the chooser opens (a stale count is still caught by the server's 402). */
  const openNew = (source?: SourceId) => {
    const live = Math.max(builder.cap.count, view?.resumes.filter((r) => r.resumeId !== null).length ?? 0);
    const notice = capNotice({ count: live, max: builder.cap.max }, "ORGANIZATION");
    if (notice) {
      setLimit(notice);
      return;
    }
    setNewSource(source);
    setNewOpen(true);
  };
  // The chooser reads the organization's records (D10): the same career profile and resumes this page shows, not only the account's Common Profile. Read again
  // whenever the chooser opens, so a resume made a moment ago is there to copy.
  const [sources, setSources] = useState<ResumeSources | null>(null);
  useEffect(() => {
    if (!newOpen) return;
    let live = true;
    void fetchResumeSources(orgId).then((s) => {
      if (live) setSources(s);
    });
    return () => {
      live = false;
    };
  }, [newOpen, orgId]);
  const profile: ProfileSummary = sources
    ? { itemCount: sources.profile.itemCount, roles: sources.profile.roles, schools: sources.profile.schools, skills: sources.profile.skills, score: builder.profile.score, headline: sources.profile.headline }
    : builder.profile;
  const choices: ResumeChoice[] = sources
    ? sources.resumes.map((r) => ({ id: r.resumeId ?? -r.id, name: r.name, kind: r.resumeId !== null ? ("BUILT" as const) : ("RECORD" as const), updatedAt: r.updatedAt, score: null, templateId: null }))
    : (view?.resumes ?? [])
        .filter((r) => r.resumeId !== null)
        .map((r) => ({ id: r.resumeId as number, name: r.title, kind: "BUILT" as const, updatedAt: r.updatedAt, score: null, templateId: null }));
  const failed = (message: string) => toast({ title: message, variant: "error" });

  const loadPreview = useCallback(
    async (r: ResumeRow, record: boolean) => {
      setPreviewState("loading");
      setPreview(null);
      const p = await fetchPreview(orgId, r.id);
      if (p.kind !== "OK") return setPreviewState("failed");
      setPreview(p.preview);
      setPreviewState("ready");
      if (record) {
        await recordActivity(orgId, r.id, "VIEWED");
        void reload();
      }
    },
    [orgId, reload],
  );

  const onView = (r: ResumeRow) => {
    setPreviewFor(r);
    void loadPreview(r, true);
  };

  /** Fetches the structured fields, runs the output, records the activity, refreshes the numbers. */
  const output = async (r: ResumeRow, kind: "DOWNLOADED" | "SHARED", run: (p: ResumePreview) => Promise<string | null> | string | null) => {
    setBusy(r.id);
    try {
      const p = previewFor?.id === r.id && preview ? { kind: "OK" as const, preview } : await fetchPreview(orgId, r.id);
      if (p.kind !== "OK") return failed("That resume didn't load. Nothing has changed.");
      const done = await run(p.preview);
      if (done === null) return;
      const rec = await recordActivity(orgId, r.id, kind);
      if (!rec.ok) failed(rec.message);
      else toast({ title: done, variant: "success" });
      void reload();
    } finally {
      setBusy(null);
    }
  };

  const onDownload = (r: ResumeRow) =>
    void output(r, "DOWNLOADED", (p) => {
      saveFile(fileNameOf(p.title, "html"), "text/html;charset=utf-8", resumeHtml(p));
      return "Resume downloaded";
    });

  const onShare = (r: ResumeRow) =>
    void output(r, "SHARED", async (p) => {
      try {
        await navigator.clipboard.writeText(resumeText(p));
        return "Resume text copied to your clipboard";
      } catch {
        failed("Your browser didn't allow copying. Nothing was shared.");
        return null;
      }
    });

  // printing opens the browser's print dialog; it is a "download" for the tile counts (the resume left the page as a document)
  const onPrint = (r: ResumeRow) =>
    void output(r, "DOWNLOADED", (p) => {
      printHtml(resumeHtml(p));
      return "Sent to print";
    });

  const onDuplicate = async (r: ResumeRow) => {
    setBusy(r.id);
    const res = await duplicateResume(orgId, r.id);
    setBusy(null);
    if (!res.ok) return failed(res.message);
    toast({ title: "Resume duplicated", description: r.resumeId !== null ? "You can edit the copy in the builder." : "The copy is private and waits for approval.", variant: "success" });
    void reload();
  };

  /** Edit opens the builder (same tab, same shell); a record with no builder document opens its details sheet. */
  /** A record with no builder document (imported or seeded) is made editable by building a copy from its fields (new resume, under the license cap), then opened. */
  const onOpenInBuilder = async (r: ResumeRow) => {
    if (r.resumeId !== null) return router.push(env.editorHref(r.resumeId));
    setBusy(r.id);
    const res = await createBuilt({ label: `${r.title} (builder copy)`.slice(0, 200), target: r.targetRole ?? undefined, source: { kind: "directory", orgResumeId: r.id } }, env.createBuiltUrl);
    setBusy(null);
    if (res.kind === "ok") {
      toast({ title: "An editable copy was made", description: "The original record is unchanged.", variant: "success" });
      return router.push(env.editorHref(res.id));
    }
    if (res.kind === "limit") {
      const plan = res.plan === "PRO" || res.plan === "AUTOPILOT" || res.plan === "ORGANIZATION" ? res.plan : "ORGANIZATION";
      return setLimit({ message: res.message, plan, limit: res.limit });
    }
    failed(res.message);
  };

  const onEdit = (r: ResumeRow) => {
    if (r.resumeId !== null) router.push(env.editorHref(r.resumeId));
    else setEditFor(r);
  };

  const onApprove = async (r: ResumeRow) => {
    setBusy(r.id);
    const res = await approveResume(orgId, r);
    setBusy(null);
    if (!res.ok) {
      failed(res.message);
      void reload(); // a stale version (the marketer saved again) shows its new state, ready to be reviewed
      return;
    }
    toast({ title: "Approved", description: "This version of the resume is ready to use.", variant: "success" });
    void reload();
  };

  const submitSendBack = async () => {
    const r = sendBack;
    if (!r) return;
    setBusy(r.id);
    const res = await requestResumeChanges(orgId, r, note.trim() || undefined);
    setBusy(null);
    if (!res.ok) {
      failed(res.message);
      void reload();
      return;
    }
    setSendBack(null);
    setNote("");
    toast({ title: "Sent back to your marketer", variant: "success" });
    void reload();
  };

  const makePrimary = async (id: number) => {
    setBusy(id);
    const res = await setPrimary(orgId, id);
    setBusy(null);
    if (!res.ok) return failed(res.message);
    toast({ title: "Primary resume changed", variant: "success" });
    void reload();
  };

  if (status === "denied") return <ErrorState what="your workspace" title="This page isn't part of your role" description="Ask an organization admin if you should see it." variant="inline" />;

  const actions: RowActions = {
    busy,
    onView,
    onEdit,
    onBuilder: (r) => void onOpenInBuilder(r),
    onDetails: setEditFor,
    onDuplicate: (r) => void onDuplicate(r),
    onDownload,
    onPrint,
    onShare,
    onPrimary: (r) => void makePrimary(r.id),
    onApprove: (r) => void onApprove(r),
    onSendBack: (r) => {
      setNote("");
      setSendBack(r);
    },
  };

  return (
    <div data-consultant-resumes data-status={status} className="flex flex-col gap-4 sm:gap-5">
      <PageHeader title="My Resumes" subtitle="Your resumes, and the ones your marketer prepared for your approval." />

      {status === "failed" ? (
        <ErrorState what="your resumes" description="Your resumes didn't load. Nothing has changed." onRetry={() => void reload()} variant="inline" className="rounded-[var(--radius-lg)] border border-line bg-paper" />
      ) : (
        <>
          <div className="flex justify-end">
            <Button variant="accent" className="w-full sm:w-auto" onClick={() => openNew()} data-create-resume>
              <PlusIcon size={16} className="mr-1.5" />
              Create new resume
            </Button>
          </div>

          {view ? (
            <div className="grid gap-4 sm:gap-5">
              <div className="grid min-w-0 content-start gap-4 sm:gap-5">
                <Card
                  id="resumes-table"
                  title="My resumes"
                  icon={FileTextIcon}
                  extra={
                    <Select variant="pill" value={sort} onChange={(v) => setSort(v as SortKey)} options={SORT_OPTIONS.map((o) => ({ value: o.value, label: o.label }))} aria-label="Sort resumes by" leadingIcon={<span className="text-muted">Sort by:</span>} />
                  }
                >
                  {view.resumes.length === 0 ? <Empty>You don&apos;t have a resume yet. Resumes you or your marketer add will be listed here.</Empty> : <ResumeTable rows={sortResumes(view.resumes, sort)} actions={actions} />}
                </Card>
                <ResumeStrength view={view} />
              </div>
            </div>
          ) : (
            <div className="grid gap-4 sm:gap-5 lg:grid-cols-2" aria-busy="true">
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} className="h-56 w-full" />
              ))}
            </div>
          )}
        </>
      )}

      <NewResumeSheet
        open={newOpen}
        onClose={() => setNewOpen(false)}
        profile={profile}
        resumes={choices}
        defaultTemplateId={builder.defaultTemplateId}
        targetSuggestions={profile.headline ? [profile.headline] : builder.targetSuggestions}
        initialSource={newSource}
        onLimit={setLimit}
      />
      <CapDialog notice={limit} max={builder.cap.max} onManage={() => setLimit(null)} onClose={() => setLimit(null)} />
      <Dialog
        open={sendBack !== null}
        onClose={() => setSendBack(null)}
        title="Send this resume back?"
        description="Your marketer sees it as needing an update. Tell them what to change (optional)."
        footer={
          <>
            <Button variant="ghost" onClick={() => setSendBack(null)}>
              Cancel
            </Button>
            <Button variant="accent" onClick={() => void submitSendBack()} disabled={busy !== null}>
              Send back
            </Button>
          </>
        }
      >
        <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="e.g. Please add my 2019 role" aria-label="What should change" />
      </Dialog>

      <PreviewSheet
        open={previewFor !== null}
        title={previewFor?.title ?? "Resume"}
        state={previewState}
        preview={preview}
        onClose={() => setPreviewFor(null)}
        onRetry={() => previewFor && void loadPreview(previewFor, true)}
        actions={
          previewFor ? (
            <>
              <Button variant="ghost" size="sm" onClick={() => onDownload(previewFor)} disabled={busy !== null || previewState !== "ready"}>
                <DownloadIcon size={15} className="mr-1.5" />
                Download
              </Button>
              <Button variant="ghost" size="sm" onClick={() => onPrint(previewFor)} disabled={busy !== null || previewState !== "ready"}>
                <PrinterIcon size={15} className="mr-1.5" />
                Print
              </Button>
              <Button variant="ghost" size="sm" onClick={() => onShare(previewFor)} disabled={busy !== null || previewState !== "ready"}>
                <ShareNodesIcon size={15} className="mr-1.5" />
                Share
              </Button>
            </>
          ) : null
        }
      />
      <EditSheet
        open={editFor !== null}
        orgId={orgId}
        resume={editFor ? (view?.resumes.find((r) => r.id === editFor.id) ?? editFor) : null}
        onClose={() => setEditFor(null)}
        onSaved={(message) => {
          setEditFor(null);
          toast({ title: message, variant: "success" });
          void reload();
        }}
      />
    </div>
  );
}
