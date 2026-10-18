package com.dossier.api.web.rest;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.Application;
import com.dossier.api.domain.ApplicationEvent;
import com.dossier.api.domain.User;
import com.dossier.api.domain.enumeration.ApplicationStatus;
import com.dossier.api.repository.ApplicationEventRepository;
import com.dossier.api.repository.ApplicationRepository;
import com.dossier.api.repository.UserRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

/**
 * U6.13: every owner write on the tracker names its actor and what changed (docs/change-audit/README.md sections 2.3 and 2.4), and no write path
 * leaves {@code updated_at} newer than the newest history row. Runs as the seeded "user" over MockMvc.
 */
@IntegrationTest
@AutoConfigureMockMvc
@WithMockUser(username = "user")
@Transactional
class TrackerAttributionIT {

    private static final String BASE = "/api/profile/applications";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper om;

    @Autowired
    private ApplicationRepository applications;

    @Autowired
    private ApplicationEventRepository events;

    @Autowired
    private UserRepository users;

    private User me;

    @BeforeEach
    void user() {
        me = users.findOneByLogin("user").orElseThrow();
    }

    private Application make(ApplicationStatus status) {
        Application a = new Application();
        a.setUser(me);
        a.setCompany("Acme");
        a.setRoleTitle("Engineer");
        a.setStatus(status);
        a.setCreatedAt(Instant.parse("2026-09-01T10:00:00Z"));
        a.setUpdatedAt(Instant.parse("2026-09-01T10:00:00Z"));
        a.setArchived(false);
        return applications.saveAndFlush(a);
    }

    private List<ApplicationEvent> newestFirst(long id) {
        applications.flush();
        return events.findByApplicationIdOrderByCreatedAtDescIdDesc(id, PageRequest.of(0, 50));
    }

    private JsonNode send(org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder b, String body) throws Exception {
        String json = mockMvc.perform(b.contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().is2xxSuccessful()).andReturn().getResponse().getContentAsString();
        return json.isBlank() ? null : om.readTree(json);
    }

    private JsonNode detail(long id) throws Exception {
        return om.readTree(mockMvc.perform(get(BASE + "/" + id)).andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
    }

    @Test
    void aPatchOfStatusNextStepAndStarWritesOneStatusEventNamingTheOwner() throws Exception {
        Application a = make(ApplicationStatus.APPLIED);

        send(patch(BASE + "/" + a.getId()), "{\"status\":\"INTERVIEW\",\"nextAction\":\"Follow up with Sarah\",\"starred\":true}");

        List<ApplicationEvent> evs = newestFirst(a.getId());
        assertThat(evs).hasSize(1);
        ApplicationEvent e = evs.get(0);
        assertThat(e.getKind()).isEqualTo(ApplicationEvent.STATUS);
        assertThat(e.getActorKind()).isEqualTo("PERSON");
        assertThat(e.getActorUserId()).isEqualTo(me.getId());
        assertThat(e.getActorLogin()).isEqualTo("user");
        assertThat(e.getOnBehalfOfUserId()).isNull();
        assertThat(e.getSource()).isEqualTo("WEB");
        assertThat(e.getChanges()).contains("{\"f\":\"status\",\"from\":\"APPLIED\",\"to\":\"INTERVIEW\"}").contains("{\"f\":\"nextAction\"}").contains("{\"f\":\"starred\",\"from\":\"false\",\"to\":\"true\"}");
        assertThat(e.getChanges()).as("free text never enters the history").doesNotContain("Follow up with Sarah");

        Application after = applications.findById(a.getId()).orElseThrow();
        assertThat(after.getUpdatedByUserId()).isEqualTo(me.getId());
        assertThat(after.getUpdatedAt()).isAfter(Instant.parse("2026-09-01T10:00:00Z"));

        JsonNode d = detail(a.getId());
        assertThat(d.at("/updatedBy/userId").asLong()).isEqualTo(me.getId());
        assertThat(d.at("/updatedBy/kind").asText()).isEqualTo("PERSON");
        assertThat(d.at("/events/0/actor/userId").asLong()).isEqualTo(me.getId());
        assertThat(d.at("/events/0/actorKind").asText()).isEqualTo("PERSON");
        assertThat(d.at("/events/0/changes").size()).isEqualTo(3);
    }

    @Test
    void aStarToggleIsNoLongerSilent() throws Exception {
        Application a = make(ApplicationStatus.APPLIED);
        send(patch(BASE + "/" + a.getId()), "{\"starred\":true}");
        send(patch(BASE + "/" + a.getId()), "{\"starred\":false}");

        List<ApplicationEvent> evs = newestFirst(a.getId());
        assertThat(evs).extracting(ApplicationEvent::getSummary).containsExactly("Unstarred", "Starred");
        assertThat(evs).extracting(ApplicationEvent::getKind).containsOnly(ApplicationEvent.FIELD);
    }

    @Test
    void aPatchThatChangesNothingWritesNothingAndLeavesUpdatedAtAlone() throws Exception {
        Application a = make(ApplicationStatus.APPLIED);
        send(patch(BASE + "/" + a.getId()), "{\"status\":\"APPLIED\",\"starred\":false,\"archived\":false}");

        assertThat(newestFirst(a.getId())).isEmpty();
        assertThat(applications.findById(a.getId()).orElseThrow().getUpdatedAt()).isEqualTo(Instant.parse("2026-09-01T10:00:00Z"));
    }

    @Test
    void aNextStepDateIsRecordedWithItsIsoValue() throws Exception {
        Application a = make(ApplicationStatus.APPLIED);
        send(patch(BASE + "/" + a.getId()), "{\"nextActionAt\":\"2026-10-17T09:00:00Z\"}");

        ApplicationEvent e = newestFirst(a.getId()).get(0);
        assertThat(e.getSummary()).isEqualTo("Next step date set");
        assertThat(e.getChanges()).isEqualTo("[{\"f\":\"nextActionAt\",\"to\":\"2026-10-17T09:00:00Z\"}]");
    }

    @Test
    void noteAddEditPinAndDeleteEachProduceAHistoryRowAndStampTheNote() throws Exception {
        Application a = make(ApplicationStatus.APPLIED);

        JsonNode note = send(post(BASE + "/" + a.getId() + "/notes"), "{\"body\":\"Called the recruiter\"}");
        long nid = note.get("id").asLong();
        send(put(BASE + "/" + a.getId() + "/notes/" + nid), "{\"body\":\"Called the recruiter, she will email Monday\"}");
        send(put(BASE + "/" + a.getId() + "/notes/" + nid), "{\"pinned\":true}");
        mockMvc.perform(delete(BASE + "/" + a.getId() + "/notes/" + nid)).andExpect(status().isNoContent());

        List<ApplicationEvent> evs = newestFirst(a.getId());
        assertThat(evs).extracting(ApplicationEvent::getSummary).containsExactly("Note deleted", "Note pinned", "Note edited", "Note added");
        assertThat(evs).extracting(ApplicationEvent::getActorUserId).containsOnly(me.getId());
        assertThat(evs.get(1).getChanges()).isEqualTo("[{\"f\":\"pinned\",\"from\":\"false\",\"to\":\"true\"}]");
        assertThat(evs.get(2).getChanges()).isEqualTo("[{\"f\":\"body\"}]");
        assertThat(evs.get(2).getChanges()).doesNotContain("recruiter");
    }

    @Test
    void aNoteEditStampsTheNoteItself() throws Exception {
        Application a = make(ApplicationStatus.APPLIED);
        JsonNode note = send(post(BASE + "/" + a.getId() + "/notes"), "{\"body\":\"first\"}");
        send(put(BASE + "/" + a.getId() + "/notes/" + note.get("id").asLong()), "{\"body\":\"second\"}");

        Long updatedBy = jdbcLong("select updated_by_user_id from application_note where id = " + note.get("id").asLong());
        Long createdBy = jdbcLong("select created_by_user_id from application_note where id = " + note.get("id").asLong());
        assertThat(updatedBy).isEqualTo(me.getId());
        assertThat(createdBy).isEqualTo(me.getId());
    }

    @Test
    void anAutosaveBurstOfNoteEditsSharesOneHistoryRow() throws Exception {
        Application a = make(ApplicationStatus.APPLIED);
        JsonNode note = send(post(BASE + "/" + a.getId() + "/notes"), "{\"body\":\"v1\"}");
        long nid = note.get("id").asLong();
        for (int i = 2; i <= 6; i++) send(put(BASE + "/" + a.getId() + "/notes/" + nid), "{\"body\":\"v" + i + "\"}");

        assertThat(newestFirst(a.getId())).extracting(ApplicationEvent::getSummary).containsExactly("Note edited", "Note added");
    }

    @Test
    void interviewScheduleRescheduleEditOutcomeAndRemoveAreAllAttributed() throws Exception {
        Application a = make(ApplicationStatus.APPLIED);
        String start = "2026-10-20T14:00:00Z";
        JsonNode iv = send(post(BASE + "/" + a.getId() + "/interviews"), "{\"kind\":\"VIDEO\",\"startsAt\":\"" + start + "\"}");
        long iid = iv.get("id").asLong();
        send(put(BASE + "/" + a.getId() + "/interviews/" + iid), "{\"startsAt\":\"2026-10-21T14:00:00Z\"}");
        send(put(BASE + "/" + a.getId() + "/interviews/" + iid), "{\"location\":\"Zoom\",\"kind\":\"PANEL\"}");
        send(post(BASE + "/" + a.getId() + "/interviews/" + iid + "/outcome"), "{\"outcome\":\"PASSED\"}");

        List<ApplicationEvent> evs = newestFirst(a.getId());
        assertThat(evs).hasSize(4);
        assertThat(evs).extracting(ApplicationEvent::getKind).containsOnly(ApplicationEvent.INTERVIEW);
        assertThat(evs).extracting(ApplicationEvent::getActorUserId).containsOnly(me.getId());
        assertThat(evs.get(0).getChanges()).isEqualTo("[{\"f\":\"outcome\",\"from\":\"PENDING\",\"to\":\"PASSED\"}]");
        assertThat(evs.get(1).getSummary()).startsWith("Interview updated:");
        assertThat(evs.get(1).getChanges()).contains("{\"f\":\"kind\",\"from\":\"VIDEO\",\"to\":\"PANEL\"}").contains("{\"f\":\"location\"}").doesNotContain("Zoom");
        assertThat(evs.get(2).getSummary()).startsWith("Interview rescheduled:");
        assertThat(evs.get(2).getChanges()).contains("\"from\":\"2026-10-20T14:00:00Z\"");
        assertThat(jdbcLong("select updated_by_user_id from interview where id = " + iid)).isEqualTo(me.getId());

        mockMvc.perform(delete(BASE + "/" + a.getId() + "/interviews/" + iid)).andExpect(status().isNoContent());
        assertThat(newestFirst(a.getId()).get(0).getSummary()).startsWith("Interview removed:");
    }

    @Test
    void aBoardPutThatChangesEmailAndSalaryRecordsTheNamesNotTheValues() throws Exception {
        Application a = make(ApplicationStatus.APPLIED);
        send(put(BASE + "/" + a.getId()), "{\"email\":\"me@example.com\",\"salary\":\"$180k\",\"jobMode\":\"REMOTE\"}");

        ApplicationEvent e = newestFirst(a.getId()).get(0);
        assertThat(e.getKind()).isEqualTo(ApplicationEvent.FIELD);
        assertThat(e.getSummary()).isEqualTo("Details updated");
        assertThat(e.getChanges()).contains("{\"f\":\"email\"}").contains("{\"f\":\"salary\"}").contains("\"f\":\"jobMode\"").doesNotContain("me@example.com").doesNotContain("180k");
        assertThat(e.getActorKind()).isEqualTo("PERSON");
    }

    @Test
    void noWritePathLeavesUpdatedAtNewerThanTheNewestEvent() throws Exception {
        Application a = make(ApplicationStatus.APPLIED);
        send(patch(BASE + "/" + a.getId()), "{\"starred\":true}");
        send(put(BASE + "/" + a.getId()), "{\"location\":\"Berlin\"}");
        send(post(BASE + "/" + a.getId() + "/notes"), "{\"body\":\"n\"}");

        Application after = applications.findById(a.getId()).orElseThrow();
        ApplicationEvent newest = newestFirst(a.getId()).get(0);
        assertThat(after.getUpdatedAt()).isEqualTo(newest.getCreatedAt());
    }

    @Autowired
    private org.springframework.jdbc.core.JdbcTemplate jdbc;

    private Long jdbcLong(String sql) {
        applications.flush();
        return jdbc.queryForObject(sql, Long.class);
    }
}
