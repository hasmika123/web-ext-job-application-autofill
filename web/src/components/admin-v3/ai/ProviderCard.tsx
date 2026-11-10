"use client";

import { useState } from "react";
import { Button, ChipInput, Switch, cn } from "@kiwiply/ui";
import { aiFetch, compactTokens, latency, usd } from "@/lib/ai-admin";
import type { AiProviderItem, AiTestResult, LastProbe } from "@/lib/ai-admin";
import { StatusChip } from "@/components/app-v2/common";
import type { Tone } from "@/components/app-v2/common";
import { AutosaveInput, FieldError, LabeledField, SourceTag, Tick } from "./controls";
import { useAiAdmin } from "./useAiAdmin";
import { useAiOps } from "./useAiOps";

type Status = { label: string; tone: Tone; dot?: boolean };

/** Ready / Untested / Not configured / Off / Failing (AI-ADMIN-CONFIG-DESIGN 5.3). */
export function providerStatus(p: AiProviderItem): Status {
  if (!p.enabled.value) return { label: "○ Off", tone: "slate" };
  if (!p.configured) return { label: "○ Not configured", tone: "slate" };
  if (p.lastProbe && !p.lastProbe.ok) return { label: "✖ Failing", tone: "coral" };
  if (!p.lastProbe) return { label: "◐ Untested", tone: "amber" };
  return { label: "Ready", tone: "green", dot: true };
}

/** "2 min ago" without a date library; computed on the client only (the server's clock would differ). */
function ago(iso: string, now: number): string {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return "just now"; // config-literal-ok: seconds in a minute
  const m = Math.round(s / 60); // config-literal-ok: seconds in a minute
  if (m < 60) return `${m} min ago`; // config-literal-ok: minutes in an hour
  const h = Math.round(m / 60); // config-literal-ok: minutes in an hour
  if (h < 48) return `${h} h ago`; // config-literal-ok: hours in two days
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function probeLine(p: { ok: boolean; model: string | null; latencyMs: number | null; inputTokens: number; outputTokens: number; costMicros: number; errorKind?: string | null; message?: string }) {
  if (!p.ok) return `✖ ${p.errorKind ?? "ERROR"}${p.message ? `: ${p.message}` : ""}`;
  return `OK · ${p.model ?? "model"} · ${latency(p.latencyMs)} · ${compactTokens(p.inputTokens)} in / ${compactTokens(p.outputTokens)} out · ${usd(p.costMicros)}`;
}

/** The API's 429 carries retryAfterSeconds; the copy says when the next test may run. */
function rateLimitCopy(perHour: number, retryAfterSeconds: number): string {
  const when = new Date(Date.now() + retryAfterSeconds * 1000).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }); // config-literal-ok: seconds to milliseconds
  return `You've run ${perHour} tests this hour — try again after ${when}.`;
}

/**
 * One provider (generic over `providers[]`; Phase 1 shows Gemini): status, the key line (presence and the env var NAME
 * only - there is no key field anywhere), enabled switch, base URL / timeout / models, which tasks use it, and Test
 * connection with its result line.
 */
export default function ProviderCard({ provider: p, roomy }: { provider: AiProviderItem; roomy?: boolean }) {
  const a = useAiAdmin();
  const ops = useAiOps();
  const [testing, setTesting] = useState(false);
  const [live, setLive] = useState<{ text: string; ok: boolean } | null>(null);
  const [now] = useState(() => Date.now());
  const st = providerStatus(p);
  const enabledKey = `provider:${p.id}:enabled`;
  const modelsKey = `provider:${p.id}:models`;
  const on = a.shown(enabledKey, p.enabled.value);

  async function test() {
    setTesting(true);
    setLive(null);
    const res = await aiFetch<AiTestResult>("POST", `/providers/${encodeURIComponent(p.id)}/test`, {});
    setTesting(false);
    if (!res.ok) {
      const retry = res.extra.retryAfterSeconds;
      setLive({ ok: false, text: res.status === 429 && typeof retry === "number" ? rateLimitCopy(a.config.limits.testPerHour.value, retry) : res.error });
      return;
    }
    const d = res.data;
    setLive({
      ok: d.ok,
      text: probeLine({ ok: d.ok, model: d.model, latencyMs: d.latencyMs, inputTokens: d.inputTokens, outputTokens: d.outputTokens, costMicros: d.costMicros, errorKind: d.error?.kind, message: d.error?.message }),
    });
    const probe: LastProbe = {
      at: new Date().toISOString(),
      ok: d.ok,
      model: d.model,
      latencyMs: d.latencyMs,
      inputTokens: d.inputTokens,
      outputTokens: d.outputTokens,
      costMicros: d.costMicros,
      errorKind: d.error?.kind ?? null,
    };
    a.setConfig((c) => ({ ...c, providers: c.providers.map((x) => (x.id === p.id ? { ...x, lastProbe: probe } : x)) }));
    a.refresh();
  }

  const last = p.lastProbe;
  return (
    <article aria-label={p.label} className="min-w-0 rounded-2xl border border-v2-line bg-paper p-4 shadow-v2-soft">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-[16px] font-bold text-ink">{p.label}</h3>
        <StatusChip tone={st.tone} dot={st.dot}>
          {st.label}
        </StatusChip>
      </header>

      <div className={cn("mt-3 space-y-3.5 text-[13px]", roomy && "md:grid md:grid-cols-2 md:gap-x-8 md:gap-y-3.5 md:space-y-0")}>
        <div>
          <div className="flex items-center justify-between gap-3">
            <p className="font-semibold text-ink">Enabled</p>
            <div className="flex items-center gap-2">
              <Tick k={enabledKey} />
              <Switch aria-label={`${p.label} enabled`} checked={on} onCheckedChange={(v) => void ops.setProviderEnabled(p, v)} />
            </div>
          </div>
          <FieldError k={enabledKey} />
        </div>

        <div>
          <p className="font-semibold text-ink">Key</p>
          <div className="mt-0.5 leading-snug text-ink-soft">
            {!p.keyRequired ? (
              <>
                Not required for local · <code className="rounded bg-paper-2 px-1 text-[12px]">{p.keyEnvVar}</code>
              </>
            ) : p.keyPresent ? (
              <>
                <span className="font-semibold text-v2-green-ink">Key present ✓</span> · <code className="rounded bg-paper-2 px-1 text-[12px]">{p.keyEnvVar}</code> · Change it in the
                server&apos;s .env, then restart the API.
              </>
            ) : (
              <>
                <span className="font-semibold text-danger">Key missing</span> · set <code className="rounded bg-paper-2 px-1 text-[12px]">{p.keyEnvVar}</code> on the API and restart. This
                provider can&apos;t be used until then.
              </>
            )}
          </div>
        </div>

        <LabeledField label="Base URL">
          <AutosaveInput
            k={`provider:${p.id}:baseUrl`}
            label={`${p.label} base URL`}
            inputMode="url"
            value={p.baseUrl.value}
            onCommit={(next) => ops.setProviderField(p, "baseUrl", next === "" ? null : next)}
          />
          <SourceTag className="mt-1" source={p.baseUrl.source} what={`${p.label} base URL`} onReset={() => void ops.setProviderField(p, "baseUrl", null)} />
        </LabeledField>

        <LabeledField label="Timeout (ms)">
          <AutosaveInput
            k={`provider:${p.id}:timeoutMs`}
            label={`${p.label} timeout in milliseconds`}
            type="number"
            inputMode="numeric"
            value={String(p.timeoutMs.value)}
            validate={(d) => (/^\d+$/.test(d) ? null : "Enter a whole number of milliseconds.")}
            onCommit={(next) => ops.setProviderField(p, "timeoutMs", next === "" ? null : Number(next))}
          />
          <SourceTag className="mt-1" source={p.timeoutMs.source} what={`${p.label} timeout`} onReset={() => void ops.setProviderField(p, "timeoutMs", null)} />
        </LabeledField>

        <LabeledField label="Models">
          <div className="flex items-start gap-2">
            <ChipInput
              className="min-w-0 flex-1"
              label={`${p.label} models`}
              placeholder="Add a model id"
              value={a.shown(modelsKey, p.models.value)}
              onChange={(next) => void ops.setProviderField(p, "models", next)}
            />
            <Tick k={modelsKey} />
          </div>
          <FieldError k={modelsKey} />
          <SourceTag className="mt-1" source={p.models.source} what={`${p.label} models`} onReset={() => void ops.setProviderField(p, "models", null)} />
        </LabeledField>

        <div>
          <p className="font-semibold text-ink">Used by</p>
          <div className="mt-0.5 break-words text-ink-soft">
            {p.usedByTasks.length === 0 ? "No task routes here." : `${p.usedByTasks.join(", ")} (${p.usedByTasks.length} ${p.usedByTasks.length === 1 ? "task" : "tasks"})`}
          </div>
        </div>
      </div>

      <div className="mt-4 border-t border-v2-line/60 pt-3">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn("min-h-11 w-full sm:min-h-0 sm:w-auto", testing && "opacity-70")}
          disabled={testing || !p.configured}
          aria-busy={testing || undefined}
          onClick={() => void test()}
        >
          {testing ? "Testing…" : "Test connection"}
        </Button>
        <p role="status" aria-live="polite" className={cn("mt-2 break-words text-[12.5px] leading-snug", live && !live.ok ? "text-danger" : "text-ink-soft")}>
          {live ? (
            live.text
          ) : last ? (
            <span suppressHydrationWarning>
              Last test: {ago(last.at, now)} · {probeLine(last)}
            </span>
          ) : (
            "Not tested yet."
          )}
        </p>
      </div>
    </article>
  );
}
