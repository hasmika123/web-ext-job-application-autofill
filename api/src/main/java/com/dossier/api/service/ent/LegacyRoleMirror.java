package com.dossier.api.service.ent;

import com.dossier.api.domain.enumeration.OrgRole;
import java.util.Optional;

/**
 * The mapping between a role template and the legacy {@link OrgRole} enum column {@code org_member.role}
 * (docs/enterprise-v2/06-phase-plan.md section 4 step 3, ADR-023). The column stays and mirrors the PRIMARY template of the
 * member, so everything that still reads the enum keeps working while roles become data.
 *
 * <p>X1.6 uses the READ direction (is the stored primary role consistent with the enum? what template does a legacy seat
 * get?); X1.14 adds the writes that keep them in step. A template that has no clean legacy equivalent mirrors to the nearest
 * enum value of the spec: the marketing templates to MARKETER, HR / accounts / talent / executive to STAFF, CONSULTANT to
 * MEMBER. The mirror never decides a permission for a member whose roles are read from data; it only labels the seat for
 * legacy callers.
 */
public final class LegacyRoleMirror {

    private LegacyRoleMirror() {}

    /** The template a legacy enum value backfills to; empty for the reserved COACH. */
    public static Optional<String> toTemplateKey(OrgRole role) {
        if (role == null) return Optional.empty();
        return switch (role) {
            case OWNER -> Optional.of(RoleTemplates.OWNER);
            case ADMIN -> Optional.of(RoleTemplates.ORG_ADMIN);
            case STAFF -> Optional.of(RoleTemplates.STAFF);
            case MEMBER -> Optional.of(RoleTemplates.MEMBER);
            case MARKETER -> Optional.of(RoleTemplates.MARKETING_SPECIALIST);
            case FINANCE -> Optional.of(RoleTemplates.FINANCE_SPECIALIST);
            case COACH -> Optional.empty();
        };
    }

    /** The enum value a template mirrors to; empty for a key that is not a system template (the caller then trusts the enum). */
    public static Optional<OrgRole> toEnum(String templateKey) {
        if (templateKey == null) return Optional.empty();
        return switch (templateKey) {
            case RoleTemplates.OWNER -> Optional.of(OrgRole.OWNER);
            case RoleTemplates.ORG_ADMIN -> Optional.of(OrgRole.ADMIN);
            case RoleTemplates.STAFF, RoleTemplates.HR_SPECIALIST, RoleTemplates.ACCOUNT_MANAGER, RoleTemplates.TALENT_ACQUISITION, RoleTemplates.EXECUTIVE_VIEWER ->
                Optional.of(OrgRole.STAFF);
            case RoleTemplates.MEMBER, RoleTemplates.CONSULTANT -> Optional.of(OrgRole.MEMBER);
            case RoleTemplates.MARKETING_SPECIALIST, RoleTemplates.MARKETING_MANAGER -> Optional.of(OrgRole.MARKETER);
            case RoleTemplates.FINANCE_SPECIALIST -> Optional.of(OrgRole.FINANCE);
            default -> Optional.empty();
        };
    }
}
