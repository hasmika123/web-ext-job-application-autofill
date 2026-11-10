package com.dossier.api.service.ent;

import static org.assertj.core.api.Assertions.assertThat;

import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.PermissionScope;
import org.junit.jupiter.api.Test;

class LegacyRoleMirrorTest {

    @Test
    void everyLegacyRoleBackfillsToATemplateThatMirrorsBackToItself() {
        for (OrgRole r : OrgRole.values()) {
            if (r == OrgRole.COACH) {
                assertThat(LegacyRoleMirror.toTemplateKey(r)).as("COACH is reserved: no template").isEmpty();
                continue;
            }
            String key = LegacyRoleMirror.toTemplateKey(r).orElseThrow();
            assertThat(RoleTemplates.find(key)).as(key).isPresent();
            assertThat(LegacyRoleMirror.toEnum(key)).as(key).contains(r);
        }
    }

    @Test
    void theNewTemplatesMirrorToTheNearestLegacyRoleAsSpecified() {
        assertThat(LegacyRoleMirror.toEnum("ORG_ADMIN")).contains(OrgRole.ADMIN);
        assertThat(LegacyRoleMirror.toEnum("MARKETING_SPECIALIST")).contains(OrgRole.MARKETER);
        assertThat(LegacyRoleMirror.toEnum("MARKETING_MANAGER")).contains(OrgRole.MARKETER);
        for (String k : new String[] { "HR_SPECIALIST", "ACCOUNT_MANAGER", "TALENT_ACQUISITION", "EXECUTIVE_VIEWER" }) {
            assertThat(LegacyRoleMirror.toEnum(k)).as(k).contains(OrgRole.STAFF);
        }
        assertThat(LegacyRoleMirror.toEnum("CONSULTANT")).contains(OrgRole.MEMBER);
        assertThat(LegacyRoleMirror.toEnum("FINANCE_SPECIALIST")).contains(OrgRole.FINANCE);
        assertThat(LegacyRoleMirror.toEnum("OWNER")).contains(OrgRole.OWNER);
    }

    @Test
    void everySystemTemplateHasAMirrorAndAnUnknownKeyHasNone() {
        for (RoleTemplates.Template t : RoleTemplates.all()) assertThat(LegacyRoleMirror.toEnum(t.key())).as(t.key()).isPresent();
        assertThat(LegacyRoleMirror.toEnum("COACH")).isEmpty();
        assertThat(LegacyRoleMirror.toEnum("MY_CUSTOM_ROLE")).isEmpty();
        assertThat(LegacyRoleMirror.toEnum(null)).isEmpty();
        assertThat(LegacyRoleMirror.toTemplateKey(null)).isEmpty();
    }

    @Test
    void permissionScopeIsOrderedAndWidestWins() {
        assertThat(PermissionScope.values()).containsExactly(
            PermissionScope.OWN, PermissionScope.ASSIGNED, PermissionScope.TEAM, PermissionScope.DEPARTMENT, PermissionScope.ORG
        );
        assertThat(PermissionScope.widest(PermissionScope.TEAM, PermissionScope.ORG)).isEqualTo(PermissionScope.ORG);
        assertThat(PermissionScope.widest(PermissionScope.ORG, PermissionScope.OWN)).isEqualTo(PermissionScope.ORG);
        assertThat(PermissionScope.widest(null, PermissionScope.OWN)).isEqualTo(PermissionScope.OWN);
        assertThat(PermissionScope.widest(PermissionScope.OWN, null)).isEqualTo(PermissionScope.OWN);
        assertThat(PermissionScope.ORG.covers(PermissionScope.DEPARTMENT)).isTrue();
        assertThat(PermissionScope.ASSIGNED.covers(PermissionScope.TEAM)).isFalse();
        assertThat(PermissionScope.OWN.covers(null)).isFalse();
        assertThat(PermissionScope.ofName("TEAM")).contains(PermissionScope.TEAM);
        assertThat(PermissionScope.ofName("team")).isEmpty();
        assertThat(PermissionScope.ofName(null)).isEmpty();
    }
}
