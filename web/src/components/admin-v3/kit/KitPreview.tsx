"use client";

import { useMemo, useRef, useState } from "react";
import { BarChartIcon, Button, ClockIcon, buttonVariants, FileTextIcon, Switch, UsersIcon } from "@kiwiply/ui";
import { PlanChip, StatusDot } from "../common/chips";
import { AdminFilterBar, AdminHero, AdminPanel, AdminSaveProvider, AdminStatTiles, AdminTable, AttentionBadge, AutosaveInput, HistoryDrawer, PersonCell, Tick, useAdminSave } from "../common";
import type { AdminColumn, AdminFetcher } from "../common";
import { useListQuery } from "@/lib/list-query";
import type { ListResponse } from "@/lib/list-query";

/**
 * A working specimen of the admin page kit (E2E-A15.0): every piece wired the way a page story wires it, over data that
 * lives in this file, so the kit can be seen, tested in a real browser (`e2e/journeys/admin-kit.spec.ts`) and copied.
 * DEV ONLY: the route 404s in a production build. Nothing here talks to the API.
 */

interface Row {
  login: string;
  name: string;
  plan: "Free" | "Pro" | "Autopilot";
  status: "Active" | "Pending";
  seen: string;
}

const PLANS: Row["plan"][] = ["Free", "Pro", "Autopilot"];
const TOTAL = 47; // rows in the specimen: more than two pages, so paging is real
const LATENCY_MS = 120; // config-literal-ok: specimen latency, so the busy state is visible

const ALL: Row[] = Array.from({ length: TOTAL }, (_, i) => {
  const n = String(i + 1).padStart(2, "0");
  return { login: `user${n}`, name: `Test User ${n}`, plan: PLANS[i % 3], status: i % 5 === 4 ? "Pending" : "Active", seen: `${(i % 9) + 1} d ago` };
});

/** What a list endpoint answers: `GET ?page&size&q&plan` -> `{ items, total, page, size }`. */
const listFetcher: typeof fetch = async (input) => {
  const url = new URL(String(input), "http://specimen.local");
  const q = (url.searchParams.get("q") ?? "").toLowerCase();
  const plan = url.searchParams.get("plan") ?? "";
  const page = Number(url.searchParams.get("page") ?? 0);
  const size = Number(url.searchParams.get("size") ?? 20);
  await new Promise((r) => setTimeout(r, LATENCY_MS));
  const rows = ALL.filter((r) => (!q || r.login.includes(q) || r.name.toLowerCase().includes(q)) && (!plan || r.plan.toUpperCase() === plan));
  const body: ListResponse<Row> = { items: rows.slice(page * size, page * size + size), total: rows.length, page, size };
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
};

/** What `adminFetch` would get back from a settings write: echoes the value, refuses anything over 90. */
const saveFetcher: AdminFetcher = async <T,>(_method: string, path: string, body?: unknown) => {
  await new Promise((r) => setTimeout(r, LATENCY_MS));
  const value = (body as { value?: number | boolean | null } | undefined)?.value;
  if (typeof value === "number" && value > 90) {
    return { ok: false, status: 400, code: "SETTING_OUT_OF_BOUNDS", error: "Must be between 40 and 90.", extra: { min: 40, max: 90 } };
  }
  return { ok: true, data: { path, value } as T };
};

function Specimen() {
  const a = useAdminSave();
  const list = useListQuery<Row>("/specimen/users", { fetcher: listFetcher, size: 20, filters: { plan: undefined } });
  const [threshold, setThreshold] = useState(60);
  const [parsing, setParsing] = useState(true);
  const [history, setHistory] = useState(false);
  const historyBtn = useRef<HTMLButtonElement>(null);
  const [log, setLog] = useState<string[]>([]);

  const columns = useMemo<AdminColumn<Row>[]>(
    () => [
      { key: "name", header: "User", primary: true, render: (r) => <PersonCell name={r.name} avatarName={r.name} sub={r.login} /> },
      { key: "plan", header: "Plan", sub: true, render: (r) => <PlanChip plan={r.plan} /> },
      { key: "status", header: "Status", render: (r) => <StatusDot status={r.status} /> },
      { key: "seen", header: "Last seen" },
    ],
    [],
  );

  function deactivate(r: Row) {
    a.askReason({
      title: `Deactivate ${r.login}?`,
      body: "They are signed out everywhere and cannot sign in until you reactivate them.",
      confirmLabel: "Deactivate",
      run: async (reason) => {
        setLog((l) => [...l, `deactivate ${r.login}: ${reason}`]);
        return { ok: true };
      },
    });
  }
  function remove(r: Row) {
    a.askConfirmTyped({
      title: `Delete ${r.login}?`,
      body: "Erases the account and every resume. This cannot be undone.",
      confirmLabel: "Delete account",
      expected: r.login,
      expectedLabel: "login",
      run: async (reason) => {
        setLog((l) => [...l, `delete ${r.login}: ${reason}`]);
        return { ok: true };
      },
    });
  }

  return (
    <div className="mx-auto max-w-[1500px] space-y-4">
      <AdminHero title="Admin kit specimen" subtitle="Every piece of the admin page kit, wired as a page story wires it. Development only." note="Copy me!" />

      <AdminStatTiles
        stats={[
          { label: "Total users", value: "112", icon: <UsersIcon size={26} />, tone: "blue", delta: { value: 112, previous: 100, label: "vs previous 30 days" } },
          { label: "No comparison yet", value: "40", icon: <ClockIcon size={26} />, tone: "green", delta: { value: 40, previous: null, label: "vs previous 30 days" }, caption: "previous window arrives with the API" },
          { label: "Activation rate", value: "63%", icon: <BarChartIcon size={26} />, tone: "amber", delta: { value: 63, previous: 60, mode: "points", label: "vs previous 30 days" } },
          { label: "Failed logins", value: "8", icon: <FileTextIcon size={26} />, tone: "coral", delta: { value: 8, previous: 5, lowerIsBetter: true, label: "vs previous 30 days" } },
        ]}
      />

      <AdminPanel title="Users" description="Search and filters are server-driven and live in the URL; the table is cards on a phone." right={<AttentionBadge count={ALL.filter((r) => r.status === "Pending").length} label="pending users" />}>
        <div className="space-y-3">
          <AdminFilterBar
            list={list}
            search={{ placeholder: "Search name or login" }}
            filters={[{ name: "plan", label: "Plan", options: PLANS.map((p) => ({ value: p.toUpperCase(), label: p })) }]}
          />
          <AdminTable<Row>
            list={list}
            columns={columns}
            rowKey={(r) => r.login}
            label="Users"
            what="users"
            sheetTitle={(r) => r.login}
            rowActions={(r) => (
              <>
                <Button type="button" variant="ghost" onClick={() => deactivate(r)} className="min-h-11 sm:min-h-0">
                  Deactivate
                </Button>
                <Button type="button" variant="ghost" onClick={() => remove(r)} className="min-h-11 sm:min-h-0">
                  Delete
                </Button>
              </>
            )}
          />
        </div>
      </AdminPanel>

      <AdminPanel title="Autosave" description="No Save button: a value saves when you leave the box, shows a tick, and offers Undo. Over 90 is refused inline.">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="mb-1 text-[12.5px] font-semibold text-ink">jobs.match_threshold</p>
            <AutosaveInput
              k="threshold"
              label="Match threshold"
              type="number"
              inputMode="numeric"
              value={String(threshold)}
              onCommit={(next) =>
                a.save<{ value: number }>({
                  key: "threshold",
                  row: "threshold",
                  method: "PUT",
                  path: "/settings/jobs.match_threshold",
                  body: { value: Number(next) },
                  optimistic: next,
                  onSaved: (d) => setThreshold(d.value),
                  undoTitle: `Match threshold set to ${next}`,
                  undo: { method: "PUT", path: "/settings/jobs.match_threshold", body: { value: threshold } },
                })
              }
            />
          </div>
          <div>
            <p className="mb-1 text-[12.5px] font-semibold text-ink">feature.resume_parsing.enabled</p>
            <div className="flex min-h-11 items-center gap-2.5">
              <Switch
                aria-label="Resume parsing enabled"
                checked={a.shown("parsing", parsing)}
                onCheckedChange={(on) => {
                  if (on) {
                    void a.save<{ value: boolean }>({ key: "parsing", row: "parsing", method: "PUT", path: "/settings/feature.resume_parsing.enabled", body: { value: true }, optimistic: true, onSaved: () => setParsing(true) });
                    return;
                  }
                  a.askReason({
                    title: "Turn off resume parsing?",
                    body: "New resumes are not parsed until it is back on.",
                    confirmLabel: "Turn off",
                    run: (reason) =>
                      a.save<{ value: boolean }>({ key: "parsing", row: "parsing", method: "PUT", path: "/settings/feature.resume_parsing.enabled", body: { value: false, reason }, optimistic: false, onSaved: () => setParsing(false) }),
                  });
                }}
              />
              <span className="text-[12px] font-bold text-ink-soft">{a.shown("parsing", parsing) ? "ON" : "OFF"}</span>
              <Tick k="parsing" />
            </div>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button type="button" ref={historyBtn} onClick={() => setHistory(true)} aria-haspopup="dialog" className={buttonVariants("ghost", "md", "min-h-11 sm:min-h-0")}>
            Change history
          </button>
          {log.length > 0 && (
            <p role="status" className="text-[12.5px] text-ink-soft">
              Last confirmed: {log[log.length - 1]}
            </p>
          )}
        </div>
      </AdminPanel>

      <HistoryDrawer
        open={history}
        onClose={() => setHistory(false)}
        returnFocusTo={historyBtn}
        load={async () => ({
          ok: true,
          data: [
            { id: 2, key: "jobs.match_threshold", oldValue: "60", newValue: "70", actorLogin: "admin", reason: "Too many weak matches", changedAt: "2026-10-12T16:00:00Z" },
            { id: 1, key: "feature.resume_parsing.enabled", oldValue: "true", newValue: "false", actorLogin: "maya.chen", reason: null, changedAt: "2026-10-12T15:00:00Z" },
          ],
        })}
      />
    </div>
  );
}

export default function KitPreview() {
  return (
    <AdminSaveProvider fetcher={saveFetcher}>
      <Specimen />
    </AdminSaveProvider>
  );
}
