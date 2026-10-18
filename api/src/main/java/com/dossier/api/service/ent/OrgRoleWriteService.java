package com.dossier.api.service.ent;

import com.dossier.api.service.privacy.SensitiveContent;
import com.dossier.api.domain.ent.OrgMemberRole;
import com.dossier.api.domain.ent.OrgRoleDefinition;
import com.dossier.api.domain.ent.OrgRolePermission;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.PermissionScope;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.ent.OrgMemberRoleRepository;
import com.dossier.api.repository.ent.OrgRolePermissionRepository;
import com.dossier.api.repository.ent.OrgRoleRepository;
import com.dossier.api.repository.org.OrgAuditEventRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.service.dto.ent.RoleDTO;
import com.dossier.api.service.dto.ent.RoleWriteDTO;
import com.dossier.api.service.ent.authz.AuthzOperation;
import com.dossier.api.service.ent.authz.EntPermissions;
import com.dossier.api.service.ent.authz.OrgStateRules;
import com.dossier.api.service.org.OrgAuditService;
import com.dossier.api.service.org.OrgException;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Roles as data, WRITE side (X1.14): create, edit, delete an organization's own roles and give members their roles, all under the
 * <b>ceiling rule</b> of 05-permission-model.md section 3 ({@link RoleCeiling}): nobody can write, hand out or take away anything
 * they do not hold themselves. The read side stays in {@link OrgRoleService}; this class is separate so the invitation stories can
 * keep calling {@code syncFromLegacy} without touching it.
 *
 * <p>The order of refusals is fixed and leaks nothing: (1) the roles flag is off for the organization, the caller lacks the
 * permission at ORG scope, has no data-backed roles, or the organization's state forbids writes: the generic 404; (2) the row
 * is not the organization's (another organization's role or member): the generic 404; (3) a system template: 409
 * {@code ROLE_SYSTEM}; (4) {@code If-Match} missing 428, stale 412; (5) validation 422; (6) the ceiling 422 {@code ROLE_CEILING};
 * (7) state conflicts 409 ({@code ROLE_IN_USE}, {@code LAST_ADMIN}, {@code SEAT_STATE}). Every successful change writes exactly one
 * audit row in the same transaction; a request that changes nothing writes none.
 *
 * <p>Member roles also keep the legacy {@code org_member.role} mirror and {@code primary_role_id} in step (the dual write of
 * 06 section 4 step 3), so every reader that still looks at the enum agrees with the data.
 */
@Service
public class OrgRoleWriteService {

    public static final String ROLE_CREATE = "ROLE_CREATE";
    public static final String ROLE_UPDATE = "ROLE_UPDATE";
    public static final String ROLE_DELETE = "ROLE_DELETE";
    public static final String ROLE_RESYNC = "ROLE_RESYNC";
    public static final String ROLE_ASSIGN = "ROLE_ASSIGN";
    public static final String ROLE_REVOKE = "ROLE_REVOKE";
    public static final String TARGET_ROLE = "ROLE";

    public static final String CODE_ROLE_CEILING = "ROLE_CEILING";
    public static final String CODE_ROLE_SYSTEM = "ROLE_SYSTEM";
    public static final String CODE_ROLE_IN_USE = "ROLE_IN_USE";
    public static final String CODE_ROLE_NAME_TAKEN = "ROLE_NAME_TAKEN";
    public static final String CODE_LAST_ADMIN = "LAST_ADMIN";
    public static final String CODE_SEAT_STATE = "SEAT_STATE";
    public static final String CODE_PRECONDITION_REQUIRED = "PRECONDITION_REQUIRED";
    public static final String CODE_PRECONDITION_FAILED = "PRECONDITION_FAILED";

    public static final String PERM_ROLES_MANAGE = "roles.manage";
    public static final String PERM_MEMBERS_ROLE_SET = "members.role.set";

    /** Safe defaults until the admin settings registry carries them (06 section 3): roles one organization may own, roles one member may hold. */
    static final int MAX_ORG_ROLES = 50;
    static final int MAX_ROLES_PER_MEMBER = 10;
    static final int NAME_MAX = 80;
    static final int DESCRIPTION_MAX = 255;
    static final String KEY_PREFIX = "CUSTOM_";

    /** A role holding any of these is "admin level": an actor whose {@code members.role.set} is capped at BELOW_ADMIN may not touch it. */
    private static final Set<String> ADMIN_LEVEL_KEYS = Set.of(PERM_ROLES_MANAGE, PERM_MEMBERS_ROLE_SET, "org.close", "org.transfer_ownership");
    private static final Set<String> ADMIN_TEMPLATES = Set.of(RoleTemplates.OWNER, RoleTemplates.ORG_ADMIN);
    private static final Set<String> SELF_KEYS = Set.of("self.share_scope.set", "self.leave");
    private static final Set<OrgMemberStatus> LIVE = OrgMemberStatus.LIVE;

    private final OrgRoleRepository roles;
    private final OrgRolePermissionRepository permissions;
    private final OrgMemberRoleRepository memberRoles;
    private final OrgMemberRepository members;
    private final UserRepository users;
    private final OrgRoleService read;
    private final OrgAuditService audit;
    private final OrgAuditEventRepository auditEvents;
    private final ObjectMapper json;

    public OrgRoleWriteService(
        OrgRoleRepository roles,
        OrgRolePermissionRepository permissions,
        OrgMemberRoleRepository memberRoles,
        OrgMemberRepository members,
        UserRepository users,
        OrgRoleService read,
        OrgAuditService audit,
        OrgAuditEventRepository auditEvents,
        ObjectMapper json
    ) {
        this.roles = roles;
        this.permissions = permissions;
        this.memberRoles = memberRoles;
        this.members = members;
        this.users = users;
        this.read = read;
        this.audit = audit;
        this.auditEvents = auditEvents;
        this.json = json;
    }

    // ---- reads for the page ---------------------------------------------------------------------------------------------

    /** One role with its rows, assigned count and version (any active member, like the list). */
    @Transactional(readOnly = true)
    public RoleWriteDTO.RoleDetail get(OrgMembership me, Long roleId) {
        if (!read.rolesFromData(me.orgId())) throw new OrgNotFoundException();
        OrgRoleDefinition def = visible(me.orgId(), roleId);
        List<OrgRolePermission> rows = permissions.findForRoles(me.orgId(), List.of(def.getId()));
        return detail(me.orgId(), def, rows);
    }

    /** The data of the Roles and Permissions board: the table, the counts and the permission overview by category (any active member). */
    @Transactional(readOnly = true)
    public RoleWriteDTO.Overview overview(OrgMembership me) {
        Long orgId = me.orgId();
        if (!read.rolesFromData(orgId)) throw new OrgNotFoundException();
        List<OrgRoleDefinition> defs = roles.findVisibleToOrg(orgId);
        Map<Long, List<OrgRolePermission>> rowsByRole = new HashMap<>();
        if (!defs.isEmpty()) {
            for (OrgRolePermission p : permissions.findForRoles(orgId, defs.stream().map(OrgRoleDefinition::getId).toList())) {
                rowsByRole.computeIfAbsent(p.getRoleId(), k -> new ArrayList<>()).add(p);
            }
        }
        Map<Long, Long> seats = seatCounts(orgId);
        List<RoleWriteDTO.RoleRow> table = new ArrayList<>();
        Set<String> granted = new LinkedHashSet<>();
        int custom = 0;
        int system = 0;
        for (OrgRoleDefinition d : defs) {
            List<OrgRolePermission> rows = rowsByRole.getOrDefault(d.getId(), List.of());
            for (OrgRolePermission p : rows) granted.add(EntPermissions.canonical(p.getPermissionKey()));
            if (d.isSystem()) system++;
            else custom++;
            table.add(
                new RoleWriteDTO.RoleRow(
                    d.getId(), d.getRoleKey(), d.getName(), d.getDescription(), d.getTemplateKey(), scopeLabel(d, rows), scopeLevel(rows).name(), d.isSystem(), d.isEditable(), "ACTIVE",
                    seats.getOrDefault(d.getId(), 0L), rows.size(), versionOf(d, rows)
                )
            );
        }
        Map<String, int[]> perCategory = new LinkedHashMap<>(); // category key -> {registered, granted}
        Map<String, Set<String>> familiesPerCategory = new LinkedHashMap<>(); // the "permission sets" of the board = families of related keys
        for (PermissionCategories.Category c : PermissionCategories.all()) {
            perCategory.put(c.key(), new int[2]);
            familiesPerCategory.put(c.key(), new LinkedHashSet<>());
        }
        int total = 0;
        Set<String> allFamilies = new LinkedHashSet<>();
        for (EntPermissions.Def def : EntPermissions.all()) {
            String category = PermissionCategories.of(def.key()).key();
            int[] counts = perCategory.get(category);
            counts[0]++;
            total++;
            if (granted.contains(def.key())) counts[1]++;
            familiesPerCategory.get(category).add(def.family());
            allFamilies.add(def.family());
        }
        List<RoleWriteDTO.CategorySlice> slices = new ArrayList<>();
        for (PermissionCategories.Category c : PermissionCategories.all()) {
            int[] counts = perCategory.get(c.key());
            slices.add(new RoleWriteDTO.CategorySlice(c.key(), c.label(), counts[0], counts[1], total == 0 ? 0 : Math.round(100f * counts[0] / total), familiesPerCategory.get(c.key()).size()));
        }
        long activeUsers = memberRoles.countSeatsWithAnyRole(orgId, List.of(OrgMemberStatus.ACTIVE));
        return new RoleWriteDTO.Overview(table, defs.size(), activeUsers, custom, system, total, slices, allFamilies.size());
    }

    // ---- X4.1: the caller's ceiling, template diff, resync, history ----------------------------------------------------------------

    /**
     * The caller's ceiling for the permissions catalog: empty when the caller cannot write roles (no {@code roles.manage} at ORG scope,
     * no data-backed roles, or the organization's state forbids writes); never throws for that, the catalog answers "nothing grantable".
     */
    @Transactional(readOnly = true)
    public Optional<RoleCeiling> callerCeiling(OrgMembership me) {
        return ceilingOrEmpty(me, PERM_ROLES_MANAGE);
    }

    /** True when the organization reads its roles from data (the roles flag is on and the roles are backfilled). */
    public boolean rolesEnabled(Long orgId) {
        return read.rolesFromData(orgId);
    }

    /** A role compared with its template (any active member, like {@link #get}). */
    @Transactional(readOnly = true)
    public RoleWriteDTO.TemplateDiff diff(OrgMembership me, Long roleId) {
        Long orgId = me.orgId();
        if (!read.rolesFromData(orgId)) throw new OrgNotFoundException();
        OrgRoleDefinition def = visible(orgId, roleId);
        List<OrgRolePermission> rows = permissions.findForRoles(orgId, List.of(def.getId()));
        String templateKey = def.isSystem() ? null : def.getTemplateKey();
        if (templateKey == null) {
            return new RoleWriteDTO.TemplateDiff(def.getId(), null, null, false, true, List.of(), List.of(), List.of(), List.of());
        }
        Optional<OrgRoleDefinition> template = roles.findSystemByRoleKey(templateKey);
        if (template.isEmpty()) {
            return new RoleWriteDTO.TemplateDiff(def.getId(), templateKey, templateKey, false, true, List.of(), List.of(), List.of(), List.of());
        }
        List<OrgRolePermission> templateRows = permissions.findForRoles(orgId, List.of(template.get().getId()));
        Map<String, RoleCeiling.Row> templateByKey = byKey(templateRows.stream().map(RoleCeiling.Row::of).toList());
        Map<String, Object> d = diff(templateByKey, byKey(rows.stream().map(RoleCeiling.Row::of).toList()));
        return templateDiff(def.getId(), template.get(), d, templateByKey);
    }

    @SuppressWarnings("unchecked")
    private static RoleWriteDTO.TemplateDiff templateDiff(Long roleId, OrgRoleDefinition template, Map<String, Object> d, Map<String, RoleCeiling.Row> templateByKey) {
        List<RoleWriteDTO.DiffEntry> added = new ArrayList<>();
        for (String s : (List<String>) d.getOrDefault("added", List.of())) {
            int at = s.lastIndexOf('@');
            added.add(new RoleWriteDTO.DiffEntry(s.substring(0, at), s.substring(at + 1)));
        }
        List<RoleWriteDTO.DiffEntry> removed = new ArrayList<>();
        for (String s : (List<String>) d.getOrDefault("removed", List.of())) {
            RoleCeiling.Row was = templateByKey.get(s); // the scope the template gives it (what a restore would put back)
            removed.add(new RoleWriteDTO.DiffEntry(s, was == null ? null : was.scope().name()));
        }
        List<RoleWriteDTO.DiffScopeChange> changed = new ArrayList<>();
        for (Map<String, String> m : (List<Map<String, String>>) d.getOrDefault("scopeChanged", List.of())) {
            changed.add(new RoleWriteDTO.DiffScopeChange(m.get("key"), m.get("from"), m.get("to")));
        }
        List<String> attributes = (List<String>) d.getOrDefault("attributesChanged", List.of());
        boolean matches = added.isEmpty() && removed.isEmpty() && changed.isEmpty() && attributes.isEmpty();
        return new RoleWriteDTO.TemplateDiff(roleId, template.getRoleKey(), template.getName(), true, matches, added, removed, changed, attributes);
    }

    /**
     * Restores an organization role to the rows of the template it was cloned from. The editor sees the diff first ({@link #diff}); this
     * is the confirmed write: the ceiling covers everything the role holds before and after, the version must be current, one
     * ROLE_RESYNC audit row (HIGH) carries what was added, removed and changed back. A role with no template is 422.
     */
    @Transactional
    public RoleWriteDTO.RoleDetail resync(OrgMembership me, Long roleId, String ifMatch) {
        Long orgId = me.orgId();
        RoleCeiling actor = gate(me, PERM_ROLES_MANAGE);
        OrgRoleDefinition def = ownedOrSystem(orgId, roleId);
        List<OrgRolePermission> current = permissions.findForRoles(orgId, List.of(def.getId()));
        checkVersion(ifMatch, versionOf(def, current));
        if (def.getTemplateKey() == null) throw OrgException.invalid("templateKey", "this role was not made from a template, so there is nothing to restore");
        OrgRoleDefinition template = roles.findSystemByRoleKey(def.getTemplateKey()).orElseThrow(() -> OrgException.invalid("templateKey", "the template no longer exists"));
        List<OrgRolePermission> templateRows = permissions.findForRoles(orgId, List.of(template.getId()));
        Map<String, RoleCeiling.Row> before = byKey(current.stream().map(RoleCeiling.Row::of).toList());
        Map<String, RoleCeiling.Row> after = byKey(templateRows.stream().map(RoleCeiling.Row::of).toList());
        ensureSelfRows(after);
        enforceCeiling(actor, before.values());
        enforceCeiling(actor, after.values());
        Map<String, Object> diff = diff(before, after);
        if (diff.isEmpty()) return detail(orgId, def, current); // already identical: no write, no audit row
        permissions.deleteForOwnedRole(orgId, def.getId());
        current = saveRows(def.getId(), after.values());
        def.setUpdatedAt(Instant.now());
        roles.saveAndFlush(def);
        Map<String, Object> details = new LinkedHashMap<>();
        details.put("template", template.getRoleKey());
        details.putAll(diff);
        record(me, ROLE_RESYNC, TARGET_ROLE, null, String.valueOf(def.getId()), details, "HIGH");
        return detail(orgId, def, current);
    }

    /**
     * The audit trail of roles (needs roles.manage at ORG): the changes to one role, or, with {@code roleId == null}, every role change and
     * assignment in the organization, newest first.
     */
    @Transactional(readOnly = true)
    public List<RoleWriteDTO.HistoryEntry> history(OrgMembership me, Long roleId, int limit) {
        Long orgId = me.orgId();
        gate(me, PERM_ROLES_MANAGE);
        int size = Math.max(1, Math.min(limit, 200));
        org.springframework.data.domain.Pageable page = org.springframework.data.domain.PageRequest.of(0, size, org.springframework.data.domain.Sort.by(org.springframework.data.domain.Sort.Direction.DESC, "createdAt", "id"));
        List<com.dossier.api.domain.org.OrgAuditEvent> rows;
        if (roleId != null) {
            visible(orgId, roleId); // another organization's role is the generic 404
            rows = auditEvents.findByOrgIdAndTargetTypeAndTargetId(orgId, TARGET_ROLE, String.valueOf(roleId), page).getContent();
        } else {
            rows = auditEvents.findByOrgIdAndActionIn(orgId, List.of(ROLE_CREATE, ROLE_UPDATE, ROLE_DELETE, ROLE_RESYNC, ROLE_ASSIGN, ROLE_REVOKE), page).getContent();
        }
        Map<Long, String> names = new HashMap<>();
        for (OrgRoleDefinition d : roles.findVisibleToOrg(orgId)) names.put(d.getId(), d.getName());
        List<RoleWriteDTO.HistoryEntry> out = new ArrayList<>();
        for (com.dossier.api.domain.org.OrgAuditEvent e : rows) {
            Map<String, Object> details = parseDetails(e.getDetails());
            String name = null;
            if (TARGET_ROLE.equals(e.getTargetType()) && e.getTargetId() != null) {
                try {
                    name = names.get(Long.valueOf(e.getTargetId()));
                } catch (NumberFormatException ignored) {
                    // not a role id: no name
                }
                if (name == null && details.get("name") instanceof String s) name = s; // a deleted role: the audit row kept its name
            }
            out.add(new RoleWriteDTO.HistoryEntry(e.getId(), e.getAction(), e.getRisk(), e.getActorLogin(), e.getTargetType(), e.getTargetId(), e.getTargetLogin(), name, e.getCreatedAt(), details));
        }
        return out;
    }

    private Map<String, Object> parseDetails(String text) {
        if (text == null || text.isBlank()) return Map.of();
        try {
            return json.readValue(text, new com.fasterxml.jackson.core.type.TypeReference<LinkedHashMap<String, Object>>() {});
        } catch (JsonProcessingException e) {
            return Map.of("raw", text);
        }
    }

    // ---- create -----------------------------------------------------------------------------------------------------------

    @Transactional
    public RoleWriteDTO.RoleDetail create(OrgMembership me, RoleWriteDTO.CreateRequest req) {
        Long orgId = me.orgId();
        RoleCeiling actor = gate(me, PERM_ROLES_MANAGE);
        if (req == null) throw OrgException.invalid("body", "is required");
        String name = cleanName(req.name());
        String description = cleanDescription(req.description());
        if (req.templateKey() != null && req.sourceRoleId() != null) throw OrgException.invalid("templateKey", "give a template or a source role, not both");

        OrgRoleDefinition source = null;
        if (req.sourceRoleId() != null) {
            source = visible(orgId, req.sourceRoleId());
        } else if (req.templateKey() != null) {
            source = roles.findSystemByRoleKey(req.templateKey().trim()).orElseThrow(() -> OrgException.invalid("templateKey", "is not a role template"));
        }
        if (source != null && source.isSystem() && RoleTemplates.OWNER.equals(source.getRoleKey())) {
            throw system("The Owner role cannot be cloned");
        }
        List<OrgRolePermission> sourceRows = source == null ? List.of() : permissions.findForRoles(orgId, List.of(source.getId()));
        Map<String, RoleCeiling.Row> sourceByKey = byKey(sourceRows.stream().map(RoleCeiling.Row::of).toList());

        Map<String, RoleCeiling.Row> wanted = req.permissions() != null ? validateRows(req.permissions(), sourceByKey) : new LinkedHashMap<>(sourceByKey);
        ensureSelfRows(wanted);
        enforceCeiling(actor, wanted.values());

        if (roles.countOwnedByOrgId(orgId) >= MAX_ORG_ROLES) throw OrgException.limitReached("rolesPerOrg", MAX_ORG_ROLES);
        assertNameFree(orgId, name, null);

        OrgRoleDefinition def = new OrgRoleDefinition();
        def.setOrgId(orgId);
        def.setRoleKey(freshKey(orgId, name));
        def.setName(name);
        def.setDescription(description != null ? description : source == null ? null : source.getDescription());
        def.setTemplateKey(source == null ? null : source.isSystem() ? source.getRoleKey() : source.getTemplateKey()); // a copy of an org role keeps ITS template (maybe none)
        def.setSystem(false);
        def.setEditable(true);
        def.setWorkspaceKey(source == null ? null : source.getWorkspaceKey());
        OrgRoleDefinition saved = roles.saveAndFlush(def);
        List<OrgRolePermission> rows = saveRows(saved.getId(), wanted.values());

        Map<String, Object> details = new LinkedHashMap<>();
        details.put("name", name);
        details.put("template", saved.getTemplateKey());
        details.put("sourceRoleId", req.sourceRoleId());
        details.put("permissions", wanted.size());
        details.put("dangerous", dangerous(wanted.keySet()));
        boolean hasDangerous = !dangerous(wanted.keySet()).isEmpty();
        record(me, ROLE_CREATE, TARGET_ROLE, null, String.valueOf(saved.getId()), details, hasDangerous ? "HIGH" : "MEDIUM");
        return detail(orgId, saved, rows);
    }

    // ---- update ---------------------------------------------------------------------------------------------------------

    @Transactional
    public RoleWriteDTO.RoleDetail update(OrgMembership me, Long roleId, String ifMatch, RoleWriteDTO.UpdateRequest req) {
        Long orgId = me.orgId();
        RoleCeiling actor = gate(me, PERM_ROLES_MANAGE);
        OrgRoleDefinition def = ownedOrSystem(orgId, roleId);
        List<OrgRolePermission> current = permissions.findForRoles(orgId, List.of(def.getId()));
        checkVersion(ifMatch, versionOf(def, current));
        if (req == null) throw OrgException.invalid("body", "is required");

        String newName = req.name() == null ? def.getName() : cleanName(req.name());
        String newDescription = req.description() == null ? def.getDescription() : cleanDescription(req.description());
        Map<String, RoleCeiling.Row> before = byKey(current.stream().map(RoleCeiling.Row::of).toList());
        // A role is edited as a whole, so everything already in it must be within the editor's reach too (05 section 3).
        enforceCeiling(actor, before.values());
        Map<String, RoleCeiling.Row> after = req.permissions() == null ? before : validateRows(req.permissions(), before);
        if (req.permissions() != null) {
            ensureSelfRows(after);
            enforceCeiling(actor, after.values());
        }
        if (!newName.equalsIgnoreCase(def.getName())) assertNameFree(orgId, newName, def.getId());

        boolean renamed = !Objects.equals(newName, def.getName()) || !Objects.equals(newDescription, def.getDescription());
        Map<String, Object> diff = diff(before, after);
        boolean permissionsChanged = !diff.isEmpty();
        if (!renamed && !permissionsChanged) return detail(orgId, def, current); // nothing changed: no write, no audit row

        if (permissionsChanged) {
            permissions.deleteForOwnedRole(orgId, def.getId());
            current = saveRows(def.getId(), after.values());
        }
        def.setName(newName);
        def.setDescription(newDescription);
        def.setUpdatedAt(Instant.now());
        roles.saveAndFlush(def);

        Map<String, Object> details = new LinkedHashMap<>();
        if (renamed) {
            details.put("name", newName);
            details.put("description", newDescription);
        }
        details.putAll(diff);
        record(me, ROLE_UPDATE, TARGET_ROLE, null, String.valueOf(def.getId()), details, permissionsChanged ? "HIGH" : "LOW");
        return detail(orgId, def, permissionsChanged ? current : permissions.findForRoles(orgId, List.of(def.getId())));
    }

    // ---- delete -----------------------------------------------------------------------------------------------------------

    @Transactional
    public void delete(OrgMembership me, Long roleId, String ifMatch) {
        Long orgId = me.orgId();
        RoleCeiling actor = gate(me, PERM_ROLES_MANAGE);
        OrgRoleDefinition def = ownedOrSystem(orgId, roleId);
        List<OrgRolePermission> rows = permissions.findForRoles(orgId, List.of(def.getId()));
        checkVersion(ifMatch, versionOf(def, rows));
        enforceCeiling(actor, rows.stream().map(RoleCeiling.Row::of).toList());
        long inUse = memberRoles.countSeatsHoldingRole(orgId, def.getId(), LIVE);
        if (inUse > 0) throw OrgException.coded(409, CODE_ROLE_IN_USE, "The role is still assigned to " + inUse + " member(s)", Map.of("count", inUse));
        // Departed seats and ended rows still point at the role (foreign keys); they are history of a role that no longer exists.
        memberRoles.clearPrimaryRolePointer(orgId, def.getId());
        memberRoles.deleteAllForRole(orgId, def.getId());
        permissions.deleteForOwnedRole(orgId, def.getId());
        roles.deleteOwnedByOrgIdAndId(orgId, def.getId());

        Map<String, Object> details = new LinkedHashMap<>();
        details.put("name", def.getName());
        details.put("key", def.getRoleKey());
        details.put("permissions", rows.size());
        record(me, ROLE_DELETE, TARGET_ROLE, null, String.valueOf(def.getId()), details, "MEDIUM");
    }

    // ---- member roles -----------------------------------------------------------------------------------------------------

    /**
     * Replaces the roles of one member. Roles that are added or removed must be within the actor's reach (a role holding anything the
     * actor lacks is untouchable), an actor whose {@code members.role.set} is capped at BELOW_ADMIN may not touch an admin-level
     * role in either direction, nobody changes their own roles, the organization keeps an Owner and an admin, and the seat's legacy
     * {@code role} and {@code primary_role_id} follow the primary role.
     */
    @Transactional
    public RoleWriteDTO.MemberRoles setMemberRoles(OrgMembership me, Long memberId, RoleWriteDTO.MemberRolesRequest req) {
        return applyMemberRoles(me, memberId, req);
    }

    /**
     * {@link #setMemberRoles} without a transaction boundary of its own, for a caller that already runs inside one and expects some refusals to be
     * handled, not fatal (the bulk call of X4.3 answers one refused member with a reason and carries on with the rest). A refusal here is thrown
     * before anything is written, so the surrounding transaction is never left half-done or marked rollback-only by the refusal.
     */
    public RoleWriteDTO.MemberRoles applyMemberRoles(OrgMembership me, Long memberId, RoleWriteDTO.MemberRolesRequest req) {
        Long orgId = me.orgId();
        RoleCeiling actor = gate(me, PERM_MEMBERS_ROLE_SET);
        OrgMember seat = members.findByOrgIdAndId(orgId, memberId).orElseThrow(OrgNotFoundException::new);
        if (!LIVE.contains(seat.getStatus())) {
            throw OrgException.coded(409, CODE_SEAT_STATE, "The member is not an active part of the organization", Map.of());
        }
        if (seat.getRole() == null || seat.getRole().isReserved()) throw OrgException.reserved("role", String.valueOf(seat.getRole()));
        if (Objects.equals(seat.getId(), me.memberId())) {
            throw OrgException.coded(422, CODE_ROLE_CEILING, "You cannot change your own roles", Map.of("reason", "SELF"));
        }
        if (req == null || req.roleIds() == null || req.roleIds().isEmpty()) throw OrgException.invalid("roleIds", "at least one role is required");
        LinkedHashSet<Long> newIds = new LinkedHashSet<>();
        for (Long id : req.roleIds()) {
            if (id == null) throw OrgException.invalid("roleIds", "must be role ids");
            if (!newIds.add(id)) throw OrgException.invalid("roleIds", "lists a role twice");
        }
        if (newIds.size() > MAX_ROLES_PER_MEMBER) throw OrgException.invalid("roleIds", "at most " + MAX_ROLES_PER_MEMBER + " roles per member");
        Long primaryId = req.primaryRoleId() != null ? req.primaryRoleId() : newIds.size() == 1 ? newIds.iterator().next() : null;
        if (primaryId == null) throw OrgException.invalid("primaryRoleId", "is required when there is more than one role");
        if (!newIds.contains(primaryId)) throw OrgException.invalid("primaryRoleId", "must be one of roleIds");

        List<OrgMemberRole> live = memberRoles.findLiveByOrgIdAndMemberId(orgId, seat.getId());
        Set<Long> currentIds = live.stream().map(OrgMemberRole::getRoleId).collect(Collectors.toCollection(LinkedHashSet::new));
        Long currentPrimary = live.stream().filter(OrgMemberRole::isPrimary).map(OrgMemberRole::getRoleId).findFirst().orElse(null);

        Set<Long> all = new LinkedHashSet<>(newIds);
        all.addAll(currentIds);
        Map<Long, OrgRoleDefinition> defs = roles.findVisibleByOrgIdAndIdIn(orgId, all).stream().collect(Collectors.toMap(OrgRoleDefinition::getId, d -> d));
        for (Long id : newIds) if (!defs.containsKey(id)) throw new OrgNotFoundException(); // another organization's role, or none
        Map<Long, List<OrgRolePermission>> rowsByRole = new HashMap<>();
        for (OrgRolePermission p : permissions.findForRoles(orgId, defs.keySet())) rowsByRole.computeIfAbsent(p.getRoleId(), k -> new ArrayList<>()).add(p);

        boolean sameSet = currentIds.equals(newIds);
        if (sameSet && Objects.equals(currentPrimary, primaryId) && consistent(seat, defs.get(primaryId))) {
            return memberRoles(seat, defs, live); // nothing to change: no write, no audit row
        }

        Set<Long> added = new LinkedHashSet<>(newIds);
        added.removeAll(currentIds);
        Set<Long> removed = new LinkedHashSet<>(currentIds);
        removed.removeAll(newIds);

        // The ceiling: every role that is given or taken away must be within the actor's reach.
        for (Long id : concat(added, removed)) {
            OrgRoleDefinition d = defs.get(id);
            if (d == null) continue; // a stale row pointing outside the organization: nothing the actor could be reaching for
            enforceCeiling(actor, rowsByRole.getOrDefault(id, List.of()).stream().map(RoleCeiling.Row::of).toList());
        }
        // The narrowing attribute on members.role.set (an Organization Admin may not touch OWNER or ORG_ADMIN, in either direction).
        int cap = actor.ceilingRank(PERM_MEMBERS_ROLE_SET);
        if (cap < 3) {
            for (Long id : all) {
                OrgRoleDefinition d = defs.get(id);
                if (d == null) continue;
                List<OrgRolePermission> rows = rowsByRole.getOrDefault(id, List.of());
                boolean tooHigh = cap == 2 ? adminLevel(d, rows) : LegacyRoleMirror.forRole(d).map(r -> r != OrgRole.MEMBER).orElse(true);
                if (tooHigh) {
                    throw OrgException.coded(422, CODE_ROLE_CEILING, "Your role may not give or take away this role", Map.of("reason", "ADMIN_ROLE", "role", d.getRoleKey()));
                }
            }
        }
        // Last admin: the organization keeps at least one Owner and one admin-level person.
        guardLastAdmin(orgId, seat, currentIds, newIds, defs);

        Instant now = Instant.now();
        for (OrgMemberRole row : live) {
            if (removed.contains(row.getRoleId())) {
                row.setEndsAt(now);
                row.setPrimary(false);
                memberRoles.saveAndFlush(row);
            } else if (row.isPrimary() && !row.getRoleId().equals(primaryId)) {
                row.setPrimary(false); // free the single primary slot before the new primary is written
                memberRoles.saveAndFlush(row);
            }
        }
        for (OrgMemberRole row : live) {
            if (!removed.contains(row.getRoleId()) && row.getRoleId().equals(primaryId) && !row.isPrimary()) {
                row.setPrimary(true);
                memberRoles.saveAndFlush(row);
            }
        }
        for (Long id : added) {
            OrgMemberRole row = new OrgMemberRole();
            row.setOrgId(orgId);
            row.setMemberId(seat.getId());
            row.setRoleId(id);
            row.setPrimary(id.equals(primaryId));
            row.setGrantedByMemberId(me.memberId());
            row.setGrantedAt(now);
            memberRoles.saveAndFlush(row);
        }
        OrgRoleDefinition primary = defs.get(primaryId);
        seat.setRole(LegacyRoleMirror.forRole(primary).orElse(OrgRole.MEMBER)); // the dual write (06 section 4 step 3)
        seat.setPrimaryRoleId(primaryId);
        members.save(seat);

        boolean grants = !added.isEmpty() || !Objects.equals(currentPrimary, primaryId);
        boolean risky = false;
        for (Long id : added) {
            OrgRoleDefinition d = defs.get(id);
            List<OrgRolePermission> rows = rowsByRole.getOrDefault(id, List.of());
            risky |= adminLevel(d, rows) || !dangerous(rows.stream().map(OrgRolePermission::getPermissionKey).toList()).isEmpty();
        }
        Map<String, Object> details = new LinkedHashMap<>();
        details.put("added", added.stream().map(id -> defs.get(id).getRoleKey()).toList());
        details.put("removed", removed.stream().map(id -> defs.containsKey(id) ? defs.get(id).getRoleKey() : "#" + id).toList());
        details.put("primaryBefore", currentPrimary == null || !defs.containsKey(currentPrimary) ? null : defs.get(currentPrimary).getRoleKey());
        details.put("primaryAfter", primary.getRoleKey());
        details.put("legacyRole", seat.getRole().name());
        record(me, grants ? ROLE_ASSIGN : ROLE_REVOKE, OrgAuditService.TARGET_MEMBER, loginOf(seat), String.valueOf(seat.getId()), details, risky ? "HIGH" : "MEDIUM");

        return memberRoles(seat, defs, memberRoles.findLiveByOrgIdAndMemberId(orgId, seat.getId()));
    }

    // ---- guards ---------------------------------------------------------------------------------------------------------------

    /**
     * The checks every write starts with, all of which answer the generic 404: the roles flag, the permission (held at ORG scope: a
     * narrower grant never reaches the organization's roles), roles that are data (a seat that still reads the enum cannot manage
     * roles), and the organization's state. Returns the actor's rows for the ceiling rule.
     */
    private RoleCeiling gate(OrgMembership me, String permissionKey) {
        return ceilingOrEmpty(me, permissionKey).orElseThrow(OrgNotFoundException::new);
    }

    private Optional<RoleCeiling> ceilingOrEmpty(OrgMembership me, String permissionKey) {
        if (me == null || !read.rolesFromData(me.orgId())) return Optional.empty();
        if (!me.canKey(permissionKey) || me.scopeFor(permissionKey).filter(s -> s == PermissionScope.ORG).isEmpty()) return Optional.empty();
        if (me.roles().isEmpty() || me.roles().stream().anyMatch(r -> r.roleId() == null)) return Optional.empty();
        if (!OrgStateRules.allows(me.orgStatus(), AuthzOperation.WRITE, List.of(permissionKey))) return Optional.empty();
        List<Long> ids = me.roles().stream().map(OrgMembership.RoleRef::roleId).toList();
        List<OrgRolePermission> rows = permissions.findForRoles(me.orgId(), ids);
        boolean owner = roles.findSystemByRoleKey(RoleTemplates.OWNER).map(r -> ids.contains(r.getId())).orElse(false);
        return Optional.of(owner ? RoleCeiling.unlimited(rows) : RoleCeiling.of(rows));
    }

    private void enforceCeiling(RoleCeiling actor, Collection<RoleCeiling.Row> rows) {
        Optional<RoleCeiling.Row> bad = actor.firstViolation(rows);
        if (bad.isPresent()) {
            RoleCeiling.Row r = bad.get();
            Map<String, Object> extra = new LinkedHashMap<>();
            extra.put("key", r.key());
            extra.put("scope", r.scope().name());
            if (r.ceilingRoleKey() != null) extra.put("ceilingRoleKey", r.ceilingRoleKey());
            if (r.rowFilter() != null) extra.put("rowFilter", r.rowFilter());
            throw OrgException.coded(422, CODE_ROLE_CEILING, "You cannot grant " + r.key() + " at " + r.scope() + ": you do not hold it", extra);
        }
    }

    private void guardLastAdmin(Long orgId, OrgMember seat, Set<Long> currentIds, Set<Long> newIds, Map<Long, OrgRoleDefinition> defs) {
        boolean wasOwner = seat.getRole() == OrgRole.OWNER || holds(currentIds, defs, Set.of(RoleTemplates.OWNER));
        boolean isOwner = holds(newIds, defs, Set.of(RoleTemplates.OWNER));
        if (wasOwner && !isOwner && memberRoles.countOtherActiveSeatsHolding(orgId, seat.getId(), Set.of(RoleTemplates.OWNER), Set.of(OrgRole.OWNER)) == 0) {
            throw OrgException.coded(409, CODE_LAST_ADMIN, "The organization needs at least one Owner", Map.of("role", RoleTemplates.OWNER));
        }
        boolean wasAdmin = wasOwner || seat.getRole() == OrgRole.ADMIN || holds(currentIds, defs, ADMIN_TEMPLATES);
        boolean isAdmin = holds(newIds, defs, ADMIN_TEMPLATES);
        if (wasAdmin && !isAdmin && memberRoles.countOtherActiveSeatsHolding(orgId, seat.getId(), ADMIN_TEMPLATES, Set.of(OrgRole.OWNER, OrgRole.ADMIN)) == 0) {
            throw OrgException.coded(409, CODE_LAST_ADMIN, "The organization needs at least one administrator", Map.of("role", RoleTemplates.ORG_ADMIN));
        }
    }

    private static boolean holds(Collection<Long> ids, Map<Long, OrgRoleDefinition> defs, Set<String> templateKeys) {
        for (Long id : ids) {
            OrgRoleDefinition d = defs.get(id);
            if (d == null) continue;
            String template = d.getTemplateKey() != null ? d.getTemplateKey() : d.isSystem() ? d.getRoleKey() : null;
            if (template != null && templateKeys.contains(template)) return true;
        }
        return false;
    }

    private static boolean adminLevel(OrgRoleDefinition d, List<OrgRolePermission> rows) {
        String template = d.getTemplateKey() != null ? d.getTemplateKey() : d.isSystem() ? d.getRoleKey() : null;
        if (template != null && ADMIN_TEMPLATES.contains(template)) return true;
        for (OrgRolePermission p : rows) if (ADMIN_LEVEL_KEYS.contains(p.getPermissionKey())) return true;
        return false;
    }

    /** True when the seat's enum and pointer already agree with the primary role (otherwise a "no change" request still repairs them). */
    private static boolean consistent(OrgMember seat, OrgRoleDefinition primary) {
        return primary != null && Objects.equals(seat.getPrimaryRoleId(), primary.getId()) && LegacyRoleMirror.forRole(primary).filter(r -> r == seat.getRole()).isPresent();
    }

    // ---- lookups -----------------------------------------------------------------------------------------------------------

    private OrgRoleDefinition visible(Long orgId, Long roleId) {
        if (roleId == null) throw new OrgNotFoundException();
        return roles.findVisibleByOrgIdAndId(orgId, roleId).orElseThrow(OrgNotFoundException::new);
    }

    /** The organization's own role; a system template that exists answers 409 ROLE_SYSTEM (templates are global, nothing leaks), anything else 404. */
    private OrgRoleDefinition ownedOrSystem(Long orgId, Long roleId) {
        OrgRoleDefinition def = visible(orgId, roleId);
        if (def.isSystem() || def.getOrgId() == null) throw system("System roles cannot be changed: clone the role first");
        return def;
    }

    private static OrgException system(String message) {
        return OrgException.coded(409, CODE_ROLE_SYSTEM, message, Map.of());
    }

    private String loginOf(OrgMember seat) {
        return seat.getUserId() == null ? null : users.findById(seat.getUserId()).map(u -> u.getLogin()).orElse(null);
    }

    private Map<Long, Long> seatCounts(Long orgId) {
        Map<Long, Long> out = new HashMap<>();
        for (Object[] row : memberRoles.countSeatsByRole(orgId, LIVE)) out.put((Long) row[0], ((Number) row[1]).longValue());
        return out;
    }

    // ---- validation --------------------------------------------------------------------------------------------------------

    private static String cleanName(String raw) {
        if (raw == null || raw.isBlank()) throw OrgException.invalid("name", "is required");
        String n = raw.strip().replaceAll("\\s+", " ");
        if (n.length() > NAME_MAX) throw OrgException.invalid("name", "at most " + NAME_MAX + " characters");
        if (n.chars().anyMatch(Character::isISOControl) || n.indexOf('<') >= 0 || n.indexOf('>') >= 0) throw OrgException.invalid("name", "contains characters that are not allowed");
        SensitiveContent.check("name", "name", n); // X11.7
        return n;
    }

    private static String cleanDescription(String raw) {
        if (raw == null) return null;
        String d = raw.strip();
        if (d.isEmpty()) return null;
        if (d.length() > DESCRIPTION_MAX) throw OrgException.invalid("description", "at most " + DESCRIPTION_MAX + " characters");
        if (d.chars().anyMatch(c -> Character.isISOControl(c) && c != '\n') || d.indexOf('<') >= 0 || d.indexOf('>') >= 0) throw OrgException.invalid("description", "contains characters that are not allowed");
        SensitiveContent.check("description", "description", d); // X11.7
        return d;
    }

    private void assertNameFree(Long orgId, String name, Long exceptRoleId) {
        for (OrgRoleDefinition d : roles.findVisibleToOrg(orgId)) {
            if (Objects.equals(d.getId(), exceptRoleId)) continue;
            if (d.getName() != null && d.getName().equalsIgnoreCase(name)) {
                throw OrgException.coded(409, CODE_ROLE_NAME_TAKEN, "A role named '" + name + "' already exists", Map.of("name", name));
            }
        }
    }

    private String freshKey(Long orgId, String name) {
        String slug = name.toUpperCase(Locale.ROOT).replaceAll("[^A-Z0-9]+", "_").replaceAll("^_+|_+$", "");
        if (slug.isEmpty()) slug = "ROLE";
        Set<String> taken = new LinkedHashSet<>(roles.findOwnedRoleKeysByOrgId(orgId));
        String base = (KEY_PREFIX + slug);
        base = base.length() > 34 ? base.substring(0, 34) : base;
        String key = base;
        for (int i = 2; taken.contains(key); i++) key = base + "_" + i;
        return key;
    }

    /** Validates and canonicalises requested rows; {@code inherit} supplies the attributes a row leaves unsaid (null = keep, "" = clear). */
    private Map<String, RoleCeiling.Row> validateRows(List<RoleWriteDTO.PermissionInput> input, Map<String, RoleCeiling.Row> inherit) {
        Map<String, RoleCeiling.Row> out = new LinkedHashMap<>();
        int i = 0;
        for (RoleWriteDTO.PermissionInput p : input) {
            String field = "permissions[" + (i++) + "]";
            if (p == null || p.key() == null || p.key().isBlank()) throw OrgException.invalid(field + ".key", "is required");
            Optional<EntPermissions.Def> def = EntPermissions.find(p.key().trim());
            if (def.isEmpty()) throw OrgException.invalid(field + ".key", "is not a permission");
            String key = def.get().key();
            PermissionScope scope = PermissionScope.ofName(p.scope() == null ? null : p.scope().trim().toUpperCase(Locale.ROOT)).orElseThrow(() -> OrgException.invalid(field + ".scope", "must be OWN, ASSIGNED, TEAM, DEPARTMENT or ORG"));
            if (def.get().actsFor() && scope == PermissionScope.OWN) throw OrgException.invalid(field + ".scope", "a permission that acts for another person cannot be OWN");
            if (SELF_KEYS.contains(key) && scope != PermissionScope.OWN) throw OrgException.invalid(field + ".scope", "must be OWN");
            RoleCeiling.Row old = inherit.get(key);
            String ceiling = attribute(p.ceilingRoleKey(), old == null ? null : old.ceilingRoleKey());
            String filter = attribute(p.rowFilter(), old == null ? null : old.rowFilter());
            if (!RoleCeiling.knownCeiling(ceiling)) throw OrgException.invalid(field + ".ceilingRoleKey", "must be BELOW_ADMIN or MEMBER");
            if (!RoleCeiling.knownRowFilter(filter)) throw OrgException.invalid(field + ".rowFilter", "must be BILLING_OPS or HR");
            if (out.put(key, new RoleCeiling.Row(key, scope, ceiling, filter)) != null) throw OrgException.invalid(field + ".key", "is listed twice");
        }
        return out;
    }

    private static String attribute(String requested, String inherited) {
        if (requested == null) return inherited;
        String v = requested.trim();
        return v.isEmpty() ? null : v.toUpperCase(Locale.ROOT);
    }

    /** Every role keeps the two rows every legacy role has (a member may always set what they share and leave). */
    private static void ensureSelfRows(Map<String, RoleCeiling.Row> rows) {
        for (String key : SELF_KEYS) rows.putIfAbsent(key, new RoleCeiling.Row(key, PermissionScope.OWN, null, null));
    }

    private static Map<String, RoleCeiling.Row> byKey(List<RoleCeiling.Row> rows) {
        Map<String, RoleCeiling.Row> m = new LinkedHashMap<>();
        for (RoleCeiling.Row r : rows) m.put(r.key(), r);
        return m;
    }

    private List<OrgRolePermission> saveRows(Long roleId, Collection<RoleCeiling.Row> rows) {
        List<OrgRolePermission> out = new ArrayList<>();
        List<RoleCeiling.Row> sorted = rows.stream().sorted(Comparator.comparing(RoleCeiling.Row::key)).toList();
        for (RoleCeiling.Row r : sorted) out.add(permissions.saveAndFlush(new OrgRolePermission(roleId, r.key(), r.scope(), r.ceilingRoleKey(), r.rowFilter())));
        return out;
    }

    private static Map<String, Object> diff(Map<String, RoleCeiling.Row> before, Map<String, RoleCeiling.Row> after) {
        List<String> added = new ArrayList<>();
        List<String> removed = new ArrayList<>();
        List<Map<String, String>> scopeChanged = new ArrayList<>();
        List<String> attributesChanged = new ArrayList<>();
        for (RoleCeiling.Row a : after.values()) {
            RoleCeiling.Row b = before.get(a.key());
            if (b == null) added.add(a.key() + "@" + a.scope());
            else if (b.scope() != a.scope()) scopeChanged.add(Map.of("key", a.key(), "from", b.scope().name(), "to", a.scope().name()));
            else if (!Objects.equals(b.ceilingRoleKey(), a.ceilingRoleKey()) || !Objects.equals(b.rowFilter(), a.rowFilter())) attributesChanged.add(a.key());
        }
        for (RoleCeiling.Row b : before.values()) if (!after.containsKey(b.key())) removed.add(b.key());
        Map<String, Object> d = new LinkedHashMap<>();
        if (!added.isEmpty() || !removed.isEmpty() || !scopeChanged.isEmpty() || !attributesChanged.isEmpty()) {
            d.put("added", added);
            d.put("removed", removed);
            d.put("scopeChanged", scopeChanged);
            if (!attributesChanged.isEmpty()) d.put("attributesChanged", attributesChanged);
        }
        return d;
    }

    private static List<String> dangerous(Collection<String> keys) {
        return keys.stream().filter(k -> EntPermissions.find(k).map(EntPermissions.Def::dangerous).orElse(false)).sorted().toList();
    }

    private static <T> List<T> concat(Collection<T> a, Collection<T> b) {
        List<T> out = new ArrayList<>(a);
        out.addAll(b);
        return out;
    }

    // ---- versions (If-Match) ------------------------------------------------------------------------------------------------

    /**
     * The weak ETag of a role: a hash of everything a client can edit (name, description, every permission row), so any change to the
     * role, by anyone, makes the old version stale. Roles have no version column; this needs no schema change and cannot drift.
     */
    public static String versionOf(OrgRoleDefinition def, Collection<OrgRolePermission> rows) {
        StringBuilder sb = new StringBuilder();
        sb.append(def.getId()).append('|').append(def.getName()).append('|').append(def.getDescription()).append('|').append(def.getTemplateKey());
        rows.stream()
            .sorted(Comparator.comparing(OrgRolePermission::getPermissionKey))
            .forEach(p -> sb.append('\n').append(p.getPermissionKey()).append('|').append(p.getScope()).append('|').append(p.getCeilingRoleKey()).append('|').append(p.getRowFilter()));
        try {
            byte[] h = MessageDigest.getInstance("SHA-256").digest(sb.toString().getBytes(StandardCharsets.UTF_8));
            return "W/\"" + HexFormat.of().formatHex(h, 0, 8) + "\"";
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    private static void checkVersion(String header, String current) {
        if (header == null || header.isBlank()) {
            throw OrgException.coded(428, CODE_PRECONDITION_REQUIRED, "Send the version you loaded in an If-Match header", Map.of());
        }
        if (!normalise(header).equals(normalise(current))) {
            throw OrgException.coded(412, CODE_PRECONDITION_FAILED, "The role changed since you loaded it", Map.of("currentVersion", current));
        }
    }

    private static String normalise(String etag) {
        String v = etag.strip();
        if (v.startsWith("W/")) v = v.substring(2);
        return v.replace("\"", "");
    }

    // ---- DTOs ---------------------------------------------------------------------------------------------------------------

    private RoleWriteDTO.RoleDetail detail(Long orgId, OrgRoleDefinition d, List<OrgRolePermission> rows) {
        List<RoleDTO.PermissionDTO> perms = rows.stream()
            .sorted(Comparator.comparing(OrgRolePermission::getPermissionKey))
            .map(p -> new RoleDTO.PermissionDTO(p.getPermissionKey(), p.getScope().name(), p.getCeilingRoleKey(), p.getRowFilter()))
            .toList();
        return new RoleWriteDTO.RoleDetail(
            d.getId(), d.getRoleKey(), d.getName(), d.getDescription(), d.getTemplateKey(), d.isSystem(), d.isEditable(), d.getWorkspaceKey(), scopeLabel(d, rows), "ACTIVE",
            memberRoles.countSeatsHoldingRole(orgId, d.getId(), LIVE), versionOf(d, rows), perms
        );
    }

    /** The "Scope" column of the board: a custom role is "Custom"; a system role is labelled by the widest scope of its rows (the self rows do not count). */
    private static String scopeLabel(OrgRoleDefinition d, Collection<OrgRolePermission> rows) {
        if (!d.isSystem()) return "Custom";
        return switch (scopeLevel(rows)) {
            case ORG -> "Organization";
            case DEPARTMENT -> "Department";
            case TEAM -> "Team";
            case ASSIGNED -> "Assigned";
            case OWN -> "Personal";
        };
    }

    private static PermissionScope scopeLevel(Collection<OrgRolePermission> rows) {
        PermissionScope widest = null;
        for (OrgRolePermission p : rows) if (!SELF_KEYS.contains(p.getPermissionKey())) widest = PermissionScope.widest(widest, p.getScope());
        return widest == null ? PermissionScope.OWN : widest;
    }

    private RoleWriteDTO.MemberRoles memberRoles(OrgMember seat, Map<Long, OrgRoleDefinition> defs, List<OrgMemberRole> live) {
        List<RoleWriteDTO.MemberRoleRef> refs = new ArrayList<>();
        for (OrgMemberRole r : live) {
            OrgRoleDefinition d = defs.get(r.getRoleId());
            if (d != null) refs.add(new RoleWriteDTO.MemberRoleRef(d.getId(), d.getRoleKey(), d.getName(), r.isPrimary()));
        }
        return new RoleWriteDTO.MemberRoles(seat.getId(), seat.getRole() == null ? null : seat.getRole().name(), refs);
    }

    private void record(OrgMembership me, String action, String targetType, String targetLogin, String targetId, Map<String, Object> details, String risk) {
        String text;
        try {
            text = json.writeValueAsString(details);
        } catch (JsonProcessingException e) {
            text = String.valueOf(details);
        }
        audit.record(me.orgId(), me.login(), me.role(), action, targetType, targetLogin, targetId, text, null, null, null, risk);
    }
}
