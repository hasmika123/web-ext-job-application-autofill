package com.dossier.api.service.inbox;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.Application;
import com.dossier.api.domain.ApplicationEvent;
import com.dossier.api.domain.InboxMessage;
import com.dossier.api.domain.Interview;
import com.dossier.api.domain.enumeration.ApplicationStatus;
import com.dossier.api.repository.ApplicationRepository;
import com.dossier.api.repository.InterviewRepository;
import com.dossier.api.service.ApplicationEventService;
import com.dossier.api.service.InboxInterviewChanged;
import com.dossier.api.service.ResumeBuilderSettingKeys;
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.settings.AdminSettingKeys;
import com.dossier.api.service.tracker.ChangeActor;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.test.util.ReflectionTestUtils;

/**
 * What the inbox does with an interview mail on the matched application: create the interview once, move it on a reschedule (keeping the earlier time),
 * mark it cancelled without touching the status, and write a note instead of a guess when no time could be read.
 */
class InboxInterviewApplierTest {

    private static final Long USER = 7L;
    private static final Instant SENT = Instant.parse("2026-10-12T16:30:00Z");
    private static final AtomicLong IDS = new AtomicLong(100);

    private final List<Interview> stored = new ArrayList<>();
    private final List<Object> published = new ArrayList<>();
    private InterviewRepository interviews;
    private ApplicationEventService events;
    private ResumeBuilderSettings settings;
    private InboxInterviewApplier applier;
    private Application app;

    @BeforeEach
    void setUp() {
        interviews = mock(InterviewRepository.class);
        when(interviews.findByApplicationIdAndUserIdOrderByStartsAtDescIdDesc(anyLong(), anyLong())).thenAnswer(inv ->
            stored.stream().sorted((a, b) -> b.getStartsAt().compareTo(a.getStartsAt())).toList()
        );
        when(interviews.save(any(Interview.class))).thenAnswer(inv -> {
            Interview i = inv.getArgument(0);
            if (i.getId() == null) ReflectionTestUtils.setField(i, "id", IDS.incrementAndGet());
            if (!stored.contains(i)) stored.add(i);
            return i;
        });
        ApplicationRepository applications = mock(ApplicationRepository.class);
        app = new Application().company("Orbit Freight").roleTitle("Platform Engineer").status(ApplicationStatus.INTERVIEW);
        app.setId(5L);
        when(applications.findById(5L)).thenReturn(java.util.Optional.of(app));
        events = mock(ApplicationEventService.class);
        settings = mock(ResumeBuilderSettings.class);
        when(settings.getInt(AdminSettingKeys.INBOX_INTERVIEW_MIN_CONFIDENCE)).thenReturn(60);
        when(settings.getInt(ResumeBuilderSettingKeys.TRACKER_INTERVIEWS_MAX_PER_APPLICATION)).thenReturn(30);
        ApplicationEventPublisher publisher = mock(ApplicationEventPublisher.class);
        org.mockito.Mockito.doAnswer(inv -> published.add(inv.getArgument(0))).when(publisher).publishEvent(any(Object.class));
        applier = new InboxInterviewApplier(interviews, applications, events, settings, publisher);
    }

    private static InboxMessage mail(String subject, String body, String calendarJson) {
        InboxMessage m = new InboxMessage();
        m.setSubject(subject);
        m.setBodyText(body);
        m.setSentAt(SENT);
        m.setSentZone("-07:00");
        m.setCalendarEvent(calendarJson);
        return m;
    }

    private InboxInterviewApplier.Result run(InboxMessage m) {
        return applier.apply(USER, 5L, m, applier.read(m));
    }

    private static final String INVITE = "Your phone screen with Orbit Freight is confirmed for Tuesday, October 27 at 2:00 PM PT. It takes 30 minutes.";

    @Test
    void anInvitationCreatesOneInterviewWithTheScheduleInPlainWords() {
        assertThat(run(mail("Phone screen with Orbit Freight", INVITE, null))).isEqualTo(InboxInterviewApplier.Result.CREATED);

        assertThat(stored).hasSize(1);
        Interview i = stored.get(0);
        assertThat(i.getSource()).isEqualTo(Interview.SRC_INBOX);
        assertThat(i.getStartsAt()).isEqualTo(Instant.parse("2026-10-27T21:00:00Z"));
        assertThat(i.getEndsAt()).isEqualTo(Instant.parse("2026-10-27T21:30:00Z"));
        assertThat(i.getTz()).isEqualTo("America/Los_Angeles");
        assertThat(i.getKind()).isEqualTo("PHONE");
        assertThat(i.getOutcome()).isEqualTo(Interview.PENDING);
        ArgumentCaptor<String> summary = ArgumentCaptor.forClass(String.class);
        verify(events).record(eq(app), eq(ApplicationEvent.INTERVIEW), any(), any(), eq(ApplicationEvent.SRC_INBOX), any(), summary.capture(), eq(ChangeActor.mail()), any());
        assertThat(summary.getValue()).isEqualTo("Interview Tue Oct 27, 2:00 PM PDT, phone");
        assertThat(published).singleElement().isInstanceOfSatisfying(InboxInterviewChanged.class, e -> {
            assertThat(e.userId()).isEqualTo(USER);
            assertThat(e.startsAt()).isEqualTo(i.getStartsAt());
            assertThat(e.cancelled()).isFalse();
        });
    }

    @Test
    void theSameMailTwiceIsOneInterview() {
        InboxMessage m = mail("Phone screen with Orbit Freight", INVITE, null);
        run(m);
        assertThat(run(m)).isEqualTo(InboxInterviewApplier.Result.UNCHANGED);
        assertThat(stored).hasSize(1);
    }

    @Test
    void aCalendarUpdateWithAHigherSequenceMovesTheSameRowAndKeepsTheEarlierTime() {
        String v0 = json("U-1", 0, "2026-10-27T10:00:00", "America/Los_Angeles");
        String v1 = json("U-1", 1, "2026-10-29T11:30:00", "America/Los_Angeles");
        assertThat(run(mail("Interview with Orbit Freight", "Calendar invitation", v0))).isEqualTo(InboxInterviewApplier.Result.CREATED);
        Interview i = stored.get(0);
        i.setReminder24hSentAt(SENT);

        assertThat(run(mail("Updated invitation: Interview with Orbit Freight", "Calendar invitation", v1))).isEqualTo(InboxInterviewApplier.Result.RESCHEDULED);

        assertThat(stored).hasSize(1);
        assertThat(i.getStartsAt()).isEqualTo(Instant.parse("2026-10-29T18:30:00Z"));
        assertThat(i.getScheduleHistory()).isEqualTo("2026-10-27T17:00:00Z");
        assertThat(i.getSequenceNo()).isEqualTo(1);
        assertThat(i.getReminder24hSentAt()).as("the new time gets its own reminders").isNull();
        ArgumentCaptor<String> summary = ArgumentCaptor.forClass(String.class);
        verify(events, org.mockito.Mockito.times(2)).record(eq(app), eq(ApplicationEvent.INTERVIEW), any(), any(), any(), any(), summary.capture(), any(), any());
        assertThat(summary.getAllValues().get(1)).startsWith("Interview rescheduled: Thu Oct 29, 11:30 AM PDT").endsWith("(was Tue Oct 27, 10:00 AM PDT)");
    }

    @Test
    void anOlderVersionOfTheInvitationIsIgnored() {
        run(mail("Interview with Orbit Freight", "Calendar invitation", json("U-2", 3, "2026-10-29T11:30:00", "America/Los_Angeles")));
        assertThat(run(mail("Interview with Orbit Freight", "Calendar invitation", json("U-2", 1, "2026-10-27T10:00:00", "America/Los_Angeles"))))
            .isEqualTo(InboxInterviewApplier.Result.UNCHANGED);
        assertThat(stored.get(0).getStartsAt()).isEqualTo(Instant.parse("2026-10-29T18:30:00Z"));
    }

    @Test
    void aTextRescheduleMovesTheOnlyOpenInterview() {
        run(mail("Phone screen with Orbit Freight", INVITE, null));
        Interview i = stored.get(0);

        InboxMessage m = mail("Rescheduled: your phone screen with Orbit Freight", "Your phone screen has been rescheduled to Thursday, October 29 at 3:30 PM PT.", null);
        assertThat(run(m)).isEqualTo(InboxInterviewApplier.Result.RESCHEDULED);

        assertThat(stored).hasSize(1);
        assertThat(i.getStartsAt()).isEqualTo(Instant.parse("2026-10-29T22:30:00Z"));
        assertThat(i.getScheduleHistory()).isEqualTo("2026-10-27T21:00:00Z");
        assertThat(i.getEndsAt()).as("the reschedule names no length: the half hour is kept").isEqualTo(Instant.parse("2026-10-29T23:00:00Z"));
    }

    @Test
    void aCancellationMarksTheInterviewCancelledAndTheStatusIsNotTouched() {
        run(mail("Phone screen with Orbit Freight", INVITE, null));
        InboxMessage m = mail("Interview with Orbit Freight cancelled", "We need to cancel our interview with Orbit Freight scheduled for Tuesday, October 27 at 2:00 PM PT.", null);
        ExtractedSchedule s = applier.read(m);

        assertThat(InboxInterviewApplier.statusAfter(ApplicationStatus.APPLIED, s)).as("a cancellation moves nothing, not even forward").isNull();
        assertThat(applier.apply(USER, 5L, m, s)).isEqualTo(InboxInterviewApplier.Result.CANCELLED);

        assertThat(stored.get(0).getOutcome()).isEqualTo(Interview.CANCELLED);
        assertThat(app.getStatus()).isEqualTo(ApplicationStatus.INTERVIEW);
        assertThat(published).hasSize(2);
        assertThat(((InboxInterviewChanged) published.get(1)).cancelled()).isTrue();
    }

    @Test
    void aCancellationForAnInterviewWeNeverSawChangesNothing() {
        InboxMessage m = mail("Interview with Orbit Freight cancelled", "We need to cancel our interview with Orbit Freight scheduled for Tuesday, October 27 at 2:00 PM PT.", null);
        assertThat(run(m)).isEqualTo(InboxInterviewApplier.Result.NOTHING);
        assertThat(stored).isEmpty();
        verify(events, never()).record(any(), any(), any(), any(), any(), any(), any(), any(), any());
    }

    @Test
    void noTimeMeansNoInterviewOnlyANote() {
        InboxMessage m = mail("Interview with Orbit Freight", "We'd like to schedule an interview next week. Please share your availability.", null);
        assertThat(run(m)).isEqualTo(InboxInterviewApplier.Result.NOT_READ);

        assertThat(stored).as("a time is never invented").isEmpty();
        ArgumentCaptor<String> note = ArgumentCaptor.forClass(String.class);
        verify(events).record(eq(app), eq(ApplicationEvent.INTERVIEW), any(), any(), eq(ApplicationEvent.SRC_INBOX), any(), note.capture(), any(), any());
        assertThat(note.getValue()).contains("could not be read").contains("Add the interview yourself");
        assertThat(published).isEmpty();
    }

    @Test
    void aReadingBelowTheAdminConfidenceMakesNoInterviewEither() {
        // 03/04/2026 may be March 4 or 3 April: confidence 48.
        InboxMessage m = mail("Interview with Orbit Freight", "Interview with Orbit Freight on 03/04/2026 10:00 AM ET.", null);
        m.setSentAt(Instant.parse("2026-02-20T17:00:00Z"));
        assertThat(run(m)).isEqualTo(InboxInterviewApplier.Result.NOT_READ);
        assertThat(stored).isEmpty();

        // The admin can lower the bar: the same mail is then taken.
        when(settings.getInt(AdminSettingKeys.INBOX_INTERVIEW_MIN_CONFIDENCE)).thenReturn(40);
        assertThat(run(m)).isEqualTo(InboxInterviewApplier.Result.CREATED);
    }

    @Test
    void aDateLongBeforeTheMailWasSentIsAMisreadNotAnInterview() {
        InboxMessage m = mail("Interview with Orbit Freight", "Interview with Orbit Freight on 10/25/2025 2:00 PM PT (confirmed).", null);
        assertThat(run(m)).isEqualTo(InboxInterviewApplier.Result.NOT_READ);
        assertThat(stored).isEmpty();
    }

    @Test
    void theLinkAndTheLocationAreKeptAndTheMailTextIsNot() {
        InboxMessage m = mail(
            "Onsite interview with Orbit Freight",
            "Your onsite interview is confirmed for Thursday, October 29 at 9:30 AM PT. Join the lobby team at https://orbit.zoom.us/j/4242.\nLocation: 1 Harbor Way, Oakland\nSecret recruiter remark: do not share.",
            null
        );
        run(m);
        Interview i = stored.get(0);
        assertThat(i.getLocation()).isEqualTo("1 Harbor Way, Oakland");
        assertThat(i.getNotes()).isEqualTo("Meeting link: https://orbit.zoom.us/j/4242");
        assertThat(String.join(" ", i.getNotes(), i.getLocation(), String.valueOf(i.getScheduleHistory()))).doesNotContain("Secret recruiter remark");
    }

    @Test
    void historyKeepsTheNewestFirstAndStaysShort() {
        String h = null;
        for (int n = 0; n < 100; n++) h = InboxInterviewApplier.history(h, Instant.parse("2026-10-27T21:00:00Z").plusSeconds(n * 86400L));
        assertThat(h.length()).isLessThanOrEqualTo(1000);
        assertThat(h).startsWith("2027-02-0").contains("\n2026-");
    }

    private static String json(String uid, int sequence, String localStart, String tz) {
        return "{\"method\":\"REQUEST\",\"uid\":\"" + uid + "\",\"sequence\":" + sequence + ",\"start\":\"" + localStart + "\",\"tz\":\"" + tz + "\",\"cancelled\":false}";
    }
}
