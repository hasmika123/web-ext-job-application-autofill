package com.dossier.api.service.inbox;

import static org.assertj.core.api.Assertions.assertThat;

import com.dossier.api.service.inbox.MailConfidence.MatchSignals;
import com.dossier.api.service.inbox.MailConfidence.ReadingSignals;
import com.dossier.api.service.inbox.MailEvent.MatchKind;
import org.junit.jupiter.api.Test;

/** The weights in one place, and what they add up to. */
class MailConfidenceTest {

    private static MatchSignals m(boolean ats, boolean link, boolean thread, boolean company, boolean subjOnly, boolean role, boolean senderCo) {
        return new MatchSignals(ats, link, thread, company, subjOnly, role, senderCo);
    }

    @Test
    void anAtsIdAloneIsSureEnoughToApply() {
        assertThat(MailConfidence.match(m(true, false, false, false, false, false, false))).isEqualTo(92);
        assertThat(MailConfidence.kind(m(true, false, false, true, false, true, false))).isEqualTo(MatchKind.ATS_ID);
    }

    @Test
    void aJobLinkAndAThreadAreStrongButBelowAnId() {
        assertThat(MailConfidence.match(m(false, true, false, false, false, false, false))).isEqualTo(88);
        assertThat(MailConfidence.match(m(false, false, true, false, false, false, false))).isEqualTo(88);
        assertThat(MailConfidence.kind(m(false, true, true, false, false, false, false))).isEqualTo(MatchKind.JOB_LINK);
        assertThat(MailConfidence.kind(m(false, false, true, true, false, false, false))).isEqualTo(MatchKind.THREAD);
    }

    @Test
    void companyAloneJustReachesTheDefaultApplyLevelButTheSubjectAloneDoesNot() {
        assertThat(MailConfidence.match(m(false, false, false, true, false, false, false))).isEqualTo(80);
        assertThat(MailConfidence.match(m(false, false, false, false, true, false, false))).isEqualTo(70);
    }

    @Test
    void agreeingSignalsAddUpButNeverPassOneHundred() {
        int companyRole = MailConfidence.match(m(false, false, false, true, false, true, false));
        assertThat(companyRole).isEqualTo(94).isGreaterThan(80);
        assertThat(MailConfidence.kind(m(false, false, false, true, false, true, false))).isEqualTo(MatchKind.COMPANY_ROLE);
        int everything = MailConfidence.match(m(true, true, true, true, false, true, true));
        assertThat(everything).isBetween(99, 100);
    }

    @Test
    void aRoleWithoutAnythingToAnchorItScoresNothing() {
        assertThat(MailConfidence.match(m(false, false, false, false, false, true, false))).isZero();
        assertThat(MailConfidence.kind(m(false, false, false, false, false, true, false))).isEqualTo(MatchKind.NONE);
    }

    @Test
    void readingGrowsWithEachSignalAndAnUnsureRuleReadingIsCapped() {
        int bare = MailConfidence.reading(new ReadingSignals(false, false, false, false, false));
        int sender = MailConfidence.reading(new ReadingSignals(false, false, true, false, false));
        int all = MailConfidence.reading(new ReadingSignals(false, false, true, true, true));
        assertThat(bare).isEqualTo(60);
        assertThat(sender).isEqualTo(80);
        assertThat(all).isEqualTo(100);
        assertThat(MailConfidence.reading(new ReadingSignals(false, true, true, true, true))).isEqualTo(MailConfidence.READ_RULES_UNSURE_CAP);
        // the model's verdict from an unknown sender is plausible but not enough to act on by itself
        assertThat(MailConfidence.reading(new ReadingSignals(true, false, false, false, false))).isLessThan(80);
    }

    @Test
    void combinedConfidenceIsTheWeakerOfTheTwo() {
        assertThat(MailConfidence.combine(95, 80, true)).isEqualTo(80);
        assertThat(MailConfidence.combine(70, 99, true)).isEqualTo(70);
        assertThat(MailConfidence.combine(70, 0, false)).isEqualTo(70);
    }
}
