package com.dossier.api.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.User;
import com.dossier.api.domain.enumeration.OrgAccountMode;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.ai.FakeSettings;
import com.dossier.api.service.settings.EnterpriseSettingKeys;
import java.util.Optional;
import org.junit.jupiter.api.Test;

/** Decision O4: an organization's members are looked up among its own enterprise accounts only when the switch is on AND the organization is SEPARATE. */
class AccountScopesTest {

    private final FakeSettings fake = new FakeSettings();
    private final OrganizationRepository orgs = mock(OrganizationRepository.class);
    private final UserRepository users = mock(UserRepository.class);
    private final AccountScopes scopes = new AccountScopes(fake.settings, orgs, users);

    private Organization org(long id, OrgAccountMode mode) {
        Organization o = new Organization();
        o.setId(id);
        o.setAccountMode(mode);
        when(orgs.findByOrgId(id)).thenReturn(Optional.of(o));
        return o;
    }

    @Test
    void theSwitchIsOffByDefaultAndEverythingIsPersonal() {
        org(5, OrgAccountMode.SEPARATE);
        assertThat(scopes.separateAccountsEnabled()).isFalse();
        assertThat(scopes.scopeOf(5L)).isNull();
    }

    @Test
    void aSeparateOrganizationGetsItsOwnScopeOnlyWhileTheSwitchIsOn() {
        org(5, OrgAccountMode.SEPARATE);
        fake.put(EnterpriseSettingKeys.SEPARATE_ACCOUNTS, "true");
        assertThat(scopes.scopeOf(5L)).isEqualTo(5L);
        fake.put(EnterpriseSettingKeys.SEPARATE_ACCOUNTS, "false");
        assertThat(scopes.scopeOf(5L)).isNull();
    }

    @Test
    void aSharedOrganizationStaysPersonalEvenWithTheSwitchOn() {
        org(6, OrgAccountMode.SHARED);
        fake.put(EnterpriseSettingKeys.SEPARATE_ACCOUNTS, "true");
        assertThat(scopes.scopeOf(6L)).isNull();
        assertThat(scopes.scopeOf(null)).isNull();
        assertThat(scopes.scopeOf(99L)).as("unknown organization").isNull();
    }

    @Test
    void aFailingDatabaseFailsClosedToThePersonalScope() {
        fake.put(EnterpriseSettingKeys.SEPARATE_ACCOUNTS, "true");
        when(orgs.findByOrgId(7L)).thenThrow(new IllegalStateException("db down"));
        assertThat(scopes.scopeOf(7L)).isNull();
    }

    @Test
    void theMemberLookupUsesTheResolvedScope() {
        org(5, OrgAccountMode.SEPARATE);
        User enterprise = new User();
        when(users.findOneByScopeAndEmail(5L, "a@b.test")).thenReturn(Optional.of(enterprise));
        when(users.findOneByScopeAndEmail(null, "a@b.test")).thenReturn(Optional.empty());

        assertThat(scopes.findMemberAccountByEmail(5L, "a@b.test")).as("switch off: personal scope").isEmpty();
        fake.put(EnterpriseSettingKeys.SEPARATE_ACCOUNTS, "true");
        assertThat(scopes.findMemberAccountByEmail(5L, "a@b.test")).containsSame(enterprise);
        verify(users).findOneByScopeAndEmail(5L, "a@b.test");
    }

    @Test
    void theEmailCacheKeyIsScopedAndCaseInsensitive() {
        assertThat(UserRepository.emailCacheKey(null, "Ab@C.test")).isEqualTo("P:ab@c.test");
        assertThat(UserRepository.emailCacheKey(12L, "Ab@C.test")).isEqualTo("E12:ab@c.test");
        assertThat(UserRepository.emailCacheKey(null, null)).isEqualTo("P:");
    }
}
