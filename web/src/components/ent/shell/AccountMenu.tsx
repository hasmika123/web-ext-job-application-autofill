"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDownIcon, MemberAvatar, Menu, SignOutIcon, SwapIcon, UserIcon, BellIcon, ShieldIcon, type MenuEntry } from "@kiwiply/ui";
import { Button } from "@/components/ui";
import { primaryRoleName } from "@/lib/ent/shell";
import { showSwitcher, type MeTenant } from "@/lib/ent/workspaces";

/** Ends the session on this host (revokes the refresh token, clears the cookies) and goes to this host's sign-in. */
export async function signOut(): Promise<void> {
  try {
    await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
  } catch {
    /* the cookies are cleared server-side on a best-effort basis; leave for the sign-in regardless */
  }
  window.location.assign("/login");
}

/** A plain sign-out button for the panels that have no shell (a paused seat). */
export function SignOutButton({ className }: { className?: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="ghost"
      className={className}
      disabled={busy}
      onClick={() => {
        setBusy(true);
        void signOut();
      }}
    >
      <SignOutIcon size={16} /> Sign out
    </Button>
  );
}

/**
 * The user menu (13 s2.3 / 16 s2.1): avatar, name and role in the trigger; the menu opens with the member's organization and role,
 * then My profile first, Notifications, Security, Switch workspace (only with more than one) and Sign out.
 */
export default function AccountMenu({ me, onSwitchWorkspace, compact = false }: { me: MeTenant; onSwitchWorkspace: () => void; compact?: boolean }) {
  const router = useRouter();
  const role = primaryRoleName(me);
  const entries: MenuEntry[] = [
    { heading: `${me.org.displayName} · ${role}` },
    { label: "My profile", icon: <UserIcon size={16} />, onSelect: () => router.push("/me") },
    { label: "Notifications", icon: <BellIcon size={16} />, onSelect: () => router.push("/me#notifications") },
    { label: "Security", icon: <ShieldIcon size={16} />, onSelect: () => router.push("/me#security") },
    ...(showSwitcher(me) ? [{ label: "Switch workspace", icon: <SwapIcon size={16} />, onSelect: onSwitchWorkspace }] : []),
    { separator: true },
    { label: "Sign out", icon: <SignOutIcon size={16} />, onSelect: () => void signOut(), danger: true },
  ];
  return (
    <Menu
      align="end"
      menuClassName="min-w-[240px]"
      items={entries}
      trigger={
        <button
          type="button"
          aria-label={`Account menu for ${me.person.name}`}
          data-account-menu
          className="flex h-12 items-center gap-2.5 rounded-xl border border-transparent px-1.5 text-left transition-colors hover:bg-paper-2 sm:border-line sm:px-2.5"
        >
          <MemberAvatar name={me.person.name} src={me.person.imageUrl} size={36} />
          {compact ? null : (
            <span className="hidden min-w-0 leading-tight lg:block">
              <span className="block max-w-[140px] truncate text-[14px] font-semibold text-ink">{me.person.name}</span>
              <span className="block max-w-[140px] truncate text-[12.5px] text-muted">{role}</span>
            </span>
          )}
          <ChevronDownIcon size={16} className="hidden flex-none text-muted lg:block" />
        </button>
      }
    />
  );
}
