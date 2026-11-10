package com.dossier.api.service.inbox;

import static org.assertj.core.api.Assertions.assertThat;

import com.dossier.api.domain.enumeration.ApplicationStatus;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.InputStream;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Stream;
import org.junit.jupiter.api.DynamicTest;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestFactory;

/**
 * The interview-mail corpus ({@code inbox/interview-corpus.json}): synthetic invitations, reschedules, cancellations and mails that must NOT give a
 * schedule (fictional people and companies, no real data). Each case says the UTC instant, the zone, the kind, the link, the location and the status
 * outcome it must give. The expected instants were computed from the IANA zone rules by a script, not by the code under test. Includes both daylight saving
 * transitions (spring forward and fall back, a time that does not exist and one that happens twice) and 12-hour against 24-hour clocks.
 */
class InterviewScheduleCorpusTest {

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final int DEFAULT_MIN_CONFIDENCE = 60;

    private static JsonNode corpus() throws Exception {
        try (InputStream in = InterviewScheduleCorpusTest.class.getClassLoader().getResourceAsStream("inbox/interview-corpus.json")) {
            return JSON.readTree(in);
        }
    }

    @Test
    void theCorpusHoldsAtLeastTwentyMailsOfEveryKind() throws Exception {
        JsonNode cases = corpus().path("cases");
        assertThat(cases.size()).isGreaterThanOrEqualTo(20);
        List<String> ids = new ArrayList<>();
        int ics = 0, text = 0, none = 0, cancels = 0, reschedules = 0, dst = 0;
        for (JsonNode c : cases) {
            ids.add(c.path("id").asText());
            JsonNode e = c.path("expect");
            switch (e.path("source").asText()) {
                case "ICS" -> ics++;
                case "TEXT" -> text++;
                default -> none++;
            }
            if (e.path("cancelled").asBoolean()) cancels++;
            if (e.path("rescheduled").asBoolean()) reschedules++;
            if (c.path("id").asText().startsWith("dst-")) dst++;
        }
        assertThat(ids).doesNotHaveDuplicates();
        assertThat(ics).as("calendar invitations").isGreaterThanOrEqualTo(5);
        assertThat(text).as("text invitations").isGreaterThanOrEqualTo(10);
        assertThat(none).as("mails that give no schedule").isGreaterThanOrEqualTo(5);
        assertThat(cancels).isGreaterThanOrEqualTo(2);
        assertThat(reschedules).isGreaterThanOrEqualTo(2);
        assertThat(dst).as("daylight saving edge cases").isGreaterThanOrEqualTo(4);
    }

    @TestFactory
    Stream<DynamicTest> eachMailGivesTheScheduleItShould() throws Exception {
        List<DynamicTest> tests = new ArrayList<>();
        for (JsonNode c : corpus().path("cases")) tests.add(DynamicTest.dynamicTest(c.path("id").asText(), () -> check(c)));
        return tests.stream();
    }

    private static void check(JsonNode c) throws Exception {
        String id = c.path("id").asText();
        JsonNode e = c.path("expect");
        // The calendar part goes through the same reduce-to-fields-and-store step the sync uses.
        IcsEvent ics = null;
        if (c.hasNonNull("ics")) {
            IcsEvent read = IcsReader.read(c.path("ics").asText()).orElse(null);
            assertThat(read).as(id + ": the calendar part is readable").isNotNull();
            ics = MailCalendar.parse(JSON.writeValueAsString(read));
        }
        ExtractedSchedule s = InterviewScheduleExtractor.extract(
            c.path("subject").asText(),
            c.path("body").asText(),
            ics,
            Instant.parse(c.path("mailDate").asText()),
            c.hasNonNull("mailZone") ? ZoneOffset.of(c.path("mailZone").asText()) : null,
            null
        );

        if (e.hasNonNull("start")) assertThat(s.startUtc()).as(id + " start").isEqualTo(Instant.parse(e.path("start").asText()));
        else assertThat(s.startUtc()).as(id + " start").isNull();
        if (e.hasNonNull("end")) assertThat(s.endUtc()).as(id + " end").isEqualTo(Instant.parse(e.path("end").asText()));
        else assertThat(s.endUtc()).as(id + " end").isNull();
        if (e.hasNonNull("zone")) assertThat(s.zoneId()).as(id + " zone").isEqualTo(e.path("zone").asText());
        assertThat(s.kind()).as(id + " kind").isEqualTo(e.path("kind").asText());
        assertThat(s.link()).as(id + " link").isEqualTo(e.hasNonNull("link") ? e.path("link").asText() : null);
        assertThat(s.location()).as(id + " location").isEqualTo(e.hasNonNull("location") ? e.path("location").asText() : null);
        assertThat(s.cancelled()).as(id + " cancelled").isEqualTo(e.path("cancelled").asBoolean());
        assertThat(s.rescheduled()).as(id + " rescheduled").isEqualTo(e.path("rescheduled").asBoolean());
        assertThat(s.source().name()).as(id + " source").isEqualTo(e.path("source").asText());
        assertThat(s.uid()).as(id + " uid").isEqualTo(e.hasNonNull("uid") ? e.path("uid").asText() : null);
        assertThat(s.sequence()).as(id + " sequence").isEqualTo(e.hasNonNull("sequence") ? Integer.valueOf(e.path("sequence").asInt()) : null);
        boolean readable = s.scheduled() && s.confidence() >= DEFAULT_MIN_CONFIDENCE;
        assertThat(readable).as(id + " readable at confidence " + s.confidence()).isEqualTo(e.path("readable").asBoolean());
        assertThat(s.confidence()).as(id + " confidence is 0..100").isBetween(0, 100);

        // The status outcome: read as an interview mail, forward only, a cancellation changes nothing.
        MailClassifier.Reading r = MailClassifier.read(c.path("subject").asText(), c.path("body").asText(), "Recruiting");
        assertThat(r.category()).as(id + " category").isEqualTo(MailClassifier.Category.INTERVIEW);
        ApplicationStatus from = ApplicationStatus.valueOf(c.path("statusFrom").asText());
        ApplicationStatus after = InboxInterviewApplier.statusAfter(from, s);
        assertThat(after == null ? null : after.name()).as(id + " status after").isEqualTo(e.hasNonNull("statusAfter") ? e.path("statusAfter").asText() : null);
    }
}
