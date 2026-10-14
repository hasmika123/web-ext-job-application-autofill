"use client";

import { useEffect, useRef, useState } from "react";
import { Field, Input, Select, Textarea } from "@kiwiply/ui";
import { SIZE_LABEL, STATUS_LABEL, type ClientDetail, type PatchBody, type Person } from "@/lib/ent/clients";
import type { SaveResult } from "./useClientDetail";

type Status = { kind: "idle" } | { kind: "saving" } | { kind: "saved" } | { kind: "error"; message: string };

/**
 * The drawer's edit form: every control saves by itself (a select the moment it changes, a text box when it loses focus or Enter is
 * pressed). There is no Save button. The line under the heading says what the last save did, in words. Drafts live here and are never
 * overwritten by the server's answer while a person types; they are reset only when another client opens.
 */
export default function EditForm({ detail, managers, save }: { detail: ClientDetail; managers: Person[]; save: (b: PatchBody) => Promise<SaveResult> }) {
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [name, setName] = useState(detail.name);
  const [industry, setIndustry] = useState(detail.industry ?? "");
  const [website, setWebsite] = useState(detail.website ?? "");
  const [location, setLocation] = useState(detail.location ?? "");
  const [about, setAbout] = useState(detail.about ?? "");
  const [since, setSince] = useState(detail.clientSince ?? "");
  const saved = useRef(detail);
  useEffect(() => {
    saved.current = detail;
  }, [detail]);

  async function commit(body: PatchBody, revert?: () => void) {
    setStatus({ kind: "saving" });
    const r = await save(body);
    if (r.ok) setStatus({ kind: "saved" });
    else {
      setStatus({ kind: "error", message: r.error });
      revert?.();
    }
  }

  const textCommit = (field: "name" | "industry" | "website" | "location" | "about", value: string, current: string | null, revert: () => void) => {
    const next = value.trim();
    if (next === (current ?? "")) return;
    if (field === "name" && next.length < 2) {
      setStatus({ kind: "error", message: "A name needs at least 2 characters." });
      revert();
      return;
    }
    void commit({ [field]: field === "name" ? next : next === "" ? null : next } as PatchBody, revert);
  };
  const onEnter = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
  };
  const managerOptions = [{ value: "", label: "No account manager" }, ...managers.map((m) => ({ value: String(m.id), label: m.name }))];
  if (detail.manager && !managers.some((m) => m.id === detail.manager!.id)) managerOptions.push({ value: String(detail.manager.id), label: detail.manager.name });

  return (
    <div className="space-y-3" data-edit-form>
      <p aria-live="polite" data-save-status className={`min-h-5 text-[12.5px] ${status.kind === "error" ? "text-danger-text" : "text-muted"}`}>
        {status.kind === "idle" && "Changes save as you go."}
        {status.kind === "saving" && "Saving..."}
        {status.kind === "saved" && "Saved"}
        {status.kind === "error" && status.message}
      </p>
      <Field label="Company name">
        <Input value={name} maxLength={200} onChange={(e) => setName(e.target.value)} onBlur={() => textCommit("name", name, saved.current.name, () => setName(saved.current.name))} onKeyDown={onEnter} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Industry">
          <Input value={industry} maxLength={80} onChange={(e) => setIndustry(e.target.value)} onBlur={() => textCommit("industry", industry, saved.current.industry, () => setIndustry(saved.current.industry ?? ""))} onKeyDown={onEnter} />
        </Field>
        <Field label="Status">
          <Select value={detail.status} onChange={(v) => void commit({ status: v as PatchBody["status"] })} options={Object.entries(STATUS_LABEL).map(([value, label]) => ({ value, label }))} />
        </Field>
      </div>
      <Field label="Website">
        <Input value={website} maxLength={300} placeholder="acme.com" onChange={(e) => setWebsite(e.target.value)} onBlur={() => textCommit("website", website, saved.current.website, () => setWebsite(saved.current.website ?? ""))} onKeyDown={onEnter} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Location">
          <Input value={location} maxLength={120} placeholder="San Francisco, CA" onChange={(e) => setLocation(e.target.value)} onBlur={() => textCommit("location", location, saved.current.location, () => setLocation(saved.current.location ?? ""))} onKeyDown={onEnter} />
        </Field>
        <Field label="Company size">
          <Select value={detail.sizeBand ?? ""} onChange={(v) => void commit({ sizeBand: v || null })} options={[{ value: "", label: "Not set" }, ...Object.entries(SIZE_LABEL).map(([value, label]) => ({ value, label }))]} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Client since">
          <Input
            type="date"
            value={since}
            max={new Date().toISOString().slice(0, 10)}
            onChange={(e) => setSince(e.target.value)}
            onBlur={() => {
              if (since !== (saved.current.clientSince ?? "")) void commit({ clientSince: since || null }, () => setSince(saved.current.clientSince ?? ""));
            }}
          />
        </Field>
        <Field label="Account manager">
          <Select value={detail.manager ? String(detail.manager.id) : ""} onChange={(v) => void commit({ ownerMemberId: v ? Number(v) : null })} options={managerOptions} />
        </Field>
      </div>
      <Field label="About" hint="Never put identity numbers, bank details or birth dates here: we don't store them.">
        <Textarea rows={4} value={about} maxLength={1000} onChange={(e) => setAbout(e.target.value)} onBlur={() => textCommit("about", about, saved.current.about, () => setAbout(saved.current.about ?? ""))} />
      </Field>
    </div>
  );
}
