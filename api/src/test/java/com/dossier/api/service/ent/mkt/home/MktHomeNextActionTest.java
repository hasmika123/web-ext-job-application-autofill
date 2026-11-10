package com.dossier.api.service.ent.mkt.home;

import static org.assertj.core.api.Assertions.assertThat;

import com.dossier.api.service.ent.mkt.home.MktHomeNextAction.Facts;
import org.junit.jupiter.api.Test;

/** The Next Action rules, first match wins (documented in {@link MktHomeNextAction}). */
class MktHomeNextActionTest {

    @Test
    void aResumeThatNeedsAnUpdateBeatsEverything() {
        assertThat(MktHomeNextAction.of(new Facts(true, true, 2, 3, true, true))).satisfies(c -> {
            assertThat(c.label()).isEqualTo("Request Resume");
            assertThat(c.tone()).isEqualTo("red");
        });
    }

    @Test
    void availableWithAnAssignedOpportunityOpensSubmitToJobButOnlyWhenAvailable() {
        assertThat(MktHomeNextAction.of(new Facts(false, true, 1, 3, true, true)).label()).isEqualTo("Submit to Job");
        assertThat(MktHomeNextAction.of(new Facts(false, false, 1, 3, false, false)).label()).isEqualTo("Review Matches");
    }

    @Test
    void thenSuggestedMatchesThenAnInterviewThenAFollowUp() {
        assertThat(MktHomeNextAction.of(new Facts(false, false, 0, 2, true, true)).label()).isEqualTo("Review Matches");
        assertThat(MktHomeNextAction.of(new Facts(false, false, 0, 0, true, true)).label()).isEqualTo("Schedule Interview");
        assertThat(MktHomeNextAction.of(new Facts(false, false, 0, 0, false, true))).satisfies(c -> {
            assertThat(c.label()).isEqualTo("Follow Up");
            assertThat(c.tone()).isEqualTo("violet");
        });
    }

    @Test
    void nothingToDoSaysSo() {
        assertThat(MktHomeNextAction.of(new Facts(false, true, 0, 0, false, false)).label()).isEqualTo("No action");
    }
}
