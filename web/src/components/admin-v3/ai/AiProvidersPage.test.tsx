import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@kiwiply/ui";

vi.mock("next/link", () => ({ default: ({ href, children, ...p }: { href: string; children: React.ReactNode }) => <a href={href} {...p}>{children}</a> }));
vi.mock("next/image", () => ({ default: (p: { alt: string }) => <span role="img" aria-label={p.alt} /> }));

import AiProvidersPage from "./AiProvidersPage";
import { R, calls, config, route } from "./ai-test-fixtures";
import type { AiConfig } from "@/lib/ai-admin";

type Call = { method: string; url: string; body: Record<string, unknown> | null };
const sent: Call[] = [];
let handler: (c: Call) => { status: number; body: unknown };

const reply = (status: number, body: unknown) => ({ status, body });

beforeEach(() => {
  sent.length = 0;
  handler = () => reply(200, {});
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const call: Call = { method: init?.method ?? "GET", url, body: init?.body ? (JSON.parse(init.body as string) as Record<string, unknown>) : null };
      sent.push(call);
      const out = handler(call);
      return new Response(JSON.stringify(out.body), { status: out.status, headers: { "content-type": "application/json" } });
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function mount(cfg: AiConfig | null = config()) {
  return render(
    <ToastProvider>
      <AiProvidersPage config={cfg} calls={calls()} />
    </ToastProvider>,
  );
}

async function pickOption(label: string, option: string) {
  fireEvent.click(screen.getByRole("button", { name: label }));
  fireEvent.click(await screen.findByRole("option", { name: option }));
}

describe("AiProvidersPage (I1.12)", () => {
  it("renders the provider card, the 15 routing rows and where each value comes from; never a key field", () => {
    const cfg = config();
    cfg.routes = cfg.routes.map((r) => (r.task === "map" ? { ...r, model: R("gemini-2.5-flash", "db", "gemini-2.5-flash-lite") } : r));
    const { container } = mount(cfg);

    const card = screen.getByRole("article", { name: "Google Gemini" });
    expect(within(card).getByText("◐ Untested")).toBeTruthy();
    expect(within(card).getByText("Key present ✓")).toBeTruthy();
    expect(within(card).getByText("DOSSIER_AI_API_KEY")).toBeTruthy();
    expect(within(card).getByRole("button", { name: "Test connection" })).toBeTruthy();
    expect((within(card).getByLabelText("Google Gemini base URL") as HTMLInputElement).value).toBe("https://generativelanguage.googleapis.com/v1beta");

    expect(screen.getAllByRole("row")).toHaveLength(16); // header + 15 tasks
    expect(screen.getByRole("rowheader", { name: /Resume parsing/ })).toBeTruthy();
    // the db-sourced task shows "Admin" and a Reset link; the env ones show "Env"
    expect(screen.getAllByText("Admin").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Reset Field mapping to default" })).toBeTruthy();

    expect(container.querySelectorAll("input[type=password]")).toHaveLength(0);
    expect(screen.queryByLabelText(/api key|secret|token value/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /^save/i })).toBeNull();
  });

  it("a missing key says so, names the env var and disables Test connection", () => {
    const cfg = config();
    cfg.providers[0] = { ...cfg.providers[0], keyPresent: false, configured: false };
    mount(cfg);
    const card = screen.getByRole("article", { name: "Google Gemini" });
    expect(within(card).getByText("Key missing")).toBeTruthy();
    expect(within(card).getByText("○ Not configured")).toBeTruthy();
    expect((within(card).getByRole("button", { name: "Test connection" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows the env-master banner only when DOSSIER_AI_ENABLED is off", () => {
    const { unmount } = mount(config());
    expect(screen.queryByText(/switched off for this deployment/)).toBeNull();
    unmount();
    mount(config({ envMasterEnabled: false }));
    expect(screen.getByText("AI is switched off for this deployment (DOSSIER_AI_ENABLED). Runtime switches can only lower it.")).toBeTruthy();
  });

  it("a model change saves on its own: one PATCH, a ✓, an Undo toast, and Undo sends the old value back", async () => {
    handler = (c) => {
      if (c.method === "PATCH" && c.url === "/api/admin/ai/routes/draft") {
        const model = c.body?.model;
        return reply(200, route("draft", "Answer drafting", "MEDIUM", { model: model === null ? R("gemini-2.5-flash-lite", "env") : R(model as string, "db", "gemini-2.5-flash-lite") }));
      }
      return reply(404, { error: "nope" });
    };
    mount();

    await pickOption("Answer drafting model", "gemini-2.5-flash");
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toMatchObject({ method: "PATCH", url: "/api/admin/ai/routes/draft", body: { model: "gemini-2.5-flash" } });
    expect(await screen.findByRole("img", { name: "Saved" })).toBeTruthy();
    expect(await screen.findByText("Answer drafting now uses gemini-2.5-flash on gemini")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reset Answer drafting to default" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    await waitFor(() => expect(sent).toHaveLength(2));
    // the model was env-sourced before, so Undo clears the admin row (null) rather than pinning the env value
    expect(sent[1]).toMatchObject({ method: "PATCH", url: "/api/admin/ai/routes/draft", body: { model: null } });
    await waitFor(() => expect(screen.queryByRole("button", { name: "Reset Answer drafting to default" })).toBeNull());
  });

  it("the max-tokens box saves on blur, and a refusal shows the API's message and puts the old number back", async () => {
    handler = () => reply(400, { error: "Must be between 64 and 16384.", code: "AI_CONFIG_OUT_OF_BOUNDS", min: 64, max: 16384 });
    mount();
    const box = screen.getByLabelText("Answer drafting max output tokens") as HTMLInputElement;
    fireEvent.change(box, { target: { value: "5" } });
    expect(sent).toHaveLength(0); // not per keystroke
    fireEvent.blur(box);
    expect(await screen.findByText("Must be between 64 and 16384.")).toBeTruthy();
    expect(sent[0]).toMatchObject({ body: { maxOutputTokens: 5 } });
    await waitFor(() => expect((screen.getByLabelText("Answer drafting max output tokens") as HTMLInputElement).value).toBe("400"));
  });

  it("an 'Other…' model id is checked against the model-id rule before anything is sent", async () => {
    mount();
    await pickOption("Answer drafting model", "Other…");
    const other = screen.getByLabelText("Answer drafting model (other model id)");
    fireEvent.change(other, { target: { value: "Bad Model!" } });
    fireEvent.blur(other);
    expect(await screen.findByText("Not a model id (letters, digits, . _ : / -).")).toBeTruthy();
    expect(sent).toHaveLength(0);
  });

  it("turning resume parsing off asks for a reason first: Cancel changes nothing, confirming sends the reason", async () => {
    handler = () => reply(200, route("parse", "Resume parsing", "HIGH", { enabled: R(false, "db", true) }));
    mount();

    fireEvent.click(screen.getByRole("switch", { name: "Resume parsing enabled" }));
    const dialog = await screen.findByRole("dialog", { name: "Turn off resume parsing?" });
    expect(within(dialog).getByText("New users won't get the AI parse during setup; the heuristic parser still runs.")).toBeTruthy();
    expect((within(dialog).getByRole("button", { name: "Turn off" }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Turn off resume parsing?" })).toBeNull());
    expect(sent).toHaveLength(0);

    fireEvent.click(screen.getByRole("switch", { name: "Resume parsing enabled" }));
    const again = await screen.findByRole("dialog", { name: "Turn off resume parsing?" });
    fireEvent.change(within(again).getByLabelText("Reason (required)"), { target: { value: "Gemini 5xx spike" } });
    fireEvent.click(within(again).getByRole("button", { name: "Turn off" }));
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toMatchObject({ method: "PATCH", url: "/api/admin/ai/routes/parse", body: { enabled: false, reason: "Gemini 5xx spike" } });
    expect(await screen.findByText("Resume parsing turned off")).toBeTruthy();
  });

  it("switching parse to another model also asks for a reason; other tasks do not", async () => {
    handler = (c) => reply(200, route(c.url.endsWith("/parse") ? "parse" : "draft", "x", "MEDIUM", { model: R("gemini-2.5-flash", "db") }));
    mount();

    await pickOption("Resume parsing model", "gemini-2.5-flash");
    expect(await screen.findByRole("dialog", { name: "Change the model for resume parsing?" })).toBeTruthy();
    expect(sent).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    await pickOption("Answer drafting model", "gemini-2.5-flash");
    await waitFor(() => expect(sent).toHaveLength(1)); // straight through, no dialog
  });

  it("turning a provider off lists its tasks; a 409 shows inline and offers 'Turn off anyway', which sends force", async () => {
    handler = (c) =>
      c.body?.force
        ? reply(200, { ...config().providers[0], enabled: R(false, "db", true) })
        : reply(409, { error: "gemini still answers parse, draft. Set a fallback or re-route them first.", code: "AI_PROVIDER_IN_USE", tasks: ["parse", "draft"] });
    mount();

    fireEvent.click(screen.getByRole("switch", { name: "Google Gemini enabled" }));
    const dialog = await screen.findByRole("dialog", { name: "Turn off Google Gemini?" });
    expect(within(dialog).getByText(/15 tasks route here: parse, draft/)).toBeTruthy();
    fireEvent.change(within(dialog).getByLabelText("Reason (required)"), { target: { value: "key rotated" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Turn off" }));

    expect(await within(dialog).findByText("gemini still answers parse, draft. Set a fallback or re-route them first.")).toBeTruthy();
    expect(sent[0].body).toEqual({ enabled: false, reason: "key rotated" });

    fireEvent.click(within(dialog).getByRole("button", { name: "Turn off anyway" }));
    await waitFor(() => expect(sent).toHaveLength(2));
    expect(sent[1].body).toEqual({ enabled: false, reason: "key rotated", force: true });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("Test connection shows the result line, refreshes the status, and says why when it can't run", async () => {
    handler = () => reply(200, { ok: true, model: "gemini-2.5-flash-lite-001", latencyMs: 412, inputTokens: 9, outputTokens: 1, costMicros: 4, error: null });
    mount();
    const card = screen.getByRole("article", { name: "Google Gemini" });
    fireEvent.click(within(card).getByRole("button", { name: "Test connection" }));
    expect(await within(card).findByText("OK · gemini-2.5-flash-lite-001 · 412 ms · 9 in / 1 out · $0.0000")).toBeTruthy();
    expect(sent[0]).toMatchObject({ method: "POST", url: "/api/admin/ai/providers/gemini/test" });
    expect(within(card).getByText("Ready")).toBeTruthy();

    handler = () => reply(200, { ok: false, model: "gemini-2.5-flash-lite", latencyMs: 30004, inputTokens: 0, outputTokens: 0, costMicros: 0, error: { kind: "TIMEOUT", message: "Gemini did not answer in time." } });
    fireEvent.click(within(card).getByRole("button", { name: "Test connection" }));
    expect(await within(card).findByText("✖ TIMEOUT: Gemini did not answer in time.")).toBeTruthy();
    expect(within(card).getByText("✖ Failing")).toBeTruthy();

    handler = () => reply(429, { error: "Too many provider tests this hour.", code: "AI_TEST_RATE_LIMITED", retryAfterSeconds: 600 });
    fireEvent.click(within(card).getByRole("button", { name: "Test connection" }));
    expect(await within(card).findByText(/You've run 30 tests this hour — try again after /)).toBeTruthy();
  });

  it("an unreachable API is an error state, not a blank page", () => {
    mount(null);
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByText("Couldn't load AI providers")).toBeTruthy();
  });

  it("saves in order per row: two quick edits of one task never overlap", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        sent.push({ method: init?.method ?? "GET", url, body: JSON.parse(init?.body as string) as Record<string, unknown> });
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((r) => setTimeout(r, 15));
        inFlight -= 1;
        return new Response(JSON.stringify(route("draft", "Answer drafting")), { status: 200, headers: { "content-type": "application/json" } });
      }),
    );
    mount();
    const box = screen.getByLabelText("Answer drafting max output tokens");
    await act(async () => {
      fireEvent.change(box, { target: { value: "500" } });
      fireEvent.blur(box);
      fireEvent.change(box, { target: { value: "600" } });
      fireEvent.blur(box);
    });
    await waitFor(() => expect(sent).toHaveLength(2));
    expect(maxInFlight).toBe(1);
  });
});
