import { BarChartIcon, CrownIcon, EyeIcon, UserIcon, UsersIcon } from "@kiwiply/ui";
import { Donut, InitialsAvatar } from "@/components/app-v2/common";
import UsersTable, { type AdminUser } from "@/components/admin/UsersTable";
import { AdminHero, AdminPanel, AdminStatTiles, HBarList, LegendList, SampleTag } from "../common";
import { RECENT_ACCOUNT_ACTIONS, ROLE_DISTRIBUTION, USERS_TILE_EXTRAS as X, USER_SEGMENTS } from "../sample-data";

const ROLE_ICON = { crown: <CrownIcon size={16} />, users: <UsersIcon size={16} />, eye: <EyeIcon size={16} />, user: <UserIcon size={16} /> };

/**
 * Users (boards 9 / 17). REAL: the user list + paging + total (`/api/admin/users`), "Active users
 * (7d)" (`/api/admin/analytics`), and every per-user action (on the detail page). SAMPLE (tagged):
 * pending invites / suspended tiles, trends, segments, role distribution, recent account actions.
 */
export default function UsersPage({
  users,
  total,
  page,
  pageSize,
  error,
  active7d,
  initialQuery,
}: {
  users: AdminUser[];
  total: number;
  page: number;
  pageSize: number;
  error: boolean;
  active7d?: number;
  initialQuery?: string;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="mx-auto max-w-[1500px] space-y-4">
      <AdminHero
        title="Users"
        subtitle="Manage user accounts, roles, access, and activity across Kiwiply."
        note="Great people make Kiwiply amazing!"
      />

      <AdminStatTiles
        stats={[
          { label: "Total users", value: error ? "n/a" : total.toLocaleString("en-US"), icon: <UsersIcon size={26} />, tone: "blue", delta: X.total.delta, caption: "vs last 30 days", sparkline: X.total.spark },
          { label: "Active users (7d)", value: active7d === undefined ? "n/a" : active7d.toLocaleString("en-US"), icon: <BarChartIcon size={26} />, tone: "green", delta: X.active.delta, caption: "vs previous 7 days", sparkline: X.active.spark },
          { label: "Pending invites", value: X.pending.value, icon: <UserIcon size={26} />, tone: "amber", delta: X.pending.delta, caption: "sample data", sparkline: X.pending.spark },
          { label: "Suspended users", value: X.suspended.value, icon: <UserIcon size={26} />, tone: "coral", delta: X.suspended.delta, caption: "sample data", sparkline: X.suspended.spark },
        ]}
      />

      {error ? (
        <div className="rounded-2xl border border-v2-line/70 bg-paper p-6 text-sm text-ink-soft">
          The user list couldn&apos;t be loaded. Check that the API is reachable and try again.
        </div>
      ) : (
        <UsersTable users={users} total={total} page={page} pageSize={pageSize} totalPages={totalPages} initialQuery={initialQuery} />
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <AdminPanel title="User segments" description="Breakdown of users by account type." right={<SampleTag />}>
          <div className="flex flex-col items-center gap-4 sm:flex-row">
            <Donut
              legend={false}
              size={132}
              centerValue="1,284"
              centerLabel="users"
              segments={USER_SEGMENTS.map((s) => ({ label: s.label, value: s.value, tone: s.tone, pct: s.pct }))}
            />
            <LegendList items={USER_SEGMENTS.map((s) => ({ label: s.label, tone: s.tone, value: s.value.toLocaleString("en-US"), pct: `${s.pct}%` }))} />
          </div>
        </AdminPanel>

        <AdminPanel title="Role distribution" description="Users by role and permissions level." right={<SampleTag />}>
          <HBarList
            items={ROLE_DISTRIBUTION.map((r) => ({
              label: r.label,
              icon: ROLE_ICON[r.icon],
              value: r.value,
              tone: r.tone,
              display: r.value.toLocaleString("en-US"),
              pct: `${r.pct}%`,
            }))}
          />
        </AdminPanel>

        <AdminPanel
          className="md:col-span-2 xl:col-span-1"
          title="Recent account actions"
          description="Latest user-related activity across the platform."
          link={{ label: "View all", href: "/admin/audit" }}
        >
          <ul className="space-y-3">
            {RECENT_ACCOUNT_ACTIONS.map((a) => (
              <li key={a.who + a.when} className="flex items-start gap-2.5">
                <InitialsAvatar name={a.who} size={30} />
                <span className="min-w-0 flex-1 leading-tight">
                  <span className="block text-[13px] font-semibold text-ink">{a.who}</span>
                  <span className="block text-[12px] text-ink-soft">{a.what}</span>
                </span>
                <span className="flex-none text-[11.5px] text-v2-muted">{a.when}</span>
              </li>
            ))}
          </ul>
          <SampleTag className="mt-3" />
        </AdminPanel>
      </div>
    </div>
  );
}
