import { beforeEach, describe, expect, it, vi } from "vitest";

const setAuthCookies = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth", () => ({ setAuthCookies }));

import { POST } from "./route";

const post = (login: unknown) =>
  POST(
    new Request("http://localhost:3304/api/auth/demo", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": `10.2.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` },
      body: JSON.stringify({ login }),
    }),
  );

beforeEach(() => {
  setAuthCookies.mockReset();
  vi.restoreAllMocks();
});

describe("POST /api/auth/demo (personal site)", () => {
  it("refuses demo-org and any organization login without calling the API (O4)", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    expect((await post("demo-org")).status).toBe(400);
    expect((await post("demo-ent-acme-sarah")).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(setAuthCookies).not.toHaveBeenCalled();
  });

  it("opens the app admin demo and lands on /admin", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ accessToken: "a", refreshToken: "r" }), { status: 200 }));
    const res = await post("demo-admin");
    expect(await res.json()).toEqual({ ok: true, landing: "/admin" });
    expect(setAuthCookies).toHaveBeenCalledWith("a", "r");
  });

  it("opens the job seeker demo and lands on /dashboard", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ accessToken: "a" }), { status: 200 }));
    expect(await (await post("demo")).json()).toEqual({ ok: true, landing: "/dashboard" });
  });

  it("answers 502 when the API says the admin demo is off (404), and sets no session", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("", { status: 404 }));
    expect((await post("demo-admin")).status).toBe(502);
    expect(setAuthCookies).not.toHaveBeenCalled();
  });
});
