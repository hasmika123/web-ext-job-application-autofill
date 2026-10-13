"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { ConsentChip, ErrorState, MemberAvatar, ReadinessRing, SideSheet, Skeleton, useNarrow } from "@kiwiply/ui";
import { fetchTalentDetail, yearsText, type TalentDetail } from "@/lib/ent/marketer-ws/talent";
import { AvailabilityChip, ResumeChip } from "./chips";

/**
 * "View Profile": the read-only summary of one consultant in a right-hand drawer. Consent level SUMMARY: skills, availability,
 * resumes, applications, interviews and assigned jobs only; the API never sends an e-mail address, phone number or ID number.
 * E1: the links open the pages where the marketer prepares or records; nothing is submitted for the consultant from here.
 */

const when = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
};
const day = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};
const STAGES: Record<string, string> = { ASSIGNED: "Assigned", SUBMITTED: "Submitted", UNDER_REVIEW: "Under review", INTERVIEWING: "Interviewing", OFFER: "Offer", CLOSED: "Closed" };

function Section({ title, empty, children, count }: { title: string; empty: string; children: ReactNode; count: number }) {
  return (
    <section className="border-t border-line py-3">
      <h3 className="mb-2 text-[13px] font-bold text-ink">{title}</h3>
      {count === 0 ? <p className="text-[13px] text-muted">{empty}</p> : <ul className="flex flex-col gap-2">{children}</ul>}
    </section>
  );
}

export default function ProfileDrawer({
  orgId, consultantId, name, hrefs, onClose,
}: {
  orgId: number;
  consultantId: number | null;
  name: string;
  hrefs: Record<string, string | null>;
  onClose: () => void;
}) {
  const open = consultantId !== null;
  const narrow = useNarrow();
  const [state, setState] = useState<{ id: number; kind: "loading" | "failed" | "denied" | "ready"; detail: TalentDetail | null } | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (consultantId === null) return;
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      setState({ id: consultantId, kind: "loading", detail: null });
      const r = await fetchTalentDetail(orgId, consultantId, ctl.signal);
      if (ctl.signal.aborted) return;
      setState({ id: consultantId, kind: r.kind === "OK" ? "ready" : r.kind === "DENIED" ? "denied" : "failed", detail: r.kind === "OK" ? r.view : null });
    }, 0);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [orgId, consultantId, retry]);

  const cur = state && state.id === consultantId ? state : null;
  const d = cur?.detail ?? null;
  const link = (key: string, label: string) =>
    hrefs[key] && consultantId !== null ? (
      <Link href={`${hrefs[key]}?consultant=${consultantId}`} className="inline-flex h-9 items-center rounded-lg border border-line bg-paper px-3 text-[13px] font-semibold text-accent-deep hover:bg-accent-soft">
        {label}
      </Link>
    ) : null;

  return (
    <SideSheet id="talent-profile-drawer" side="right" mode={narrow ? "fullscreen" : "overlay"} width={440} open={open} title={d?.name ?? name} description={d?.title || undefined} onClose={onClose}>
      <div data-talent-drawer className="px-1 pb-4">
        {!cur || cur.kind === "loading" ? (
          <div aria-busy="true" className="flex flex-col gap-3 py-2">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : cur.kind === "denied" ? (
          <ErrorState what="this consultant" title="This consultant isn't one of yours" description="Only your assigned consultants can be opened here." variant="inline" />
        ) : cur.kind === "failed" || !d ? (
          <ErrorState what="this consultant" description="The profile didn't load. Nothing has changed." onRetry={() => setRetry((n) => n + 1)} variant="inline" />
        ) : (
          <>
            <div className="mb-3 flex items-center gap-3">
              <MemberAvatar name={d.name} src={d.avatarUrl} size={56} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[16px] font-bold text-ink">{d.name}</p>
                <p className="truncate text-[13px] text-muted">{d.headline || d.title}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <AvailabilityChip availability={d.availability} />
                  <ResumeChip resume={d.resume} />
                </div>
              </div>
              <ReadinessRing value={d.profileCompleteness} label="Profile" size={52} />
            </div>
            <div className="mb-1 flex flex-wrap items-center gap-2 text-[12.5px] text-ink-soft">
              <ConsentChip level={d.consent} who={d.name} />
              <span>Summary only. Contact details stay with the consultant.</span>
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 py-3 text-[13px]">
              <div><dt className="text-muted">Experience</dt><dd className="font-semibold text-ink">{yearsText(d.yearsExperience) || "-"}</dd></div>
              <div><dt className="text-muted">Location</dt><dd className="font-semibold text-ink">{d.location || "-"}{d.workMode ? ` (${d.workMode.toLowerCase()})` : ""}</dd></div>
            </dl>
            <Section title="Skills" empty="No skills on file." count={d.skills.length > 0 ? 1 : 0}>
              <li className="flex flex-wrap gap-1.5">
                {d.skills.map((s) => (
                  <span key={s} className="rounded-full bg-accent-soft px-2.5 py-1 text-[12px] font-semibold text-accent-deep">{s}</span>
                ))}
              </li>
            </Section>
            <Section title="Resumes" empty="No resume on file." count={d.resumes.length}>
              {d.resumes.map((r) => (
                <li key={r.id} className="flex items-center gap-2 text-[13px]">
                  <span className="min-w-0 flex-1 truncate font-semibold text-ink">{r.name}</span>
                  <span className="text-muted">v{r.version}{r.primary ? " - primary" : ""}</span>
                  <span className="text-muted">{r.approval === "PENDING" ? "Pending approval" : "Approved"}</span>
                  <span className="text-muted">{day(r.updatedAt)}</span>
                </li>
              ))}
            </Section>
            <Section title="Active applications" empty="No active applications." count={d.applications.length}>
              {d.applications.map((a) => (
                <li key={a.code} className="text-[13px]">
                  <p className="font-semibold text-ink">{a.jobTitle || a.code}{a.client ? ` - ${a.client}` : ""}</p>
                  <p className="text-muted">{STAGES[a.stage] ?? a.stage}{a.nextAction ? ` - ${a.nextAction}` : ""}</p>
                </li>
              ))}
            </Section>
            <Section title="Upcoming interviews" empty="No interviews scheduled." count={d.interviews.length}>
              {d.interviews.map((i, n) => (
                <li key={`${i.scheduledAt}-${n}`} className="text-[13px]">
                  <p className="font-semibold text-ink">{when(i.scheduledAt)}{i.round ? ` - ${i.round}` : ""}</p>
                  <p className="text-muted">{i.client}{i.durationMinutes ? ` - ${i.durationMinutes} min` : ""}</p>
                </li>
              ))}
            </Section>
            <Section title="Assigned jobs" empty="No jobs assigned yet." count={d.assignedJobs.length}>
              {d.assignedJobs.map((j) => (
                <li key={j.jobId} className="flex items-center gap-2 text-[13px]">
                  <span className="min-w-0 flex-1 truncate"><span className="font-semibold text-ink">{j.title}</span>{j.client ? <span className="text-muted"> - {j.client}</span> : null}</span>
                  <span className="rounded-full bg-v2-green-soft px-2 py-0.5 text-[12px] font-bold text-v2-green-ink">{j.matchPct}%</span>
                </li>
              ))}
            </Section>
            <div className="flex flex-wrap gap-2 border-t border-line pt-3">
              {link("matches", "Find Job Matches")}
              {link("resumes", "Resumes")}
              {link("interviews", "Interviews")}
            </div>
          </>
        )}
      </div>
    </SideSheet>
  );
}
