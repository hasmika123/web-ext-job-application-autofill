package com.dossier.api.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.Application;
import com.dossier.api.domain.User;
import com.dossier.api.domain.enumeration.ApplicationStatus;
import com.dossier.api.repository.ApplicationEventRepository;
import com.dossier.api.repository.ApplicationRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.service.billing.StripeGateway;
import com.dossier.api.service.dto.ApplicationDTO;
import com.dossier.api.service.tracker.TrackerActAs;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.PageRequest;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.annotation.Transactional;

/**
 * U6.15: history at the edges of an account's life. The export carries who changed what as LABELS resolved at export time (a name, "Kiwiply"), never an
 * account id and never an enterprise login; and when the account of a person who changed somebody else's application is erased, that application's
 * history is untouched (no foreign key, no cascade) and reads "a former member" (an organization member) or "a deleted account" (a personal account).
 * Anika is the seeded "user".
 */
@IntegrationTest
@WithMockUser(username = "user")
@Transactional
class TrackerExportActorIT {

    @Autowired private AccountExportService exportService;
    @Autowired private AccountDeletionService deletionService;
    @Autowired private ApplicationSyncService syncService;
    @Autowired private ApplicationPatchService patchService;
    @Autowired private ApplicationRepository applications;
    @Autowired private ApplicationEventRepository events;
    @Autowired private UserRepository users;
    @Autowired private ObjectMapper om;

    /** Stubbed: this test is about OUR cleanup, not Stripe's API. */
    @MockitoBean private StripeGateway stripeGateway;

    private User owner;
    private User marketer;
    private TrackerActAs.Scope scope;
    private Application app;

    private User account(String login, String first, String last) {
        User u = new User();
        u.setLogin(login);
        u.setPassword("x".repeat(60));
        u.setActivated(true);
        u.setEmail(UUID.randomUUID().toString().substring(0, 8) + "@example.test");
        u.setLangKey("en");
        u.setFirstName(first);
        u.setLastName(last);
        return users.saveAndFlush(u);
    }

    @BeforeEach
    void world() {
        owner = users.findOneByLogin("user").orElseThrow();
        String sfx = UUID.randomUUID().toString().substring(0, 8);
        marketer = account("ent#9#sarah-" + sfx, "Sarah", "Chen");
        scope = new TrackerActAs.Scope(9L, marketer.getLogin(), marketer.getId());

        app = new Application();
        app.setUser(owner);
        app.setCompany("Stripe");
        app.setRoleTitle("Senior Backend Engineer");
        app.setStatus(ApplicationStatus.APPLIED);
        app.setCreatedAt(Instant.parse("2026-09-01T10:00:00Z"));
        app.setUpdatedAt(Instant.parse("2026-09-01T10:00:00Z"));
        app.setArchived(false);
        app = applications.saveAndFlush(app);
    }

    private JsonNode export() throws Exception {
        String json = om.writeValueAsString(exportService.exportCurrentUser());
        assertThat(json).as("an enterprise login is never in the export").doesNotContain("ent#");
        return om.readTree(json);
    }

    private JsonNode exportedApp(JsonNode export) {
        for (JsonNode a : export.path("applications")) if (a.path("id").asLong() == app.getId()) return a;
        throw new AssertionError("application not exported");
    }

    private void marketerMovesItToInterview() {
        TrackerActAs.run(owner, scope, () -> patchService.patch(app.getId(), om.createObjectNode().put("status", "INTERVIEW")));
        applications.flush();
    }

    @Test
    void theExportNamesWhoChangedWhatByLabelAndNeverByIdOrEnterpriseLogin() throws Exception {
        marketerMovesItToInterview();

        JsonNode out = export();
        JsonNode head = exportedApp(out);
        assertThat(head.at("/updatedBy/label").asText()).isEqualTo("Sarah Chen");
        assertThat(head.at("/updatedBy/kind").asText()).isEqualTo("PERSON");
        assertThat(head.at("/updatedBy/userId").isNull() || head.at("/updatedBy/userId").isMissingNode()).as("labels only, no account id").isTrue();
        assertThat(head.at("/updatedBy/memberId").isNull() || head.at("/updatedBy/memberId").isMissingNode()).isTrue();

        JsonNode moved = null;
        for (JsonNode e : out.path("applicationEvents")) {
            if (e.path("applicationId").asLong() == app.getId() && "STATUS".equals(e.path("kind").asText())) moved = e;
        }
        assertThat(moved).isNotNull();
        assertThat(moved.path("actor").asText()).isEqualTo("Sarah Chen");
        assertThat(moved.path("actorKind").asText()).isEqualTo("PERSON");
        assertThat(moved.path("onBehalfOf").asText()).as("the owner, by label").isEqualTo(com.dossier.api.service.tracker.ChangeActors.label(owner, null, com.dossier.api.service.tracker.ChangeActors.Context.PERSONAL));
        assertThat(moved.at("/changes/0/f").asText()).isEqualTo("status");
        assertThat(moved.has("actorUserId")).isFalse();
        assertThat(moved.has("actorLogin")).isFalse();
    }

    @Test
    void aNonPersonActorExportsAsKiwiplyWithItsKind() throws Exception {
        ApplicationDTO dto = new ApplicationDTO();
        dto.setCompany("Figma");
        dto.setRoleTitle("Designer");
        dto.setStatus(ApplicationStatus.SAVED);
        dto.setSource("system");
        ApplicationDTO created = syncService.upsertApplication(dto);

        JsonNode out = export();
        JsonNode created0 = null;
        for (JsonNode e : out.path("applicationEvents")) if (e.path("applicationId").asLong() == created.getId()) created0 = e;
        assertThat(created0).isNotNull();
        assertThat(created0.path("actorKind").asText()).isEqualTo("SYSTEM");
        assertThat(created0.path("actor").asText()).isEqualTo("Kiwiply");
        assertThat(created0.path("onBehalfOf").isNull()).isTrue();
    }

    @Test
    void anActorWhoseEnterpriseAccountIsErasedReadsAsAFormerMemberInTheExportAndTheEventsStayIntact() throws Exception {
        marketerMovesItToInterview();
        long before = events.countByApplicationId(app.getId());
        String marketerLogin = marketer.getLogin();

        deletionService.deleteUserAccountByLogin(marketerLogin);
        applications.flush();

        assertThat(users.findOneByLogin(marketerLogin)).isEmpty();
        assertThat(events.countByApplicationId(app.getId())).as("somebody else's history is not touched by an erasure").isEqualTo(before);
        assertThat(applications.findById(app.getId())).isPresent();
        JsonNode out = export();
        assertThat(exportedApp(out).at("/updatedBy/label").asText()).isEqualTo("a former member");
        JsonNode moved = null;
        for (JsonNode e : out.path("applicationEvents")) if (e.path("applicationId").asLong() == app.getId() && "STATUS".equals(e.path("kind").asText())) moved = e;
        assertThat(moved.path("actor").asText()).isEqualTo("a former member");
    }

    @Test
    void aGonePersonalAccountReadsAsADeletedAccount() throws Exception {
        User friend = account("friend-" + UUID.randomUUID().toString().substring(0, 8), "Fay", "Friend");
        TrackerActAs.run(owner, new TrackerActAs.Scope(null, friend.getLogin(), friend.getId()), () -> patchService.patch(app.getId(), om.createObjectNode().put("starred", true)));
        applications.flush();
        assertThat(exportedApp(export()).at("/updatedBy/label").asText()).isEqualTo("Fay Friend");

        deletionService.deleteUserAccountByLogin(friend.getLogin());
        applications.flush();

        assertThat(exportedApp(export()).at("/updatedBy/label").asText()).isEqualTo("a deleted account");
        assertThat(applications.findById(app.getId()).orElseThrow().getUpdatedByUserId()).as("the opaque key stays; the name does not").isEqualTo(friend.getId());
    }
}
