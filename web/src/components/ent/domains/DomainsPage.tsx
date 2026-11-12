"use client";
/* eslint-disable react-hooks/set-state-in-effect -- data loaders: each effect starts a fetch and the answer is stored */

import { useCallback, useEffect, useState } from "react";
import PageHeader from "@/components/ent/shell/ShellContext";
import {
  Button,
  ConfirmTypedSheet,
  EmptyState,
  ErrorState,
  Input,
  ListSkeleton,
  ReasonSheet,
  StatePill,
  hasStateMap,
  registerStateMap,
  useToast,
  type ConfirmTypedSpec,
  type ReasonSpec,
} from "@kiwiply/ui";
import { STATUS_LABEL, checkText, domainsApi, errorText, type Domain, type DomainInstructions, type DomainsOverview } from "@/lib/ent/domains";

if (!hasStateMap("domain-state")) {
  registerStateMap("domain-state", { PENDING: "amber-outline", VERIFYING: "amber-outline", VERIFIED: "amber", ACTIVE: "green", SUSPENDED: "red", REMOVED: "grey" });
}

const CARD = "rounded-[var(--radius)] border border-line bg-paper p-4";

/**
 * Domains at `/w/admin/domains` (docs/enterprise-v2/CUSTOM-DOMAINS-BUILD.md, gap A4; 10-domain-routing.md s3): the organization's Kiwiply address
 * (read-only) and its own domains. Adding one shows the two DNS records to copy (built by the API). "Verify now" checks them, and a verified domain goes
 * live; a live one can be suspended (reason) and resumed, and any can be removed by typing it. The API is the gate (module domains, domains.manage).
 */
export default function DomainsPage({ orgId }: { orgId: number }) {
  const toast = useToast();
  const [data, setData] = useState<DomainsOverview | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [host, setHost] = useState("");
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState<ReasonSpec | null>(null);
  const [typed, setTyped] = useState<ConfirmTypedSpec | null>(null);

  const load = useCallback(async () => {
    const r = await domainsApi.list(orgId);
    if (r.ok) {
      setData(r.data);
      setFailed(null);
    } else setFailed(errorText(r));
  }, [orgId]);

  useEffect(() => {
    void load();
  }, [load]);

  const replace = (d: Domain) => setData((cur) => (cur ? { ...cur, domains: d.status === "REMOVED" ? cur.domains.filter((x) => x.id !== d.id) : cur.domains.some((x) => x.id === d.id) ? cur.domains.map((x) => (x.id === d.id ? d : x)) : [...cur.domains, d], customCount: cur.customCount + (cur.domains.some((x) => x.id === d.id) ? (d.status === "REMOVED" ? -1 : 0) : 1) } : cur));

  const add = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!host.trim()) return;
    setBusy(true);
    const r = await domainsApi.add(orgId, host.trim());
    setBusy(false);
    if (!r.ok) return toast({ title: "Couldn't add the domain", description: errorText(r), variant: "error" });
    setHost("");
    replace(r.data);
    toast({ title: `${r.data.hostname} added: now add its DNS records`, variant: "success" });
  };

  const act = async (d: Domain, action: "verify" | "activate" | "resume") => {
    setBusy(true);
    const r = action === "verify" ? await domainsApi.verify(orgId, d.id) : action === "activate" ? await domainsApi.activate(orgId, d.id) : await domainsApi.resume(orgId, d.id);
    setBusy(false);
    if (!r.ok) return toast({ title: action === "verify" ? "Couldn't check the domain" : `Couldn't ${action} the domain`, description: errorText(r), variant: "error" });
    replace(r.data);
    if (r.data.status === "ACTIVE") toast({ title: `${r.data.hostname} is live`, variant: "success" });
  };

  const suspend = (d: Domain) =>
    setReason({
      title: `Suspend ${d.hostname}?`,
      body: "It stops answering at once: people using this address can't reach your workspace until you resume it.",
      confirmLabel: "Suspend domain",
      tone: "danger",
      placeholder: "e.g. Moving to a new DNS provider",
      run: async (why: string) => {
        const r = await domainsApi.suspend(orgId, d.id, why);
        if (!r.ok) return { ok: false, error: errorText(r) };
        replace(r.data);
        return { ok: true };
      },
    });

  const remove = (d: Domain) =>
    setTyped({
      title: `Remove ${d.hostname}?`,
      body: "It stops answering for good. You can add it again later, and you'll prove ownership again.",
      confirmLabel: "Remove domain",
      tone: "danger",
      placeholder: "Say why, for the audit log",
      expected: d.hostname,
      expectedLabel: "domain",
      run: async () => {
        const r = await domainsApi.remove(orgId, d.id, d.hostname);
        if (!r.ok) return { ok: false, error: errorText(r) };
        replace(r.data);
        return { ok: true };
      },
    });

  return (
    <>
      <PageHeader title="Domains" subtitle="The addresses where your people reach your workspace." />
      <div className="space-y-4" data-domains-page>
        {failed ? (
          <ErrorState what="your domains" description={failed} onRetry={() => void load()} />
        ) : data == null ? (
          <ListSkeleton count={3} label="Loading domains" />
        ) : (
          <>
            {data.domains
              .filter((d) => d.kind === "SUBDOMAIN")
              .map((d) => (
                <section key={d.id} className={CARD} aria-label="Kiwiply address" data-domain-row={d.id}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="break-all text-[14px] font-semibold text-ink">{d.hostname}</span>
                    <StatePill domain="domain-state" state={d.status} label={STATUS_LABEL[d.status]} />
                  </div>
                  <p className="mt-1 text-[12.5px] text-muted">Your Kiwiply address{d.primary ? ", and your main one" : ""}. Kiwiply manages it.</p>
                </section>
              ))}

            <form onSubmit={add} className={`${CARD} space-y-2`} aria-label="Add a domain" data-domain-add>
              <h2 className="text-[14px] font-bold text-ink">Use your own domain</h2>
              <p className="text-[12.5px] text-ink-soft">
                For example <span className="font-mono">careers.yourcompany.com</span>. A subdomain is easiest; you can add {Math.max(0, data.maxCustom - data.customCount)} more.
              </p>
              <div className="flex flex-wrap gap-2">
                <Input aria-label="Domain" placeholder="careers.yourcompany.com" value={host} onChange={(e) => setHost(e.target.value)} className="min-w-[240px] flex-1" autoComplete="off" />
                <Button type="submit" variant="accent" disabled={busy || !host.trim() || data.customCount >= data.maxCustom} data-domain-add-submit>
                  Add domain
                </Button>
              </div>
            </form>

            {data.domains.filter((d) => d.kind === "CUSTOM").length === 0 ? (
              <EmptyState variant="inline" title="No domain of your own yet" description="Add one above, then copy two DNS records at your DNS provider." />
            ) : (
              data.domains
                .filter((d) => d.kind === "CUSTOM")
                .map((d) => (
                  <DomainCard key={d.id} orgId={orgId} d={d} edgeName={data.edgeName} edgeIp={data.edgeIp} busy={busy} onAct={act} onSuspend={suspend} onRemove={remove} />
                ))
            )}
          </>
        )}
      </div>
      <ReasonSheet spec={reason} onClose={() => setReason(null)} />
      <ConfirmTypedSheet spec={typed} onClose={() => setTyped(null)} />
    </>
  );
}

function DomainCard({
  orgId,
  d,
  edgeName,
  edgeIp,
  busy,
  onAct,
  onSuspend,
  onRemove,
}: {
  orgId: number;
  d: Domain;
  edgeName: string;
  edgeIp: string;
  busy: boolean;
  onAct: (d: Domain, action: "verify" | "activate" | "resume") => void;
  onSuspend: (d: Domain) => void;
  onRemove: (d: Domain) => void;
}) {
  const waiting = d.status === "PENDING" || d.status === "VERIFYING";
  const [ins, setIns] = useState<DomainInstructions | null>(null);

  useEffect(() => {
    if (!waiting && d.status !== "SUSPENDED") return;
    let live = true;
    void domainsApi.instructions(orgId, d.id).then((r) => {
      if (live && r.ok) setIns(r.data);
    });
    return () => {
      live = false;
    };
  }, [orgId, d.id, d.status, waiting]);

  const why = checkText(d.lastCheckResult, d.hostname, edgeName, edgeIp);
  return (
    <section className={`${CARD} space-y-3`} aria-label={d.hostname} data-domain-row={d.id}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="break-all text-[14px] font-semibold text-ink">{d.hostname}</span>
        <StatePill domain="domain-state" state={d.status} label={STATUS_LABEL[d.status]} />
      </div>
      {d.status === "ACTIVE" ? (
        <p className="text-[12.5px] text-ink-soft">
          Live: your people can sign in at <span className="font-mono">{d.hostname}</span>. Its security certificate is issued the first time someone opens it.
        </p>
      ) : null}
      {d.status === "ACTIVE" && d.failingSince ? (
        <p role="alert" className="text-[12.5px] text-danger-text" data-domain-failing>
          Its DNS records stopped passing. Fix them soon, or the domain is suspended to keep it safe. {why}
        </p>
      ) : null}
      {why && d.status !== "ACTIVE" ? (
        <p className="text-[12.5px] text-ink-soft" data-domain-check>
          {why}
        </p>
      ) : null}
      {ins && (waiting || d.status === "SUSPENDED") ? <Records ins={ins} /> : null}
      <div className="flex flex-wrap gap-2">
        {waiting || d.status === "VERIFIED" ? (
          <Button type="button" variant="accent" size="sm" disabled={busy} onClick={() => onAct(d, d.status === "VERIFIED" ? "activate" : "verify")} data-domain-verify={d.id}>
            {d.status === "VERIFIED" ? "Go live" : "Verify now"}
          </Button>
        ) : null}
        {d.status === "SUSPENDED" ? (
          <Button type="button" variant="accent" size="sm" disabled={busy} onClick={() => onAct(d, "resume")} data-domain-resume={d.id}>
            Resume
          </Button>
        ) : null}
        {d.status === "ACTIVE" && !d.primary ? (
          <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => onSuspend(d)} data-domain-suspend={d.id}>
            Suspend
          </Button>
        ) : null}
        {!d.primary ? (
          <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => onRemove(d)} data-domain-remove={d.id}>
            Remove
          </Button>
        ) : null}
      </div>
    </section>
  );
}

function Records({ ins }: { ins: DomainInstructions }) {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = (v: string) => {
    void navigator.clipboard?.writeText(v).then(() => setCopied(v));
  };
  return (
    <div className="space-y-2" data-domain-records>
      <p className="text-[12.5px] font-semibold text-ink">Add these records at your DNS provider</p>
      <div className="overflow-x-auto rounded-[var(--radius)] border border-line">
        <table className="w-full border-collapse text-[12.5px]" aria-label={`DNS records for ${ins.hostname}`}>
          <thead className="border-b border-line bg-paper-2/60">
            <tr>
              <th scope="col" className="px-3 py-2 text-left font-semibold text-ink-soft">Type</th>
              <th scope="col" className="px-3 py-2 text-left font-semibold text-ink-soft">Name</th>
              <th scope="col" className="px-3 py-2 text-left font-semibold text-ink-soft">Value</th>
              <th scope="col" className="px-3 py-2">
                <span className="sr-only">Copy</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {ins.records.map((r) => (
              <tr key={r.type + r.name} className="border-b border-line last:border-0" data-dns-record={r.type}>
                <td className="px-3 py-2 font-mono">{r.type}</td>
                <td className="break-all px-3 py-2 font-mono">{r.name}</td>
                <td className="break-all px-3 py-2 font-mono">{r.value}</td>
                <td className="px-3 py-2 text-right">
                  <Button type="button" size="sm" variant="ghost" onClick={() => copy(r.value)} aria-label={`Copy the ${r.type} value`}>
                    {copied === r.value ? "Copied" : "Copy"}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {ins.apex ? <p className="text-[12px] text-muted">This is a root domain, which can&apos;t use a CNAME, so it points at our address directly. A subdomain such as careers.yourcompany.com is easier to keep working.</p> : null}
      <p className="text-[12px] text-muted">{ins.proxyWarning} {ins.ttlHint}</p>
    </div>
  );
}
