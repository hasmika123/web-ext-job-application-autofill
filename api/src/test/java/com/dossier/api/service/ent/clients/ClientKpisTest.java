package com.dossier.api.service.ent.clients;

import static org.assertj.core.api.Assertions.assertThat;

import com.dossier.api.domain.ent.talent.ClientAccount;
import com.dossier.api.domain.ent.talent.ClientRequirement;
import com.dossier.api.domain.ent.talent.TalentPlacement;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.List;
import org.junit.jupiter.api.Test;

/** The four tiles of the Clients page, from rows only (documented on {@link ClientKpis}). */
class ClientKpisTest {

    private static final Instant NOW = Instant.parse("2026-10-13T12:00:00Z");
    private static long id = 0;

    private static ClientAccount client(int createdDaysAgo) {
        ClientAccount c = new ClientAccount();
        c.setId(++id);
        c.setCreatedAt(NOW.minus(createdDaysAgo, ChronoUnit.DAYS));
        return c;
    }

    private static ClientRequirement req(String status, int postedDaysAgo, Integer closedDaysAgo) {
        ClientRequirement r = new ClientRequirement();
        r.setId(++id);
        r.setStatus(status);
        r.setPostedAt(NOW.minus(postedDaysAgo, ChronoUnit.DAYS));
        if (closedDaysAgo != null) r.setClosedAt(NOW.minus(closedDaysAgo, ChronoUnit.DAYS));
        return r;
    }

    private static TalentPlacement placement(int startedDaysAgo) {
        TalentPlacement p = new TalentPlacement();
        p.setId(++id);
        p.setStartDate(LocalDate.ofInstant(NOW.minus(startedDaysAgo, ChronoUnit.DAYS), ZoneOffset.UTC));
        return p;
    }

    @Test
    void totalClientsComparesWithTheClientsThatExistedAMonthAgo() {
        ClientKpis.Tiles t = ClientKpis.compute(List.of(client(200), client(100), client(40), client(5), client(2)), List.of(), List.of(), NOW);
        assertThat(t.total().value()).isEqualTo(5);
        assertThat(t.total().previous()).isEqualTo(3);
        assertThat(t.total().delta()).isEqualTo(2);
        assertThat(t.total().deltaPercent()).isEqualTo(66.7);
        assertThat(t.total().series()).hasSize(8);
        assertThat(t.total().series().get(7)).isEqualTo(5L);
        assertThat(t.total().series().get(0)).isEqualTo(2L);
    }

    @Test
    void newClientsThisMonthComparesWithTheMonthBefore() {
        ClientKpis.Tiles t = ClientKpis.compute(List.of(client(200), client(50), client(40), client(5), client(2), client(1)), List.of(), List.of(), NOW);
        assertThat(t.fresh().value()).isEqualTo(3);
        assertThat(t.fresh().previous()).isEqualTo(2);
        assertThat(t.fresh().delta()).isEqualTo(1);
    }

    @Test
    void activeRequirementsAreTheOpenOnesAndLastMonthIsWhatWasOpenThen() {
        List<ClientRequirement> reqs = List.of(req("OPEN", 60, null), req("OPEN", 5, null), req("FILLED", 90, 10), req("CLOSED", 90, 50), req("ON_HOLD", 90, null));
        ClientKpis.Tiles t = ClientKpis.compute(List.of(client(100)), reqs, List.of(), NOW);
        assertThat(t.requirements().value()).isEqualTo(2);
        assertThat(t.requirements().previous()).isEqualTo(2);
    }

    @Test
    void placementsViaClientsCountEveryPlacementAndLastMonthIsThoseAlreadyStarted() {
        ClientKpis.Tiles t = ClientKpis.compute(List.of(client(100)), List.of(), List.of(placement(200), placement(60), placement(10), placement(1)), NOW);
        assertThat(t.placements().value()).isEqualTo(4);
        assertThat(t.placements().previous()).isEqualTo(2);
        assertThat(t.placements().delta()).isEqualTo(2);
        assertThat(t.placements().deltaPercent()).isEqualTo(100.0);
    }

    @Test
    void anOrganizationWithNothingOlderThanAMonthHasNoDeltaAndNoEstimate() {
        ClientKpis.Tiles t = ClientKpis.compute(List.of(client(10), client(3)), List.of(req("OPEN", 4, null)), List.of(placement(2)), NOW);
        for (var tile : List.of(t.total(), t.requirements(), t.fresh(), t.placements())) {
            assertThat(tile.previous()).isNull();
            assertThat(tile.delta()).isNull();
            assertThat(tile.deltaPercent()).isNull();
        }
        assertThat(t.total().value()).isEqualTo(2);
        assertThat(t.fresh().value()).isEqualTo(2);
    }

    @Test
    void aZeroPreviousHasADeltaButNoPercent() {
        ClientKpis.Tiles t = ClientKpis.compute(List.of(client(200), client(3)), List.of(), List.of(), NOW);
        assertThat(t.fresh().previous()).isZero();
        assertThat(t.fresh().delta()).isEqualTo(1);
        assertThat(t.fresh().deltaPercent()).isNull();
    }
}
