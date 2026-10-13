package com.dossier.api.service.ent.members;

import com.dossier.api.domain.User;
import com.dossier.api.domain.enumeration.OrgGroupKind;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.org.OrgGroup;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.ent.OrgMemberDirectoryRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.service.dto.ent.MemberDTO;
import com.dossier.api.service.org.OrgAuditService;
import com.dossier.api.service.org.OrgException;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import com.dossier.api.service.privacy.SensitiveContent;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The single-seat edits of the Employees board (X4.3): the org-set title, the department and team, and the reporting manager. These are
 * also the primitives the bulk calls reuse, so a bulk "move to team" and one sheet edit obey exactly the same rules:
 * <ul>
 *   <li>the department must be a DEPARTMENT and the team a TEAM of THIS organization (a group of another organization is the generic 404);</li>
 *   <li>a team that belongs to a department (its {@code parent_group_id}) must sit in that department: {@code 422 TEAM_NOT_IN_DEPARTMENT};</li>
 *   <li>the manager is an ACTIVE seat of this organization other than the person, and the reporting line never loops: {@code 422 MANAGER_CYCLE}
 *       (the walk up stops after 20 hops, a chain that deep counts as a loop);</li>
 *   <li>one audit row per changed seat; a request that changes nothing writes none.</li>
 * </ul>
 * The caller needs {@code members.group.set} (title, department, team) or {@code members.manager.set} (manager) at a scope covering the person.
 */
@Service
public class OrgMemberEditService {

    public static final String CODE_TEAM_NOT_IN_DEPARTMENT = "TEAM_NOT_IN_DEPARTMENT";
    public static final String CODE_MANAGER_CYCLE = "MANAGER_CYCLE";
    public static final String CODE_MANAGER_INVALID = "MANAGER_INVALID";
    public static final String CODE_SEAT_STATE = "SEAT_STATE";
    public static final String CODE_PRECONDITION_REQUIRED = "PRECONDITION_REQUIRED";
    public static final String CODE_PRECONDITION_FAILED = "PRECONDITION_FAILED";

    static final int TITLE_MAX = 120;
    static final int MAX_HOPS = 20;
    /** The only keys a single edit accepts: anything else (status, role, orgId...) is refused, never bound. */
    public static final Set<String> EDITABLE = Set.of("title", "departmentGroupId", "teamGroupId", "managerMemberId");

    private static final Set<OrgMemberStatus> EDITABLE_STATES = Set.of(OrgMemberStatus.ACTIVE, OrgMemberStatus.SUSPENDED, OrgMemberStatus.INVITED);

    private final OrgMemberRepository members;
    private final OrgMemberDirectoryRepository directory;
    private final UserRepository users;
    private final MemberAccess access;
    private final OrgAuditService audit;
    private final OrgMemberQueryService query;
    private final ObjectMapper json;

    public OrgMemberEditService(
        OrgMemberRepository members,
        OrgMemberDirectoryRepository directory,
        UserRepository users,
        MemberAccess access,
        OrgAuditService audit,
        OrgMemberQueryService query,
        ObjectMapper json
    ) {
        this.members = members;
        this.directory = directory;
        this.users = users;
        this.access = access;
        this.audit = audit;
        this.query = query;
        this.json = json;
    }

    // ---- single edit -----------------------------------------------------------------------------------------------------------

    /**
     * {@code PATCH /members/{id}}: sets only the keys present in {@code body} (a JSON {@code null} clears). The order of refusals leaks nothing:
     * (1) no people key, a closed organization, another organization's member, a seat out of the caller's scope for a key the body uses: the
     * generic 404; (2) {@code If-Match} missing 428, stale 412; (3) validation 422; (4) state 409.
     */
    @Transactional
    public MemberDTO.Detail edit(OrgMembership me, Long memberId, String ifMatch, Map<String, Object> body) {
        Long orgId = me.orgId();
        OrgMember seat = members.findByOrgIdAndId(orgId, memberId).orElseThrow(OrgNotFoundException::new);
        if (seat.getStatus() == OrgMemberStatus.ERASED) throw new OrgNotFoundException();
        access.requireWritable(me, MemberAccess.KEY_GROUP_SET);
        // the permission wall comes before any look at the body: someone who may edit nothing about this person learns nothing about the body rules
        if (!access.canAct(me, MemberAccess.KEY_GROUP_SET, seat.getId()) && !access.canAct(me, MemberAccess.KEY_MANAGER_SET, seat.getId())) throw new OrgNotFoundException();
        if (body == null || body.isEmpty()) throw OrgException.invalid("body", "name at least one field to change");
        for (String key : body.keySet()) {
            if (!EDITABLE.contains(key)) throw OrgException.invalid(key, "cannot be changed here");
        }
        boolean placement = body.containsKey("title") || body.containsKey("departmentGroupId") || body.containsKey("teamGroupId");
        boolean manager = body.containsKey("managerMemberId");
        if (placement) access.requireAct(me, MemberAccess.KEY_GROUP_SET, seat.getId());
        if (manager) access.requireAct(me, MemberAccess.KEY_MANAGER_SET, seat.getId());
        checkVersion(ifMatch, query.currentVersion(orgId, seat));
        if (!EDITABLE_STATES.contains(seat.getStatus())) {
            throw OrgException.coded(409, CODE_SEAT_STATE, "The member is no longer part of the organization", Map.of());
        }

        // validate everything before writing anything
        boolean titleGiven = body.containsKey("title");
        String title = titleGiven ? cleanTitle(body.get("title")) : null;
        boolean deptGiven = body.containsKey("departmentGroupId");
        boolean teamGiven = body.containsKey("teamGroupId");
        Placement place = placement && (deptGiven || teamGiven)
            ? plan(orgId, seat, deptGiven, id(body.get("departmentGroupId"), "departmentGroupId"), teamGiven, id(body.get("teamGroupId"), "teamGroupId"))
            : null;
        Long newManager = manager ? id(body.get("managerMemberId"), "managerMemberId") : null;
        if (manager && newManager != null) checkManager(orgId, seat, newManager);

        if (titleGiven) applyTitle(me, seat, title);
        if (place != null) applyPlacement(me, seat, place);
        if (manager) applyManager(me, seat, newManager);
        return query.detail(me, seat.getId());
    }

    // ---- primitives (single edit and bulk) ---------------------------------------------------------------------------------------

    /** A validated department/team pair. */
    public record Placement(Long departmentGroupId, Long teamGroupId) {}

    /**
     * The placement the seat will have after the change: a given field replaces the old one (null clears), a field not given keeps it. A team
     * given without a department takes the team's own department. Throws 404 (a group of another organization or none), 422 ORG_INVALID (wrong
     * kind) or 422 TEAM_NOT_IN_DEPARTMENT.
     */
    public Placement plan(Long orgId, OrgMember seat, boolean deptGiven, Long dept, boolean teamGiven, Long team) {
        Long newDept = deptGiven ? dept : seat.getDepartmentGroupId();
        Long newTeam = teamGiven ? team : seat.getTeamGroupId();
        Set<Long> ids = new HashSet<>();
        if (newDept != null) ids.add(newDept);
        if (newTeam != null) ids.add(newTeam);
        Map<Long, OrgGroup> groups = new LinkedHashMap<>();
        if (!ids.isEmpty()) for (OrgGroup g : directory.findGroupsByOrgIdAndIdIn(orgId, ids)) groups.put(g.getId(), g);
        if (newDept != null && !groups.containsKey(newDept)) throw new OrgNotFoundException();
        if (newTeam != null && !groups.containsKey(newTeam)) throw new OrgNotFoundException();
        if (newDept != null && groups.get(newDept).getKind() != OrgGroupKind.DEPARTMENT) throw OrgException.invalid("departmentGroupId", "must be a department");
        if (newTeam != null && groups.get(newTeam).getKind() != OrgGroupKind.TEAM) throw OrgException.invalid("teamGroupId", "must be a team");
        if (newTeam != null) {
            Long parent = groups.get(newTeam).getParentGroupId();
            if (newDept == null && parent != null && !deptGiven) newDept = parent; // a team brings its department along
            else if (parent != null && !parent.equals(newDept)) {
                throw OrgException.coded(422, CODE_TEAM_NOT_IN_DEPARTMENT, "The team does not belong to that department", Map.of("teamGroupId", newTeam, "departmentGroupId", newDept == null ? "none" : newDept));
            } else if (parent == null && newDept != null) {
                throw OrgException.coded(422, CODE_TEAM_NOT_IN_DEPARTMENT, "The team does not belong to that department", Map.of("teamGroupId", newTeam, "departmentGroupId", newDept));
            }
        }
        return new Placement(newDept, newTeam);
    }

    /** Writes the placement and one MEMBER_GROUP audit row; returns what the seat had (for the Undo), or {@code null} when nothing changed. */
    public Map<String, Object> applyPlacement(OrgMembership me, OrgMember seat, Placement p) {
        if (Objects.equals(seat.getDepartmentGroupId(), p.departmentGroupId()) && Objects.equals(seat.getTeamGroupId(), p.teamGroupId())) return null;
        Map<String, Object> before = new LinkedHashMap<>();
        before.put("departmentGroupId", seat.getDepartmentGroupId());
        before.put("teamGroupId", seat.getTeamGroupId());
        seat.setDepartmentGroupId(p.departmentGroupId());
        seat.setTeamGroupId(p.teamGroupId());
        members.saveAndFlush(seat);
        Map<String, Object> details = new LinkedHashMap<>();
        details.put("departmentBefore", before.get("departmentGroupId"));
        details.put("departmentAfter", p.departmentGroupId());
        details.put("teamBefore", before.get("teamGroupId"));
        details.put("teamAfter", p.teamGroupId());
        record(me, MemberAuditActions.MEMBER_GROUP, seat, details, "LOW");
        return before;
    }

    /** Throws 404 (not an ACTIVE seat of this organization), 422 MANAGER_INVALID, 422 MANAGER_CYCLE. */
    public void checkManager(Long orgId, OrgMember seat, Long managerId) {
        if (managerId.equals(seat.getId())) throw OrgException.coded(422, CODE_MANAGER_CYCLE, "A person cannot report to themselves", Map.of());
        OrgMember manager = members.findByOrgIdAndId(orgId, managerId).orElseThrow(OrgNotFoundException::new);
        if (manager.getStatus() == OrgMemberStatus.ERASED) throw new OrgNotFoundException();
        if (manager.getStatus() != OrgMemberStatus.ACTIVE) {
            throw OrgException.coded(422, CODE_MANAGER_INVALID, "A manager must be an active member", Map.of("managerMemberId", managerId));
        }
        Long cursor = manager.getManagerMemberId();
        int hops = 0;
        while (cursor != null) {
            if (cursor.equals(seat.getId()) || ++hops > MAX_HOPS) {
                throw OrgException.coded(422, CODE_MANAGER_CYCLE, "That would make the reporting line loop", Map.of("managerMemberId", managerId));
            }
            final Long at = cursor;
            cursor = members.findByOrgIdAndId(orgId, at).map(OrgMember::getManagerMemberId).orElse(null);
        }
    }

    /** Writes the manager (null clears) and one MEMBER_MANAGER audit row; returns the previous manager map, or {@code null} when nothing changed. */
    public Map<String, Object> applyManager(OrgMembership me, OrgMember seat, Long managerId) {
        if (Objects.equals(seat.getManagerMemberId(), managerId)) return null;
        Map<String, Object> before = new LinkedHashMap<>();
        before.put("managerMemberId", seat.getManagerMemberId());
        seat.setManagerMemberId(managerId);
        members.saveAndFlush(seat);
        Map<String, Object> details = new LinkedHashMap<>();
        details.put("before", before.get("managerMemberId"));
        details.put("after", managerId);
        record(me, MemberAuditActions.MEMBER_MANAGER, seat, details, "LOW");
        return before;
    }

    private void applyTitle(OrgMembership me, OrgMember seat, String title) {
        if (Objects.equals(seat.getTitle(), title)) return;
        String before = seat.getTitle();
        seat.setTitle(title);
        members.saveAndFlush(seat);
        Map<String, Object> details = new LinkedHashMap<>();
        details.put("field", "title");
        details.put("before", before);
        details.put("after", title);
        record(me, MemberAuditActions.MEMBER_UPDATE, seat, details, "LOW");
    }

    // ---- validation -------------------------------------------------------------------------------------------------------------

    static String cleanTitle(Object raw) {
        if (raw == null) return null;
        if (!(raw instanceof String s)) throw OrgException.invalid("title", "must be text");
        String t = s.strip().replaceAll("\\s+", " ");
        if (t.isEmpty()) return null;
        if (t.length() > TITLE_MAX) throw OrgException.invalid("title", "at most " + TITLE_MAX + " characters");
        if (t.chars().anyMatch(Character::isISOControl) || t.indexOf('<') >= 0 || t.indexOf('>') >= 0) throw OrgException.invalid("title", "contains characters that are not allowed");
        SensitiveContent.check("title", "title", t);
        return t;
    }

    /** A numeric id, or null. A JSON number only: text, booleans and objects are refused (a path/body type mix-up is never coerced). */
    static Long id(Object raw, String field) {
        if (raw == null) return null;
        if (raw instanceof Integer || raw instanceof Long || raw instanceof Short) {
            long v = ((Number) raw).longValue();
            if (v <= 0) throw OrgException.invalid(field, "must be an id");
            return v;
        }
        throw OrgException.invalid(field, "must be an id or null");
    }

    private static void checkVersion(String header, String current) {
        if (header == null || header.isBlank()) {
            throw OrgException.coded(428, CODE_PRECONDITION_REQUIRED, "Send the version you loaded in an If-Match header", Map.of());
        }
        if (!normalise(header).equals(normalise(current))) {
            throw OrgException.coded(412, CODE_PRECONDITION_FAILED, "The member changed since you loaded it", Map.of("currentVersion", current));
        }
    }

    private static String normalise(String etag) {
        String v = etag.strip();
        if (v.startsWith("W/")) v = v.substring(2);
        return v.replace("\"", "");
    }

    // ---- audit ------------------------------------------------------------------------------------------------------------------

    void record(OrgMembership me, String action, OrgMember seat, Map<String, Object> details, String risk) {
        String text;
        try {
            text = json.writeValueAsString(details);
        } catch (JsonProcessingException e) {
            text = String.valueOf(details);
        }
        audit.record(me.orgId(), me.login(), me.role(), action, OrgAuditService.TARGET_MEMBER, loginOf(seat), String.valueOf(seat.getId()), text, null, null, null, risk);
    }

    String loginOf(OrgMember seat) {
        return seat.getUserId() == null ? null : users.findById(seat.getUserId()).map(User::getLogin).orElse(null);
    }

    /** The names of the live roles of this seat (for audit and previews). */
    List<String> roleKeys(Long orgId, OrgMember seat) {
        List<String> out = new ArrayList<>();
        for (Object[] r : directory.findLiveRolesForMembers(orgId, List.of(seat.getId()))) out.add((String) r[2]);
        return out;
    }

    Optional<OrgMember> find(Long orgId, Long id) {
        return id == null ? Optional.empty() : members.findByOrgIdAndId(orgId, id);
    }
}
