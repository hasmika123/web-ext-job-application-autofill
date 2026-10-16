import type { Metadata } from "next";
import MyProfilePage from "@/components/ent/me/MyProfilePage";
import { serverApiFetch } from "@/lib/api";
import { isDemoLogin } from "@/lib/demo";
import { getNotificationPreferences } from "@/lib/notification-preferences-server";
import { getTenantSession } from "@/lib/ent/tenant-session";

/**
 * My profile (D6, 2026-10-16 audit): the one basic profile of every member (`/me`, rewritten here by the tenant proxy; `#notifications` and `#security` are
 * sections of it). A thin server page: the name, language and phone come from the account and its bio, the roles and title from the tenant session.
 */
export const metadata: Metadata = { title: "My profile", robots: { index: false, follow: false } };

const LANGUAGES: Record<string, string> = { en: "English" };

async function phoneOf(): Promise<string> {
  try {
    const res = await serverApiFetch("/api/profile");
    if (!res.ok) return "";
    const dto = (await res.json().catch(() => null)) as { payload?: string } | null;
    const bio = dto?.payload ? (JSON.parse(dto.payload) as Record<string, unknown>) : {};
    return typeof bio.phone === "string" ? bio.phone.trim() : "";
  } catch {
    return "";
  }
}

export default async function MePage() {
  const session = await getTenantSession();
  if (session.kind !== "OK") return null; // the layout already showed the matching panel
  const { me } = session;
  const [accountRes, phone, prefs] = await Promise.all([serverApiFetch("/api/account"), phoneOf(), getNotificationPreferences()]);
  const account = accountRes.ok ? ((await accountRes.json().catch(() => null)) as { login?: string; firstName?: string; lastName?: string; email?: string; langKey?: string; imageUrl?: string } | null) : null;
  const [first, ...rest] = me.person.name.split(" ");
  return (
    <MyProfilePage
      orgName={me.org.displayName}
      firstName={account?.firstName ?? first ?? ""}
      lastName={account?.lastName ?? rest.join(" ")}
      email={account?.email ?? me.person.email}
      phone={phone}
      langLabel={LANGUAGES[account?.langKey ?? "en"] ?? account?.langKey ?? "English"}
      jobTitle={me.member.title}
      joinedAt={me.member.joinedAt}
      imageUrl={me.person.imageUrl}
      roles={me.roles.map((r) => ({ name: r.name, isPrimary: r.isPrimary }))}
      demo={isDemoLogin(account?.login) || (account?.login ?? "").startsWith("demo-ent-")}
      notificationPrefs={prefs}
    />
  );
}
