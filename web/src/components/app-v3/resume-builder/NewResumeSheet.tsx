"use client";

import { useEffect, useId, useMemo, useRef, useState, type ChangeEvent, type DragEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Button,
  Dialog,
  FileTextIcon,
  Input,
  PlusIcon,
  SideSheet,
  Spinner,
  UploadIcon,
  UserIcon,
  cn,
  getTemplate,
  useToast,
} from "@kiwiply/ui";
import ParseConsent from "@/components/app-v3/profiles/setup/ParseConsent";
import { track } from "@/lib/analytics";
import { getAiParseConsent } from "@/lib/ai-parse-consent";
import { formatDate } from "@/lib/dates";
import { parseFileForResume, type ResumeUploadParse } from "@/lib/profile-setup/parse";
import { createBuilt } from "@/lib/resume-doc";
import { attachOriginal } from "@/lib/resume-list-api";
import { useDateDisplay } from "@/lib/use-date-display";
import {
  EMPTY_PROFILE,
  NOTHING_UNTICKED,
  SOURCES,
  buildPayload,
  copyDescription,
  defaultName,
  foundSentence,
  itemOfPath,
  profileDescription,
  removedLine,
  reviewCounts,
  type CapNotice,
  type ProfileSummary,
  type ResumeChoice,
  type SourceId,
  type Unticked,
} from "./new-resume/model";
import { usePhone } from "./usePhone";

/** A file bigger than this is refused before any parsing (the resumes page uploads at most the same). */
const MAX_FILE_BYTES = 10 * 1024 * 1024; // config-literal-ok: the upload route's 10 MB body cap, not a resume setting

export interface NewResumeSheetProps {
  open: boolean;
  onClose: () => void;
  /** The "Use my profile" card: counts from the profile items and the completeness meter. */
  profile?: ProfileSummary;
  /** The user's non-archived resumes, for "Copy an existing resume". */
  resumes?: ResumeChoice[];
  /** A template chosen on the list (Popular Templates): step 2 names it. Otherwise the configured default is named. */
  templateId?: string | null;
  /** The template a new resume starts with (`config.templates.default`). */
  defaultTemplateId: string;
  /** Target-role chips (the user's own targets and headline); free text is always allowed. */
  targetSuggestions?: string[];
  /** The card selected when it opens (the list's empty state offers the four directly); default: the profile when it has items, else Upload. */
  initialSource?: SourceId;
  /** The server answered 402 `RESUME_LIMIT`: the chooser closes and the page shows the upgrade prompt. */
  onLimit?: (notice: CapNotice) => void;
  /** Test seam; defaults to the real pipeline (text redacted, then AI or local parse). */
  parseFile?: (file: File, ai: boolean) => Promise<ResumeUploadParse>;
}

/**
 * The "New resume" start chooser (DESIGN 10.14, DECISIONS #29): four sources - Use my profile · Upload a
 * resume · Copy an existing resume · Start from scratch - then "Name it" (name, target, the template line;
 * there is no template step), then Create, which lands in the editor. A Dialog on desktop, a fullscreen
 * sheet on a phone. The page checks the plan's cap BEFORE opening this (an at-cap click shows the upgrade
 * prompt and never the chooser); a 402 from the server is passed to `onLimit` for the same prompt.
 */
export default function NewResumeSheet(props: NewResumeSheetProps) {
  // Mounted only while open, so every opening starts from a clean chooser.
  return props.open ? <Chooser {...props} /> : null;
}

type Step = "start" | "name";
type UploadState =
  | { phase: "idle" }
  | { phase: "reading"; fileName: string }
  | { phase: "ready"; file: File; parse: ResumeUploadParse }
  | { phase: "error"; message: string };

function Chooser({
  onClose,
  profile = EMPTY_PROFILE,
  resumes = [],
  templateId = null,
  defaultTemplateId,
  targetSuggestions = [],
  initialSource,
  onLimit,
  parseFile = parseFileForResume,
}: NewResumeSheetProps) {
  const router = useRouter();
  const toast = useToast();
  const phone = usePhone();
  const display = useDateDisplay();
  const [step, setStep] = useState<Step>("start");
  const [source, setSource] = useState<SourceId>(() => {
    if (initialSource && !(initialSource === "profile" && profile.itemCount === 0) && !(initialSource === "copy" && resumes.length === 0)) return initialSource;
    return profile.itemCount > 0 ? "profile" : "upload";
  });
  const [upload, setUpload] = useState<UploadState>({ phase: "idle" });
  const [unticked, setUnticked] = useState<Unticked>(NOTHING_UNTICKED);
  const [reviewing, setReviewing] = useState(false);
  const [copyId, setCopyId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [nameTouched, setNameTouched] = useState(false);
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flagged, setFlagged] = useState<{ list: "experience" | "education" | "projects"; index: number } | null>(null);
  const titleId = useId();

  useEffect(() => {
    track("resume_new_opened");
  }, []);

  const copyFrom = resumes.find((r) => r.id === copyId) ?? null;
  const parsed = upload.phase === "ready" ? upload : null;

  const choose = (s: SourceId) => {
    if (s === source) return;
    setSource(s);
    setError(null);
    track("resume_new_source", { kind: s });
  };

  /** Continue is possible once the chosen source has what it needs. */
  const canContinue =
    (source === "profile" && profile.itemCount > 0) || source === "scratch" || (source === "upload" && parsed !== null) || (source === "copy" && copyFrom !== null);

  const suggestedName = defaultName(source, {
    profileHeadline: profile.headline,
    fileName: parsed?.file.name ?? null,
    copyFrom: copyFrom?.name ?? null,
  });
  const shownName = nameTouched ? name : suggestedName;

  const goName = () => {
    if (!canContinue) return;
    setError(null);
    setStep("name");
  };

  async function readFile(file: File) {
    setError(null);
    if (file.size > MAX_FILE_BYTES) {
      setUpload({ phase: "error", message: "That file is too large. Keep it under 10 MB." });
      return;
    }
    setUpload({ phase: "reading", fileName: file.name });
    try {
      const parse = await parseFile(file, getAiParseConsent());
      setUnticked(NOTHING_UNTICKED);
      setFlagged(null);
      setReviewing(false);
      setUpload({ phase: "ready", file, parse });
    } catch (e) {
      setUpload({ phase: "error", message: e instanceof Error && e.message ? e.message : "We couldn't read that file. Try another one." });
    }
  }

  async function create() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const payload = buildPayload({
      source,
      name: shownName,
      target,
      templateId,
      upload: parsed ? { structured: parsed.parse.structured, bio: parsed.parse.bio, fileName: parsed.file.name, unticked } : null,
      copyFromId: copyId,
    });
    const res = await createBuilt(payload);
    if (res.kind === "ok") {
      const counts = parsed ? reviewCounts(parsed.parse.structured) : null;
      track("resume_new_created", { kind: source, items: counts ? counts.roles + counts.schools + counts.projects : source === "profile" ? profile.itemCount : 0 });
      if (source === "upload" && parsed) {
        // The editor opens on the document the original is attached to, so wait for it (a failure never blocks the editor).
        const attached = await attachOriginal(res.id, parsed.file);
        if (attached.kind === "error") {
          toast({ title: "Resume created, but the original file couldn't be attached", description: attached.message });
        }
      }
      router.push(`/resume-builder/${res.id}`); // stay busy until the editor takes over
      return;
    }
    setBusy(false);
    if (res.kind === "limit") {
      const plan = res.plan === "PRO" || res.plan === "AUTOPILOT" ? res.plan : "FREE";
      onClose();
      onLimit?.({ message: res.message, plan });
      return;
    }
    if (res.kind === "sensitive") {
      const item = itemOfPath(res.path);
      setFlagged(item);
      setReviewing(true);
      setStep("start");
      setError(`${res.message} Untick that item, or remove the value from your file and upload it again.`);
      return;
    }
    setError(res.message);
  }

  const templateLine = (() => {
    const id = templateId ?? (source === "copy" ? copyFrom?.templateId : null) ?? defaultTemplateId;
    return getTemplate(id).meta.name;
  })();

  const footer =
    step === "start" ? (
      <>
        <Button variant="ghost" onClick={onClose} className="max-sm:min-h-11">
          Cancel
        </Button>
        <Button variant="accent" onClick={goName} disabled={!canContinue} className="max-sm:min-h-11">
          Continue
        </Button>
      </>
    ) : (
      <>
        <Button variant="ghost" onClick={() => setStep("start")} disabled={busy} className="max-sm:min-h-11">
          Back
        </Button>
        <Button variant="accent" onClick={create} disabled={busy || !shownName.trim()} className="max-sm:min-h-11">
          {busy && <Spinner role="presentation" aria-hidden className="h-4 w-4" />}
          Create resume
        </Button>
      </>
    );

  const body =
    step === "start" ? (
      <div className="flex flex-col gap-3" onKeyDown={(e) => e.key === "Enter" && e.target instanceof HTMLElement && e.target.getAttribute("role") === "radio" && goName()}>
        {error && (
          <p role="alert" className="rounded-xl border border-danger/40 bg-danger/5 px-3 py-2 text-[13.5px] text-danger">
            {error}
          </p>
        )}
        <div role="radiogroup" aria-label="Start your resume from" className="flex flex-col gap-3">
          {SOURCES.map((id) => (
            <SourceCard
              key={id}
              id={id}
              selected={source === id}
              disabled={id === "profile" && profile.itemCount === 0}
              copyCount={resumes.length}
              profile={profile}
              onSelect={() => choose(id)}
              action={
                id === "profile" && profile.itemCount === 0 ? (
                  <Link href="/profiles/setup" className="inline-flex min-h-10 flex-none items-center rounded-xl border border-v2-line px-3 text-[13px] font-bold text-v2-blue hover:bg-paper-2">
                    Build my profile
                  </Link>
                ) : undefined
              }
              extra={
                id === "profile" && profile.itemCount === 0 ? (
                  <button type="button" onClick={() => choose("scratch")} className="mt-1 w-fit text-[13px] font-semibold text-v2-blue hover:underline">
                    Start with just my name and contact
                  </button>
                ) : undefined
              }
            >
              {id === "upload" && source === "upload" && (
                <UploadPanel
                  state={upload}
                  onFile={readFile}
                  onReset={() => setUpload({ phase: "idle" })}
                  unticked={unticked}
                  setUnticked={setUnticked}
                  reviewing={reviewing}
                  setReviewing={setReviewing}
                  flagged={flagged}
                />
              )}
              {id === "copy" && source === "copy" && (
                <CopyPanel resumes={resumes} value={copyId} onChange={setCopyId} display={display} />
              )}
            </SourceCard>
          ))}
        </div>
      </div>
    ) : (
      <div className="flex flex-col gap-4">
        {error && (
          <p role="alert" className="rounded-xl border border-danger/40 bg-danger/5 px-3 py-2 text-[13.5px] text-danger">
            {error}
          </p>
        )}
        <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-v2-navy">
          Resume name
          <Input
            value={shownName}
            onChange={(e) => {
              setName(e.target.value);
              setNameTouched(true);
            }}
            onKeyDown={(e) => e.key === "Enter" && void create()}
            maxLength={200} // config-literal-ok: the API's resume-name limit (ResumeMetaService), mirrored for the field
            autoFocus
          />
        </label>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${titleId}-target`} className="text-[13px] font-semibold text-v2-navy">
            Target role <span className="font-normal text-v2-muted">(optional)</span>
          </label>
          <Input id={`${titleId}-target`} value={target} onChange={(e) => setTarget(e.target.value)} maxLength={80} placeholder="e.g. Backend Engineer" />
          {targetSuggestions.length > 0 && (
            <ul className="flex flex-wrap gap-1.5" aria-label="Suggested target roles">
              {targetSuggestions.slice(0, 6).map((t) => (
                <li key={t}>
                  <button
                    type="button"
                    onClick={() => setTarget(t)}
                    className={cn(
                      "rounded-full border px-3 py-1 text-[12.5px] font-medium",
                      target === t ? "border-accent bg-accent-soft text-accent-deep" : "border-v2-line text-v2-ink-soft hover:bg-paper-2",
                    )}
                  >
                    {t}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <p className="text-[13.5px] text-v2-ink-soft">
          Template: <strong className="text-v2-navy">{templateLine}</strong> — you can change it in the editor
        </p>
      </div>
    );

  const title = step === "start" ? "Start your resume from" : "Name your resume";

  if (phone) {
    return (
      <SideSheet id="rb-new-resume" side="right" mode="fullscreen" open title={title} onClose={onClose} footer={<div className="flex items-center justify-end gap-2">{footer}</div>}>
        {body}
      </SideSheet>
    );
  }
  return (
    <Dialog open onClose={onClose} title={title} footer={footer} className="max-w-[640px]!">
      {body}
    </Dialog>
  );
}

/* ── one of the four cards ────────────────────────────────────────────────────────────── */

const COPY: Record<SourceId, { title: string; description: (p: { profile: ProfileSummary; copyCount: number }) => string; icon: ReactNode }> = {
  profile: { title: "Use my profile", description: ({ profile }) => profileDescription(profile), icon: <UserIcon size={20} aria-hidden /> },
  upload: { title: "Upload a resume", description: () => "PDF, DOCX or TXT · we read it and you review", icon: <UploadIcon size={20} aria-hidden /> },
  copy: { title: "Copy an existing resume", description: ({ copyCount }) => copyDescription(copyCount), icon: <FileTextIcon size={20} aria-hidden /> },
  scratch: { title: "Start from scratch", description: () => "A blank resume — just your name and contact, you add the rest", icon: <PlusIcon size={20} aria-hidden /> },
};

function SourceCard({
  id,
  selected,
  disabled,
  copyCount,
  profile,
  onSelect,
  action,
  extra,
  children,
}: {
  id: SourceId;
  selected: boolean;
  disabled?: boolean;
  copyCount: number;
  profile: ProfileSummary;
  onSelect: () => void;
  action?: ReactNode;
  extra?: ReactNode;
  children?: ReactNode;
}) {
  const c = COPY[id];
  const off = disabled || (id === "copy" && copyCount === 0);
  return (
    <div className={cn("rounded-2xl border p-3.5 transition-colors", selected ? "border-accent bg-accent-soft/40" : "border-v2-line bg-paper", off && "opacity-80")}>
      <div className="flex items-center gap-3">
        <button
          type="button"
          role="radio"
          aria-checked={selected}
          disabled={off}
          onClick={onSelect}
          className="flex min-h-11 min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-xl text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed"
        >
          <span className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-v2-lime-soft text-v2-green" aria-hidden>
            {c.icon}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-bold text-v2-navy">{c.title}</span>
            <span className="block text-[13px] leading-snug text-v2-ink-soft">{c.description({ profile, copyCount })}</span>
          </span>
          <span
            aria-hidden
            className={cn("h-[18px] w-[18px] flex-none rounded-full border-2", selected ? "border-accent bg-accent shadow-[inset_0_0_0_3px_var(--color-paper)]" : "border-v2-line")}
          />
        </button>
        {action}
      </div>
      {extra}
      {children && <div className="mt-3">{children}</div>}
    </div>
  );
}

/* ── upload: drop zone, then the review ──────────────────────────────────────────────── */

function UploadPanel({
  state,
  onFile,
  onReset,
  unticked,
  setUnticked,
  reviewing,
  setReviewing,
  flagged,
}: {
  state: UploadState;
  onFile: (f: File) => void;
  onReset: () => void;
  unticked: Unticked;
  setUnticked: (u: Unticked) => void;
  reviewing: boolean;
  setReviewing: (v: boolean) => void;
  flagged: { list: "experience" | "education" | "projects"; index: number } | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const busy = state.phase === "reading";

  const onInput = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) onFile(f);
    e.target.value = ""; // allow picking the same file again
  };
  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f && !busy) onFile(f);
  };

  if (state.phase === "ready") {
    const { structured } = state.parse;
    const counts = reviewCounts(structured);
    const removed = removedLine(state.parse.removed);
    const toggle = (list: "experience" | "education" | "projects", i: number) => {
      const next = new Set(unticked[list]);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      setUnticked({ ...unticked, [list]: next });
    };
    return (
      <div className="rounded-xl border border-v2-line bg-paper p-3.5" data-testid="upload-review">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <FileTextIcon size={16} className="flex-none text-v2-muted" aria-hidden />
          <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-v2-navy">{state.file.name}</span>
          <button type="button" onClick={onReset} className="text-[13px] font-semibold text-v2-blue hover:underline">
            Choose another
          </button>
        </div>
        <p className="mt-2 text-[14px] text-v2-ink-soft">
          We found <strong className="text-v2-navy">{foundSentence(counts)}</strong>.
        </p>
        {removed && <p className="mt-1 text-[13px] text-v2-ink-soft">{removed}</p>}
        <button
          type="button"
          aria-expanded={reviewing}
          onClick={() => setReviewing(!reviewing)}
          className="mt-2 text-[13px] font-bold text-v2-blue hover:underline"
        >
          {reviewing ? "Hide items" : "Review items"}
        </button>
        {reviewing && (
          <div className="mt-2 flex max-h-64 flex-col gap-3 overflow-y-auto pr-1">
            <ReviewGroup title="Experience" empty={(structured.experience?.length ?? 0) === 0}>
              {(structured.experience ?? []).map((e, i) => (
                <ReviewRow key={i} label={[e.title, e.company].filter(Boolean).join(" · ") || "Untitled role"} checked={!unticked.experience.has(i)} flagged={flagged?.list === "experience" && flagged.index === i} onChange={() => toggle("experience", i)} />
              ))}
            </ReviewGroup>
            <ReviewGroup title="Education" empty={(structured.education?.length ?? 0) === 0}>
              {(structured.education ?? []).map((e, i) => (
                <ReviewRow key={i} label={[e.school, e.degree].filter(Boolean).join(" · ") || "Untitled school"} checked={!unticked.education.has(i)} flagged={flagged?.list === "education" && flagged.index === i} onChange={() => toggle("education", i)} />
              ))}
            </ReviewGroup>
            <ReviewGroup title="Projects" empty={(structured.projects?.length ?? 0) === 0}>
              {(structured.projects ?? []).map((p, i) => (
                <ReviewRow key={i} label={p.name || "Untitled project"} checked={!unticked.projects.has(i)} flagged={flagged?.list === "projects" && flagged.index === i} onChange={() => toggle("projects", i)} />
              ))}
            </ReviewGroup>
            <ReviewGroup title="Other" empty={false}>
              {counts.skills > 0 && <ReviewRow label={`Skills (${counts.skills})`} checked={!unticked.skills} onChange={() => setUnticked({ ...unticked, skills: !unticked.skills })} />}
              {structured.summary?.trim() ? <ReviewRow label="Summary" checked={!unticked.summary} onChange={() => setUnticked({ ...unticked, summary: !unticked.summary })} /> : null}
            </ReviewGroup>
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!busy) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn("rounded-xl border-2 border-dashed p-5 text-center transition-colors", dragging ? "border-accent bg-accent-soft" : "border-v2-line bg-paper-2/40")}
      >
        <UploadIcon size={26} className="mx-auto text-accent-deep" aria-hidden />
        <p className="mt-1.5 text-[14px] font-bold text-v2-navy">Drop a resume here</p>
        <p className="text-[12.5px] text-v2-muted">PDF, DOCX or TXT</p>
        <Button variant="accent" size="sm" className="mt-3 max-sm:min-h-11" disabled={busy} onClick={() => inputRef.current?.click()}>
          Choose a file
        </Button>
        <input ref={inputRef} type="file" accept=".pdf,.docx,.txt,application/pdf,text/plain" onChange={onInput} className="hidden" aria-label="Resume file" data-testid="resume-file" />
      </div>
      <div className="mt-3">
        <ParseConsent />
      </div>
      {state.phase === "reading" && (
        <p role="status" className="mt-3 flex items-center gap-2 text-[13.5px] text-v2-ink-soft">
          <Spinner className="h-4 w-4" role="presentation" aria-hidden /> Reading {state.fileName}…
        </p>
      )}
      {state.phase === "error" && (
        <p role="alert" className="mt-3 text-[13.5px] font-medium text-danger">
          {state.message}
        </p>
      )}
    </div>
  );
}

function ReviewGroup({ title, empty, children }: { title: string; empty: boolean; children: ReactNode }) {
  if (empty) return null;
  const has = Array.isArray(children) ? children.some(Boolean) : !!children;
  if (!has) return null;
  return (
    <fieldset className="min-w-0">
      <legend className="mb-1 text-[11.5px] font-bold uppercase tracking-wide text-v2-muted">{title}</legend>
      <ul className="flex flex-col">{children}</ul>
    </fieldset>
  );
}

function ReviewRow({ label, checked, onChange, flagged }: { label: string; checked: boolean; onChange: () => void; flagged?: boolean }) {
  return (
    <li>
      <label className={cn("flex min-h-9 cursor-pointer items-center gap-2 rounded-lg px-1.5 text-[13.5px] max-sm:min-h-11", flagged ? "bg-danger/10 text-danger" : "text-v2-navy")}>
        <input type="checkbox" checked={checked} onChange={onChange} className="h-4 w-4 flex-none accent-[var(--color-accent)]" />
        <span className="min-w-0 truncate">{label}</span>
        {flagged && <span className="flex-none text-[12px] font-bold">Has a value we never collect</span>}
      </label>
    </li>
  );
}

/* ── copy: pick one of your resumes ──────────────────────────────────────────────────── */

function CopyPanel({ resumes, value, onChange, display }: { resumes: ResumeChoice[]; value: number | null; onChange: (id: number) => void; display: ReturnType<typeof useDateDisplay> }) {
  const sorted = useMemo(() => [...resumes].sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "")), [resumes]);
  if (sorted.length === 0) return <p className="text-[13.5px] text-v2-ink-soft">You don&apos;t have a resume to copy yet</p>;
  return (
    <div role="radiogroup" aria-label="Resume to copy" className="flex max-h-56 flex-col gap-1.5 overflow-y-auto pr-1">
      {sorted.map((r) => {
        const on = r.id === value;
        return (
          <button
            key={r.id}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(r.id)}
            className={cn(
              "flex min-h-11 w-full cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2 text-left text-[13.5px]",
              on ? "border-accent bg-accent-soft/60" : "border-v2-line bg-paper hover:bg-paper-2",
            )}
          >
            <span className="min-w-0 flex-1 truncate font-semibold text-v2-navy">{r.name}</span>
            <span className="flex-none rounded-md bg-v2-blue-soft/70 px-2 py-0.5 text-[11.5px] font-medium text-v2-blue-ink">{r.kind === "BUILT" ? "Built" : "Uploaded"}</span>
            {r.updatedAt && <span className="hidden flex-none text-[12px] text-v2-muted sm:inline">{formatDate(r.updatedAt, { month: "short", day: "numeric", year: "numeric" }, display)}</span>}
            {r.score !== null && <span className="flex-none text-[12px] font-bold text-v2-green-ink">{r.score}%</span>}
          </button>
        );
      })}
    </div>
  );
}
