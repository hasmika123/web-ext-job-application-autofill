"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AiIcon, AlertIcon, ArrowLeftIcon, ClockIcon, DollarIcon, ErrorState, FileTextIcon, Switch } from "@kiwiply/ui";
import { aiFetch, latency, usd } from "@/lib/ai-admin";
import type { AiCallsSummary, AiCallsView, AiConfig } from "@/lib/ai-admin";
import { AdminHero, AdminPanel, AdminStatTiles } from "../common";
import { FieldError, Tick } from "./controls";
import HistoryDrawer from "./HistoryDrawer";
import PricingTable from "./PricingTable";
import ProviderCard from "./ProviderCard";
import RecentCalls from "./RecentCalls";
import RoutingTable from "./RoutingTable";
import { AiAdminProvider, useAiAdmin } from "./useAiAdmin";
import { useAiOps } from "./useAiOps";

const BTN =
  "inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-white/80 bg-paper/90 px-3 py-1.5 text-[13px] font-semibold text-ink shadow-v2-soft hover:bg-paper sm:min-h-0";
// config-literal-ok: how often the stat tiles re-read while the tab is visible (30 s)
const POLL_MS = 30_000;
const KEY = "global:enabled";

/** Shown when the deployment's DOSSIER_AI_ENABLED is false: the switches here can only lower it, never raise it. */
function EnvMasterNote() {
  return (
    <div role="status" className="flex items-start gap-2.5 rounded-2xl border border-v2-amber/40 bg-v2-amber-soft px-4 py-3 text-[13.5px] leading-snug text-v2-amber-ink">
      <AlertIcon size={18} className="mt-0.5 flex-none" />
      <p>AI is switched off for this deployment (DOSSIER_AI_ENABLED). Runtime switches can only lower it.</p>
    </div>
  );
}

/** The master kill switch. Off asks for a reason; where the deployment has AI off it can only show off. */
function ServerAiSwitch() {
  const a = useAiAdmin();
  const ops = useAiOps();
  const on = a.config.envMasterEnabled && a.shown(KEY, a.config.global.enabled.value);
  return (
    <div className="rounded-xl border border-white/80 bg-paper/90 px-3 py-1.5 shadow-v2-soft">
      <div className="flex min-h-11 items-center gap-2.5 sm:min-h-0">
        <span className="text-[13px] font-semibold text-ink">Server AI</span>
        <Switch aria-label="Server AI" checked={on} disabled={!a.config.envMasterEnabled} onCheckedChange={(v) => void ops.setGlobal(v)} />
        <span className="w-7 text-[12px] font-bold text-ink-soft">{on ? "ON" : "OFF"}</span>
        <Tick k={KEY} />
      </div>
      <FieldError k={KEY} />
    </div>
  );
}

function Body({ calls }: { calls: AiCallsView | null }) {
  const a = useAiAdmin();
  const { config } = a;
  const [summary, setSummary] = useState<AiCallsSummary | null>(calls?.summary ?? null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const historyBtn = useRef<HTMLButtonElement>(null);
  const external = a.refreshNonce;

  // The tiles are the last 24 h, re-read every 30 s while the tab is visible and after a Test connection.
  useEffect(() => {
    let cancelled = false;
    const read = async () => {
      const res = await aiFetch<AiCallsView>("GET", "/calls?hours=24&limit=1");
      if (!cancelled && res.ok) setSummary(res.data.summary);
    };
    if (external > 0) void read();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void read();
    }, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [external]);

  return (
    <div className="mx-auto max-w-[1500px] space-y-4">
      <AdminHero
        title="AI providers & routing"
        subtitle="Which model answers each task, what it costs, and whether it's working. Keys stay in the server's env."
        note="Pick a model, see it work!"
        actions={
          <>
            <ServerAiSwitch />
            <button type="button" ref={historyBtn} onClick={() => setHistoryOpen(true)} aria-haspopup="dialog" className={BTN}>
              <FileTextIcon size={14} /> Change history
            </button>
            <Link href="/admin/ai" className={BTN}>
              <ArrowLeftIcon size={14} /> AI usage
            </Link>
          </>
        }
      />
      {!config.envMasterEnabled && <EnvMasterNote />}

      {summary && (
        <AdminStatTiles
          stats={[
            { label: "Calls · 24 h", value: summary.calls.toLocaleString("en-US"), icon: <AiIcon size={26} />, tone: "blue" },
            {
              label: "Failed · 24 h",
              value: `${summary.failed.toLocaleString("en-US")} (${summary.failedPct}%)`,
              icon: <AlertIcon size={26} />,
              tone: summary.failed > 0 ? "coral" : "green",
            },
            { label: "p95 latency", value: latency(summary.p95LatencyMs), icon: <ClockIcon size={26} />, tone: "amber" },
            { label: "Spend · 24 h", value: usd(summary.costMicros), icon: <DollarIcon size={26} />, tone: "violet" },
          ]}
        />
      )}

      <AdminPanel title="Providers" description="Status, key presence and a live check for each provider.">
        <div className={config.providers.length > 1 ? "grid gap-3.5 lg:grid-cols-2 2xl:grid-cols-3" : "grid gap-3.5"}>
          {config.providers.map((p) => (
            <ProviderCard key={p.id} provider={p} roomy={config.providers.length === 1} />
          ))}
        </div>
      </AdminPanel>

      <AdminPanel title="Routing" description="Which provider and model answers each task. Changes save as you make them; Undo stays for six seconds.">
        <RoutingTable />
      </AdminPanel>

      <AdminPanel title="Pricing" description="USD per million tokens. What a call costs is worked out from these.">
        <PricingTable />
      </AdminPanel>

      <AdminPanel title="Recent calls & errors" description="What the AI actually did, newest first. Failed calls show why.">
        <RecentCalls initial={calls} />
      </AdminPanel>

      <HistoryDrawer open={historyOpen} onClose={() => setHistoryOpen(false)} returnFocusTo={historyBtn} />
    </div>
  );
}

/**
 * Admin AI providers & routing (I1.12 / I1.13; docs/AI-ADMIN-CONFIG-DESIGN.md section 5). The server page passes `/config`
 * and the 24 h `/calls` answer; every control here saves itself through the BFF (`/api/admin/ai/**`) with a ✓ and an
 * Undo. Keys never appear: only "present" and the env var NAME.
 */
export default function AiProvidersPage({ config, calls }: { config: AiConfig | null; calls: AiCallsView | null }) {
  if (!config) {
    return (
      <div className="mx-auto max-w-[1500px] space-y-4">
        <AdminHero title="AI providers & routing" subtitle="Which model answers each task, what it costs, and whether it's working. Keys stay in the server's env." />
        <ErrorState what="AI providers" description="The API didn't answer. Check that it's running." />
      </div>
    );
  }
  return (
    <AiAdminProvider initial={config}>
      <Body calls={calls} />
    </AiAdminProvider>
  );
}
