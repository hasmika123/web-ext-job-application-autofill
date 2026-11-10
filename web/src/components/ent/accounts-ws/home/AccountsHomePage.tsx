"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertIcon, BriefcaseIcon, ClockIcon, ErrorState, UsersIcon } from "@kiwiply/ui";
import PageHeader, { ClaimsMascot } from "@/components/ent/shell/ShellContext";
import { CARD, CardSkeleton, Empty, Head, KpiTile } from "../../marketer-ws/parts";
import { ageText, DEFAULT_QUERY, dueText, requirementsApi, type ReqPage, type ReqQuery, type ReqRow, type ReqSummary } from "@/lib/ent/accounts-ws/requirements";
import { PriorityPill, type AccountsPageProps } from "../parts";

/**
 * Account Manager Home. Every figure and list is a real query on the requirements API (the same one the Requirements page uses); a card with nothing to show
 * says so, never a made-up row. The tiles and "View all" links open the Requirements and Contacts pages.
 */

type Phase = "loading" | "ready" | "failed" | "denied";

const WITHOUT: ReqQuery = { ...DEFAULT_QUERY, status: "OPEN", assigned: "NONE", sort: { key: "priority", dir: "desc" }, size: 5 };
const AGING: ReqQuery = { ...DEFAULT_QUERY, aging: true, sort: { key: "age", dir: "desc" }, size: 5 };

export default function AccountsHomePage({ orgId, firstName, hrefs }: AccountsPageProps) {
  const [summary, setSummary] = useState<ReqSummary | null>(null);
  const [without, setWithout] = useState<ReqPage | null>(null);
  const [aging, setAging] = useState<ReqPage | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const seq = useRef(0);

  const load = useCallback(async () => {
    const mine = ++seq.current;
    const [s, w, a] = await Promise.all([requirementsApi.summary(orgId), requirementsApi.list(orgId, WITHOUT), requirementsApi.list(orgId, AGING)]);
    if (mine !== seq.current) return;
    if (!s.ok) {
      setPhase(s.status === 404 ? "denied" : "failed");
      return;
    }
    setSummary(s.data);
    setWithout(w.ok ? w.data : null);
    setAging(a.ok ? a.data : null);
    setPhase("ready");
  }, [orgId]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  if (phase === "denied") return <ErrorState what="the Home page" title="This page isn't part of your role" description="Ask an organization admin if you should see it." variant="inline" />;
  const header = (
    <>
      <PageHeader title={firstName ? `Welcome back, ${firstName}` : "Home"} subtitle="What your clients are waiting on, at a glance." />
      <ClaimsMascot />
    </>
  );
  if (phase === "failed") {
    return (
      <div data-accounts-home data-status="failed">
        {header}
        <ErrorState what="your home page" description="The figures didn't load. Nothing has changed." onRetry={() => void load()} variant="inline" className="rounded-[var(--radius-lg)] border border-line bg-paper" />
      </div>
    );
  }
  const loading = phase === "loading";
  const reqHref = hrefs.requirements ?? null;
  const contactsHref = hrefs.contacts ?? null;

  const tile = (id: string, title: string, icon: typeof BriefcaseIcon, tint: "blue" | "coral" | "amber" | "violet", value: number | undefined, href: string | null, lowerIsBetter = false) => {
    const t = <KpiTile id={id} title={title} icon={icon} tint={tint} value={value ?? 0} loading={loading} layout="inline" lowerIsBetter={lowerIsBetter} />;
    return href ? (
      <Link href={href} className="block" aria-label={`${title}: open`}>
        {t}
      </Link>
    ) : (
      t
    );
  };

  return (
    <div data-accounts-home data-status={phase} className="flex flex-col gap-4 sm:gap-5">
      {header}
      <section aria-label="Key numbers" data-accounts-tiles className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-4">
        {tile("open", "Open requirements", BriefcaseIcon, "blue", summary?.open, reqHref)}
        {tile("unassigned", "Without a consultant", UsersIcon, "coral", summary?.unassigned, reqHref, true)}
        {tile("aging", `Aging (${summary?.agingDays ?? 14}+ days)`, ClockIcon, "amber", summary?.aging, reqHref, true)}
        {tile("contacts", "Client contacts", UsersIcon, "violet", summary?.contacts, contactsHref)}
      </section>

      <div className="grid gap-4 sm:gap-5 xl:grid-cols-2">
        <RequirementCard name="without" title="Waiting for a consultant" icon={AlertIcon} tint="coral" page={without} loading={loading} viewAll={reqHref} empty="Every open requirement has a consultant. Nice." />
        <RequirementCard name="aging" title="Open the longest" icon={ClockIcon} tint="amber" page={aging} loading={loading} viewAll={reqHref} empty={`Nothing has been open for ${summary?.agingDays ?? 14} days or more.`} />
      </div>
    </div>
  );
}

function RequirementCard({
  name, title, icon, tint, page, loading, viewAll, empty,
}: { name: string; title: string; icon: typeof BriefcaseIcon; tint: "blue" | "coral" | "amber" | "violet"; page: ReqPage | null; loading: boolean; viewAll: string | null; empty: string }) {
  const rows: ReqRow[] = page?.items ?? [];
  return (
    <section data-home-card={name} className={CARD} aria-label={title}>
      <Head icon={icon} title={title} tint={tint} count={loading ? undefined : (page?.total ?? 0)} viewAll={viewAll} />
      {loading ? (
        <CardSkeleton />
      ) : rows.length === 0 ? (
        <Empty>{empty}</Empty>
      ) : (
        <ul className="divide-y divide-line">
          {rows.map((r) => (
            <li key={r.id} data-home-row={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-semibold text-ink">{r.title}</p>
                <p className="truncate text-[12.5px] text-ink-soft">
                  {r.client.name} {"·"} {ageText(r.ageDays)} old{r.dueOn ? ` · needed by ${dueText(r.dueOn)}` : ""}
                </p>
              </div>
              <PriorityPill priority={r.priority} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
