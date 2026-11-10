import { serverApiFetch } from "@/lib/api";
import { demoReadOnly } from "@/lib/demo-server";

/**
 * PATCH /api/me/profile `{ firstName?, lastName?, phone? }`: the BASIC profile of the signed-in member (D6, 2026-10-16 audit): the few facts every member
 * keeps about themselves, on any host. The name lives on the account (`POST /api/account`, which wants the whole account back, so this reads it first and
 * changes only the two name fields: the email, login and language are never touched from here); the phone lives in the account's bio. It is not the
 * consultant's career profile, which is the organization's record of their work. The API owns every rule; this handler only checks the shape.
 */
const NAME_MAX = 80;
const PHONE_MAX = 40;

const clean = (v: unknown, max: number): string | null | undefined => {
  if (v === undefined) return undefined;
  if (typeof v !== "string") return null;
  const t = v.replace(/\s+/g, " ").trim();
  return t.length <= max ? t : null;
};

export async function PATCH(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object" || Array.isArray(body)) return Response.json({ error: "Send a JSON object." }, { status: 400 });
  const extra = Object.keys(body).find((k) => !["firstName", "lastName", "phone"].includes(k));
  if (extra) return Response.json({ error: `Unknown field: ${extra}.` }, { status: 400 });
  const firstName = clean(body.firstName, NAME_MAX);
  const lastName = clean(body.lastName, NAME_MAX);
  const phone = clean(body.phone, PHONE_MAX);
  if (firstName === null || lastName === null || phone === null) return Response.json({ error: "That value is too long or not text." }, { status: 400 });
  if (firstName === "") return Response.json({ error: "Your first name can't be empty." }, { status: 400 });
  if (phone !== undefined && phone !== "" && !/^[+()\d][\d\s().+-]{3,}$/.test(phone)) return Response.json({ error: "Enter a phone number with digits, spaces and + ( ) - only." }, { status: 400 });

  try {
    if (firstName !== undefined || lastName !== undefined) {
      const acc = await serverApiFetch("/api/account");
      if (acc.status === 401) return Response.json({ error: "Your session expired. Sign in again." }, { status: 401 });
      if (!acc.ok) return Response.json({ error: "Couldn't save your name." }, { status: 502 });
      const account = (await acc.json()) as Record<string, unknown>;
      if (firstName !== undefined) account.firstName = firstName;
      if (lastName !== undefined) account.lastName = lastName;
      const saved = await serverApiFetch("/api/account", { method: "POST", body: JSON.stringify(account) });
      const demo = await demoReadOnly(saved);
      if (demo) return demo;
      if (!saved.ok) return Response.json({ error: "Couldn't save your name." }, { status: saved.status >= 500 ? 502 : saved.status });
    }
    if (phone !== undefined) {
      const cur = await serverApiFetch("/api/profile");
      let bio: Record<string, unknown> = {};
      if (cur.ok) {
        const dto = (await cur.json().catch(() => null)) as { payload?: string } | null;
        try {
          const parsed = dto?.payload ? JSON.parse(dto.payload) : null;
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) bio = parsed as Record<string, unknown>;
        } catch {
          // a corrupt bio is replaced by one that only carries the phone
        }
      }
      if (phone === "") delete bio.phone;
      else bio.phone = phone;
      const saved = await serverApiFetch("/api/profile", { method: "PUT", body: JSON.stringify({ payload: JSON.stringify(bio) }) });
      const demo = await demoReadOnly(saved);
      if (demo) return demo;
      if (!saved.ok) return Response.json({ error: "Couldn't save your phone number." }, { status: saved.status >= 500 ? 502 : saved.status });
    }
  } catch {
    return Response.json({ error: "Couldn't reach the server." }, { status: 502 });
  }
  return Response.json({ ok: true });
}
