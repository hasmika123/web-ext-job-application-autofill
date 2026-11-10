"use client";

import { useState } from "react";
import { BottomSheet, Button, Dialog, EmptyState, Select, Spinner } from "@kiwiply/ui";
import { adminFetch } from "@/lib/admin-client";
import { INTERVAL_LABEL, type Plan, type SubscribersResult } from "@/lib/admin-plans";
import { useNarrow } from "../common";

const NOT_BUILT = "Moving subscribers to another version is not built yet. There are no existing subscribers to move (decision S-03), and a plan that ends goes through the retirement lifecycle instead.";

/**
 * "Offer migration" (04 section 5): FUTURE. The sheet exists so an admin can see what it will be (target version, opt-in or at
 * renewal with notice) and why it cannot be sent: the API has no migration route (S-03, P-14). Nothing here sends anything.
 */
export function MigrationSheet({ open, onClose, plan, from, targets }: { open: boolean; onClose: () => void; plan: string; from: number; targets: number[] }) {
  const narrow = useNarrow();
  const body = (
    <div className="space-y-3">
      <p role="note" className="rounded-xl bg-brown-soft p-3 text-[13px] text-brown-deep">
        {NOT_BUILT}
      </p>
      <fieldset disabled className="space-y-3 opacity-70">
        <label className="block text-[12.5px] font-semibold text-ink">
          <span className="mb-1 block">Move {plan} v{from} subscribers to</span>
          <Select value={String(targets[0] ?? "")} onChange={() => undefined} disabled aria-label="Target version" options={targets.map((t) => ({ value: String(t), label: `v${t}` }))} />
        </label>
        <label className="flex items-center gap-2 text-[13px]">
          <input type="radio" name="mode" defaultChecked /> They choose (opt-in quote)
        </label>
        <label className="flex items-center gap-2 text-[13px]">
          <input type="radio" name="mode" /> At renewal, with 30 days notice (equal or lower price only)
        </label>
      </fieldset>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onClose} className="min-h-11 sm:min-h-0">
          Close
        </Button>
        <Button type="button" variant="primary" disabled className="min-h-11 sm:min-h-0">
          Send offer
        </Button>
      </div>
    </div>
  );
  return narrow ? (
    <BottomSheet open={open} onClose={onClose} title="Offer migration" id="migration-sheet">
      {body}
    </BottomSheet>
  ) : (
    <Dialog open={open} onClose={onClose} title="Offer migration" description="Planned, not available yet.">
      {body}
    </Dialog>
  );
}

/**
 * Subscribers by version (K4.5): the counts the plans list already summarises, per version, and the admin-only roster of one version.
 * The logins of real people are shown only on request and only here (platform admins); the counts need no such care.
 */
export default function SubscribersPanel({ plan, counts }: { plan: Plan; counts: Record<string, number> }) {
  const [version, setVersion] = useState<number | null>(null);
  const [data, setData] = useState<SubscribersResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [migrate, setMigrate] = useState<{ from: number } | null>(null);
  const versions = plan.versions.map((v) => v.version).sort((a, b) => b - a);
  const live = plan.versions.find((v) => v.status === "PUBLISHED")?.version ?? null;

  async function load(v: number, page = 0) {
    setVersion(v);
    setBusy(true);
    setError(null);
    const res = await adminFetch<SubscribersResult>("GET", `/plans/${plan.planKey}/subscribers?version=${v}&page=${page}`);
    setBusy(false);
    if (res.ok) setData(res.data);
    else setError(res.error);
  }

  return (
    <div className="space-y-3">
      <ul className="divide-y divide-line rounded-xl border border-line" aria-label="Subscribers by version">
        {versions.map((v) => {
          const n = counts[String(v)] ?? 0;
          const status = plan.versions.find((x) => x.version === v)?.status ?? "";
          return (
            <li key={v} className="flex flex-wrap items-center justify-between gap-2 p-3 text-[13.5px]" data-version={v}>
              <span>
                <span className="font-semibold text-ink">v{v}</span>
                <span className="text-v2-muted"> · {status.toLowerCase()}{v === live ? ", live" : ""}</span>
              </span>
              <span className="flex items-center gap-2">
                <span className="tabular-nums">
                  <span className="font-semibold">{n.toLocaleString("en-US")}</span> subscribers
                </span>
                <Button type="button" variant="ghost" disabled={n === 0 || busy} onClick={() => void load(v)} className="min-h-11 sm:min-h-0">
                  Show who
                </Button>
                {v !== live && n > 0 && (
                  <Button type="button" variant="ghost" onClick={() => setMigrate({ from: v })} className="min-h-11 sm:min-h-0">
                    Offer migration…
                  </Button>
                )}
              </span>
            </li>
          );
        })}
      </ul>

      {version !== null && (
        <section aria-label={`Subscribers of v${version}`} className="space-y-2">
          <p role="note" className="rounded-xl bg-paper-2 p-3 text-[12.5px] text-ink-soft">
            Privacy: these are real accounts. Logins are shown to platform admins only; do not copy them out of this page.
          </p>
          {busy ? (
            <div role="status" className="flex items-center gap-2 py-4 text-[13px] text-ink-soft">
              <Spinner /> Loading…
            </div>
          ) : error ? (
            <p role="alert" className="text-[13px] text-danger-text">
              {error}
            </p>
          ) : !data?.rows || data.rows.length === 0 ? (
            <EmptyState variant="inline" title="Nobody on this version" />
          ) : (
            <>
              <ul className="divide-y divide-line rounded-xl border border-line">
                {data.rows.map((r) => (
                  <li key={r.login} className="flex flex-wrap items-center justify-between gap-2 p-3 text-[13px]">
                    <span className="font-semibold text-ink">{r.login}</span>
                    <span className="text-v2-muted">
                      {r.interval ? (INTERVAL_LABEL[r.interval] ?? r.interval) : "—"}
                      {r.addons.length > 0 ? ` · ${r.addons.join(", ")}` : ""} · {r.state.toLowerCase()}
                      {r.since ? ` · since ${new Date(r.since).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="flex items-center justify-between gap-2 text-[12.5px] text-v2-muted">
                <span className="tabular-nums">
                  {data.total.toLocaleString("en-US")} in total · page {data.page + 1}
                </span>
                <span className="flex gap-2">
                  <Button type="button" variant="ghost" disabled={data.page <= 0} onClick={() => void load(version, data.page - 1)} className="min-h-11 sm:min-h-0">
                    Previous
                  </Button>
                  <Button type="button" variant="ghost" disabled={(data.page + 1) * data.size >= data.total} onClick={() => void load(version, data.page + 1)} className="min-h-11 sm:min-h-0">
                    Next
                  </Button>
                </span>
              </div>
            </>
          )}
        </section>
      )}
      <MigrationSheet open={migrate !== null} onClose={() => setMigrate(null)} plan={plan.name} from={migrate?.from ?? 0} targets={versions.filter((v) => v !== migrate?.from)} />
    </div>
  );
}
