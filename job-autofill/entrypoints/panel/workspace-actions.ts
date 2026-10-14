/**
 * Org-workspace actions for the drawer (WP5, docs/enterprise-v2/60 §6) — the engine-coupled glue
 * around `JAF.workspace` (pure) and the TrackingProvider seam. Three groups:
 *
 *   workspaces  which orgs the signed-in user belongs to + the persisted Personal / <Org> choice
 *   marketer    the facade the "Save for consultant…" form uses (consultant list + save) and nothing else
 *   consultant  assigned jobs, matching the current page to one, Open posting / I applied
 *
 * MARKETER SESSIONS NEVER READ A PROFILE: nothing in the marketer group calls pullProfile,
 * listResumes, the mirror (`refreshMirror`/`loadData`) or any fill path. Keep it that way — the
 * test `workspace_modes.test.js` pins both the facade and the marketer view's imports.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
const JAF = () => window.JAF;

export type Workspace = { orgId: number; name: string; consultant: boolean; marketer: boolean };
export type WorkspaceState = { workspaces: Workspace[]; setting: "personal" | number };

async function connectedProvider(): Promise<any | null> {
  const settings = await JAF().storage.getSettings();
  if (!settings.apiBaseUrl) return null;
  const provider = JAF().sync.providerFromSettings(settings, JAF().tracking.chromeTokenStore());
  return (await provider.isAuthenticated()) ? provider : null;
}

/** Local read only: the orgs last seen + the persisted choice, validated against them. */
export async function readWorkspaceState(): Promise<WorkspaceState> {
  const s = await JAF().storage.getSettings();
  const workspaces: Workspace[] = Array.isArray(s.workspaces) ? s.workspaces : [];
  const sel = JAF().workspace.selected(workspaces, s.workspace);
  return { workspaces, setting: sel ? sel.orgId : "personal" };
}

/** Ask the server for the current memberships (GET /api/profile/version → workspaces[]), store them. */
export async function refreshWorkspaces(): Promise<WorkspaceState> {
  try {
    const provider = await connectedProvider();
    if (provider) {
      const list = await provider.listWorkspaces();
      const s = await JAF().storage.getSettings();
      s.workspaces = list;
      if (!JAF().workspace.selected(list, s.workspace)) s.workspace = "personal";
      await JAF().storage.saveSettings(s);
    }
  } catch {
    /* offline / older server → keep what we had */
  }
  return readWorkspaceState();
}

export async function chooseWorkspace(setting: "personal" | number): Promise<void> {
  const s = await JAF().storage.getSettings();
  s.workspace = setting;
  await JAF().storage.saveSettings(s);
}

// ---- marketer --------------------------------------------------------------------------------
export type ConsultantOption = { id: number; name: string };

/** The ONLY handle a marketer drawer gets (see JAF.workspace.marketerFacade). */
export async function marketerFacadeFor(orgId: number) {
  const provider = await connectedProvider();
  if (!provider) return null;
  return JAF().workspace.marketerFacade(provider, orgId);
}

// ---- consultant ------------------------------------------------------------------------------
export type AssignedJob = {
  id: number;
  state: string;
  title?: string;
  company?: string;
  location?: string;
  workMode?: string;
  employmentType?: string;
  payLabel?: string;
  jobUrl?: string;
  atsPlatform?: string;
  externalJobId?: string;
  marketerNote?: string;
  assignedBy: string;
  priority?: string;
  dueOn?: string;
  allowedActions: string[];
};

export async function loadAssigned(orgId: number): Promise<{ items: AssignedJob[]; stale: boolean } | null> {
  const provider = await connectedProvider();
  if (!provider) return null;
  return JAF().workspace.loadAssignedJobs(provider, JAF().storage, orgId);
}

/** Is the current tab one of my assigned jobs? Identity first, then the normalised URL. */
export async function matchAssigned(items: AssignedJob[], capture: any): Promise<{ job: AssignedJob; by: string } | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const urls = [capture && capture.jobUrl, tab && tab.url].filter(Boolean);
  return JAF().workspace.matchOpportunity(items, {
    atsPlatform: capture && capture.atsPlatform,
    externalJobId: capture && capture.externalJobId,
    urls,
  });
}

/** Open the posting in a new tab and tell the org it was viewed (best-effort, first time only). */
export async function openPosting(orgId: number, job: AssignedJob): Promise<void> {
  if (job.jobUrl && /^https:\/\//i.test(job.jobUrl)) await chrome.tabs.create({ url: job.jobUrl });
  if (job.state === "ASSIGNED") {
    try {
      const provider = await connectedProvider();
      if (provider) await provider.respondOpportunity(orgId, job.id, "viewed", {});
    } catch {
      /* viewing must never block opening the link */
    }
  }
}

/**
 * "I applied": the consultant states that they applied. If this tab has a tracked application
 * (the fill logged one), its id is sent with it; otherwise the bare fact is. Returns true when sent.
 */
export async function markApplied(orgId: number, job: AssignedJob): Promise<boolean> {
  const provider = await connectedProvider();
  if (!provider) return false;
  let applicationId: number | undefined;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const pend: any = await new Promise((res) => chrome.storage.local.get("trackingPending", (o) => res((o && o.trackingPending) || {})));
    const mine = tab && tab.id != null ? pend[tab.id] : null;
    if (mine && mine.serverId != null) applicationId = mine.serverId;
  } catch {
    /* no application id → send the bare fact */
  }
  try {
    await provider.linkOpportunity(orgId, job.id, applicationId != null ? { applicationId } : {});
    return true;
  } catch (e: any) {
    // The id isn't the caller's application as far as the server knows (404): the fact still stands.
    if (applicationId != null && e && e.status === 404) {
      try {
        await provider.linkOpportunity(orgId, job.id, {});
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }
}
