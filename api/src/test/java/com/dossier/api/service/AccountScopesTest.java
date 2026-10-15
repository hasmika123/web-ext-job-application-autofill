package com.dossier.api.service;

import com.dossier.api.security.LoginWorld;
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
import com.dossier.api.service.ent.TenantContext;
import com.dossier.api.service.ent.TenantContextHolder;
import java.util.Optional;
import org.junit.jupiter.api.AfterEach;
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

    @AfterEach
    void clearContext() {
        TenantContextHolder.clear();
    }

    @Test
    void theLoginWorldFollowsTheHostOnlyWhileTheSwitchIsOn() {
        org(5, OrgAccountMode.SEPARATE);
        org(6, OrgAccountMode.SHARED);
        TenantContextHolder.set(TenantContext.tenant(5L, null, "acme.kiwiply.com"));
        assertThat(scopes.loginWorld()).as("switch off").isEqualTo(LoginWorld.LEGACY);

        fake.put(EnterpriseSettingKeys.SEPARATE_ACCOUNTS, "true");
        assertThat(scopes.loginWorld().enterprise()).isTrue();
        assertThat(scopes.loginWorld().orgId()).isEqualTo(5L);
        assertThat(scopes.loginWorld().key()).isEqualTo("E5");
        TenantContextHolder.set(TenantContext.tenant(6L, null, "shared.kiwiply.com"));
        assertThat(scopes.loginWorld()).as("legacy SHARED host is the personal world").isEqualTo(new LoginWorld(true, null));
        TenantContextHolder.set(TenantContext.platform("kiwiply.com"));
        assertThat(scopes.loginWorld().enterprise()).isFalse();
        assertThat(scopes.loginWorld().enforced()).isTrue();
        assertThat(scopes.loginWorld().key()).isEqualTo("P");
        TenantContextHolder.clear();
        assertThat(scopes.loginWorld().enforced()).as("no tenant context: personal world").isTrue();
        assertThat(scopes.loginWorld().orgId()).isNull();
    }

    @Test
    void aTokenMustComeFromTheWorldOfItsHost() {
        org(5, OrgAccountMode.SEPARATE);
        org(6, OrgAccountMode.SHARED);
        Optional<TenantContext> separateHost = Optional.of(TenantContext.tenant(5L, null, "acme.kiwiply.com"));
        Optional<TenantContext> sharedHost = Optional.of(TenantContext.tenant(6L, null, "shared.kiwiply.com"));
        Optional<TenantContext> platform = Optional.of(TenantContext.platform("kiwiply.com"));
        Optional<TenantContext> noHost = Optional.of(TenantContext.unknown(null, TenantContext.Reason.NO_HOST));

        assertThat(scopes.tokenFitsWorld(null, separateHost)).as("switch off: no opinion").isTrue();
        fake.put(EnterpriseSettingKeys.SEPARATE_ACCOUNTS, "true");

        assertThat(scopes.tokenFitsWorld(5L, separateHost)).isTrue();
        assertThat(scopes.tokenFitsWorld(null, separateHost)).as("personal token on an enterprise host").isFalse();
        assertThat(scopes.tokenFitsWorld(null, platform)).isTrue();
        assertThat(scopes.tokenFitsWorld(5L, platform)).as("enterprise token on the platform").isFalse();
        assertThat(scopes.tokenFitsWorld(5L, noHost)).isFalse();
        assertThat(scopes.tokenFitsWorld(5L, Optional.empty())).isFalse();
        assertThat(scopes.tokenFitsWorld(6L, platform)).as("a legacy SHARED organization's tid is still fine").isTrue();
        assertThat(scopes.tokenFitsWorld(null, sharedHost)).isTrue();
        assertThat(scopes.tokenFitsWorld(6L, sharedHost)).isTrue();
    }

    @Test
    void anAccountsTokenCarriesItsOwnOrganizationOrNone() {
        org(5, OrgAccountMode.SEPARATE);
        org(6, OrgAccountMode.SHARED);
        fake.put(EnterpriseSettingKeys.SEPARATE_ACCOUNTS, "true");
        assertThat(scopes.tokenFitsAccount(5L, 5L)).isTrue();
        assertThat(scopes.tokenFitsAccount(null, 5L)).as("an enterprise account always has a tid").isFalse();
        assertThat(scopes.tokenFitsAccount(7L, 5L)).isFalse();
        assertThat(scopes.tokenFitsAccount(null, null)).isTrue();
        assertThat(scopes.tokenFitsAccount(5L, null)).as("a personal account never has an enterprise tid").isFalse();
        assertThat(scopes.tokenFitsAccount(6L, null)).as("legacy SHARED membership keeps its tid").isTrue();
    }
}
