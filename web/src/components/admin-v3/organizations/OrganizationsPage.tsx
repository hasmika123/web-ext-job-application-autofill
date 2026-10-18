"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BuildingIcon, Button, CheckIcon, ClockIcon, GlobeIcon, PlusIcon } from "@kiwiply/ui";
import { AdminFilterBar, AdminHero, AdminPanel, AdminSaveProvider, AdminStatTiles, AdminTable, StatusDot } from "../common";
import type { AdminColumn } from "../common";
import CreateOrganizationDialog from "./CreateOrganizationDialog";
import TempPasswordDialog from "@/components/ent/shared/TempPasswordDialog";
import { useListQuery } from "@/lib/list-query";
import { humanize, ORG_STATUSES, ORG_TYPES, typeLabel, type CreatedOrg, type OrgRow, type OrgSummary } from "@/lib/admin-orgs";

const STATUS_TONE: Record<string, "green" | "amber" | "coral" | "slate"> = { ACTIVE: "green", PAST_DUE: "amber", PENDING_SETUP_FEE: "amber", DRAFT: "slate", SUSPENDED: "coral", CLOSED: "slate" };

/**
 * Platform admin: Organizations (X1.11), the start of enterprise onboarding. Stat tiles -> filters -> table (cards on a phone);
 * a row opens the organization. "Create organization" makes the organization, its address and its owner account in one step and
 * shows the owner temporary password once. Everything is the real API: nothing on this page is sample data.
 */
export default function OrganizationsPage({ summary, baseDomain }: { summary: OrgSummary | null; baseDomain: string }) {
  return (
    <AdminSaveProvider>
      <Inner summary={summary} baseDomain={baseDomain} />
    </AdminSaveProvider>
  );
}

function Inner({ summary, baseDomain }: { summary: OrgSummary | null; baseDomain: string }) {
  const router = useRouter();
  const list = useListQuery<OrgRow>("/api/admin/orgs", { size: 20, filters: { status: undefined, type: undefined, enterprise: undefined } });
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<CreatedOrg | null>(null);

  const columns = useMemo<AdminColumn<OrgRow>[]>(
    () => [
      {
        key: "name",
        header: "Organization",
        primary: true,
        render: (o) => (
          <span className="block leading-tight">
            <span className="block truncate font-semibold text-ink">{o.name}</span>
            <span className="block truncate text-[12px] text-v2-muted">{o.host ?? o.subdomain ?? o.slug}</span>
          </span>
        ),
      },
      { key: "type", header: "Type", sub: true, render: (o) => typeLabel(o.type) },
      { key: "status", header: "Status", render: (o) => <StatusDot status={humanize(o.status)} tone={STATUS_TONE[o.status] ?? "slate"} /> },
      { key: "enterprise", header: "Enterprise", render: (o) => <StatusDot status={o.enterpriseOn ? "On" : "Off"} tone={o.enterpriseOn ? "green" : "slate"} /> },
      { key: "hosts", header: "Hostnames", render: (o) => o.hostnamesActive.toLocaleString("en-US") },
      { key: "members", header: "Members", render: (o) => o.memberCount.toLocaleString("en-US") },
    ],
    [],
  );

  return (
    <div className="mx-auto max-w-[1500px] space-y-4">
      <AdminHero
        eyebrow="ENTERPRISE"
        title="Organizations"
        subtitle="Provision an organization address, turn enterprise on for it and watch its hostnames."
        actions={
          <Button type="button" variant="primary" onClick={() => setCreating(true)} className="min-h-11 gap-1.5 sm:min-h-0">
            <PlusIcon size={16} /> Create organization
          </Button>
        }
      />

      {summary && (
        <AdminStatTiles
          stats={[
            { label: "Organizations", value: summary.orgs.toLocaleString("en-US"), icon: <BuildingIcon size={26} />, tone: "blue" },
            { label: "Enterprise on", value: summary.enterpriseOn.toLocaleString("en-US"), icon: <CheckIcon size={26} />, tone: "green" },
            { label: "Hostnames active", value: summary.hostnamesActive.toLocaleString("en-US"), icon: <GlobeIcon size={26} />, tone: "violet" },
            { label: "Pending", value: summary.pending.toLocaleString("en-US"), icon: <ClockIcon size={26} />, tone: "amber", caption: "waiting for a hostname" },
          ]}
        />
      )}

      <AdminPanel title="All organizations" description="Search by name or address. A row opens the organization.">
        <div className="space-y-3">
          <AdminFilterBar
            list={list}
            search={{ placeholder: "Search name or address" }}
            filters={[
              { name: "status", label: "Status", options: ORG_STATUSES.map((s) => ({ value: s, label: humanize(s) })) },
              { name: "type", label: "Type", options: ORG_TYPES.map((t) => ({ value: t.value, label: t.label })) },
              {
                name: "enterprise",
                label: "Enterprise",
                allLabel: "Any enterprise state",
                options: [
                  { value: "true", label: "Enterprise on" },
                  { value: "false", label: "Enterprise off" },
                ],
              },
            ]}
          />
          <AdminTable<OrgRow>
            list={list}
            columns={columns}
            rowKey={(o) => o.id}
            label="Organizations"
            what="organizations"
            sheetTitle={(o) => o.name}
            onRowClick={(o) => router.push(`/admin/organizations/${o.id}`)}
            empty={{ title: "No organizations yet", description: "Create the first one to start onboarding an enterprise." }}
          />
        </div>
      </AdminPanel>

      <CreateOrganizationDialog
        open={creating}
        baseDomain={baseDomain}
        onClose={() => setCreating(false)}
        onCreated={(c) => {
          setCreating(false);
          setCreated(c);
        }}
      />
      <TempPasswordDialog
        open={created !== null}
        title="Organization created"
        who={created?.ownerEmail ?? ""}
        password={created?.tempPassword ?? null}
        expiresAt={created?.tempPasswordExpiresAt}
        hint={created ? `This is a new organization account, separate from any personal Kiwiply account. They sign in at ${created.host} with their e-mail and this password, then choose their own.` : undefined}
        onClose={() => {
          const go = created;
          setCreated(null);
          if (go) router.push(`/admin/organizations/${go.id}`);
        }}
      />
    </div>
  );
}
