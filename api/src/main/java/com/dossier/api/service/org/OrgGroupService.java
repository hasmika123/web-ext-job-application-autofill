package com.dossier.api.service.org;

import com.dossier.api.domain.enumeration.OrgGroupKind;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.domain.enumeration.PermissionScope;
import com.dossier.api.domain.org.OrgGroup;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.repository.org.OrgGroupRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.service.ResumeBuilderSettingKeys;
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.dto.org.OrgGroupDTO;
import com.dossier.api.service.dto.org.OrgGroupRequest;
import com.dossier.api.service.dto.org.OrgGroupViews;
import com.dossier.api.service.ent.authz.ScopeEvaluator;
import com.dossier.api.service.privacy.SensitiveContent;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Departments, cohorts and teams of one org (tenant-model.md section 2.3; Enterprise V2 X4.5, 15-employees-and-teams.md section 6): a
 * unique name per org, a two-level tree (a TEAM may sit under one DEPARTMENT), a lead per group, and members that move between
 * groups. Every call is scoped by the {@link OrgMembership} the access check produced, never by a bare group id: a group id from
 * another org is a 404, and so is a group the caller may not see. Every mutation writes one audit row.
 *
 * <p>The order of refusals leaks nothing: (1) a closed organization is read-only (409), (2) a group, parent, lead or member of
 * another organization, or one the caller may not see, is the generic 404 or, for a reference in a body, the same 422 whether it
 * exists elsewhere or not, (3) {@code If-Match} (428 missing / 412 stale; required inside the Enterprise flag, honoured when sent
 * elsewhere), (4) validation 422, (5) state conflicts 409 ({@code GROUP_NOT_EMPTY}).
 *
 * <p>Deleting a group outside the Enterprise flag detaches its members (the foreign keys null their {@code group_id}) exactly as
 * before; inside it a department or team must be empty first. It never removes a person.
 */
@Service
public class OrgGroupService {

    public static final String GROUP_MOVE = OrgAuditService.GROUP_MOVE;
    public static final String GROUP_LEAD = OrgAuditService.GROUP_LEAD;

    public static final String CODE_GROUP_NOT_EMPTY = "GROUP_NOT_EMPTY";
    public static final String CODE_LEAD_NOT_ACTIVE = "LEAD_NOT_ACTIVE";
    public static final String CODE_GROUP_PARENT_INVALID = "GROUP_PARENT_INVALID";
    public static final String CODE_GROUP_INACTIVE = "GROUP_INACTIVE";
    public static final String CODE_PRECONDITION_REQUIRED = "PRECONDITION_REQUIRED";
    public static final String CODE_PRECONDITION_FAILED = "PRECONDITION_FAILED";

    static final int NAME_MAX = 80;
    static final int SORT_MAX = 9999;
    static final int MOVE_MAX = 500;

    /** The closed pickers of the Departments and Teams pages. */
    public static final Set<String> ICONS = Set.of("briefcase", "users", "building", "chart", "heart", "rocket", "globe", "shield", "graduation", "dollar", "lightbulb", "handshake");
    public static final Set<String> COLORS = Set.of("primary", "secondary", "success", "info", "warning", "danger", "neutral");
    public static final Set<String> STATUSES = Set.of("ACTIVE", "INACTIVE");

    private final OrgGroupRepository groups;
    private final OrgMemberRepository members;
    private final OrgAuditService audit;
    private final ResumeBuilderSettings settings;
    private final OrgGroupSnapshot snapshot;
    private final OrgGroupAccess access;
    private final ScopeEvaluator scopes;

    public OrgGroupService(
        OrgGroupRepository groups,
        OrgMemberRepository members,
        OrgAuditService audit,
        ResumeBuilderSettings settings,
        OrgGroupSnapshot snapshot,
        OrgGroupAccess access,
        ScopeEvaluator scopes
    ) {
        this.settings = settings;
        this.groups = groups;
        this.members = members;
        this.audit = audit;
        this.snapshot = snapshot;
        this.access = access;
        this.scopes = scopes;
    }

    /** Every group the caller may see (the original list; the new fields ride along). Inside the Enterprise flag a caller with no read permission gets a 404. */
    @Transactional(readOnly = true)
    public List<OrgGroupDTO> list(OrgMembership me) {
        OrgGroupSnapshot.View view = snapshot.load(me.orgId());
        if (access.readScope(me).isEmpty()) throw new OrgNotFoundException();
        Set<Long> vis = access.visible(me, view);
        List<OrgGroup> gs = view.groups().stream().filter(g -> vis == null || vis.contains(g.getId())).toList();
        return view.cards(gs);
    }

    @Transactional
    public OrgGroupDTO create(OrgMembership me, OrgGroupRequest req) {
        requireOpen(me);
        if (req == null) throw OrgException.invalid("body", "is required");
        OrgGroupSnapshot.View view = snapshot.load(me.orgId());
        String name = cleanName(req.name());
        OrgGroupKind kind = req.kind() == null ? OrgGroupKind.TEAM : req.kind();
        if (groups.existsByOrgIdAndName(me.orgId(), name)) throw OrgException.groupNameTaken(name);
        // Abuse cap (admin setting org.limits.groupsPerOrg), checked after the name so a duplicate still reads as a duplicate.
        int maxGroups = settings.getInt(ResumeBuilderSettingKeys.ORG_LIMIT_GROUPS_PER_ORG);
        if (groups.countByOrgId(me.orgId()) >= maxGroups) throw OrgException.limitReached("groupsPerOrg", maxGroups);

        Long parentId = null;
        if (req.parentGroupId() != null) {
            parentId = validParent(view, kind, req.parentGroupId(), null);
        } else if (isTrue(req.clearParent())) {
            // nothing to clear on a new group
        }
        requireManageFor(me, view, kind, parentId, null);
        Long leadId = null;
        if (req.leadMemberId() != null) {
            if (kind == OrgGroupKind.COHORT) throw parentInvalid("leadMemberId", "A cohort has no lead");
            leadId = validLead(me.orgId(), req.leadMemberId());
        }

        OrgGroup g = new OrgGroup();
        g.setOrgId(me.orgId());
        g.setName(name);
        g.setKind(kind);
        g.setParentGroupId(parentId);
        g.setLeadMemberId(leadId);
        g.setSortOrder(req.sortOrder() == null ? (int) Math.min(SORT_MAX, groups.countByOrgId(me.orgId())) : cleanSort(req.sortOrder()));
        if (req.status() != null) g.setStatus(cleanStatus(req.status()));
        if (req.icon() != null) g.setIcon(cleanIcon(req.icon()));
        if (req.color() != null) g.setColor(cleanColor(req.color()));
        try {
            g = groups.saveAndFlush(g);
        } catch (DataIntegrityViolationException e) { // lost a race for the same name
            throw OrgException.groupNameTaken(name);
        }
        String details = "name=" + name + " kind=" + g.getKind() + (parentId == null ? "" : " parent=" + parentId) + (leadId == null ? "" : " lead=" + leadId);
        record(me, OrgAuditService.GROUP_CREATE, g.getId(), details, "LOW");
        return snapshot.load(me.orgId()).card(g);
    }

    @Transactional
    public OrgGroupDTO update(OrgMembership me, Long groupId, String ifMatch, OrgGroupRequest req) {
        requireOpen(me);
        if (req == null) throw OrgException.invalid("body", "is required");
        OrgGroupSnapshot.View view = snapshot.load(me.orgId());
        OrgGroup g = visibleGroup(me, view, groupId);
        requireManageFor(me, view, g.getKind(), g.getParentGroupId(), g);
        checkVersion(me, ifMatch, g);

        StringBuilder changed = new StringBuilder();
        if (req.name() != null) {
            String name = cleanName(req.name());
            if (!name.equals(g.getName())) {
                // a case-only rename is the same row under the case-insensitive unique key, so it is not a clash
                if (!name.equalsIgnoreCase(g.getName()) && groups.existsByOrgIdAndName(me.orgId(), name)) throw OrgException.groupNameTaken(name);
                g.setName(name);
                changed.append("name,");
            }
        }
        if (req.kind() != null && req.kind() != g.getKind()) {
            changeKind(me, view, g, req.kind());
            changed.append("kind,");
        }
        if (req.sortOrder() != null && req.sortOrder() != g.getSortOrder()) {
            g.setSortOrder(cleanSort(req.sortOrder()));
            changed.append("sortOrder,");
        }
        if (req.status() != null && !cleanStatus(req.status()).equals(g.getStatus())) {
            g.setStatus(cleanStatus(req.status()));
            changed.append("status,");
        }
        if (req.icon() != null && !cleanIcon(req.icon()).equals(g.getIcon())) {
            g.setIcon(cleanIcon(req.icon()));
            changed.append("icon,");
        }
        if (req.color() != null && !cleanColor(req.color()).equals(g.getColor())) {
            g.setColor(cleanColor(req.color()));
            changed.append("color,");
        }

        // moving a team under another department (or out of its department): its members' department follows in this same transaction
        Long oldParent = g.getParentGroupId();
        Long newParent = oldParent;
        boolean parentTouched = false;
        if (isTrue(req.clearParent())) {
            if (oldParent != null) {
                newParent = null;
                parentTouched = true;
            }
        } else if (req.parentGroupId() != null && !req.parentGroupId().equals(oldParent)) {
            newParent = validParent(view, g.getKind(), req.parentGroupId(), g);
            requireManageFor(me, view, g.getKind(), newParent, null);
            parentTouched = true;
        } else if (req.parentGroupId() != null) {
            validParent(view, g.getKind(), req.parentGroupId(), g); // same parent: still must be valid, changes nothing
        }

        Long oldLead = g.getLeadMemberId();
        Long newLead = oldLead;
        if (isTrue(req.clearLead())) {
            newLead = null;
        } else if (req.leadMemberId() != null) {
            if (g.getKind() == OrgGroupKind.COHORT) throw parentInvalid("leadMemberId", "A cohort has no lead");
            newLead = req.leadMemberId().equals(oldLead) ? oldLead : validLead(me.orgId(), req.leadMemberId());
        }
        boolean leadTouched = !java.util.Objects.equals(oldLead, newLead);

        int repointed = 0;
        if (parentTouched) {
            g.setParentGroupId(newParent);
            repointed = repointTeamMembers(me.orgId(), view, g, oldParent, newParent);
        }
        if (leadTouched) g.setLeadMemberId(newLead);

        if (changed.length() > 0 || parentTouched || leadTouched) {
            try {
                g = groups.saveAndFlush(g);
            } catch (DataIntegrityViolationException e) {
                throw OrgException.groupNameTaken(g.getName());
            }
        }
        if (changed.length() > 0) {
            record(me, OrgAuditService.GROUP_UPDATE, g.getId(), "fields=" + changed.substring(0, changed.length() - 1), "LOW");
        }
        if (parentTouched) {
            record(me, GROUP_MOVE, g.getId(), "parent=" + oldParent + "->" + newParent + " members=" + repointed, "LOW");
        }
        if (leadTouched) {
            record(me, GROUP_LEAD, g.getId(), "lead=" + oldLead + "->" + newLead, "MEDIUM");
        }
        return snapshot.load(me.orgId()).card(g);
    }

    @Transactional
    public void delete(OrgMembership me, Long groupId, String ifMatch) {
        requireOpen(me);
        OrgGroupSnapshot.View view = snapshot.load(me.orgId());
        OrgGroup g = visibleGroup(me, view, groupId);
        requireManageFor(me, view, g.getKind(), g.getParentGroupId(), g);
        checkVersion(me, ifMatch, g);
        long placed = view.seatsIn(g).size();
        long teams = groups.countByOrgIdAndParentGroupId(me.orgId(), g.getId());
        if (teams > 0 || (placed > 0 && access.enterprise(me.orgId()))) {
            throw OrgException.coded(
                409, CODE_GROUP_NOT_EMPTY, "Move the people and teams out of " + g.getName() + " first",
                Map.of("count", placed + teams, "members", placed, "teams", teams)
            );
        }
        groups.deleteByOrgIdAndId(me.orgId(), g.getId());
        record(me, OrgAuditService.GROUP_DELETE, g.getId(), "name=" + g.getName() + " members=" + placed, "MEDIUM");
    }

    /**
     * Puts these members in the group ({@code POST /groups/{id}/members}). Returns one row per requested id: MOVED, UNCHANGED, or
     * SKIPPED with {@code NOT_FOUND} (not a live seat of this organization, or not one the caller may touch: the same code either
     * way). A TEAM move also sets the department the team sits under; a DEPARTMENT move drops a team that belongs to another
     * department. Nothing here changes a role, a seat's state or anyone's consent.
     */
    @Transactional
    public OrgGroupViews.MoveResult moveMembers(OrgMembership me, Long groupId, OrgGroupViews.MoveRequest req) {
        requireOpen(me);
        OrgGroupSnapshot.View view = snapshot.load(me.orgId());
        OrgGroup g = visibleGroup(me, view, groupId);
        requireManageFor(me, view, g.getKind(), g.getParentGroupId(), g);
        if (req == null || req.memberIds() == null || req.memberIds().isEmpty()) throw OrgException.invalid("memberIds", "is required");
        if (req.memberIds().size() > MOVE_MAX) throw OrgException.invalid("memberIds", "at most " + MOVE_MAX + " people at a time");
        if ("INACTIVE".equals(g.getStatus())) throw OrgException.coded(409, CODE_GROUP_INACTIVE, g.getName() + " is inactive", Map.of());

        Set<Long> ids = new LinkedHashSet<>();
        for (Long id : req.memberIds()) if (id != null) ids.add(id);
        Map<Long, OrgMember> seats = members.findByOrgIdAndIdIn(me.orgId(), ids).stream().collect(Collectors.toMap(OrgMember::getId, m -> m, (a, b) -> a));
        PermissionScope scope = access.manageScope(me).orElse(PermissionScope.ORG);
        List<OrgGroupViews.Row> rows = new ArrayList<>();
        List<Long> movedIds = new ArrayList<>();
        int moved = 0;
        int unchanged = 0;
        int skipped = 0;
        for (Long id : ids) {
            OrgMember m = seats.get(id);
            if (m == null || !OrgMemberStatus.LIVE.contains(m.getStatus()) || !(scope == PermissionScope.ORG || scopes.inScope(me, scope, id))) {
                rows.add(new OrgGroupViews.Row(id, "SKIPPED", "NOT_FOUND"));
                skipped++;
                continue;
            }
            if (place(m, g, view)) {
                members.saveAndFlush(m);
                rows.add(new OrgGroupViews.Row(id, "MOVED", null));
                movedIds.add(id);
                moved++;
            } else {
                rows.add(new OrgGroupViews.Row(id, "UNCHANGED", null));
                unchanged++;
            }
        }
        if (moved > 0) {
            record(me, GROUP_MOVE, g.getId(), "to=" + g.getName() + " moved=" + moved + " ids=" + movedIds.stream().limit(50).map(String::valueOf).collect(Collectors.joining(",")), "LOW");
        }
        return new OrgGroupViews.MoveResult(g.getId(), moved, unchanged, skipped, rows);
    }

    /** Takes one person out of the group (the "no team" move). A no-op when they are not in it. */
    @Transactional
    public void removeMember(OrgMembership me, Long groupId, Long memberId) {
        requireOpen(me);
        OrgGroupSnapshot.View view = snapshot.load(me.orgId());
        OrgGroup g = visibleGroup(me, view, groupId);
        requireManageFor(me, view, g.getKind(), g.getParentGroupId(), g);
        OrgMember m = memberId == null ? null : members.findByOrgIdAndId(me.orgId(), memberId).orElse(null);
        PermissionScope scope = access.manageScope(me).orElse(PermissionScope.ORG);
        if (m == null || !OrgMemberStatus.LIVE.contains(m.getStatus()) || !(scope == PermissionScope.ORG || scopes.inScope(me, scope, memberId))) throw new OrgNotFoundException();
        if (unplace(m, g, view)) {
            members.saveAndFlush(m);
            record(me, GROUP_MOVE, g.getId(), "from=" + g.getName() + " removed=" + memberId, "LOW");
        }
    }

    // ---- placement ----------------------------------------------------------------------------------------------

    /** Applies the move to the seat; false when it already sits there. */
    private boolean place(OrgMember m, OrgGroup g, OrgGroupSnapshot.View view) {
        OrgGroupSnapshot.Seat before = view.seat(m.getId());
        boolean changed = false;
        switch (g.getKind()) {
            case TEAM -> {
                if (!g.getId().equals(m.getTeamGroupId())) {
                    m.setTeamGroupId(g.getId());
                    changed = true;
                }
                if (g.getParentGroupId() != null && !g.getParentGroupId().equals(m.getDepartmentGroupId())) {
                    m.setDepartmentGroupId(g.getParentGroupId());
                    changed = true;
                }
            }
            case DEPARTMENT -> {
                if (!g.getId().equals(m.getDepartmentGroupId())) {
                    m.setDepartmentGroupId(g.getId());
                    changed = true;
                }
                OrgGroup team = view.group(m.getTeamGroupId());
                if (team != null && !g.getId().equals(team.getParentGroupId())) {
                    m.setTeamGroupId(null); // their team belongs to another department
                    changed = true;
                }
            }
            case COHORT -> {
                if (!g.getId().equals(m.getGroupId())) {
                    m.setGroupId(g.getId());
                    changed = true;
                }
            }
        }
        if (g.getKind() != OrgGroupKind.COHORT && m.getGroupId() != null) {
            OrgGroup legacy = view.group(m.getGroupId());
            if (legacy != null && legacy.getKind() != OrgGroupKind.COHORT) {
                m.setGroupId(null); // the old single link is replaced by the two real ones
                changed = true;
            }
        }
        if (!changed && before != null && view.placedIn(before, g)) return false;
        return changed;
    }

    private boolean unplace(OrgMember m, OrgGroup g, OrgGroupSnapshot.View view) {
        boolean changed = false;
        switch (g.getKind()) {
            case TEAM -> {
                if (g.getId().equals(m.getTeamGroupId())) {
                    m.setTeamGroupId(null);
                    changed = true;
                }
            }
            case DEPARTMENT -> {
                if (g.getId().equals(m.getDepartmentGroupId())) {
                    m.setDepartmentGroupId(null);
                    changed = true;
                }
                OrgGroup team = view.group(m.getTeamGroupId());
                if (team != null && g.getId().equals(team.getParentGroupId())) {
                    m.setTeamGroupId(null);
                    changed = true;
                }
            }
            case COHORT -> {
            }
        }
        if (g.getId().equals(m.getGroupId())) {
            m.setGroupId(null);
            changed = true;
        }
        return changed;
    }

    /** A team's parent changed: the team's live members take the new department (null when the team now has none). */
    private int repointTeamMembers(Long orgId, OrgGroupSnapshot.View view, OrgGroup team, Long oldParent, Long newParent) {
        if (team.getKind() != OrgGroupKind.TEAM) return 0;
        List<Long> ids = view.seatsIn(team).stream().map(OrgGroupSnapshot.Seat::id).toList();
        if (ids.isEmpty()) return 0;
        int n = 0;
        for (OrgMember m : members.findByOrgIdAndIdIn(orgId, ids)) {
            if (java.util.Objects.equals(m.getDepartmentGroupId(), newParent)) continue;
            // a department the person was given on their own (neither the old nor an empty one) is left alone
            if (m.getDepartmentGroupId() != null && !m.getDepartmentGroupId().equals(oldParent)) continue;
            m.setDepartmentGroupId(newParent);
            members.saveAndFlush(m);
            n++;
        }
        return n;
    }

    private void changeKind(OrgMembership me, OrgGroupSnapshot.View view, OrgGroup g, OrgGroupKind kind) {
        long placed = view.seatsIn(g).size();
        long teams = groups.countByOrgIdAndParentGroupId(me.orgId(), g.getId());
        if (placed > 0 || teams > 0) {
            throw OrgException.coded(409, CODE_GROUP_NOT_EMPTY, "Move the people and teams out of " + g.getName() + " before changing what it is", Map.of("count", placed + teams));
        }
        if (kind == OrgGroupKind.COHORT && (g.getParentGroupId() != null || g.getLeadMemberId() != null)) {
            throw parentInvalid("kind", "A cohort has no parent and no lead");
        }
        if (kind == OrgGroupKind.DEPARTMENT) g.setParentGroupId(null); // a department is top level
        g.setKind(kind);
    }

    // ---- validation ---------------------------------------------------------------------------------------------

    /** The parent of a TEAM: a DEPARTMENT of this organization. Anything else, including an unknown or foreign id, is the same 422. */
    private Long validParent(OrgGroupSnapshot.View view, OrgGroupKind kind, Long parentId, OrgGroup self) {
        if (kind != OrgGroupKind.TEAM) throw parentInvalid("parentGroupId", "Only a team can sit under a department");
        if (self != null && parentId.equals(self.getId())) throw parentInvalid("parentGroupId", "A group cannot sit under itself");
        OrgGroup parent = view.group(parentId);
        if (parent == null || parent.getKind() != OrgGroupKind.DEPARTMENT) throw parentInvalid("parentGroupId", "Pick a department of this organization");
        return parent.getId();
    }

    /** The lead of a group: an ACTIVE member of this organization. Unknown, foreign and not-active all answer the same 422. */
    private Long validLead(Long orgId, Long memberId) {
        OrgMember m = members.findByOrgIdAndId(orgId, memberId).orElse(null);
        if (m == null || m.getStatus() != OrgMemberStatus.ACTIVE) {
            throw OrgException.coded(422, CODE_LEAD_NOT_ACTIVE, "The lead must be an active member of this organization", Map.of("field", "leadMemberId"));
        }
        return m.getId();
    }

    private static OrgException parentInvalid(String field, String message) {
        return OrgException.coded(422, CODE_GROUP_PARENT_INVALID, message, Map.of("field", field, "message", message));
    }

    // ---- guards and helpers ---------------------------------------------------------------------------------------

    /** The group, or a 404 when it is not this organization's or the caller may not see it. */
    private OrgGroup visibleGroup(OrgMembership me, OrgGroupSnapshot.View view, Long groupId) {
        OrgGroup g = groupId == null ? null : view.group(groupId);
        if (g == null || !access.canSee(me, view, g)) throw new OrgNotFoundException();
        return g;
    }

    /**
     * A caller who holds {@code groups.manage} only below ORG may change just the groups they can see and may not create a top-level
     * department or cohort, nor a team outside a department they can see (404, like everything else they may not touch).
     */
    private void requireManageFor(OrgMembership me, OrgGroupSnapshot.View view, OrgGroupKind kind, Long parentId, OrgGroup existing) {
        PermissionScope scope = access.manageScope(me).orElse(null);
        if (scope == null) throw new OrgNotFoundException();
        if (scope == PermissionScope.ORG || !access.enterprise(me.orgId())) return;
        if (existing != null) return; // visibility was already checked
        if (kind == OrgGroupKind.TEAM && parentId != null) {
            OrgGroup parent = view.group(parentId);
            if (parent != null && access.canSee(me, view, parent)) return;
        }
        throw new OrgNotFoundException();
    }

    private void checkVersion(OrgMembership me, String ifMatch, OrgGroup g) {
        boolean required = access.enterprise(me.orgId());
        if (ifMatch == null || ifMatch.isBlank()) {
            if (required) throw OrgException.coded(428, CODE_PRECONDITION_REQUIRED, "Send the version you loaded in an If-Match header", Map.of());
            return;
        }
        if (!normalise(ifMatch).equals(normalise(OrgGroupSnapshot.etag(g)))) {
            Map<String, Object> extra = new LinkedHashMap<>();
            extra.put("currentVersion", OrgGroupSnapshot.etag(g));
            throw OrgException.coded(412, CODE_PRECONDITION_FAILED, "This group changed since you loaded it", extra);
        }
    }

    private static String normalise(String etag) {
        String v = etag.strip();
        if (v.startsWith("W/")) v = v.substring(2);
        return v.replace("\"", "");
    }

    private void record(OrgMembership me, String action, Long groupId, String details, String risk) {
        audit.record(me.orgId(), me.login(), me.role(), action, OrgAuditService.TARGET_GROUP, null, String.valueOf(groupId), details, null, null, null, risk);
    }

    private static boolean isTrue(Boolean b) {
        return b != null && b;
    }

    private static void requireOpen(OrgMembership me) {
        if (me.orgStatus() == OrgStatus.CLOSED) throw OrgException.notEditable("This organization is closed and read-only");
    }

    static String cleanName(String raw) {
        String name = raw == null ? "" : raw.strip().replaceAll("\\s+", " ");
        if (name.isEmpty()) throw OrgException.invalid("name", "is required");
        if (name.length() > NAME_MAX) throw OrgException.invalid("name", "must be at most " + NAME_MAX + " characters");
        SensitiveContent.check("name", "name", name);
        return name;
    }

    private static int cleanSort(Integer sort) {
        if (sort < 0 || sort > SORT_MAX) throw OrgException.invalid("sortOrder", "must be between 0 and " + SORT_MAX);
        return sort;
    }

    private static String cleanStatus(String s) {
        String v = s.strip().toUpperCase(java.util.Locale.ROOT);
        if (!STATUSES.contains(v)) throw OrgException.invalid("status", "must be ACTIVE or INACTIVE");
        return v;
    }

    private static String cleanIcon(String s) {
        String v = s.strip().toLowerCase(java.util.Locale.ROOT);
        if (!ICONS.contains(v)) throw OrgException.invalid("icon", "is not one of the available icons");
        return v;
    }

    private static String cleanColor(String s) {
        String v = s.strip().toLowerCase(java.util.Locale.ROOT);
        if (!COLORS.contains(v)) throw OrgException.invalid("color", "is not one of the available colours");
        return v;
    }
}
