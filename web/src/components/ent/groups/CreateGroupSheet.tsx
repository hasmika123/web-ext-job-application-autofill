"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Field, IconButton, Input, MemberAvatar, Select, SideSheet, XIcon, cn, useMediaQuery } from "@kiwiply/ui";
import { COLOR_LABEL, GROUP_COLORS, GROUP_ICONS, TONE_BAR, type Group, type GroupBody, type GroupKind, type PersonOption } from "@/lib/ent/groups";
import { GROUP_ICON, GroupTile } from "./GroupVisuals";
import PersonSearch from "./PersonSearch";

/** The icon and colour pickers: a closed list of each (the API refuses anything else). Used by the create sheet and the detail sheet. */
export function LookPicker({ icon, color, onIcon, onColor }: { icon: string | null; color: string | null; onIcon: (v: string) => void; onColor: (v: string) => void }) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="mb-1.5 text-[13px] font-semibold text-ink">Icon</div>
        <div role="group" aria-label="Icon" className="grid grid-cols-6 gap-2">
          {GROUP_ICONS.map((name) => {
            const Glyph = GROUP_ICON[name];
            const on = icon === name;
            return (
              <button
                key={name}
                type="button"
                aria-label={name}
                aria-pressed={on}
                title={name}
                onClick={() => onIcon(name)}
                className={cn(
                  "grid min-h-11 place-items-center rounded-xl border text-ink-soft focus-visible:outline-2 focus-visible:outline-accent",
                  on ? "border-accent bg-accent-soft text-accent-deep" : "border-line hover:bg-paper-2",
                )}
              >
                <Glyph size={20} />
              </button>
            );
          })}
        </div>
      </div>
      <div>
        <div className="mb-1.5 text-[13px] font-semibold text-ink">Colour</div>
        <div role="group" aria-label="Colour" className="flex flex-wrap gap-2.5">
          {GROUP_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={COLOR_LABEL[c]}
              aria-pressed={color === c}
              title={COLOR_LABEL[c]}
              onClick={() => onColor(c)}
              className={cn(
                "grid h-11 w-11 place-items-center rounded-full border-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                color === c ? "border-ink" : "border-transparent",
              )}
            >
              <span className={cn("h-7 w-7 rounded-full", TONE_BAR[c])} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * "Create Department" / "Create Team": name, (teams) the department it sits under, the lead, (teams) the first people, an icon and
 * a colour. Creating is an explicit act, so it has a button named for what it does; everything after that autosaves.
 */
export default function CreateGroupSheet({
  orgId,
  kind,
  open,
  onClose,
  departments,
  onCreate,
}: {
  orgId: number | string;
  kind: Extract<GroupKind, "DEPARTMENT" | "TEAM">;
  open: boolean;
  onClose: () => void;
  departments: Group[];
  onCreate: (body: GroupBody, memberIds: number[]) => Promise<Group | null>;
}) {
  const noun = kind === "TEAM" ? "Team" : "Department";
  const narrow = useMediaQuery("(max-width: 767px)", false);
  const [name, setName] = useState("");
  const [parent, setParent] = useState("");
  const [lead, setLead] = useState<PersonOption | null>(null);
  const [people, setPeople] = useState<PersonOption[]>([]);
  const [icon, setIcon] = useState<string>(kind === "TEAM" ? "users" : "briefcase");
  const [color, setColor] = useState<string>("primary");
  const [busy, setBusy] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a fresh sheet each time it opens
    setName("");
    setParent("");
    setLead(null);
    setPeople([]);
    setIcon(kind === "TEAM" ? "users" : "briefcase");
    setColor("primary");
    setBusy(false);
  }, [open, kind]);

  async function submit() {
    if (!name.trim() || busy) return;
    setBusy(true);
    const body: GroupBody = { name: name.trim(), kind, icon, color };
    if (kind === "TEAM" && parent) body.parentGroupId = Number(parent);
    if (lead) body.leadMemberId = lead.memberId;
    const made = await onCreate(body, people.map((p) => p.memberId));
    setBusy(false);
    if (made) onClose();
  }

  return (
    <SideSheet
      id={`create-${kind.toLowerCase()}-sheet`}
      side="right"
      mode={narrow ? "fullscreen" : "overlay"}
      width={480}
      open={open}
      onClose={onClose}
      title={`Create ${noun}`}
      description={kind === "TEAM" ? "Group people who work together. A team can sit under a department." : "A department holds teams and the people who run them."}
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void submit()} disabled={!name.trim() || busy}>
            {busy ? "Creating…" : `Create ${noun}`}
          </Button>
        </div>
      }
    >
      <form
        className="flex flex-col gap-5 p-1"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Field label={`${noun} name`} required>
          <Input ref={nameRef} value={name} maxLength={80} autoFocus placeholder={kind === "TEAM" ? "Consulting Delivery" : "Consulting"} onChange={(e) => setName(e.target.value)} />
        </Field>

        {kind === "TEAM" && (
          <Field label="Department" hint="Optional. Moving a team later moves its people's department with it.">
            <Select value={parent} onChange={setParent} options={[{ value: "", label: "No department" }, ...departments.filter((d) => d.status === "ACTIVE").map((d) => ({ value: String(d.id), label: d.name }))]} aria-label="Department" />
          </Field>
        )}

        <div>
          <div className="mb-1.5 text-[13px] font-semibold text-ink">{noun} lead</div>
          {lead ? (
            <div className="flex items-center gap-2.5 rounded-xl border border-line px-3 py-2">
              <MemberAvatar name={lead.name} size={30} />
              <div className="min-w-0 flex-1 leading-tight">
                <div className="truncate text-[13.5px] font-semibold text-ink">{lead.name}</div>
                {lead.roleName && <div className="truncate text-[12px] text-muted">{lead.roleName}</div>}
              </div>
              <IconButton aria-label="Remove lead" title="Remove lead" onClick={() => setLead(null)}>
                <XIcon size={16} />
              </IconButton>
            </div>
          ) : (
            <PersonSearch orgId={orgId} label={`${noun} lead`} placeholder="Pick a lead from your members" onPick={setLead} />
          )}
        </div>

        {kind === "TEAM" && (
          <div>
            <div className="mb-1.5 text-[13px] font-semibold text-ink">People</div>
            <PersonSearch orgId={orgId} label="Add people to the team" placeholder="Add people by name" exclude={people.map((p) => p.memberId)} onPick={(p) => setPeople((cur) => [...cur, p])} />
            {people.length > 0 && (
              <ul aria-label="People in the new team" className="mt-2 flex flex-wrap gap-2">
                {people.map((p) => (
                  <li key={p.memberId} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-paper-2 py-1 pl-1.5 pr-1 text-[12.5px] font-medium text-ink">
                    <MemberAvatar name={p.name} size={20} />
                    {p.name}
                    <IconButton aria-label={`Remove ${p.name}`} title={`Remove ${p.name}`} className="!h-6 !w-6" onClick={() => setPeople((cur) => cur.filter((x) => x.memberId !== p.memberId))}>
                      <XIcon size={12} />
                    </IconButton>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <LookPicker icon={icon} color={color} onIcon={setIcon} onColor={setColor} />

        <div className="flex items-center gap-3 rounded-xl bg-paper-2/70 p-3">
          <GroupTile icon={icon} color={color} />
          <div className="min-w-0 text-[13px] text-ink-soft">
            <div className="truncate font-semibold text-ink">{name.trim() || `New ${noun.toLowerCase()}`}</div>
            Preview
          </div>
        </div>
      </form>
    </SideSheet>
  );
}
