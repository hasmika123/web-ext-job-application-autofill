"use client";
/* eslint-disable react-hooks/set-state-in-effect -- data loader: the effect starts a fetch and the answer is stored */

import { useCallback, useEffect, useState } from "react";
import { Button, Textarea } from "@kiwiply/ui";
import { AdminPanel, StatusDot } from "../common";
import { adminFetch } from "@/lib/admin-client";
import {
  AUTOPILOT_DAILY_CAP,
  AUTOPILOT_ENABLED,
  AUTOPILOT_MAX_BATCH,
  AUTOPILOT_MONTHLY_CAP,
  REASON_MIN,
  asBool,
  asCount,
  type SettingItem,
} from "@/lib/admin-autopilot";

type Loaded = { enabled: SettingItem; daily: SettingItem; monthly: SettingItem; batch: SettingItem };

/**
 * Autopilot for the whole platform (gap D12): the master switch of "Prepare selected openings". On only makes it available: each organization still
 * opts in on its own Settings page and may lower the limits shown here. Turning it off stops it for every organization at once. Every change needs a
 * reason and is audited. Autopilot fills applications in the consultant's own browser and always stops before the final button; Kiwiply never submits.
 */
export default function AutopilotPanel() {
  const [data, setData] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [enabled, daily, monthly, batch] = await Promise.all(
      [AUTOPILOT_ENABLED, AUTOPILOT_DAILY_CAP, AUTOPILOT_MONTHLY_CAP, AUTOPILOT_MAX_BATCH].map((k) => adminFetch<SettingItem>("GET", `/settings/${k}`)),
    );
    for (const r of [enabled, daily, monthly, batch]) if (!r.ok) return setFailed(r.error);
    if (enabled.ok && daily.ok && monthly.ok && batch.ok) {
      setData({ enabled: enabled.data, daily: daily.data, monthly: monthly.data, batch: batch.data });
      setFailed(null);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const on = data ? asBool(data.enabled.value) : false;

  async function apply() {
    setBusy(true);
    setError(null);
    const res = await adminFetch<SettingItem>("PUT", `/settings/${AUTOPILOT_ENABLED}`, { value: !on, reason: reason.trim() });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    setData((d) => (d ? { ...d, enabled: res.data } : d));
    setAsking(false);
    setReason("");
  }

  const count = (s: SettingItem) => asCount(s.value)?.toLocaleString("en-US") ?? "-";

  return (
    <AdminPanel title="Autopilot" description="Prepare selected openings: the extension opens each assigned job in its own tab and fills it, then stops. The consultant reviews and submits.">
      <div className="space-y-4 text-[13px]" data-admin-autopilot={data ? (on ? "on" : "off") : "loading"}>
        {failed ? (
          <p role="alert" className="text-danger-text">
            Couldn&apos;t load the Autopilot settings: {failed}{" "}
            <button type="button" className="font-semibold underline" onClick={() => void load()}>
              Try again
            </button>
          </p>
        ) : !data ? (
          <p className="text-v2-muted">Loading…</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <StatusDot status={on ? "On for the platform" : "Off for everyone"} tone={on ? "green" : "slate"} />
              {!asking && (
                <Button type="button" variant={on ? "ghost" : "primary"} onClick={() => setAsking(true)} className="min-h-11 sm:min-h-0" data-autopilot-toggle>
                  {on ? "Turn off" : "Turn on"}
                </Button>
              )}
            </div>
            <p className="leading-snug text-ink-soft">
              {on
                ? "Organizations can use it once their own admin turns it on. Turning it off here stops it for every organization at once."
                : "No organization can use it, whatever its own setting says."}
              {data.enabled.updatedBy ? ` Last changed by ${data.enabled.updatedBy}${data.enabled.lastReason ? `: "${data.enabled.lastReason}"` : ""}.` : ""}
            </p>
            {asking && (
              <div className="space-y-2" data-autopilot-confirm>
                <label className="block">
                  <span className="mb-1 block text-[12.5px] font-semibold text-ink">Reason (required)</span>
                  <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="e.g. Pilot organizations are ready for Autopilot" aria-label="Reason (required)" />
                </label>
                {error && (
                  <p role="alert" className="text-[12.5px] text-danger-text">
                    {error}
                  </p>
                )}
                <div className="flex flex-wrap justify-end gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setAsking(false);
                      setReason("");
                      setError(null);
                    }}
                    className="min-h-11 sm:min-h-0"
                  >
                    Cancel
                  </Button>
                  <Button type="button" variant={on ? "danger" : "primary"} disabled={busy || reason.trim().length < REASON_MIN} onClick={() => void apply()} className="min-h-11 sm:min-h-0" data-autopilot-apply>
                    {busy ? "Saving…" : on ? "Turn off for everyone" : "Turn on"}
                  </Button>
                </div>
              </div>
            )}
            <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-3" data-autopilot-limits>
              <Limit label="Per consultant per day" value={count(data.daily)} />
              <Limit label="Per consultant per month" value={count(data.monthly)} />
              <Limit label="Openings per batch" value={count(data.batch)} />
            </dl>
            <p className="text-[12.5px] text-v2-muted">These are the most an organization can allow; each one may set lower limits on its own Settings page.</p>
          </>
        )}
      </div>
    </AdminPanel>
  );
}

function Limit({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[12px] font-semibold text-v2-muted">{label}</dt>
      <dd className="tabular-nums text-ink">{value}</dd>
    </div>
  );
}
