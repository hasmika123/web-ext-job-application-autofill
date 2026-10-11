import { BriefcaseIcon, CheckCircleIcon, MailIcon, RocketIcon } from "../common-local/icons";
import {
  CompanyTile,
  Donut,
  InitialsAvatar,
  Progress,
  RailLayout,
  SectionCard,
  StatRow,
} from "../common-local";
import OrgPageHero from "../shell/OrgPageHero";
import { OPPORTUNITIES_STATS, PIPELINE_DONUT, RECENT_ASSIGNMENTS, TOP_HIRING } from "../sample-data";
import OpportunitiesTable from "./OpportunitiesTable";

/** /org/opportunities (APP-V2-SPEC §6.8). */
export default function OpportunitiesPage() {
  return (
    <div className="space-y-4">
      <OrgPageHero
        title="Job Opportunities"
        icon={<BriefcaseIcon className="h-8 w-8" />}
        subtitle="Discover and assign high-impact roles for your employees."
        note="More opportunities. Brighter futures together."
      />
      <StatRow
        stats={OPPORTUNITIES_STATS}
        icons={{
          open: <BriefcaseIcon size={24} />,
          assigned: <CheckCircleIcon size={24} />,
          responses: <MailIcon size={24} />,
          placements: <RocketIcon size={24} />,
        }}
      />
      <RailLayout
        main={<OpportunitiesTable />}
        rail={
          <>
            <SectionCard title="Top Hiring Companies" action={{ label: "View all", href: "/org/opportunities" }}>
              <ul className="space-y-3.5">
                {TOP_HIRING.map((c) => (
                  <li key={c.company} className="flex items-center gap-3">
                    <CompanyTile name={c.company} size={32} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="truncate text-[13px] font-bold text-v2-navy">{c.company}</p>
                        <p className="flex-none text-[12px] text-v2-muted">{c.roles} roles</p>
                      </div>
                      <Progress value={c.pct * 3} tone={c.tone} className="mt-1.5" label={`${c.company} share`} />
                    </div>
                    <span className="w-9 flex-none text-right text-[12.5px] font-medium tabular-nums text-v2-ink-soft">{c.pct}%</span>
                  </li>
                ))}
              </ul>
            </SectionCard>
            <SectionCard title="Opportunity Pipeline" action={{ label: "View all", href: "/org/opportunities" }}>
              <Donut centerValue="48" centerLabel="Roles" segments={PIPELINE_DONUT.map((s) => ({ ...s }))} />
            </SectionCard>
            <SectionCard title="Recent Assignments" action={{ label: "View all", href: "/org/opportunities" }} className="md:col-span-2 xl:col-span-1">
              <ul className="space-y-3">
                {RECENT_ASSIGNMENTS.map((a) => (
                  <li key={a.id} className="flex items-center gap-3">
                    <InitialsAvatar name={a.name} size={34} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-bold leading-tight text-v2-navy">{a.name}</p>
                      <p className="truncate text-[12px] leading-tight text-v2-muted">
                        {a.role} at {a.company}
                      </p>
                    </div>
                    <span className="flex-none text-[11.5px] text-v2-muted">{a.ago}</span>
                    <CompanyTile name={a.company} size={28} />
                  </li>
                ))}
              </ul>
            </SectionCard>
          </>
        }
      />
    </div>
  );
}
