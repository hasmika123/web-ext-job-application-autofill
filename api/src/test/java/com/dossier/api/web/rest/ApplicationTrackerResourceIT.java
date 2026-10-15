package com.dossier.api.web.rest;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.containsInAnyOrder;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.Application;
import com.dossier.api.domain.ApplicationEvent;
import com.dossier.api.domain.User;
import com.dossier.api.domain.enumeration.ApplicationStatus;
import com.dossier.api.repository.ApplicationEventRepository;
import com.dossier.api.repository.ApplicationNoteRepository;
import com.dossier.api.repository.ApplicationRepository;
import com.dossier.api.repository.UserRepository;
import com.fasterxml.jackson.databind.JsonNode;
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
import org.springframework.transaction.annotation.Transactional;

/**
 * The applications list v2, detail, patch, bulk, notes and the activity feed (APP-E2E U6.2), end to end
 * over MockMvc as the seeded "user". Another user's rows ("admin" here) must never show up, change or
 * even confirm they exist: 404, never 403.
 */
@IntegrationTest
@AutoConfigureMockMvc
@WithMockUser(username = "user")
@Transactional
class ApplicationTrackerResourceIT {

    private static final String BASE = "/api/profile/applications";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper om;

    @Autowired
    private ApplicationRepository applicationRepository;

    @Autowired
    private ApplicationEventRepository eventRepository;

    @Autowired
    private ApplicationNoteRepository noteRepository;

    @Autowired
    private UserRepository userRepository;

    private User me;
    private User other;

    @BeforeEach
    void users() {
        me = userRepository.findOneByLogin("user").orElseThrow();
        other = userRepository.findOneByLogin("admin").orElseThrow();
    }

    private Application make(User owner, String company, String role, ApplicationStatus status) {
        Application a = new Application();
        a.setUser(owner);
        a.setCompany(company);
        a.setRoleTitle(role);
        a.setStatus(status);
        a.setLocation("Remote");
        a.setCreatedAt(Instant.now().minus(30, ChronoUnit.DAYS));
        a.setUpdatedAt(Instant.now());
        a.setArchived(false);
        return applicationRepository.saveAndFlush(a);
    }

    private Application make(String company, ApplicationStatus status) {
        return make(me, company, "Engineer", status);
    }

    private ResultActions json(org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder b, String body) throws Exception {
        return mockMvc.perform(b.contentType(MediaType.APPLICATION_JSON).content(body));
    }

    // ---- the old contract ---------------------------------------------------------------------------

    @Test
    void withoutQueryParametersTheListIsTheOldPlainArrayNewestUpdateFirst() throws Exception {
        Application a = make("Acme", ApplicationStatus.APPLIED);
        Application b = make("Beta", ApplicationStatus.APPLIED);
        Application c = make("Core", ApplicationStatus.APPLIED);
        a.setUpdatedAt(Instant.now().minus(3, ChronoUnit.DAYS));
        b.setUpdatedAt(Instant.now().minus(1, ChronoUnit.DAYS));
        c.setUpdatedAt(Instant.now().minus(2, ChronoUnit.DAYS));
        applicationRepository.saveAllAndFlush(List.of(a, b, c));
        make(other, "Theirs", "Engineer", ApplicationStatus.APPLIED);

        mockMvc
            .perform(get(BASE))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$", hasSize(3)))
            .andExpect(jsonPath("$[*].company", contains("Beta", "Core", "Acme")))
            // the legacy payload carries no derived tracker fields
            .andExpect(jsonPath("$[0].ghosted").doesNotExist())
            .andExpect(jsonPath("$[0].nextStep").doesNotExist());
    }

    // ---- paging ---------------------------------------------------------------------------------------

    @Test
    void pagedListHasTheSharedShape() throws Exception {
        for (int i = 0; i < 25; i++) make("Co" + String.format("%02d", i), ApplicationStatus.APPLIED);

        mockMvc
            .perform(get(BASE).param("page", "0").param("size", "10"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.items", hasSize(10)))
            .andExpect(jsonPath("$.total").value(25))
            .andExpect(jsonPath("$.page").value(0))
            .andExpect(jsonPath("$.size").value(10))
            .andExpect(jsonPath("$.summary.ALL").value(25))
            .andExpect(jsonPath("$.items[0].ghosted").value(false))
            .andExpect(jsonPath("$.items[0].notesCount").value(0))
            .andExpect(jsonPath("$.items[0].interviewsCount").value(0))
            .andExpect(jsonPath("$.items[0].mailCount").value(0));
        mockMvc.perform(get(BASE).param("page", "2").param("size", "10")).andExpect(jsonPath("$.items", hasSize(5)));
        mockMvc.perform(get(BASE).param("page", "3").param("size", "10")).andExpect(jsonPath("$.items", hasSize(0))).andExpect(jsonPath("$.total").value(25));
    }

    @Test
    void sizeComesFromSettingsAndIsClamped() throws Exception {
        make("Acme", ApplicationStatus.APPLIED);
        mockMvc.perform(get(BASE).param("page", "0")).andExpect(jsonPath("$.size").value(20)); // tracker.list.defaultSize
        mockMvc.perform(get(BASE).param("page", "0").param("size", "500")).andExpect(jsonPath("$.size").value(50)); // tracker.list.maxSize
        mockMvc.perform(get(BASE).param("page", "-4").param("size", "0")).andExpect(jsonPath("$.page").value(0)).andExpect(jsonPath("$.size").value(20));
    }

    // ---- filters and the summary ------------------------------------------------------------------

    private void seedMix() {
        make("Acme", ApplicationStatus.APPLIED);
        make("Beta", ApplicationStatus.APPLIED);
        make("Cora", ApplicationStatus.APPLIED);
        make("Delta", ApplicationStatus.INTERVIEW);
        make("Echo", ApplicationStatus.INTERVIEW);
        make("Foxtrot", ApplicationStatus.SAVED);
        Application archived = make("Golf", ApplicationStatus.APPLIED);
        archived.setArchived(true);
        applicationRepository.saveAndFlush(archived);
        make(other, "Hotel", "Engineer", ApplicationStatus.APPLIED);
    }

    @Test
    void statusFilterNarrowsTheItemsButNotTheTabCounts() throws Exception {
        seedMix();
        mockMvc
            .perform(get(BASE).param("page", "0").param("status", "APPLIED"))
            .andExpect(jsonPath("$.items", hasSize(3)))
            .andExpect(jsonPath("$.total").value(3))
            .andExpect(jsonPath("$.summary.ALL").value(6))
            .andExpect(jsonPath("$.summary.APPLIED").value(3))
            .andExpect(jsonPath("$.summary.INTERVIEW").value(2))
            .andExpect(jsonPath("$.summary.SAVED").value(1))
            .andExpect(jsonPath("$.summary.OFFER").value(0))
            .andExpect(jsonPath("$.summary.ARCHIVED").value(1))
            .andExpect(jsonPath("$.summary.GHOSTED").value(0));
        mockMvc.perform(get(BASE).param("page", "0").param("status", "applied,interview")).andExpect(jsonPath("$.total").value(5));
        mockMvc
            .perform(get(BASE).param("page", "0").param("status", "NOPE"))
            .andExpect(status().isUnprocessableEntity())
            .andExpect(jsonPath("$.code").value("TRACKER_INVALID"));
    }

    @Test
    void archivedDefaultsToHiddenAndCanBeAskedFor() throws Exception {
        seedMix();
        mockMvc.perform(get(BASE).param("page", "0").param("archived", "true")).andExpect(jsonPath("$.items", hasSize(1))).andExpect(jsonPath("$.items[0].company").value("Golf"));
        mockMvc.perform(get(BASE).param("page", "0").param("archived", "all")).andExpect(jsonPath("$.total").value(7));
        mockMvc.perform(get(BASE).param("page", "0").param("archived", "maybe")).andExpect(status().isUnprocessableEntity());
    }

    @Test
    void searchAndCompanyFiltersApplyToItemsAndCounts() throws Exception {
        make("Acme Robotics", ApplicationStatus.APPLIED);
        make(me, "Beta", "Robotics Engineer", ApplicationStatus.INTERVIEW);
        make("Cora", ApplicationStatus.APPLIED);

        mockMvc
            .perform(get(BASE).param("page", "0").param("q", "ROBOT"))
            .andExpect(jsonPath("$.total").value(2))
            .andExpect(jsonPath("$.summary.ALL").value(2))
            .andExpect(jsonPath("$.summary.APPLIED").value(1))
            .andExpect(jsonPath("$.summary.INTERVIEW").value(1));
        mockMvc.perform(get(BASE).param("page", "0").param("company", "cora")).andExpect(jsonPath("$.total").value(1)).andExpect(jsonPath("$.items[0].company").value("Cora"));
        // % and _ are plain characters, not wildcards
        mockMvc.perform(get(BASE).param("page", "0").param("q", "%")).andExpect(jsonPath("$.total").value(0));
    }

    // ---- sorting --------------------------------------------------------------------------------------

    @Test
    void sortIsWhitelisted() throws Exception {
        make("Bravo", ApplicationStatus.APPLIED);
        make("Alpha", ApplicationStatus.APPLIED);
        make("Charlie", ApplicationStatus.APPLIED);

        mockMvc.perform(get(BASE).param("page", "0").param("sort", "company,asc")).andExpect(jsonPath("$.items[*].company", contains("Alpha", "Bravo", "Charlie")));
        mockMvc.perform(get(BASE).param("page", "0").param("sort", "company,desc")).andExpect(jsonPath("$.items[*].company", contains("Charlie", "Bravo", "Alpha")));
        mockMvc
            .perform(get(BASE).param("page", "0").param("sort", "password,desc"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("SORT_INVALID"))
            .andExpect(jsonPath("$.allowed", hasSize(8)));
        mockMvc.perform(get(BASE).param("page", "0").param("sort", "company,sideways")).andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("SORT_INVALID"));
    }

    // ---- ghosted ----------------------------------------------------------------------------------------

    @Test
    void ghostedIsDerivedFromTheLastEventAndCountedInTheSummary() throws Exception {
        Application quiet = make("Quiet", ApplicationStatus.APPLIED);
        quiet.setLastEventAt(Instant.now().minus(40, ChronoUnit.DAYS));
        Application recent = make("Recent", ApplicationStatus.APPLIED);
        recent.setLastEventAt(Instant.now().minus(5, ChronoUnit.DAYS));
        Application interviewing = make("Interviewing", ApplicationStatus.INTERVIEW);
        interviewing.setLastEventAt(Instant.now().minus(90, ChronoUnit.DAYS));
        applicationRepository.saveAllAndFlush(List.of(quiet, recent, interviewing));

        mockMvc
            .perform(get(BASE).param("page", "0").param("sort", "company,asc"))
            .andExpect(jsonPath("$.summary.GHOSTED").value(1))
            .andExpect(jsonPath("$.items[?(@.company=='Quiet')].ghosted").value(true))
            .andExpect(jsonPath("$.items[?(@.company=='Recent')].ghosted").value(false))
            .andExpect(jsonPath("$.items[?(@.company=='Interviewing')].ghosted").value(false));
        mockMvc.perform(get(BASE).param("page", "0").param("ghosted", "true")).andExpect(jsonPath("$.total").value(1)).andExpect(jsonPath("$.items[0].company").value("Quiet"));
    }

    // ---- tenant isolation -----------------------------------------------------------------------------

    @Test
    void anotherUsersApplicationIsA404ForEveryVerbAndNeverInTheList() throws Exception {
        Application mine = make("Mine", ApplicationStatus.APPLIED);
        Application theirs = make(other, "Theirs", "Engineer", ApplicationStatus.APPLIED);
        long id = theirs.getId();

        mockMvc.perform(get(BASE).param("page", "0")).andExpect(jsonPath("$.total").value(1)).andExpect(jsonPath("$.summary.ALL").value(1));
        mockMvc.perform(get(BASE + "/" + id)).andExpect(status().isNotFound());
        json(patch(BASE + "/" + id), "{\"status\":\"OFFER\"}").andExpect(status().isNotFound());
        json(post(BASE + "/" + id + "/notes"), "{\"body\":\"hello\"}").andExpect(status().isNotFound());
        json(put(BASE + "/" + id + "/notes/1"), "{\"body\":\"hello\"}").andExpect(status().isNotFound());
        mockMvc.perform(delete(BASE + "/" + id + "/notes/1")).andExpect(status().isNotFound());
        json(post(BASE + "/bulk"), "{\"ids\":[" + mine.getId() + "," + id + "],\"action\":\"ARCHIVE\"}")
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.done", contains(mine.getId().intValue())))
            .andExpect(jsonPath("$.failed[0].id").value(id))
            .andExpect(jsonPath("$.failed[0].reason").value("NOT_FOUND"));

        Application stillTheirs = applicationRepository.findById(id).orElseThrow();
        assertThat(stillTheirs.getStatus()).isEqualTo(ApplicationStatus.APPLIED);
        assertThat(stillTheirs.getArchived()).isFalse();
        assertThat(eventRepository.countByApplicationId(id)).isZero();
    }

    @Test
    void aNoteOnAnotherUsersApplicationCannotBeReadEditedOrDeletedEvenWithItsId() throws Exception {
        Application mine = make("Mine", ApplicationStatus.APPLIED);
        Application theirs = make(other, "Theirs", "Engineer", ApplicationStatus.APPLIED);
        json(post(BASE + "/" + theirs.getId() + "/notes"), "{\"body\":\"x\"}").andExpect(status().isNotFound());
        assertThat(noteRepository.countByApplicationId(theirs.getId())).as("nothing was created").isZero();

        // A note that really exists on their application, made directly, is unreachable through my application's route.
        com.dossier.api.domain.ApplicationNote n = new com.dossier.api.domain.ApplicationNote();
        n.setApplicationId(theirs.getId());
        n.setBody("theirs");
        long theirNote = noteRepository.saveAndFlush(n).getId();
        json(put(BASE + "/" + mine.getId() + "/notes/" + theirNote), "{\"body\":\"mine now\"}").andExpect(status().isNotFound());
        mockMvc.perform(delete(BASE + "/" + mine.getId() + "/notes/" + theirNote)).andExpect(status().isNotFound());
        assertThat(noteRepository.findById(theirNote).orElseThrow().getBody()).isEqualTo("theirs");
    }

    // ---- detail -----------------------------------------------------------------------------------------

    @Test
    void theDetailCarriesTheTimelineNotesInterviewsAndCounts() throws Exception {
        Application a = make("Acme", ApplicationStatus.APPLIED);
        json(patch(BASE + "/" + a.getId()), "{\"status\":\"IN_REVIEW\"}").andExpect(status().isOk());
        json(post(BASE + "/" + a.getId() + "/notes"), "{\"body\":\"Recruiter is Sam\",\"pinned\":true}").andExpect(status().isCreated());

        mockMvc
            .perform(get(BASE + "/" + a.getId()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.id").value(a.getId()))
            .andExpect(jsonPath("$.company").value("Acme"))
            .andExpect(jsonPath("$.status").value("IN_REVIEW"))
            .andExpect(jsonPath("$.events[0].kind").value("NOTE")) // newest first
            .andExpect(jsonPath("$.events[1].kind").value("STATUS"))
            .andExpect(jsonPath("$.events[1].toStatus").value("IN_REVIEW"))
            .andExpect(jsonPath("$.events[1].source").value("WEB"))
            .andExpect(jsonPath("$.notes", hasSize(1)))
            .andExpect(jsonPath("$.notes[0].pinned").value(true))
            .andExpect(jsonPath("$.interviews", hasSize(0)))
            .andExpect(jsonPath("$.suggestions", hasSize(0)))
            .andExpect(jsonPath("$.notesCount").value(1))
            .andExpect(jsonPath("$.mailCount").value(0))
            .andExpect(jsonPath("$.ghosted").value(false));
    }

    // ---- patch ------------------------------------------------------------------------------------------

    @Test
    void patchChangesOnlyWhatIsSentAndWritesTheTimeline() throws Exception {
        Application a = make("Acme", ApplicationStatus.SAVED);
        String url = BASE + "/" + a.getId();

        json(patch(url), "{\"status\":\"APPLIED\"}")
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.status").value("APPLIED"))
            .andExpect(jsonPath("$.appliedAt").exists())
            .andExpect(jsonPath("$.submissionConfirmed").value(true))
            .andExpect(jsonPath("$.company").value("Acme"));

        json(patch(url), "{\"nextAction\":\"  Follow up with Sam  \",\"nextActionAt\":\"2026-11-03T15:00:00Z\",\"starred\":true}")
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.nextAction").value("Follow up with Sam"))
            .andExpect(jsonPath("$.nextStep.label").value("Follow up with Sam"))
            .andExpect(jsonPath("$.starred").value(true))
            .andExpect(jsonPath("$.status").value("APPLIED"));

        json(patch(url), "{\"nextAction\":null,\"nextActionAt\":null,\"archived\":true}")
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.nextAction").doesNotExist())
            .andExpect(jsonPath("$.nextStep").doesNotExist())
            .andExpect(jsonPath("$.archived").value(true));

        List<ApplicationEvent> events = eventRepository.findByApplicationIdOrderByCreatedAtDescIdDesc(a.getId(), PageRequest.of(0, 20));
        // One event per request (change audit): the third PATCH cleared the next step AND archived, so it is one row whose changes list both.
        assertThat(events).extracting(ApplicationEvent::getSummary).containsExactly("Next step cleared", "Next step: Follow up with Sam", "Moved to Applied");
        assertThat(events.get(0).getChanges()).contains("{\"f\":\"nextAction\"}").contains("{\"f\":\"nextActionAt\"").contains("{\"f\":\"archived\",\"from\":\"false\",\"to\":\"true\"}");
        assertThat(events.get(1).getChanges()).contains("{\"f\":\"starred\",\"from\":\"false\",\"to\":\"true\"}");
        assertThat(events).extracting(ApplicationEvent::getSource).containsOnly("WEB");
        assertThat(applicationRepository.findById(a.getId()).orElseThrow().getLastEventAt()).isNotNull();
    }

    @Test
    void anOfferCanBeAcceptedDeclinedOrReopened() throws Exception {
        Application a = make("Acme", ApplicationStatus.OFFER);
        String url = BASE + "/" + a.getId();
        json(patch(url), "{\"outcome\":\"ACCEPTED\"}").andExpect(jsonPath("$.outcome").value("ACCEPTED")).andExpect(jsonPath("$.acceptedAt").exists()).andExpect(jsonPath("$.nextStep.label").value("Review offer"));
        json(patch(url), "{\"outcome\":\"declined\"}").andExpect(jsonPath("$.outcome").value("DECLINED")).andExpect(jsonPath("$.acceptedAt").doesNotExist());
        json(patch(url), "{\"outcome\":null}").andExpect(jsonPath("$.outcome").doesNotExist());
        json(patch(url), "{\"outcome\":\"MAYBE\"}").andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("TRACKER_INVALID"));
    }

    @Test
    void patchRefusesBadValuesAndNeverCollectedText() throws Exception {
        Application a = make("Acme", ApplicationStatus.APPLIED);
        String url = BASE + "/" + a.getId();
        json(patch(url), "{\"status\":\"GHOSTED\"}").andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("TRACKER_INVALID")).andExpect(jsonPath("$.path").value("status"));
        json(patch(url), "{\"status\":null}").andExpect(status().isUnprocessableEntity());
        json(patch(url), "{\"starred\":\"yes\"}").andExpect(status().isUnprocessableEntity());
        json(patch(url), "{\"nextActionAt\":\"tomorrow\"}").andExpect(status().isUnprocessableEntity());
        json(patch(url), "{\"nextAction\":\"" + "x".repeat(161) + "\"}").andExpect(status().isUnprocessableEntity());
        json(patch(url), "{\"nextAction\":\"Send SSN 123-45-6789 to HR\"}")
            .andExpect(status().isUnprocessableEntity())
            .andExpect(jsonPath("$.code").value("SENSITIVE_CONTENT"))
            .andExpect(jsonPath("$.class").value("SSN_ITIN"));
        json(patch(url), "{\"resumeId\":999999999}").andExpect(status().isNotFound());
        assertThat(applicationRepository.findById(a.getId()).orElseThrow().getNextAction()).isNull();
    }

    // ---- bulk -------------------------------------------------------------------------------------------

    @Test
    void bulkReportsPerIdResultsAndWritesEvents() throws Exception {
        Application a = make("Acme", ApplicationStatus.APPLIED);
        Application b = make("Beta", ApplicationStatus.APPLIED);

        json(post(BASE + "/bulk"), "{\"ids\":[" + a.getId() + "," + b.getId() + ",987654321],\"action\":\"STATUS\",\"status\":\"WITHDRAWN\"}")
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.done", containsInAnyOrder(a.getId().intValue(), b.getId().intValue())))
            .andExpect(jsonPath("$.failed", hasSize(1)))
            .andExpect(jsonPath("$.failed[0].reason").value("NOT_FOUND"));
        assertThat(applicationRepository.findById(a.getId()).orElseThrow().getStatus()).isEqualTo(ApplicationStatus.WITHDRAWN);
        assertThat(eventRepository.countByApplicationIdAndKind(a.getId(), ApplicationEvent.STATUS)).isEqualTo(1);

        json(post(BASE + "/bulk"), "{\"ids\":[" + a.getId() + "],\"action\":\"STAR\"}").andExpect(jsonPath("$.done", hasSize(1)));
        assertThat(applicationRepository.findById(a.getId()).orElseThrow().getStarred()).isTrue();
        json(post(BASE + "/bulk"), "{\"ids\":[" + a.getId() + "],\"action\":\"ARCHIVE\"}").andExpect(jsonPath("$.done", hasSize(1)));
        json(post(BASE + "/bulk"), "{\"ids\":[" + a.getId() + "],\"action\":\"UNARCHIVE\"}").andExpect(jsonPath("$.done", hasSize(1)));
        assertThat(applicationRepository.findById(a.getId()).orElseThrow().getArchived()).isFalse();
    }

    @Test
    void bulkRefusesAnEmptyOversizedOrUnknownRequest() throws Exception {
        json(post(BASE + "/bulk"), "{\"ids\":[],\"action\":\"ARCHIVE\"}").andExpect(status().isUnprocessableEntity());
        json(post(BASE + "/bulk"), "{\"ids\":[1],\"action\":\"EXPLODE\"}").andExpect(status().isUnprocessableEntity());
        json(post(BASE + "/bulk"), "{\"ids\":[1],\"action\":\"STATUS\"}").andExpect(status().isUnprocessableEntity());
        StringBuilder ids = new StringBuilder();
        for (int i = 1; i <= 51; i++) ids.append(i).append(i < 51 ? "," : "");
        json(post(BASE + "/bulk"), "{\"ids\":[" + ids + "],\"action\":\"ARCHIVE\"}")
            .andExpect(status().isUnprocessableEntity())
            .andExpect(jsonPath("$.code").value("TRACKER_LIMIT"))
            .andExpect(jsonPath("$.limit").value(50)); // tracker.bulk.maxIds
    }

    // ---- notes ------------------------------------------------------------------------------------------

    @Test
    void notesAreCreatedEditedPinnedAndDeleted() throws Exception {
        Application a = make("Acme", ApplicationStatus.APPLIED);
        String base = BASE + "/" + a.getId() + "/notes";

        JsonNode created = om.readTree(
            json(post(base), "{\"body\":\"Ask about the team\"}")
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.pinned").value(false))
                .andExpect(jsonPath("$.applicationId").value(a.getId()))
                .andReturn()
                .getResponse()
                .getContentAsString()
        );
        long nid = created.path("id").asLong();
        assertThat(eventRepository.countByApplicationIdAndKind(a.getId(), ApplicationEvent.NOTE)).isEqualTo(1);

        json(put(base + "/" + nid), "{\"pinned\":true}").andExpect(status().isOk()).andExpect(jsonPath("$.pinned").value(true)).andExpect(jsonPath("$.body").value("Ask about the team"));
        json(put(base + "/" + nid), "{\"body\":\"Ask about the team and the budget\"}").andExpect(jsonPath("$.body").value("Ask about the team and the budget")).andExpect(jsonPath("$.pinned").value(true));
        assertThat(eventRepository.countByApplicationIdAndKind(a.getId(), ApplicationEvent.NOTE)).as("a pin and a body edit are history rows now (change audit): added, pinned, edited").isEqualTo(3);

        mockMvc.perform(delete(base + "/" + nid)).andExpect(status().isNoContent());
        mockMvc.perform(delete(base + "/" + nid)).andExpect(status().isNotFound());
        assertThat(noteRepository.countByApplicationId(a.getId())).isZero();
    }

    @Test
    void aNoteNeverHoldsANeverCollectedValueOrExceedItsCap() throws Exception {
        Application a = make("Acme", ApplicationStatus.APPLIED);
        String base = BASE + "/" + a.getId() + "/notes";
        json(post(base), "{\"body\":\"my social is 123-45-6789\"}")
            .andExpect(status().isUnprocessableEntity())
            .andExpect(jsonPath("$.code").value("SENSITIVE_CONTENT"))
            .andExpect(jsonPath("$.path").value("body"));
        json(post(base), "{\"body\":\"   \"}").andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("TRACKER_INVALID"));
        json(post(base), "{\"body\":\"" + "x".repeat(4001) + "\"}").andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("TRACKER_INVALID")); // tracker.note.maxChars

        // editing into a sensitive value is refused too
        long nid = om.readTree(json(post(base), "{\"body\":\"fine\"}").andReturn().getResponse().getContentAsString()).path("id").asLong();
        json(put(base + "/" + nid), "{\"body\":\"DOB: 1990-05-12\"}").andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("SENSITIVE_CONTENT"));
        assertThat(noteRepository.findById(nid).orElseThrow().getBody()).isEqualTo("fine");
        assertThat(noteRepository.countByApplicationId(a.getId())).isEqualTo(1);
    }

    // ---- activity ---------------------------------------------------------------------------------------

    @Test
    void activityIsOneRowPerDayWithQuietDaysAsZero() throws Exception {
        Application a = make("Acme", ApplicationStatus.SAVED);
        json(patch(BASE + "/" + a.getId()), "{\"status\":\"APPLIED\"}").andExpect(status().isOk());
        json(post(BASE + "/" + a.getId() + "/notes"), "{\"body\":\"hi\"}").andExpect(status().isCreated());

        mockMvc.perform(get(BASE + "/activity")).andExpect(status().isOk()).andExpect(jsonPath("$", hasSize(30))); // tracker.activity.defaultDays
        JsonNode week = om.readTree(mockMvc.perform(get(BASE + "/activity").param("days", "7")).andReturn().getResponse().getContentAsString());
        assertThat(week).hasSize(7);
        assertThat(week.get(6).path("day").asText()).matches("\\d{4}-\\d{2}-\\d{2}");
        assertThat(week.get(6).path("count").asInt()).as("today: a status change and a note").isEqualTo(2);
        assertThat(week.get(0).path("count").asInt()).isZero();
        mockMvc.perform(get(BASE + "/activity").param("days", "9999")).andExpect(jsonPath("$", hasSize(90))); // tracker.activity.maxDays
        mockMvc.perform(get(BASE + "/activity").param("tz", "Nowhere/Land")).andExpect(status().isUnprocessableEntity());
    }

    @Test
    void activityNeverCountsAnotherUsersEvents() throws Exception {
        Application theirs = make(other, "Theirs", "Engineer", ApplicationStatus.APPLIED);
        ApplicationEvent e = new ApplicationEvent();
        e.setApplicationId(theirs.getId());
        e.setKind(ApplicationEvent.CREATED);
        e.setSource(ApplicationEvent.SRC_WEB);
        eventRepository.saveAndFlush(e);

        JsonNode days = om.readTree(mockMvc.perform(get(BASE + "/activity").param("days", "7")).andReturn().getResponse().getContentAsString());
        int total = 0;
        for (JsonNode d : days) total += d.path("count").asInt();
        assertThat(total).isZero();
    }
}
