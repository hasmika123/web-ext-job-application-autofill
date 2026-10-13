package com.dossier.api.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.Application;
import com.dossier.api.domain.ApplicationEvent;
import com.dossier.api.domain.User;
import com.dossier.api.domain.enumeration.ApplicationStatus;
import com.dossier.api.repository.ApplicationEventRepository;
import com.dossier.api.repository.ApplicationRepository;
import com.dossier.api.service.dto.TrackerDTOs.ActivityDay;
import com.dossier.api.service.inbox.InboxParser;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** The tracker's memory: one event per meaningful change, the ghosted clock, and the activity bars. */
class ApplicationEventServiceTest {

    private static final Instant NOW = Instant.parse("2026-10-13T15:00:00Z");

    private ApplicationEventRepository events;
    private ApplicationRepository applications;
    private TrackerUsers users;
    private final List<ApplicationEvent> saved = new ArrayList<>();
    private ApplicationEventService service;

    @BeforeEach
    void setUp() {
        events = mock(ApplicationEventRepository.class);
        when(events.save(any(ApplicationEvent.class))).thenAnswer(inv -> {
            saved.add(inv.getArgument(0));
            return inv.getArgument(0);
        });
        applications = mock(ApplicationRepository.class);
        users = mock(TrackerUsers.class);
        User u = new User();
        u.setId(7L);
        when(users.current()).thenReturn(u);
        service = new ApplicationEventService(events, applications, TrackerTestSupport.settings(), users, Clock.fixed(NOW, ZoneOffset.UTC));
    }

    private static Application app(ApplicationStatus status) {
        Application a = new Application();
        a.setId(42L);
        a.setStatus(status);
        return a;
    }

    @Test
    void aStatusChangeWritesOneEventAndMovesTheGhostedClock() {
        Application a = app(ApplicationStatus.INTERVIEW);
        assertThat(service.recordStatus(a, ApplicationStatus.APPLIED, ApplicationStatus.INTERVIEW, ApplicationEvent.SRC_WEB, null, null)).isTrue();

        assertThat(saved).hasSize(1);
        ApplicationEvent e = saved.get(0);
        assertThat(e.getKind()).isEqualTo(ApplicationEvent.STATUS);
        assertThat(e.getFromStatus()).isEqualTo(ApplicationStatus.APPLIED);
        assertThat(e.getToStatus()).isEqualTo(ApplicationStatus.INTERVIEW);
        assertThat(e.getSource()).isEqualTo("WEB");
        assertThat(e.getSummary()).isEqualTo("Moved to Interview");
        assertThat(a.getLastEventAt()).isEqualTo(NOW);
    }

    @Test
    void noStatusChangeWritesNothing() {
        Application a = app(ApplicationStatus.APPLIED);
        assertThat(service.recordStatus(a, ApplicationStatus.APPLIED, ApplicationStatus.APPLIED, "WEB", null, null)).isFalse();
        assertThat(service.recordStatus(a, ApplicationStatus.APPLIED, null, "WEB", null, null)).isFalse();
        verify(events, never()).save(any());
        assertThat(a.getLastEventAt()).isNull();
    }

    @Test
    void aNewApplicationIsCreatedWithItsFirstStatusSoFirstBecameXHolds() {
        Application a = app(ApplicationStatus.APPLIED);
        service.recordCreated(a, "EXTENSION");

        ApplicationEvent e = saved.get(0);
        assertThat(e.getKind()).isEqualTo(ApplicationEvent.CREATED);
        assertThat(e.getFromStatus()).isNull();
        assertThat(e.getToStatus()).isEqualTo(ApplicationStatus.APPLIED);
        assertThat(e.getSource()).isEqualTo("EXTENSION");
    }

    @Test
    void aBackDatedEventNeverMakesAnApplicationLookFresher() {
        Application a = app(ApplicationStatus.APPLIED);
        a.setLastEventAt(NOW);
        service.recordAt(a, ApplicationEvent.NOTE, null, null, "SYSTEM", 1L, "Note added", NOW.minusSeconds(86400 * 5));
        assertThat(a.getLastEventAt()).isEqualTo(NOW);
        assertThat(saved.get(0).getCreatedAt()).isEqualTo(NOW.minusSeconds(86400 * 5));
    }

    @Test
    void summariesAreCappedToTheColumn() {
        service.record(app(ApplicationStatus.APPLIED), ApplicationEvent.FIELD, null, null, "WEB", null, "x".repeat(500));
        assertThat(saved.get(0).getSummary()).hasSize(200);
    }

    @Test
    void sourcesFollowThePayloadLabel() {
        assertThat(ApplicationEventService.sourceOf("extension")).isEqualTo("EXTENSION");
        assertThat(ApplicationEventService.sourceOf("Inbox")).isEqualTo("INBOX");
        assertThat(ApplicationEventService.sourceOf("demo")).isEqualTo("SYSTEM");
        assertThat(ApplicationEventService.sourceOf("assistant")).isEqualTo("ASSISTANT");
        assertThat(ApplicationEventService.sourceOf("match")).isEqualTo("WEB");
        assertThat(ApplicationEventService.sourceOf(null)).isEqualTo("WEB");
    }

    @Test
    void anEmailMoveIsWrittenIntoTheTimelineWithTheMailAsItsReference() {
        Application a = app(ApplicationStatus.INTERVIEW);
        when(applications.findById(42L)).thenReturn(Optional.of(a));

        service.onStatusChanged(new InboxParser.StatusChanged(7L, 42L, "Acme", "Eng", ApplicationStatus.APPLIED, ApplicationStatus.INTERVIEW, 99L, NOW));

        assertThat(saved).hasSize(1);
        assertThat(saved.get(0).getSource()).isEqualTo("INBOX");
        assertThat(saved.get(0).getRefId()).isEqualTo(99L);
        assertThat(saved.get(0).getToStatus()).isEqualTo(ApplicationStatus.INTERVIEW);
        verify(applications).save(a);
    }

    @Test
    void activityIsOneRowPerDayOldestFirstWithQuietDaysAsZero() {
        // NOW is Oct 13 15:00 UTC. In New York that is 11:00 on the 13th; 03:00 UTC on the 13th is still the 12th there.
        when(events.createdAtSince(any(), any())).thenReturn(
            List.of(Instant.parse("2026-10-13T03:00:00Z"), Instant.parse("2026-10-13T14:00:00Z"), Instant.parse("2026-10-11T09:00:00Z"))
        );

        List<ActivityDay> utc = service.activity(3, null);
        assertThat(utc).extracting(ActivityDay::day).containsExactly("2026-10-11", "2026-10-12", "2026-10-13");
        assertThat(utc).extracting(ActivityDay::count).containsExactly(1, 0, 2);

        List<ActivityDay> ny = service.activity(3, "America/New_York");
        assertThat(ny).extracting(ActivityDay::day).containsExactly("2026-10-11", "2026-10-12", "2026-10-13");
        assertThat(ny).extracting(ActivityDay::count).containsExactly(1, 1, 1);
    }

    @Test
    void activityDaysComeFromSettingsAndAreCapped() {
        when(events.createdAtSince(any(), any())).thenReturn(List.of());
        assertThat(service.activity(null, null)).hasSize(30); // tracker.activity.defaultDays
        assertThat(service.activity(500, null)).hasSize(90); // tracker.activity.maxDays
        assertThat(service.activity(0, null)).hasSize(1);
        ApplicationEventService tight = new ApplicationEventService(
            events,
            applications,
            TrackerTestSupport.settings(ResumeBuilderSettingKeys.TRACKER_ACTIVITY_MAX_DAYS, "14"),
            users,
            Clock.fixed(NOW, ZoneOffset.UTC)
        );
        assertThat(tight.activity(60, null)).hasSize(14);
    }

    @Test
    void anUnknownTimeZoneIsRefused() {
        assertThatThrownBy(() -> service.activity(7, "Mars/Olympus")).isInstanceOf(TrackerException.class).hasMessageContaining("tz");
    }
}
