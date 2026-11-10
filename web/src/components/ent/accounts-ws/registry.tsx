import type { ReactNode } from "react";
import AccountsHomePage from "./home/AccountsHomePage";
import ContactsPage from "./contacts/ContactsPage";
import RequirementsPage from "./requirements/RequirementsPage";
import type { AccountsPageProps } from "./parts";
import { firstNameOf } from "@/lib/ent/dashboard";
import type { MeTenant } from "@/lib/ent/workspaces";

/**
 * The Accounts (Account Manager) workspace's real pages, keyed by the first path segment under `/w/accounts`. The catch-all route calls this once; a page
 * that is not listed keeps the "on the way" screen (Submissions and Offers are built elsewhere). Clients, Interviews and Placements are plain sibling
 * routes that win over the catch-all. One page = one folder here, so pages never edit the same file.
 */
export function accountsPage(slug: string[], props: AccountsPageProps): ReactNode | null {
  if (slug.length === 0) return <AccountsHomePage {...props} />;
  if (slug.length > 1) return null;
  switch (slug[0]) {
    case "contacts":
      return <ContactsPage {...props} />;
    case "requirements":
      return <RequirementsPage {...props} />;
    default:
      return null;
  }
}

/** The Accounts workspace page for `slug`, with the props every one of them takes, from the signed-in member. Null when the member has no organization id or the page is not built. */
export function accountsPageFor(me: MeTenant, slug: string[]): ReactNode | null {
  if (!me.org.id) return null;
  const nav = me.workspaces.find((w) => w.key === "accounts")?.nav ?? [];
  const hrefs = Object.fromEntries(nav.map((n) => [n.key, n.href]));
  return accountsPage(slug, { orgId: me.org.id, orgName: me.org.displayName, firstName: firstNameOf(me.person.name), hrefs, selfMemberId: me.member.id });
}
