import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const serverApiFetch = vi.fn<(path: string, init?: RequestInit) => Promise<Response>>();
vi.mock("@/lib/api", () => ({ serverApiFetch: (path: string, init?: RequestInit) => serverApiFetch(path, init) }));

import { GET as listGET } from "./route";
import { POST as actPOST } from "./[id]/[action]/route";
import { GET as settingsGET, PUT as settingsPUT } from "../settings/route";
import { POST as undoPOST } from "../../applications/[id]/inbox-undo/[eventId]/route";
import { GET as cListGET } from "../../orgs/[orgId]/me-workspace/inbox/review/route";
import { POST as cActPOST } from "../../orgs/[orgId]/me-workspace/inbox/review/[id]/[action]/route";
import { GET as cSettingsGET, PUT as cSettingsPUT } from "../../orgs/[orgId]/me-workspace/inbox/settings/route";
import { POST as cUndoPOST } from "../../orgs/[orgId]/me-workspace/applications/[applicationId]/inbox-undo/[eventId]/route";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const req = (method: string, body?: unknown) => new Request("http://web.test/x", { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
const p = <T,>(o: T) => ({ params: Promise.resolve(o) });
const sent = (i = 0) => ({ path: serverApiFetch.mock.calls[i]![0], init: serverApiFetch.mock.calls[i]![1] });

beforeEach(() => serverApiFetch.mockResolvedValue(json({ ok: true })));
afterEach(() => serverApiFetch.mockReset());

describe("personal BFF", () => {
  it("lists through the API's inbox review", async () => {
    serverApiFetch.mockResolvedValue(json({ items: [], count: 0 }));
    const res = await listGET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ items: [], count: 0 });
    expect(sent().path).toBe("/api/profile/inbox/review");
  });

  it("forwards accept with the chosen application only", async () => {
    await actPOST(req("POST", { applicationId: 12, junk: "x" }), p({ id: "7", action: "accept" }));
    expect(sent().path).toBe("/api/profile/inbox/review/7/accept");
    expect(JSON.parse(sent().init!.body as string)).toEqual({ applicationId: 12 });
  });

  it("forwards dismiss with an empty body and relays 204", async () => {
    serverApiFetch.mockResolvedValue(new Response(null, { status: 204 }));
    const res = await actPOST(req("POST", { applicationId: 12 }), p({ id: "7", action: "dismiss" }));
    expect(res.status).toBe(204);
    expect(sent().init!.body).toBe("{}");
  });

  it("refuses an unknown action, a bad id and a bad application", async () => {
    expect((await actPOST(req("POST", {}), p({ id: "7", action: "delete" }))).status).toBe(404);
    expect((await actPOST(req("POST", {}), p({ id: "../x", action: "accept" }))).status).toBe(404);
    expect((await actPOST(req("POST", { applicationId: "a/b" }), p({ id: "7", action: "accept" }))).status).toBe(400);
    expect(serverApiFetch).not.toHaveBeenCalled();
  });

  it("relays a 409 problem with its code", async () => {
    serverApiFetch.mockResolvedValue(json({ code: "UNDO_EXPIRED", detail: "Past the window." }, 409));
    const res = await undoPOST(req("POST"), p({ id: "4", eventId: "e9" }));
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: "UNDO_EXPIRED", error: "Past the window." });
    expect(sent().path).toBe("/api/profile/applications/4/inbox-undo/e9");
    expect(sent().init!.method).toBe("POST");
  });

  it("reads and writes the setting, and refuses a non-boolean", async () => {
    await settingsGET();
    expect(sent().path).toBe("/api/profile/inbox/settings");
    await settingsPUT(req("PUT", { applyRejectionsAutomatically: true, other: 1 }));
    expect(sent(1).init!.method).toBe("PUT");
    expect(JSON.parse(sent(1).init!.body as string)).toEqual({ applyRejectionsAutomatically: true });
    expect((await settingsPUT(req("PUT", { applyRejectionsAutomatically: "yes" }))).status).toBe(400);
    expect(serverApiFetch).toHaveBeenCalledTimes(2);
  });

  it("answers 502 when the API is down", async () => {
    serverApiFetch.mockRejectedValue(new Error("down"));
    expect((await listGET()).status).toBe(502);
  });
});

describe("consultant workspace BFF", () => {
  it("forwards every route under the organization's me-workspace", async () => {
    await cListGET(req("GET"), p({ orgId: "12" }));
    await cActPOST(req("POST", { applicationId: "A1" }), p({ orgId: "12", id: "7", action: "accept" }));
    await cSettingsGET(req("GET"), p({ orgId: "12" }));
    await cSettingsPUT(req("PUT", { applyRejectionsAutomatically: false }), p({ orgId: "12" }));
    await cUndoPOST(req("POST"), p({ orgId: "12", applicationId: "9", eventId: "e1" }));
    expect([0, 1, 2, 3, 4].map((i) => sent(i).path)).toEqual([
      "/api/orgs/12/me-workspace/inbox/review",
      "/api/orgs/12/me-workspace/inbox/review/7/accept",
      "/api/orgs/12/me-workspace/inbox/settings",
      "/api/orgs/12/me-workspace/inbox/settings",
      "/api/orgs/12/me-workspace/applications/9/inbox-undo/e1",
    ]);
  });

  it("answers the generic 404 for a malformed organization or id without calling the API", async () => {
    expect((await cListGET(req("GET"), p({ orgId: "x" }))).status).toBe(404);
    expect((await cUndoPOST(req("POST"), p({ orgId: "12", applicationId: "9", eventId: "../e" }))).status).toBe(404);
    expect(serverApiFetch).not.toHaveBeenCalled();
  });
});
