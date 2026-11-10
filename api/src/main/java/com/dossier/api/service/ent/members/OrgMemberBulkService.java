package com.dossier.api.service.ent.members;

import com.dossier.api.domain.ent.OrgMemberRole;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.PermissionScope;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.repository.ent.OrgMemberRoleRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.service.dto.ent.MemberActionDTO;
import com.dossier.api.service.dto.ent.RoleWriteDTO;
import com.dossier.api.service.ent.OrgRoleService;
import com.dossier.api.service.ent.OrgRoleWriteService;
import com.dossier.api.service.org.OrgAuditService;
import com.dossier.api.service.org.OrgException;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import org.springframework.stereotype.Service;

/**
 * Bulk people actions with per-row results (X4.3, 15-employees-and-teams.md section 3.2). One call names up to {@value MemberActionDTO#BULK_MAX}
 * members; each member is its own unit: a row that is refused (out of the caller's scope, the last administrator, the caller themselves,
 * a ceiling, a loop in the reporting line) is skipped with a machine reason and the others still go ahead. The result lists every member, and
 * for every changed one the {@code previous} values the web needs to send the reverse call as its Undo.
 *
 * <p>Each row validates everything before it writes anything (and the role write is called without a transaction boundary of its own, so a refusal
 * never marks the surrounding transaction rollback-only), so a refused row leaves no half-written state, and the whole call is one transaction with
 * its idempotency record. Audit: the action's own row per changed member (ROLE_ASSIGN/ROLE_REVOKE, MEMBER_GROUP,
 * MEMBER_MANAGER, MEMBER_SUSPEND, MEMBER_REINSTATE) plus one {@code MEMBER_BULK} summary row. Skipped members write nothing but appear in the
 * summary's counts. A member of another organization, or one the caller may not reach, is reported as {@code NOT_FOUND}, the same word as a
 * member that does not exist, so a bulk call is never an existence oracle.
 *
 * <p>The last-administrator guard is evaluated member by member in the order given: demoting two administrators when only those two exist
 * changes the first and skips the second, so the organization always keeps one.
 */
@Service
public class OrgMemberBulkService {

    public static final String REASON_NOT_FOUND = "NOT_FOUND";
    public static final String REASON_SELF = "SELF";
    public static final String ACTION_ROLES = "ROLES";
    public static final String ACTION_GROUPS = "GROUPS";
    public static final String ACTION_MANAGER = "MANAGER";
    public static final String ACTION_SUSPEND = "SUSPEND";
    public static final String ACTION_REINSTATE = "REINSTATE";

    private final OrgMemberRepository members;
    private final OrgMemberRoleRepository memberRoles;
    private final OrgRoleService roleRead;
    private final OrgRoleWriteService roleWrite;
    private final OrgMemberEditService edit;
    private final OrgMemberLifecycleService lifecycle;
    private final MemberAccess access;
    private final OrgAuditService audit;
    private final ObjectMapper json;

    @PersistenceContext
    private EntityManager em;

    public OrgMemberBulkService(
        OrgMemberRepository members,
        OrgMemberRoleRepository memberRoles,
        OrgRoleService roleRead,
        OrgRoleWriteService roleWrite,
        OrgMemberEditService edit,
        OrgMemberLifecycleService lifecycle,
        MemberAccess access,
        OrgAuditService audit,
        ObjectMapper json
    ) {
        this.members = members;
        this.memberRoles = memberRoles;
        this.roleRead = roleRead;
        this.roleWrite = roleWrite;
        this.edit = edit;
        this.lifecycle = lifecycle;
        this.access = access;
        this.audit = audit;
        this.json = json;
    }

    /** What one row's operation does: returns the previous values when it changed the seat, or {@code null} when it was already as asked. */
    @FunctionalInterface
    private interface RowOp {
        Map<String, Object> apply(OrgMember seat);
    }

    // ---- roles ---------------------------------------------------------------------------------------------------------------

    /** Adds and removes roles on every named member, keeping each member's primary role when it survives. Needs {@code members.role.set} at ORG scope. */
    public MemberActionDTO.BulkResult roles(OrgMembership me, MemberActionDTO.BulkRolesRequest req) {
        gate(me, ACTION_ROLES);
        if (req == null) throw OrgException.invalid("body", "is required");
        List<Long> ids = cleanIds(req.memberIds());
        List<Long> add = cleanRoleIds("add", req.add());
        List<Long> remove = cleanRoleIds("remove", req.remove());
        if (add.isEmpty() && remove.isEmpty() && req.primaryRoleId() == null) throw OrgException.invalid("add", "name roles to add, roles to remove or a primary role");
        for (Long r : add) if (remove.contains(r)) throw OrgException.invalid("remove", "lists a role that is also being added");
        if (req.primaryRoleId() != null && remove.contains(req.primaryRoleId())) throw OrgException.invalid("primaryRoleId", "cannot be a role being removed");
        return run(me, ACTION_ROLES, ids, MemberAccess.KEY_ROLE_SET, seat -> {
            if (seat.getId().equals(me.memberId())) throw OrgException.coded(422, OrgRoleWriteService.CODE_ROLE_CEILING, "You cannot change your own roles", Map.of("reason", REASON_SELF));
            List<OrgMemberRole> live = memberRoles.findLiveByOrgIdAndMemberId(me.orgId(), seat.getId());
            LinkedHashSet<Long> after = new LinkedHashSet<>();
            Long currentPrimary = null;
            for (OrgMemberRole r : live) {
                after.add(r.getRoleId());
                if (r.isPrimary()) currentPrimary = r.getRoleId();
            }
            Set<Long> before = new LinkedHashSet<>(after);
            after.addAll(add);
            after.removeAll(remove);
            if (after.isEmpty()) throw OrgException.invalid("roleIds", "a member keeps at least one role");
            Long primary = req.primaryRoleId() != null ? req.primaryRoleId() : after.contains(currentPrimary) ? currentPrimary : after.iterator().next();
            if (!after.contains(primary)) throw OrgException.invalid("primaryRoleId", "must be one of the member's roles");
            if (after.equals(before) && java.util.Objects.equals(primary, currentPrimary)) return null;
            Map<String, Object> previous = new LinkedHashMap<>();
            previous.put("roleIds", new ArrayList<>(before));
            previous.put("primaryRoleId", currentPrimary);
            roleWrite.applyMemberRoles(me, seat.getId(), new RoleWriteDTO.MemberRolesRequest(new ArrayList<>(after), primary));
            return previous;
        });
    }

    // ---- groups --------------------------------------------------------------------------------------------------------------

    /** Sets the same department and team on every named member (a null clears it). Needs {@code members.group.set}. */
    public MemberActionDTO.BulkResult groups(OrgMembership me, MemberActionDTO.BulkGroupsRequest req) {
        gate(me, ACTION_GROUPS);
        if (req == null) throw OrgException.invalid("body", "is required");
        List<Long> ids = cleanIds(req.memberIds());
        return run(me, ACTION_GROUPS, ids, MemberAccess.KEY_GROUP_SET, seat -> {
            requireEditable(seat);
            // a team alone brings its own department; every other combination (department, both, neither) is the placement exactly as given
            boolean deptGiven = req.departmentGroupId() != null || req.teamGroupId() == null;
            OrgMemberEditService.Placement p = edit.plan(me.orgId(), seat, deptGiven, req.departmentGroupId(), true, req.teamGroupId());
            return edit.applyPlacement(me, seat, p);
        });
    }

    // ---- manager -------------------------------------------------------------------------------------------------------------

    /** Sets the same reporting manager on every named member (null clears it). Needs {@code members.manager.set}. */
    public MemberActionDTO.BulkResult manager(OrgMembership me, MemberActionDTO.BulkManagerRequest req) {
        gate(me, ACTION_MANAGER);
        if (req == null) throw OrgException.invalid("body", "is required");
        List<Long> ids = cleanIds(req.memberIds());
        if (req.managerMemberId() != null && req.managerMemberId() <= 0) throw OrgException.invalid("managerMemberId", "must be an id or null");
        return run(me, ACTION_MANAGER, ids, MemberAccess.KEY_MANAGER_SET, seat -> {
            requireEditable(seat);
            if (req.managerMemberId() != null) edit.checkManager(me.orgId(), seat, req.managerMemberId());
            return edit.applyManager(me, seat, req.managerMemberId());
        });
    }

    // ---- status --------------------------------------------------------------------------------------------------------------

    /** Suspends or reinstates every named member. Needs {@code members.suspend}; suspending needs a reason of 10 to 500 characters. */
    public MemberActionDTO.BulkResult status(OrgMembership me, MemberActionDTO.BulkStatusRequest req) {
        gate(me, ACTION_SUSPEND);
        if (req == null) throw OrgException.invalid("body", "is required");
        String action = req.action() == null ? "" : req.action().strip().toUpperCase(Locale.ROOT);
        if (!action.equals(ACTION_SUSPEND) && !action.equals(ACTION_REINSTATE)) throw OrgException.invalid("action", "must be SUSPEND or REINSTATE");
        List<Long> ids = cleanIds(req.memberIds());
        String reason = action.equals(ACTION_SUSPEND) ? OrgMemberLifecycleService.requireReason(req.reason()) : OrgMemberLifecycleService.optionalReason(req.reason());
        return run(me, action, ids, MemberAccess.KEY_SUSPEND, seat -> {
            Map<String, Object> previous = new LinkedHashMap<>();
            previous.put("status", seat.getStatus().name());
            if (action.equals(ACTION_SUSPEND)) lifecycle.suspendSeat(me, seat, reason);
            else lifecycle.reinstateSeat(me, seat, reason);
            return previous;
        });
    }

    /**
     * The permission wall of each bulk action, callable on its own so the endpoint can refuse an unauthorised caller (generic 404) BEFORE it looks at
     * the Idempotency-Key header: a person who may not do this learns nothing, not even that a header is missing. {@code kind} is one of the ACTION_ constants.
     */
    public void gate(OrgMembership me, String kind) {
        switch (kind) {
            case ACTION_ROLES -> {
                access.requireWritable(me, MemberAccess.KEY_ROLE_SET);
                // role writes are data-backed ORG-scope operations (X1.14); a caller who cannot do them at all gets the generic 404, not a page of skipped rows
                if (!me.canKey(MemberAccess.KEY_ROLE_SET) || me.scopeFor(MemberAccess.KEY_ROLE_SET).filter(s -> s == PermissionScope.ORG).isEmpty()) throw new OrgNotFoundException();
                if (!roleRead.rolesFromData(me.orgId()) || me.roles().stream().anyMatch(r -> r.roleId() == null)) throw new OrgNotFoundException();
            }
            case ACTION_GROUPS -> {
                access.requireWritable(me, MemberAccess.KEY_GROUP_SET);
                access.requireScope(me, MemberAccess.KEY_GROUP_SET);
            }
            case ACTION_MANAGER -> {
                access.requireWritable(me, MemberAccess.KEY_MANAGER_SET);
                access.requireScope(me, MemberAccess.KEY_MANAGER_SET);
            }
            default -> {
                access.requireWritable(me, MemberAccess.KEY_SUSPEND);
                access.requireScope(me, MemberAccess.KEY_SUSPEND);
            }
        }
    }

    /**
     * The shape checks of a request body, on their own and with no transaction: the endpoint calls this BEFORE it opens the idempotent transaction,
     * so a malformed body is a plain 422 that leaves nothing half-open (and never marks a surrounding transaction rollback-only). The action methods
     * repeat the same checks, which are cheap, so a caller that skips this still cannot do the wrong thing. {@code kind} is an ACTION_ constant.
     */
    public void validate(String kind, Object body) {
        switch (kind) {
            case ACTION_ROLES -> {
                MemberActionDTO.BulkRolesRequest req = (MemberActionDTO.BulkRolesRequest) required(body);
                cleanIds(req.memberIds());
                List<Long> add = cleanRoleIds("add", req.add());
                List<Long> remove = cleanRoleIds("remove", req.remove());
                if (add.isEmpty() && remove.isEmpty() && req.primaryRoleId() == null) throw OrgException.invalid("add", "name roles to add, roles to remove or a primary role");
                for (Long r : add) if (remove.contains(r)) throw OrgException.invalid("remove", "lists a role that is also being added");
                if (req.primaryRoleId() != null && remove.contains(req.primaryRoleId())) throw OrgException.invalid("primaryRoleId", "cannot be a role being removed");
            }
            case ACTION_GROUPS -> cleanIds(((MemberActionDTO.BulkGroupsRequest) required(body)).memberIds());
            case ACTION_MANAGER -> {
                MemberActionDTO.BulkManagerRequest req = (MemberActionDTO.BulkManagerRequest) required(body);
                cleanIds(req.memberIds());
                if (req.managerMemberId() != null && req.managerMemberId() <= 0) throw OrgException.invalid("managerMemberId", "must be an id or null");
            }
            default -> {
                MemberActionDTO.BulkStatusRequest req = (MemberActionDTO.BulkStatusRequest) required(body);
                String action = req.action() == null ? "" : req.action().strip().toUpperCase(Locale.ROOT);
                if (!action.equals(ACTION_SUSPEND) && !action.equals(ACTION_REINSTATE)) throw OrgException.invalid("action", "must be SUSPEND or REINSTATE");
                cleanIds(req.memberIds());
                if (action.equals(ACTION_SUSPEND)) OrgMemberLifecycleService.requireReason(req.reason());
                else OrgMemberLifecycleService.optionalReason(req.reason());
            }
        }
    }

    private static Object required(Object body) {
        if (body == null) throw OrgException.invalid("body", "is required");
        return body;
    }

    // ---- the loop ------------------------------------------------------------------------------------------------------------

    private MemberActionDTO.BulkResult run(OrgMembership me, String action, List<Long> ids, String key, RowOp op) {
        List<MemberActionDTO.RowResult> results = new ArrayList<>();
        List<MemberActionDTO.Skipped> skipped = new ArrayList<>();
        int ok = 0;
        for (Long id : ids) {
            MemberActionDTO.RowResult result = one(me, action, id, key, op);
            results.add(result);
            if (result.ok()) ok++;
            else skipped.add(new MemberActionDTO.Skipped(id, result.reason()));
        }
        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("action", action);
        summary.put("requested", ids.size());
        summary.put("ok", ok);
        summary.put("skipped", skipped.size());
        audit.record(
            me.orgId(), me.login(), me.role(), MemberAuditActions.MEMBER_BULK, OrgAuditService.TARGET_MEMBER, null, null, text(summary), null, null, null, "MEDIUM"
        );
        return new MemberActionDTO.BulkResult(action, ids.size(), ok, skipped, results);
    }

    private MemberActionDTO.RowResult one(OrgMembership me, String action, Long id, String key, RowOp op) {
        try {
            OrgMember seat = members.findByOrgIdAndId(me.orgId(), id).orElseThrow(OrgNotFoundException::new);
            if (seat.getStatus() == OrgMemberStatus.ERASED || !access.canAct(me, key, seat.getId())) throw new OrgNotFoundException();
            Map<String, Object> previous = op.apply(seat);
            return new MemberActionDTO.RowResult(id, true, previous == null ? "UNCHANGED" : null, previous);
        } catch (OrgException e) {
            // Every operation validates before it writes, so a refused row has changed nothing; dropping the persistence context only discards what the
            // refusal loaded or began to set in memory. Earlier rows were flushed by their own saves.
            em.clear();
            String reason = reasonOf(e);
            recordSkip(me, action, id, reason);
            return new MemberActionDTO.RowResult(id, false, reason, null);
        }
    }

    /**
     * A refused attempt on a person the caller can reach is itself worth keeping (someone tried to demote the last administrator): one LOW
     * {@code MEMBER_BULK_SKIP} row with the reason. A member the caller cannot reach (NOT_FOUND) writes nothing: there is no honest target to name.
     */
    private void recordSkip(OrgMembership me, String action, Long id, String reason) {
        if (REASON_NOT_FOUND.equals(reason)) return;
        OrgMember seat = members.findByOrgIdAndId(me.orgId(), id).orElse(null);
        if (seat == null) return;
        Map<String, Object> details = new LinkedHashMap<>();
        details.put("action", action);
        details.put("reason", reason);
        audit.record(me.orgId(), me.login(), me.role(), MemberAuditActions.MEMBER_BULK_SKIP, OrgAuditService.TARGET_MEMBER, null, String.valueOf(seat.getId()), text(details), null, null, null, "LOW");
    }

    /** The machine word for a refused row: the exception's own {@code reason} extra when it has one (SELF, ADMIN_ROLE), else its code. */
    static String reasonOf(OrgException e) {
        if (e instanceof OrgNotFoundException) return REASON_NOT_FOUND;
        Object r = e.getExtra().get("reason");
        if (r instanceof String s && !s.isBlank()) return s;
        return e.getCode();
    }

    private static void requireEditable(OrgMember seat) {
        if (seat.getStatus() != OrgMemberStatus.ACTIVE && seat.getStatus() != OrgMemberStatus.SUSPENDED && seat.getStatus() != OrgMemberStatus.INVITED) {
            throw OrgException.coded(409, OrgMemberEditService.CODE_SEAT_STATE, "The member is no longer part of the organization", Map.of());
        }
    }

    // ---- input -------------------------------------------------------------------------------------------------------------

    private static List<Long> cleanIds(List<Long> raw) {
        if (raw == null || raw.isEmpty()) throw OrgException.invalid("memberIds", "name at least one member");
        if (raw.size() > MemberActionDTO.BULK_MAX) throw OrgException.invalid("memberIds", "at most " + MemberActionDTO.BULK_MAX + " members per call");
        LinkedHashSet<Long> ids = new LinkedHashSet<>();
        for (Long id : raw) {
            if (id == null || id <= 0) throw OrgException.invalid("memberIds", "must be member ids");
            ids.add(id); // a repeated id is one member
        }
        return new ArrayList<>(ids);
    }

    private static List<Long> cleanRoleIds(String field, List<Long> raw) {
        if (raw == null) return List.of();
        if (raw.size() > 20) throw OrgException.invalid(field, "at most 20 roles");
        LinkedHashSet<Long> out = new LinkedHashSet<>();
        for (Long id : raw) {
            if (id == null || id <= 0) throw OrgException.invalid(field, "must be role ids");
            out.add(id);
        }
        return new ArrayList<>(out);
    }

    private String text(Object o) {
        try {
            return json.writeValueAsString(o);
        } catch (JsonProcessingException e) {
            return String.valueOf(o);
        }
    }
}
