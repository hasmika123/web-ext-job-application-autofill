"use client";

import type { ReactNode } from "react";
import {
  AlertIcon,
  BarChartIcon,
  BellIcon,
  BuildingIcon,
  CheckCircleIcon,
  ClockIcon,
  CreditCardIcon,
  DownloadIcon,
  FileTextIcon,
  GearIcon,
  GlobeIcon,
  LayersIcon,
  MailIcon,
  MonitorIcon,
  NetworkIcon,
  RefreshIcon,
  SlidersIcon,
  UsersIcon,
  ZapIcon,
  cn,
} from "@kiwiply/ui";
import { useToast } from "@/components/ui";
import { DataTable, Sparkline, TONE, type Tone } from "@/components/app-v2/common";
import DemoAccountsCard from "@/components/admin/DemoAccountsCard";
import type { DemoAdminState } from "@/lib/demo";
import { AdminHero, AdminPanel, AdminStatTiles, SampleTag, StatusDot } from "../common";
import { DEPLOYMENTS, ENV_SAMPLE, EVENTS, HEALTH_FALLBACK, JOBS, LEVEL_TONE, RESOURCES, SYSTEM_TILES as T } from "./sample-data";

export interface SystemData {
  /** Overall actuator status ("UP", "DOWN", "UNKNOWN"). */
  status: string;
  /** Real actuator health components, or null when the API did not report any. */
  components: { name: string; status: string }[] | null;
  version: string;
  appName: string;
  profiles: string;
  uptime: string;
  cpuCount: string;
  /** "412 MB / 1.0 GB" or "—". */
  memory: string;
  /** 0-100, or undefined when memory could not be read. */
  memoryPct?: number;
  loggers: { name: string; level: string }[] | null;
  demo: DemoAdminState | null;
}

const isUp = (s: string) => s === "UP";
const healthLabel = (s: string) => (isUp(s) ? "Healthy" : s === "UNKNOWN" ? "Unknown" : s === "OUT_OF_SERVICE" ? "Out of service" : "Down");
const healthTone = (s: string): Tone => (isUp(s) ? "green" : s === "UNKNOWN" ? "slate" : "coral");
const titleCase = (s: string) => s.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase());

/**
 * System (board 11). REAL: overall + per-component health, build version / app / profiles, process
 * uptime, CPU count, JVM memory, the log levels, and the Demo accounts card (switch + reset, same
 * BFF routes as before). SAMPLE (tagged): latency / jobs / error tiles, response times, deployments,
 * background-job queue, system events, extra environment rows, disk / network. The four quick
 * actions have no backend yet and say "Coming soon".
 */
export default function SystemPage({ data }: { data: SystemData }) {
  const toast = useToast();
  const soon = (what: string) => () => toast({ title: "Coming soon", description: `${what} isn't wired up in the admin console yet.` });
  const operational = isUp(data.status);

  const rows = data.components
    ? data.components.map((c) => ({ name: titleCase(c.name), status: c.status, ms: "—", last: "—" }))
    : HEALTH_FALLBACK.map((c) => ({ name: c.name, status: "UP", ms: c.ms, last: c.last }));

  return (
    <div className="mx-auto max-w-[1500px] space-y-4">
      <AdminHero
        title="System"
        subtitle="Monitor platform health, services, background jobs, logs, and infrastructure status."
        note="Keeping Kiwiply running smoothly!"
      />

      <AdminStatTiles
        stats={[
          { label: "Application uptime", value: data.uptime, icon: <ZapIcon size={26} />, tone: "blue", delta: T.uptime.delta, caption: "sample trend", sparkline: T.uptime.spark },
          { label: "API latency (P95)", value: T.latency.value, icon: <BarChartIcon size={26} />, tone: "green", delta: T.latency.delta, caption: "sample data", sparkline: T.latency.spark },
          { label: "Background jobs", value: T.jobs.value, icon: <GearIcon size={26} />, tone: "amber", delta: T.jobs.delta, caption: "sample data", sparkline: T.jobs.spark },
          { label: "Error rate", value: T.errors.value, icon: <AlertIcon size={26} />, tone: "coral", delta: T.errors.delta, caption: "sample data", sparkline: T.errors.spark },
        ]}
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-4">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
            <AdminPanel
              title="System health"
              description="Real-time status of core services and infrastructure."
              right={
                <span
                  className={cn(
                    "inline-flex flex-none items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1 text-[12px] font-semibold",
                    TONE[healthTone(data.status)].soft,
                    TONE[healthTone(data.status)].ink,
                  )}
                >
                  <span aria-hidden className={cn("h-2 w-2 rounded-full", TONE[healthTone(data.status)].solid)} />
                  {operational ? "All systems operational" : data.status === "UNKNOWN" ? "Status unavailable" : `Status: ${data.status}`}
                </span>
              }
            >
              <DataTable
                inCard
                noActions
                minWidth={420}
                aria-label="System health"
                rows={rows}
                rowKey={(r) => r.name}
                columns={[
                  { key: "service", header: "SERVICE", primary: true, render: (r) => <span className="font-medium text-ink">{r.name}</span> },
                  { key: "status", header: "STATUS", render: (r) => <StatusDot status={healthLabel(r.status)} tone={healthTone(r.status)} /> },
                  { key: "ms", header: "RESPONSE TIME", render: (r) => <span className="text-ink-soft">{r.ms}</span> },
                  { key: "last", header: "LAST CHECK", render: (r) => <span className="whitespace-nowrap text-ink-soft">{r.last}</span> },
                ]}
              />
              {!data.components && <SampleTag className="mt-3" />}
              {data.components && <p className="mt-3 text-[11.5px] text-v2-muted">Response time and last check are not reported by the API yet.</p>}
            </AdminPanel>

            <AdminPanel title="Recent deployments" description="Latest releases and deployments to the platform." right={<SampleTag />}>
              <ul className="space-y-3">
                {DEPLOYMENTS.map((d) => (
                  <li key={d.version} className="flex items-start gap-2.5">
                    <span aria-hidden className={cn("mt-1.5 h-2.5 w-2.5 flex-none rounded-full", d.env === "Production" ? TONE.green.solid : TONE.blue.solid)} />
                    <span className="w-[54px] flex-none pt-0.5 text-[12.5px] font-bold tabular-nums text-ink">{d.version}</span>
                    <span className="min-w-0 flex-1 leading-tight">
                      <span className="block truncate text-[13px] font-semibold text-ink">{d.title}</span>
                      <span className="block truncate text-[11.5px] text-v2-muted">{d.meta}</span>
                    </span>
                    <span className={cn("hidden flex-none rounded-full px-2 py-0.5 text-[11px] font-semibold sm:inline", d.env === "Production" ? "bg-v2-green-soft text-v2-green-ink" : "bg-v2-blue-soft text-v2-blue-ink")}>
                      {d.env}
                    </span>
                  </li>
                ))}
              </ul>
            </AdminPanel>
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
            <AdminPanel title="Background jobs queue" description="Live view of background job processing." right={<SampleTag />}>
              <DataTable
                inCard
                noActions
                minWidth={460}
                aria-label="Background jobs"
                rows={JOBS}
                rowKey={(j) => j.name}
                columns={[
                  { key: "name", header: "JOB NAME", primary: true, render: (j) => <span className="font-medium text-ink">{j.name}</span> },
                  { key: "queue", header: "QUEUE", render: (j) => <span className="text-ink-soft">{j.queue}</span> },
                  { key: "status", header: "STATUS", render: (j) => <StatusDot status={j.status} tone={j.status === "Running" ? "green" : "amber"} /> },
                  { key: "processed", header: "PROCESSED", render: (j) => <span className="whitespace-nowrap tabular-nums text-ink-soft">{j.processed}</span> },
                  { key: "duration", header: "DURATION", render: (j) => <span className="whitespace-nowrap text-ink-soft">{j.duration}</span> },
                ]}
              />
            </AdminPanel>

            <AdminPanel title="Recent system events" description="Latest important system events and incidents." right={<SampleTag />}>
              <ul className="divide-y divide-v2-line/60">
                {EVENTS.map((e) => (
                  <li key={e.text} className="grid grid-cols-[84px_74px_minmax(0,1fr)] items-start gap-2 py-2.5 text-[12.5px] first:pt-0 last:pb-0">
                    <span className="text-v2-muted">{e.when}</span>
                    <StatusDot status={e.level} tone={LEVEL_TONE[e.level]} />
                    <span className="min-w-0 text-ink">{e.text}</span>
                  </li>
                ))}
              </ul>
            </AdminPanel>
          </div>

          <AdminPanel title="Resource usage" description="Infrastructure resource usage over time." right={<SampleTag />}>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Resource icon={<BarChartIcon size={18} />} label="CPU usage" value={RESOURCES.cpu.value} sub={`${data.cpuCount} CPUs (real)`} spark={RESOURCES.cpu.spark} tone={RESOURCES.cpu.tone} />
              <Resource
                icon={<LayersIcon size={18} />}
                label="Memory usage"
                value={data.memoryPct !== undefined ? `${data.memoryPct}%` : "—"}
                sub={`JVM ${data.memory} (real)`}
                spark={RESOURCES.memory.spark}
                tone={RESOURCES.memory.tone}
              />
              <Resource icon={<MonitorIcon size={18} />} label="Disk usage" value={RESOURCES.disk.value} sub={RESOURCES.disk.sub} spark={RESOURCES.disk.spark} tone={RESOURCES.disk.tone} />
              <Resource icon={<NetworkIcon size={18} />} label="Network I/O" value={RESOURCES.network.value} sub={RESOURCES.network.sub} spark={RESOURCES.network.spark} tone={RESOURCES.network.tone} />
            </div>
          </AdminPanel>

          <div className="grid gap-4 lg:grid-cols-2">
            <DemoAccountsCard initial={data.demo} />
            <AdminPanel title="Log levels" description="Effective levels reported by the live API.">
              {data.loggers ? (
                <dl className="space-y-2.5 text-[13px]">
                  {data.loggers.map((l) => (
                    <Row key={l.name} label={l.name} value={l.level} mono />
                  ))}
                </dl>
              ) : (
                <p className="text-sm text-ink-soft">Logger levels unavailable.</p>
              )}
            </AdminPanel>
          </div>
        </div>

        <div className="grid min-w-0 content-start gap-4 md:grid-cols-2 xl:grid-cols-1">
          <AdminPanel title="Quick actions" description="Common system administration tasks.">
            <div className="space-y-2.5">
              <ActionTile icon={<FileTextIcon size={22} />} tone="blue" title="View system logs" description="Access application, API, and infrastructure logs." onClick={soon("System logs")} />
              <ActionTile icon={<RefreshIcon size={22} />} tone="blue" title="Restart background jobs" description="Safely restart queued jobs and workers." onClick={soon("Restarting jobs")} />
              <ActionTile icon={<SlidersIcon size={22} />} tone="pink" title="Toggle maintenance mode" description="Enable or disable maintenance mode for the platform." onClick={soon("Maintenance mode")} />
              <ActionTile icon={<DownloadIcon size={22} />} tone="green" title="Export diagnostics" description="Download system diagnostics and health reports." onClick={soon("Diagnostics export")} />
            </div>
          </AdminPanel>

          <AdminPanel title="Environment & configuration" description="Current environment settings and key configuration.">
            <dl className="space-y-3 text-[12.5px]">
              <EnvRow icon={<GlobeIcon size={15} />} label="App" value={data.appName} mono />
              <EnvRow icon={<LayersIcon size={15} />} label="Version" value={data.version} mono />
              <EnvRow icon={<BuildingIcon size={15} />} label="Profiles" value={data.profiles} mono />
              <EnvRow icon={<ClockIcon size={15} />} label="Uptime" value={data.uptime} />
              <EnvRow icon={<GearIcon size={15} />} label="CPUs" value={data.cpuCount} />
              <EnvRow icon={<MonitorIcon size={15} />} label="JVM memory" value={data.memory} />
              <EnvRow icon={<GlobeIcon size={15} />} label="Region" value={ENV_SAMPLE.region} />
              <EnvRow icon={<LayersIcon size={15} />} label="Cache" value={ENV_SAMPLE.cache} />
              <EnvRow icon={<BuildingIcon size={15} />} label="Storage" value={ENV_SAMPLE.storage} />
              <EnvRow icon={<UsersIcon size={15} />} label="Workers" value={ENV_SAMPLE.workers} />
              <EnvRow icon={<BellIcon size={15} />} label="Queue system" value={ENV_SAMPLE.queue} />
              <EnvRow icon={<CreditCardIcon size={15} />} label="Database" value={ENV_SAMPLE.database} />
              <EnvRow icon={<MailIcon size={15} />} label="CDN" value={ENV_SAMPLE.cdn} />
            </dl>
            <p className="mt-3 flex items-center gap-1.5 text-[11.5px] text-v2-muted">
              <CheckCircleIcon size={13} /> App through JVM memory are live; the rest are <SampleTag />
            </p>
          </AdminPanel>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="min-w-0 truncate text-ink-soft">{label}</dt>
      <dd className={cn("flex-none text-ink", mono && "font-mono text-[12.5px]")}>{value}</dd>
    </div>
  );
}

function EnvRow({ icon, label, value, mono }: { icon: ReactNode; label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex-none text-v2-muted">{icon}</span>
      <dt className="w-[88px] flex-none text-ink-soft">{label}</dt>
      <dd className={cn("min-w-0 flex-1 truncate text-right font-semibold text-ink", mono && "font-mono text-[12px]")} title={value}>
        {value}
      </dd>
    </div>
  );
}

function ActionTile({ icon, tone, title, description, onClick }: { icon: ReactNode; tone: Tone; title: string; description: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="group flex w-full min-w-0 items-center gap-3 rounded-2xl bg-paper-2/70 p-3 text-left transition-colors hover:bg-paper-2">
      <span className={cn("grid h-11 w-11 flex-none place-items-center rounded-xl", TONE[tone].soft, TONE[tone].ink)}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13.5px] font-bold text-ink">{title}</span>
        <span className="mt-0.5 block text-[12px] leading-snug text-ink-soft">{description}</span>
      </span>
    </button>
  );
}

function Resource({ icon, label, value, sub, spark, tone }: { icon: ReactNode; label: string; value: string; sub: string; spark: number[]; tone: Tone }) {
  return (
    <div className="min-w-0 rounded-2xl border border-v2-line/70 p-3.5">
      <div className="flex items-center gap-2 text-[12.5px] font-semibold text-ink">
        <span className={cn("grid h-7 w-7 flex-none place-items-center rounded-lg", TONE[tone].soft, TONE[tone].ink)}>{icon}</span>
        {label}
      </div>
      <div className="mt-2 flex items-end justify-between gap-2">
        <div className="min-w-0">
          <div className="font-display text-[22px] font-extrabold leading-none text-ink">{value}</div>
          <div className="mt-1 truncate text-[11.5px] text-v2-muted">{sub}</div>
        </div>
        <Sparkline points={spark} tone={tone} width={72} height={34} />
      </div>
    </div>
  );
}
