package com.dossier.api.web.rest;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.Application;
import com.dossier.api.domain.ApplicationEvent;
import com.dossier.api.domain.Interview;
import com.dossier.api.domain.User;
import com.dossier.api.domain.enumeration.ApplicationStatus;
import com.dossier.api.repository.ApplicationEventRepository;
import com.dossier.api.repository.ApplicationRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.service.ApplicationEventService;
import com.dossier.api.service.InterviewService;
import com.dossier.api.service.TrackerDataService;
import com.dossier.api.service.dto.TrackerDTOs.InterviewDTO;
import com.dossier.api.service.inbox.InboxParser;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.util.List;
import java.util.Map;
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
 * U6.13 (README section 2.3): the writers that are not a person say so. Submit-detect is the extension itself, an explicit extension save is the
 * person, a mail move and an inbox-created interview are MAIL with no person behind them, and the demo seed is SYSTEM / the owner.
 */
@IntegrationTest
@AutoConfigureMockMvc
@WithMockUser(username = "user")
@Transactional
class SystemSourceAttributionIT {

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

    @Autowired
    private ApplicationEventService eventService;

    @Autowired
    private InterviewService interviewService;

    @Autowired
    private TrackerDataService trackerData;

    private User me;

    @BeforeEach
    void user() {
        me = users.findOneByLogin("user").orElseThrow();
    }

    private Application extensionApp(ApplicationStatus status) throws Exception {
        String json = mockMvc
            .perform(post("/api/profile/applications").contentType(MediaType.APPLICATION_JSON).content(om.writeValueAsBytes(Map.of("company", "Acme", "roleTitle", "Engineer", "source", "extension", "status", status.name()))))
            .andExpect(status().isOk())
            .andReturn()
            .getResponse()
            .getContentAsString();
        return applications.findById(om.readTree(json).path("id").asLong()).orElseThrow();
    }

    private ApplicationEvent newest(long id) {
        applications.flush();
        return events.findByApplicationIdOrderByCreatedAtDescIdDesc(id, PageRequest.of(0, 20)).get(0);
    }

    @Test
    void theExtensionsCreateIsThePerson_viaTheExtension() throws Exception {
        Application a = extensionApp(ApplicationStatus.DRAFT);
        ApplicationEvent e = newest(a.getId());
        assertThat(e.getKind()).isEqualTo(ApplicationEvent.CREATED);
        assertThat(e.getSource()).isEqualTo("EXTENSION");
        assertThat(e.getActorKind()).isEqualTo("PERSON");
        assertThat(e.getActorUserId()).isEqualTo(me.getId());
        assertThat(applications.findById(a.getId()).orElseThrow().getCreatedByUserId()).isEqualTo(me.getId());
    }

    @Test
    void submitDetectIsTheExtensionItselfWithNoPersonBehindIt() throws Exception {
        Application a = extensionApp(ApplicationStatus.DRAFT);
        mockMvc
            .perform(put("/api/profile/applications/" + a.getId()).contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"APPLIED\",\"submissionConfirmed\":true,\"appliedAt\":\"2026-10-15T09:00:00Z\"}"))
            .andExpect(status().isOk());

        ApplicationEvent e = newest(a.getId());
        assertThat(e.getKind()).isEqualTo(ApplicationEvent.STATUS);
        assertThat(e.getSource()).isEqualTo("EXTENSION");
        assertThat(e.getActorKind()).isEqualTo("EXTENSION");
        assertThat(e.getActorUserId()).isNull();
        assertThat(e.getActorLogin()).isNull();
        Application after = applications.findById(a.getId()).orElseThrow();
        assertThat(after.getUpdatedByUserId()).as("the head names no person").isNull();
    }

    @Test
    void anExplicitExtensionSaveWithoutSubmissionConfirmedIsThePerson() throws Exception {
        Application a = extensionApp(ApplicationStatus.DRAFT);
        mockMvc
            .perform(put("/api/profile/applications/" + a.getId()).contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"APPLIED\",\"source\":\"extension\"}"))
            .andExpect(status().isOk());

        ApplicationEvent e = newest(a.getId());
        assertThat(e.getSource()).isEqualTo("EXTENSION");
        assertThat(e.getActorKind()).isEqualTo("PERSON");
        assertThat(e.getActorUserId()).isEqualTo(me.getId());
    }

    @Test
    void aMailMoveIsMailWithNoPerson() throws Exception {
        Application a = extensionApp(ApplicationStatus.APPLIED);
        eventService.onStatusChanged(new InboxParser.StatusChanged(me.getId(), a.getId(), "Acme", "Engineer", ApplicationStatus.APPLIED, ApplicationStatus.INTERVIEW, 77L, Instant.now()));

        ApplicationEvent e = newest(a.getId());
        assertThat(e.getSource()).isEqualTo("INBOX");
        assertThat(e.getActorKind()).isEqualTo("MAIL");
        assertThat(e.getActorUserId()).isNull();
        assertThat(e.getRefId()).isEqualTo(77L);
        assertThat(e.getChanges()).isEqualTo("[{\"f\":\"status\",\"from\":\"APPLIED\",\"to\":\"INTERVIEW\"}]");
        assertThat(applications.findById(a.getId()).orElseThrow().getUpdatedByUserId()).isNull();
    }

    @Test
    void anInboxCreatedInterviewRecordsTheInboxAsItsSourceAndMailAsItsActor() throws Exception {
        Application a = extensionApp(ApplicationStatus.APPLIED);
        InterviewDTO iv = interviewService.createFor(me, a.getId(), om.createObjectNode().put("kind", "PHONE").put("startsAt", "2026-10-22T15:00:00Z"), Interview.SRC_INBOX);

        assertThat(iv.source()).isEqualTo("INBOX");
        ApplicationEvent e = newest(a.getId());
        assertThat(e.getKind()).isEqualTo(ApplicationEvent.INTERVIEW);
        assertThat(e.getSource()).isEqualTo("INBOX");
        assertThat(e.getActorKind()).isEqualTo("MAIL");
        assertThat(e.getActorUserId()).isNull();
    }

    @Test
    void anAssistantCreatedInterviewIsTheAssistant() throws Exception {
        Application a = extensionApp(ApplicationStatus.APPLIED);
        interviewService.createFor(me, a.getId(), om.createObjectNode().put("kind", "VIDEO").put("startsAt", "2026-10-22T15:00:00Z"), Interview.SRC_ASSISTANT);
        ApplicationEvent e = newest(a.getId());
        assertThat(e.getSource()).isEqualTo("ASSISTANT");
        assertThat(e.getActorKind()).isEqualTo("ASSISTANT");
    }

    @Test
    void theDemoSeedIsSystemForTheSystemRowsAndTheOwnerForTheirOwnAction() throws Exception {
        Application a = new Application();
        a.setUser(me);
        a.setCompany("Demo Co");
        a.setRoleTitle("Engineer");
        a.setStatus(ApplicationStatus.INTERVIEW);
        a.setCreatedAt(Instant.parse("2026-09-01T10:00:00Z"));
        a.setUpdatedAt(Instant.parse("2026-09-10T10:00:00Z"));
        a = applications.saveAndFlush(a);

        trackerData.seedDemoHistory(a, Instant.parse("2026-09-01T10:00:00Z"), Instant.parse("2026-09-03T10:00:00Z"), Instant.parse("2026-09-10T10:00:00Z"));
        applications.flush();

        List<ApplicationEvent> evs = events.findByApplicationIdOrderByCreatedAtDescIdDesc(a.getId(), PageRequest.of(0, 20));
        assertThat(evs).extracting(ApplicationEvent::getActorKind).containsExactly("MAIL", "PERSON", "SYSTEM");
        assertThat(evs.get(1).getActorUserId()).isEqualTo(me.getId());
        assertThat(applications.findById(a.getId()).orElseThrow().getCreatedByUserId()).as("the seed names the owner on the head").isEqualTo(me.getId());
    }
}
