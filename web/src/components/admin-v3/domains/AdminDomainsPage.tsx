"use client";
/* eslint-disable react-hooks/set-state-in-effect -- data loader: the effect starts a fetch and the answer is stored */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button, Input, Select } from "@kiwiply/ui";
import { AdminHero, AdminPanel, StatusDot } from "../common";
import { adminFetch } from "@/lib/admin-client";
import { DOMAIN_STATUSES, type AdminDomainPage, type AdminDomainRow, type AdminRechecked } from "@/lib/admin-domains";

const TONE: Record<string, "green" | "amber" | "coral" | "slate"> = { ACTIVE: "green", PENDING: "amber", VERIFYING: "amber", VERIFIED: "amber", SUSPENDED: "coral", REMOVED: "slate" };
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "-");

/**
 * Platform admin → Domains (docs/enterprise-v2/10-domain-routing.md s7; CUSTOM-DOMAINS-BUILD.md A4b): every organization's addresses. The ones that need
 * attention (suspended, failing DNS, certificate failed) come first. Re-check runs the DNS check and the certificate probe now. Suspend and resume
 * live on the organization's page, which each row links to. Hostnames and organization names only.
 */
export default function AdminDomainsPage() {
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState<AdminDomainPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | null>(null);

  const load = useCallback(async () => {
    const qs = new URLSearchParams();
    if (status) qs.set("status", status);
    if (q.trim()) qs.set("q", q.trim());
    const res = await adminFetch<AdminDomainPage>("GET", `/domains?${qs}`);
    if (res.ok) {
      setPage(res.data);
      setError(null);
    } else setError(res.error);
  }, [status, q]);

  useEffect(() => {
    void load();
  }, [load]);

  async function recheck(r: AdminDomainRow) {
    setBusy(r.id);
    const res = await adminFetch<AdminRechecked>("POST", `/domains/${r.id}/recheck`);
    setBusy(null);
    if (!res.ok) return setError(res.error);
    void load();
  }

  return (
    <div className="mx-auto max-w-[1500px] space-y-4" data-admin-domains>
      <AdminHero eyebrow="ENTERPRISE" title="Domains" subtitle={page ? `${page.total} addresses · ${page.attention} need attention` : "Every organization's addresses"} />
      <AdminPanel title="Addresses" description="Organizations' Kiwiply subdomains and their own domains. The ones that need attention come first.">
        <div className="mb-3 flex flex-wrap gap-2">
          <Input aria-label="Search domains" placeholder="Hostname or organization" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
          <Select
            aria-label="Status"
            value={status}
            onChange={setStatus}
            options={[{ value: "", label: "All but removed" }, ...DOMAIN_STATUSES.map((s) => ({ value: s, label: s.charAt(0) + s.slice(1).toLowerCase() }))]}
            className="w-[180px]"
          />
        </div>
        {error ? (
          <p role="alert" className="text-[13px] text-danger-text">
            {error}
          </p>
        ) : null}
        {page == null ? (
          <p className="text-[13px] text-v2-muted">Loading…</p>
        ) : page.rows.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-v2-muted">No address matches.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[13px]" aria-label="Domains">
              <thead className="border-b border-v2-line/60 text-left text-[12px] text-v2-muted">
                <tr>
                  <th scope="col" className="py-2 pr-3">Address</th>
                  <th scope="col" className="py-2 pr-3">Organization</th>
                  <th scope="col" className="py-2 pr-3">Status</th>
                  <th scope="col" className="py-2 pr-3">Certificate</th>
                  <th scope="col" className="py-2 pr-3">Last check</th>
                  <th scope="col" className="py-2 pr-3">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {page.rows.map((r) => (
                  <tr key={r.id} className="border-b border-v2-line/40 align-top" data-admin-domain={r.id} data-attention={r.attention || undefined}>
                    <td className="py-2 pr-3">
                      <span className="block break-all font-semibold text-ink">{r.hostname}</span>
                      <span className="text-[12px] text-v2-muted">
                        {r.kind === "CUSTOM" ? "Own domain" : "Kiwiply subdomain"}
                        {r.primary ? " · main" : ""}
                      </span>
                    </td>
                    <td className="py-2 pr-3">
                      <Link href={`/admin/organizations/${r.orgId}`} className="font-semibold text-accent-deep hover:underline">
                        {r.orgName}
                      </Link>
                    </td>
                    <td className="py-2 pr-3">
                      <StatusDot status={r.status.charAt(0) + r.status.slice(1).toLowerCase()} tone={TONE[r.status] ?? "slate"} />
                      {r.failingSince ? <span className="block text-[12px] text-danger-text">DNS failing since {when(r.failingSince)}</span> : null}
                    </td>
                    <td className="py-2 pr-3">{r.kind === "CUSTOM" ? r.certState.charAt(0) + r.certState.slice(1).toLowerCase() : "-"}</td>
                    <td className="py-2 pr-3">
                      <span className="block">{r.lastCheckResult ?? "-"}</span>
                      <span className="text-[12px] text-v2-muted">{when(r.lastCheckAt)}</span>
                    </td>
                    <td className="py-2 pr-3 text-right">
                      {r.kind === "CUSTOM" && r.status !== "REMOVED" ? (
                        <Button type="button" variant="ghost" size="sm" disabled={busy === r.id} onClick={() => void recheck(r)} data-admin-domain-recheck={r.id}>
                          {busy === r.id ? "Checking…" : "Re-check"}
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AdminPanel>
    </div>
  );
}
