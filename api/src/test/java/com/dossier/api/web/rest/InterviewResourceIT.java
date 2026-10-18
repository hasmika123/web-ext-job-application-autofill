package com.dossier.api.web.rest;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultHandlers.print;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.Application;
import com.dossier.api.domain.ApplicationEvent;
import com.dossier.api.domain.Interview;
import com.dossier.api.domain.User;
import com.dossier.api.domain.enumeration.ApplicationStatus;
import com.dossier.api.repository.ApplicationEventRepository;
import com.dossier.api.repository.ApplicationRepository;
import com.dossier.api.repository.InterviewRepository;
import com.dossier.api.repository.UserRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.transaction.annotation.Transactional;

/**
 * Interviews end to end (APP-E2E U6.4): log, change, remove, outcome, the date-range feed and the .ics
 * export, as the seeded "user". Another user's application and interviews ("admin" here) are a 404 on every
 * route and never appear in a range.
 */
@IntegrationTest
@AutoConfigureMockMvc
@WithMockUser(username = "user")
@Transactional
class InterviewResourceIT {

    private static final String APPS = "/api/profile/applications";
    private static final String INTERVIEWS = "/api/profile/interviews";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper om;

    @Autowired
    private ApplicationRepository applicationRepository;

    @Autowired
    private InterviewRepository interviewRepository;

    @Autowired
    private ApplicationEventRepository eventRepository;

    @Autowired
    private UserRepository userRepository;

    private User me;
    private User other;
    private Application app;

    @BeforeEach
    void seed() {
        me = userRepository.findOneByLogin("user").orElseThrow();
        other = userRepository.findOneByLogin("admin").orElseThrow();
        app = application(me, "Acme", "Backend Engineer");
    }

    private Application application(User owner, String company, String role) {
        Application a = new Application();
        a.setUser(owner);
        a.setCompany(company);
        a.setRoleTitle(role);
        a.setStatus(ApplicationStatus.APPLIED);
        a.setCreatedAt(Instant.now().minus(20, ChronoUnit.DAYS));
        a.setUpdatedAt(Instant.now());
        a.setArchived(false);
        return applicationRepository.saveAndFlush(a);
    }

    private Interview row(Application a, User owner, String kind, Instant startsAt, String outcome) {
        Interview i = new Interview();
        i.setApplicationId(a.getId());
        i.setUserId(owner.getId());
        i.setKind(kind);
        i.setStartsAt(startsAt);
        i.setTz("America/New_York");
        i.setOutcome(outcome);
        return interviewRepository.saveAndFlush(i);
    }

    private ResultActions json(MockHttpServletRequestBuilder b, String body) throws Exception {
        return mockMvc.perform(b.contentType(MediaType.APPLICATION_JSON).content(body));
    }

    private String url(Application a) {
        return APPS + "/" + a.getId() + "/interviews";
    }

    private static String iso(Instant t) {
        return t.truncatedTo(ChronoUnit.SECONDS).toString();
    }

    // ---- create -------------------------------------------------------------------------------------

    @Test
    void loggingAnInterviewReturnsItWritesATimelineEventAndLeavesTheStatusAlone() throws Exception {
        Instant at = Instant.now().plus(3, ChronoUnit.DAYS);
        String body =
            "{\"kind\":\"video\",\"startsAt\":\"" + iso(at) + "\",\"endsAt\":\"" + iso(at.plus(1, ChronoUnit.HOURS)) + "\",\"tz\":\"America/New_York\"," +
            "\"location\":\"https://meet.example.com/abc\",\"interviewer\":\"Sam Rivera\",\"notes\":\"Bring the portfolio\"}";

        json(post(url(app)), body)
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.id").exists())
            .andExpect(jsonPath("$.applicationId").value(app.getId()))
            .andExpect(jsonPath("$.company").value("Acme"))
            .andExpect(jsonPath("$.roleTitle").value("Backend Engineer"))
            .andExpect(jsonPath("$.kind").value("VIDEO"))
            .andExpect(jsonPath("$.tz").value("America/New_York"))
            .andExpect(jsonPath("$.location").value("https://meet.example.com/abc"))
            .andExpect(jsonPath("$.interviewer").value("Sam Rivera"))
            .andExpect(jsonPath("$.notes").value("Bring the portfolio"))
            .andExpect(jsonPath("$.outcome").value("PENDING"))
            .andExpect(jsonPath("$.source").value("WEB"));

        List<ApplicationEvent> events = eventRepository.findByApplicationIdOrderByCreatedAtDescIdDesc(app.getId(), PageRequest.of(0, 5));
        assertThat(events).hasSize(1);
        assertThat(events.get(0).getKind()).isEqualTo(ApplicationEvent.INTERVIEW);
        assertThat(events.get(0).getSummary()).startsWith("Interview scheduled: Video interview");
        assertThat(events.get(0).getRefId()).isNotNull();
        assertThat(applicationRepository.findById(app.getId()).orElseThrow().getStatus()).isEqualTo(ApplicationStatus.APPLIED);
    }

    @Test
    void onlyKindAndStartTimeAreRequired() throws Exception {
        json(post(url(app)), "{\"kind\":\"PHONE\",\"startsAt\":\"2026-11-04T15:00:00+01:00\"}")
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.startsAt").value("2026-11-04T14:00:00Z"))
            .andExpect(jsonPath("$.tz").doesNotExist())
            .andExpect(jsonPath("$.endsAt").doesNotExist());
    }

    @Test
    void createRefusesBadValuesWithAPathAndACode() throws Exception {
        String ok = "\"kind\":\"VIDEO\",\"startsAt\":\"2026-11-04T15:00:00Z\"";
        json(post(url(app)), "{\"startsAt\":\"2026-11-04T15:00:00Z\"}").andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("TRACKER_INVALID")).andExpect(jsonPath("$.path").value("kind"));
        json(post(url(app)), "{\"kind\":\"COFFEE\",\"startsAt\":\"2026-11-04T15:00:00Z\"}").andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.path").value("kind"));
        json(post(url(app)), "{\"kind\":\"VIDEO\"}").andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.path").value("startsAt"));
        json(post(url(app)), "{\"kind\":\"VIDEO\",\"startsAt\":\"next tuesday\"}").andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.path").value("startsAt"));
        json(post(url(app)), "{" + ok + ",\"tz\":\"Mars/Olympus\"}").andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.path").value("tz"));
        json(post(url(app)), "{" + ok + ",\"endsAt\":\"2026-11-04T14:00:00Z\"}").andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.path").value("endsAt"));
        // tracker.interview.maxDurationHours = 24
        json(post(url(app)), "{" + ok + ",\"endsAt\":\"2026-11-05T16:00:00Z\"}").andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.path").value("endsAt"));
        json(post(url(app)), "{" + ok + ",\"location\":\"" + "x".repeat(201) + "\"}").andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.path").value("location"));
        json(post(url(app)), "{" + ok + ",\"interviewer\":\"" + "x".repeat(121) + "\"}").andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.path").value("interviewer"));
        json(post(url(app)), "{" + ok + ",\"notes\":\"" + "x".repeat(4001) + "\"}").andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.path").value("notes")); // tracker.interview.notesMaxChars
        assertThat(interviewRepository.countByApplicationId(app.getId())).isZero();
    }

    @Test
    void freeTextNeverHoldsANeverCollectedValue() throws Exception {
        String ok = "\"kind\":\"VIDEO\",\"startsAt\":\"2026-11-04T15:00:00Z\"";
        json(post(url(app)), "{" + ok + ",\"notes\":\"SSN 123-45-6789 for the background check\"}")
            .andExpect(status().isUnprocessableEntity())
            .andExpect(jsonPath("$.code").value("SENSITIVE_CONTENT"))
            .andExpect(jsonPath("$.path").value("notes"))
            .andExpect(jsonPath("$.class").value("SSN_ITIN"));
        json(post(url(app)), "{" + ok + ",\"location\":\"Passport number: X1234567\"}").andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("SENSITIVE_CONTENT"));
        json(post(url(app)), "{" + ok + ",\"interviewer\":\"DOB: 1990-05-12\"}").andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("SENSITIVE_CONTENT"));

        // and an edit cannot add one later
        long id = om.readTree(json(post(url(app)), "{" + ok + "}").andReturn().getResponse().getContentAsString()).path("id").asLong();
        json(put(url(app) + "/" + id), "{\"notes\":\"SSN 123-45-6789\"}").andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("SENSITIVE_CONTENT"));
        assertThat(interviewRepository.findById(id).orElseThrow().getNotes()).isNull();
    }

    @Test
    void anApplicationHoldsAtMostTheConfiguredNumberOfInterviews() throws Exception {
        for (int i = 0; i < 30; i++) row(app, me, "PHONE", Instant.now().plus(i + 1, ChronoUnit.DAYS), "PENDING");
        json(post(url(app)), "{\"kind\":\"VIDEO\",\"startsAt\":\"2026-11-04T15:00:00Z\"}")
            .andExpect(status().isUnprocessableEntity())
            .andExpect(jsonPath("$.code").value("TRACKER_LIMIT"))
            .andExpect(jsonPath("$.limit").value(30)); // tracker.interviews.maxPerApplication
    }

    // ---- update, delete, outcome ----------------------------------------------------------------------

    @Test
    void anUpdateChangesOnlyWhatIsSentAndAReschedulingIsOnTheTimeline() throws Exception {
        Interview i = row(app, me, "VIDEO", Instant.parse("2026-11-04T15:00:00Z"), "PENDING");
        i.setLocation("Zoom");
        i.setEndsAt(Instant.parse("2026-11-04T16:00:00Z"));
        interviewRepository.saveAndFlush(i);
        String u = url(app) + "/" + i.getId();

        json(put(u), "{\"location\":\"Room 4\",\"endsAt\":null}")
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.location").value("Room 4"))
            .andExpect(jsonPath("$.endsAt").doesNotExist())
            .andExpect(jsonPath("$.kind").value("VIDEO"))
            .andExpect(jsonPath("$.startsAt").value("2026-11-04T15:00:00Z"));
        assertThat(eventRepository.findByApplicationIdOrderByCreatedAtDescIdDesc(app.getId(), PageRequest.of(0, 5)))
            .as("a field edit is a history row now (change audit): the fields are named, the values are not")
            .singleElement()
            .satisfies(e -> {
                assertThat(e.getSummary()).startsWith("Interview updated: ");
                assertThat(e.getChanges()).contains("{\"f\":\"location\"}").contains("\"f\":\"endsAt\"").doesNotContain("Room 4");
            });

        json(put(u), "{\"startsAt\":\"2026-11-05T15:00:00Z\",\"kind\":\"onsite\"}")
            .andExpect(jsonPath("$.startsAt").value("2026-11-05T15:00:00Z"))
            .andExpect(jsonPath("$.kind").value("ONSITE"));
        assertThat(eventRepository.findByApplicationIdOrderByCreatedAtDescIdDesc(app.getId(), PageRequest.of(0, 5)))
            .hasSize(2)
            .first()
            .satisfies(e -> assertThat(e.getSummary()).startsWith("Interview rescheduled: Onsite interview"));

        json(put(u), "{\"kind\":null}").andExpect(status().isUnprocessableEntity());
        json(put(u), "{\"endsAt\":\"2026-11-05T14:00:00Z\"}").andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.path").value("endsAt"));
    }

    @Test
    void deletingAnInterviewRemovesItOnceAndNotesItOnTheTimeline() throws Exception {
        Interview i = row(app, me, "PHONE", Instant.parse("2026-11-04T15:00:00Z"), "PENDING");
        String u = url(app) + "/" + i.getId();
        mockMvc.perform(delete(u)).andExpect(status().isNoContent());
        mockMvc.perform(delete(u)).andExpect(status().isNotFound());
        assertThat(interviewRepository.findById(i.getId())).isEmpty();
        assertThat(eventRepository.findByApplicationIdOrderByCreatedAtDescIdDesc(app.getId(), PageRequest.of(0, 5)))
            .singleElement()
            .satisfies(e -> assertThat(e.getSummary()).startsWith("Interview removed"));
    }

    @Test
    void theOutcomeIsRecordedAndWritesOneEventPerChange() throws Exception {
        Interview i = row(app, me, "VIDEO", Instant.now().minus(1, ChronoUnit.DAYS), "PENDING");
        String u = url(app) + "/" + i.getId() + "/outcome";

        json(post(u), "{\"outcome\":\"passed\"}").andExpect(status().isOk()).andExpect(jsonPath("$.outcome").value("PASSED"));
        json(post(u), "{\"outcome\":\"PASSED\"}").andExpect(status().isOk()); // unchanged: no second event
        json(post(u), "{\"outcome\":\"NO_SHOW\"}").andExpect(jsonPath("$.outcome").value("NO_SHOW"));
        json(post(u), "{\"outcome\":\"MAYBE\"}").andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("TRACKER_INVALID")).andExpect(jsonPath("$.path").value("outcome"));
        json(post(u), "{}").andExpect(status().isUnprocessableEntity());

        assertThat(eventRepository.findByApplicationIdOrderByCreatedAtDescIdDesc(app.getId(), PageRequest.of(0, 10)))
            .extracting(ApplicationEvent::getSummary)
            .containsExactly("Interview outcome: No show", "Interview outcome: Passed");
        assertThat(interviewRepository.findById(i.getId()).orElseThrow().getOutcome()).isEqualTo("NO_SHOW");
    }

    // ---- the date-range feed -----------------------------------------------------------------------------

    @Test
    void theRangeListsMyInterviewsSoonestFirstWithTheirApplications() throws Exception {
        Application second = application(me, "Globex", "Designer");
        Instant now = Instant.now();
        row(second, me, "PANEL", now.plus(5, ChronoUnit.DAYS), "PENDING");
        row(app, me, "VIDEO", now.plus(2, ChronoUnit.DAYS), "PENDING");
        row(app, me, "PHONE", now.minus(2, ChronoUnit.DAYS), "PENDING"); // past
        row(app, me, "ONSITE", now.plus(90, ChronoUnit.DAYS), "PENDING"); // beyond the default 30 days
        row(application(other, "Theirs", "Engineer"), other, "VIDEO", now.plus(1, ChronoUnit.DAYS), "PENDING");

        mockMvc
            .perform(get(INTERVIEWS))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$", hasSize(2)))
            .andExpect(jsonPath("$[*].kind", contains("VIDEO", "PANEL")))
            .andExpect(jsonPath("$[0].company").value("Acme"))
            .andExpect(jsonPath("$[1].company").value("Globex"))
            .andExpect(jsonPath("$[1].roleTitle").value("Designer"));

        mockMvc
            .perform(get(INTERVIEWS).param("from", iso(now.minus(3, ChronoUnit.DAYS))).param("to", iso(now.plus(100, ChronoUnit.DAYS))))
            .andExpect(jsonPath("$", hasSize(4)))
            .andExpect(jsonPath("$[0].kind").value("PHONE"));
    }

    @Test
    void aDateOnlyToIncludesThatWholeDayAndOutcomeFilters() throws Exception {
        row(app, me, "PHONE", Instant.parse("2026-12-10T08:00:00Z"), "PASSED");
        row(app, me, "VIDEO", Instant.parse("2026-12-10T22:30:00Z"), "PENDING");
        row(app, me, "ONSITE", Instant.parse("2026-12-11T01:00:00Z"), "PENDING");

        mockMvc.perform(get(INTERVIEWS).param("from", "2026-12-10").param("to", "2026-12-10")).andExpect(jsonPath("$", hasSize(2)));
        mockMvc.perform(get(INTERVIEWS).param("from", "2026-12-10").param("to", "2026-12-12").param("outcome", "pending")).andExpect(jsonPath("$[*].kind", contains("VIDEO", "ONSITE")));
        mockMvc.perform(get(INTERVIEWS).param("from", "2026-12-10").param("to", "2026-12-12").param("outcome", "SOMETHING")).andExpect(status().isUnprocessableEntity());
    }

    @Test
    void theRangeMustBePositiveAndNoWiderThanTheConfiguredWindow() throws Exception {
        mockMvc.perform(get(INTERVIEWS).param("from", "2026-12-10").param("to", "2026-12-01")).andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("TRACKER_INVALID"));
        mockMvc.perform(get(INTERVIEWS).param("from", "2024-01-01").param("to", "2026-12-01")).andExpect(status().isUnprocessableEntity()); // tracker.interviews.maxRangeDays = 366
        mockMvc.perform(get(INTERVIEWS).param("from", "garbage")).andExpect(status().isUnprocessableEntity());
    }

    @Test
    void theApplicationDetailAndListShowTheInterviewsAndTheNextStep() throws Exception {
        Instant soon = Instant.now().plus(2, ChronoUnit.DAYS).truncatedTo(ChronoUnit.SECONDS);
        row(app, me, "ONSITE", Instant.now().plus(9, ChronoUnit.DAYS), "PENDING");
        row(app, me, "VIDEO", soon, "PENDING");
        row(app, me, "PHONE", Instant.now().minus(4, ChronoUnit.DAYS), "PASSED");

        mockMvc
            .perform(get(APPS + "/" + app.getId()))
            .andExpect(jsonPath("$.interviews", hasSize(3)))
            .andExpect(jsonPath("$.interviews[0].kind").value("PHONE")) // oldest first
            .andExpect(jsonPath("$.interviewsCount").value(3))
            .andExpect(jsonPath("$.nextStep.label").value("Video interview"))
            .andExpect(jsonPath("$.nextStep.at").value(soon.toString()));
        mockMvc.perform(get(APPS).param("page", "0")).andExpect(jsonPath("$.items[0].interviewsCount").value(3)).andExpect(jsonPath("$.items[0].nextStep.label").value("Video interview"));
    }

    // ---- the calendar file --------------------------------------------------------------------------------

    @Test
    void theIcsIsATextCalendarAttachmentWithTheZoneBlock() throws Exception {
        Interview i = row(app, me, "VIDEO", Instant.parse("2026-10-10T14:00:00Z"), "PENDING");
        i.setLocation("Zoom, link in the invite");
        interviewRepository.saveAndFlush(i);

        mockMvc
            .perform(get(INTERVIEWS + "/" + i.getId() + "/ics"))
            .andExpect(status().isOk())
            .andExpect(content().contentTypeCompatibleWith("text/calendar"))
            .andExpect(header().string("Content-Disposition", "attachment; filename=\"interview-" + i.getId() + ".ics\""))
            .andExpect(content().string(containsString("BEGIN:VCALENDAR\r\n")))
            .andExpect(content().string(containsString("BEGIN:VTIMEZONE\r\nTZID:America/New_York\r\n")))
            .andExpect(content().string(containsString("DTSTART;TZID=America/New_York:20261010T100000\r\n")))
            .andExpect(content().string(containsString("SUMMARY:Interview: Backend Engineer at Acme\r\n")))
            .andExpect(content().string(containsString("LOCATION:Zoom\\, link in the invite\r\n")))
            .andExpect(content().string(containsString("UID:interview-" + i.getId() + "@kiwiply.com\r\n")));
    }

    // ---- tenant isolation ---------------------------------------------------------------------------------

    @Test
    void anotherUsersApplicationAndInterviewsAre404OnEveryRoute() throws Exception {
        Application theirs = application(other, "Theirs", "Engineer");
        Interview theirInterview = row(theirs, other, "VIDEO", Instant.now().plus(3, ChronoUnit.DAYS), "PENDING");
        Interview mine = row(app, me, "VIDEO", Instant.now().plus(3, ChronoUnit.DAYS), "PENDING");
        String body = "{\"kind\":\"VIDEO\",\"startsAt\":\"2026-11-04T15:00:00Z\"}";

        // their application, any interview id
        json(post(url(theirs)), body).andExpect(status().isNotFound());
        json(put(url(theirs) + "/" + theirInterview.getId()), "{\"location\":\"mine now\"}").andExpect(status().isNotFound());
        mockMvc.perform(delete(url(theirs) + "/" + theirInterview.getId())).andExpect(status().isNotFound());
        json(post(url(theirs) + "/" + theirInterview.getId() + "/outcome"), "{\"outcome\":\"PASSED\"}").andExpect(status().isNotFound());
        // my application, their interview id: also not found
        json(put(url(app) + "/" + theirInterview.getId()), "{\"location\":\"mine now\"}").andExpect(status().isNotFound());
        mockMvc.perform(delete(url(app) + "/" + theirInterview.getId())).andExpect(status().isNotFound());
        json(post(url(app) + "/" + theirInterview.getId() + "/outcome"), "{\"outcome\":\"PASSED\"}").andExpect(status().isNotFound());
        // the calendar export, and a mix-up of their interview under my application
        mockMvc.perform(get(INTERVIEWS + "/" + theirInterview.getId() + "/ics")).andExpect(status().isNotFound());
        // the range never lists theirs
        mockMvc.perform(get(INTERVIEWS)).andExpect(jsonPath("$", hasSize(1))).andExpect(jsonPath("$[0].id").value(mine.getId()));

        Interview untouched = interviewRepository.findById(theirInterview.getId()).orElseThrow();
        assertThat(untouched.getLocation()).isNull();
        assertThat(untouched.getOutcome()).isEqualTo("PENDING");
        assertThat(interviewRepository.countByApplicationId(theirs.getId())).isEqualTo(1);
        assertThat(eventRepository.countByApplicationId(theirs.getId())).isZero();
    }

    @Test
    void anUnknownApplicationOrInterviewIsA404() throws Exception {
        json(post(APPS + "/987654321/interviews"), "{\"kind\":\"VIDEO\",\"startsAt\":\"2026-11-04T15:00:00Z\"}").andExpect(status().isNotFound());
        mockMvc.perform(get(INTERVIEWS + "/987654321/ics")).andExpect(status().isNotFound());
        mockMvc.perform(delete(url(app) + "/987654321")).andExpect(status().isNotFound());
    }
}
