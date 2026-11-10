package com.dossier.api.service.ent.consultantws;

import static org.assertj.core.api.Assertions.assertThat;

import com.dossier.api.domain.ent.consultantws.CwsOpportunityResponse;
import com.dossier.api.domain.ent.mkt.MktOpportunity;
import java.util.Optional;
import org.junit.jupiter.api.Test;

/** How the consultant page reads the ONE record of the consultant's answer ({@code mkt_opportunity}): status, interest and the actions it may offer. */
class OpportunitiesServiceTest {

    private static MktOpportunity opp(String state, String interest) {
        MktOpportunity o = new MktOpportunity();
        o.setState(state);
        o.setInterest(interest);
        return o;
    }

    private static Optional<CwsOpportunityResponse> legacy(String status) {
        CwsOpportunityResponse r = new CwsOpportunityResponse();
        r.setStatus(status);
        return Optional.of(r);
    }

    @Test
    void theStatusComesFromTheSharedStateAndAnOpenOneIsNew() {
        assertThat(OpportunitiesService.statusOf(null, Optional.empty())).as("no record yet").isEqualTo("NEW");
        assertThat(OpportunitiesService.statusOf(opp("ASSIGNED", "NO_RESPONSE"), Optional.empty())).isEqualTo("NEW");
        assertThat(OpportunitiesService.statusOf(opp("VIEWED", "NO_RESPONSE"), Optional.empty())).isEqualTo("NEW");
        assertThat(OpportunitiesService.statusOf(opp("INTERESTED", "INTERESTED"), Optional.empty())).as("interested is still New with Interest sent").isEqualTo("NEW");
        assertThat(OpportunitiesService.statusOf(opp("NEEDS_INFO", "NO_RESPONSE"), Optional.empty())).isEqualTo("AWAITING_RESPONSE");
        assertThat(OpportunitiesService.statusOf(opp("DECLINED", "NOT_INTERESTED"), Optional.empty())).isEqualTo("DECLINED");
        assertThat(OpportunitiesService.statusOf(opp("APPLIED", "INTERESTED"), Optional.empty())).isEqualTo("APPLIED");
        assertThat(OpportunitiesService.statusOf(opp("CLOSED", "NO_RESPONSE"), Optional.empty())).isEqualTo("CLOSED");
    }

    @Test
    void theMarketersOwnInReviewStageOnlyShowsWhileTheConsultantHasNotAnswered() {
        assertThat(OpportunitiesService.statusOf(null, legacy("IN_REVIEW"))).isEqualTo("IN_REVIEW");
        assertThat(OpportunitiesService.statusOf(opp("ASSIGNED", "NO_RESPONSE"), legacy("IN_REVIEW"))).isEqualTo("IN_REVIEW");
        assertThat(OpportunitiesService.statusOf(opp("NEEDS_INFO", "NO_RESPONSE"), legacy("IN_REVIEW"))).as("the consultant's question wins").isEqualTo("AWAITING_RESPONSE");
        assertThat(OpportunitiesService.statusOf(opp("DECLINED", "NOT_INTERESTED"), legacy("IN_REVIEW"))).isEqualTo("DECLINED");
        assertThat(OpportunitiesService.statusOf(null, legacy("NEW"))).isEqualTo("NEW");
    }

    @Test
    void interestIsSentWhenTheSharedStateOrTheBoardsInterestSaysSoOrJobMatchesRecordedIt() {
        assertThat(OpportunitiesService.interestSent(null, false)).isFalse();
        assertThat(OpportunitiesService.interestSent(null, true)).as("the Job Matches row").isTrue();
        assertThat(OpportunitiesService.interestSent(opp("INTERESTED", "INTERESTED"), false)).isTrue();
        assertThat(OpportunitiesService.interestSent(opp("ASSIGNED", "VERY_INTERESTED"), false)).as("what the board shows").isTrue();
        assertThat(OpportunitiesService.interestSent(opp("ASSIGNED", "OPEN"), false)).isFalse();
        assertThat(OpportunitiesService.interestSent(opp("ASSIGNED", "NO_RESPONSE"), false)).isFalse();
        assertThat(OpportunitiesService.interestSent(opp("DECLINED", "NOT_INTERESTED"), false)).isFalse();
    }

    @Test
    void theActionsFollowTheStatusAndAClosedJobOffersOnlyWhatDoesNotActOnThePosting() {
        assertThat(OpportunitiesService.actionsFor("NEW", false, true)).containsExactly("INTEREST", "REQUEST_INFO", "RESUME_UPDATE", "DECLINE", "APPLIED");
        assertThat(OpportunitiesService.actionsFor("NEW", true, true)).as("interest already sent").containsExactly("REQUEST_INFO", "RESUME_UPDATE", "DECLINE", "APPLIED");
        assertThat(OpportunitiesService.actionsFor("AWAITING_RESPONSE", false, true)).contains("REQUEST_INFO", "DECLINE", "APPLIED");
        assertThat(OpportunitiesService.actionsFor("NEW", false, false)).containsExactly("RESUME_UPDATE", "DECLINE");
        assertThat(OpportunitiesService.actionsFor("DECLINED", true, true)).containsExactly("REOPEN");
        assertThat(OpportunitiesService.actionsFor("DECLINED", true, false)).isEmpty();
        assertThat(OpportunitiesService.actionsFor("APPLIED", true, true)).as("nothing more to do once they applied").isEmpty();
        assertThat(OpportunitiesService.actionsFor("CLOSED", false, true)).isEmpty();
    }
}
