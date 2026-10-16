"use client";

import { createContext, useContext, useLayoutEffect, type ReactNode } from "react";

/**
 * Where the ONE Resume Builder is mounted. The personal app (`/resume-builder`), a consultant's own resumes inside an organization workspace
 * (`/w/consultant/resumes`) and a marketer preparing a resume for a consultant share every component (`NewResumeSheet`, `ResumeEditor`, the canvas, the
 * panels); they differ only in the few facts below, which the thin route wrappers pass in. Nothing here is a second builder: a component that used to
 * hard-code `/resume-builder` or `/api/resumes/built` reads it from here instead, and the default is exactly the personal app.
 */
export interface BuilderEnv {
  /** `personal` = kiwiply.com; `org` = an organization workspace (tenant shell); `actFor` = a marketer creating for a consultant. */
  kind: "personal" | "org" | "actFor";
  /** Where the list of resumes lives: the editor's close button and "back" lead here. */
  listHref: string;
  /** The editor of one resume. */
  editorHref: (resumeId: number) => string;
  /** The Kiwiply logo link of the editor's top bar; null hides it (inside an organization the frame is the organization's, not Kiwiply's). */
  brandHref: string | null;
  /** Where an "upgrade" prompt leads; null = nothing for the person to buy (an organization license is not for sale to them), so no prompt links anywhere. */
  upgradeHref: string | null;
  /** The way in when the profile is empty ("Build my profile"); null hides it. */
  buildProfileHref: string | null;
  /** `POST` target that creates a resume (tenant-aware BFF in an organization). */
  createBuiltUrl: string;
  /** Keep the uploaded file with the resume made from it (an owner-only endpoint: not available when acting for someone). */
  keepOriginal: boolean;
  /** The organization directory row a marketer is editing the consultant's resume for; every `/api` call of the editor then names it (see {@link ActForHeader}). */
  actForRow: number | null;
  /** The builder resume behind {@link actForRow}: the ONLY resume whose `/api/resumes/<id>/...` calls carry the act-for header. */
  actForResumeId: number | null;
}

export const PERSONAL_ENV: BuilderEnv = {
  kind: "personal",
  listHref: "/resume-builder",
  editorHref: (id) => `/resume-builder/${id}`,
  brandHref: "/dashboard",
  upgradeHref: "/pricing",
  buildProfileHref: "/profiles/setup?return=%2Fresume-builder%3Fnew%3Dprofile",
  createBuiltUrl: "/api/resumes/built",
  keepOriginal: true,
  actForRow: null,
  actForResumeId: null,
};

/** A consultant's own resumes inside their organization workspace: same builder, the tenant URL, the license's cap, no Kiwiply plans. */
export function consultantEnv(orgId: number | string): BuilderEnv {
  return {
    kind: "org",
    listHref: "/w/consultant/resumes",
    editorHref: (id) => `/w/consultant/resumes/${id}`,
    brandHref: null,
    upgradeHref: null,
    buildProfileHref: "/w/consultant/profile",
    createBuiltUrl: `/api/orgs/${orgId}/me-workspace/resumes/built`,
    keepOriginal: true,
    actForRow: null,
    actForResumeId: null,
  };
}

/** A marketer creating a resume for an assigned consultant: saved under the consultant, waits for their approval. */
export function actForEnv(orgId: number | string, consultantId: number | string): BuilderEnv {
  return {
    kind: "actFor",
    listHref: "/w/marketing/resumes",
    editorHref: () => "/w/marketing/resumes",
    brandHref: null,
    upgradeHref: null,
    buildProfileHref: null,
    createBuiltUrl: `/api/orgs/${orgId}/mkt/resumes/consultants/${consultantId}/built`,
    keepOriginal: false,
    actForRow: null,
    actForResumeId: null,
  };
}

/** A marketer editing a consultant's resume in the same editor: the directory row it is for travels on every call, the API gate decides. */
export function actForEditorEnv(orgResumeId: number, resumeId: number): BuilderEnv {
  return {
    kind: "actFor",
    listHref: "/w/marketing/resumes",
    editorHref: () => `/w/marketing/resumes/${orgResumeId}`,
    brandHref: null,
    upgradeHref: null,
    buildProfileHref: null,
    createBuiltUrl: "",
    keepOriginal: false,
    actForRow: orgResumeId,
    actForResumeId: resumeId,
  };
}

/** The act-for header's name (the API's gate reads it; the BFF forwards it). */
export const ACT_FOR_HEADER = "X-Kiwiply-Act-For";

/** The one browser route that tells the editor what it may show; it carries no resume id. */
const BUILDER_CONFIG_PATHS = new Set(["/api/resumes/builder-config", "/api/profile/resume-builder/config"]);

/**
 * Whether a request of the act-for editor names the act-for resume: a SAME-ORIGIN URL whose path is `/api/resumes/<resumeId>` (or beneath it), or the
 * builder-config route. Cross-origin URLs, other resumes and every other `/api/` path (the marketer's own data) are never tagged.
 */
export function actForApplies(input: RequestInfo | URL, resumeId: number, origin: string): boolean {
  let url: URL;
  try {
    const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    url = new URL(raw, origin);
  } catch {
    return false;
  }
  if (url.origin !== origin) return false;
  if (BUILDER_CONFIG_PATHS.has(url.pathname)) return true;
  const own = `/api/resumes/${resumeId}`;
  return url.pathname === own || url.pathname.startsWith(`${own}/`);
}

/**
 * Wraps `window.fetch` so the act-for editor's calls about THE act-for resume carry `X-Kiwiply-Act-For: <row>`. The editor's ~20 lib fetchers stay what they
 * are (threading a header through all of them is not a contained change); the wrapper is narrow instead: same-origin, `/api/resumes/<that resume>/...` and
 * the builder config only. The API's act-for gate re-checks organization host, token tenant, permission, ASSIGNED scope and an allow-list of routes on every
 * call, so the header grants nothing by itself. Returns an uninstall that always restores fetch (and turns the wrapper into a pass-through even if
 * something else wrapped fetch on top of it in the meantime).
 */
export function installActForFetch(row: number, resumeId: number): () => void {
  const original = window.fetch;
  let active = true;
  const wrapped: typeof window.fetch = (input, init) => {
    if (!active || !actForApplies(input, resumeId, window.location.origin)) return original(input, init);
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    headers.set(ACT_FOR_HEADER, String(row));
    return original(input, { ...init, headers });
  };
  window.fetch = wrapped;
  return () => {
    active = false;
    if (window.fetch === wrapped) window.fetch = original;
  };
}

/** Installed before the editor's own effects run; removed on unmount and whenever the row or resume changes. */
function ActForHeader({ row, resumeId }: { row: number; resumeId: number }) {
  useLayoutEffect(() => installActForFetch(row, resumeId), [row, resumeId]);
  return null;
}

const BuilderEnvContext = createContext<BuilderEnv>(PERSONAL_ENV);

export function BuilderEnvProvider({ env, children }: { env: BuilderEnv; children: ReactNode }) {
  return (
    <BuilderEnvContext.Provider value={env}>
      {env.actForRow !== null && env.actForResumeId !== null && <ActForHeader row={env.actForRow} resumeId={env.actForResumeId} />}
      {children}
    </BuilderEnvContext.Provider>
  );
}

export function useBuilderEnv(): BuilderEnv {
  return useContext(BuilderEnvContext);
}

/** Inside an organization workspace (consultant or act-for): no personal plans, no recruiter links, no archive or delete (the organization's list owns those). */
export const inOrganization = (env: BuilderEnv): boolean => env.kind !== "personal";
