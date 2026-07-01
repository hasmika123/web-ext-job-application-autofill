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
  autoAdv: boolean;
  autoAdd: boolean;
  analytics: boolean; // checkbox = "share"; opt-out is the inverse
};

export async function loadSettings(): Promise<Settings> {
  const s = await JAF().storage.getSettings();
  return {
    llm: !!s.llmEnabled,
    apikey: s.apiKey || "",
    serverAi: !!s.serverAiEnabled,
    serverAiConsent: !!s.serverAiConsent,
    autoAdv: !!s.autoAdvance,
    autoAdd: s.autoAddRows !== false, // default on
    analytics: !s.analyticsOptOut,
  };
}

export async function saveSettings(v: Settings): Promise<void> {
  const s = await JAF().storage.getSettings();
  s.llmEnabled = v.llm;
  s.apiKey = v.apikey.trim();
  s.serverAiEnabled = v.serverAi;
  s.serverAiConsent = v.serverAiConsent;
  s.autoAdvance = v.autoAdv;
  s.autoAddRows = v.autoAdd;
  s.analyticsOptOut = !v.analytics;
  if (!s.apiBaseUrl) s.apiBaseUrl = API_FALLBACK;
  await JAF().storage.saveSettings(s);
}

export type Account = { connected: boolean; who: string };

/** Read the session token directly (not the cached store) so the connect handoff reflects live. */
export async function readAccount(): Promise<Account> {
  const tok: any = await new Promise((res) => chrome.storage.local.get("trackingAuth", (o) => res((o && o.trackingAuth) || {})));
  return { connected: !!(tok && tok.access), who: tok.username || "your account" };
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
