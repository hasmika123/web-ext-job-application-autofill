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
  };
}

/** A marketer editing a consultant's resume in the same editor: the directory row it is for travels on every call, the API gate decides. */
export function actForEditorEnv(orgResumeId: number): BuilderEnv {
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
  };
}

/**
 * While a marketer edits a consultant's resume, every same-origin `/api/` call the one editor makes carries `X-Kiwiply-Act-For: <row>`. The editor's many
 * fetchers stay exactly what they are; the BFF forwards the header (`serverApiFetch`) and the API's act-for gate checks organization host, permission, ASSIGNED
 * scope and an allow-list of routes on every call, so the header grants nothing by itself. Installed before the editor's own effects run and always removed.
 */
function ActForHeader({ row }: { row: number }) {
  useLayoutEffect(() => {
    const original = window.fetch;
    window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.pathname : input.url;
      if (!url.startsWith("/api/")) return original(input, init);
      const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
      headers.set("X-Kiwiply-Act-For", String(row));
      return original(input, { ...init, headers });
    };
    return () => {
      window.fetch = original;
    };
  }, [row]);
  return null;
}

const BuilderEnvContext = createContext<BuilderEnv>(PERSONAL_ENV);

export function BuilderEnvProvider({ env, children }: { env: BuilderEnv; children: ReactNode }) {
  return (
    <BuilderEnvContext.Provider value={env}>
      {env.actForRow !== null && <ActForHeader row={env.actForRow} />}
      {children}
    </BuilderEnvContext.Provider>
  );
}

export function useBuilderEnv(): BuilderEnv {
  return useContext(BuilderEnvContext);
}

/** Inside an organization workspace (consultant or act-for): no personal plans, no recruiter links, no archive or delete (the organization's list owns those). */
export const inOrganization = (env: BuilderEnv): boolean => env.kind !== "personal";
