"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Dialog, ErrorState, IconButton, Input, MemberAvatar, Select, SideSheet, Skeleton, Tooltip, TrashIcon, XIcon, useMediaQuery } from "@kiwiply/ui";
import { failMessage, groupsApi, plural, type Group, type GroupBody, type GroupDetail, type GroupMember } from "@/lib/ent/groups";
import { GroupStatus, GroupTile } from "./GroupVisuals";
import { LookPicker } from "./CreateGroupSheet";
import PersonSearch from "./PersonSearch";
import type { useGroupActions } from "./useGroups";

type Actions = ReturnType<typeof useGroupActions>;

/**
 * One department or team, opened from a card or a row: rename (saves when you leave the box), change the lead, move a team under
 * another department, pick an icon and colour, archive, see and move its people, delete it when it is empty. There is no Save
 * button: every change is sent as it is made and the toast carries an Undo for the ones that can be reversed. A viewer without
 * `groups.manage` sees the same facts with the controls absent.
 */
export default function GroupDetailSheet({
  orgId,
  groupId,
  onClose,
  canManage,
  groups,
  departments,
  actions,
}: {
  orgId: number | string;
  groupId: number | null;
  onClose: () => void;
  canManage: boolean;
  /** Every group of the same kind (move targets). */
  groups: Group[];
  departments: Group[];
  actions: Actions;
}) {
  const narrow = useMediaQuery("(max-width: 767px)", false);
  const [detail, setDetail] = useState<GroupDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const seq = useRef(0);

  const load = useCallback(
    async (id: number) => {
      const mine = ++seq.current;
      const r = await groupsApi.detail(orgId, id);
      if (mine !== seq.current) return;
      if (!r.ok) {
        setError(failMessage(r));
        return;
      }
      setError(null);
      setDetail(r.data);
      setName(r.data.group.name);
    },
    [orgId],
  );

  useEffect(() => {
    if (groupId == null) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a fresh load per opened group
    setDetail(null);
    setError(null);
    void load(groupId);
  }, [groupId, load]);

  // The page reloads its lists after every change, including an Undo from a toast; when the list's copy of this group moves on, so does the sheet.
  const live = groupId == null ? null : (groups.find((x) => x.id === groupId) ?? departments.find((x) => x.id === groupId) ?? null);
  const liveVersion = live?.version ?? null;
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load() applies its result after an await
    if (groupId != null && detail && liveVersion != null && liveVersion !== detail.group.version) void load(groupId);
  }, [liveVersion, groupId, detail, load]);

  const g = detail?.group ?? null;
  const open = groupId != null;

  async function change(body: GroupBody, done: string, inverse?: GroupBody) {
    if (!g) return;
    const updated = await actions.patch(g, body, done, inverse);
    if (groupId != null) await load(groupId);
    return updated;
  }

  async function rename() {
    if (!g) return;
    const next = name.trim();
    if (!next || next === g.name) {
      setName(g.name);
      return;
    }
    const updated = await change({ name: next }, `Renamed to ${next}`, { name: g.name });
    if (!updated) setName(g.name);
  }

  const noun = g?.kind === "TEAM" ? "team" : "department";
  const isEmpty = !!detail && detail.membersTotal === 0 && (detail.teams.length === 0);
  const targets = groups.filter((x) => g && x.id !== g.id && x.status === "ACTIVE");

  async function moveTo(m: GroupMember, targetId: string) {
    const target = groups.find((x) => String(x.id) === targetId);
    if (!target) return;
    await actions.move(target, [m.memberId], m.name);
    if (groupId != null) await load(groupId);
  }

  async function removeFrom(m: GroupMember) {
    if (!g) return;
    const r = await groupsApi.removeMember(orgId, g.id, m.memberId);
    if (!r.ok) {
      actions.fail(r);
      return;
    }
    await load(g.id);
  }

  return (
    <SideSheet
      id="group-detail-sheet"
      side="right"
      mode={narrow ? "fullscreen" : "overlay"}
      width={520}
      open={open}
      onClose={onClose}
      title={g?.name ?? "Loading…"}
      description={g ? `${g.kind === "TEAM" ? "Team" : "Department"}${g.parentName ? ` in ${g.parentName}` : ""}` : undefined}
    >
      {error ? (
        <ErrorState what={`this ${noun}`} description={error} onRetry={groupId != null ? () => void load(groupId) : undefined} />
      ) : !g || !detail ? (
        <div className="flex flex-col gap-3 p-1" aria-label="Loading">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : (
        <div className="flex flex-col gap-6 p-1" data-group-detail={g.id}>
          <div className="flex items-center gap-3">
            <GroupTile icon={g.icon} color={g.color} size={52} />
            <div className="min-w-0 flex-1">
              {canManage ? (
                <Input
                  aria-label={`${g.kind === "TEAM" ? "Team" : "Department"} name`}
                  value={name}
                  maxLength={80}
                  onChange={(e) => setName(e.target.value)}
                  onBlur={() => void rename()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                    if (e.key === "Escape") setName(g.name);
                  }}
                  className="text-[16px] font-bold"
                />
              ) : (
                <div className="truncate text-[18px] font-bold text-ink">{g.name}</div>
              )}
              <div className="mt-1 flex items-center gap-2 text-[12.5px] text-muted">
                <GroupStatus status={g.status} />
                <span>
                  {plural(g.activeCount, "employee")}
                  {g.kind === "DEPARTMENT" && g.teamCount != null ? ` · ${plural(g.teamCount, "team")}` : ""}
                </span>
              </div>
            </div>
          </div>

          <section aria-label="Lead" className="flex flex-col gap-2">
            <h3 className="text-[13px] font-semibold text-ink">{g.kind === "TEAM" ? "Team lead" : "Department lead"}</h3>
            {g.lead ? (
              <div className="flex items-center gap-2.5 rounded-xl border border-line px-3 py-2">
                <MemberAvatar name={g.lead.name} size={32} />
                <div className="min-w-0 flex-1 leading-tight">
                  <div className="truncate text-[13.5px] font-semibold text-ink">{g.lead.name}</div>
                  {g.lead.roleName && <div className="truncate text-[12px] text-muted">{g.lead.roleName}</div>}
                </div>
                {canManage && (
                  <Tooltip content="Remove the lead">
                    <IconButton aria-label="Remove lead" onClick={() => void change({ clearLead: true }, "Lead removed", { leadMemberId: g.lead!.memberId })}>
                      <XIcon size={16} />
                    </IconButton>
                  </Tooltip>
                )}
              </div>
            ) : (
              <p className="text-[13px] text-muted">No lead yet.</p>
            )}
            {canManage && (
              <PersonSearch
                orgId={orgId}
                label="Change lead"
                placeholder={g.lead ? "Change lead" : "Pick a lead"}
                onPick={(p) => void change({ leadMemberId: p.memberId }, `${p.name} now leads ${g.name}`, g.lead ? { leadMemberId: g.lead.memberId } : { clearLead: true })}
              />
            )}
          </section>

          {canManage && g.kind === "TEAM" && (
            <section aria-label="Department" className="flex flex-col gap-2">
              <h3 className="text-[13px] font-semibold text-ink">Move under</h3>
              <Select
                aria-label="Department of this team"
                value={g.parentGroupId == null ? "" : String(g.parentGroupId)}
                onChange={(v) => {
                  const old = g.parentGroupId;
                  const nextName = departments.find((d) => String(d.id) === v)?.name;
                  void change(v === "" ? { clearParent: true } : { parentGroupId: Number(v) }, v === "" ? `${g.name} has no department now` : `${g.name} moved under ${nextName}`, old == null ? { clearParent: true } : { parentGroupId: old });
                }}
                options={[{ value: "", label: "No department" }, ...departments.filter((d) => d.status === "ACTIVE").map((d) => ({ value: String(d.id), label: d.name }))]}
              />
              <p className="text-[12px] text-muted">The team&apos;s people move to the new department with it.</p>
            </section>
          )}

          {canManage && (
            <section aria-label="Look" className="flex flex-col gap-2">
              <h3 className="text-[13px] font-semibold text-ink">Look</h3>
              <LookPicker
                icon={g.icon}
                color={g.color}
                onIcon={(v) => void change({ icon: v }, "Icon changed", g.icon ? { icon: g.icon } : undefined)}
                onColor={(v) => void change({ color: v }, "Color changed", g.color ? { color: g.color } : undefined)}
              />
            </section>
          )}

          {canManage && (
            <section aria-label="Archive and delete" className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => void change({ status: g.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" }, g.status === "ACTIVE" ? `${g.name} archived` : `${g.name} restored`, { status: g.status })}
              >
                {g.status === "ACTIVE" ? "Archive" : "Restore"}
              </Button>
              <Tooltip content={isEmpty ? `Delete ${g.name}` : `Move the ${detail.membersTotal ? plural(detail.membersTotal, "person", "people") : plural(detail.teams.length, "team")} out first`}>
                <span>
                  <Button type="button" variant="danger" disabled={!isEmpty} onClick={() => setConfirmDelete(true)}>
                    <TrashIcon size={15} /> Delete
                  </Button>
                </span>
              </Tooltip>
            </section>
          )}

          <section aria-label="People" className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between">
              <h3 className="text-[13px] font-semibold text-ink">People</h3>
              <span className="text-[12px] text-muted">{detail.membersTotal}</span>
            </div>
            {canManage && g.status === "ACTIVE" && (
              <PersonSearch
                orgId={orgId}
                label={`Add people to ${g.name}`}
                placeholder="Add a person by name"
                exclude={detail.members.map((m) => m.memberId)}
                onPick={(p) => {
                  void actions.move(g, [p.memberId], p.name).then(() => load(g.id));
                }}
              />
            )}
            {detail.members.length === 0 ? (
              <p className="rounded-xl bg-paper-2/60 px-3 py-4 text-center text-[13px] text-muted">Nobody is in this {noun} yet.</p>
            ) : (
              <ul aria-label="People in this group" className="divide-y divide-line/60 rounded-xl border border-line">
                {detail.members.map((m) => (
                  <li key={m.memberId} className="flex flex-wrap items-center gap-2.5 px-3 py-2">
                    <MemberAvatar name={m.name} size={32} />
                    <div className="min-w-0 flex-1 leading-tight">
                      <div className="truncate text-[13.5px] font-semibold text-ink">
                        {m.name}
                        {m.lead && <span className="ml-1.5 rounded-full bg-accent-soft px-1.5 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-accent-deep">Lead</span>}
                      </div>
                      <div className="truncate text-[12px] text-muted">
                        {[m.roleName, m.status !== "ACTIVE" ? m.status.toLowerCase() : null, g.kind === "DEPARTMENT" ? m.teamName : null].filter(Boolean).join(" · ") || "Member"}
                      </div>
                    </div>
                    {canManage && (
                      <div className="flex items-center gap-1.5">
                        {targets.length > 0 && (
                          <div className="w-40">
                            <Select aria-label={`Move ${m.name} to`} variant="pill" value="" placeholder="Move to…" onChange={(v) => void moveTo(m, v)} options={targets.map((t) => ({ value: String(t.id), label: t.name }))} />
                          </div>
                        )}
                        <Tooltip content={`Take ${m.name} out of ${g.name}`}>
                          <IconButton aria-label={`Remove ${m.name} from ${g.name}`} onClick={() => void removeFrom(m)}>
                            <XIcon size={16} />
                          </IconButton>
                        </Tooltip>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {detail.membersTotal > detail.members.length && <p className="text-[12px] text-muted">Showing {detail.members.length} of {detail.membersTotal}.</p>}
          </section>

          {g.kind === "DEPARTMENT" && detail.teams.length > 0 && (
            <section aria-label="Teams" className="flex flex-col gap-2">
              <h3 className="text-[13px] font-semibold text-ink">Teams</h3>
              <ul className="flex flex-col gap-1.5">
                {detail.teams.map((t) => (
                  <li key={t.id} className="flex items-center gap-2.5 rounded-xl border border-line px-3 py-2">
                    <GroupTile icon={t.icon} color={t.color} size={32} fallback="users" />
                    <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-ink">{t.name}</span>
                    <span className="text-[12px] text-muted">{plural(t.activeCount, "person", "people")}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <Dialog
            open={confirmDelete}
            onClose={() => setConfirmDelete(false)}
            title={`Delete ${g.name}?`}
            description={`This ${noun} is empty. Deleting it cannot be undone.`}
            footer={
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setConfirmDelete(false)}>
                  Keep it
                </Button>
                <Button
                  type="button"
                  variant="danger"
                  onClick={() => {
                    void actions.remove(g).then((ok) => {
                      setConfirmDelete(false);
                      if (ok) onClose();
                    });
                  }}
                >
                  Delete {noun}
                </Button>
              </div>
            }
          />
        </div>
      )}
    </SideSheet>
  );
}
