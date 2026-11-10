import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  calls: [] as { path: string; init?: RequestInit }[],
  account: { login: "ent#2#omar@acme.example", firstName: "Omar", lastName: "Haddad", email: "omar@acme.example", langKey: "en" } as Record<string, unknown>,
}));
vi.mock("@/lib/api", () => ({
  serverApiFetch: async (path: string, init?: RequestInit) => {
    api.calls.push({ path, init });
    if (path === "/api/account" && !init?.method) return new Response(JSON.stringify(api.account), { status: 200 });
    if (path === "/api/profile" && !init?.method) return new Response(JSON.stringify({ payload: JSON.stringify({ city: "Austin" }) }), { status: 200 });
    return new Response(null, { status: 200 });
  },
}));

import { PATCH } from "./route";

const patch = (body: unknown) => PATCH(new Request("http://x/api/me/profile", { method: "PATCH", body: JSON.stringify(body) }));
beforeEach(() => {
  api.calls = [];
});

describe("PATCH /api/me/profile", () => {
  it("changes only the name fields of the account and never the email", async () => {
    const res = await patch({ firstName: " Omar  Jr ", lastName: "Haddad" });
    expect(res.status).toBe(200);
    const post = api.calls.find((c) => c.init?.method === "POST")!;
    expect(JSON.parse(String(post.init!.body))).toEqual({ ...api.account, firstName: "Omar Jr", lastName: "Haddad" });
  });

  it("merges the phone into the bio and keeps the rest of it", async () => {
    expect((await patch({ phone: "+1 (555) 010-0100" })).status).toBe(200);
    const put = api.calls.find((c) => c.init?.method === "PUT")!;
    expect(JSON.parse(JSON.parse(String(put.init!.body)).payload)).toEqual({ city: "Austin", phone: "+1 (555) 010-0100" });
  });

  it("refuses unknown fields (the email is not editable), an empty first name and a phone that is not one", async () => {
    expect((await patch({ email: "x@y.z" })).status).toBe(400);
    expect((await patch({ firstName: "  " })).status).toBe(400);
    expect((await patch({ phone: "call me maybe" })).status).toBe(400);
    expect(api.calls.length).toBe(0);
  });
});
