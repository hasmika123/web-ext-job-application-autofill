package com.dossier.api.web.rest.ent.mkt;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.ent.mkt.MktActivity;
import com.dossier.api.domain.ent.talent.MarketerAssignment;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.ent.mkt.MktActivityRepository;
import com.dossier.api.repository.ent.talent.MarketerAssignmentRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.ent.EnterpriseDemoSeeder;
import com.dossier.api.service.ent.TalentDemoSeeder;
import com.dossier.api.service.ent.TenantResolver;
import com.dossier.api.service.ent.mkt.activity.MktActivityDemoSeeder;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;

/**
 * The Activities page on the real stack (MySQL, Liquibase, demo seed): Acme's marketer reads a feed made only of her assigned consultants, logging an activity
 * only RECORDS a manual row (never a submission), another tenant and another marketer's consultant are the generic 404, a source-derived line cannot be edited and
 * the manual seed is idempotent. Needs Docker (Testcontainers); NOT run on the machine that wrote it.
 */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
@TestPropertySource(properties = { "dossier.demo.enabled=true", "dossier.demo.enterprise-seed=true", "dossier.demo.create-accounts=false" })
@org.junit.jupiter.api.Timeout(240)
class MktActivityIT {

    private static final String JESSICA = "demo-ent-acme-jessica";
    private static final String BETA_OWNER = "demo-ent-beta-bea";

    @Autowired private EnterpriseDemoSeeder baseSeeder;
    @Autowired private TalentDemoSeeder talentSeeder;
    @Autowired private MktActivityDemoSeeder seeder;
    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper om;
    @Autowired private OrganizationRepository orgs;
    @Autowired private MktActivityRepository activities;
    @Autowired private MarketerAssignmentRepository assignments;
    @Autowired private UserRepository users;
    @Autowired private OrgMemberRepository members;
    @Autowired private ResumeBuilderSettings settings;
    @Autowired private TenantResolver resolver;

    private Organization acme;
    private Organization beta;

    @BeforeEach
    void seed() {
        assertThat(baseSeeder.seed().ran()).isTrue();
        talentSeeder.seed();
        seeder.seed();
        acme = orgs.findBySlug(EnterpriseDemoSeeder.ACME_SLUG).orElseThrow();
        beta = orgs.findBySlug(EnterpriseDemoSeeder.BETA_SLUG).orElseThrow();
    }

    @AfterEach
    void forget() {
        settings.invalidate();
        resolver.invalidate();
    }

    private String path(Organization org) {
        return "/api/orgs/" + org.getId() + "/mkt/activity";
    }

    private JsonNode board(String login, Organization org, String query) throws Exception {
        MvcResult r = mockMvc.perform(get(path(org) + query).with(user(login))).andReturn();
        assertThat(r.getResponse().getStatus()).as(r.getResponse().getContentAsString()).isEqualTo(200);
        return om.readTree(r.getResponse().getContentAsString());
    }

    /** A range of 300 days back and 30 ahead (the service caps a range at 366 days). */
    private static String wide() {
        java.time.LocalDate today = java.time.LocalDate.now(java.time.ZoneOffset.UTC);
        return "?from=" + today.minusDays(300) + "&to=" + today.plusDays(30);
    }

    private Long jessicasMemberId() {
        Long userId = users.findOneByLogin(JESSICA).orElseThrow().getId();
        return members.findByOrgIdAndUserIdAndStatusIn(acme.getId(), userId, List.of(OrgMemberStatus.ACTIVE)).get(0).getId();
    }

    /** Consultants assigned to Jessica (marketer or backup), straight from the assignment rows. */
    private Set<Long> jessicasConsultants() {
        Long memberId = jessicasMemberId();
        Set<Long> ids = new HashSet<>();
        for (MarketerAssignment a : assignments.findByOrgId(acme.getId())) if ("ACTIVE".equals(a.getStatus()) && (memberId.equals(a.getMarketerMemberId()) || memberId.equals(a.getBackupMemberId()))) ids.add(a.getConsultantId());
        return ids;
    }

    @Test
    void theFeedOnlyShowsTheMarketersOwnConsultantsAndTheTilesAddUp() throws Exception {
        JsonNode b = board(JESSICA, acme, wide() + "&size=100");
        assertThat(b.path("canLog").asBoolean()).isTrue();
        assertThat(b.path("kpis")).hasSize(5);
        assertThat(b.path("kpis").get(0).path("key").asText()).isEqualTo("total");
        assertThat(b.path("activities").path("total").asLong()).isEqualTo(b.path("kpis").get(0).path("value").asLong());
        Set<Long> mine = jessicasConsultants();
        assertThat(mine).isNotEmpty();
        Set<Long> seen = new HashSet<>();
        for (JsonNode row : b.path("activities").path("items")) seen.add(row.path("consultant").path("id").asLong());
        assertThat(mine).containsAll(seen);
        assertThat(b.path("activities").path("items").size()).isLessThanOrEqualTo(100);
        assertThat(b.path("summary").path("rows")).hasSizeGreaterThanOrEqualTo(7);
        long summed = 0;
        for (JsonNode s : b.path("summary").path("rows")) summed += s.path("count").asLong();
        assertThat(summed).isEqualTo(b.path("summary").path("total").asLong());
        assertThat(b.path("options").path("consultants").size()).isLessThanOrEqualTo(mine.size());
    }

    @Test
    void theSeededManualRowsAppearAndPlannedOnesAreUpcoming() throws Exception {
        long manual = activities.countByOrgId(acme.getId());
        assertThat(manual).isGreaterThan(0);
        JsonNode b = board(JESSICA, acme, wide() + "&status=SCHEDULED&size=100");
        assertThat(b.path("activities").path("items")).isNotEmpty();
        for (JsonNode row : b.path("activities").path("items")) assertThat(row.path("manual").asBoolean()).isTrue();
        assertThat(b.path("upcomingTotal").asLong()).isGreaterThan(0);
    }

    @Test
    void anotherTenantAndAnotherMarketersConsultantAreTheGenericNotFound() throws Exception {
        assertThat(mockMvc.perform(get(path(beta)).with(user(JESSICA))).andReturn().getResponse().getStatus()).isEqualTo(404);
        assertThat(mockMvc.perform(get(path(acme)).with(user(BETA_OWNER))).andReturn().getResponse().getStatus()).isEqualTo(404);
        Set<Long> mine = jessicasConsultants();
        Long foreign = assignments.findByOrgId(acme.getId()).stream().map(MarketerAssignment::getConsultantId).filter(id -> !mine.contains(id)).findFirst().orElseThrow();
        MvcResult r = mockMvc.perform(post(path(acme)).with(user(JESSICA)).contentType(MediaType.APPLICATION_JSON)
            .content("{\"consultantId\":" + foreign + ",\"type\":\"FOLLOWUP_LOGGED\",\"title\":\"Called\"}")).andReturn();
        assertThat(r.getResponse().getStatus()).isEqualTo(404);
    }

    @Test
    void logActivityRecordsOneManualRowAndNothingIsSubmitted() throws Exception {
        Long consultant = jessicasConsultants().iterator().next();
        long before = activities.countByOrgId(acme.getId());
        MvcResult r = mockMvc.perform(post(path(acme)).with(user(JESSICA)).contentType(MediaType.APPLICATION_JSON)
            .content("{\"consultantId\":" + consultant + ",\"type\":\"FOLLOWUP_LOGGED\",\"title\":\"Called the recruiter\",\"detail\":\"Left a voicemail\",\"tags\":\"Client,Call\"}")).andReturn();
        assertThat(r.getResponse().getStatus()).as(r.getResponse().getContentAsString()).isEqualTo(200);
        JsonNode item = om.readTree(r.getResponse().getContentAsString()).path("item");
        assertThat(item.path("manual").asBoolean()).isTrue();
        assertThat(item.path("status").asText()).isEqualTo("COMPLETED");
        assertThat(activities.countByOrgId(acme.getId())).isEqualTo(before + 1);
        long id = Long.parseLong(item.path("id").asText().substring("MANUAL:".length()));
        MktActivity saved = activities.findByOrgIdAndId(acme.getId(), id).orElseThrow();
        assertThat(saved.getActorMemberId()).isEqualTo(jessicasMemberId());

        // a type that means "sent to the client" cannot be logged, and a sensitive identifier is refused
        MvcResult bad = mockMvc.perform(post(path(acme)).with(user(JESSICA)).contentType(MediaType.APPLICATION_JSON)
            .content("{\"consultantId\":" + consultant + ",\"type\":\"CANDIDATE_SUBMITTED\",\"title\":\"Sent\"}")).andReturn();
        assertThat(bad.getResponse().getStatus()).isEqualTo(422);
        MvcResult pii = mockMvc.perform(post(path(acme)).with(user(JESSICA)).contentType(MediaType.APPLICATION_JSON)
            .content("{\"consultantId\":" + consultant + ",\"type\":\"FOLLOWUP_LOGGED\",\"title\":\"ssn 123-45-6789\"}")).andReturn();
        assertThat(pii.getResponse().getStatus()).isGreaterThanOrEqualTo(400);
        assertThat(activities.countByOrgId(acme.getId())).isEqualTo(before + 1);
    }

    @Test
    void aManualRowChangesStatusButASourceLineCannotBeEdited() throws Exception {
        Set<Long> mine = jessicasConsultants();
        MktActivity row = activities.findBetween(acme.getId(), false, mine, Instant.now().minus(60, ChronoUnit.DAYS), Instant.now().plus(60, ChronoUnit.DAYS), org.springframework.data.domain.PageRequest.of(0, 5)).get(0);
        MvcResult ok = mockMvc.perform(patch(path(acme) + "/" + row.getId() + "/status").with(user(JESSICA)).contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"CANCELLED\"}")).andReturn();
        assertThat(ok.getResponse().getStatus()).isEqualTo(200);
        assertThat(activities.findByOrgIdAndId(acme.getId(), row.getId()).orElseThrow().getStatus()).isEqualTo("CANCELLED");
        MvcResult bad = mockMvc.perform(patch(path(acme) + "/" + row.getId() + "/status").with(user(JESSICA)).contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"ARCHIVED\"}")).andReturn();
        assertThat(bad.getResponse().getStatus()).isEqualTo(422);
        // there is no manual row with this id: the feed's other lines are not addressable here
        MvcResult none = mockMvc.perform(patch(path(acme) + "/999999999/status").with(user(JESSICA)).contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"CANCELLED\"}")).andReturn();
        assertThat(none.getResponse().getStatus()).isEqualTo(404);
    }

    @Test
    void aSecondSeedRunAddsNothingAndBetaOnlyHasItsOwnRows() throws Exception {
        long before = activities.countByOrgId(acme.getId());
        assertThat(seeder.seed()).isEmpty();
        assertThat(activities.countByOrgId(acme.getId())).isEqualTo(before);
        assertThat(activities.countByOrgId(beta.getId())).isGreaterThan(0);
        assertThat(board("demo-ent-beta-priya", beta, "").path("kpis")).hasSize(5);
    }
}
