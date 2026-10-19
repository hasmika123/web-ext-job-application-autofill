"use client";

import Link from "next/link";
import { useCallback, useState, type ComponentType, type ReactNode } from "react";
import { CalendarCheckIcon, CalendarIcon, ClipboardCheckIcon, ErrorState, FileTextIcon, Skeleton, UsersIcon, VideoIcon, cn } from "@kiwiply/ui";
import type { IconProps } from "@kiwiply/ui";
import { TONES, type IconTone } from "@/components/ent/dashboard/parts";
import PageHeader from "@/components/ent/shell/ShellContext";
import { BASE, Card, CompanyMark, Empty, Pill, SampleMark, TABLE, TD, TableHead, ViewButton, useWorkspaceData } from "./parts";
import {
  OPPORTUNITY_LABELS,
  applicationLabel,
  fetchHome,
  interviewWhen,
  shortDate,
  type HomeView,
} from "@/lib/ent/consultant-ws/home";

/**
 * Consultant Home (design/enterprise-consultant/home.webp): one call to `GET /api/orgs/{orgId}/me-workspace/home` (through the BFF)
 * draws the page for the signed-in consultant's OWN data. Four tiles that name something to act on, then four blocks: Today, the
 * opportunities waiting for an answer, upcoming interviews and the latest applications. A block the API flags `sample` (the interview
 * mode) carries a small "Sample" marker. Empty cards say so in a sentence; there is no made-up number.
 */

interface TileSpec {
  key: string;
  title: string;
  icon: ComponentType<IconProps>;
  tone: IconTone;
  href: string;
}
const TILE_SPECS: TileSpec[] = [
  { key: "assignedOpportunities", title: "Opportunities awaiting your response", icon: UsersIcon, tone: "pink", href: `${BASE}/opportunities` },
  { key: "activeApplications", title: "Active applications", icon: FileTextIcon, tone: "violet", href: `${BASE}/applications` },
  { key: "upcomingInterviews", title: "Upcoming interviews", icon: CalendarIcon, tone: "green", href: `${BASE}/interviews` },
  { key: "submissionsPending", title: "Submissions to approve", icon: ClipboardCheckIcon, tone: "amber", href: `${BASE}/submissions` },
];

/** Opportunities that still need an answer: assigned, not yet interested (the API's REVIEW_NEEDED and AWAITING_APPROVAL). */
const awaitingResponse = (view: HomeView) => view.assignedOpportunities.filter((o) => o.status !== "INTERESTED");

/** The number on a tile. "Awaiting your response" is counted from the rows when the list is complete; otherwise the API's assigned total. */
function tileValue(spec: TileSpec, view: HomeView): number {
  if (spec.key === "assignedOpportunities") {
    const total = view.tiles.assignedOpportunities.value;
    return total <= view.assignedOpportunities.length ? awaitingResponse(view).length : total;
  }
  return view.tiles[spec.key as "activeApplications" | "upcomingInterviews" | "submissionsPending"].value;
}

function Tile({ spec, view }: { spec: TileSpec; view: HomeView | null }) {
  const Icon = spec.icon;
  const frame = (body: ReactNode, state: string) => (
    <section aria-label={spec.title} data-stat-tile={spec.key} data-tone={spec.tone} data-state={state} className="flex min-h-[96px] min-w-0 gap-3 rounded-[var(--radius-lg)] border border-line bg-paper p-3.5 sm:p-4">
      <span aria-hidden className={cn("grid h-11 w-11 flex-none place-items-center rounded-[12px]", TONES[spec.tone])}>
        <Icon size={22} />
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="text-[13.5px] font-semibold leading-tight text-ink-soft">{spec.title}</h3>
        {body}
      </div>
    </section>
  );
  if (!view)
    return frame(
      <>
        <Skeleton className="mt-2 h-8 w-16" />
      </>,
      "loading",
    );
  return frame(
    <p data-tile-value className="mt-1 text-[28px] font-extrabold leading-none tabular-nums text-ink">
      <Link href={spec.href} className="hover:underline">
        {tileValue(spec, view)}
      </Link>
    </p>,
    "ok",
  );
}

/* ── the cards ──────────────────────────────────────────────────────────────────────── */

/** Today: the day's focus list plus any interview on today's date. */
function Today({ view }: { view: HomeView }) {
  const [done, setDone] = useState<Set<string>>(() => new Set());
  const date = view.todaysFocus.date;
  const d = date ? shortDate(date) : "";
  const todaysInterviews = view.interviews.filter((i) => date !== "" && new Date(i.scheduledAt).toLocaleDateString("en-CA") === date);
  const nothing = view.todaysFocus.items.length === 0 && todaysInterviews.length === 0;
  return (
    <Card id="home-focus" title="Today" icon={CalendarIcon}>
      {d ? <p className="-mt-1 mb-2 text-[12.5px] font-medium text-muted">{d}</p> : null}
      {nothing ? (
        <Empty>Nothing urgent today.</Empty>
      ) : (
        <>
          {todaysInterviews.length > 0 ? (
            <ul className="mb-3 space-y-2" aria-label="Interviews today">
              {todaysInterviews.map((i) => {
                const w = interviewWhen(i.scheduledAt, i.durationMinutes);
                return (
                  <li key={i.id} data-today-interview={i.id} className="flex items-center gap-2.5 text-[13.5px] text-ink">
                    <VideoIcon size={16} className="flex-none text-accent-deep" />
                    <span className="min-w-0 flex-1">
                      <Link href={`${BASE}/interviews`} className="font-semibold hover:underline">
                        Interview: {i.title ?? "Interview"}
                        {i.company ? `, ${i.company}` : ""}
                      </Link>
                      <span className="ml-1.5 text-muted">{w.line2}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : null}
          <ul className="space-y-2.5">
            {view.todaysFocus.items.map((i) => (
              <li key={i.key}>
                <label className="flex cursor-pointer items-center gap-2.5 text-[13.5px] text-ink">
                  <input
                    type="checkbox"
                    checked={done.has(i.key)}
                    onChange={() => setDone((s) => (s.has(i.key) ? new Set([...s].filter((k) => k !== i.key)) : new Set(s).add(i.key)))}
                    className="h-[18px] w-[18px] flex-none rounded-full border-2 border-line accent-[var(--brand-600)]"
                  />
                  <span className={cn("min-w-0 flex-1", done.has(i.key) && "text-muted line-through")}>{i.label}</span>
                </label>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}

function NeedingResponse({ view }: { view: HomeView }) {
  const rows = awaitingResponse(view);
  return (
    <Card id="home-assigned" title="Opportunities needing a response" icon={UsersIcon} tone="pink" viewAll={`${BASE}/opportunities`}>
      {rows.length === 0 ? (
        <Empty>Nothing is waiting for your answer. Your marketer will line up openings here.</Empty>
      ) : (
        <div className="relative overflow-x-auto">
          <table className={TABLE}>
            <TableHead cols={["Opening", "Status", "Assigned", ""]} />
            <tbody className="divide-y divide-line">
              {rows.map((o) => {
                const s = OPPORTUNITY_LABELS[o.status];
                return (
                  <tr key={o.matchId} data-opportunity={o.matchId}>
                    <td className={TD}>
                      <span className="flex items-center gap-2.5">
                        <CompanyMark name={o.company} />
                        <span className="min-w-0">
                          <span className="block truncate font-semibold">{o.title}</span>
                          <span className="block truncate text-[12px] text-muted">{o.company}</span>
                        </span>
                      </span>
                    </td>
                    <td className={TD}>
                      <Pill tone={s.tone}>{s.label}</Pill>
                    </td>
                    <td className={cn(TD, "whitespace-nowrap text-ink-soft")}>{shortDate(o.assignedAt)}</td>
                    <td className={TD}>
                      <Link
                        href={`${BASE}/opportunities`}
                        aria-label={`Respond to ${o.title}`}
                        className="inline-flex min-h-8 items-center rounded-lg border border-line bg-paper px-3.5 text-[13px] font-semibold text-accent-deep hover:bg-accent-soft"
                      >
                        Respond
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function MyApplications({ view }: { view: HomeView }) {
  return (
    <Card id="home-applications" title="My applications" icon={FileTextIcon} tone="violet" viewAll={`${BASE}/applications`}>
      {view.applications.length === 0 ? (
        <Empty>No applications yet. They appear here once you or your marketer apply.</Empty>
      ) : (
        <div className="relative overflow-x-auto">
          <table className={TABLE}>
            <TableHead cols={["Opening", "Company", "Status", "Applied", ""]} />
            <tbody className="divide-y divide-line">
              {view.applications.map((a) => {
                const s = applicationLabel(a.stage, a.closedReason);
                return (
                  <tr key={a.id} data-application={a.id}>
                    <td className={cn(TD, "font-semibold")}>{a.title ?? "Application"}</td>
                    <td className={TD}>
                      <span className="flex items-center gap-1.5">
                        <CompanyMark name={a.company} />
                        <span className="truncate">{a.company ?? "—"}</span>
                      </span>
                    </td>
                    <td className={TD}>
                      <Pill tone={s.tone}>{s.label}</Pill>
                    </td>
                    <td className={cn(TD, "whitespace-nowrap text-ink-soft")}>{shortDate(a.appliedOn)}</td>
                    <td className={TD}>
                      <ViewButton href={`${BASE}/applications`} label={`View ${a.title ?? a.code}`} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function UpcomingInterviews({ view }: { view: HomeView }) {
  return (
    <Card id="home-interviews" title="Upcoming interviews" icon={CalendarCheckIcon} tone="green" viewAll={`${BASE}/interviews`}>
      {view.interviews.length === 0 ? (
        <Empty>No interviews scheduled.</Empty>
      ) : (
        <div className="relative overflow-x-auto">
          <table className={TABLE}>
            <TableHead cols={["Date and time", "Opening", "Mode", ""]} />
            <tbody className="divide-y divide-line">
              {view.interviews.map((i) => {
                const w = interviewWhen(i.scheduledAt, i.durationMinutes);
                return (
                  <tr key={i.id} data-interview={i.id}>
                    <td className={TD}>
                      <span className="flex items-center gap-2.5">
                        <span className="grid w-11 flex-none place-items-center rounded-lg border border-line bg-paper py-1 text-center leading-none">
                          <span className="text-[10px] font-bold text-v2-coral-ink">{w.month}</span>
                          <span className="text-[17px] font-extrabold text-ink">{w.day}</span>
                        </span>
                        <span className="text-[12.5px] leading-snug text-ink-soft">
                          <span className="block font-medium text-ink">{w.line1}</span>
                          {w.line2}
                        </span>
                      </span>
                    </td>
                    <td className={TD}>
                      <span className="flex items-center gap-2">
                        <CompanyMark name={i.company} />
                        <span className="min-w-0">
                          <span className="block truncate font-semibold">{i.title ?? "Interview"}</span>
                          <span className="block truncate text-[12px] text-muted">{i.company}</span>
                        </span>
                      </span>
                    </td>
                    <td className={TD}>
                      <span className="inline-flex flex-wrap items-center gap-1.5">
                        <Pill tone={i.mode === "NOT_SET" ? "slate" : "blue"}>
                          {i.mode === "NOT_SET" ? null : <VideoIcon size={13} className="mr-1" />}
                          {{ VIDEO: "Video", ONSITE: "Onsite", PHONE: "Phone" }[i.mode] ?? "Not set"}
                        </Pill>
                        {i.modeSample ? <SampleMark /> : null}
                      </span>
                    </td>
                    <td className={TD}>
                      <ViewButton href={`${BASE}/interviews`} label={`Details for ${i.title ?? "interview"}`} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

/* ── the page ───────────────────────────────────────────────────────────────────────── */

export interface HomePageProps {
  orgId: number;
  firstName: string;
}

export default function ConsultantHomePage({ orgId }: HomePageProps) {
  const { view, status, reload } = useWorkspaceData(useCallback(() => fetchHome(orgId), [orgId]));
  const loading = status === "loading";

  if (status === "denied") return <ErrorState what="your workspace" title="This page isn't part of your role" description="Ask an organization admin if you should see it." variant="inline" />;

  return (
    <div data-consultant-home data-status={status} className="flex flex-col gap-4 sm:gap-5">
      <PageHeader title="Home" subtitle="What needs your answer, and what's coming up." />

      {status === "failed" ? (
        <ErrorState what="your home page" description="Your workspace didn't load. Nothing has changed." onRetry={() => void reload()} variant="inline" className="rounded-[var(--radius-lg)] border border-line bg-paper" />
      ) : (
        <>
          <section aria-label="Key numbers" data-home-tiles className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
            {TILE_SPECS.map((s) => (
              <Tile key={s.key} spec={s} view={loading ? null : view} />
            ))}
          </section>

          {view ? (
            <div className="grid min-w-0 content-start gap-4 sm:gap-5 xl:grid-cols-2">
              <Today view={view} />
              <NeedingResponse view={view} />
              <UpcomingInterviews view={view} />
              <MyApplications view={view} />
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
    </div>
  );
}
