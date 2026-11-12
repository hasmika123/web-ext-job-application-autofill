"use client";
/* eslint-disable react-hooks/set-state-in-effect -- data loaders: the effect starts a fetch and the answer is stored; the sheet resets its picks when another consultant opens */
import QuoteSummary from "./QuoteSummary";

import { useCallback, useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/ent/shell/ShellContext";
import {
  Button,
  EmptyState,
  ErrorState,
  FeatureChip,
  Input,
  KeyIcon,
  KpiTile,
  PersonCell,
  ReasonSheet,
  SearchIcon,
  Select,
  SheetFrame,
  ShieldIcon,
  SparklesIcon,
  StatePill,
  Switch,
  TableSkeleton,
  UsersIcon,
  hasStateMap,
  registerStateMap,
  useToast,
  type ReasonSpec,
} from "@kiwiply/ui";
import {
  STATE_LABEL,
  addOnNames,
  dayText,
  errorText,
  holdsLicense,
  licensesApi,
  newKey,
  priceText,
  summarize,
  type LicenseCatalog,
  type LicenseDetail,
  type LicenseQuote,
  type LicenseRow,
} from "@/lib/ent/licenses";

if (!hasStateMap("license-state")) {
  registerStateMap("license-state", { NONE: "grey-outline", ACTIVE: "green", SUSPENDED: "amber", ENDING: "amber-outline", ENDED: "grey" });
}

type Filter = "all" | "licensed" | "none" | "suspended";
const FILTERS = [
  { value: "all", label: "All consultants" },
  { value: "licensed", label: "Licensed" },
  { value: "none", label: "No licence" },
  { value: "suspended", label: "Suspended" },
];
const HEAD = "px-3 py-2.5 text-left text-[12px] font-semibold text-ink-soft";

/**
 * Consultant Licenses at `/w/admin/licenses` (docs/enterprise-v2/LICENCES-BUILD.md L4, ORG-BILLING-BUILD.md step 1b): who holds a licence, which
 * add-ons it carries (AI help, inbox, Autopilot prepare, ...), and the sheet that changes them. An add-on change is priced by the API first and confirmed
 * (quote -> confirm); nothing is billed yet (user decision 2026-11-10). The API is the gate (licenses.view to read, licenses.manage to change).
 */
export default function LicensesPage({ orgId, canManage }: { orgId: number; canManage: boolean }) {
  const toast = useToast();
  const [rows, setRows] = useState<LicenseRow[] | null>(null);
  const [catalog, setCatalog] = useState<LicenseCatalog | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<number | null>(null);

  const load = useCallback(async () => {
    const [list, cat] = await Promise.all([licensesApi.list(orgId), licensesApi.catalog(orgId)]);
    if (!list.ok) return setFailed(errorText(list));
    setRows(list.data);
    if (cat.ok) setCatalog(cat.data);
    setFailed(null);
  }, [orgId]);

  useEffect(() => {
    void load();
  }, [load]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (rows ?? []).filter((r) => {
      if (filter === "licensed" && !(r.status === "ACTIVE" || r.status === "ENDING")) return false;
      if (filter === "none" && holdsLicense(r)) return false;
      if (filter === "suspended" && r.status !== "SUSPENDED") return false;
      return !needle || r.name.toLowerCase().includes(needle) || (r.email ?? "").toLowerCase().includes(needle);
    });
  }, [rows, filter, q]);

  const counts = useMemo(() => summarize(rows ?? [], catalog), [rows, catalog]);
  const anyPrice = !!catalog && (catalog.basePriceMinor != null || catalog.addOns.some((a) => a.priceMinor != null));
  const open = rows?.find((r) => r.consultantId === openId) ?? null;

  const onSaved = (d: LicenseDetail, message: string) => {
    setRows((cur) => (cur ?? []).map((r) => (r.consultantId === d.row.consultantId ? d.row : r)));
    toast({ title: message, variant: "success" });
  };

  return (
    <>
      <PageHeader title="Consultant Licenses" subtitle="Who has a licence, and which add-ons each consultant can use." />
      <div className="space-y-4" data-licenses-page>
        <p className="rounded-[var(--radius)] border border-line bg-paper-2/60 px-3 py-2 text-[12.5px] text-ink-soft" data-licenses-billing-note>
          You see the price of each change before you confirm it. Nothing is billed yet{anyPrice ? ": prices come from your organization's contract or price list." : ", and prices show here once they are set."}
        </p>

        {failed ? (
          <ErrorState what="the licences" description={failed} onRetry={() => void load()} />
        ) : rows == null ? (
          <TableSkeleton columns={5} label="Loading licences" />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <KpiTile tone="blue" label="Consultants" icon={<UsersIcon />} value={counts.consultants} />
              <KpiTile tone="green" label="Licensed" icon={<KeyIcon />} value={counts.licensed} />
              <KpiTile tone="violet" label="With AI help" icon={<SparklesIcon />} value={counts.withAi} />
              <KpiTile tone="orange" label="Without a licence" icon={<ShieldIcon />} value={counts.unlicensed} />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative w-full max-w-xs">
                <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
                <Input aria-label="Search consultants" placeholder="Search by name or email" value={q} onChange={(e) => setQ(e.target.value)} className="pl-8" />
              </div>
              <Select aria-label="Show" value={filter} onChange={(v) => setFilter(v as Filter)} options={FILTERS} className="w-[170px]" />
            </div>

            {rows.length === 0 ? (
              <EmptyState mascot title="No consultants yet" description="Add consultants on the Consultants page, then give them a licence here." />
            ) : shown.length === 0 ? (
              <EmptyState variant="inline" title="No consultant matches" description="Try another name or show all consultants." />
            ) : (
              <div className="overflow-x-auto rounded-[var(--radius)] border border-line bg-paper">
                <table aria-label="Consultant licences" className="w-full border-collapse text-[12.5px]" data-licenses-table>
                  <thead className="border-b border-line bg-paper-2/60">
                    <tr>
                      <th scope="col" className={HEAD}>Consultant</th>
                      <th scope="col" className={HEAD}>Licence</th>
                      <th scope="col" className={HEAD}>Add-ons</th>
                      <th scope="col" className={`${HEAD} hidden md:table-cell`}>Price</th>
                      <th scope="col" className={HEAD}>
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((r) => (
                      <tr key={r.consultantId} data-license-row={r.consultantId} className="border-b border-line last:border-0">
                        <td className="px-3 py-2.5">
                          <PersonCell name={r.name} avatarName={r.name} sub={r.signInLinked ? r.email : "No sign-in linked yet"} />
                        </td>
                        <td className="px-3 py-2.5">
                          <StatePill domain="license-state" state={r.status} label={STATE_LABEL[r.status]} />
                        </td>
                        <td className="px-3 py-2.5">
                          {r.features.length === 0 ? (
                            <span className="text-muted">{holdsLicense(r) ? "Base licence only" : "—"}</span>
                          ) : (
                            <div className="flex flex-wrap gap-1">
                              {orderedKeys(r.features, catalog).map((k) => (
                                <span key={k} className="inline-flex">
                                  <FeatureChip name={addOnNames([k], catalog)[0]} state={r.endingFeatures?.includes(k) ? "pending-removal" : "active"} />
                                  {r.endingFeatures?.includes(k) && <span className="sr-only">, stops when the period ends</span>}
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="hidden px-3 py-2.5 text-ink-soft md:table-cell">{holdsLicense(r) ? priceText(r.monthlyMinor, catalog?.currency ?? "USD") : "—"}</td>
                        <td className="px-3 py-2.5 text-right">
                          {canManage || holdsLicense(r) ? (
                            <Button type="button" size="sm" variant={holdsLicense(r) ? "ghost" : "accent"} onClick={() => setOpenId(r.consultantId)} data-license-open={r.consultantId}>
                              {!holdsLicense(r) && canManage ? "Give licence" : canManage ? "Configure" : "View"}
                            </Button>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>

      <ConfigureLicenseSheet orgId={orgId} row={open} catalog={catalog} canManage={canManage} onClose={() => setOpenId(null)} onSaved={onSaved} />
    </>
  );
}

/** Add-on keys in catalog order (an unknown key last). */
function orderedKeys(keys: string[], catalog: LicenseCatalog | null): string[] {
  const at = new Map((catalog?.addOns ?? []).map((a, i) => [a.key, i]));
  return [...keys].sort((x, y) => (at.get(x) ?? 999) - (at.get(y) ?? 999));
}

/**
 * The sheet of one consultant: which add-ons the licence carries, and suspend / reactivate / end. An add-on change is reviewed first (the API's quote,
 * drawn by {@link QuoteSummary}) and only happens on Confirm. A removal waiting for the end of the billing period can be undone here ("Keep ...").
 */
export function ConfigureLicenseSheet({
  orgId,
  row,
  catalog,
  canManage,
  onClose,
  onSaved,
}: {
  orgId: number;
  row: LicenseRow | null;
  catalog: LicenseCatalog | null;
  canManage: boolean;
  onClose: () => void;
  onSaved: (d: LicenseDetail, message: string) => void;
}) {
  const toast = useToast();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [detail, setDetail] = useState<LicenseDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState<ReasonSpec | null>(null);
  const [quote, setQuote] = useState<LicenseQuote | null>(null);
  const [confirmKey, setConfirmKey] = useState<string | null>(null);
  const id = row?.consultantId ?? null;

  useEffect(() => {
    setPicked(new Set((row?.features ?? []).filter((k) => !row?.endingFeatures?.includes(k))));
    setDetail(null);
    setQuote(null);
    if (id == null) return;
    let live = true;
    void licensesApi.get(orgId, id).then((r) => {
      if (live && r.ok) setDetail(r.data);
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload only when another consultant opens, not on every row refresh
  }, [orgId, id]);

  if (!row) return <SheetFrame id="ent-license-sheet" open={false} onClose={onClose} title="Licence">{null}</SheetFrame>;
  const holds = holdsLicense(row);
  const suspended = row.status === "SUSPENDED";
  const keeping = row.features.filter((k) => !row.endingFeatures?.includes(k));
  const changed = !holds || picked.size !== keeping.length || keeping.some((k) => !picked.has(k));
  const toggle = (key: string, on: boolean) => {
    setQuote(null);
    setPicked((cur) => {
      const next = new Set(cur);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  };

  const review = async () => {
    setBusy(true);
    const r = await licensesApi.quote(orgId, row.consultantId, [...picked]);
    setBusy(false);
    if (!r.ok) return toast({ title: "Couldn't price the change", description: errorText(r), variant: "error" });
    setQuote(r.data);
    setConfirmKey(newKey());
  };

  const confirm = async () => {
    if (!quote) return;
    setBusy(true);
    const r = await licensesApi.confirm(orgId, quote.id, confirmKey ?? newKey());
    setBusy(false);
    if (!r.ok) {
      setQuote(null);
      return toast({ title: "Couldn't confirm the change", description: errorText(r), variant: "error" });
    }
    setQuote(null);
    setDetail(r.data);
    onSaved(r.data, holds ? `Licence updated for ${row.name}` : `${row.name} now has a licence`);
  };

  const keep = async (changeId: number, name: string) => {
    setBusy(true);
    const r = await licensesApi.keep(orgId, changeId);
    setBusy(false);
    if (!r.ok) return toast({ title: `Couldn't keep ${name}`, description: errorText(r), variant: "error" });
    setDetail(r.data);
    setPicked((cur) => new Set([...cur, ...r.data.row.features.filter((k) => !r.data.row.endingFeatures?.includes(k))]));
    onSaved(r.data, `${name} stays on ${row.name}'s licence`);
  };

  const withReason = (kind: "suspend" | "end"): ReasonSpec => ({
    title: kind === "suspend" ? `Suspend ${row.name}'s licence?` : `End ${row.name}'s licence?`,
    body: kind === "suspend" ? "Every add-on stops now. Reactivate later to bring them back." : "The licence and its add-ons stop now. You can give a new licence later.",
    confirmLabel: kind === "suspend" ? "Suspend licence" : "End licence",
    tone: "danger",
    placeholder: "Say why, for the audit log",
    run: async (why: string) => {
      const r = kind === "suspend" ? await licensesApi.suspend(orgId, row.consultantId, why) : await licensesApi.end(orgId, row.consultantId, why);
      if (!r.ok) return { ok: false, error: errorText(r) };
      setDetail(r.data);
      onSaved(r.data, kind === "suspend" ? `Licence suspended for ${row.name}` : `Licence ended for ${row.name}`);
      return { ok: true };
    },
  });

  const reactivate = async () => {
    setBusy(true);
    const r = await licensesApi.reactivate(orgId, row.consultantId);
    setBusy(false);
    if (!r.ok) return toast({ title: "Couldn't reactivate", description: errorText(r), variant: "error" });
    setDetail(r.data);
    onSaved(r.data, `Licence reactivated for ${row.name}`);
  };

  return (
    <>
      <SheetFrame id="ent-license-sheet" open={row != null} onClose={onClose} title={`Licence: ${row.name}`}>
        <div className="space-y-4" data-license-sheet={row.consultantId}>
          <div className="flex items-center gap-2">
            <StatePill domain="license-state" state={row.status} label={STATE_LABEL[row.status]} />
            {holds && <span className="text-[12.5px] text-ink-soft">{priceText(row.monthlyMinor, catalog?.currency ?? "USD")}</span>}
          </div>
          {suspended && row.suspendReason && <p className="text-[12.5px] text-ink-soft">Suspended: {row.suspendReason}</p>}
          {!row.signInLinked && <p className="text-[12.5px] text-ink-soft">This consultant has no sign-in linked yet. The licence works once they sign in.</p>}

          {detail?.scheduled && detail.scheduled.length > 0 && (
            <section aria-label="Waiting for the end of the period" className="space-y-1.5" data-license-scheduled>
              {detail.scheduled.map((s) => (
                <div key={s.changeId} className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius)] border border-dashed border-line px-3 py-2 text-[12.5px]">
                  <span className="text-ink-soft">
                    {s.name} stops on {dayText(s.effectiveAt)}
                  </span>
                  {canManage && (
                    <Button type="button" size="sm" variant="ghost" onClick={() => void keep(s.changeId, s.name)} disabled={busy} data-license-keep={s.changeId}>
                      Keep {s.name}
                    </Button>
                  )}
                </div>
              ))}
            </section>
          )}

          <fieldset className="space-y-2" disabled={!canManage || busy || suspended || quote != null}>
            <legend className="mb-1 text-[13px] font-semibold text-ink">{holds ? "Add-ons" : "Choose the add-ons for this licence"}</legend>
            <p className="text-[12px] text-muted">The base licence covers the consultant workspace, job tracking and the browser extension.</p>
            {(catalog?.addOns ?? []).map((a) => (
              <div key={a.key} className="rounded-[var(--radius)] border border-line px-3 py-2">
                <Switch
                  checked={picked.has(a.key)}
                  onCheckedChange={(on) => toggle(a.key, on)}
                  label={a.name}
                  description={[a.description, a.usesAi ? "Uses AI." : null, a.priceMinor != null ? priceText(a.priceMinor, catalog?.currency ?? "USD") : null].filter(Boolean).join(" ")}
                  aria-label={a.name}
                />
              </div>
            ))}
          </fieldset>

          {quote && <QuoteSummary quote={quote} />}

          {canManage && quote && (
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="accent" onClick={() => void confirm()} disabled={busy} data-license-confirm>
                {holds ? "Confirm change" : "Confirm licence"}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setQuote(null)} disabled={busy} data-license-back>
                Back
              </Button>
            </div>
          )}

          {canManage && !quote && (
            <div className="flex flex-wrap gap-2">
              {!suspended && (
                <Button type="button" variant="accent" onClick={() => void review()} disabled={busy || !changed} data-license-save>
                  {holds ? "Review change" : "Review licence"}
                </Button>
              )}
              {suspended && (
                <Button type="button" variant="accent" onClick={() => void reactivate()} disabled={busy} data-license-reactivate>
                  Reactivate
                </Button>
              )}
              {holds && !suspended && (
                <Button type="button" variant="ghost" onClick={() => setReason(withReason("suspend"))} disabled={busy} data-license-suspend>
                  Suspend
                </Button>
              )}
              {holds && (
                <Button type="button" variant="danger" onClick={() => setReason(withReason("end"))} disabled={busy} data-license-end>
                  End licence
                </Button>
              )}
            </div>
          )}

          {detail && detail.history.length > 0 && (
            <section aria-label="Licence history">
              <h3 className="mb-1 text-[13px] font-semibold text-ink">History</h3>
              <ul className="space-y-1 text-[12.5px] text-ink-soft">
                {detail.history.slice(0, 10).map((h, i) => (
                  <li key={`${h.kind}-${h.at}-${i}`}>
                    <span className="text-ink">{h.summary}</span>
                    {h.at && <span className="text-muted"> · {new Date(h.at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </SheetFrame>
      <ReasonSheet spec={reason} onClose={() => setReason(null)} />
    </>
  );
}
