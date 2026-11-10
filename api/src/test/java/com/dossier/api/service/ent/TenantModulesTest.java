package com.dossier.api.service.ent;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.never;

import com.dossier.api.service.settings.EnterpriseSettingKeys;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/** The eight module booleans of the tenant session contract (12-identity.md section 3, 09 row 2). */
class TenantModulesTest {

    private static final List<String> CONTRACT = List.of("domains", "roles", "billing", "marketing", "hrFinance", "extensionWorkspaces", "integrations", "analytics");

    @Test
    void theKeysAreExactlyTheEightOfTheContractInOrder() {
        EnterpriseFeatureFlag flag = mock(EnterpriseFeatureFlag.class);
        assertThat(new TenantModules(flag).forOrg(1L).keySet()).containsExactlyElementsOf(CONTRACT);
        assertThat(java.util.Arrays.stream(TenantModule.values()).map(TenantModule::wire).toList()).containsExactlyElementsOf(CONTRACT);
    }

    @Test
    void aModuleIsOnExactlyWhenItsFlagIsOnForThatOrganization() {
        EnterpriseFeatureFlag flag = mock(EnterpriseFeatureFlag.class);
        when(flag.isEnabled(EnterpriseSettingKeys.FLAG_ROLES, 5L)).thenReturn(true);
        when(flag.isEnabled(EnterpriseSettingKeys.FLAG_DOMAINS, 6L)).thenReturn(true);
        TenantModules modules = new TenantModules(flag);
        Map<String, Boolean> five = modules.forOrg(5L);
        assertThat(five.get("roles")).isTrue();
        assertThat(five.get("domains")).isFalse();
        assertThat(modules.forOrg(6L).get("domains")).isTrue();
        assertThat(modules.forOrg(6L).get("roles")).isFalse();
    }

    @Test
    void aFlagThatIsOnlyDeclaredIsOffWithoutAnyLookup() {
        EnterpriseFeatureFlag flag = mock(EnterpriseFeatureFlag.class);
        when(flag.isEnabled(anyString(), anyLong())).thenReturn(true);
        Map<String, Boolean> m = new TenantModules(flag).forOrg(5L);
        // billing, hrFinance, extensionWorkspaces, integrations and analytics are deferred keys: nobody can have switched them on yet
        // (marketing went live with the Marketing workspace pages: it reads its flag like domains and roles do)
        for (String deferred : List.of("billing", "hrFinance", "extensionWorkspaces", "integrations", "analytics")) {
            assertThat(m.get(deferred)).as(deferred).isFalse();
        }
        verify(flag, never()).isEnabled(EnterpriseSettingKeys.FLAG_BILLING, 5L);
        verify(flag, never()).isEnabled(EnterpriseSettingKeys.FLAG_HR_FINANCE, 5L);
        assertThat(m.get("marketing")).isTrue();
    }

    @Test
    void aMissingOrganizationFailsClosed() {
        EnterpriseFeatureFlag flag = mock(EnterpriseFeatureFlag.class);
        when(flag.isEnabled(anyString(), anyLong())).thenReturn(true);
        assertThat(new TenantModules(flag).forOrg(null).values()).containsOnly(false);
    }
}
