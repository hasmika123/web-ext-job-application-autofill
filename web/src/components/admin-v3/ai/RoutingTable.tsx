"use client";

import { useRef, useState } from "react";
import { BottomSheet, ChevronRightIcon, cn } from "@kiwiply/ui";
import type { AiConfig, AiRouteItem } from "@/lib/ai-admin";
import { LabeledField, SourceTag } from "./controls";
import { RouteEnabled, RouteFallback, RouteModel, RouteProviderSelect, RouteSource, RouteTokens } from "./RouteControls";
import { useAiAdmin } from "./useAiAdmin";
import { useWide } from "./useNarrow";

const TH = "whitespace-nowrap px-2.5 py-2.5 text-left text-[12px] font-medium text-v2-muted";
const TD = "px-2.5 py-3 align-top";

/** "Gemini" for the provider id on a card's summary line. */
function providerLabel(cfg: AiConfig, id: string): string {
  return cfg.providers.find((p) => p.id === id)?.label.replace(/^Google /, "") ?? id;
}

/** Everything one task needs, stacked for the phone sheet. */
function RouteSheetBody({ route }: { route: AiRouteItem }) {
  return (
    <div className="space-y-4 pb-4">
      <LabeledField label="Provider">
        <RouteProviderSelect route={route} />
      </LabeledField>
      <LabeledField label="Model">
        <RouteModel route={route} />
      </LabeledField>
      <LabeledField label="Fallback" hint="Tried once if the main provider fails.">
        <RouteFallback route={route} stacked />
      </LabeledField>
      <LabeledField label="Max output tokens">
        <RouteTokens route={route} />
      </LabeledField>
      <LabeledField label="Enabled">
        <RouteEnabled route={route} />
      </LabeledField>
      <LabeledField label="Source">
        <RouteSource route={route} />
      </LabeledField>
    </div>
  );
}

function RouteCard({ route, onOpen }: { route: AiRouteItem; onOpen: (task: string, el: HTMLButtonElement) => void }) {
  const a = useAiAdmin();
  const fallback = route.fallbackProvider.value === "none" ? "none" : providerLabel(a.config, route.fallbackProvider.value);
  return (
    <li className="rounded-xl border border-v2-line bg-paper p-3.5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="min-w-0 text-[14px] font-bold text-ink">{route.label}</h3>
        <RouteEnabled route={route} />
      </div>
      <button
        type="button"
        onClick={(e) => onOpen(route.task, e.currentTarget)}
        aria-label={`Edit ${route.label} routing`}
        className="mt-2 flex min-h-11 w-full items-center justify-between gap-2 rounded-lg text-left hover:bg-paper-2"
      >
        <span className="min-w-0 text-[13px] leading-snug text-ink-soft">
          <span className="block break-words text-ink">
            {providerLabel(a.config, route.provider.value)} · {route.model.value || "default model"}
          </span>
          <span className="block">
            Fallback {fallback} · {route.maxOutputTokens.value} tok
          </span>
        </span>
        <ChevronRightIcon className="h-4 w-4 flex-none text-v2-muted" />
      </button>
      <RouteSource route={route} />
    </li>
  );
}

/**
 * Routing: one row per task with provider · model · fallback · max tokens · enabled and its source. A real table from
 * `xl` up; below that, a card per task whose tap opens a sheet with the same controls. Economy model / soft cap
 * sit under it (read-only: the API changes them from env, not from here).
 */
export default function RoutingTable() {
  const a = useAiAdmin();
  const wide = useWide();
  const routes = a.config.routes;
  const [open, setOpen] = useState<string | null>(null);
  const returnTo = useRef<HTMLElement | null>(null);
  const opening = routes.find((r) => r.task === open) ?? null;
  const econ = a.config.economy;

  return (
    <div>
      {wide ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] border-collapse text-[13px]">
            <thead>
              <tr className="bg-[#F6F8FC]">
                <th scope="col" className={cn(TH, "rounded-l-lg pl-3")}>Task</th>
                <th scope="col" className={TH}>Provider</th>
                <th scope="col" className={TH}>Model</th>
                <th scope="col" className={TH}>Fallback</th>
                <th scope="col" className={TH}>Max tokens</th>
                <th scope="col" className={TH}>Enabled</th>
                <th scope="col" className={cn(TH, "rounded-r-lg")}>Source</th>
              </tr>
            </thead>
            <tbody>
              {routes.map((r) => (
                <tr key={r.task} className="border-b border-v2-line/70 last:border-b-0">
                  <th scope="row" className={cn(TD, "pl-3 text-left text-[13px] font-semibold text-ink")}>
                    {r.label}
                    {r.risk === "HIGH" && <span className="ml-1.5 align-middle text-[10.5px] font-bold uppercase tracking-wide text-v2-amber">core</span>}
                  </th>
                  <td className={cn(TD, "w-[150px]")}>
                    <RouteProviderSelect route={r} />
                  </td>
                  <td className={cn(TD, "w-[210px]")}>
                    <RouteModel route={r} />
                  </td>
                  <td className={cn(TD, "w-[190px]")}>
                    <RouteFallback route={r} />
                  </td>
                  <td className={cn(TD, "w-[110px]")}>
                    <RouteTokens route={r} />
                  </td>
                  <td className={TD}>
                    <RouteEnabled route={r} />
                  </td>
                  <td className={cn(TD, "w-[150px]")}>
                    <RouteSource route={r} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <ul className="space-y-3">
          {routes.map((r) => (
            <RouteCard
              key={r.task}
              route={r}
              onOpen={(task, el) => {
                returnTo.current = el;
                setOpen(task);
              }}
            />
          ))}
        </ul>
      )}

      <p className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-ink-soft">
        <span>
          Economy model past <strong className="text-ink">{econ.softCapPct.value}%</strong> of a user&apos;s budget:{" "}
          <strong className="text-ink">{econ.model.value ? econ.model.value : "— none"}</strong>
        </span>
        <SourceTag source={econ.model.source} what="economy model" />
        <span className="text-v2-muted">Set with DOSSIER_AI_ECONOMY_MODEL in the server&apos;s env.</span>
      </p>

      <BottomSheet
        id="ai-route-sheet"
        open={opening !== null}
        onClose={() => setOpen(null)}
        title={opening ? `${opening.label} routing` : "Routing"}
        description="Changes save as you make them."
        defaultSnap="full"
        returnFocusTo={returnTo}
      >
        {opening && <RouteSheetBody route={opening} />}
      </BottomSheet>
    </div>
  );
}

