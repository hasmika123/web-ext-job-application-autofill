package com.dossier.api.web.rest;

import static org.assertj.core.api.Assertions.assertThat;

import com.dossier.api.domain.User;
import org.junit.jupiter.api.Test;

/** Who may hold an extension session of an organization (the connect-code mint and exchange). Pure, no Spring. */
class AuthenticateControllerBelongsToTest {

    private static User user(String login, Long orgId) {
        User u = new User();
        u.setLogin(login);
        u.setOrgId(orgId);
        return u;
    }

    @Test
    void anEnterpriseAccountBelongsToItsOwnOrganizationOnly() {
        assertThat(AuthenticateController.belongsTo(user("ent#3#cora@gamma.example.com", 3L), 3L)).isTrue();
        assertThat(AuthenticateController.belongsTo(user("ent#3#cora@gamma.example.com", 3L), 1L)).isFalse();
    }

    @Test
    void aSeededDemoMemberBelongsToTheTenantItSignedInOn() {
        assertThat(AuthenticateController.belongsTo(user("demo-ent-acme-anika", null), 1L)).isTrue();
        assertThat(AuthenticateController.belongsTo(user("demo-ent-acme-anika", null), null)).isFalse();
    }

    @Test
    void aPersonalAccountNeverDoes() {
        assertThat(AuthenticateController.belongsTo(user("jane", null), 1L)).isFalse();
        assertThat(AuthenticateController.belongsTo(null, 1L)).isFalse();
    }
}
