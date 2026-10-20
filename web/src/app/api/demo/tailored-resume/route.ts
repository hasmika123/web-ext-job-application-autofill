import { serverApiFetch } from "@/lib/api";
import { getDemoInfo } from "@/lib/demo-server";
import { TAILOR_PRESET } from "@/lib/ent/demo/tailorPreset";

/**
 * Enterprise demo only (DEMO-PLAN section 16). The signed-in consultant's tailored resume for the preset job, from THEIR OWN resume list.
 *   GET  -> {resume: {id, label, archived} | null}
 *   POST -> the consultant approves it (their Prepare click): the resume is restored to their list, so it shows on My Resumes and in the extension.
 * 404 unless the demo is on. The resume itself is made by web/scripts/demo-setup.mjs (archived until approved); nothing here writes anyone else's data.
 */
export const dynamic = "force-dynamic";

interface Row {
  id: number;
  label?: string;
  archived?: boolean | null;
}

async function find(): Promise<Row | null> {
  const res = await serverApiFetch("/api/profile/resumes", { headers: { accept: "application/json" } });
  if (!res.ok) return null;
  const rows = (await res.json().catch(() => null)) as Row[] | null;
  return Array.isArray(rows) ? (rows.find((r) => r.label === TAILOR_PRESET.resume.label) ?? null) : null;
}

const shape = (r: Row | null) => ({ resume: r ? { id: r.id, label: r.label ?? "", archived: r.archived === true } : null });

export async function GET() {
  if (!(await getDemoInfo())?.enabled) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(shape(await find()), { headers: { "cache-control": "no-store" } });
}

export async function POST() {
  if (!(await getDemoInfo())?.enabled) return Response.json({ error: "Not found" }, { status: 404 });
  const r = await find();
  if (!r) return Response.json(shape(null));
  if (r.archived) {
    const put = await serverApiFetch(`/api/profile/resumes/${r.id}`, { method: "PUT", body: JSON.stringify({ archived: false }) });
    if (!put.ok) return Response.json({ error: "Could not add the resume to your list." }, { status: 502 });
  }
  return Response.json(shape({ ...r, archived: false }));
}
