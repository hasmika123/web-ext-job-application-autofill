import { badBody, forward, onlyFields, readObject } from "@/lib/admin-proxy";

/**
 * PUT /api/admin/subprocessors/:slot `{ value }`: write one register slot (01..12) through the audited settings route `legal.subprocessor.NN`. `value` is the entry
 * `{name, purpose, data, location, link, dpaStatus}` or `{}` for an unused slot. The API checks the shape (https link, lengths, no identity numbers); this checks only
 * that the slot is one of the twelve and that the body has nothing but `value`.
 */
export async function PUT(request: Request, { params }: { params: Promise<{ slot: string }> }) {
  const { slot } = await params;
  if (!/^(0[1-9]|1[0-2])$/.test(slot)) return Response.json({ error: "No such slot." }, { status: 404 });
  const body = await readObject(request);
  if (!body) return badBody("Send a JSON object.");
  const bad = onlyFields(body, ["value"]);
  if (bad) return badBody(bad);
  if (!body.value || typeof body.value !== "object" || Array.isArray(body.value)) return badBody("value must be an object.");
  return forward(`/api/admin/settings/legal.subprocessor.${slot}`, { method: "PUT", body: JSON.stringify({ value: body.value }) });
}
