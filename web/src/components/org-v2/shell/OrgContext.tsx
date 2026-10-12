"use client";

import { createContext, useContext, useMemo } from "react";
import { can as hasPermission, type CurrentOrg, type OrgInfo, type OrgMine, type OrgRole } from "@/lib/org-types";

/**
 * What every org page knows about where it is (O1.6): the org the layout resolved on the server, the caller's role in it
 * and the permission keys. A page never learns an org id from the URL, the DOM or storage - this is the only source - and
 * it is only ever the id the server already checked against the caller's memberships.
 */
interface OrgContextValue {
  current: CurrentOrg;
  /** Every org the caller can open (the switcher's list). */
  orgs: OrgMine[];
}

const Ctx = createContext<OrgContextValue | null>(null);

export function OrgProvider({ current, orgs, children }: OrgContextValue & { children: React.ReactNode }) {
  const value = useMemo(() => ({ current, orgs }), [current, orgs]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export interface UseOrg {
  org: OrgInfo;
  orgId: number;
  role: OrgRole;
  permissions: string[];
  memberCount: number;
  orgs: OrgMine[];
  /** True when the role holds this permission key (`billing.view`, `members.invite`, ...). */
  can(key: string): boolean;
}

export function useOrg(): UseOrg {
  const v = useContext(Ctx);
  if (!v) throw new Error("useOrg() was called outside the org console (no OrgProvider above it)");
  const { current, orgs } = v;
  return {
    org: current.org,
    orgId: current.org.id,
    role: current.role,
    permissions: current.permissions,
    memberCount: current.memberCount,
    orgs,
    can: (key) => hasPermission(current.permissions, key),
  };
}
