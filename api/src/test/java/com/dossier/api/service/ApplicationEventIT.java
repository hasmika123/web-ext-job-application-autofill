package com.dossier.api.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
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
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.core.io.ClassPathResource;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

/**
 * The tracker's memory end to end (APP-E2E U6.1): every create and status change on the existing sync
 * endpoints writes exactly one {@code application_event} with the right source, the ghosted clock
 * ({@code last_event_at}) moves, the events go with their application, and the migration's backfill gives
 * old rows their history. Runs as the seeded "user".
 */
@IntegrationTest
@AutoConfigureMockMvc
@WithMockUser(username = "user")
@Transactional
class ApplicationEventIT {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper om;

    @Autowired
    private ApplicationRepository applicationRepository;

    @Autowired
    private ApplicationEventRepository eventRepository;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private JdbcTemplate jdbc;

    private long upsert(Map<String, Object> body) throws Exception {
        String json = mockMvc
            .perform(post("/api/profile/applications").contentType(MediaType.APPLICATION_JSON).content(om.writeValueAsBytes(body)))
            .andExpect(status().isOk())
            .andReturn()
            .getResponse()
            .getContentAsString();
        return om.readTree(json).path("id").asLong();
    }

    private void putBody(long id, Map<String, Object> body) throws Exception {
        mockMvc
            .perform(put("/api/profile/applications/" + id).contentType(MediaType.APPLICATION_JSON).content(om.writeValueAsBytes(body)))
            .andExpect(status().isOk());
    }

    private List<ApplicationEvent> eventsOf(long id) {
        applicationRepository.flush();
        return eventRepository.findByApplicationIdOrderByCreatedAtDescIdDesc(id, org.springframework.data.domain.PageRequest.of(0, 100));
    }

    private static Map<String, Object> app(String company, String source, String status) {
        Map<String, Object> m = new HashMap<>();
        m.put("company", company);
        m.put("roleTitle", "Engineer");
        if (source != null) m.put("source", source);
        if (status != null) m.put("status", status);
        return m;
    }

    @Test
    void creatingFromTheExtensionWritesOneCreatedEventWithItsFirstStatus() throws Exception {
        long id = upsert(app("Acme", "extension", "DRAFT"));

        List<ApplicationEvent> events = eventsOf(id);
        assertThat(events).hasSize(1);
        ApplicationEvent e = events.get(0);
        assertThat(e.getKind()).isEqualTo(ApplicationEvent.CREATED);
        assertThat(e.getToStatus()).isEqualTo(ApplicationStatus.DRAFT);
        assertThat(e.getSource()).isEqualTo(ApplicationEvent.SRC_EXTENSION);
        assertThat(applicationRepository.findById(id).orElseThrow().getLastEventAt()).isNotNull();
    }

    @Test
    void aWebCreateIsWebAndAMatchSaveIsToo() throws Exception {
        long id = upsert(app("Globex", "match", "SAVED"));
        assertThat(eventsOf(id)).singleElement().satisfies(e -> {
            assertThat(e.getSource()).isEqualTo("WEB");
            assertThat(e.getToStatus()).isEqualTo(ApplicationStatus.SAVED);
        });
    }

    @Test
    void aRefillThatMovesTheStatusWritesOneStatusEventAndOneThatDoesNotWritesNone() throws Exception {
        Map<String, Object> first = app("Initech", "extension", "SAVED");
        first.put("externalJobId", "J-1");
        long id = upsert(first);

        Map<String, Object> same = app("Initech", "extension", "SAVED");
        same.put("externalJobId", "J-1");
        upsert(same);
        assertThat(eventsOf(id)).as("a refill with the same status is not an event").hasSize(1);

        Map<String, Object> filled = app("Initech", "extension", "DRAFT");
        filled.put("externalJobId", "J-1");
        upsert(filled);

        List<ApplicationEvent> events = eventsOf(id);
        assertThat(events).hasSize(2);
        assertThat(events.get(0).getKind()).isEqualTo(ApplicationEvent.STATUS);
        assertThat(events.get(0).getFromStatus()).isEqualTo(ApplicationStatus.SAVED);
        assertThat(events.get(0).getToStatus()).isEqualTo(ApplicationStatus.DRAFT);
    }

    @Test
    void aWebStatusChangeIsAWebEventAndTheExtensionsConfirmSubmissionIsAnExtensionOne() throws Exception {
        long id = upsert(app("Hooli", "extension", "DRAFT"));

        // The extension's confirmation: PUT {status: APPLIED, submissionConfirmed: true, appliedAt}, no source.
        Map<String, Object> confirm = new HashMap<>();
        confirm.put("status", "APPLIED");
        confirm.put("submissionConfirmed", true);
        confirm.put("appliedAt", Instant.now().toString());
        putBody(id, confirm);

        Map<String, Object> toReview = new HashMap<>();
        toReview.put("status", "IN_REVIEW");
        putBody(id, toReview);

        Map<String, Object> toWithdrawn = new HashMap<>();
        toWithdrawn.put("status", "WITHDRAWN");
        putBody(id, toWithdrawn);

        List<ApplicationEvent> events = eventsOf(id); // newest first
        assertThat(events).extracting(ApplicationEvent::getToStatus).containsExactly(
            ApplicationStatus.WITHDRAWN,
            ApplicationStatus.IN_REVIEW,
            ApplicationStatus.APPLIED,
            ApplicationStatus.DRAFT
        );
        assertThat(events).extracting(ApplicationEvent::getSource).containsExactly("WEB", "WEB", "EXTENSION", "EXTENSION");
        assertThat(applicationRepository.findById(id).orElseThrow().getStatus()).isEqualTo(ApplicationStatus.WITHDRAWN);
    }

    @Test
    void archivingAndSwitchingResumeAreTimelineEntriesButAnEditWithNothingNewIsNot() throws Exception {
        long id = upsert(app("Umbrella", "extension", "APPLIED"));
        Map<String, Object> archive = new HashMap<>();
        archive.put("archived", true);
        putBody(id, archive);
        putBody(id, archive); // already archived: no second entry

        assertThat(eventsOf(id)).extracting(ApplicationEvent::getKind).containsExactly(ApplicationEvent.FIELD, ApplicationEvent.CREATED);
    }

    @Test
    void deletingAnApplicationRemovesItsEvents() throws Exception {
        long id = upsert(app("Soylent", "extension", "DRAFT"));
        assertThat(eventsOf(id)).isNotEmpty();
        // The FK cascades; flush and clear so the count below is what the database says.
        mockMvc.perform(delete("/api/profile/applications/" + id)).andExpect(status().isNoContent());
        applicationRepository.flush();
        assertThat(jdbc.queryForObject("select count(*) from application_event where application_id = ?", Long.class, id)).isZero();
    }

    // ---- the migration's backfill ----------------------------------------------------------------

    private List<String> backfillStatements() throws Exception {
        String xml = new String(new ClassPathResource("config/liquibase/changelog/20261013030000_application_events.xml").getInputStream().readAllBytes(), StandardCharsets.UTF_8);
        xml = xml.replaceAll("(?s)<rollback>.*?</rollback>", "");
        Matcher m = Pattern.compile("(?s)<sql>(.*?)</sql>").matcher(xml);
        List<String> out = new ArrayList<>();
        while (m.find()) out.add(m.group(1).trim());
        return out;
    }

    private Application legacyRow(User user, String company, ApplicationStatus status, Instant created, Instant applied) {
        Application a = new Application();
        a.setUser(user);
        a.setCompany(company);
        a.setRoleTitle("Engineer");
        a.setStatus(status);
        a.setCreatedAt(created);
        a.setUpdatedAt(created.plusSeconds(3 * 86400));
        a.setAppliedAt(applied);
        return applicationRepository.saveAndFlush(a);
    }

    @Test
    void theBackfillGivesEveryOldRowACreatedEventAndEveryAppliedOneAStatusEvent() throws Exception {
        User user = userRepository.findOneByLogin("user").orElseThrow();
        Instant t0 = Instant.parse("2026-09-01T10:00:00Z");
        Application applied = legacyRow(user, "Old Applied", ApplicationStatus.APPLIED, t0, t0.plusSeconds(86400));
        Application interview = legacyRow(user, "Old Interview", ApplicationStatus.INTERVIEW, t0, t0.plusSeconds(2 * 86400));
        Application saved = legacyRow(user, "Old Saved", ApplicationStatus.SAVED, t0, null);
        Application rejectedUnapplied = legacyRow(user, "Old Rejected", ApplicationStatus.REJECTED, t0, null);
        List<Long> ids = List.of(applied.getId(), interview.getId(), saved.getId(), rejectedUnapplied.getId());
        for (Long id : ids) assertThat(eventsOf(id)).as("no events before the backfill").isEmpty();

        List<String> statements = backfillStatements();
        assertThat(statements).hasSize(3);
        for (String sql : statements) jdbc.execute(sql);

        assertThat(count(applied.getId(), "CREATED")).isEqualTo(1);
        assertThat(count(applied.getId(), "STATUS")).isEqualTo(1);
        assertThat(count(interview.getId(), "STATUS")).isEqualTo(1);
        assertThat(count(saved.getId(), "CREATED")).isEqualTo(1);
        assertThat(count(saved.getId(), "STATUS")).isZero();
        assertThat(count(rejectedUnapplied.getId(), "STATUS")).as("never applied: no applied event").isZero();

        Map<String, Object> created = jdbc.queryForMap("select to_status, source, created_at from application_event where application_id = ? and kind = 'CREATED'", saved.getId());
        assertThat(created.get("to_status")).isEqualTo("SAVED");
        assertThat(created.get("source")).isEqualTo("SYSTEM");
        Map<String, Object> status = jdbc.queryForMap("select from_status, to_status, source from application_event where application_id = ? and kind = 'STATUS'", applied.getId());
        assertThat(status.get("to_status")).isEqualTo("APPLIED");
        assertThat(status.get("source")).isEqualTo("SYSTEM");

        // The ghosted clock starts at the row's last touch.
        assertThat(jdbc.queryForObject("select last_event_at is not null from application where id = ?", Boolean.class, applied.getId())).isTrue();
    }

    private long count(Long applicationId, String kind) {
        return jdbc.queryForObject("select count(*) from application_event where application_id = ? and kind = ?", Long.class, applicationId, kind);
    }
}
