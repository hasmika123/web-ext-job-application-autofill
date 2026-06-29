import type { Metadata } from "next";
import { serverApiFetch } from "@/lib/api";

export const metadata: Metadata = {
  title: "System · Admin · Kiwiply",
  robots: { index: false, follow: false },
};

// Read-only ops view (Phase 9.A2.4) over the already-exposed, ADMIN-gated actuator endpoints
// (health / info / jhimetrics / loggers). Everything is rendered defensively — a missing or
// shape-shifted field shows "—" rather than breaking the page.

async function fetchJson(path: string): Promise<Record<string, unknown> | null> {
  try {
    const res = await serverApiFetch(path);
    if (!res.ok) return null;
    return (await res.json().catch(() => null)) as Record<string, unknown> | null;
  } catch {
    return null;
  }
}

function asRecord(v: unknown): Record<string, unknown> | undefined {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : undefined;
}

function num(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function bytes(n?: number): string {
  if (n === undefined) return "—";
  const mb = n / (1024 * 1024);
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${Math.round(mb)} MB`;
}

function duration(seconds?: number): string {
  if (seconds === undefined) return "—";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export default async function AdminSystemPage() {
  const [health, info, metrics, loggers] = await Promise.all([
    fetchJson("/management/health"),
    fetchJson("/management/info"),
    fetchJson("/management/jhimetrics"),
    fetchJson("/management/loggers"),
  ]);

  const status = typeof health?.status === "string" ? (health.status as string) : "UNKNOWN";
  const components = asRecord(health?.components);

  const build = asRecord(info?.build);
  const version = (typeof build?.version === "string" && build.version) || "—";
  const appName =
    (typeof build?.name === "string" && build.name) || (typeof build?.artifact === "string" && (build.artifact as string)) || "—";
  const profilesArr = Array.isArray(info?.activeProfiles)
    ? (info!.activeProfiles as unknown[]).filter((p): p is string => typeof p === "string")
    : [];
  const profiles = profilesArr.length ? profilesArr.join(", ") : "—";

  const process = asRecord(metrics?.processMetrics);
  const uptime = num(process?.["process.uptime"]);
  const cpuCount = num(process?.["system.cpu.count"]);
  // jhimetrics reports jvm memory keyed by pool ({ <pool>: { used, max, committed } }); sum them.
  const jvm = asRecord(metrics?.jvm);
  let memUsed = 0;
  let memMax = 0;
  let haveMem = false;
  if (jvm) {
    for (const v of Object.values(jvm)) {
      const pool = asRecord(v);
      const u = num(pool?.used);
      const m = num(pool?.max);
      if (u !== undefined) {
        memUsed += u;
        haveMem = true;
      }
      if (m !== undefined && m > 0) memMax += m;
    }
  }

  const loggerMap = asRecord(loggers?.loggers);
  const pickLogger = (name: string): string => {
    const l = asRecord(loggerMap?.[name]);
    return (typeof l?.effectiveLevel === "string" && (l.effectiveLevel as string)) || "—";
  };

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-6">
        <h1 className="font-display text-[26px] font-bold tracking-tight text-ink">System</h1>
        <p className="mt-1 text-sm text-ink-soft">Read-only health, build, runtime, and log levels from the live API.</p>
      </header>

      {/* Health */}
      <section className="mb-5 rounded-[var(--radius)] border border-line bg-paper p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-soft">Health</h2>
          <StatusBadge status={status} />
        </div>
        {components ? (
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {Object.entries(components).map(([name, c]) => {
              const cs = typeof asRecord(c)?.status === "string" ? (asRecord(c)!.status as string) : "UNKNOWN";
              return (
                <div key={name} className="flex items-center justify-between rounded-[var(--radius)] border border-line px-3 py-2 text-sm">
                  <span className="text-ink">{name}</span>
                  <StatusBadge status={cs} small />
                </div>
              );
            })}
          </div>
        ) : (
          <p className="mt-2 text-sm text-ink-soft">Component details unavailable.</p>
        )}
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Build / info */}
        <section className="rounded-[var(--radius)] border border-line bg-paper p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-soft">Build</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <Row label="Version" value={version} mono />
            <Row label="App" value={appName} mono />
            <Row label="Profiles" value={profiles} mono />
          </dl>
        </section>

        {/* Runtime */}
        <section className="rounded-[var(--radius)] border border-line bg-paper p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-soft">Runtime</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <Row label="Uptime" value={duration(uptime)} />
            <Row label="CPUs" value={cpuCount !== undefined ? String(cpuCount) : "—"} />
            <Row label="JVM memory" value={haveMem ? `${bytes(memUsed)}${memMax ? ` / ${bytes(memMax)}` : ""}` : "—"} />
          </dl>
        </section>
      </div>

      {/* Loggers */}
      <section className="mt-5 rounded-[var(--radius)] border border-line bg-paper p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-soft">Log levels</h2>
        {loggerMap ? (
          <dl className="mt-3 space-y-2 text-sm">
            <Row label="ROOT" value={pickLogger("ROOT")} mono />
            <Row label="com.dossier.api" value={pickLogger("com.dossier.api")} mono />
            <Row label="org.springframework" value={pickLogger("org.springframework")} mono />
          </dl>
        ) : (
          <p className="mt-2 text-sm text-ink-soft">Logger levels unavailable.</p>
        )}
      </section>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-ink-soft">{label}</dt>
      <dd className={mono ? "font-mono text-[13px] text-ink" : "text-ink"}>{value}</dd>
    </div>
  );
}

function StatusBadge({ status, small }: { status: string; small?: boolean }) {
  const up = status === "UP";
  const cls = up ? "bg-accent/15 text-ink" : status === "UNKNOWN" ? "bg-paper-2 text-ink-soft ring-1 ring-line" : "bg-danger/15 text-danger";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 ${small ? "text-[11px]" : "text-xs"} font-semibold ${cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${up ? "bg-accent" : status === "UNKNOWN" ? "bg-ink-soft/50" : "bg-danger"}`} />
      {status}
    </span>
  );
}
