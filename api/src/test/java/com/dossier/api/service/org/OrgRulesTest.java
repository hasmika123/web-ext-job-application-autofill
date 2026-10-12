package com.dossier.api.service.org;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgType;
import org.junit.jupiter.api.Test;

/** O1.1: COACH is reserved for both the organization type and the member role (tenant-model.md decision 10). */
class OrgRulesTest {

    @Test
    void coachTypeIsRejectedWith422() {
        assertThatThrownBy(() -> OrgRules.requireAssignable(OrgType.COACH))
            .isInstanceOfSatisfying(OrgException.class, e -> {
                assertThat(e.getStatus()).isEqualTo(422);
                assertThat(e.getCode()).isEqualTo(OrgException.CODE_RESERVED_VALUE);
                assertThat(e.getExtra()).containsEntry("field", "type");
            });
    }

    @Test
    void coachRoleIsRejectedWith422() {
        assertThatThrownBy(() -> OrgRules.requireAssignable(OrgRole.COACH))
            .isInstanceOfSatisfying(OrgException.class, e -> {
                assertThat(e.getStatus()).isEqualTo(422);
                assertThat(e.getExtra()).containsEntry("field", "role");
            });
    }

    @Test
    void everyOtherValueIsAssignable() {
        for (OrgType t : OrgType.values()) {
            if (t != OrgType.COACH) assertThat(OrgRules.requireAssignable(t)).isEqualTo(t);
        }
        for (OrgRole r : OrgRole.values()) {
            if (r != OrgRole.COACH) assertThat(OrgRules.requireAssignable(r)).isEqualTo(r);
        }
    }

    @Test
    void aMissingValueIsInvalidNotReserved() {
        assertThatThrownBy(() -> OrgRules.requireAssignable((OrgType) null))
            .isInstanceOfSatisfying(OrgException.class, e -> assertThat(e.getCode()).isEqualTo(OrgException.CODE_ORG_INVALID));
    }

    @Test
    void notFoundIsGenericAndNeverSaysForbidden() {
        OrgNotFoundException e = new OrgNotFoundException();
        assertThat(e.getStatus()).isEqualTo(404);
        assertThat(e.getMessage().toLowerCase()).doesNotContain("forbidden").doesNotContain("permission").doesNotContain("denied");
        assertThat(e.getExtra()).isEmpty();
    }
}
