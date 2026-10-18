package com.dossier.api.service.inbox;

import static org.assertj.core.api.Assertions.assertThat;

import com.dossier.api.domain.Application;
import com.dossier.api.domain.enumeration.ApplicationStatus;
import com.dossier.api.service.inbox.MailEvent.MatchKind;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;

/** Ranked matching: strongest evidence first, and no guessing between two close jobs. */
class MailRankTest {

    private static long ids = 100;

    private static Application app(String company, String role, String atsId, String url, Instant created, String email) {
        Application a = new Application().company(company).roleTitle(role).status(ApplicationStatus.APPLIED).createdAt(created);
        a.setId(++ids);
        a.setArchived(false);
        a.setExternalJobId(atsId);
        a.setJobUrl(url);
        a.setEmail(email);
        return a;
    }

    private static MailMatcher.Facts facts(String company, String role, String subject, String body, String from, String name, Long thread) {
        return new MailMatcher.Facts(company, role, subject, body, from, name, "me@gmail.com", thread);
    }

    @Test
    void anAtsIdBeatsAJobLinkToAnotherApplicationsPostingOnlyByEnoughPoints() {
        Application a = app("Acme", "Engineer", "REQ-70001", null, Instant.now(), null);
        Application b = app("Initech", "Analyst", null, "https://jobs.example.com/initech/analyst-9", Instant.now(), null);
        // 92 vs 88: too close, so nothing is chosen and both are offered.
        MailMatcher.Ranking r = MailMatcher.rank(List.of(a, b), facts(null, null, "Hi", "REQ-70001 see https://jobs.example.com/initech/analyst-9", "x@y.com", null, null));
        assertThat(r.ambiguous()).isTrue();
        assertThat(r.best()).isNull();
        assertThat(r.kind()).isEqualTo(MatchKind.AMBIGUOUS);
        assertThat(r.candidates()).extracting(MailEvent.Candidate::applicationId).containsExactly(a.getId(), b.getId());
        assertThat(r.candidates().get(0).company()).isEqualTo("Acme");
    }

    @Test
    void aStrongSignalPlusAgreeingCompanyWinsClearly() {
        Application a = app("Acme", "Engineer", "REQ-70001", null, Instant.now(), null);
        Application b = app("Initech", "Analyst", null, null, Instant.now(), null);
        MailMatcher.Ranking r = MailMatcher.rank(List.of(a, b), facts("Acme", null, "Hi", "Your id is REQ-70001", "x@y.com", null, null));
        assertThat(r.best()).isEqualTo(a);
        assertThat(r.kind()).isEqualTo(MatchKind.ATS_ID);
        assertThat(r.score()).isGreaterThanOrEqualTo(99);
    }

    @Test
    void anIdMustStandAloneAndBeLongEnough() {
        Application a = app("Zeta", "Engineer", "4412", null, Instant.now(), null);
        // "44120" is another number; "4412" has 4 characters, below the minimum of 5 either way.
        assertThat(MailMatcher.rank(List.of(a), facts(null, null, "Order 44120", "Ref 4412", "x@y.com", null, null)).best()).isNull();
        Application b = app("Zeta", "Engineer", "ZX-4412", null, Instant.now(), null);
        assertThat(MailMatcher.rank(List.of(b), facts(null, null, "Ref (ZX-4412).", "", "x@y.com", null, null)).best()).isEqualTo(b);
        assertThat(MailMatcher.rank(List.of(b), facts(null, null, "Ref ZX-44120", "", "x@y.com", null, null)).best()).isNull();
    }

    @Test
    void theSameJobTrackedTwiceIsOneJobTheOneSentFromThisInboxWins() {
        Application old = app("Acme", "Engineer", null, null, Instant.parse("2026-01-01T00:00:00Z"), null);
        Application mine = app("Acme", "Engineer", null, null, Instant.parse("2026-02-01T00:00:00Z"), "me@gmail.com");
        Application newest = app("Acme", "Engineer", null, null, Instant.parse("2026-03-01T00:00:00Z"), null);
        MailMatcher.Ranking r = MailMatcher.rank(List.of(old, mine, newest), facts("Acme", "Engineer", "Update", "", "x@y.com", null, null));
        assertThat(r.ambiguous()).isFalse();
        assertThat(r.best()).isEqualTo(mine);
        assertThat(r.candidates()).hasSize(1);
        // none sent from here: the newest
        mine.setEmail(null);
        assertThat(MailMatcher.rank(List.of(old, mine, newest), facts("Acme", "Engineer", "Update", "", "x@y.com", null, null)).best()).isEqualTo(newest);
    }

    @Test
    void theThreadAloneIsAMatch() {
        Application a = app("Acme", "Engineer", null, null, Instant.now(), null);
        Application b = app("Initech", "Analyst", null, null, Instant.now(), null);
        MailMatcher.Ranking r = MailMatcher.rank(List.of(a, b), facts(null, null, "Re: hello", "", "x@gmail.com", null, b.getId()));
        assertThat(r.best()).isEqualTo(b);
        assertThat(r.kind()).isEqualTo(MatchKind.THREAD);
    }

    @Test
    void candidatesAreRankedAndCapped() {
        Application a = app("Acme", "Engineer", null, null, Instant.now(), null);
        Application b = app("Acme", "Designer", null, null, Instant.now(), null);
        MailMatcher.Ranking r = MailMatcher.rank(List.of(a, b), facts("Acme", "Designer", "Update", "", "x@y.com", null, null));
        assertThat(r.best()).isEqualTo(b);
        assertThat(r.candidates()).extracting(MailEvent.Candidate::applicationId).containsExactly(b.getId(), a.getId());
        assertThat(r.candidates().get(0).score()).isGreaterThan(r.candidates().get(1).score());
        assertThat(r.candidates().get(0).reason()).isNotBlank();
    }

    @Test
    void aMailEventExposesAmbiguity() {
        MailEvent two = new MailEvent(
            1L, MailClassifier.Category.REJECTED, 60, 90, 0, MatchKind.AMBIGUOUS, null,
            List.of(new MailEvent.Candidate(1L, 80, MatchKind.COMPANY, "x"), new MailEvent.Candidate(2L, 80, MatchKind.COMPANY, "x")),
            null, "e"
        );
        assertThat(two.ambiguous()).isTrue();
        MailEvent one = new MailEvent(1L, MailClassifier.Category.REJECTED, 90, 90, 90, MatchKind.COMPANY, 1L, List.of(), null, "e");
        assertThat(one.ambiguous()).isFalse();
    }
}
