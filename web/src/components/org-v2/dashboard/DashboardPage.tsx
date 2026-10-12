"use client";

import { useCallback, useState } from "react";
import { CalendarIcon, ChartIcon, EmptyState, ErrorState, FileTextIcon, TrophyIcon, UsersIcon, cn } from "@kiwiply/ui";
import { ActivityTimeline, SectionCard, StatTile, TONE } from "@/components/app-v2/common";
import { formatDate } from "@/lib/dates";
import { orgPath, orgRequest } from "@/lib/org-api";
import { useDateDisplay } from "@/lib/use-date-display";
import type { OrgOnboarding, OrgOverview } from "@/lib/org-types";
import OrgPageHero from "../shell/OrgPageHero";
import { useOrg } from "../shell/OrgContext";
import ActivationChecklist from "./ActivationChecklist";
import { STAGE_LABEL, STAGE_TONE, activityCopy } from "./dashboard-copy";

export interface DashboardData {
  /** Null when the caller may not see the checklist (it is for the people who set the workspace up) or it could not be read. */
  onboarding: OrgOnboarding | null;
  /** Null when it could not be read. */
  overview: OrgOverview | null;
}

const WHEN: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" };

/**
 * /org (O2.7): the org admin dashboard, on real data only. A checklist of what to do next until the workspace is set up, then
 * (and alongside it) four live tiles over seats and the progress of the people who share it, the placement pipeline and the
 * org's own recent activity. Nothing is a sample constant: an org with no people shows zeros and one honest sentence about
 * why, never a made-up chart. The seeded demo org looks full because the server seeds it.
 */
export default function DashboardPage({ initial }: { initial: DashboardData }) {
  const { orgId, can } = useOrg();
  const [data, setData] = useState<DashboardData>(initial);

  /** Re-reads both (after the checklist changed something). */
  const reload = useCallback(async () => {
    const [onboarding, overview] = await Promise.all([
      can("org.settings.manage") ? orgRequest<OrgOnboarding>(orgPath(orgId, "/onboarding")) : Promise.resolve(null),
      can("reports.view") ? orgRequest<OrgOverview>(orgPath(orgId, "/overview")) : Promise.resolve(null),
    ]);
    setData((d) => ({ onboarding: onboarding?.ok ? onboarding.data : d.onboarding, overview: overview?.ok ? overview.data : d.overview }));
  }, [orgId, can]);

  const { onboarding, overview } = data;

  return (
    <div className="space-y-4">
      <OrgPageHero
        title="Dashboard"
        icon={<ChartIcon className="h-8 w-8" />}
        subtitle="How your people are getting on, at a glance."
        note="Support your people. Brighter futures together."
      />

      {onboarding && !onboarding.complete && <ActivationChecklist data={onboarding} onChanged={() => void reload()} />}

      {overview ? (
        <Live overview={overview} />
      ) : can("reports.view") ? (
        <ErrorState what="the dashboard numbers" onRetry={() => void reload()} />
      ) : null}
    </div>
  );
}

function Live({ overview }: { overview: OrgOverview }) {
  const { seats, applications: a } = overview;
  const none = seats.sharing === 0;
  const total = a.pipeline.reduce((n, s) => n + s.count, 0);
  const display = useDateDisplay();

  return (
    <>
      <div className="grid grid-cols-2 gap-2.5 sm:gap-3.5 xl:grid-cols-4" data-dashboard-tiles>
        <StatTile tone="blue" icon={<UsersIcon size={24} />} value={seats.active} label="Active people" sublabel={seats.invited > 0 ? `${seats.invited} invited` : undefined} />
        <StatTile
          tone="green"
          icon={<FileTextIcon size={24} />}
          value={a.submitted30d}
          label="Applications sent"
          sublabel={none ? "Nobody is sharing yet" : `last 30 days · ${seats.sharing} sharing`}
        />
        <StatTile tone="amber" icon={<CalendarIcon size={24} />} value={a.upcomingInterviews} label="Interviews coming up" sublabel={a.interviewing > 0 ? `${a.interviewing} in progress` : undefined} />
        <StatTile tone="violet" icon={<TrophyIcon size={24} />} value={a.placedMembers} label="People placed" sublabel={a.offers > 0 ? `${a.offers} offers out` : undefined} />
      </div>

      <SectionCard title="Placement pipeline" subtitle={none ? undefined : `From the ${seats.sharing} ${seats.sharing === 1 ? "person" : "people"} sharing their progress`}>
        {total > 0 ? (
          <>
            <div className="flex h-4 gap-0.5 overflow-hidden rounded-full" role="img" aria-label={`Placement pipeline: ${a.pipeline.map((s) => `${STAGE_LABEL[s.stage] ?? s.stage} ${s.count}`).join(", ")}`}>
              {a.pipeline
                .filter((s) => s.count > 0)
                .map((s) => (
                  <span key={s.stage} className={cn("h-full", TONE[STAGE_TONE[s.stage] ?? "slate"].solid)} style={{ width: `${(s.count / total) * 100}%` }} />
                ))}
            </div>
            <ul className="mt-3.5 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-5">
              {a.pipeline.map((s) => (
                <li key={s.stage} className="flex items-center gap-2">
                  <span className={cn("h-2.5 w-2.5 flex-none rounded-full", TONE[STAGE_TONE[s.stage] ?? "slate"].solid)} />
                  <span className="text-[13px] text-ink-soft">{STAGE_LABEL[s.stage] ?? s.stage}</span>
                  <span className="text-[14px] font-extrabold text-v2-navy">{s.count}</span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <EmptyState
            variant="inline"
            title={none ? "No progress to show yet" : "No applications yet"}
            description={
              none
                ? "Once people join and choose to share their progress, the pipeline shows up here. You only ever see what they share."
                : "The people sharing with you haven't applied anywhere yet."
            }
          />
        )}
      </SectionCard>

      {overview.recent.length > 0 && (
        <SectionCard title="Recent activity">
          <ActivityTimeline
            items={overview.recent.map((r) => {
              const c = activityCopy(r.action, r.mine);
              return { id: String(r.id), title: c.title, sub: r.mine ? "You" : "Your team", when: formatDate(r.at, WHEN, display), tone: c.tone };
            })}
          />
        </SectionCard>
      )}
    </>
  );
}
