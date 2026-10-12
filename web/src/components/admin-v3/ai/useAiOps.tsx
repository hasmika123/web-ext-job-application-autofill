"use client";

import { pricePerMtok, undoValue } from "@/lib/ai-admin";
import type { AiConfig, AiPriceItem, AiProviderItem, AiRouteItem, Resolved } from "@/lib/ai-admin";
import { useAiAdmin } from "./useAiAdmin";
import type { SaveOutcome } from "./useAiAdmin";

/**
 * Every write the AI page can make, as functions. Each one builds the request, the optimistic value, the Undo that
 * reverses it, and - for the HIGH-risk ones - routes through the confirm-with-reason dialog first.
 */
export type RouteField = "enabled" | "provider" | "model" | "fallbackProvider" | "fallbackModel" | "maxOutputTokens";
export type RouteChange = Partial<Record<RouteField, string | number | boolean | null>>;

const NONE: SaveOutcome = { ok: true };

const mergeRoute = (c: AiConfig, item: AiRouteItem): AiConfig => ({ ...c, routes: c.routes.map((r) => (r.task === item.task ? item : r)) });
const mergeProvider = (c: AiConfig, item: AiProviderItem): AiConfig => ({ ...c, providers: c.providers.map((p) => (p.id === item.id ? item : p)) });

/** What `route` currently holds for `field`, as the body value an Undo sends (null = back to env). */
function routeUndo(route: AiRouteItem, fields: RouteField[]): RouteChange {
  const out: RouteChange = {};
  for (const f of fields) out[f] = undoValue(route[f] as Resolved<string | number | boolean>);
  return out;
}

function routeTitle(route: AiRouteItem, change: RouteChange): string {
  if ("enabled" in change) return `${route.label} turned ${change.enabled ? "on" : "off"}`;
  if ("provider" in change || "model" in change) {
    const provider = (change.provider as string | undefined) ?? route.provider.value;
    const model = (change.model as string | undefined) ?? route.model.value;
    return `${route.label} now uses ${model} on ${provider}`;
  }
  if ("fallbackProvider" in change || "fallbackModel" in change) {
    const p = (change.fallbackProvider as string | undefined) ?? route.fallbackProvider.value;
    return p === "none" ? `${route.label} fallback removed` : `${route.label} falls back to ${(change.fallbackModel as string | undefined) || p}`;
  }
  return `${route.label} max tokens set to ${String(change.maxOutputTokens)}`;
}

export function useAiOps() {
  const a = useAiAdmin();
  const { save, askReason } = a;

  {
    /** Sends a route change (no confirmation). */
    function sendRoute(route: AiRouteItem, change: RouteChange, key: string, reason?: string): Promise<SaveOutcome> {
      const fields = Object.keys(change) as RouteField[];
      return save<AiRouteItem>({
        key,
        row: `route:${route.task}`,
        method: "PATCH",
        path: `/routes/${encodeURIComponent(route.task)}`,
        body: { ...change, ...(reason ? { reason } : {}) },
        optimistic: key.endsWith(`:${fields[0]}`) && change[fields[0]] !== null ? change[fields[0]] : undefined,
        apply: mergeRoute,
        undoTitle: routeTitle(route, change),
        undo: { method: "PATCH", path: `/routes/${encodeURIComponent(route.task)}`, body: routeUndo(route, fields) },
      });
    }

    /** A route edit; parse (the HIGH-risk task) asks for a reason first when it turns off or changes model / provider. */
    function patchRoute(route: AiRouteItem, change: RouteChange, key: string): Promise<SaveOutcome> {
      const high =
        route.task === "parse" && (change.enabled === false || ("model" in change && change.model !== route.model.value) || ("provider" in change && change.provider !== route.provider.value));
      if (!high) return sendRoute(route, change, key);
      const off = change.enabled === false;
      askReason({
        title: off ? "Turn off resume parsing?" : "Change the model for resume parsing?",
        body: off
          ? "New users won't get the AI parse during setup; the heuristic parser still runs."
          : "Resume parsing is the AI task every new user hits during setup. Run a Test connection on the new model first if you can.",
        confirmLabel: off ? "Turn off" : "Change model",
        run: (reason) => sendRoute(route, change, key, reason),
      });
      return Promise.resolve(NONE);
    }

    function resetRoute(route: AiRouteItem): Promise<SaveOutcome> {
      const dbFields = (["enabled", "provider", "model", "fallbackProvider", "fallbackModel", "maxOutputTokens"] as const).filter((f) => route[f].source === "db");
      const undoBody: RouteChange = {};
      for (const f of dbFields) undoBody[f] = route[f].value as string | number | boolean;
      return save<AiRouteItem>({
        key: `route:${route.task}:reset`,
        row: `route:${route.task}`,
        method: "DELETE",
        path: `/routes/${encodeURIComponent(route.task)}`,
        apply: mergeRoute,
        undoTitle: `${route.label} reset to default`,
        undo: dbFields.length ? { method: "PATCH", path: `/routes/${encodeURIComponent(route.task)}`, body: undoBody } : undefined,
      });
    }

    /** Turns server AI on or off. Off asks for a reason (see the page's Server AI switch). */
    function sendGlobal(on: boolean, prev: AiConfig["global"]["enabled"], reason?: string): Promise<SaveOutcome> {
      return save<AiConfig["global"]>({
        key: "global:enabled",
        row: "global",
        method: "PATCH",
        path: "/config/global",
        body: { enabled: on, ...(reason ? { reason } : {}) },
        optimistic: on,
        apply: (c, d) => ({ ...c, global: d }),
        undoTitle: on ? undefined : "Server AI turned off",
        undo: { method: "PATCH", path: "/config/global", body: { enabled: undoValue(prev) } },
      });
    }

    function setGlobal(on: boolean): Promise<SaveOutcome> {
      const prev = a.config.global.enabled;
      if (on) return sendGlobal(true, prev);
      askReason({
        title: "Turn off server AI?",
        body: "Every AI feature pauses for every user until it's back on. BYO keys in the extension keep working.",
        confirmLabel: "Turn off",
        run: (reason) => sendGlobal(false, prev, reason),
      });
      return Promise.resolve(NONE);
    }

    function sendProvider(p: AiProviderItem, body: Record<string, unknown>, key: string, undoBody: Record<string, unknown> | null, title: string | undefined, optimistic?: unknown): Promise<SaveOutcome> {
      return save<AiProviderItem>({
        key,
        row: `provider:${p.id}`,
        method: "PATCH",
        path: `/providers/${encodeURIComponent(p.id)}`,
        body,
        optimistic,
        apply: mergeProvider,
        undoTitle: title,
        undo: undoBody ? { method: "PATCH", path: `/providers/${encodeURIComponent(p.id)}`, body: undoBody } : undefined,
      });
    }

    /** Provider on / off. Off lists the tasks routed here and asks for a reason; a 409 can be forced from the dialog. */
    function setProviderEnabled(p: AiProviderItem, on: boolean): Promise<SaveOutcome> {
      const key = `provider:${p.id}:enabled`;
      if (on) return sendProvider(p, { enabled: true }, key, null, undefined, true);
      const tasks = p.usedByTasks;
      askReason({
        title: `Turn off ${p.label}?`,
        body:
          tasks.length > 0
            ? `${tasks.length} ${tasks.length === 1 ? "task routes" : "tasks route"} here: ${tasks.join(", ")}. Those without a fallback will fail until you re-route them.`
            : "No task routes here right now.",
        confirmLabel: "Turn off",
        forceLabel: "Turn off anyway",
        run: (reason, force) =>
          sendProvider(p, { enabled: false, reason, ...(force ? { force: true } : {}) }, key, { enabled: undoValue(p.enabled) }, `${p.label} turned off`, false),
      });
      return Promise.resolve(NONE);
    }

    function setProviderField(p: AiProviderItem, field: "baseUrl" | "timeoutMs" | "models", value: string | number | string[] | null): Promise<SaveOutcome> {
      const prev = field === "baseUrl" ? p.baseUrl : field === "timeoutMs" ? p.timeoutMs : p.models;
      const title = field === "baseUrl" ? "Base URL updated" : field === "timeoutMs" ? "Timeout updated" : "Models updated";
      return sendProvider(p, { [field]: value }, `provider:${p.id}:${field}`, { [field]: undoValue(prev as Resolved<unknown>) }, title, typeof value === "string" || typeof value === "number" ? String(value) : undefined);
    }

    /** One price cell edited: `part` names the control (tick, error and the optimistic text are keyed by it). */
    function putPrice(item: AiPriceItem, next: { input: number; cached: number; output: number }, part: "input" | "cached" | "output"): Promise<SaveOutcome> {
      return savePrice(item.model, next, item, `price:${item.model}:${part}`, pricePerMtok(next[part]));
    }

    function savePrice(model: string, next: { input: number; cached: number; output: number }, prev: AiPriceItem | null, key = `price:${model}`, optimistic?: string): Promise<SaveOutcome> {
      const path = `/prices/${encodeURIComponent(model)}`;
      return save<AiPriceItem>({
        key,
        optimistic,
        row: `price:${model}`,
        method: "PUT",
        path,
        body: { inputPerMtokMicros: next.input, cachedPerMtokMicros: next.cached, outputPerMtokMicros: next.output },
        apply: mergePrice,
        undoTitle: `Price updated for ${model}`,
        undo: prev?.custom
          ? { method: "PUT", path, body: { inputPerMtokMicros: prev.inputPerMtokMicros.value, cachedPerMtokMicros: prev.cachedPerMtokMicros.value, outputPerMtokMicros: prev.outputPerMtokMicros.value } }
          : { method: "DELETE", path },
      });
    }

    function resetPrice(item: AiPriceItem): Promise<SaveOutcome> {
      const path = `/prices/${encodeURIComponent(item.model)}`;
      return save<AiPriceItem>({
        key: `price:${item.model}:reset`,
        row: `price:${item.model}`,
        method: "DELETE",
        path,
        apply: mergePrice,
        undoTitle: `Price reset for ${item.model}`,
        undo: {
          method: "PUT",
          path,
          body: { inputPerMtokMicros: item.inputPerMtokMicros.value, cachedPerMtokMicros: item.cachedPerMtokMicros.value, outputPerMtokMicros: item.outputPerMtokMicros.value },
        },
      });
    }

    return { patchRoute, resetRoute, setGlobal, setProviderEnabled, setProviderField, putPrice, savePrice, resetPrice };
  }
}

/** A price response replaces that model's row; a model with neither an admin row nor a code default disappears. */
function mergePrice(c: AiConfig, item: AiPriceItem): AiConfig {
  const exists = c.prices.some((p) => p.model === item.model);
  if (!item.custom && !item.builtin) return { ...c, prices: c.prices.filter((p) => p.model !== item.model) };
  const prices = exists ? c.prices.map((p) => (p.model === item.model ? item : p)) : [...c.prices, item].sort((x, y) => x.model.localeCompare(y.model));
  return { ...c, prices };
}
