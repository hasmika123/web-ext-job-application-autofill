"use client";

import { useEffect, useMemo, useState } from "react";
import { BottomSheet, Button, Dialog, EmptyState, Input, PlusIcon, Select, Spinner } from "@kiwiply/ui";
import { adminFetch } from "@/lib/admin-client";
import { ROLE_LABEL, ROLES_BY_AUDIENCE, type CatalogService, type ServiceDependency } from "@/lib/admin-plans";
import { useNarrow } from "../common";

export interface PickedService {
  service: CatalogService;
  role: string;
  /** Set on a service that was added because another one needs it ("needs Resume library"). */
  neededBy?: string;
}

export interface ServicePickerProps {
  open: boolean;
  onClose: () => void;
  audience: string;
  /** Feature keys already in the version. */
  existing: ReadonlySet<string>;
  /** Adds the picked service and any TECHNICAL dependency outside the plan, then resolves. */
  onAdd: (picks: PickedService[]) => Promise<void>;
}

/** The role a dependency is added under: always an included service of the audience (a seat-included service for an organization). */
export const dependencyRole = (audience: string) => (audience === "ORG" ? "SEAT_INCLUDED" : "INCLUDED");

/**
 * The add-service sheet (04 section 3): a searchable list over `GET /api/admin/catalog/services` for the plan's audience. Picking a
 * service with a TECHNICAL dependency outside the plan adds the dependency too, visibly ("needs Resume library - added").
 */
export default function ServicePickerSheet({ open, onClose, audience, existing, onAdd }: ServicePickerProps) {
  const narrow = useNarrow();
  const body = open ? <PickerBody audience={audience} existing={existing} onAdd={onAdd} /> : null;
  if (narrow) {
    return (
      <BottomSheet open={open} onClose={onClose} title="Add a service" id="service-picker-sheet">
        {body}
      </BottomSheet>
    );
  }
  return (
    <Dialog open={open} onClose={onClose} title="Add a service" description="Services come from the catalog. A service that needs another one brings it along." className="max-w-xl">
      {body}
    </Dialog>
  );
}

/** Mounted only while the sheet is open, so every opening reads the services again and starts with a clean search. */
function PickerBody({ audience, existing, onAdd }: Pick<ServicePickerProps, "audience" | "existing" | "onAdd">) {
  const roles = ROLES_BY_AUDIENCE[audience] ?? ROLES_BY_AUDIENCE.INDIVIDUAL;
  const [role, setRole] = useState(roles[1] ?? roles[0]);
  const [services, setServices] = useState<CatalogService[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [notices, setNotices] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    void adminFetch<CatalogService[]>("GET", `/catalog/services?active=true&audience=${encodeURIComponent(audience)}`).then((res) => {
      if (cancelled) return;
      if (res.ok) setServices(res.data);
      else setError(res.error);
    });
    return () => {
      cancelled = true;
    };
  }, [audience]);

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (services ?? []).filter((s) => !t || s.name.toLowerCase().includes(t) || s.key.toLowerCase().includes(t) || (s.category ?? "").toLowerCase().includes(t));
  }, [services, q]);

  async function add(service: CatalogService) {
    setBusyKey(service.key);
    setError(null);
    const picks: PickedService[] = [{ service, role }];
    const deps = await adminFetch<ServiceDependency[]>("GET", `/catalog/services/${encodeURIComponent(service.key)}/dependencies`);
    const found: string[] = [];
    if (deps.ok) {
      for (const d of deps.data) {
        if (d.kind !== "TECHNICAL" || d.active === false || existing.has(d.requiresFeatureKey) || picks.some((p) => p.service.key === d.requiresFeatureKey)) continue;
        const needed = (services ?? []).find((s) => s.key === d.requiresFeatureKey);
        if (!needed) continue;
        picks.push({ service: needed, role: dependencyRole(audience), neededBy: service.name });
        found.push(`${service.name} needs ${needed.name} - added`);
      }
    }
    await onAdd(picks);
    setBusyKey(null);
    setNotices(found);
  }

  const body = (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-[1fr_200px]">
        <Input aria-label="Search services" placeholder="Search services" value={q} onChange={(e) => setQ(e.target.value)} />
        <Select value={role} onChange={setRole} aria-label="Add as" options={roles.map((r) => ({ value: r, label: ROLE_LABEL[r] ?? r }))} />
      </div>
      {notices.length > 0 && (
        <ul role="status" className="space-y-1 rounded-xl bg-accent-soft p-3 text-[13px] text-accent-deep">
          {notices.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
      {error && (
        <p role="alert" className="text-[13px] text-danger-text">
          {error}
        </p>
      )}
      {services === null && !error ? (
        <div role="status" className="flex items-center justify-center gap-2 py-8 text-[13px] text-ink-soft">
          <Spinner /> Loading services…
        </div>
      ) : shown.length === 0 && services ? (
        <EmptyState title="No services match" description="Try another word, or create the service in the catalog first." />
      ) : (
        <ul className="max-h-[50vh] divide-y divide-line overflow-auto rounded-xl border border-line">
          {shown.map((s) => {
            const inPlan = existing.has(s.key);
            return (
              <li key={s.key} className="flex items-center gap-3 p-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-semibold text-ink">{s.name}</span>
                  <span className="block truncate text-[12px] text-v2-muted">
                    {s.key}
                    {s.category ? ` · ${s.category}` : ""}
                  </span>
                </span>
                <Button type="button" variant="accent-soft" disabled={inPlan || busyKey !== null} onClick={() => void add(s)} aria-label={`${inPlan ? "In plan" : "Add"} ${s.name}`} className="min-h-11 flex-none gap-1 sm:min-h-0">
                  {inPlan ? "In plan" : (
                    <>
                      <PlusIcon size={14} /> Add
                    </>
                  )}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );

  return body;
}
