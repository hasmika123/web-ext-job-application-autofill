package com.dossier.api.service.ent.consultantws;

import static org.assertj.core.api.Assertions.assertThat;

import com.dossier.api.domain.Interview;
import com.dossier.api.service.ent.consultantws.ConsultantInboxDTO.UpdateInterview;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;

/** Which interview an update row shows, and the one link it may carry (https only). Pure, no Spring. */
class ConsultantInboxUpdateRowsTest {

    private static final Instant NOW = Instant.parse("2026-10-18T12:00:00Z");

    private static Interview interview(long id, String startsAt, String outcome, String notes) {
        Interview i = new Interview();
        try {
            var f = Interview.class.getDeclaredField("id");
            f.setAccessible(true);
            f.set(i, id);
        } catch (ReflectiveOperationException e) {
            throw new IllegalStateException(e);
        }
        i.setApplicationId(7L);
        i.setKind("PHONE");
        i.setStartsAt(Instant.parse(startsAt));
        i.setTz("America/Los_Angeles");
        i.setOutcome(outcome);
        i.setNotes(notes);
        i.setSource(Interview.SRC_INBOX);
        return i;
    }

    @Test
    void noInterviewMeansNull() {
        assertThat(ConsultantInboxService.interviewOf(null, NOW)).isNull();
        assertThat(ConsultantInboxService.interviewOf(List.of(), NOW)).isNull();
    }

    @Test
    void theSoonestUpcomingNonCancelledOneWins() {
        List<Interview> rows = List.of(
            interview(1, "2026-10-10T17:00:00Z", "PENDING", null), // past
            interview(2, "2026-10-20T17:00:00Z", Interview.CANCELLED, null), // cancelled
            interview(3, "2026-10-27T21:00:00Z", "PENDING", "Meeting link: https://meet.example.com/abc"),
            interview(4, "2026-11-02T21:00:00Z", "PENDING", null)
        );
        UpdateInterview u = ConsultantInboxService.interviewOf(rows, NOW);
        assertThat(u.id()).isEqualTo(3L);
        assertThat(u.startsAt()).isEqualTo(Instant.parse("2026-10-27T21:00:00Z"));
        assertThat(u.tz()).isEqualTo("America/Los_Angeles");
        assertThat(u.kind()).isEqualTo("PHONE");
        assertThat(u.link()).isEqualTo("https://meet.example.com/abc");
        assertThat(u.cancelled()).isFalse();
    }

    @Test
    void whenNothingIsUpcomingTheMostRecentOneIsShownAndCancelledIsFlagged() {
        List<Interview> rows = List.of(interview(1, "2026-10-01T17:00:00Z", "PASSED", null), interview(2, "2026-10-05T17:00:00Z", Interview.CANCELLED, null));
        UpdateInterview u = ConsultantInboxService.interviewOf(rows, NOW);
        assertThat(u.id()).isEqualTo(2L);
        assertThat(u.cancelled()).isTrue();
    }

    @Test
    void onlyAnHttpsMeetingLinkIsReturned() {
        assertThat(ConsultantInboxService.linkOf("Meeting link: https://zoom.example.com/j/1")).isEqualTo("https://zoom.example.com/j/1");
        assertThat(ConsultantInboxService.linkOf("Bring ID\nMeeting link: https://zoom.example.com/j/1")).isEqualTo("https://zoom.example.com/j/1");
        assertThat(ConsultantInboxService.linkOf("Meeting link: http://zoom.example.com/j/1")).isNull();
        assertThat(ConsultantInboxService.linkOf("Meeting link: javascript:alert(1)")).isNull();
        assertThat(ConsultantInboxService.linkOf("Meeting link: https://a.example.com/x y")).isNull();
        assertThat(ConsultantInboxService.linkOf("Meeting link: ")).isNull();
        assertThat(ConsultantInboxService.linkOf("no link here")).isNull();
        assertThat(ConsultantInboxService.linkOf(null)).isNull();
    }
}
