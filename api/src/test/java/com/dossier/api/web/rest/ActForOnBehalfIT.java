package com.dossier.api.web.rest;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.Application;
import com.dossier.api.domain.ApplicationEvent;
import com.dossier.api.domain.User;
import com.dossier.api.domain.enumeration.ApplicationStatus;
import com.dossier.api.repository.ApplicationEventRepository;
import com.dossier.api.repository.ApplicationRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.service.ApplicationPatchService;
import com.dossier.api.service.ApplicationSyncService;
import com.dossier.api.service.dto.ApplicationDTO;
import com.dossier.api.service.tracker.TrackerActAs;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.data.domain.PageRequest;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

/**
 * U6.13: a marketer acting for a consultant (TrackerActAs, which X9.15 opens) is recorded as the actor with the consultant as {@code on_behalf_of};
 * the owner reads "Sarah Chen" and never the enterprise login. Anika is the seeded "user".
 */
@IntegrationTest
@AutoConfigureMockMvc
@WithMockUser(username = "user")
@Transactional
class ActForOnBehalfIT {

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
    private ApplicationPatchService patchService;

    @Autowired
    private ApplicationSyncService syncService;

    private User owner;
    private User marketer;
    private TrackerActAs.Scope scope;

    @BeforeEach
    void actors() {
        owner = users.findOneByLogin("user").orElseThrow();
        String sfx = UUID.randomUUID().toString().substring(0, 8);
        marketer = new User();
        marketer.setLogin("ent#9#sarah-" + sfx);
        marketer.setPassword("x".repeat(60));
        marketer.setActivated(true);
        marketer.setEmail("sarah." + sfx + "@example.test");
        marketer.setLangKey("en");
        marketer.setFirstName("Sarah");
        marketer.setLastName("Chen");
        marketer = users.saveAndFlush(marketer);
        scope = new TrackerActAs.Scope(9L, marketer.getLogin(), marketer.getId());
    }

    private Application mine() {
        Application a = new Application();
        a.setUser(owner);
        a.setCompany("Stripe");
        a.setRoleTitle("Senior Backend Engineer");
        a.setStatus(ApplicationStatus.APPLIED);
        a.setCreatedAt(Instant.parse("2026-09-01T10:00:00Z"));
        a.setUpdatedAt(Instant.parse("2026-09-01T10:00:00Z"));
        a.setArchived(false);
        return applications.saveAndFlush(a);
    }

    private JsonNode detail(long id) throws Exception {
        String body = mockMvc.perform(get("/api/profile/applications/" + id)).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertThat(body).as("no enterprise login in any response body").doesNotContain("ent#");
        return om.readTree(body);
    }

    @Test
    void aMarketersStatusChangeIsTheirsAsActorAndTheOwnersAsOnBehalfOf() throws Exception {
        Application a = mine();

        TrackerActAs.run(owner, scope, () -> patchService.patch(a.getId(), om.createObjectNode().put("status", "INTERVIEW")));

        ApplicationEvent e = events.findByApplicationIdOrderByCreatedAtDescIdDesc(a.getId(), PageRequest.of(0, 5)).get(0);
        assertThat(e.getActorKind()).isEqualTo("PERSON");
        assertThat(e.getActorUserId()).isEqualTo(marketer.getId());
        assertThat(e.getActorLogin()).as("stored as the audit key, never shown").startsWith("ent#");
        assertThat(e.getOnBehalfOfUserId()).isEqualTo(owner.getId());

        Application stored = applications.findById(a.getId()).orElseThrow();
        assertThat(stored.getUser().getId()).as("the application stays the consultant's").isEqualTo(owner.getId());
        assertThat(stored.getUpdatedByUserId()).isEqualTo(marketer.getId());

        JsonNode d = detail(a.getId());
        assertThat(d.at("/updatedBy/label").asText()).isEqualTo("Sarah Chen");
        assertThat(d.at("/updatedBy/userId").isNull() || d.at("/updatedBy/userId").isMissingNode()).as("an enterprise account id is not shown").isTrue();
        assertThat(d.at("/events/0/actor/label").asText()).isEqualTo("Sarah Chen");
        assertThat(d.at("/events/0/actorKind").asText()).isEqualTo("PERSON");
        assertThat(d.at("/events/0/onBehalfOf/userId").asLong()).isEqualTo(owner.getId());
        assertThat(d.at("/events/0/changes/0/f").asText()).isEqualTo("status");
    }

    @Test
    void aSaveForTheConsultantIsCreatedByTheMarketerAndOwnedByTheConsultant() throws Exception {
        ApplicationDTO dto = new ApplicationDTO();
        dto.setCompany("Figma");
        dto.setRoleTitle("Designer");
        dto.setStatus(ApplicationStatus.SAVED);
        dto.setSource("org");

        ApplicationDTO created = TrackerActAs.run(owner, scope, () -> syncService.upsertApplication(dto));

        Application stored = applications.findById(created.getId()).orElseThrow();
        assertThat(stored.getUser().getId()).isEqualTo(owner.getId());
        assertThat(stored.getCreatedByUserId()).isEqualTo(marketer.getId());
        assertThat(stored.getUpdatedByUserId()).isEqualTo(marketer.getId());
        ApplicationEvent e = events.findByApplicationIdOrderByCreatedAtDescIdDesc(created.getId(), PageRequest.of(0, 5)).get(0);
        assertThat(e.getKind()).isEqualTo(ApplicationEvent.CREATED);
        assertThat(e.getActorUserId()).isEqualTo(marketer.getId());
        assertThat(e.getOnBehalfOfUserId()).isEqualTo(owner.getId());

        JsonNode d = detail(created.getId());
        assertThat(d.at("/createdBy/label").asText()).isEqualTo("Sarah Chen");
    }

    @Test
    void theMarketersOwnTrackerGetsNoRow() throws Exception {
        Application a = mine();
        TrackerActAs.run(owner, scope, () -> patchService.patch(a.getId(), om.createObjectNode().put("starred", true)));
        assertThat(applications.findByUserIsCurrentUser()).extracting(Application::getId).contains(a.getId());
        assertThat(applications.findAll().stream().filter(x -> x.getUser() != null && x.getUser().getId().equals(marketer.getId())).toList()).isEmpty();
    }

    @Test
    void theWindowIsClosedEvenWhenTheWriteFails() {
        Application a = mine();
        assertThatThrownBy(() -> TrackerActAs.run(owner, scope, () -> patchService.patch(a.getId(), om.createObjectNode().put("status", "NOT_A_STATUS")))).isInstanceOf(RuntimeException.class);

        assertThat(TrackerActAs.current()).isEmpty();
        assertThat(SecurityContextHolder.getContext().getAuthentication().getName()).isEqualTo("user");
        assertThat(events.findByApplicationIdOrderByCreatedAtDescIdDesc(a.getId(), PageRequest.of(0, 5))).isEmpty();
    }

    @Test
    void aMarketerWhoseAccountIsGoneReadsAsAFormerMemberAndKeepsTheRow() throws Exception {
        Application a = mine();
        TrackerActAs.run(owner, scope, () -> patchService.patch(a.getId(), om.createObjectNode().put("starred", true)));
        applications.flush();
        users.delete(marketer);
        users.flush();

        JsonNode d = detail(a.getId());
        assertThat(d.at("/updatedBy/label").asText()).isEqualTo("a former member");
        assertThat(d.at("/events/0/actor/label").asText()).isEqualTo("a former member");
        List<ApplicationEvent> evs = events.findByApplicationIdOrderByCreatedAtDescIdDesc(a.getId(), PageRequest.of(0, 5));
        assertThat(evs).hasSize(1);
    }
}
