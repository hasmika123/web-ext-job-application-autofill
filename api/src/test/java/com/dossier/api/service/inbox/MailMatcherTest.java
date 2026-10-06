package com.dossier.api.service.inbox;

import static org.assertj.core.api.Assertions.assertThat;

import com.dossier.api.domain.Application;
import com.dossier.api.domain.enumeration.ApplicationStatus;
import com.dossier.api.service.inbox.MailClassifier.Category;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;

/** Which application an email is about, and what it does to it (Phase 14.4a). */
class MailMatcherTest {

    private static long ids = 0;

    private static Application app(String company, String role) {
        Application a = new Application().company(company).roleTitle(role).status(ApplicationStatus.APPLIED).createdAt(Instant.now());
        a.setId(++ids);
        a.setArchived(false);
        return a;
    }

    @Test
    void matchesByTheCompanyTheMailNamesOrItsSender() {
        Application acme = app("Acme, Inc.", "Backend Engineer");
        Application globex = app("Globex", "Designer");
        List<Application> apps = List.of(acme, globex);

        assertThat(MailMatcher.match(apps, "ACME", null, "Thanks", "no-reply@greenhouse-mail.io", null, null)).contains(acme);
        assertThat(MailMatcher.match(apps, null, null, "Quick question", "jane@globex.com", "Jane", null)).contains(globex);
        assertThat(MailMatcher.match(apps, null, null, "Quick question", "hi@example.com", "Globex Recruiting", null)).contains(globex);
        // An ATS's own domain names no company.
        assertThat(MailMatcher.match(apps, null, null, "Hello", "no-reply@greenhouse-mail.io", null, null)).isEmpty();
    }

    @Test
    void twoRolesAtOneCompanyNeedTheRoleToDecide() {
        Application be = app("Acme", "Backend Engineer");
        Application pm = app("Acme", "Product Manager");
        List<Application> apps = List.of(be, pm);
        assertThat(MailMatcher.match(apps, "Acme", "Product Manager", "Update", null, null, null)).contains(pm);
        assertThat(MailMatcher.match(apps, "Acme", null, "Your Backend Engineer application", null, null, null)).contains(be);
        // No role named: left alone rather than guessed.
        assertThat(MailMatcher.match(apps, "Acme", null, "An update on your application", null, null, null)).isEmpty();
    }

    @Test
    void archivedApplicationsAreNeverMatched() {
        Application old = app("Acme", "Backend Engineer");
        old.setArchived(true);
        assertThat(MailMatcher.match(List.of(old), "Acme", null, "Update", null, null, null)).isEmpty();
    }

    @Test
    void statusOnlyMovesForwardAndDecisionsWin() {
        assertThat(MailMatcher.next(ApplicationStatus.DRAFT, Category.APPLIED)).isEqualTo(ApplicationStatus.APPLIED);
        assertThat(MailMatcher.next(ApplicationStatus.INTERVIEW, Category.APPLIED)).isNull(); // an old confirmation
        assertThat(MailMatcher.next(ApplicationStatus.APPLIED, Category.INTERVIEW)).isEqualTo(ApplicationStatus.INTERVIEW);
        assertThat(MailMatcher.next(ApplicationStatus.INTERVIEW, Category.REJECTED)).isEqualTo(ApplicationStatus.REJECTED);
        assertThat(MailMatcher.next(ApplicationStatus.OFFER, Category.REJECTED)).isNull();
        assertThat(MailMatcher.next(ApplicationStatus.REJECTED, Category.INTERVIEW)).isNull();
        assertThat(MailMatcher.next(ApplicationStatus.INTERVIEW, Category.OFFER)).isEqualTo(ApplicationStatus.OFFER);
        assertThat(MailMatcher.next(ApplicationStatus.SAVED, Category.ASSESSMENT)).isEqualTo(ApplicationStatus.APPLIED);
        assertThat(MailMatcher.next(ApplicationStatus.APPLIED, Category.ALERT)).isNull();
    }
}
