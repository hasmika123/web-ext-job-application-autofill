package com.dossier.api.service.inbox;

import static org.assertj.core.api.Assertions.assertThat;

import com.dossier.api.domain.enumeration.ApplicationStatus;
import com.dossier.api.service.inbox.InboxDecisionPolicy.Change;
import com.dossier.api.service.inbox.InboxDecisionPolicy.Decision;
import com.dossier.api.service.inbox.InboxDecisionPolicy.Outcome;
import com.dossier.api.service.inbox.MailClassifier.Category;
import com.dossier.api.service.inbox.MailEvent.Candidate;
import com.dossier.api.service.inbox.MailEvent.MatchKind;
import java.util.List;
import org.junit.jupiter.api.Test;

/** The default policy: risky changes wait for the person; confident forward changes are applied (inbox-safety). */
class HoldingInboxDecisionPolicyTest {

    private static final int APPLY = 80;
    private static final int SUGGEST = 50;

    private static MailEvent event(Category c, int confidence, MatchKind kind, Long appId, List<Candidate> candidates) {
        return new MailEvent(1L, c, confidence, confidence, confidence, kind, appId, candidates, null, "evidence");
    }

    private static Decision decide(MailEvent e, ApplicationStatus current, ApplicationStatus proposed, boolean auto) {
        return HoldingInboxDecisionPolicy.decide(e, new Change(current, proposed, auto), APPLY, SUGGEST);
    }

    @Test
    void aConfidentForwardChangeIsApplied() {
        MailEvent e = event(Category.INTERVIEW, 90, MatchKind.COMPANY_ROLE, 7L, List.of());
        assertThat(decide(e, ApplicationStatus.APPLIED, ApplicationStatus.INTERVIEW, false)).isEqualTo(Decision.APPLY);
        assertThat(decide(e, ApplicationStatus.SAVED, ApplicationStatus.INTERVIEW, false)).isEqualTo(Decision.APPLY);
    }

    @Test
    void aRejectionIsHeldUnlessAutomaticRejectionsAreOn() {
        MailEvent e = event(Category.REJECTED, 95, MatchKind.THREAD, 7L, List.of());
        Decision held = decide(e, ApplicationStatus.INTERVIEW, ApplicationStatus.REJECTED, false);
        assertThat(held.outcome()).isEqualTo(Outcome.HOLD);
        assertThat(held.holdReason()).isEqualTo(InboxDecisionPolicy.HOLD_DESTRUCTIVE);
        assertThat(decide(e, ApplicationStatus.INTERVIEW, ApplicationStatus.REJECTED, true)).isEqualTo(Decision.APPLY);
    }

    @Test
    void aWithdrawalIsDestructiveToo() {
        MailEvent e = event(Category.OFFER, 95, MatchKind.THREAD, 7L, List.of());
        assertThat(decide(e, ApplicationStatus.INTERVIEW, ApplicationStatus.WITHDRAWN, false).holdReason()).isEqualTo(InboxDecisionPolicy.HOLD_DESTRUCTIVE);
    }

    @Test
    void anAmbiguousMatchIsHeldEvenWhenSure() {
        MailEvent e = event(Category.INTERVIEW, 95, MatchKind.AMBIGUOUS, null, List.of(new Candidate(1L, 50, MatchKind.COMPANY, "x"), new Candidate(2L, 50, MatchKind.COMPANY, "y")));
        Decision d = decide(e, null, null, false);
        assertThat(d.outcome()).isEqualTo(Outcome.HOLD);
        assertThat(d.holdReason()).isEqualTo(InboxDecisionPolicy.HOLD_AMBIGUOUS);
    }

    @Test
    void aWeakReadingIsHeldAndAVeryWeakOneIgnored() {
        assertThat(decide(event(Category.INTERVIEW, 70, MatchKind.COMPANY_ROLE, 7L, List.of()), ApplicationStatus.APPLIED, ApplicationStatus.INTERVIEW, false).outcome())
            .isEqualTo(Outcome.HOLD);
        assertThat(decide(event(Category.INTERVIEW, 30, MatchKind.COMPANY_ROLE, 7L, List.of()), ApplicationStatus.APPLIED, ApplicationStatus.INTERVIEW, false).outcome())
            .isEqualTo(Outcome.IGNORE);
    }

    @Test
    void aMoveBackwardsIsHeld() {
        MailEvent e = event(Category.APPLIED, 95, MatchKind.THREAD, 7L, List.of());
        Decision d = decide(e, ApplicationStatus.INTERVIEW, ApplicationStatus.APPLIED, false);
        assertThat(d.outcome()).isEqualTo(Outcome.HOLD);
        assertThat(d.holdReason()).isEqualTo(InboxDecisionPolicy.HOLD_BACKWARDS);
        // out of a closed status back into the pipeline is backwards too
        assertThat(decide(e, ApplicationStatus.REJECTED, ApplicationStatus.INTERVIEW, false).holdReason()).isEqualTo(InboxDecisionPolicy.HOLD_BACKWARDS);
    }

    @Test
    void alertsAndOtherMailAreNeverApplied() {
        assertThat(decide(event(Category.ALERT, 99, MatchKind.THREAD, 7L, List.of()), ApplicationStatus.APPLIED, ApplicationStatus.INTERVIEW, false)).isEqualTo(Decision.IGNORE);
        assertThat(decide(event(Category.OTHER, 99, MatchKind.THREAD, 7L, List.of()), ApplicationStatus.APPLIED, ApplicationStatus.INTERVIEW, false)).isEqualTo(Decision.IGNORE);
    }

    @Test
    void ordering() {
        assertThat(HoldingInboxDecisionPolicy.movesBackwards(ApplicationStatus.OFFER, ApplicationStatus.IN_REVIEW)).isTrue();
        assertThat(HoldingInboxDecisionPolicy.movesBackwards(ApplicationStatus.APPLIED, ApplicationStatus.OFFER)).isFalse();
        assertThat(HoldingInboxDecisionPolicy.movesBackwards(ApplicationStatus.APPLIED, ApplicationStatus.APPLIED)).isFalse();
        assertThat(HoldingInboxDecisionPolicy.movesBackwards(ApplicationStatus.APPLIED, ApplicationStatus.REJECTED)).isFalse(); // destructive, handled apart
    }
}
