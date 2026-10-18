"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDownIcon, FileTextIcon, MemberAvatar, Menu, SignOutIcon, SwapIcon, UserIcon, BellIcon, ShieldIcon, LinkIcon, type MenuEntry } from "@kiwiply/ui";
import { Button } from "@/components/ui";
import ConnectExtensionDialog from "@/components/ent/shell/ConnectExtensionDialog";
import { primaryRoleShortName } from "@/lib/ent/shell";
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
 * then My profile first, Notifications, Security, Switch workspace (only with more than one), Connect extension (O4: opens the platform connect page with a one-time code) and Sign out.
 */
export default function AccountMenu({ me, onSwitchWorkspace, compact = false }: { me: MeTenant; onSwitchWorkspace: () => void; compact?: boolean }) {
  const router = useRouter();
  const role = primaryRoleShortName(me);
  const [connectOpen, setConnectOpen] = useState(false);
  const entries: MenuEntry[] = [
    { heading: `${me.org.displayName} · ${role}` },
    { label: "My profile", icon: <UserIcon size={16} />, onSelect: () => router.push("/me") },
    { label: "Notifications", icon: <BellIcon size={16} />, onSelect: () => router.push("/me#notifications") },
    { label: "Security", icon: <ShieldIcon size={16} />, onSelect: () => router.push("/me#security") },
    ...(showSwitcher(me) ? [{ label: "Switch workspace", icon: <SwapIcon size={16} />, onSelect: onSwitchWorkspace }] : []),
    { label: "Connect extension", icon: <LinkIcon size={16} />, onSelect: () => setConnectOpen(true) },
    { separator: true },
    // The organization's own policy pages on THIS host (docs/enterprise-v2/62), never the Kiwiply site.
    { label: "Privacy policy", icon: <FileTextIcon size={16} />, onSelect: () => router.push("/privacy") },
    { label: "Terms of use", icon: <FileTextIcon size={16} />, onSelect: () => router.push("/terms") },
    { separator: true },
    { label: "Sign out", icon: <SignOutIcon size={16} />, onSelect: () => void signOut(), danger: true },
  ];
  return (
    <>
      <ConnectExtensionDialog open={connectOpen} onClose={() => setConnectOpen(false)} />
      <Menu
        align="end"
        menuClassName="min-w-[240px]"
        items={entries}
        trigger={
          <button
            type="button"
            aria-label={`Account menu for ${me.person.name}`}
            data-account-menu
            className="ent-profile flex items-center gap-3 text-left transition-colors hover:bg-paper-2"
          >
            <MemberAvatar name={me.person.name} src={me.person.imageUrl} size={44} />
            {compact ? null : (
              <span className="hidden min-w-0 leading-tight lg:block">
                <span className="block max-w-[150px] truncate text-[15px] font-semibold text-[color:var(--ent-title)]">{me.person.name}</span>
                <span className="block max-w-[150px] truncate text-[13px] text-[color:var(--ent-soft)]">{role}</span>
              </span>
            )}
            <ChevronDownIcon size={16} className="hidden flex-none text-[color:var(--ent-title)] lg:block" />
          </button>
        }
      />
    </>
  );
}
