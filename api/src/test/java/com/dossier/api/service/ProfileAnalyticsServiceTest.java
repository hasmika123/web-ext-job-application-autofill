package com.dossier.api.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.Application;
import com.dossier.api.domain.ApplicationEvent;
import com.dossier.api.domain.User;
import com.dossier.api.domain.enumeration.ApplicationStatus;
import com.dossier.api.repository.ApplicationEventRepository;
import com.dossier.api.repository.ApplicationRepository;
import com.dossier.api.service.dto.AnalyticsDTOs.Analytics;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** Week bucketing, the first-became-X rule, the cohort response rate and the period select. */
class ProfileAnalyticsServiceTest {

    // A Wednesday.
    private static final Instant NOW = Instant.parse("2026-10-14T15:00:00Z");

    private final List<Application> apps = new ArrayList<>();
    private final List<ApplicationEvent> evs = new ArrayList<>();
    private ProfileAnalyticsService service;
    private long nextId = 1;

    @BeforeEach
    void setUp() {
        ApplicationRepository applications = mock(ApplicationRepository.class);
        ApplicationEventRepository events = mock(ApplicationEventRepository.class);
        TrackerUsers users = mock(TrackerUsers.class);
        User u = new User();
        u.setId(7L);
        when(users.current()).thenReturn(u);
        when(applications.findByUserId(7L)).thenAnswer(inv -> apps);
        when(events.findAllByUser(7L)).thenAnswer(inv -> evs);
        service = new ProfileAnalyticsService(applications, events, TrackerTestSupport.settings(), users, Clock.fixed(NOW, ZoneOffset.UTC));
    }

    private Application app(String company, ApplicationStatus status) {
        Application a = new Application();
        a.setId(nextId++);
        a.setCompany(company);
        a.setStatus(status);
        a.setArchived(false);
        a.setCreatedAt(NOW.minusSeconds(86_400L * 200));
        a.setUpdatedAt(NOW);
        a.setLastEventAt(NOW);
        apps.add(a);
        return a;
    }

    private void event(Application a, ApplicationStatus to, int daysAgo, String source) {
        ApplicationEvent e = new ApplicationEvent();
        e.setApplicationId(a.getId());
        e.setKind(ApplicationEvent.STATUS);
        e.setToStatus(to);
        e.setSource(source);
        e.setCreatedAt(NOW.minusSeconds(86_400L * daysAgo));
        evs.add(e);
    }

    @Test
    void anAccountThatNeverAppliedIsNotRealAndEverythingIsZero() {
        Application saved = app("Acme", ApplicationStatus.SAVED);
        event(saved, ApplicationStatus.SAVED, 2, "WEB");

        Analytics a = service.analytics(30, "UTC");

        assertThat(a.real()).isFalse();
        assertThat(a.stats().applied()).isZero();
        assertThat(a.stats().responseRate()).isNull();
        assertThat(a.byStatus()).extracting(s -> s.status()).containsExactly(ApplicationStatus.SAVED);
        assertThat(a.responseByCompany()).isEmpty();
    }

    @Test
    void anApplicationCountsOnceAtTheFirstTimeItBecameEachStage() {
        Application x = app("Acme", ApplicationStatus.INTERVIEW);
        event(x, ApplicationStatus.APPLIED, 20, "EXTENSION");
        event(x, ApplicationStatus.INTERVIEW, 10, "WEB");
        // Moved back and forth: the later events never move the first-became times.
        event(x, ApplicationStatus.APPLIED, 6, "WEB");
        event(x, ApplicationStatus.INTERVIEW, 3, "WEB");

        Analytics a = service.analytics(30, "UTC");

        assertThat(a.real()).isTrue();
        assertThat(a.stats().applied()).isEqualTo(1);
        assertThat(a.stats().interviews()).isEqualTo(1);
        assertThat(a.stats().replies()).isEqualTo(1);
        assertThat(a.stats().offers()).isZero();
        assertThat(a.overTime().stream().mapToInt(b -> b.applied()).sum()).isEqualTo(1);
        assertThat(a.overTime().stream().mapToInt(b -> b.interviews()).sum()).isEqualTo(1);
    }

    @Test
    void aJobDraggedStraightToInterviewWasAppliedTo() {
        Application x = app("Acme", ApplicationStatus.INTERVIEW);
        event(x, ApplicationStatus.SAVED, 12, "WEB");
        event(x, ApplicationStatus.INTERVIEW, 5, "WEB");

        Analytics a = service.analytics(30, "UTC");

        assertThat(a.stats().applied()).isEqualTo(1);
        assertThat(a.stats().interviews()).isEqualTo(1);
    }

    @Test
    void weeksAreMondayStartedAndTheChartSumsToTheTiles() {
        Application x = app("A", ApplicationStatus.APPLIED);
        event(x, ApplicationStatus.APPLIED, 0, "WEB"); // Wed 14 Oct -> week of Mon 12 Oct
        Application y = app("B", ApplicationStatus.APPLIED);
        event(y, ApplicationStatus.APPLIED, 2, "WEB"); // Mon 12 Oct -> same week
        Application z = app("C", ApplicationStatus.APPLIED);
        event(z, ApplicationStatus.APPLIED, 3, "WEB"); // Sun 11 Oct -> week of Mon 5 Oct

        Analytics a = service.analytics(30, "UTC");

        assertThat(a.granularity()).isEqualTo("week");
        assertThat(a.overTime().get(a.overTime().size() - 1).start()).isEqualTo("2026-10-12");
        assertThat(a.overTime().get(a.overTime().size() - 1).applied()).isEqualTo(2);
        assertThat(a.overTime().get(a.overTime().size() - 2).start()).isEqualTo("2026-10-05");
        assertThat(a.overTime().get(a.overTime().size() - 2).applied()).isEqualTo(1);
        assertThat(a.overTime().stream().mapToInt(b -> b.applied()).sum()).isEqualTo(a.stats().applied()).isEqualTo(3);
    }

    @Test
    void theRangeSelectChangesWhatIsCounted() {
        Application recent = app("A", ApplicationStatus.APPLIED);
        event(recent, ApplicationStatus.APPLIED, 5, "WEB");
        Application older = app("B", ApplicationStatus.APPLIED);
        event(older, ApplicationStatus.APPLIED, 50, "WEB");
        Application oldest = app("C", ApplicationStatus.APPLIED);
        event(oldest, ApplicationStatus.APPLIED, 200, "WEB");

        assertThat(service.analytics(30, "UTC").stats().applied()).isEqualTo(1);
        assertThat(service.analytics(90, "UTC").stats().applied()).isEqualTo(2);
        assertThat(service.analytics(365, "UTC").stats().applied()).isEqualTo(3);
        // 30 days: the 30 before it hold one (the 50-day-old one) - the delta's baseline.
        assertThat(service.analytics(30, "UTC").stats().appliedPrev()).isEqualTo(1);
    }

    @Test
    void aYearIsChartedByMonthAndTheRangeIsClamped() {
        Application x = app("A", ApplicationStatus.APPLIED);
        event(x, ApplicationStatus.APPLIED, 100, "WEB");

        Analytics year = service.analytics(365, "UTC");
        assertThat(year.granularity()).isEqualTo("month");
        assertThat(year.overTime()).allSatisfy(b -> assertThat(b.start()).endsWith("-01"));
        assertThat(year.overTime().stream().mapToInt(b -> b.applied()).sum()).isEqualTo(1);

        assertThat(service.analytics(9999, "UTC").range()).isEqualTo(365);
        assertThat(service.analytics(1, "UTC").range()).isEqualTo(7);
        assertThat(service.analytics(null, "UTC").range()).isEqualTo(30);
    }

    @Test
    void responseRateIsTheShareOfTheAppliedCohortThatHasHadAReply() {
        Application a1 = app("A", ApplicationStatus.REJECTED);
        event(a1, ApplicationStatus.APPLIED, 20, "WEB");
        event(a1, ApplicationStatus.REJECTED, 2, "INBOX");
        Application a2 = app("B", ApplicationStatus.APPLIED);
        event(a2, ApplicationStatus.APPLIED, 20, "WEB");
        Application a3 = app("C", ApplicationStatus.APPLIED);
        event(a3, ApplicationStatus.APPLIED, 20, "WEB");
        Application a4 = app("D", ApplicationStatus.IN_REVIEW);
        event(a4, ApplicationStatus.APPLIED, 20, "WEB");
        event(a4, ApplicationStatus.IN_REVIEW, 1, "WEB");

        Analytics a = service.analytics(30, "UTC");

        assertThat(a.stats().applied()).isEqualTo(4);
        assertThat(a.stats().replies()).isEqualTo(2);
        assertThat(a.stats().responseRate()).isEqualTo(50);
    }

    @Test
    void responseByCompanyAppearsOnlyOnceAReplyCameThroughTheInbox() {
        Application a1 = app("Acme", ApplicationStatus.APPLIED);
        event(a1, ApplicationStatus.APPLIED, 5, "WEB");
        Application a2 = app("acme", ApplicationStatus.IN_REVIEW);
        event(a2, ApplicationStatus.APPLIED, 6, "WEB");
        event(a2, ApplicationStatus.IN_REVIEW, 3, "WEB");

        Analytics without = service.analytics(30, "UTC");
        assertThat(without.inboxSeen()).isFalse();
        assertThat(without.responseByCompany()).isEmpty();

        Application a3 = app("Globex", ApplicationStatus.REJECTED);
        event(a3, ApplicationStatus.APPLIED, 9, "WEB");
        event(a3, ApplicationStatus.REJECTED, 4, "INBOX");

        Analytics with = service.analytics(30, "UTC");
        assertThat(with.inboxSeen()).isTrue();
        assertThat(with.responseByCompany()).hasSize(2);
        assertThat(with.responseByCompany().get(0).company()).isEqualToIgnoringCase("acme");
        assertThat(with.responseByCompany().get(0).applied()).isEqualTo(2);
        assertThat(with.responseByCompany().get(0).replied()).isEqualTo(1);
    }

    @Test
    void archivedApplicationsAreLeftOut() {
        Application x = app("Acme", ApplicationStatus.APPLIED);
        x.setArchived(true);
        event(x, ApplicationStatus.APPLIED, 2, "WEB");

        Analytics a = service.analytics(30, "UTC");

        assertThat(a.real()).isFalse();
        assertThat(a.stats().applied()).isZero();
    }

    @Test
    void anApplicationWithNoEventsFallsBackToItsOwnDates() {
        Application x = app("Acme", ApplicationStatus.OFFER);
        x.setAppliedAt(NOW.minusSeconds(86_400L * 4));

        Analytics a = service.analytics(30, "UTC");

        assertThat(a.stats().applied()).isEqualTo(1);
        assertThat(a.stats().offers()).isEqualTo(1);
        assertThat(a.stats().interviews()).isEqualTo(1);
    }

    @Test
    void daysAreNamedInTheUsersZone() {
        Application x = app("Acme", ApplicationStatus.APPLIED);
        // 2026-10-12 02:30 UTC is still Sunday 11 Oct in New York.
        ApplicationEvent e = new ApplicationEvent();
        e.setApplicationId(x.getId());
        e.setKind(ApplicationEvent.STATUS);
        e.setToStatus(ApplicationStatus.APPLIED);
        e.setSource("WEB");
        e.setCreatedAt(Instant.parse("2026-10-12T02:30:00Z"));
        evs.add(e);

        Analytics utc = service.analytics(30, "UTC");
        Analytics ny = service.analytics(30, "America/New_York");

        assertThat(utc.overTime().stream().filter(b -> b.applied() > 0).findFirst().orElseThrow().start()).isEqualTo("2026-10-12");
        assertThat(ny.overTime().stream().filter(b -> b.applied() > 0).findFirst().orElseThrow().start()).isEqualTo("2026-10-05");
        assertThatThrownBy(() -> service.analytics(30, "Mars/Olympus")).isInstanceOf(TrackerException.class);
    }
}
