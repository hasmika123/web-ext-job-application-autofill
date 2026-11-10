import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: { path: string; init?: RequestInit }[] = [];
let reply: () => Response = () => new Response(null, { status: 204 });
vi.mock("@/lib/api", () => ({
  serverApiFetch: vi.fn(async (path: string, init?: RequestInit) => {
    calls.push({ path, init });
    return reply();
  }),
}));

import { POST as revoke } from "@/app/api/orgs/[orgId]/invitations/[id]/revoke/route";
import { GET as list, POST as invite } from "@/app/api/orgs/[orgId]/invitations/route";
import { POST as bulkRevoke } from "@/app/api/orgs/[orgId]/invitations/bulk/revoke/route";
import { GET as formOptions } from "@/app/api/orgs/[orgId]/invitations/form-options/route";

const ctx = (orgId: string, extra: { id?: string } = {}) => ({ params: Promise.resolve({ orgId, id: extra.id ?? "0" }) });
const post = (body: unknown) => new Request("http://x", { method: "POST", body: JSON.stringify(body) });

beforeEach(() => {
  calls.length = 0;
  reply = () => new Response(null, { status: 204 });
});

describe("the invitations BFF", () => {
  it("answers the API's 204 on revoke as 200 { ok: true } (a 204 can not carry a body)", async () => {
    const res = await revoke(post({}), ctx("2", { id: "7" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(calls[0].path).toBe("/api/orgs/2/invitations/7/revoke");
  });

  it("keeps a refusal's status and gives it as { error, code }", async () => {
    reply = () => Response.json({ status: 404, code: "NOT_FOUND", detail: "Not found." }, { status: 404 });
    const res = await revoke(post({}), ctx("2", { id: "7" }));
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: "Not found.", code: "NOT_FOUND" });
  });

  it("refuses a malformed organization or invitation id before calling the API", async () => {
    expect((await revoke(post({}), ctx("2", { id: "7x" }))).status).toBe(404);
    expect((await list(new Request("http://x"), ctx("abc"))).status).toBe(404);
    expect(calls).toHaveLength(0);
  });

  it("forwards the list with only the known query keys", async () => {
    reply = () => Response.json({ items: [], page: 0, size: 10, total: 0 });
    await list(new Request("http://x/api/orgs/2/invitations?status=PENDING&page=1&size=10&evil=1"), ctx("2"));
    expect(calls[0].path).toBe("/api/orgs/2/invitations?status=PENDING&page=1&size=10");
  });

  it("checks the invite and bulk bodies' shape", async () => {
    reply = () => Response.json({ rows: [] });
    expect((await invite(post({ emails: "a@x.co" }), ctx("2"))).status).toBe(400);
    expect((await invite(post({ emails: ["a@x.co"], roleIds: [6] }), ctx("2"))).status).toBe(200);
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ emails: ["a@x.co"], roleIds: [6] });
    expect((await bulkRevoke(post({ ids: [] }), ctx("2"))).status).toBe(400);
  });

  it("form-options: roles without the OWNER template, only DEPARTMENT groups, and says when a list was refused", async () => {
    reply = vi
      .fn()
      .mockReturnValueOnce(Response.json([{ id: 1, key: "OWNER", name: "Owner" }, { id: 6, key: "CONSULTANT", name: "Consultant", description: "d", permissions: [{ key: "x" }] }]))
      .mockReturnValueOnce(Response.json({ status: 403 }, { status: 403 })) as unknown as () => Response;
    const res = await formOptions(new Request("http://x"), ctx("2"));
    expect(await res.json()).toEqual({ roles: [{ id: 6, key: "CONSULTANT", name: "Consultant", description: "d" }], departments: [], teams: [], managers: [], rolesAvailable: true, departmentsAvailable: false });
    reply = vi
      .fn()
      .mockReturnValueOnce(Response.json([]))
      .mockReturnValueOnce(Response.json([{ id: 3, name: "Marketing", kind: "DEPARTMENT" }, { id: 4, name: "Cohort A", kind: "COHORT" }])) as unknown as () => Response;
    expect(await (await formOptions(new Request("http://x"), ctx("2"))).json()).toMatchObject({ departments: [{ id: 3, name: "Marketing" }], departmentsAvailable: true });
  });
});
