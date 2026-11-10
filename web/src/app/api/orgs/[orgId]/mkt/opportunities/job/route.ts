import { badBody, forward, readObject } from "@/lib/admin-proxy";
import { notFound } from "@/lib/ent/marketer-ws/opportunities-bff";

const ID = /^\d{1,18}$/;
const FIELDS = ["title", "company", "location", "workMode", "description", "jobUrl", "skills"] as const;

/** POST /api/orgs/{orgId}/mkt/opportunities/job: a marketer adds a job by hand (MKT-40). The API owns permission, scope, validation, dedupe and the PII scan. */
export async function POST(req: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  if (!ID.test(orgId)) return notFound();
  const obj = await readObject(req);
  if (!obj) return badBody("Send a JSON object.");
  const extra = Object.keys(obj).find((k) => !(FIELDS as readonly string[]).includes(k));
  if (extra) return badBody(`Unknown field: ${extra}.`);
  const key = req.headers.get("idempotency-key") ?? crypto.randomUUID();
  return forward(`/api/orgs/${orgId}/mkt/opportunities/job`, { method: "POST", body: JSON.stringify(obj), headers: { "content-type": "application/json", "idempotency-key": key } });
}
