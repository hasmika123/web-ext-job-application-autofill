"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState, type ComponentType, type ReactNode } from "react";
import { ArrowDownIcon, ArrowUpIcon, Button, ChevronDownIcon, MemberAvatar, SearchIcon, SideSheet, Spinner, cn } from "@kiwiply/ui";
import type { IconProps } from "@kiwiply/ui";
import { deltaFromPct, relativeTime } from "@/lib/ent/dashboard";
import {
  PRIORITY_LABELS, WORK_TYPE_LABELS, assignJob, fetchCandidates, fetchJobDetail, saveJobForConsultant, sourceLogo,
  type AssignResult, type Candidate, type JobDetail, type JobRow, type Priority, type SavedForConsultant,
} from "@/lib/ent/marketer-ws/jobs";
import { TINTS } from "../parts";

/** Small building blocks of the Job Discovery board: the square client logo chip, priority chip, delta text, filter boxes, and the View / Assign drawers. */

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";

/** The board's rounded-square client logo (the real logo when the API has one, initials otherwise). */
export function ClientChip({ name, src, size = 24 }: { name: string; src?: string | null; size?: number }) {
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element -- approved board art, served as is
    return <img src={src} alt="" aria-hidden data-client-logo={name} style={{ width: size, height: size }} className="flex-none rounded-[7px] object-cover" />;
  }
  return (
    <span aria-hidden data-client-logo={name} style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }} className="inline-grid flex-none place-items-center rounded-[7px] bg-accent-soft font-extrabold leading-none text-accent-deep">
      {initials(name)}
    </span>
  );
}

/** A job-board source with its logo (the cropped board art, or a letter tile). */
export function SourceCell({ source, size = 20 }: { source: string; size?: number }) {
  const src = sourceLogo(source);
  return (
    <span className="inline-flex items-center gap-2 text-ink-soft">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- approved board art, served as is
        <img src={src} alt="" aria-hidden data-source-logo={source} style={{ width: size, height: size }} className="flex-none rounded-[5px] object-cover" />
      ) : (
        <ClientChip name={source} size={size} />
      )}
      <span className="truncate">{source}</span>
    </span>
  );
}

const PRIORITY_TONE: Record<Priority, string> = { HIGH: TINTS.pink, MEDIUM: TINTS.amber, LOW: TINTS.green };
export function PriorityChip({ priority }: { priority: Priority }) {
  return <span data-priority={priority} className={cn("inline-block rounded-md px-2.5 py-0.5 text-[12px] font-semibold", PRIORITY_TONE[priority])}>{PRIORITY_LABELS[priority]}</span>;
}

/** "↑ +32%": green up / red down; nothing when there is nothing to compare. */
export function Trend({ pct }: { pct: number | null }) {
  const d = deltaFromPct(pct);
  if (!d || d.dir === "flat") return null;
  const up = d.dir === "up";
  const Icon = up ? ArrowUpIcon : ArrowDownIcon;
  return (
    <span className={cn("inline-flex items-center gap-0.5 whitespace-nowrap text-[12px] font-semibold", up ? "text-v2-green-ink" : "text-v2-pink-ink")}>
      <Icon size={11} aria-hidden />
      {up ? "+" : "-"}{d.text}
    </span>
  );
}

/** The filter row's box: icon, small label, value, chevron. `children` is an overlay control (a native select) or nothing when `onClick` opens a panel. */
export function FilterBox({ icon: Icon, label, value, active, onClick, expanded, children, className }: {
  icon: ComponentType<IconProps>; label: string; value: string; active?: boolean; onClick?: () => void; expanded?: boolean; children?: ReactNode; className?: string;
}) {
  const inner = (
    <>
      <span aria-hidden className="flex-none text-accent-deep"><Icon size={16} /></span>
      <span className="min-w-0 flex-1 text-left leading-tight">
        <span className="block text-[12.5px] font-semibold text-ink">{label}</span>
        <span className={cn("block truncate text-[12.5px]", active ? "font-semibold text-accent-deep" : "text-muted")}>{value}</span>
      </span>
      <ChevronDownIcon size={14} aria-hidden className="flex-none text-muted" />
    </>
  );
  const box = "relative flex h-[46px] w-full items-center gap-2.5 rounded-lg border border-line bg-paper px-3 hover:border-accent";
  if (onClick) {
    return (
      <button type="button" onClick={onClick} aria-expanded={expanded} aria-haspopup="dialog" className={cn(box, className)}>
        {inner}
      </button>
    );
  }
  return (
    <div className={cn(box, "focus-within:border-accent", className)}>
      {inner}
      {children}
    </div>
  );
}

/** A native select laid invisibly over a FilterBox: the board look with the platform's own accessible dropdown. */
export function OverlaySelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 h-full w-full cursor-pointer opacity-0">
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

/** A panel that opens under its trigger and closes on outside click or Escape. */
export function usePanel() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return { open, setOpen, ref };
}

export const PANEL = "absolute left-0 top-full z-30 mt-1 w-72 max-w-[85vw] rounded-lg border border-line bg-paper p-3 shadow-lg";

// ---------------------------------------------------------------------------------------------------------- the drawers

const field = "h-10 w-full rounded-lg border border-line bg-paper px-3 text-[13.5px] text-ink placeholder:text-muted focus:border-accent focus:outline-none";

/** The assignment picker: the consultants the marketer may see, best match first. Records an ASSIGNED match; the consultant submits (E1). */
export function AssignSheet({
  orgId, job, onClose, onDone, mode = "assign", onSaved,
}: {
  orgId: number;
  job: JobRow;
  onClose: () => void;
  onDone: (r: AssignResult, who: string) => void;
  /** "save": the same picker, but the job is put on the consultant's own tracker as SAVED (X9.12) instead of recording a match. Never applies. */
  mode?: "assign" | "save";
  onSaved?: (r: SavedForConsultant, who: string) => void;
}) {
  const id = useId();
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Candidate[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);

  const load = useCallback(
    async (text: string) => {
      const mine = ++seq.current;
      const r = await fetchCandidates(orgId, job.id, text);
      if (mine !== seq.current) return;
      if (r.ok) {
        setRows(r.value);
        setError(null);
      } else setError(r.status === 404 ? "Assigning isn't part of your role." : r.error);
    },
    [orgId, job.id],
  );
  useEffect(() => {
    const t = setTimeout(() => void load(q), q ? 250 : 0);
    return () => clearTimeout(t);
  }, [q, load]);

  const submit = async () => {
    if (picked === null || busy) return;
    if (mode === "save") {
      const who = rows?.find((c) => c.consultantId === picked);
      if (!who || who.memberId === null) {
        setError("This consultant has no organization account yet, so a job can't be saved for them.");
        return;
      }
      setBusy(true);
      const saved = await saveJobForConsultant(orgId, who.memberId, job);
      setBusy(false);
      if (saved.ok) onSaved?.(saved.value, who.name);
      else setError(saved.status === 404 ? "That consultant isn't available to you." : saved.status === 429 ? "Too many saves in a minute. Try again shortly." : saved.error);
      return;
    }
    setBusy(true);
    const r = await assignJob(orgId, job.id, picked);
    setBusy(false);
    if (r.ok) onDone(r.value, rows?.find((c) => c.consultantId === picked)?.name ?? "the consultant");
    else setError(r.status === 409 ? "This job is no longer open." : r.status === 404 ? "That consultant isn't available to you." : r.error);
  };

  return (
    <SideSheet
      id={`assign-${id}`} side="right" mode="overlay" open width={460} title={mode === "save" ? "Save this job for a consultant" : "Assign a consultant"} description={`${job.title} - ${job.client.name}`} onClose={onClose}
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="accent" onClick={() => void submit()} disabled={picked === null || busy}>{mode === "save" ? (busy ? "Saving..." : "Save job") : busy ? "Assigning..." : "Assign"}</Button>
        </div>
      }
    >
      <div data-assign-sheet className="flex flex-col gap-3 p-1">
        <p className="rounded-lg bg-accent-soft px-3 py-2 text-[12.5px] text-accent-deep">
          {mode === "save"
            ? "Saving adds this job to the consultant's own job list as Saved, with your name on it. It does not apply to the job: the consultant applies themselves."
            : "Assigning records the match for your consultant. It does not apply to the job: the consultant submits the application themselves."}
        </p>
        <label className="relative block">
          <span className="sr-only">Search consultants</span>
          <SearchIcon size={15} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search your consultants" className={cn(field, "pl-9")} />
        </label>
        {error ? <p role="alert" className="text-[13px] text-v2-pink-ink">{error}</p> : null}
        {rows === null && !error ? (
          <p aria-busy="true" className="flex items-center gap-2 py-4 text-[13px] text-muted"><Spinner /> Loading consultants...</p>
        ) : rows && rows.length === 0 && !error ? (
          <p className="py-4 text-center text-[13.5px] text-muted">{q ? "No consultant matches that search." : "No consultants are assigned to you yet."}</p>
        ) : (
          <ul role="radiogroup" aria-label="Consultants" className="flex flex-col gap-1.5">
            {(rows ?? []).map((c) => (
              <li key={c.consultantId}>
                <label data-candidate={c.consultantId} className={cn("flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2", picked === c.consultantId ? "border-accent bg-accent-soft" : "border-line hover:border-accent")}>
                  <input type="radio" name={`assign-${id}`} checked={picked === c.consultantId} onChange={() => setPicked(c.consultantId)} className="sr-only" />
                  <MemberAvatar name={c.name} size={34} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-semibold text-ink">{c.name}</span>
                    <span className="block truncate text-[12px] text-muted">{[c.title, c.availability && c.availability.toLowerCase().replace(/_/g, " ")].filter(Boolean).join(" - ")}</span>
                  </span>
                  {c.matchStatus === "ASSIGNED" ? <span className="rounded-md bg-v2-green-soft px-2 py-0.5 text-[11.5px] font-semibold text-v2-green-ink">Assigned</span> : null}
                  {c.score !== null ? <span className={cn("rounded-full px-2.5 py-0.5 text-[12px] font-bold", c.score >= 80 ? TINTS.green : TINTS.amber)}>{c.score}%</span> : null}
                </label>
              </li>
            ))}
          </ul>
        )}
      </div>
    </SideSheet>
  );
}

/** The "View" drawer: the job's facts, description and the best matches among the consultants the caller may see. */
export function JobSheet({ orgId, job, matchesHref, canAssign, onClose, onAssign, onSave, now }: { orgId: number; job: JobRow; matchesHref: string | null; canAssign: boolean; onClose: () => void; onAssign: () => void; onSave?: () => void; now: number }) {
  const id = useId();
  const [detail, setDetail] = useState<JobDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void fetchJobDetail(orgId, job.id).then((r) => {
      if (!live) return;
      if (r.ok) setDetail(r.value);
      else setError(r.error);
    });
    return () => {
      live = false;
    };
  }, [orgId, job.id]);
  const facts: [string, string][] = [
    ["Client", job.client.name],
    ["Location", [job.location, job.workMode ? WORK_TYPE_LABELS[job.workMode] ?? job.workMode : null].filter(Boolean).join(" - ") || "-"],
    ["Rate", job.rateLabel],
    ["Source", job.source],
    ["Posted", job.postedAt ? relativeTime(job.postedAt, now) : "-"],
    ["Priority", PRIORITY_LABELS[job.priority]],
    ...(job.visa ? ([["Visa", job.visa]] as [string, string][]) : []),
    ...(detail?.employment ? ([["Employment", detail.employment]] as [string, string][]) : []),
    ...(detail?.duration ? ([["Duration", detail.duration]] as [string, string][]) : []),
    ...(detail?.experienceLevel ? ([["Experience", detail.experienceLevel]] as [string, string][]) : []),
  ];
  return (
    <SideSheet
      id={`job-${id}`} side="right" mode="overlay" open width={500} title={job.title} description={job.client.name} onClose={onClose}
      footer={
        <div className="flex items-center justify-end gap-2">
          {matchesHref ? <Link href={`${matchesHref}?job=${job.id}`} className="inline-flex h-10 items-center rounded-lg border border-line px-4 text-[13.5px] font-semibold text-accent-deep hover:bg-accent-soft">Match</Link> : null}
          {canAssign && onSave ? <Button variant="ghost" onClick={onSave}>Save for a consultant</Button> : null}
          {canAssign ? <Button variant="accent" onClick={onAssign}>Assign</Button> : null}
        </div>
      }
    >
      <div data-job-sheet className="flex flex-col gap-4 p-1">
        <dl className="grid grid-cols-[110px_minmax(0,1fr)] gap-x-3 gap-y-2 text-[13.5px]">
          {facts.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-muted">{k}</dt>
              <dd className="font-medium text-ink">{v}</dd>
            </div>
          ))}
        </dl>
        {job.skills.length ? (
          <ul aria-label="Skills" className="flex flex-wrap gap-1.5">
            {job.skills.map((s) => (
              <li key={s} className="rounded-md bg-accent-soft px-2 py-0.5 text-[12px] font-semibold text-accent-deep">{s}</li>
            ))}
          </ul>
        ) : null}
        {error ? <p role="alert" className="text-[13px] text-v2-pink-ink">{error}</p> : null}
        {!detail && !error ? <p aria-busy="true" className="flex items-center gap-2 text-[13px] text-muted"><Spinner /> Loading the job...</p> : null}
        {detail?.description ? <p className="whitespace-pre-line text-[13.5px] leading-relaxed text-ink-soft">{detail.description}</p> : null}
        {detail?.summaryNote && !detail.description ? <p className="whitespace-pre-line text-[13.5px] leading-relaxed text-ink-soft">{detail.summaryNote}</p> : null}
        {detail ? (
          <section aria-label="Best matches">
            <h3 className="mb-2 text-[14px] font-bold text-ink">Best matches among your consultants</h3>
            {detail.matches.length === 0 ? (
              <p className="text-[13px] text-muted">No consultant of yours is matched to this job yet.</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {detail.matches.map((m) => (
                  <li key={m.consultantId} className="flex items-center gap-2.5 rounded-lg border border-line px-3 py-2">
                    <MemberAvatar name={m.name} size={30} />
                    <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-ink">{m.name}</span>
                    {m.status === "ASSIGNED" ? <span className="rounded-md bg-v2-green-soft px-2 py-0.5 text-[11.5px] font-semibold text-v2-green-ink">Assigned</span> : null}
                    <span className={cn("rounded-full px-2.5 py-0.5 text-[12px] font-bold", m.score >= 80 ? TINTS.green : TINTS.amber)}>{m.score}%</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : null}
      </div>
    </SideSheet>
  );
}
