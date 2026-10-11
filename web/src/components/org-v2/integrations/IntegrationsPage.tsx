"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  AlertIcon,
  CheckCircleIcon,
  ClockIcon,
  ExternalLinkIcon,
  KeyIcon,
  LayersIcon,
  PlusIcon,
  ShareNodesIcon,
  WebhookIcon,
  LinkIcon,
  Switch,
  UsersIcon,
  cn,
} from "@kiwiply/ui";
import { StatusChip } from "@/components/app-v2/common";
import { BrandTile, PageHero, SectionCard, StatTile } from "../common-local2/primitives";
import { MoreButton, OrgButton, SearchInput } from "../common-local2/controls";
import {
  API_ACCESS_ROWS,
  AUTOMATION_FLOWS,
  INTEGRATIONS,
  INTEGRATION_STATS,
  NOTIFICATION_ROUTES,
} from "../sample-data.2";

const STAT_ICONS = [<ShareNodesIcon key="a" />, <CheckCircleIcon key="b" />, <ClockIcon key="c" />, <AlertIcon key="d" />];

/** "Run Sync" button that shows a short syncing state (no backend yet - board data only). */
function SyncButton({ variant = "outline", size = "md", className }: { variant?: "outline" | "soft-blue"; size?: "sm" | "md"; className?: string }) {
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  return (
    <OrgButton
      variant={variant}
      size={size}
      className={className}
      disabled={busy}
      onClick={() => {
        setBusy(true);
        timer.current = setTimeout(() => setBusy(false), 1200);
      }}
    >
      {busy ? "Syncing…" : "Run Sync"}
    </OrgButton>
  );
}

function IntegrationCard({ name, lastSync, data }: { name: string; lastSync: string; data: string }) {
  return (
    <article className="flex min-w-0 flex-col rounded-2xl border border-[#E6EAF3] bg-white p-4">
      <header className="flex items-center gap-3">
        <BrandTile name={name} size={40} />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[14.5px] font-bold leading-tight tracking-normal text-v2-navy">{name}</h3>
          <StatusChip tone="green" className="mt-1 px-2 py-0.5 text-[11px]">
            Connected
          </StatusChip>
        </div>
        <MoreButton label={`${name} options`} />
      </header>
      <dl className="mt-3.5 flex-1 space-y-2.5 text-[12.5px]">
        <div>
          <dt className="text-v2-muted">Last Sync</dt>
          <dd className="mt-0.5 font-semibold text-v2-navy">{lastSync}</dd>
        </div>
        <div>
          <dt className="text-v2-muted">Synced Data</dt>
          <dd className="mt-0.5 leading-snug text-v2-ink-soft">{data}</dd>
        </div>
      </dl>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <OrgButton variant="outline" size="sm">
          Manage
        </OrgButton>
        <SyncButton size="sm" />
      </div>
    </article>
  );
}

function ListRow({
  icon,
  title,
  sub,
  cta,
  ctaIcon,
  tone,
}: {
  icon: ReactNode;
  title: string;
  sub: string;
  cta: string;
  ctaIcon?: ReactNode;
  tone?: "alert";
}) {
  return (
    <li className="flex items-center gap-3 py-3">
      <span
        className={cn(
          "flex h-9 w-9 flex-none items-center justify-center rounded-[10px] [&>svg]:h-[18px] [&>svg]:w-[18px]",
          tone === "alert" ? "bg-v2-coral-soft text-v2-coral" : "bg-v2-blue-soft text-v2-blue",
        )}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13.5px] font-bold text-v2-navy">{title}</span>
        <span className="block text-[12.5px] text-v2-ink-soft">{sub}</span>
      </span>
      <button type="button" className="inline-flex flex-none cursor-pointer items-center gap-1 text-[13px] font-semibold text-v2-blue hover:underline">
        {cta}
        {ctaIcon}
      </button>
    </li>
  );
}

function AutomationFlows() {
  const [on, setOn] = useState<Record<string, boolean>>(() => Object.fromEntries(AUTOMATION_FLOWS.map((f) => [f.id, true])));
  return (
    <SectionCard title="Automation Flows" action={{ label: "View all", href: "/org/integrations" }}>
      <p className="-mt-1.5 mb-1 text-[12.5px] text-v2-ink-soft">Automate tasks across your integrated tools.</p>
      <ul className="divide-y divide-[#EEF1F7]">
        {AUTOMATION_FLOWS.map((f) => (
          <li key={f.id} className="flex items-center gap-3 py-3">
            <span className="min-w-0 flex-1">
              <span className="block text-[13.5px] font-bold leading-snug text-v2-navy">{f.title}</span>
              <span className="block text-[12.5px] text-v2-ink-soft">{f.sub}</span>
            </span>
            <Switch
              aria-label={f.title}
              checked={on[f.id]}
              onCheckedChange={(v) => setOn((p) => ({ ...p, [f.id]: v }))}
              className={on[f.id] ? "bg-v2-green!" : ""}
            />
            <MoreButton label={`${f.title} options`} />
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}

/** Integrations body (spec 6.2). Renders inside the org shell. */
export default function IntegrationsPage() {
  const [q, setQ] = useState("");
  const term = q.trim().toLowerCase();
  const shown = INTEGRATIONS.filter((i) => !term || i.name.toLowerCase().includes(term) || i.data.toLowerCase().includes(term));
  // Board layout: row 1 = four cards, row 2 = the remaining five (only while unfiltered).
  const row1 = term ? shown : shown.slice(0, 4);
  const row2 = term ? [] : shown.slice(4);

  return (
    <div className="space-y-4">
      <PageHero
        title="Integrations"
        icon={<ShareNodesIcon />}
        subtitle="Connect the tools you use for employee job placement and streamline your workflow."
        note="Connect your tools. Create more opportunities together."
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {INTEGRATION_STATS.map((s, i) => (
          <StatTile key={s.label} icon={STAT_ICONS[i]} value={s.value} label={s.label} delta={s.delta} sparkline={s.spark} tone={s.tone} />
        ))}
      </div>

      <SectionCard
        title="Connected Integrations"
        headerExtra={
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput placeholder="Search integrations..." size="sm" value={q} onChange={setQ} className="w-full min-[480px]:w-[220px]" />
            <OrgButton variant="solid" icon={<PlusIcon />}>
              Add Integration
            </OrgButton>
            <SyncButton />
            <OrgButton variant="outline">Configure Mapping</OrgButton>
          </div>
        }
      >
        {shown.length === 0 ? (
          <p className="rounded-xl bg-[#F6F8FC] px-4 py-8 text-center text-[13px] text-v2-ink-soft">No integrations match “{q}”.</p>
        ) : (
          <div className="space-y-3.5">
            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
              {row1.map((i) => (
                <IntegrationCard key={i.name} {...i} />
              ))}
            </div>
            {row2.length > 0 && (
              <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                {row2.map((i) => (
                  <IntegrationCard key={i.name} {...i} />
                ))}
              </div>
            )}
          </div>
        )}
      </SectionCard>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <SectionCard title="Webhooks & API Keys">
          <p className="-mt-1.5 text-[12.5px] text-v2-ink-soft">Manage API access and webhook endpoints for custom integrations.</p>
          <ul className="mt-1 divide-y divide-[#EEF1F7]">
            {API_ACCESS_ROWS.map((r) => (
              <ListRow
                key={r.id}
                icon={r.id === "keys" ? <KeyIcon /> : r.id === "hooks" ? <WebhookIcon /> : <LayersIcon />}
                title={r.title}
                sub={r.sub}
                cta={r.cta}
                ctaIcon={r.external ? <ExternalLinkIcon size={13} /> : undefined}
              />
            ))}
          </ul>
        </SectionCard>

        <SectionCard title="Notification Routing">
          <p className="-mt-1.5 text-[12.5px] text-v2-ink-soft">Send integration events to the right people and channels.</p>
          <ul className="mt-1 divide-y divide-[#EEF1F7]">
            {NOTIFICATION_ROUTES.map((r) => (
              <ListRow
                key={r.title}
                icon={r.alert ? <AlertIcon /> : r.title === "Placement Confirmations" ? <UsersIcon /> : <LinkIcon />}
                title={r.title}
                sub={r.sub}
                cta="Edit"
                tone={r.alert ? "alert" : undefined}
              />
            ))}
          </ul>
        </SectionCard>

        <div className="lg:col-span-2 xl:col-span-1">
          <AutomationFlows />
        </div>
      </div>
    </div>
  );
}
