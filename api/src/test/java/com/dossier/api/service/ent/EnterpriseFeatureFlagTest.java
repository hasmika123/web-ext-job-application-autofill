package com.dossier.api.service.ent;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.ai.FakeSettings;
import com.dossier.api.service.settings.EnterpriseSettingKeys;
import com.fasterxml.jackson.databind.JsonNode;
import java.util.HashSet;
import java.util.Set;
import org.junit.jupiter.api.Test;

/** X1.1: the flag JSON {on, pct, allow, deny} over organization ids: deny wins, allow narrows, fails closed on anything odd. */
class EnterpriseFeatureFlagTest {

    private static final long ACME = 12L;
    private static final long BETA = 13L;

    private final FakeSettings fake = new FakeSettings();
    private final EnterpriseFeatureFlag flag = new EnterpriseFeatureFlag(fake.settings);

    private void master(String json) {
        fake.put(EnterpriseSettingKeys.FLAG_ENTERPRISE, json);
    }

    @Test
    void withNothingStoredEverythingIsOff() {
        assertThat(flag.isEnabled()).isFalse();
        assertThat(flag.isEnabled(ACME)).isFalse();
        assertThat(flag.isEnabled(EnterpriseSettingKeys.FLAG_DOMAINS, ACME)).isFalse();
        assertThat(flag.isEnabled((Long) null)).isFalse();
    }

    @Test
    void onWithNoListsIsOnForEveryOrganization() {
        master("{\"on\":true}");
        assertThat(flag.isEnabled()).isTrue();
        assertThat(flag.isEnabled(ACME)).isTrue();
        assertThat(flag.isEnabled(BETA)).isTrue();
        assertThat(flag.isEnabled((Long) null)).isTrue(); // org-less callers (the public tenant endpoint) see "on"
    }

    @Test
    void anAllowListNarrowsTheFlagToTheOrganizationsNamed() {
        master("{\"on\":true,\"allow\":[" + ACME + "]}");
        assertThat(flag.isEnabled(ACME)).isTrue();
        assertThat(flag.isEnabled(BETA)).as("beta is not in the allow list: as if the flag were off").isFalse();
        assertThat(flag.isEnabled((Long) null)).isFalse();
        assertThat(flag.isEnabled()).as("the org-less gate still says somebody has it").isTrue();
    }

    @Test
    void allowListEntriesMayBeIntegersOrDigitStrings() {
        master("{\"on\":true,\"allow\":[\"" + ACME + "\"," + BETA + "]}");
        assertThat(flag.isEnabled(ACME)).isTrue();
        assertThat(flag.isEnabled(BETA)).isTrue();
        assertThat(flag.isEnabled(99L)).isFalse();
    }

    @Test
    void denyAlwaysWins() {
        master("{\"on\":true,\"deny\":[" + BETA + "]}");
        assertThat(flag.isEnabled(ACME)).isTrue();
        assertThat(flag.isEnabled(BETA)).isFalse();
        master("{\"on\":true,\"allow\":[" + ACME + "," + BETA + "],\"deny\":[" + BETA + "]}");
        assertThat(flag.isEnabled(ACME)).isTrue();
        assertThat(flag.isEnabled(BETA)).isFalse();
    }

    @Test
    void offIsAMasterKillSwitchEvenWithAnAllowList() {
        master("{\"on\":false,\"allow\":[" + ACME + "],\"pct\":100}");
        assertThat(flag.isEnabled()).isFalse();
        assertThat(flag.isEnabled(ACME)).isFalse();
    }

    @Test
    void aPercentageRolloutIsStablePerOrganizationAndRoughlyProportional() {
        master("{\"on\":true,\"pct\":30}");
        Set<Long> first = new HashSet<>();
        for (long id = 1; id <= 1000; id++) if (flag.isEnabled(id)) first.add(id);
        Set<Long> second = new HashSet<>();
        for (long id = 1; id <= 1000; id++) if (flag.isEnabled(id)) second.add(id);
        assertThat(second).as("an organization never flips between reads").isEqualTo(first);
        assertThat(first.size()).isBetween(200, 400);
        assertThat(flag.isEnabled((Long) null)).as("no org id, no bucket: closed").isFalse();
    }

    @Test
    void zeroAndHundredPercentMeanEveryone() {
        master("{\"on\":true,\"pct\":0}");
        assertThat(flag.isEnabled(ACME)).isTrue();
        master("{\"on\":true,\"pct\":100}");
        assertThat(flag.isEnabled(ACME)).isTrue();
    }

    @Test
    void aSubFlagNeedsTheMasterFlagToo() {
        fake.put(EnterpriseSettingKeys.FLAG_DOMAINS, "{\"on\":true}");
        assertThat(flag.isEnabled(EnterpriseSettingKeys.FLAG_DOMAINS, ACME)).as("master is off").isFalse();
        assertThat(flag.isEnabledAnywhere(EnterpriseSettingKeys.FLAG_DOMAINS)).isFalse();

        master("{\"on\":true}");
        assertThat(flag.isEnabled(EnterpriseSettingKeys.FLAG_DOMAINS, ACME)).isTrue();
        assertThat(flag.isEnabledAnywhere(EnterpriseSettingKeys.FLAG_DOMAINS)).isTrue();
        assertThat(flag.isEnabled(EnterpriseSettingKeys.FLAG_ROLES, ACME)).as("another sub-flag stays off").isFalse();

        master("{\"on\":true,\"allow\":[" + BETA + "]}");
        assertThat(flag.isEnabled(EnterpriseSettingKeys.FLAG_DOMAINS, ACME)).as("acme is outside the master allow list").isFalse();
    }

    @Test
    void anUnknownOrForeignKeyIsOff() {
        master("{\"on\":true}");
        assertThat(flag.isEnabled("flag.autopilot", ACME)).isFalse();
        assertThat(flag.isEnabled("flag.enterprise.nope", ACME)).isFalse();
        assertThat(flag.isEnabled(null, ACME)).isFalse();
        assertThat(flag.isEnabledAnywhere(null)).isFalse();
    }

    @Test
    void aMalformedValueFailsClosed() {
        for (String bad : new String[] { "{\"on\":\"yes\"}", "[true]", "{\"pct\":50}", "{\"on\":true,\"allow\":\"12\"}", "{\"on\":true,\"allow\":[\"acme\"]}", "{\"on\":true,\"allow\":[0]}", "not json" }) {
            master(bad); // an invalid stored row is ignored by the settings layer, so the default (off) applies
            assertThat(flag.isEnabled(ACME)).as(bad).isFalse();
        }
        // and the pure parser agrees for shapes the settings layer would let through
        assertThat(EnterpriseFeatureFlag.Rule.parse(null).on()).isFalse();
        assertThat(EnterpriseFeatureFlag.Rule.parse(fake.mapper.createObjectNode()).on()).isFalse();
    }

    @Test
    void ifTheSettingsCannotBeReadTheFlagIsOff() {
        ResumeBuilderSettings broken = mock(ResumeBuilderSettings.class);
        when(broken.getJson(anyString(), org.mockito.ArgumentMatchers.<Class<JsonNode>>any())).thenThrow(new IllegalStateException("db down"));
        EnterpriseFeatureFlag f = new EnterpriseFeatureFlag(broken);
        assertThat(f.isEnabled()).isFalse();
        assertThat(f.isEnabled(ACME)).isFalse();
        assertThat(f.isEnabled(EnterpriseSettingKeys.FLAG_DOMAINS, ACME)).isFalse();
        assertThat(f.isEnabledAnywhere(EnterpriseSettingKeys.FLAG_DOMAINS)).isFalse();
    }
}
