"use client";

import Link from "next/link";
import { AlertIcon, ArrowLeftIcon, ErrorState } from "@kiwiply/ui";
import type { AiCallsView, AiConfig } from "@/lib/ai-admin";
import { AdminHero, AdminPanel } from "../common";
import ProviderCard from "./ProviderCard";
import RoutingTable from "./RoutingTable";
import { AiAdminProvider, useAiAdmin } from "./useAiAdmin";

const BACK =
  "inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-white/80 bg-paper/90 px-3 py-1.5 text-[13px] font-semibold text-ink shadow-v2-soft hover:bg-paper sm:min-h-0";

/** Shown when the deployment's DOSSIER_AI_ENABLED is false: the switches here can only lower it, never raise it. */
function EnvMasterNote() {
  return (
    <div role="status" className="flex items-start gap-2.5 rounded-2xl border border-v2-amber/40 bg-v2-amber-soft px-4 py-3 text-[13.5px] leading-snug text-v2-amber-ink">
      <AlertIcon size={18} className="mt-0.5 flex-none" />
      <p>AI is switched off for this deployment (DOSSIER_AI_ENABLED). Runtime switches can only lower it.</p>
    </div>
  );
}

function Body({ calls }: { calls: AiCallsView | null }) {
  const { config } = useAiAdmin();
  void calls;
  return (
    <div className="mx-auto max-w-[1500px] space-y-4">
      <AdminHero
        title="AI providers & routing"
        subtitle="Which model answers each task, what it costs, and whether it's working. Keys stay in the server's env."
        note="Pick a model, see it work!"
        actions={
          <Link href="/admin/ai" className={BACK}>
            <ArrowLeftIcon size={14} /> AI usage
          </Link>
        }
      />
      {!config.envMasterEnabled && <EnvMasterNote />}

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
    </div>
  );
}

/**
 * Admin AI providers & routing (I1.12; docs/AI-ADMIN-CONFIG-DESIGN.md section 5). Server page passes `/config` (and the
 * 24 h `/calls` summary); every control here saves itself through the BFF (`/api/admin/ai/**`) with a ✓ and an Undo.
 * Keys never appear: only "present" and the env var NAME.
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
