"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  AlertIcon,
  ChevronRightIcon,
  ClipboardIcon,
  DownloadIcon,
  FileTextIcon,
  KeyIcon,
  GearIcon,
  ShieldCheckIcon,
  ShieldIcon,
  TrashIcon,
  UsersIcon,
  cn,
} from "@kiwiply/ui";
import { Button, useToast } from "@/components/ui";
import { DataTable, Donut, FilterSelect, KebabMenu, Pagination, SearchInput, StatusChip, TONE, type Tone } from "@/components/app-v2/common";
import { AdminHero, AdminPanel, AdminStatTiles, HBarList, LegendList, PersonCell, SampleTag } from "../common";
import { AUDIT_TILES as T, COMPLIANCE } from "./sample-data";

export interface AuditEvent {
  id: number;
  actorLogin?: string | null;
  /** The mock API names it `actor`; the real one `actorLogin`. */
  actor?: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  reason?: string | null;
  details?: string | null;
  createdDate?: string | null;
}

type Risk = "High" | "Medium" | "Low" | "Informational";

const AREAS: Record<string, Tone> = {
  "User management": "blue",
  Security: "violet",
  Exports: "amber",
  "System changes": "teal",
  "AI usage": "lime",
  Support: "pink",
  Other: "slate",
};

/** Area is derived from the action name (the audit API stores no area). */
function areaOf(action: string): string {
  if (/GRANT_ADMIN|REVOKE_ADMIN|FORCE_LOGOUT|PASSWORD|2FA|LOGIN/.test(action)) return "Security";
  if (/EXPORT|DOWNLOAD/.test(action)) return "Exports";
  if (/^USER|CUSTOMER|PII/.test(action)) return "User management";
  if (/^AI_|QUOTA/.test(action)) return "AI usage";
  if (/^BUG|^INQUIRY/.test(action)) return "Support";
  if (/^DEMO|SETTING|SYSTEM|CONFIG/.test(action)) return "System changes";
  return "Other";
}

/** Risk is derived from the action name too (the audit API stores no risk level). */
function riskOf(action: string): Risk {
  if (/DELETE|GRANT_ADMIN|REVOKE_ADMIN|EXPORT/.test(action)) return "High";
  if (/DEACTIVATE|FORCE_LOGOUT|RESET|PII_VIEW|QUOTA|SETTING|DEMO_(ENABLE|DISABLE|RESET)/.test(action)) return "Medium";
  if (/TRIAGE|INQUIRY|BUG|UPDATE/.test(action)) return "Informational";
  return "Low";
}

const RISK_TONE: Record<Risk, Tone> = { High: "coral", Medium: "amber", Low: "green", Informational: "blue" };
const RISKS: Risk[] = ["High", "Medium", "Low", "Informational"];

const actorOf = (e: AuditEvent) => e.actorLogin ?? e.actor ?? "unknown";
const when = (iso?: string | null) => (iso ? iso.replace("T", " ").slice(0, 19) : "—");
const targetOf = (e: AuditEvent) => (e.targetId ? `${e.targetType ?? ""}${e.targetType ? ":" : ""}${e.targetId}` : "—");
const humanAction = (a: string) => a.charAt(0) + a.slice(1).toLowerCase().replace(/_/g, " ");

function csvCell(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/**
 * Audit Log (board 10). REAL: the events table, the total, server paging (`?page=`, 0-based, 30 per
 * page) and every row's actor / action / target / reason. The search + actor / area / event-type /
 * risk filters work on the CURRENTLY LOADED page only. Area and risk are DERIVED from the action
 * name (the API stores neither), and the Event distribution / Risk breakdown / Recent flagged /
 * Sensitive actions panels are computed from the loaded page. SAMPLE (tagged): the high-risk /
 * exports / access-review tiles and the compliance strip. "Export" downloads the visible rows as
 * CSV; "Create retention rule" has no backend and says "Coming soon". No IP / device column: the
 * API does not record one.
 */
export default function AuditPage({
  events,
  total,
  page,
  pageSize,
  error,
}: {
  events: AuditEvent[];
  total: number;
  page: number;
  pageSize: number;
  error: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [q, setQ] = useState("");
  const [actor, setActor] = useState("All actors");
  const [area, setArea] = useState("All areas");
  const [type, setType] = useState("All event types");
  const [risk, setRisk] = useState("All risk levels");

  const actors = useMemo(() => ["All actors", ...Array.from(new Set(events.map(actorOf))).sort()], [events]);
  const types = useMemo(() => ["All event types", ...Array.from(new Set(events.map((e) => e.action))).sort()], [events]);
  const areaOptions = ["All areas", ...Object.keys(AREAS)];
  const riskOptions = ["All risk levels", ...RISKS];

  const needle = q.trim().toLowerCase();
  const filtered = needle !== "" || actor !== actors[0] || area !== "All areas" || type !== types[0] || risk !== "All risk levels";
  const rows = events.filter((e) => {
    if (needle && !`${actorOf(e)} ${e.action} ${targetOf(e)} ${e.reason ?? ""} ${e.details ?? ""}`.toLowerCase().includes(needle)) return false;
    if (actor !== "All actors" && actorOf(e) !== actor) return false;
    if (area !== "All areas" && areaOf(e.action) !== area) return false;
    if (type !== "All event types" && e.action !== type) return false;
    if (risk !== "All risk levels" && riskOf(e.action) !== risk) return false;
    return true;
  });
  const reset = () => {
    setQ("");
    setActor("All actors");
    setArea("All areas");
    setType("All event types");
    setRisk("All risk levels");
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : page * pageSize + 1;
  const to = page * pageSize + events.length;

  // Derived from the loaded page.
  const byArea = Object.keys(AREAS)
    .map((label) => ({ label, tone: AREAS[label], value: events.filter((e) => areaOf(e.action) === label).length }))
    .filter((a) => a.value > 0);
  const byRisk = RISKS.map((label) => ({ label, tone: RISK_TONE[label], value: events.filter((e) => riskOf(e.action) === label).length }));
  const flagged = events.filter((e) => riskOf(e.action) === "High").slice(0, 4);
  const count = (re: RegExp) => events.filter((e) => re.test(e.action)).length;
  const pct = (n: number) => (events.length ? `${Math.round((n / events.length) * 100)}%` : "0%");

  function exportCsv() {
    const head = ["id", "timestamp", "actor", "area", "action", "target", "risk", "details"];
    const lines = [head.join(",")].concat(
      rows.map((e) =>
        [String(e.id), when(e.createdDate), actorOf(e), areaOf(e.action), e.action, targetOf(e), riskOf(e.action), e.reason || e.details || ""].map(csvCell).join(","),
      ),
    );
    const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-log-page-${page + 1}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast({ variant: "success", title: `Exported ${rows.length} event${rows.length === 1 ? "" : "s"}`, description: "This page of the audit log, as CSV." });
  }

  async function copyEvent(e: AuditEvent) {
    try {
      await navigator.clipboard.writeText(JSON.stringify(e, null, 2));
      toast({ variant: "success", title: "Event copied" });
    } catch {
      toast({ variant: "error", title: "Couldn't copy to the clipboard." });
    }
  }

  return (
    <div className="mx-auto max-w-[1500px] space-y-4">
      <AdminHero
        title="Audit Log"
        subtitle="Track administrative activity, security-sensitive actions, exports, and compliance events across the platform."
        note="Transparency today for a safer tomorrow!"
      />

      <AdminStatTiles
        stats={[
          { label: "Total events", value: error ? "n/a" : total.toLocaleString("en-US"), icon: <FileTextIcon size={26} />, tone: "blue", delta: T.total.delta, caption: "trend is sample", sparkline: T.total.spark },
          { label: "High-risk actions", value: T.highRisk.value, icon: <ShieldIcon size={26} />, tone: "coral", delta: T.highRisk.delta, caption: "sample data", sparkline: T.highRisk.spark },
          { label: "Exports", value: T.exports.value, icon: <DownloadIcon size={26} />, tone: "amber", delta: T.exports.delta, caption: "sample data", sparkline: T.exports.spark },
          { label: "Access reviews", value: T.reviews.value, icon: <UsersIcon size={26} />, tone: "violet", delta: T.reviews.delta, caption: "sample data", sparkline: T.reviews.spark },
        ]}
      />

      {error ? (
        <div className="rounded-2xl border border-v2-line/70 bg-paper p-6 text-sm text-ink-soft">
          The audit log couldn&apos;t be loaded. Check that the API is reachable and try again.
        </div>
      ) : (
        <div id="audit-events-anchor" className="scroll-mt-20">
        <AdminPanel
          title="Audit log"
          description="Search, filter, and review administrative activity, security events, and system changes. Immutable, newest first."
          right={
            <Button variant="ghost" size="sm" onClick={exportCsv} disabled={rows.length === 0}>
              <DownloadIcon size={15} /> Export CSV
            </Button>
          }
        >
          <div className="mb-3 flex flex-wrap items-center gap-2.5">
            <SearchInput
              variant="grey"
              size="sm"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search actors, actions, targets, or details..."
              wrapperClassName="min-w-[220px] flex-1 sm:max-w-[360px]"
            />
            <FilterSelect label="Actor" options={actors} value={actor} onChange={setActor} className="w-[140px]" />
            <FilterSelect label="Area" options={areaOptions} value={area} onChange={setArea} className="w-[160px]" />
            <FilterSelect label="Event type" options={types} value={type} onChange={setType} className="w-[190px]" />
            <FilterSelect label="Risk" options={riskOptions} value={risk} onChange={setRisk} className="w-[150px]" />
            <Button variant="ghost" size="sm" onClick={reset} disabled={!filtered}>
              Reset
            </Button>
            <span className="ml-auto text-[12px] text-v2-muted">
              {filtered ? `${rows.length} of ${events.length} on this page` : `${events.length} on this page`}
            </span>
          </div>

          <DataTable
            inCard
            minWidth={880}
            aria-label="Audit events"
            rows={rows}
            rowKey={(e) => e.id}
            empty={filtered ? "No events on this page match your filters." : "No actions recorded yet."}
            columns={[
              { key: "when", header: "TIMESTAMP", className: "whitespace-nowrap", render: (e) => <span className="text-ink-soft">{when(e.createdDate)}</span> },
              { key: "actor", header: "ACTOR", primary: true, render: (e) => <PersonCell name={actorOf(e)} avatarName={actorOf(e)} size={30} /> },
              {
                key: "area",
                header: "AREA",
                render: (e) => {
                  const a = areaOf(e.action);
                  return <StatusChip tone={AREAS[a]}>{a}</StatusChip>;
                },
              },
              {
                key: "action",
                header: "ACTION",
                render: (e) => (
                  <span title={e.action} className="text-ink">
                    {humanAction(e.action)}
                  </span>
                ),
              },
              { key: "target", header: "TARGET", render: (e) => <span className="break-all text-ink-soft">{targetOf(e)}</span> },
              { key: "risk", header: "RISK", render: (e) => <StatusChip tone={RISK_TONE[riskOf(e.action)]} dot>{riskOf(e.action)}</StatusChip> },
              { key: "details", header: "DETAILS", mobileLabel: "Details", render: (e) => <span className="text-ink-soft">{e.reason || e.details || "—"}</span> },
            ]}
            actions={(e) => (
              <span className="relative inline-block">
                <KebabMenu
                  label={`Actions for event ${e.id}`}
                  items={[{ label: "Copy event as JSON", icon: <ClipboardIcon size={15} />, onSelect: () => void copyEvent(e) }]}
                />
              </span>
            )}
            footer={
              <Pagination
                tone="blue"
                page={page + 1}
                pages={totalPages}
                summary={`Showing ${from}-${to} of ${total.toLocaleString("en-US")} events · ${pageSize} per page`}
                onPageChange={(p) => router.push(`/admin/audit?page=${p - 1}`)}
                className="pt-3"
              />
            }
          />
        </AdminPanel>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[1.15fr_1fr_1fr]">
        <AdminPanel title="Event distribution" description="Events by area on this page of the log.">
          {events.length === 0 ? (
            <p className="text-sm text-ink-soft">No events to chart.</p>
          ) : (
            <div className="flex flex-col items-center gap-4 sm:flex-row">
              <Donut
                legend={false}
                size={132}
                centerValue={events.length}
                centerLabel="Events"
                segments={byArea.map((a) => ({ label: a.label, value: a.value, tone: a.tone }))}
              />
              <LegendList items={byArea.map((a) => ({ label: a.label, tone: a.tone, value: a.value, pct: pct(a.value) }))} />
            </div>
          )}
        </AdminPanel>

        <AdminPanel title="Risk breakdown" description="Events by derived risk level on this page.">
          <HBarList
            max={Math.max(1, ...byRisk.map((r) => r.value))}
            items={byRisk.map((r) => ({ label: r.label, value: r.value, tone: r.tone, display: r.value, pct: pct(r.value) }))}
          />
          <p className="mt-3 text-[11.5px] text-v2-muted">Risk is inferred from the action type; the API does not store a risk level.</p>
        </AdminPanel>

        <AdminPanel title="Recent flagged events" description="High-risk actions on this page." link={{ label: "View all", href: "/admin/audit" }} className="md:col-span-2 xl:col-span-1">
          {flagged.length === 0 ? (
            <p className="text-sm text-ink-soft">No high-risk actions on this page.</p>
          ) : (
            <ul className="space-y-3">
              {flagged.map((e) => (
                <li key={e.id} className="flex items-start gap-2.5">
                  <span className={cn("grid h-9 w-9 flex-none place-items-center rounded-xl", TONE.coral.soft, TONE.coral.ink)}>
                    <AlertIcon size={18} />
                  </span>
                  <span className="min-w-0 flex-1 leading-tight">
                    <span className="block truncate text-[13px] font-semibold text-ink">{humanAction(e.action)}</span>
                    <span className="block truncate text-[12px] text-v2-muted">
                      {actorOf(e)} · {when(e.createdDate).slice(0, 16)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </AdminPanel>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr]">
        <AdminPanel title="Compliance activity" description="Compliance-related events and regulatory activities." right={<SampleTag />} className="md:col-span-2 xl:col-span-1">
          <div className="grid grid-cols-2 gap-3">
            {COMPLIANCE.map((c, i) => (
              <div key={c.label} className="flex items-center gap-2.5 rounded-xl bg-paper-2/70 p-3">
                <span className={cn("grid h-9 w-9 flex-none place-items-center rounded-lg", TONE[(["green", "blue", "coral", "lime"] as Tone[])[i]].soft, TONE[(["green", "blue", "coral", "lime"] as Tone[])[i]].ink)}>
                  {[<ShieldCheckIcon key="a" size={18} />, <DownloadIcon key="b" size={18} />, <TrashIcon key="c" size={18} />, <AlertIcon key="d" size={18} />][i]}
                </span>
                <span className="min-w-0 leading-tight">
                  <span className="block font-display text-[20px] font-extrabold text-ink">{c.value}</span>
                  <span className="block text-[11.5px] text-ink-soft">{c.label}</span>
                </span>
              </div>
            ))}
          </div>
        </AdminPanel>

        <AdminPanel title="Sensitive actions overview" description="High-impact administrative actions on this page.">
          <div className="grid grid-cols-2 gap-3">
            <Sensitive icon={<DownloadIcon size={18} />} tone="amber" value={count(/EXPORT|DOWNLOAD/)} label="Data exports" />
            <Sensitive icon={<UsersIcon size={18} />} tone="coral" value={count(/DEACTIVATE|DELETE/)} label="User suspensions / deletions" />
            <Sensitive icon={<KeyIcon size={18} />} tone="violet" value={count(/GRANT_ADMIN|REVOKE_ADMIN/)} label="Permission changes" />
            <Sensitive icon={<GearIcon size={18} />} tone="blue" value={count(/SETTING|CONFIG|DEMO/)} label="System settings" />
          </div>
        </AdminPanel>

        <AdminPanel title="Quick actions" description="Common audit log and compliance tasks.">
          <div className="space-y-2.5">
            <ActionRow icon={<DownloadIcon size={20} />} tone="green" title="Export audit log" description="Download this page as CSV." onClick={exportCsv} />
            <ActionRow
              icon={<ClipboardIcon size={20} />}
              tone="blue"
              title="Create retention rule"
              description="Set data retention policies."
              onClick={() => toast({ title: "Coming soon", description: "Retention rules aren't available in the admin console yet." })}
            />
            <ActionRow
              icon={<ShieldIcon size={20} />}
              tone="violet"
              title="Review flagged access"
              description="Show the high-risk events on this page."
              onClick={() => {
                setRisk("High");
                document.getElementById("audit-events-anchor")?.scrollIntoView({ behavior: "smooth" });
              }}
            />
          </div>
        </AdminPanel>
      </div>
    </div>
  );
}

function Sensitive({ icon, tone, value, label }: { icon: ReactNode; tone: Tone; value: number; label: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl bg-paper-2/70 p-3">
      <span className={cn("grid h-9 w-9 flex-none place-items-center rounded-lg", TONE[tone].soft, TONE[tone].ink)}>{icon}</span>
      <span className="min-w-0 leading-tight">
        <span className="block font-display text-[20px] font-extrabold text-ink">{value}</span>
        <span className="block text-[11.5px] text-ink-soft">{label}</span>
      </span>
    </div>
  );
}

function ActionRow({ icon, tone, title, description, onClick }: { icon: ReactNode; tone: Tone; title: string; description: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="group flex w-full min-w-0 items-center gap-3 rounded-2xl bg-paper-2/70 p-3 text-left transition-colors hover:bg-paper-2">
      <span className={cn("grid h-10 w-10 flex-none place-items-center rounded-xl", TONE[tone].soft, TONE[tone].ink)}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13.5px] font-bold text-ink">{title}</span>
        <span className="block text-[12px] leading-snug text-ink-soft">{description}</span>
      </span>
      <ChevronRightIcon size={16} className="flex-none text-v2-blue" />
    </button>
  );
}
