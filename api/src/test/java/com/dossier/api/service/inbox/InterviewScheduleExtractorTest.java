package com.dossier.api.service.inbox;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.time.ZoneOffset;
import org.junit.jupiter.api.Test;

/** The corners of the schedule reader that the corpus does not spell out: zones, caps, hostile input, the calendar parser. */
class InterviewScheduleExtractorTest {

    private static final Instant MAIL = Instant.parse("2026-10-12T16:30:00Z");

    private static ExtractedSchedule text(String body) {
        return InterviewScheduleExtractor.extract("Interview with Acme", body, null, MAIL, ZoneOffset.ofHours(-7), null);
    }

    @Test
    void everyZoneAbbreviationMapsToItsRegionAndTheDateDecidesDaylightSaving() {
        // 2026-10-27 is in US daylight time; 2026-11-04 is in standard time. The same abbreviation follows the date.
        assertThat(text("Acme: Tuesday, October 27 at 9:00 AM PST.").startUtc()).isEqualTo(Instant.parse("2026-10-27T16:00:00Z"));
        assertThat(text("Acme: Wednesday, November 4 at 9:00 AM PDT.").startUtc()).isEqualTo(Instant.parse("2026-11-04T17:00:00Z"));
        assertThat(text("Acme: Wednesday, November 4 at 9:00 AM EST.").startUtc()).isEqualTo(Instant.parse("2026-11-04T14:00:00Z"));
        assertThat(text("Acme: Wednesday, November 4 at 9:00 AM CT.").startUtc()).isEqualTo(Instant.parse("2026-11-04T15:00:00Z"));
        assertThat(text("Acme: Wednesday, November 4 at 9:00 AM MST.").startUtc()).isEqualTo(Instant.parse("2026-11-04T16:00:00Z"));
        assertThat(text("Acme: Wednesday, November 4 at 9:00 AM GMT.").startUtc()).isEqualTo(Instant.parse("2026-11-04T09:00:00Z"));
        assertThat(text("Acme: Wednesday, November 4 at 9:00 AM UTC.").startUtc()).isEqualTo(Instant.parse("2026-11-04T09:00:00Z"));
        assertThat(text("Acme: Wednesday, November 4 at 9:00 AM BST.").zoneId()).isEqualTo("Europe/London");
        assertThat(text("Acme: Wednesday, November 4 at 9:00 AM CEST.").zoneId()).isEqualTo("Europe/Paris");
        assertThat(text("Acme: Wednesday, November 4 at 9:00 AM GMT+5:30.").startUtc()).isEqualTo(Instant.parse("2026-11-04T03:30:00Z"));
        assertThat(text("Acme: Wednesday, November 4 at 9:00 AM America/Sao_Paulo.").startUtc()).isEqualTo(Instant.parse("2026-11-04T12:00:00Z"));
    }

    @Test
    void istIsIndiaStandardTimeNotIrishOrIsraeli() {
        ExtractedSchedule s = text("Acme: Wednesday, November 4 at 9:00 AM IST.");
        assertThat(s.zoneId()).isEqualTo("Asia/Kolkata");
        assertThat(s.startUtc()).isEqualTo(Instant.parse("2026-11-04T03:30:00Z"));
    }

    @Test
    void anExplicitZoneBeatsTheMailsAndWithNoZoneAtAllTheReadingIsTooWeakForTheDefault() {
        ExtractedSchedule explicit = text("Acme: Wednesday, November 4 at 9:00 AM ET.");
        ExtractedSchedule fromMail = text("Acme: Wednesday, November 4 at 9:00 AM.");
        ExtractedSchedule nothing = InterviewScheduleExtractor.extract("Interview with Acme", "Acme: Wednesday, November 4 at 9:00 AM.", null, MAIL, null, null);

        assertThat(explicit.startUtc()).isEqualTo(Instant.parse("2026-11-04T14:00:00Z"));
        assertThat(fromMail.startUtc()).as("the Date header's -07:00").isEqualTo(Instant.parse("2026-11-04T16:00:00Z"));
        assertThat(nothing.startUtc()).as("UTC as the last resort").isEqualTo(Instant.parse("2026-11-04T09:00:00Z"));
        assertThat(explicit.confidence()).isGreaterThan(fromMail.confidence());
        assertThat(fromMail.confidence()).isGreaterThan(nothing.confidence());
        assertThat(nothing.confidence()).as("below the default 60").isLessThan(60);
    }

    @Test
    void aRangeThatCrossesNoonKeepsTheMorningStart() {
        ExtractedSchedule s = text("Acme: Wednesday, November 4, 11:00 - 12:00 PM ET.");
        assertThat(s.startUtc()).isEqualTo(Instant.parse("2026-11-04T16:00:00Z"));
        assertThat(s.endUtc()).isEqualTo(Instant.parse("2026-11-04T17:00:00Z"));
    }

    @Test
    void aBareNumberIsNotATimeAndADurationNeedsToSayHowLongTheMeetingIs() {
        assertThat(text("Acme: you applied on October 3 and we have 12 openings. Meet on Wednesday, November 4 at 9:00 AM ET.").startUtc())
            .isEqualTo(Instant.parse("2026-11-04T14:00:00Z"));
        ExtractedSchedule noLength = text("Acme: Wednesday, November 4 at 9:00 AM ET. Please arrive 15 minutes early.");
        assertThat(noLength.endUtc()).isNull();
        ExtractedSchedule length = text("Acme: Wednesday, November 4 at 9:00 AM ET. This is a 45-minute interview.");
        assertThat(length.endUtc()).isEqualTo(Instant.parse("2026-11-04T14:45:00Z"));
        assertThat(text("Acme: Wednesday, November 4 at 9:00 AM ET. The call stays about 30 minutes.").endUtc()).isEqualTo(Instant.parse("2026-11-04T14:30:00Z"));
        assertThat(text("Acme: Wednesday, November 4 at 9:00 AM ET. This is a short thing, it is 5 minutes from the station.").endUtc()).as("under ten minutes is not a meeting").isNull();
        ExtractedSchedule hour = text("Acme: Wednesday, November 4 at 9:00 AM ET. The session lasts 1.5 hours.");
        assertThat(hour.endUtc()).isEqualTo(Instant.parse("2026-11-04T15:30:00Z"));
    }

    @Test
    void linksMustBeHttpOrHttpsWithoutCredentialsAndShort() {
        assertThat(InterviewScheduleExtractor.safeLink("https://zoom.us/j/123.")).isEqualTo("https://zoom.us/j/123");
        assertThat(InterviewScheduleExtractor.safeLink("http://meet.google.com/abc-def")).isEqualTo("http://meet.google.com/abc-def");
        assertThat(InterviewScheduleExtractor.safeLink("javascript:alert(1)")).isNull();
        assertThat(InterviewScheduleExtractor.safeLink("ftp://zoom.us/j/1")).isNull();
        assertThat(InterviewScheduleExtractor.safeLink("https://user:pw@zoom.us/j/1")).isNull();
        assertThat(InterviewScheduleExtractor.safeLink("https://zoom.us/j/" + "1".repeat(500))).isNull();
        assertThat(InterviewScheduleExtractor.safeLink("https://zoom.us/j/1\u0000x")).isNull();
        assertThat(InterviewScheduleExtractor.isMeetingHost("https://acme.zoom.us/j/1")).isTrue();
        assertThat(InterviewScheduleExtractor.isMeetingHost("https://evilzoom.us/j/1")).isFalse();
    }

    @Test
    void aLocationIsCappedStrippedAndDroppedWhenItHoldsAForbiddenValue() {
        assertThat(InterviewScheduleExtractor.safeLocation("  Floor 3,\u0007 1 Main St  ")).isEqualTo("Floor 3, 1 Main St");
        assertThat(InterviewScheduleExtractor.safeLocation("x".repeat(400))).hasSize(200);
        assertThat(InterviewScheduleExtractor.safeLocation("https://zoom.us/j/1")).as("a link is not a place").isNull();
        assertThat(InterviewScheduleExtractor.safeLocation("Zoom Meeting")).isNull();
        assertThat(InterviewScheduleExtractor.safeLocation("Bring SSN 123-45-6789")).isNull();
    }

    @Test
    void kindsFollowTheWordsOfTheMail() {
        assertThat(InterviewScheduleExtractor.kindOf("a panel interview over Zoom")).isEqualTo("PANEL");
        assertThat(InterviewScheduleExtractor.kindOf("live coding session")).isEqualTo("TECHNICAL");
        assertThat(InterviewScheduleExtractor.kindOf("a virtual onsite")).isEqualTo("VIDEO");
        assertThat(InterviewScheduleExtractor.kindOf("onsite at our office")).isEqualTo("ONSITE");
        assertThat(InterviewScheduleExtractor.kindOf("a quick phone screen")).isEqualTo("PHONE");
        assertThat(InterviewScheduleExtractor.kindOf("behavioral interview")).isEqualTo("BEHAVIORAL");
        assertThat(InterviewScheduleExtractor.kindOf("a chat")).isEqualTo("OTHER");
    }

    @Test
    void controlCharactersAndHugeInputAreHarmless() {
        String noise = "\u0000\u0001\u0007 ".repeat(5000);
        ExtractedSchedule s = text(noise + " Wednesday, November 4 at 9:00 AM ET. " + noise);
        assertThat(s.startUtc()).isEqualTo(Instant.parse("2026-11-04T14:00:00Z"));
        assertThat(text("").scheduled()).isFalse();
        assertThat(InterviewScheduleExtractor.extract(null, null, null, null, null, null).scheduled()).isFalse();
    }

    // ---- the calendar parser ---------------------------------------------------------------------------------------------------------------

    @Test
    void theCalendarReaderUnfoldsLinesUnescapesAndSkipsWhatItDoesNotKnow() {
        String ics = "BEGIN:VCALENDAR\r\nMETHOD:REQUEST\r\nBEGIN:VEVENT\r\nUID:abc\r\nDTSTART;TZID=\"Pacific Standard Time\":20261027T100000\r\n" +
            "SUMMARY:Interview\\, round\r\n 2\r\nLOCATION:Room 4\\; Floor 2\r\nX-UNKNOWN:ignored\r\nDESCRIPTION:Join https://acme.zoom.us/j/55\\nthanks\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n";
        IcsEvent e = IcsReader.read(ics).orElseThrow();
        assertThat(e.method()).isEqualTo("REQUEST");
        assertThat(e.uid()).isEqualTo("abc");
        assertThat(e.start()).isEqualTo("2026-10-27T10:00:00");
        assertThat(e.tz()).isEqualTo("America/Los_Angeles");
        assertThat(e.summary()).isEqualTo("Interview, round2");
        assertThat(e.location()).isEqualTo("Room 4; Floor 2");
        assertThat(e.link()).isEqualTo("https://acme.zoom.us/j/55");
    }

    @Test
    void theCalendarReaderNeverThrowsOnGarbage() {
        assertThat(IcsReader.read(null)).isEmpty();
        assertThat(IcsReader.read("")).isEmpty();
        assertThat(IcsReader.read("not a calendar")).isEmpty();
        assertThat(IcsReader.read("BEGIN:VEVENT\r\nDTSTART:garbage\r\nEND:VEVENT")).hasValueSatisfying(e -> assertThat(e.start()).isNull());
        assertThat(IcsReader.read("BEGIN:VEVENT\r\nDTSTART;TZID=Nowhere/Land:20261027T100000\r\nEND:VEVENT")).hasValueSatisfying(e -> assertThat(e.tz()).isNull());
        String many = "BEGIN:VEVENT\r\n" + "X-A:1\r\n".repeat(100_000) + "END:VEVENT\r\n";
        assertThat(IcsReader.read(many)).isNotNull();
    }

    @Test
    void aCancelledEventIsOnlyChosenWhenThereIsNothingElse() {
        String ics = "BEGIN:VEVENT\r\nUID:a\r\nSTATUS:CANCELLED\r\nDTSTART:20261027T100000Z\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nUID:b\r\nDTSTART:20261028T100000Z\r\nEND:VEVENT\r\n";
        assertThat(IcsReader.read(ics).orElseThrow().uid()).isEqualTo("b");
    }
}
