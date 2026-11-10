"use client";

import { useMemo, useState, type FormEvent } from "react";
import { ChoiceGroup, Dialog, Select, Textarea } from "@kiwiply/ui";
import { Button, Field, Input } from "@/components/ui";
import { roleErrorMessage, rolesApi, type CreateBody, type RoleDetail, type RoleRow } from "@/lib/ent/roles";

export type StartMode = "blank" | "template" | "duplicate";

export interface CreateSeed {
  mode: StartMode;
  /** The role to copy (duplicate). */
  sourceRoleId?: number;
  /** The template to start from (template). */
  templateKey?: string;
  name?: string;
  /** Distinguishes one opening of the dialog from the next (a fresh form each time). */
  nonce: number;
}

const NAME_MAX = 80; // config-literal-ok: mirrors the API's role name limit (the API is the gate)
const DESCRIPTION_MAX = 255; // config-literal-ok: mirrors the API's description limit

/**
 * "Create Role" (and "Duplicate"): a name, an optional description, and where to start: blank, from one of the system templates, or
 * a copy of an existing role. The API builds the rows (and refuses what the caller may not give); the editor opens on the new role
 * so permissions are tuned in one place.
 */
export default function CreateRoleDialog({ orgId, seed, roles, onClose, onCreated }: { orgId: number; seed: CreateSeed | null; roles: RoleRow[]; onClose: () => void; onCreated: (role: RoleDetail) => void }) {
  return (
    <Dialog open={seed !== null} onClose={onClose} title={seed?.mode === "duplicate" ? "Duplicate role" : "Create role"} description="Give it a name, then choose what it can do.">
      {seed && <CreateForm key={seed.nonce} orgId={orgId} seed={seed} roles={roles} onClose={onClose} onCreated={onCreated} />}
    </Dialog>
  );
}

function CreateForm({ orgId, seed, roles, onClose, onCreated }: { orgId: number; seed: CreateSeed; roles: RoleRow[]; onClose: () => void; onCreated: (role: RoleDetail) => void }) {
  const templates = useMemo(() => roles.filter((r) => r.system && r.key !== "OWNER"), [roles]);
  const copyable = useMemo(() => roles.filter((r) => r.key !== "OWNER"), [roles]);
  const [mode, setMode] = useState<StartMode>(seed.mode);
  const [templateKey, setTemplateKey] = useState(seed.templateKey ?? templates[0]?.key ?? "");
  const [sourceId, setSourceId] = useState(String(seed.sourceRoleId ?? copyable[0]?.id ?? ""));
  const [typed, setTyped] = useState<string | null>(seed.name ?? null);
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Duplicating suggests "<name> copy" until the person types their own.
  const suggestion = mode === "duplicate" ? `${copyable.find((r) => String(r.id) === sourceId)?.name ?? ""} copy`.trim().slice(0, NAME_MAX) : "";
  const name = typed ?? (suggestion === "copy" ? "" : suggestion);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy || name.trim() === "") return;
    const body: CreateBody = { name: name.trim() };
    if (description.trim()) body.description = description.trim();
    if (mode === "template" && templateKey) body.templateKey = templateKey;
    if (mode === "duplicate" && sourceId) body.sourceRoleId = Number(sourceId);
    setBusy(true);
    setError(null);
    const r = await rolesApi.create(orgId, body);
    setBusy(false);
    if (!r.ok) {
      setError(roleErrorMessage(r));
      return;
    }
    onCreated(r.data);
  }

  return (
    <form onSubmit={submit} data-create-role className="flex flex-col gap-4">
      <Field label="Role name" required>
        <Input value={name} maxLength={NAME_MAX} onChange={(e) => setTyped(e.target.value)} placeholder="e.g. Regional recruiter" autoComplete="off" autoFocus data-create-name />
      </Field>
      <Field label="Description" hint="Optional. Shown under the name in the list.">
        <Textarea rows={2} value={description} maxLength={DESCRIPTION_MAX} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <div>
        <p id="create-start-label" className="mb-1.5 text-[12.5px] font-semibold text-ink">
          Start from
        </p>
        <ChoiceGroup
          aria-labelledby="create-start-label"
          value={mode}
          onChange={(v) => setMode(v as StartMode)}
          options={[
            { value: "blank", label: "Blank" },
            { value: "template", label: "A template" },
            { value: "duplicate", label: "A copy of a role" },
          ]}
        />
      </div>
      {mode === "template" && (
        <Field label="Template">
          <Select value={templateKey} onChange={setTemplateKey} options={templates.map((t) => ({ value: t.key, label: t.name }))} aria-label="Template" />
        </Field>
      )}
      {mode === "duplicate" && (
        <Field label="Role to copy">
          <Select value={sourceId} onChange={setSourceId} options={copyable.map((r) => ({ value: String(r.id), label: r.name }))} aria-label="Role to copy" />
        </Field>
      )}
      {error && (
        <p role="alert" data-create-error className="rounded-xl border border-danger/40 bg-danger/10 p-3 text-[13px] text-ink">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy || name.trim() === ""} data-create-submit>
          {busy ? "Creating…" : "Create role"}
        </Button>
      </div>
    </form>
  );
}
