package com.dossier.api.service.ent.offers;

import static org.assertj.core.api.Assertions.assertThat;

import com.dossier.api.domain.ent.consultantws.CwsOffer;
import com.dossier.api.domain.ent.talent.TalentPlacement;
import com.dossier.api.service.ent.placements.PlacementRules;
import java.time.LocalDate;
import org.junit.jupiter.api.Test;

/** The pure offer and placement-display rules (no database). */
class OfferRulesTest {

    private static final LocalDate TODAY = LocalDate.of(2026, 10, 16);

    @Test
    void storedValuesMapToTheSevenOrgStates() {
        assertThat(OfferRules.state(CwsOffer.DRAFT, null, TODAY)).isEqualTo("DRAFT");
        assertThat(OfferRules.state(CwsOffer.PENDING_REVIEW, null, TODAY)).isEqualTo("EXTENDED");
        assertThat(OfferRules.state(CwsOffer.NEGOTIATION, null, TODAY)).isEqualTo("NEGOTIATING");
        assertThat(OfferRules.state(CwsOffer.ACCEPTED, null, TODAY)).isEqualTo("ACCEPTED");
        assertThat(OfferRules.state(CwsOffer.DECLINED, null, TODAY)).isEqualTo("DECLINED");
        assertThat(OfferRules.state(CwsOffer.WITHDRAWN, null, TODAY)).isEqualTo("WITHDRAWN");
        assertThat(OfferRules.state(CwsOffer.EXPIRED, null, TODAY)).isEqualTo("EXPIRED");
        assertThat(CwsOffer.EXTENDED).as("EXTENDED is the stored PENDING_REVIEW").isEqualTo(CwsOffer.PENDING_REVIEW);
    }

    @Test
    void anOpenOfferPastItsDeadlineDayReadsExpiredButTheDeadlineDayItselfIsStillOpen() {
        assertThat(OfferRules.state(CwsOffer.PENDING_REVIEW, TODAY.minusDays(1), TODAY)).isEqualTo("EXPIRED");
        assertThat(OfferRules.state(CwsOffer.NEGOTIATION, TODAY.minusDays(1), TODAY)).isEqualTo("EXPIRED");
        assertThat(OfferRules.state(CwsOffer.PENDING_REVIEW, TODAY, TODAY)).isEqualTo("EXTENDED");
        assertThat(OfferRules.state(CwsOffer.ACCEPTED, TODAY.minusDays(30), TODAY)).as("an answered offer never expires").isEqualTo("ACCEPTED");
        assertThat(OfferRules.state(CwsOffer.DECLINED, TODAY.minusDays(30), TODAY)).isEqualTo("DECLINED");
    }

    @Test
    void whatTheOrgMayDoDependsOnTheState() {
        assertThat(OfferRules.canEdit("DRAFT")).isTrue();
        assertThat(OfferRules.canEdit("EXTENDED")).isTrue();
        assertThat(OfferRules.canEdit("NEGOTIATING")).isTrue();
        for (String closed : new String[] { "ACCEPTED", "DECLINED", "EXPIRED", "WITHDRAWN" }) {
            assertThat(OfferRules.canEdit(closed)).as(closed).isFalse();
            assertThat(OfferRules.canWithdraw(closed)).as(closed).isFalse();
            assertThat(OfferRules.canExtend(closed)).as(closed).isFalse();
        }
        assertThat(OfferRules.canExtend("DRAFT")).isTrue();
        assertThat(OfferRules.canExtend("EXTENDED")).isFalse();
        assertThat(OfferRules.canWithdraw("DRAFT")).isTrue();
        assertThat(OfferRules.canWithdraw("NEGOTIATING")).isTrue();
    }

    @Test
    void thePlacementBoardShowsEndingAndTerminatedOnTopOfTheOldStatuses() {
        assertThat(PlacementRules.displayStatus("ACTIVE", null, null)).isEqualTo("ACTIVE");
        assertThat(PlacementRules.displayStatus("ACTIVE", null, TODAY)).isEqualTo("ENDING");
        assertThat(PlacementRules.displayStatus("UPCOMING", null, null)).isEqualTo("UPCOMING");
        assertThat(PlacementRules.displayStatus("ENDED", null, null)).as("an old ended row (no end kind) stays Completed").isEqualTo("ENDED");
        assertThat(PlacementRules.displayStatus("ENDED", TalentPlacement.END_COMPLETED, TODAY)).isEqualTo("ENDED");
        assertThat(PlacementRules.displayStatus("ENDED", TalentPlacement.END_TERMINATED, null)).isEqualTo("TERMINATED");
        assertThat(PlacementRules.displayStatus("UPCOMING", null, TODAY)).as("notice only matters for a working placement").isEqualTo("UPCOMING");
    }

    @Test
    void thePackageSummaryIsBuiltFromNumbersOnly() {
        CwsOffer o = new CwsOffer();
        o.setCurrency("USD");
        o.setRateMinor(9500L);
        o.setRatePeriod("HOUR");
        o.setPlacementType("CONTRACT");
        assertThat(OfferCommandService.summary(o)).isEqualTo("USD 95 per hour, Contract");
        o.setRateMinor(9550L);
        assertThat(OfferCommandService.summary(o)).isEqualTo("USD 95.50 per hour, Contract");
        CwsOffer salary = new CwsOffer();
        salary.setBaseSalaryMinor(14_000_000L);
        salary.setPlacementType("FTE");
        assertThat(OfferCommandService.summary(salary)).isEqualTo("USD 140000 per year, Full-time");
    }
}
