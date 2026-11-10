package com.dossier.api.service.ent.clients;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import org.junit.jupiter.api.Test;

/** The health badge rule of the Clients page, as documented on {@link ClientHealth}: thresholds come from settings, never from the code. */
class ClientHealthTest {

    private static final Instant NOW = Instant.parse("2026-10-13T12:00:00Z");
    private static final ClientsSettings.Thresholds DEFAULTS = new ClientsSettings.Thresholds(14, 45);

    private static Instant ago(int days) {
        return NOW.minus(days, ChronoUnit.DAYS);
    }

    private static String level(String status, int quietDays, long open, long active, ClientsSettings.Thresholds t) {
        return ClientHealth.of(status, ago(quietDays), open, active, NOW, t).level();
    }

    @Test
    void recentActivityWithWorkInFlightIsHealthy() {
        assertThat(level("ACTIVE", 0, 3, 0, DEFAULTS)).isEqualTo(ClientHealth.HEALTHY);
        assertThat(level("ACTIVE", 14, 0, 2, DEFAULTS)).as("the healthy window is inclusive").isEqualTo(ClientHealth.HEALTHY);
    }

    @Test
    void recentActivityWithNothingInFlightIsNeutral() {
        assertThat(level("ACTIVE", 2, 0, 0, DEFAULTS)).isEqualTo(ClientHealth.NEUTRAL);
    }

    @Test
    void quietForAWhileButNotLongIsNeutral() {
        assertThat(level("ACTIVE", 15, 4, 4, DEFAULTS)).isEqualTo(ClientHealth.NEUTRAL);
        assertThat(level("ACTIVE", 44, 4, 4, DEFAULTS)).isEqualTo(ClientHealth.NEUTRAL);
    }

    @Test
    void silenceForTheAtRiskWindowIsAtRiskWhateverIsOpen() {
        assertThat(level("ACTIVE", 45, 4, 4, DEFAULTS)).isEqualTo(ClientHealth.AT_RISK);
        assertThat(level("ACTIVE", 200, 0, 0, DEFAULTS)).isEqualTo(ClientHealth.AT_RISK);
    }

    @Test
    void prospectsAndInactiveClientsAreNeverRated() {
        assertThat(level("PROSPECT", 300, 0, 0, DEFAULTS)).isEqualTo(ClientHealth.NEUTRAL);
        assertThat(level("INACTIVE", 1, 5, 5, DEFAULTS)).isEqualTo(ClientHealth.NEUTRAL);
    }

    @Test
    void theThresholdsAreTheOrganizationsOwn() {
        ClientsSettings.Thresholds strict = new ClientsSettings.Thresholds(3, 7);
        assertThat(level("ACTIVE", 5, 2, 0, strict)).isEqualTo(ClientHealth.NEUTRAL);
        assertThat(level("ACTIVE", 7, 2, 0, strict)).isEqualTo(ClientHealth.AT_RISK);
        ClientsSettings.Thresholds lax = new ClientsSettings.Thresholds(60, 120);
        assertThat(level("ACTIVE", 50, 2, 0, lax)).isEqualTo(ClientHealth.HEALTHY);
        assertThat(level("ACTIVE", 100, 2, 0, lax)).isEqualTo(ClientHealth.NEUTRAL);
    }

    @Test
    void everyAnswerCarriesTheSentenceOfItsRule() {
        assertThat(ClientHealth.of("ACTIVE", ago(60), 1, 1, NOW, DEFAULTS).reason()).contains("60 days").contains("45");
        assertThat(ClientHealth.of("ACTIVE", ago(1), 1, 0, NOW, DEFAULTS).reason()).contains("14 days");
        assertThat(ClientHealth.of("ACTIVE", null, 0, 0, NOW, DEFAULTS).level()).as("no activity at all").isEqualTo(ClientHealth.AT_RISK);
    }
}
