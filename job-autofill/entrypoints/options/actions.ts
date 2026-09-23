/**
 * Options actions — engine-coupled logic (window.JAF.storage + .tracking), lifted out of the old
 * options.js so OptionsApp.tsx stays presentational. Device-local settings + connected-account
 * status + bug report. Profile/resumes/board are managed on the web (not here). (W4.2)
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
const JAF = () => window.JAF;
export const WEB = "https://kiwiply.com";
const API_FALLBACK = "https://api.kiwiply.com";

export type Settings = {
  llm: boolean;
  apikey: string;
  serverAi: boolean;
  serverAiConsent: boolean;
  jobAi: boolean;
  autoAdv: boolean;
  autoAdd: boolean;
  analytics: boolean; // checkbox = "share"; opt-out is the inverse
  learn: boolean; // 10.3d: suggest profile values from answers given while applying
};

export async function loadSettings(): Promise<Settings> {
  const s = await JAF().storage.getSettings();
  return {
    llm: !!s.llmEnabled,
    apikey: s.apiKey || "",
    serverAi: !!s.serverAiEnabled,
    serverAiConsent: !!s.serverAiConsent,
    jobAi: !!s.jobAiEnabled,
    autoAdv: !!s.autoAdvance,
    autoAdd: s.autoAddRows !== false, // default on
    analytics: !s.analyticsOptOut,
    learn: s.learnFromApplications !== false, // default on (user decision 2026-09-22)
  };
}

export async function saveSettings(v: Settings): Promise<void> {
  const s = await JAF().storage.getSettings();
  s.llmEnabled = v.llm;
  s.apiKey = v.apikey.trim();
  s.serverAiEnabled = v.serverAi;
  s.serverAiConsent = v.serverAiConsent;
  s.jobAiEnabled = v.jobAi;
  s.autoAdvance = v.autoAdv;
  s.autoAddRows = v.autoAdd;
  s.analyticsOptOut = !v.analytics;
  s.learnFromApplications = v.learn;
  if (!s.apiBaseUrl) s.apiBaseUrl = API_FALLBACK;
  await JAF().storage.saveSettings(s);
}

export type Account = { connected: boolean; who: string; pro: boolean };

/**
 * Read the session token directly (not the cached store) so the connect handoff reflects live.
 *
 * `pro` is whatever the sync loop last recorded from `GET /api/profile/version` (12.3) — a badge,
 * nothing more. Every Pro-only call is still refused by the server, so a stale value here shows
 * the wrong pill for a few minutes at worst; it can never grant access.
 */
export async function readAccount(): Promise<Account> {
  const tok: any = await new Promise((res) => chrome.storage.local.get("trackingAuth", (o) => res((o && o.trackingAuth) || {})));
  let pro = false;
  try {
    const s = await JAF().storage.getSettings();
    pro = s.plan === "PRO";
  } catch {
    /* settings unreadable → show Free, the safe default */
  }
  return { connected: !!(tok && tok.access), who: tok.username || "your account", pro };
}

/** This month's AI meter (13.1c): a percent for Pro, a resume-parse count for Free. Never dollars. */
export type AiUsage = { metered: "budget" | "count"; used: number; limit: number; resetsAt: string; economy: boolean };

/** null when not connected or the server can't say — the meter simply isn't shown. */
export async function readAiUsage(): Promise<AiUsage | null> {
  try {
    const s = await JAF().storage.getSettings();
    const tokenStore = JAF().tracking.chromeTokenStore();
    const provider = JAF().tracking.createKiwiplyProvider({ baseUrl: s.apiBaseUrl || API_FALLBACK, tokenStore });
    if (!(await provider.isAuthenticated())) return null;
    const u: any = await provider.aiUsage();
    if (!u || (u.metered !== "budget" && u.metered !== "count") || typeof u.used !== "number") return null;
    return { metered: u.metered, used: u.used, limit: Number(u.limit) || 0, resetsAt: String(u.resetsAt || ""), economy: !!u.economy };
  } catch {
    return null;
  }
}

/** The words for the meter. The reset is a UTC month boundary, so it is shown in UTC ("October 1"). */
export function describeAiUsage(u: AiUsage): { headline: string; detail: string } {
  const d = u.resetsAt ? new Date(u.resetsAt) : null;
  const resets = d && !isNaN(d.getTime()) ? d.toLocaleDateString(undefined, { month: "long", day: "numeric", timeZone: "UTC" }) : "";
  const when = resets ? `Resets ${resets}.` : "Resets at the start of next month.";
  if (u.metered === "budget") {
    const used = Math.min(100, Math.max(0, Math.round(u.used)));
    if (used >= 100) return { headline: "You've used this month's Kiwiply AI", detail: `${when} Your own API key above still works until then.` };
    return { headline: `${used}% of this month's Kiwiply AI used`, detail: u.economy ? `${when} Until then Kiwiply AI uses a lighter, faster model.` : when };
  }
  return { headline: `${u.used} of ${u.limit} AI resume parses used this month`, detail: `${when} Drafting and the other Kiwiply AI features come with Pro.` };
}

export async function signOut(): Promise<void> {
  const tokenStore = JAF().tracking.chromeTokenStore();
  try {
    const s = await JAF().storage.getSettings();
    const provider = JAF().tracking.createKiwiplyProvider({ baseUrl: s.apiBaseUrl || API_FALLBACK, tokenStore });
    if (provider.logout) await provider.logout();
  } catch {
    /* best-effort revoke */
  }
  await tokenStore.clear();
  // Sign-out means this browser forgets the account (mirrors the SW's signedOut path): profile,
  // resumes, learned answers and the plan badge go, device settings stay. The confirmation in
  // OptionsApp says so before the user commits.
  try {
    await JAF().storage.clearAccountData();
  } catch {
    /* the session is gone regardless; the next connect starts from the server */
  }
}

export type BugReport = { message: string; category: string; consent: boolean };

// Auth-optional: the access token is attached if connected, but the endpoint accepts anonymous reports.
export async function sendBug(r: BugReport): Promise<void> {
  const s = await JAF().storage.getSettings();
  const tokenStore = JAF().tracking.chromeTokenStore();
  const report: any = { message: r.message, category: r.category, appVersion: chrome.runtime.getManifest().version };
  if (r.consent) report.userAgent = navigator.userAgent; // diagnostic context, opt-in
  const provider = JAF().tracking.createKiwiplyProvider({ baseUrl: s.apiBaseUrl || API_FALLBACK, tokenStore });
  await provider.submitBugReport(report);
}
