import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { dirname, resolve } from "node:path";
import type { Page } from "@playwright/test";
import { expect } from "../../stories/_support/story";
import { AUTH_DIR } from "../../stories/_support/global-setup";
import { PORT } from "../../stories/_support/personas";

/**
 * Shared bits of the v3 narrated videos (01..06). Not a spec file (the videos config only matches *.video.ts).
 *
 * Videos 01..03 follow ONE new organization from the moment Kiwiply creates it. Video 01 makes it and writes its address and the owner's e-mail and
 * chosen password to a local, git-ignored state file (`web/.auth-stories/v3-org.json`; throwaway test values, never committed); 02 and 03 read it.
 * To make a different organization (for a re-take of 01), set V3_ORG_LABEL (and V3_ORG_NAME, V3_OWNER_NAME).
 */
export const PLATFORM = `http://localhost:${PORT}`;
export const tenantHost = (label: string) => `http://${label}.localhost:${PORT}`;
export const ADMIN_LOGIN = process.env.STORY_ADMIN_LOGIN ?? "admin";
export const ADMIN_PASSWORD = process.env.STORY_ADMIN_PASSWORD ?? "admin";

export interface V3Org {
  label: string;
  name: string;
  ownerName: string;
  ownerEmail: string;
  /** The password the owner chose at first sign-in (random per run, throwaway). */
  ownerPassword: string;
}

const ORG_FILE = resolve(AUTH_DIR, "v3-org.json");

export function saveOrg(org: V3Org) {
  mkdirSync(dirname(ORG_FILE), { recursive: true });
  writeFileSync(ORG_FILE, JSON.stringify(org, null, 1), "utf8");
}

export function loadOrg(): V3Org {
  if (!existsSync(ORG_FILE)) throw new Error("no v3 organization yet: record video 01 first (it creates the organization these videos follow)");
  return JSON.parse(readFileSync(ORG_FILE, "utf8")) as V3Org;
}

export const randomPassword = () => `Own-${randomBytes(6).toString("hex")}!`;

/** The tenant sign-in form (e-mail + password), typed on screen. Lands on the workspace (or on the choose-a-password page for a temporary one). */
export async function tenantSignIn(page: Page, host: string, email: string, password: string, expectPath: RegExp | ((u: URL) => boolean) = (u) => u.pathname.startsWith("/w/")) {
  await page.getByLabel("User Name").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: /^Sign In/ }).click();
  await page.waitForURL(typeof expectPath === "function" ? expectPath : (u) => expectPath.test(u.pathname), { timeout: 45_000 });
  void host;
}

/** Wait until the tenant shell (sidebar + page) is drawn. */
export async function shellReady(page: Page) {
  await expect(page.locator("[data-enterprise-shell]")).toBeVisible({ timeout: 60_000 });
}
