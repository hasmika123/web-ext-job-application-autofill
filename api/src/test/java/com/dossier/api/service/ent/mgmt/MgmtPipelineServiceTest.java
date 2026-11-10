package com.dossier.api.service.ent.mgmt;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

/** The pure rules of the Pipeline board (MM-08): which column a card is in and how a conversion is rounded. */
class MgmtPipelineServiceTest {

    @Test
    void openStatesAreTheirOwnColumns() {
        for (String s : new String[] { "ASSIGNED", "VIEWED", "INTERESTED", "NEEDS_INFO" }) assertThat(MgmtPipelineService.column(s, null)).isEqualTo(s);
    }

    @Test
    void anAppliedCardMovesToInterviewOrOfferWithTheApplication() {
        assertThat(MgmtPipelineService.column("APPLIED", null)).isEqualTo("APPLIED");
        assertThat(MgmtPipelineService.column("APPLIED", "INTERVIEWING")).isEqualTo("INTERVIEW");
        assertThat(MgmtPipelineService.column("APPLIED", "OFFER")).isEqualTo("OFFER");
    }

    @Test
    void declinedAndClosedAreClosed() {
        assertThat(MgmtPipelineService.column("DECLINED", null)).isEqualTo("CLOSED");
        assertThat(MgmtPipelineService.column("CLOSED", "OFFER")).isEqualTo("CLOSED");
    }

    @Test
    void conversionIsOneDecimalAndNullWithoutAPreviousStep() {
        assertThat(MgmtPipelineService.pct(1, 3)).isEqualTo(33.3);
        assertThat(MgmtPipelineService.pct(5, 0)).isNull();
    }
}
