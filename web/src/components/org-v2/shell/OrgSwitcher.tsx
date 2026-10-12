"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { BottomSheet, CheckIcon, ChevronDownIcon, Menu, PlusIcon, cn, useToast } from "@kiwiply/ui";
import { InitialsAvatar } from "@/components/app-v2/common";
import { useMediaQuery } from "@/lib/use-media-query";
import type { OrgMine } from "@/lib/org-types";
import OrgChip from "./OrgChip";
import { useOrg } from "./OrgContext";
import { roleLabel, statusLabel } from "./org-labels";

// config-literal-ok: Tailwind's `md` breakpoint in CSS media-query form; layout geometry, not a tunable
const DESKTOP = "(min-width: 768px)";

/**
 * The org chip made interactive (O1.7): tap it for the list of organizations you can open. On a phone that is a bottom
 * sheet (44 px rows, one thumb); from `md` up it is a menu under the chip. Picking one asks `POST /api/orgs/current` to
 * write the `kiwiply_org` cookie (the server only accepts an org the caller administers) and refreshes the page, so the
 * layout resolves the new org. A person with one org still gets the sheet: it shows where they are and offers
 * "Create a workspace".
 */
export default function OrgSwitcher({ className }: { className?: string }) {
  const { org, orgs } = useOrg();
  const router = useRouter();
  const toast = useToast();
  const desktop = useMediaQuery(DESKTOP);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<number | null>(null);
  const [host, setHost] = useState<HTMLElement | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  async function pick(target: OrgMine) {
    if (target.orgId === org.id) {
      setOpen(false);
      return;
    }
    setBusy(target.orgId);
    try {
      const res = await fetch("/api/orgs/current", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ orgId: target.orgId }) });
      if (!res.ok) throw new Error(String(res.status));
      setOpen(false);
      toast({ title: `Switched to ${target.name}`, variant: "success" });
      router.refresh();
    } catch {
      toast({ title: "Couldn't switch workspace", description: "Check your connection and try again.", variant: "error" });
    } finally {
      setBusy(null);
    }
  }

  const create = () => {
    setOpen(false);
    router.push("/org/new");
  };

  const chip = (
    <button
      ref={trigger}
      type="button"
      aria-label={`Switch organization. Current: ${org.name}`}
      aria-haspopup={desktop ? "menu" : "dialog"}
      aria-expanded={desktop ? undefined : open}
      onClick={
        desktop
          ? undefined
          : () => {
              setHost(trigger.current?.closest<HTMLElement>(".theme-v2") ?? document.body);
              setOpen(true);
            }
      }
      className={cn("inline-flex min-h-11 max-w-full items-center gap-1.5 rounded-xl text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent md:min-h-0", className)}
    >
      <OrgChip compact className="min-w-0" />
      <ChevronDownIcon className="h-4 w-4 flex-none text-v2-muted" />
    </button>
  );

  if (desktop) {
    return (
      <Menu
        align="start"
        trigger={chip}
        items={[
          { heading: "Your organizations" },
          ...orgs.map((o) => ({
            label: <Row org={o} current={o.orgId === org.id} />,
            onSelect: () => void pick(o),
          })),
          { separator: true as const },
          { label: "Create a workspace", icon: <PlusIcon className="h-4 w-4" />, onSelect: create },
        ]}
      />
    );
  }

  // The top bar has a backdrop blur, and a filtered ancestor becomes the containing block of a `fixed` descendant: left in
  // place, the sheet would be laid out inside the 64 px bar. So it is portalled to the `.theme-v2` wrapper (keeps the tokens).

  return (
    <>
      {chip}
      {host && createPortal(sheet(), host)}
    </>
  );

  function sheet() {
    return (
      <BottomSheet id="org-switcher" open={open} onClose={() => setOpen(false)} title="Your organizations" description="Pick the workspace to open." returnFocusTo={trigger}>
        <ul className="space-y-1.5 pb-2">
          {orgs.map((o) => (
            <li key={o.orgId}>
              <button
                type="button"
                disabled={busy !== null}
                aria-current={o.orgId === org.id ? "true" : undefined}
                onClick={() => void pick(o)}
                className={cn(
                  "flex min-h-14 w-full items-center gap-3 rounded-2xl border px-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60",
                  o.orgId === org.id ? "border-accent bg-accent-soft" : "border-line bg-paper hover:bg-paper-2",
                )}
              >
                <Row org={o} current={o.orgId === org.id} busy={busy === o.orgId} />
              </button>
            </li>
          ))}
          <li>
            <button
              type="button"
              onClick={create}
              className="flex min-h-14 w-full items-center gap-3 rounded-2xl border border-dashed border-line px-3 text-left text-[14px] font-semibold text-ink hover:bg-paper-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <span className="grid h-9 w-9 flex-none place-items-center rounded-full bg-paper-2">
                <PlusIcon className="h-4 w-4" />
              </span>
              Create a workspace
            </button>
          </li>
        </ul>
      </BottomSheet>
    );
  }
}

/** One organization: initials tile, name, "Role · Status", a tick on the open one. */
function Row({ org, current, busy = false }: { org: OrgMine; current: boolean; busy?: boolean }) {
  const status = statusLabel(org.status);
  return (
    <span className="flex min-w-0 flex-1 items-center gap-3">
      <InitialsAvatar name={org.name} size={36} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-bold leading-tight text-ink">{org.name}</span>
        <span className="block truncate text-[12.5px] leading-tight text-muted">
          {roleLabel(org.role)} · {status.label}
        </span>
      </span>
      {busy ? <span className="text-[12px] text-muted">Switching…</span> : current && <CheckIcon aria-label="Open now" className="h-4 w-4 flex-none text-accent-deep" />}
    </span>
  );
}
