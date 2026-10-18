import { randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";
import { test, expect, narrate, narrateDo } from "../../stories/_support/story";
import { PERSONAS, hostOf } from "../../stories/_support/personas";
import { statePath } from "../../stories/_support/global-setup";
import { bff, orgIdOf, openRowMenu } from "../../stories/admin/_helpers";

/**
 * V3 VIDEO 04: Assign consultants to marketers (Sarah Chen, Org Admin and Marketing Manager at Acme Staffing).
 * The Marketing Assignments board: load per marketer, assigning unassigned consultants, a backup marketer, the Reassign sheet (now, with a preview of the open
 * work that moves; and on a future date), temporary cover with an end date, Undo, and where the history is kept (Audit Logs).
 * Stories shown: ADM-48 and the marketing-assignments journey (reassign, schedules, cover).
 * Whatever the video changes is put back afterwards through the same API the page uses (a snapshot of the board is taken first), so it can be recorded again.
 */
const base = (orgId: number) => `/api/orgs/${orgId}/marketing-assignments`;

interface Row {
  consultantId: number;
  name: string;
  marketer: { memberId: number } | null;
  backup: { memberId: number } | null;
  priority: string;
  status: string;
}

async function allRows(page: Page, orgId: number): Promise<Row[]> {
  const out: Row[] = [];
  for (let n = 0; n < 5; n++) {
    const r = await bff(page, "GET", `${base(orgId)}/consultants?size=100&page=${n}`);
    out.push(...(r.json.items as Row[]));
    if (!r.json.hasMore) break;
  }
  return out;
}

const schedules = async (page: Page, orgId: number): Promise<{ id: number }[]> => (await bff(page, "GET", `${base(orgId)}/schedules`)).json.items ?? [];
const key = () => ({ "idempotency-key": randomUUID() });

/** Put the board back the way the snapshot had it, and drop plans made since. */
async function restoreBoard(page: Page, orgId: number, before: Map<number, Row>, plansBefore: Set<number>) {
  for (const s of await schedules(page, orgId)) if (!plansBefore.has(s.id)) await bff(page, "POST", `${base(orgId)}/schedules/${s.id}/cancel`, {}, key());
  const now = await allRows(page, orgId);
  const rows = now
    .filter((r) => {
      const b = before.get(r.consultantId);
      return !b || b.marketer?.memberId !== r.marketer?.memberId || b.backup?.memberId !== r.backup?.memberId || b.priority !== r.priority || b.status !== r.status;
    })
    .map((r) => {
      const b = before.get(r.consultantId);
      return { consultantId: r.consultantId, marketerMemberId: b?.marketer?.memberId ?? null, backupMemberId: b?.backup?.memberId ?? null, priority: b?.priority ?? "MEDIUM", status: b?.status ?? "ACTIVE" };
    });
  if (rows.length) await bff(page, "POST", `${base(orgId)}/restore`, { rows }, key());
}

const dayInput = (plus: number) => {
  const d = new Date(Date.now() + plus * 86_400_000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

test("V3-04 Marketing assignments: assign, backup, reassign now and later, temporary cover, undo, history", async ({ flow, browser }) => {
  // an unrecorded browser: snapshot the board now, put it back at the end
  const quiet = await browser.newContext({ storageState: statePath("sarah"), viewport: { width: 1440, height: 900 } });
  const q = await quiet.newPage();
  await q.goto(`${hostOf(PERSONAS.sarah)}/w/admin`);
  await expect(q.locator("[data-enterprise-shell]")).toBeVisible({ timeout: 60_000 });
  const orgId = await orgIdOf(q);
  // leftovers of an earlier take that stopped half way: consultants assigned today were unassigned when the take began (the seed assigned everyone in the past)
  const today = new Date().toISOString().slice(0, 10);
  const fresh = (await allRows(q, orgId)).filter((r) => String((r as unknown as { assignedAt?: string }).assignedAt ?? "").startsWith(today)).map((r) => r.consultantId);
  if (fresh.length) await bff(q, "POST", `${base(orgId)}/unassign`, { consultantIds: fresh }, key());
  const before = new Map((await allRows(q, orgId)).map((r) => [r.consultantId, r]));
  const plansBefore = new Set((await schedules(q, orgId)).map((s) => s.id));
  await restoreBoard(q, orgId, before, plansBefore); // leftovers of an earlier take, if any (nothing, on a clean board)

  const f = await flow({ who: "sarah" });
  const { page } = f;
  const card = (name: string) => page.locator("[data-marketer]", { hasText: name });
  const table = page.getByRole("table", { name: "Assigned consultants" });
  const toast = (text: RegExp | string) => page.getByText(text).first();

  await f.titleCard({
    title: "Assigning consultants to marketers",
    roles: "Org Admin and Marketing Manager  |  Acme Staffing",
    intro: "Hi! In this video I'll show you how an admin decides which marketer looks after which consultant: assigning, backups, handing over, and covering for someone who is away.",
    minMs: 3500,
  });

  await f.go("/w/admin/marketing-assignments");
  await expect(page.locator("[data-marketing-assignments-page]")).toBeVisible({ timeout: 60_000 });
  await expect(page.locator("[data-marketer]").first()).toBeVisible({ timeout: 45_000 });
  await narrate(page, "I'm Sarah, the org admin at Acme Staffing, and this is the Marketing Assignments board. A marketer prepares everything for the consultants they look after, so who looks after whom matters.");
  await narrate(page, "The four tiles give the picture: how many consultants are assigned, how many marketers there are, how many consultants have nobody yet, and how many marketers are overloaded.", undefined, page.locator("[data-kpi=assigned]"));
  await narrate(page, "On the left, each marketer has a workload bar against their own capacity. Michael Park is at twenty-nine of thirty, nearly full. Three marketers are over ninety percent.", undefined, page.locator("[data-marketers-panel]"));
  await card("Michael Park").getByRole("button", { name: /Show their consultants/ }).click();
  await expect(page.locator("[data-consultants-subtitle]")).toContainText("Michael Park", { timeout: 20_000 });
  await narrate(page, "Pick a marketer, and the table on the right lists their consultants, with their backup marketer, status, priority and active applications.", undefined, table);

  // ---- assign unassigned consultants
  await narrate(page, "Twelve consultants have nobody yet. David Kim has room, sixteen of twenty-five, so let's give him two.");
  await card("David Kim").getByRole("button", { name: /Show their consultants/ }).click();
  await expect(page.locator("[data-consultants-subtitle]")).toContainText("David Kim", { timeout: 20_000 });
  const loadBefore = await card("David Kim").locator("[data-load]").innerText();
  await page.getByRole("button", { name: "Assign Consultants" }).first().click();
  const dlg = page.getByRole("dialog", { name: /Assign consultants to David Kim/ });
  const boxes = dlg.getByRole("checkbox");
  await expect(boxes.first()).toBeVisible({ timeout: 20_000 });
  await narrate(page, "The list only holds consultants who aren't assigned to anyone. I tick two of them.", undefined, dlg);
  const names: string[] = [];
  for (const i of [0, 1]) {
    names.push(((await boxes.nth(i).getAttribute("aria-label")) ?? "").replace(/^Select /, "").trim());
    await boxes.nth(i).check();
  }
  await expect(dlg.locator("[data-picked-count]")).toHaveText("2 selected");
  await narrate(page, "It tells me what the load will be before I confirm. Seventeen, eighteen, still under his capacity.");
  await dlg.getByRole("button", { name: "Assign 2 consultants" }).click();
  await expect(toast(/Assigned 2 consultants/)).toBeVisible({ timeout: 20_000 });
  await expect(card("David Kim").locator("[data-load]")).not.toHaveText(loadBefore, { timeout: 20_000 });
  await narrate(page, "Done. David's load went up by two, the unassigned tile went down by two, and a toast offers Undo for a few seconds.");

  // ---- backup marketer for the two
  await narrate(page, "A good assignment also has a backup, someone who covers when the marketer is away. I'll tick the two new consultants and set Omar Haddad as their backup.");
  for (const n of names) {
    const box = table.getByRole("checkbox", { name: `Select ${n}` });
    await expect(box).toBeVisible({ timeout: 20_000 });
    await box.check();
  }
  const bulk = page.getByRole("button", { name: /Bulk Actions/ });
  await expect(async () => {
    if (!(await page.getByRole("menuitem", { name: /Set backup marketer/ }).isVisible().catch(() => false))) {
      await bulk.scrollIntoViewIfNeeded();
      await page.waitForTimeout(500);
      await bulk.click();
    }
    await expect(page.getByRole("menuitem", { name: /Set backup marketer/ })).toBeVisible({ timeout: 2500 });
  }).toPass({ timeout: 30_000 });
  await page.getByRole("menuitem", { name: /Set backup marketer/ }).click();
  const picker = page.getByRole("dialog", { name: "Set backup marketer" });
  await expect(picker).toBeVisible({ timeout: 15_000 });
  await picker.getByRole("radio", { name: /^Omar Haddad/ }).check();
  await page.waitForTimeout(1200);
  await picker.locator("[data-picker-submit]").click();
  await expect(toast(/set the backup of/)).toBeVisible({ timeout: 20_000 });
  await narrate(page, "The backup is set. If their marketer is away, Omar is the one who steps in, and Kiwiply keeps it in the consultant's history.");

  // ---- over capacity warning
  await narrate(page, "What if someone is full? Let me try giving Michael Park two more.");
  await card("Michael Park").getByRole("button", { name: /Show their consultants/ }).click();
  await expect(page.locator("[data-consultants-subtitle]")).toContainText("Michael Park", { timeout: 20_000 });
  await page.getByRole("button", { name: "Assign Consultants" }).first().click();
  const over = page.getByRole("dialog", { name: /Assign consultants to Michael Park/ });
  const ob = over.getByRole("checkbox");
  await expect(ob.first()).toBeVisible({ timeout: 20_000 });
  await ob.nth(0).check();
  await ob.nth(1).check();
  await expect(over.locator("[data-capacity-warning]")).toContainText("over", { timeout: 15_000 });
  await narrate(page, "Kiwiply warns me straight away: he would have thirty-one of thirty. I can still go ahead if I really want to, but the answer here is to spread the load, so I cancel.", undefined, over.locator("[data-capacity-warning]"));
  await over.getByRole("button", { name: "Cancel" }).click();
  await expect(over).toBeHidden({ timeout: 10_000 });

  // ---- reassign now, with the preview
  await narrate(page, "Better: move one of Michael's consultants to someone with room. I'll open the row menu on a consultant who has work in progress and choose Reassign or schedule.");
  const rows = table.getByRole("row");
  await expect(rows.nth(1)).toBeVisible({ timeout: 20_000 });
  let pickRow = rows.nth(1);
  for (let i = 1; i <= 5; i++) {
    const apps = Number((await rows.nth(i).locator("td").nth(6).innerText().catch(() => "0")).trim());
    if (apps > 0) { pickRow = rows.nth(i); break; }
  }
  const moving = ((await pickRow.locator("td").nth(1).innerText()).split("\n")[0] || "").trim();
  await openRowMenu(page, pickRow, /Reassign or schedule/);
  await page.getByRole("menuitem", { name: /Reassign or schedule/ }).click();
  const sheet = page.locator("[data-reassign-sheet]");
  await expect(sheet).toBeVisible({ timeout: 20_000 });
  await narrate(page, `This is the Reassign sheet for ${moving}. It shows who has them now, and every marketer with their current load.`, undefined, sheet);
  await sheet.getByRole("radio", { name: /^Omar Haddad/ }).check();
  await expect(sheet.locator("[data-preview-line]")).toBeVisible({ timeout: 20_000 });
  await narrate(page, "Once I choose Omar Haddad, the sheet shows What will move. The open opportunities and follow-ups that Michael was handling for this consultant move to Omar with them, so nothing is dropped.", undefined, sheet.locator("[data-handover-preview]"));
  await sheet.locator("[data-reassign-reason]").fill("Balancing the load, Michael is nearly full");
  await narrate(page, "I add a short reason. It's kept in the consultant's history, and the sheet reminds me not to type private details about a person.");
  await sheet.locator("[data-reassign-submit]").click();
  await expect(toast(/Reassigned|moved to|is now with/i)).toBeVisible({ timeout: 25_000 }).catch(() => undefined);
  await expect(sheet).toBeHidden({ timeout: 25_000 });
  await narrate(page, "Done, effective now. Michael is down by one, Omar is up by one, and again there's an Undo.");

  // ---- reassign on a future date
  await narrate(page, "A handover doesn't have to happen today. Say a consultant's project ends next week and Samantha Lee should take over then. Same sheet, but this time On a date.");
  await card("Jessica Davis").getByRole("button", { name: /Show their consultants/ }).click();
  await expect(page.locator("[data-consultants-subtitle]")).toContainText("Jessica Davis", { timeout: 20_000 });
  await expect(rows.nth(1)).toBeVisible({ timeout: 20_000 });
  const later = rows.nth(2);
  const laterName = ((await later.locator("td").nth(1).innerText()).split("\n")[0] || "").trim();
  await openRowMenu(page, later, /Reassign or schedule/);
  await page.getByRole("menuitem", { name: /Reassign or schedule/ }).click();
  await expect(sheet).toBeVisible({ timeout: 20_000 });
  await sheet.getByRole("radio", { name: /^Samantha Lee/ }).check();
  await sheet.locator("[data-when-date]").check();
  await sheet.getByLabel("Hand over on").fill(dayInput(7));
  await expect(sheet.locator("[data-handover-preview]")).toBeVisible();
  await narrate(page, `I pick a date a week from now. The change is applied that morning by a scheduled job, with the same history and audit as a change made today. Until then, ${laterName} stays with Jessica.`, undefined, sheet.getByLabel("Hand over on"));
  await sheet.locator("[data-reassign-submit]").click();
  await expect(sheet).toBeHidden({ timeout: 25_000 });
  await expect(page.locator("[data-plan-note]").first()).toBeVisible({ timeout: 20_000 });
  await narrate(page, "The table now carries a small note under the marketer's name: a handover is planned. Nothing has moved yet.", undefined, page.locator("[data-plan-note]").first());
  await narrate(page, "If plans change, I open the sheet again. The plan is listed as Already planned, with a Cancel button.");
  await openRowMenu(page, later, /Reassign or schedule/);
  await page.getByRole("menuitem", { name: /Reassign or schedule/ }).click();
  await expect(sheet.locator("[data-pending-plans]")).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(1500);
  await sheet.locator("[data-cancel-plan]").first().click();
  await expect(sheet.locator("[data-pending-plans]")).toBeHidden({ timeout: 20_000 });
  await narrate(page, "Cancelled. The consultant simply stays where they were.");

  // ---- temporary cover
  await narrate(page, "Now a different case: a marketer goes on leave for a while. Handing everything over for good would be wrong, so there's Temporary cover, with an end date.");
  await openRowMenu(page, later, /Temporary cover/);
  await page.getByRole("menuitem", { name: /Temporary cover/ }).click();
  await expect(sheet).toBeVisible({ timeout: 20_000 });
  await sheet.getByRole("radio", { name: /^Ryan Thompson/ }).check();
  await sheet.getByLabel("Back on").fill(dayInput(10));
  await sheet.locator("[data-reassign-reason]").fill("On leave until the end of the month");
  await narrate(page, "I choose Ryan Thompson as the cover, say when Jessica is back, and give a reason. The preview shows the open work Ryan will take for now.", undefined, sheet);
  await sheet.locator("[data-reassign-submit]").click();
  await expect(sheet).toBeHidden({ timeout: 25_000 });
  await expect(page.locator("[data-plan-note]").first()).toBeVisible({ timeout: 20_000 });
  await narrate(page, "Cover has started. The row says who is covering and until when. On the end date it hands back by itself, and Jessica's name never left the consultant.", undefined, page.locator("[data-plan-note]").first());

  // ---- undo
  await narrate(page, "Everything on this board can be undone. Here's the toast for the cover. I'll press Undo, and the cover ends right away.");
  const undo = page.getByRole("button", { name: "Undo" }).last();
  await expect(undo).toBeVisible({ timeout: 15_000 });
  await undo.click();
  await expect(toast("Undone")).toBeVisible({ timeout: 20_000 });
  await expect(page.locator("[data-plan-note]")).toHaveCount(0, { timeout: 20_000 });
  await narrate(page, "Undone. No cover, no note, and no one has to ask an engineer to fix it.");

  // ---- history
  await narrate(page, "Where's the history? Every assignment, handover and cover is written to the Audit Logs, with who did it, when, and for which consultant.");
  await f.go("/w/admin/audit");
  await expect(page.getByRole("heading", { name: "Audit Logs", level: 1 }).first()).toBeVisible({ timeout: 45_000 });
  await expect(page.getByRole("row").nth(1)).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(1500);
  await narrate(page, "Here are the changes I just made, newest first, each with who did it, when, and which consultant it was about. So a question like who moved this consultant, and why, always has an answer.", undefined, page.getByRole("table").first());
  await narrate(page, "That's the assignments board: load at a glance, assign, back up, hand over now or later, cover for a while, and undo. Thanks for watching!", 1500);

  // ---- put Acme's board back the way it was (a second, unrecorded browser), so the recording can be repeated
  await restoreBoard(q, orgId, before, plansBefore);
  const after = await allRows(q, orgId);
  expect(after.filter((r) => before.get(r.consultantId)?.marketer?.memberId !== r.marketer?.memberId).length).toBe(0);
  await quiet.close();
});
