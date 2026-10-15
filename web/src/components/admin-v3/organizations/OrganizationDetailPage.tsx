"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeftIcon, BuildingIcon, Button, buttonVariants, ClockIcon, GlobeIcon, KeyIcon, Switch, UsersIcon } from "@kiwiply/ui";
import { AdminHero, AdminPanel, AdminSaveProvider, AdminStatTiles, HistoryDrawer, StatusDot, useAdminSave } from "../common";
import type { HistoryLoader } from "../common";
import LabelField, { useLabelCheck } from "./LabelField";
import { SheetFrame } from "../common/ReasonSheet";
import TempPasswordDialog from "@/components/ent/shared/TempPasswordDialog";
import { adminFetch, type AdminOutcome } from "@/lib/admin-client";
import { actionLabel, humanize, typeLabel, type OrgDetail, type OwnerCredentials } from "@/lib/admin-orgs";

const HOST_TONE: Record<string, "green" | "amber" | "coral" | "slate"> = { ACTIVE: "green", PENDING: "amber", VERIFYING: "amber", VERIFIED: "amber", SUSPENDED: "coral", REMOVED: "slate" };

/**
 * One organization for the platform admin (X1.11). Hostnames panel (provision a subdomain with a live reserved / taken check,
 * suspend and resume with a reason), the enterprise switch (always with a reason), the owner (reset a temporary password that
 * has not been replaced yet), and the admin audit tail in the History drawer. No member names or addresses: only counts.
 */
export default function OrganizationDetailPage({ initial, id }: { initial: OrgDetail | null; id: number }) {
  return (
    <AdminSaveProvider>
      <Inner initial={initial} id={id} />
    </AdminSaveProvider>
  );
}

function Inner({ initial, id }: { initial: OrgDetail | null; id: number }) {
  const a = useAdminSave();
  const [org, setOrg] = useState<OrgDetail | null>(initial);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [provisioning, setProvisioning] = useState(false);
  const [history, setHistory] = useState(false);
  const [creds, setCreds] = useState<OwnerCredentials | null>(null);
  const historyBtn = useRef<HTMLButtonElement>(null);

  async function reload() {
    const res = await adminFetch<OrgDetail>("GET", `/orgs/${id}`);
    if (res.ok) {
      setOrg(res.data);
      setLoadError(null);
    } else setLoadError(res.error);
  }

  async function post(path: string, body: unknown): Promise<AdminOutcome> {
    const res = await adminFetch<OrgDetail>("POST", path, body);
    if (!res.ok) return res;
    setOrg(res.data);
    return { ok: true };
  }

  if (!org) {
    return (
      <div className="mx-auto max-w-[900px] space-y-3 py-10 text-center">
        <p className="text-[15px] font-semibold text-ink">Couldn&apos;t load this organization.</p>
        {loadError && <p className="text-[13px] text-danger-text">{loadError}</p>}
        <Button type="button" variant="primary" onClick={() => void reload()}>
          Try again
        </Button>
      </div>
    );
  }

  const baseDomain = org.baseDomain ?? "kiwiply.com";

  function toggleEnterprise(on: boolean) {
    if (!org) return;
    a.askReason({
      title: on ? `Turn enterprise on for ${org.name}?` : `Turn enterprise off for ${org.name}?`,
      body: on ? "Its address starts serving the organization workspace, and its people can sign in there." : "Its address stops serving the organization workspace. Nothing is deleted.",
      confirmLabel: on ? "Turn on" : "Turn off",
      tone: on ? "primary" : "danger",
      placeholder: on ? "e.g. Order form signed, pilot starts Monday" : "e.g. Pilot ended at the customer request",
      run: (reason) => post(`/orgs/${id}/enterprise`, { on, reason }),
    });
  }

  function toggleModule(key: string, label: string, on: boolean) {
    a.askReason({
      title: on ? `Turn on ${label} for ${org?.name}?` : `Turn off ${label} for ${org?.name}?`,
      body: on ? "Its people get this part of the workspace. It needs enterprise to be on for the organization." : "Its people lose this part of the workspace. Nothing is deleted.",
      confirmLabel: on ? "Turn on" : "Turn off",
      tone: on ? "primary" : "danger",
      placeholder: on ? "e.g. Part of the pilot scope" : "e.g. Not part of the contract",
      run: (reason) => post(`/orgs/${id}/modules`, { key, on, reason }),
    });
  }

  function hostAction(hid: number, hostname: string, action: "suspend" | "resume") {
    a.askReason({
      title: action === "suspend" ? `Suspend ${hostname}?` : `Resume ${hostname}?`,
      body: action === "suspend" ? "The address stops answering at once: it becomes an unknown host until you resume it." : "The address starts answering again on the next request.",
      confirmLabel: action === "suspend" ? "Suspend" : "Resume",
      tone: action === "suspend" ? "danger" : "primary",
      placeholder: action === "suspend" ? "e.g. Payment dispute under review" : "e.g. Dispute resolved",
      run: (reason) => post(`/orgs/${id}/hostnames/${hid}/${action}`, { reason }),
    });
  }

  function resetOwner() {
    if (!org) return;
    a.askReason({
      title: `Reset the owner password for ${org.name}?`,
      body: "Issues a new temporary password, shown once. The old one stops working. Only possible while the owner has not chosen their own password yet.",
      confirmLabel: "Reset password",
      tone: "primary",
      placeholder: "e.g. Owner lost the first password",
      run: async (reason) => {
        const res = await adminFetch<OwnerCredentials>("POST", `/orgs/${id}/owner/reset-password`, { reason });
        if (!res.ok) return res;
        setCreds(res.data);
        void reload();
        return { ok: true };
      },
    });
  }

  const loadAudit: HistoryLoader = async () => {
    const res = await adminFetch<OrgDetail>("GET", `/orgs/${id}`);
    if (!res.ok) return res;
    return {
      ok: true,
      data: res.data.audit.map((r) => ({ id: r.id, key: actionLabel(r.action), oldValue: null, newValue: r.details, actorLogin: r.actorLogin, reason: null, changedAt: r.createdAt })),
    };
  };

  const e = org.enterprise;
  return (
    <div className="mx-auto max-w-[1500px] space-y-4">
      <Link href="/admin/organizations" className="inline-flex min-h-11 items-center gap-1.5 text-[13.5px] font-semibold text-accent-deep hover:underline sm:min-h-0">
        <ArrowLeftIcon size={15} /> All organizations
      </Link>
      <AdminHero
        eyebrow="ORGANIZATION"
        title={org.name}
        subtitle={`${typeLabel(org.type)} · ${humanize(org.status)} · ${org.slug}`}
        actions={
          <button ref={historyBtn} type="button" onClick={() => setHistory(true)} aria-haspopup="dialog" className={buttonVariants("ghost", "md", "min-h-11 sm:min-h-0")}>
            History
          </button>
        }
      />

      <AdminStatTiles
        stats={[
          { label: "Members", value: org.memberCount.toLocaleString("en-US"), icon: <UsersIcon size={26} />, tone: "blue" },
          { label: "Pending invites", value: org.pendingInvites.toLocaleString("en-US"), icon: <ClockIcon size={26} />, tone: "amber" },
          { label: "Hostnames", value: org.hostnames.filter((h) => h.status === "ACTIVE").length.toLocaleString("en-US"), icon: <GlobeIcon size={26} />, tone: "violet", caption: "active" },
          { label: "Config version", value: String(org.configVersion), icon: <BuildingIcon size={26} />, tone: "slate" },
        ]}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <AdminPanel title="Enterprise" description="Whether this organization address serves the organization workspace.">
          <div className="flex min-h-11 items-center gap-3">
            <Switch aria-label={`Enterprise for ${org.name}`} checked={e.on} onCheckedChange={toggleEnterprise} />
            <span className="text-[13px] font-bold text-ink-soft" data-enterprise-state>
              {e.on ? "ON" : "OFF"}
            </span>
          </div>
          <p className="mt-2 text-[12.5px] leading-snug text-v2-muted">
            {e.allowListed ? "On the allow list. " : ""}
            {e.denied ? "Denied: switched off for this organization. " : ""}
            {!e.masterOn && !e.on ? "The platform master switch is off; turning this on also switches it on, for the allow list only." : "Every change asks for a reason and is recorded."}
          </p>
        </AdminPanel>

        <AdminPanel title="Owner" description="The first person in charge of this organization.">
          <p className="text-[13.5px] leading-snug text-ink-soft">
            The owner signs in at the organization address with a temporary password and chooses their own. If they never got it, issue a new one.
          </p>
          <div className="mt-3">
            <Button type="button" variant="ghost" onClick={resetOwner} className="min-h-11 gap-1.5 sm:min-h-0">
              <KeyIcon size={16} /> Reset owner password
            </Button>
          </div>
        </AdminPanel>
      </div>

      <AdminPanel title="Modules" description="Which parts of the workspace this organization has. Each one needs enterprise to be on.">
        <ul className="divide-y divide-v2-line/60" aria-label="Modules">
          {org.modules.map((m) => (
            <li key={m.key} className="flex min-h-11 items-center gap-3 py-2" data-module={m.key}>
              <span className="min-w-0 flex-1 text-[14px] font-semibold text-ink">{m.label}</span>
              <Switch aria-label={`${m.label} for ${org.name}`} checked={m.on} onCheckedChange={(on) => toggleModule(m.key, m.label, on)} />
              <span className="w-8 text-[12px] font-bold text-ink-soft">{m.on ? "ON" : "OFF"}</span>
            </li>
          ))}
        </ul>
      </AdminPanel>

      <AdminPanel
        title="Hostnames"
        description="The addresses that reach this organization."
        right={
          <Button type="button" variant="primary" onClick={() => setProvisioning(true)} className="min-h-11 sm:min-h-0">
            Provision subdomain
          </Button>
        }
      >
        {org.hostnames.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-v2-muted">No hostname yet. Provision a subdomain to give this organization an address.</p>
        ) : (
          <ul className="divide-y divide-v2-line/60" aria-label="Hostnames">
            {org.hostnames.map((h) => (
              <li key={h.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3" data-hostname={h.hostname}>
                <span className="min-w-0 flex-1">
                  <span className="block break-all text-[14px] font-semibold text-ink">{h.hostname}</span>
                  <span className="block text-[12px] text-v2-muted">
                    {humanize(h.kind)}
                    {h.primary ? " · primary" : ""}
                  </span>
                </span>
                <StatusDot status={humanize(h.status)} tone={HOST_TONE[h.status] ?? "slate"} />
                {h.status === "ACTIVE" && (
                  <Button type="button" variant="ghost" onClick={() => hostAction(h.id, h.hostname, "suspend")} className="min-h-11 sm:min-h-0">
                    Suspend
                  </Button>
                )}
                {h.status === "SUSPENDED" && (
                  <Button type="button" variant="ghost" onClick={() => hostAction(h.id, h.hostname, "resume")} className="min-h-11 sm:min-h-0">
                    Resume
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </AdminPanel>

      <ProvisionDialog
        open={provisioning}
        orgId={id}
        current={org.subdomain}
        baseDomain={baseDomain}
        onClose={() => setProvisioning(false)}
        onDone={(next) => {
          setOrg(next);
          setProvisioning(false);
        }}
      />
      <HistoryDrawer open={history} onClose={() => setHistory(false)} load={loadAudit} returnFocusTo={historyBtn} id="org-history-drawer" title="Admin history" description="What the platform admin did to this organization." events formatKey={(k) => k} what="the admin history" emptyTitle="Nothing yet." emptyDescription="Provisioning, the enterprise switch and hostname changes show up here." />
      <TempPasswordDialog
        open={creds !== null}
        title="New temporary password"
        who={creds?.ownerEmail ?? ""}
        password={creds?.tempPassword ?? null}
        expiresAt={creds?.tempPasswordExpiresAt}
        hint="This is the password of the owner's organization account only. Any personal Kiwiply account they have is not changed."
        onClose={() => setCreds(null)}
      />
    </div>
  );
}

function ProvisionDialog({ open, orgId, current, baseDomain, onClose, onDone }: { open: boolean; orgId: number; current: string | null; baseDomain: string; onClose: () => void; onDone: (org: OrgDetail) => void }) {
  return (
    <SheetFrame id="provision-sheet" open={open} onClose={onClose} title="Provision subdomain">
      {open && <ProvisionForm orgId={orgId} current={current} baseDomain={baseDomain} onClose={onClose} onDone={onDone} />}
    </SheetFrame>
  );
}

function ProvisionForm({ orgId, current, baseDomain, onClose, onDone }: { orgId: number; current: string | null; baseDomain: string; onClose: () => void; onDone: (org: OrgDetail) => void }) {
  const [label, setLabel] = useState(current ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const state = useLabelCheck(label, orgId);
  const ready = state.kind === "ok" && !busy;

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!ready) return;
    setBusy(true);
    setError(null);
    const res = await adminFetch<OrgDetail>("POST", `/orgs/${orgId}/hostnames/subdomain`, { label: label.trim() });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    onDone(res.data);
  }

  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      <p className="text-[13.5px] leading-snug text-ink-soft">Gives the organization its own address. It starts answering on the next request once enterprise is on.</p>
      <LabelField label={label} onChange={setLabel} state={state} baseDomain={baseDomain} />
      {error && (
        <p role="alert" className="text-[12.5px] leading-snug text-danger-text">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
        <Button type="button" variant="ghost" onClick={onClose} disabled={busy} className="min-h-11 sm:min-h-0">
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={!ready} className="min-h-11 sm:min-h-0">
          {busy ? "Provisioning…" : "Provision"}
        </Button>
      </div>
    </form>
  );
}
