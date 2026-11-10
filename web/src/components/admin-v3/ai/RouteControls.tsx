"use client";

import { Switch, Select } from "@kiwiply/ui";
import { groupSource } from "@/lib/ai-admin";
import type { AiProviderItem, AiRouteItem } from "@/lib/ai-admin";
import { AutosaveInput, FieldError, ModelPicker, SourceTag, Tick } from "./controls";
import { useAiAdmin } from "./useAiAdmin";
import { useAiOps } from "./useAiOps";

/**
 * The six controls of one routing row, each bound to its route and saving itself. The desktop table and the phone
 * sheet both render these, so a route behaves the same wherever it is edited.
 */
const ABOVE_SHEET = "z-[1100]!"; // config-literal-ok: stacking layer above the 1000 sheets/dialogs, not a tunable

const key = (r: AiRouteItem, f: string) => `route:${r.task}:${f}`;

function modelsOf(providers: AiProviderItem[], id: string): string[] {
  return providers.find((p) => p.id === id)?.models.value ?? [];
}

export function RouteProviderSelect({ route }: { route: AiRouteItem }) {
  const a = useAiAdmin();
  const ops = useAiOps();
  const k = key(route, "provider");
  const value = a.shown(k, route.provider.value);
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2">
        <Select
          aria-label={`${route.label} provider`}
          value={value}
          menuClassName={ABOVE_SHEET}
          options={a.config.providers.map((p) => ({
            value: p.id,
            label: p.configured ? p.label : `${p.label} (not configured)`,
            disabled: !p.configured && p.id !== route.provider.value,
          }))}
          onChange={(next) => {
            // A model from the old provider means nothing to the new one: move to the new provider's first model.
            const models = modelsOf(a.config.providers, next);
            const change = models.includes(route.model.value) || models.length === 0 ? { provider: next } : { provider: next, model: models[0] };
            void ops.patchRoute(route, change, k);
          }}
          className="min-w-0 flex-1"
        />
        <Tick k={k} />
      </div>
      <FieldError k={k} />
    </div>
  );
}

export function RouteModel({ route }: { route: AiRouteItem }) {
  const a = useAiAdmin();
  const ops = useAiOps();
  const k = key(route, "model");
  return (
    <ModelPicker
      k={k}
      label={`${route.label} model`}
      models={modelsOf(a.config.providers, route.provider.value)}
      value={route.model.value}
      onCommit={(next) => ops.patchRoute(route, { model: next }, k)}
    />
  );
}

/** Fallback provider ("none" = no fallback) and, once one is chosen, its model. */
export function RouteFallback({ route, stacked }: { route: AiRouteItem; stacked?: boolean }) {
  const a = useAiAdmin();
  const ops = useAiOps();
  const kp = key(route, "fallbackProvider");
  const km = key(route, "fallbackModel");
  const fp = a.shown(kp, route.fallbackProvider.value);
  const has = fp !== "none";
  return (
    <div className={stacked ? "space-y-2" : "space-y-1.5"}>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <Select
            aria-label={`${route.label} fallback provider`}
            value={fp}
            menuClassName={ABOVE_SHEET}
            options={[
              { value: "none", label: "— none" },
              ...a.config.providers.map((p) => ({
                value: p.id,
                label: p.configured ? p.label : `${p.label} (not configured)`,
                disabled: !p.configured && p.id !== route.fallbackProvider.value,
              })),
            ]}
            onChange={(next) => void ops.patchRoute(route, next === "none" ? { fallbackProvider: "none", fallbackModel: null } : { fallbackProvider: next }, kp)}
            className="min-w-0 flex-1"
          />
          <Tick k={kp} />
        </div>
        <FieldError k={kp} />
      </div>
      {has && (
        <ModelPicker
          k={km}
          label={`${route.label} fallback model`}
          models={modelsOf(a.config.providers, fp)}
          value={route.fallbackModel.value}
          blankLabel="— provider default"
          onCommit={(next) => ops.patchRoute(route, { fallbackModel: next === "" ? null : next }, km)}
        />
      )}
    </div>
  );
}

export function RouteTokens({ route }: { route: AiRouteItem }) {
  const ops = useAiOps();
  return (
    <AutosaveInput
      k={key(route, "maxOutputTokens")}
      label={`${route.label} max output tokens`}
      type="number"
      inputMode="numeric"
      value={String(route.maxOutputTokens.value)}
      validate={(d) => (/^\d+$/.test(d) ? null : "Enter a whole number of tokens.")}
      onCommit={(next) => ops.patchRoute(route, { maxOutputTokens: Number(next) }, key(route, "maxOutputTokens"))}
    />
  );
}

export function RouteEnabled({ route }: { route: AiRouteItem }) {
  const a = useAiAdmin();
  const ops = useAiOps();
  const k = key(route, "enabled");
  return (
    <div className="flex items-center gap-2">
      <Tick k={k} />
      <Switch aria-label={`${route.label} enabled`} checked={a.shown(k, route.enabled.value)} onCheckedChange={(v) => void ops.patchRoute(route, { enabled: v }, k)} />
    </div>
  );
}

export function RouteSource({ route }: { route: AiRouteItem }) {
  const a = useAiAdmin();
  const ops = useAiOps();
  const source = groupSource(route.enabled, route.provider, route.model, route.fallbackProvider, route.fallbackModel, route.maxOutputTokens);
  return (
    <div>
      <SourceTag source={source} what={route.label} resetBusy={a.busy(key(route, "reset"))} onReset={() => void ops.resetRoute(route)} />
      <FieldError k={key(route, "reset")} />
    </div>
  );
}
