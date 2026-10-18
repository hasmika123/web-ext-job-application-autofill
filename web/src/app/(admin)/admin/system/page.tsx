import type { Metadata } from "next";
import { serverApiFetch } from "@/lib/api";
import SystemPage from "@/components/admin-v3/system/SystemPage";
import type { DemoAdminState } from "@/lib/demo";

export const metadata: Metadata = {
  title: "System · Admin",
  robots: { index: false, follow: false },
};

// Server half of the System page: fetches the actuator + demo setting; SystemPage renders it.
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

/** The demo status (read-only; config-controlled) + accounts (null when the API can't be read; the card then says so). */
async function fetchDemoState(): Promise<DemoAdminState | null> {
  const data = await fetchJson("/api/admin/settings/demo");
  if (!data || typeof data.enabled !== "boolean" || !Array.isArray(data.accounts)) return null;
  return {
    enabled: data.enabled,
    accounts: data.accounts as DemoAdminState["accounts"],
  };
}

export default async function AdminSystemPage() {
  const [demo, health, info, metrics, loggers] = await Promise.all([
    fetchDemoState(),
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

  const loggerList = loggerMap
    ? ["ROOT", "com.dossier.api", "org.springframework"].map((name) => ({ name, level: pickLogger(name) }))
    : null;
  const comps = components
    ? Object.entries(components).map(([name, c]) => ({
        name,
        status: typeof asRecord(c)?.status === "string" ? (asRecord(c)!.status as string) : "UNKNOWN",
      }))
    : null;

  return (
    <SystemPage
      data={{
        status,
        components: comps && comps.length ? comps : null,
        version,
        appName,
        profiles,
        uptime: duration(uptime),
        cpuCount: cpuCount !== undefined ? String(cpuCount) : "—",
        memory: haveMem ? `${bytes(memUsed)}${memMax ? ` / ${bytes(memMax)}` : ""}` : "—",
        memoryPct: haveMem && memMax ? Math.min(100, Math.round((memUsed / memMax) * 100)) : undefined,
        loggers: loggerList,
        demo,
      }}
    />
  );
}
