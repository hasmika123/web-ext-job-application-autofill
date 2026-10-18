import { CheckCircleIcon, ClipboardIcon, UserIcon, UsersIcon } from "@kiwiply/ui";
import {
  ActivityTimeline,
  Donut,
  InitialsAvatar,
  RailLayout,
  SectionCard,
  StatRow,
} from "@/components/app-v2/common";
import OrgPageHero from "../shell/OrgPageHero";
import { DEPARTMENTS, SUPPORT_OWNERS, TEAM_STATS, TIMELINE } from "../sample-data";
import TeamTable from "./TeamTable";

/** /org/team (APP-V2-SPEC §6.9; no board, composed in the same system). */
export default function TeamPage() {
  return (
    <div className="space-y-4">
      <OrgPageHero
        title="Team Management"
        icon={<UsersIcon className="h-8 w-8" />}
        subtitle="Manage employees, support owners, and roles across your organization."
        note="Build great careers together."
      />
      <StatRow
        stats={TEAM_STATS}
        icons={{
          employees: <UsersIcon size={24} />,
          seats: <CheckCircleIcon size={24} />,
          owners: <UserIcon size={24} />,
          attention: <ClipboardIcon size={24} />,
        }}
      />
      <RailLayout
        main={<TeamTable />}
        rail={
          <>
            <SectionCard title="Departments">
              <Donut centerValue="85" centerLabel="Employees" segments={DEPARTMENTS.map((d) => ({ ...d }))} />
            </SectionCard>
            <SectionCard title="Support Owners">
              <ul className="space-y-3">
                {SUPPORT_OWNERS.map((o) => (
                  <li key={o.name} className="flex items-center gap-3">
                    <InitialsAvatar name={o.name} size={32} />
                    <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-v2-navy">{o.name}</span>
                    <span className="flex-none text-[12.5px] text-v2-muted">{o.count} employees</span>
                  </li>
                ))}
              </ul>
            </SectionCard>
            <SectionCard title="Recent Activity" action={{ label: "View all", href: "/org/applications" }} className="md:col-span-2 xl:col-span-1">
              <ActivityTimeline items={TIMELINE} />
            </SectionCard>
          </>
        }
      />
    </div>
  );
}
