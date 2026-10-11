"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import {
  AlertIcon,
  CheckCircleIcon,
  ClockIcon,
  DashboardIcon,
  EyeIcon,
  LockIcon,
  MonitorIcon,
  ShieldCheckIcon,
  UserIcon,
  UsersIcon,
  cn,
} from "@kiwiply/ui";
import { DataTable, StatusChip, type Tone } from "@/components/app-v2/common";
import {
  AdminHero,
  AdminLinkTile,
  AdminPanel,
  AdminStatTiles,
  AdminTabs,
  RoleChip,
  SampleTag,
  StatusDot,
} from "../common";
import {
  BLOCKED_IPS,
  PASSWORD_RESETS,
  POLICIES,
  ROLES_MATRIX,
  SECURITY_EVENTS,
  SECURITY_TILES as T,
  SESSIONS_SAMPLE,
  SUSPICIOUS_ALERTS,
  type Severity,
} from "../sample-data";

const SEV_TONE: Record<Severity, Tone> = { Low: "green", Medium: "amber", High: "coral" };
const SEV_DOT: Record<Severity, Tone> = { Low: "green", Medium: "blue", High: "coral" };

function SevChip({ s }: { s: Severity }) {
  return <StatusChip tone={SEV_TONE[s]}>{s}</StatusChip>;
}

const TABS = [
  { id: "overview", label: "Overview", icon: <DashboardIcon /> },
  { id: "roles", label: "Roles & Permissions", icon: <UserIcon /> },
  { id: "sessions", label: "Sessions", icon: <MonitorIcon /> },
  { id: "policies", label: "Policies", icon: <ShieldCheckIcon /> },
];

/**
 * /admin/security (board 17 security). Everything on this page is SAMPLE data: the console has no
 * security-events API yet (the nav item says "Soon"). The tabs are static client tabs.
 */
export default function SecurityPage() {
  const [tab, setTab] = useState("overview");
  return (
    <div className="mx-auto max-w-[1500px] space-y-4">
      <AdminHero
        title="Security"
        subtitle="Keep Kiwiply safe and secure: manage access, monitor activity, and enforce security policies."
        note="A safer Kiwiply for everyone!"
      />
      <p className="flex items-center gap-2 rounded-xl bg-v2-amber-soft px-3.5 py-2 text-[12.5px] text-v2-amber-ink">
        <SampleTag />
        Security monitoring is coming soon. Everything below is illustrative sample data, not live events.
      </p>
      <AdminStatTiles
        stats={[
          { label: "Active sessions", value: T.sessions.value, icon: <UsersIcon size={26} />, tone: "blue", delta: T.sessions.delta, caption: "vs last 30 days", sparkline: T.sessions.spark },
          { label: "Failed login attempts", value: T.failed.value, icon: <ShieldCheckIcon size={26} />, tone: "green", delta: T.failed.delta, caption: "vs last 30 days", sparkline: T.failed.spark },
          { label: "MFA adoption", value: T.mfa.value, icon: <LockIcon size={26} />, tone: "violet", delta: T.mfa.delta, caption: "vs last 30 days", sparkline: T.mfa.spark },
          { label: "Access requests", value: T.requests.value, icon: <UserIcon size={26} />, tone: "amber", delta: T.requests.delta, caption: "vs last 30 days", sparkline: T.requests.spark },
        ]}
      />
      <AdminTabs tabs={TABS} value={tab} onChange={setTab} ariaLabel="Security sections" />

      {tab === "overview" && <Overview />}
      {tab === "roles" && <Roles />}
      {tab === "sessions" && <Sessions />}
      {tab === "policies" && <Policies />}
    </div>
  );
}

function Overview() {
  return (
    <>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <AdminPanel title="Recent security events" description="Latest security-related activity across the platform." right={<SampleTag />}>
          <DataTable
            inCard
            noActions
            minWidth={560}
            rows={SECURITY_EVENTS}
            rowKey={(r) => r.time + r.event}
            columns={[
              { key: "time", header: "TIME", className: "whitespace-nowrap" },
              { key: "event", header: "EVENT", primary: true, render: (r) => <span className="font-medium text-ink">{r.event}</span> },
              { key: "user", header: "USER" },
              { key: "details", header: "DETAILS" },
              {
                key: "severity",
                header: "SEVERITY",
                render: (r) => <StatusDot status={r.severity} tone={SEV_DOT[r.severity]} className="text-ink" />,
              },
            ]}
          />
        </AdminPanel>
        <AdminPanel title="Access control" description="Manage roles, permissions, and user access." right={<SampleTag />}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            <AdminLinkTile href="/admin/security" icon={<UsersIcon size={22} />} tone="violet" title="Role management" description="Create and manage roles and permissions." bordered />
            <AdminLinkTile href="/admin/security" icon={<UserIcon size={22} />} tone="green" title="Access requests" description="Review and approve access requests." bordered />
            <AdminLinkTile href="/admin/security" icon={<MonitorIcon size={22} />} tone="blue" title="Active sessions" description="View and revoke user sessions." bordered />
            <AdminLinkTile href="/admin/security" icon={<LockIcon size={22} />} tone="coral" title="Permission matrix" description="Manage fine-grained permissions." bordered />
          </div>
        </AdminPanel>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <AdminPanel title="Suspicious activity alerts" description="Potential security risks and unusual activity." right={<SampleTag />}>
          <ul className="space-y-3">
            {SUSPICIOUS_ALERTS.map((a) => (
              <li key={a.title} className="flex items-center gap-3">
                <span className={cn("grid h-9 w-9 flex-none place-items-center rounded-lg", a.severity === "High" ? "bg-v2-coral-soft text-v2-coral-ink" : "bg-v2-amber-soft text-v2-amber-ink")}>
                  <AlertIcon size={18} />
                </span>
                <span className="min-w-0 flex-1 leading-tight">
                  <span className="block truncate text-[13px] font-semibold text-ink">{a.title}</span>
                  <span className="block truncate text-[12px] text-v2-muted">{a.detail}</span>
                </span>
                <span className="hidden flex-none text-[11.5px] text-v2-muted xl:block">{a.when}</span>
                <SevChip s={a.severity} />
              </li>
            ))}
          </ul>
        </AdminPanel>
        <AdminPanel title="Password reset logs" description="Recent password resets and recovery activity." right={<SampleTag />}>
          <DataTable
            inCard
            noActions
            minWidth={0}
            rows={PASSWORD_RESETS}
            rowKey={(r) => r.time + r.user}
            columns={[
              { key: "time", header: "TIME", className: "whitespace-nowrap" },
              { key: "user", header: "USER", primary: true },
              { key: "method", header: "METHOD" },
              { key: "status", header: "STATUS", render: (r) => <StatusChip tone={r.status === "Completed" ? "green" : "coral"}>{r.status}</StatusChip> },
            ]}
          />
        </AdminPanel>
        <AdminPanel title="Blocked IPs & failed attempts" description="IPs blocked for suspicious activity." right={<SampleTag />}>
          <DataTable
            inCard
            noActions
            minWidth={0}
            rows={BLOCKED_IPS}
            rowKey={(r) => r.ip}
            columns={[
              { key: "ip", header: "IP ADDRESS", primary: true, render: (r) => <span className="font-medium text-ink">{r.ip}</span> },
              { key: "attempts", header: "FAILED ATTEMPTS" },
              { key: "last", header: "LAST SEEN", className: "whitespace-nowrap" },
              { key: "status", header: "STATUS", render: (r) => <StatusChip tone={r.status === "Blocked" ? "coral" : "amber"}>{r.status}</StatusChip> },
            ]}
          />
        </AdminPanel>
      </div>
    </>
  );
}

function Roles() {
  return (
    <AdminPanel title="Roles & permissions" description="Who can do what across the platform." right={<SampleTag />}>
      <DataTable
        inCard
        noActions
        minWidth={560}
        rows={ROLES_MATRIX}
        rowKey={(r) => r.role}
        columns={[
          { key: "role", header: "Role", primary: true, render: (r) => <RoleChip role={r.role} /> },
          { key: "people", header: "People" },
          { key: "perms", header: "Permissions" },
        ]}
      />
    </AdminPanel>
  );
}

function Sessions() {
  return (
    <AdminPanel title="Active sessions" description="Signed-in devices. Revoke and force-logout arrive with Security." right={<SampleTag />}>
      <DataTable
        inCard
        noActions
        minWidth={560}
        rows={SESSIONS_SAMPLE}
        rowKey={(r) => r.user + r.started}
        columns={[
          { key: "user", header: "User", primary: true },
          { key: "device", header: "Device", render: (r) => <Cell icon={<MonitorIcon size={15} />}>{r.device}</Cell> },
          { key: "ip", header: "IP address" },
          { key: "started", header: "Started", render: (r) => <Cell icon={<ClockIcon size={15} />}>{r.started}</Cell> },
        ]}
      />
    </AdminPanel>
  );
}

function Policies() {
  return (
    <AdminPanel title="Security policies" description="How access is enforced today and what is planned." right={<SampleTag />}>
      <ul className="divide-y divide-v2-line/60">
        {POLICIES.map((p) => (
          <li key={p.name} className="flex items-center gap-3 py-3">
            <CheckCircleIcon size={18} className="flex-none text-v2-green" />
            <span className="min-w-0 flex-1">
              <span className="block text-[13.5px] font-semibold text-ink">{p.name}</span>
              <span className="block text-[12.5px] text-ink-soft">{p.value}</span>
            </span>
            <EyeIcon size={16} className="flex-none text-v2-muted" aria-hidden />
          </li>
        ))}
      </ul>
    </AdminPanel>
  );
}

function Cell({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="text-v2-muted">{icon}</span>
      {children}
    </span>
  );
}
