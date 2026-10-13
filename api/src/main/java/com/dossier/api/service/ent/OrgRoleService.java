package com.dossier.api.service.ent;

import com.dossier.api.domain.ent.OrgMemberRole;
import com.dossier.api.domain.ent.OrgRoleDefinition;
import com.dossier.api.domain.ent.OrgRolePermission;
import com.dossier.api.domain.enumeration.PermissionScope;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.repository.ent.OrgMemberRoleRepository;
import com.dossier.api.repository.ent.OrgRolePermissionRepository;
import com.dossier.api.repository.ent.OrgRoleRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.service.dto.ent.RoleDTO;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import com.dossier.api.service.settings.EnterpriseSettingKeys;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Roles as data, READ side (X1.6; the write side is X1.14). Three jobs:
 *
 * <ul>
 *   <li>{@link #resolveGrants}: what a seat may do according to its {@code org_member_role} rows, for
 *       {@code OrgAccessService}. It answers empty (and the caller keeps the legacy enum) whenever the data cannot be trusted:
 *       no live rows, not exactly one primary, a role of another organization, a primary that does not mirror the seat's enum
 *       value (somebody wrote the enum without the roles), or no permission rows (the seeder has not run). It never widens on
 *       doubt: the enum is the old, narrower-or-equal answer, never "no checks".</li>
 *   <li>{@link #list}: {@code GET /api/orgs/{orgId}/roles}, 404 unless {@code flag.enterprise.roles} is on for the org.</li>
 *   <li>{@link #syncFromLegacy}: the dual write for the places that still write {@code org_member.role} (organization creation
 *       and the demo seeder): keeps one live primary role row in step with the enum, so the data never drifts behind it.</li>
 * </ul>
 */
@Service
public class OrgRoleService {

    private static final Logger LOG = LoggerFactory.getLogger(OrgRoleService.class);

    /** What the roles of one seat add up to. */
    public record RoleGrants(List<OrgMembership.RoleRef> roles, Map<String, PermissionScope> grants) {}

    private final OrgRoleRepository roles;
    private final OrgRolePermissionRepository permissions;
    private final OrgMemberRoleRepository memberRoles;
    private final OrgMemberRepository members;
    private final EnterpriseFeatureFlag flag;

    public OrgRoleService(
        OrgRoleRepository roles,
        OrgRolePermissionRepository permissions,
        OrgMemberRoleRepository memberRoles,
        OrgMemberRepository members,
        EnterpriseFeatureFlag flag
    ) {
        this.roles = roles;
        this.permissions = permissions;
        this.memberRoles = memberRoles;
        this.members = members;
        this.flag = flag;
    }

    /** True when the seat's roles are read from data for this organization (master and roles flags both on). */
    public boolean rolesFromData(Long orgId) {
        return flag != null && orgId != null && flag.isEnabled(EnterpriseSettingKeys.FLAG_ROLES, orgId);
    }

    // ---- read: the grants of a seat -----------------------------------------------------------------------------

    @Transactional(readOnly = true)
    public Optional<RoleGrants> resolveGrants(Long orgId, OrgMember seat) {
        if (!rolesFromData(orgId) || seat == null || seat.getId() == null || !Objects.equals(seat.getOrgId(), orgId)) return Optional.empty();
        List<OrgMemberRole> live = memberRoles.findLiveByOrgIdAndMemberId(orgId, seat.getId());
        if (live.isEmpty()) return Optional.empty(); // transitional: a seat created after the backfill, before X1.14 writes roles
        List<OrgMemberRole> primaries = live.stream().filter(OrgMemberRole::isPrimary).toList();
        if (primaries.size() != 1) {
            LOG.warn("org {} member {}: {} primary role rows; reading the legacy role", orgId, seat.getId(), primaries.size());
            return Optional.empty();
        }
        Set<Long> ids = live.stream().map(OrgMemberRole::getRoleId).collect(Collectors.toCollection(HashSet::new));
        Map<Long, OrgRoleDefinition> defs = roles.findVisibleByOrgIdAndIdIn(orgId, ids).stream().collect(Collectors.toMap(OrgRoleDefinition::getId, r -> r));
        if (defs.size() != ids.size()) {
            LOG.warn("org {} member {}: a role row points outside this organization; reading the legacy role", orgId, seat.getId());
            return Optional.empty();
        }
        OrgRoleDefinition primary = defs.get(primaries.get(0).getRoleId());
        String template = primary.getTemplateKey() != null ? primary.getTemplateKey() : primary.getRoleKey();
        Optional<com.dossier.api.domain.enumeration.OrgRole> mirrored = LegacyRoleMirror.toEnum(template);
        if (mirrored.isEmpty() || mirrored.get() != seat.getRole()) {
            LOG.warn("org {} member {}: primary role {} does not mirror the legacy role {}; reading the legacy role", orgId, seat.getId(), template, seat.getRole());
            return Optional.empty();
        }
        Map<String, PermissionScope> grants = new LinkedHashMap<>();
        for (OrgRolePermission p : permissions.findForRoles(orgId, ids)) {
            if (p.getScope() == null || p.getPermissionKey() == null) continue; // a malformed row grants nothing
            grants.merge(p.getPermissionKey(), p.getScope(), PermissionScope::widest);
        }
        if (grants.isEmpty()) {
            LOG.warn("org {} member {}: the roles have no permission rows (seeder not run?); reading the legacy role", orgId, seat.getId());
            return Optional.empty();
        }
        List<OrgMembership.RoleRef> refs = new ArrayList<>();
        for (OrgMemberRole mr : live) {
            OrgRoleDefinition d = defs.get(mr.getRoleId());
            refs.add(new OrgMembership.RoleRef(d.getId(), d.getRoleKey(), d.getName(), mr.isPrimary()));
        }
        return Optional.of(new RoleGrants(refs, grants));
    }

    // ---- read: GET /api/orgs/{orgId}/roles ------------------------------------------------------------------------

    /** The system templates and the organization's own roles with their permission rows; 404 when the roles flag is off for the org. */
    @Transactional(readOnly = true)
    public List<RoleDTO> list(OrgMembership me) {
        if (!rolesFromData(me.orgId())) throw new OrgNotFoundException();
        List<OrgRoleDefinition> defs = roles.findVisibleToOrg(me.orgId());
        if (defs.isEmpty()) return List.of();
        Map<Long, List<RoleDTO.PermissionDTO>> byRole = new LinkedHashMap<>();
        for (OrgRolePermission p : permissions.findForRoles(me.orgId(), defs.stream().map(OrgRoleDefinition::getId).toList())) {
            byRole
                .computeIfAbsent(p.getRoleId(), k -> new ArrayList<>())
                .add(new RoleDTO.PermissionDTO(p.getPermissionKey(), p.getScope().name(), p.getCeilingRoleKey(), p.getRowFilter()));
        }
        List<RoleDTO> out = new ArrayList<>();
        for (OrgRoleDefinition d : defs) {
            out.add(new RoleDTO(
                d.getId(), d.getRoleKey(), d.getName(), d.getDescription(), d.getTemplateKey(), d.isSystem(), d.isEditable(), d.getWorkspaceKey(),
                List.copyOf(byRole.getOrDefault(d.getId(), List.of()))
            ));
        }
        return out;
    }

    // ---- dual write -------------------------------------------------------------------------------------------------

    /**
     * Brings the seat's live primary role row in line with its legacy {@code role} enum (the dual write of 06 section 4 step 3
     * for the code paths that still write the enum). Idempotent; other (non-primary) role rows are left alone. A reserved role
     * (COACH) has no template and gets no row. Must run in the same transaction as the seat write.
     */
    @Transactional
    public void syncFromLegacy(OrgMember seat) {
        if (seat == null || seat.getId() == null || seat.getOrgId() == null || seat.getRole() == null) return;
        Optional<String> templateKey = LegacyRoleMirror.toTemplateKey(seat.getRole());
        if (templateKey.isEmpty()) return;
        Optional<OrgRoleDefinition> template = roles.findSystemByRoleKey(templateKey.get());
        if (template.isEmpty()) {
            LOG.warn("system role {} is not seeded; org {} member {} has no role row yet", templateKey.get(), seat.getOrgId(), seat.getId());
            return;
        }
        Long orgId = seat.getOrgId();
        List<OrgMemberRole> live = memberRoles.findLiveByOrgIdAndMemberId(orgId, seat.getId());
        Optional<OrgMemberRole> primary = live.stream().filter(OrgMemberRole::isPrimary).findFirst();
        if (primary.isPresent() && primary.get().getRoleId().equals(template.get().getId())) {
            if (!template.get().getId().equals(seat.getPrimaryRoleId())) {
                seat.setPrimaryRoleId(template.get().getId());
                members.save(seat);
            }
            return;
        }
        Instant now = Instant.now();
        primary.ifPresent(old -> {
            old.setPrimary(false);
            old.setEndsAt(now);
            memberRoles.saveAndFlush(old);
        });
        // The same template may be held as a non-primary role: end that row too, so the single live (member, role) slot is free.
        for (OrgMemberRole mr : live) {
            if (mr.getRoleId().equals(template.get().getId()) && mr.getEndsAt() == null && primary.map(p -> !p.getId().equals(mr.getId())).orElse(true)) {
                mr.setEndsAt(now);
                mr.setPrimary(false);
                memberRoles.saveAndFlush(mr);
            }
        }
        OrgMemberRole row = new OrgMemberRole();
        row.setOrgId(orgId);
        row.setMemberId(seat.getId());
        row.setRoleId(template.get().getId());
        row.setPrimary(true);
        row.setGrantedAt(now);
        memberRoles.saveAndFlush(row);
        seat.setPrimaryRoleId(template.get().getId());
        members.save(seat);
    }
}
