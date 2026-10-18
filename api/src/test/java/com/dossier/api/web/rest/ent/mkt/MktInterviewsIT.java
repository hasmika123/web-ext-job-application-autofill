package com.dossier.api.web.rest.ent.mkt;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.ent.mkt.MktInterviewMeta;
import com.dossier.api.domain.ent.talent.ClientAccount;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.ent.talent.TalentInterview;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.ent.mkt.MktInterviewEventRepository;
import com.dossier.api.repository.ent.mkt.MktInterviewMetaRepository;
import com.dossier.api.repository.ent.mkt.MktInterviewPrepItemRepository;
import com.dossier.api.repository.ent.talent.ClientAccountRepository;
import com.dossier.api.repository.ent.talent.ConsultantProfileRepository;
import com.dossier.api.repository.ent.talent.TalentInterviewRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.ent.mkt.MktScope;
import com.dossier.api.service.ent.mkt.interviews.MktInterviewsDto;
import com.dossier.api.service.ent.mkt.interviews.MktInterviewsService;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import com.dossier.api.web.rest.org.OrgFixtures;
import java.time.Duration;
import java.time.Instant;
import java.util.Set;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;

/**
 * The Interviews page on the real stack (Testcontainers MySQL, real Liquibase schema, real repositories and JPQL): the migration and the
 * entity mapping, the page's reads and writes on real rows, the composite tenant FK, and the cross-tenant 404 through the real
 * {@code /api/orgs/{orgId}/mkt/interviews} routes. Needs Docker, so it is written to compile with the rest of the suite but was NOT
 * executed on the machine it was written on. {@link MktScope} is mocked only to give the caller an ASSIGNED view of one consultant (its own
 * rules are covered by {@code MktScope}'s tests); everything below it is real.
 */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
class MktInterviewsIT {

    @Autowired private MockMvc mockMvc;
    @Autowired private UserRepository users;
    @Autowired private OrganizationRepository orgs;
    @Autowired private OrgMemberRepository members;
    @Autowired private ConsultantProfileRepository consultants;
    @Autowired private ClientAccountRepository clients;
    @Autowired private TalentInterviewRepository talentInterviews;
    @Autowired private MktInterviewMetaRepository metas;
    @Autowired private MktInterviewEventRepository events;
    @Autowired private MktInterviewPrepItemRepository prep;
    @Autowired private MktInterviewsService service;
    @MockBean private MktScope scope;

    private Organization a;
    private Organization b;
    private OrgMember marketerA;
    private ConsultantProfile alexA;
    private ConsultantProfile zedA;
    private TalentInterview alexInterview;
    private TalentInterview zedInterview;
    private OrgMembership me;

    @BeforeEach
    void seed() {
        OrgFixtures fx = new OrgFixtures(users, orgs, members);
        String n = String.valueOf(System.nanoTime());
        a = fx.org("mkt-iv-a-" + n, OrgStatus.ACTIVE);
        b = fx.org("mkt-iv-b-" + n, OrgStatus.ACTIVE);
        marketerA = fx.active(a, "mkt-iv-a-marketer", OrgRole.MARKETER);
        fx.active(b, "mkt-iv-b-marketer", OrgRole.MARKETER);
        me = new OrgMembership(a.getId(), marketerA.getId(), marketerA.getUserId(), "mkt-iv-a-marketer", OrgRole.MARKETER, OrgMemberStatus.ACTIVE, OrgStatus.ACTIVE);

        alexA = consultant(a, "Alex Morgan");
        zedA = consultant(a, "Zed Other");
        ClientAccount techCorp = new ClientAccount();
        techCorp.setOrgId(a.getId());
        techCorp.setName("TechCorp");
        techCorp = clients.saveAndFlush(techCorp);
        alexInterview = interview(alexA, techCorp, Instant.now().plus(Duration.ofDays(1)));
        zedInterview = interview(zedA, techCorp, Instant.now().plus(Duration.ofDays(2)));

        when(scope.resolve(any(), eq("interviews.coordinate"))).thenReturn(new MktScope.View(a.getId(), marketerA.getId(), false, Set.of(alexA.getId())));
        doAnswer(inv -> {
            MktScope.View v = inv.getArgument(0);
            if (!v.sees(inv.getArgument(1))) throw new OrgNotFoundException();
            return null;
        }).when(scope).require(any(), anyLong());
    }

    private ConsultantProfile consultant(Organization org, String name) {
        ConsultantProfile c = new ConsultantProfile();
        c.setOrgId(org.getId());
        c.setDisplayName(name);
        c.setEmail(name.toLowerCase().replace(' ', '.') + "@example.com");
        return consultants.saveAndFlush(c);
    }

    private TalentInterview interview(ConsultantProfile c, ClientAccount client, Instant at) {
        TalentInterview i = new TalentInterview();
        i.setOrgId(c.getOrgId());
        i.setConsultantId(c.getId());
        i.setClientId(client.getId());
        i.setScheduledAt(at);
        i.setRoundLabel("1st Round");
        return talentInterviews.saveAndFlush(i);
    }

    @Test
    void theBoardReadsRealRowsAndOnlyTheAssignedConsultants() {
        MktInterviewMeta m = new MktInterviewMeta();
        m.setOrgId(a.getId());
        m.setInterviewId(alexInterview.getId());
        m.setInterviewType("TECHNICAL");
        m.setRecruiterName("Priya Sharma");
        m.setCoordinationStatus("CONFIRMED");
        metas.save(m);

        MktInterviewsDto.Overview o = service.overview(me, new MktInterviewsDto.Query(null, null, null, null, null, null, null, 0, 25, 0));
        assertThat(o.upcoming()).extracting(MktInterviewsDto.Row::id).containsExactly(alexInterview.getId()); // never Zed's
        MktInterviewsDto.Row r = o.upcoming().get(0);
        assertThat(r.consultant()).isEqualTo("Alex Morgan");
        assertThat(r.client()).isEqualTo("TechCorp");
        assertThat(r.type()).isEqualTo("TECHNICAL");
        assertThat(r.status()).isEqualTo("CONFIRMED");
        assertThat(o.checklist().items()).hasSize(7);
        assertThat(prep.countByOrgIdAndInterviewId(a.getId(), alexInterview.getId())).isEqualTo(7);
        assertThat(o.clients()).extracting(MktInterviewsDto.ClientOption::name).containsExactly("TechCorp");
    }

    @Test
    void writesPersistAsProposalsAndAnotherConsultantsInterviewIs404() {
        MktInterviewsDto.Row row = service.proposeReschedule(me, alexInterview.getId(), new MktInterviewsDto.RescheduleRequest(Instant.now().plus(Duration.ofDays(4)), "Client asked"));
        assertThat(row.status()).isEqualTo("RESCHEDULED");
        MktInterviewMeta m = metas.findByOrgIdAndInterviewId(a.getId(), alexInterview.getId()).orElseThrow();
        assertThat(m.getRescheduleCount()).isEqualTo(1);
        assertThat(m.getProposedFor()).isNotNull();
        assertThat(talentInterviews.findByOrgIdAndId(a.getId(), alexInterview.getId()).orElseThrow().getScheduledAt()).isEqualTo(alexInterview.getScheduledAt()); // E1: unchanged
        assertThat(events.countByOrgId(a.getId())).isEqualTo(1);
        assertThatThrownBy(() -> service.confirmSlot(me, zedInterview.getId())).isInstanceOf(OrgNotFoundException.class);
        assertThatThrownBy(() -> service.proposeReschedule(me, 999_999_999L, new MktInterviewsDto.RescheduleRequest(Instant.now().plus(Duration.ofDays(4)), null))).isInstanceOf(OrgNotFoundException.class);
    }

    @Test
    void theDatabaseRefusesAMetaRowThatPointsAtAnotherTenantsInterview() {
        MktInterviewMeta m = new MktInterviewMeta();
        m.setOrgId(b.getId());
        m.setInterviewId(alexInterview.getId()); // org A's interview
        assertThatThrownBy(() -> metas.save(m)).isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void anotherTenantsMemberGetsTheGeneric404OnEveryRoute() throws Exception {
        String base = "/api/orgs/" + a.getId() + "/mkt/interviews";
        for (MvcResult r : new MvcResult[] {
            mockMvc.perform(get(base).with(user("mkt-iv-b-marketer"))).andReturn(),
            mockMvc.perform(get(base + "/" + alexInterview.getId() + "/prep").with(user("mkt-iv-b-marketer"))).andReturn(),
            mockMvc.perform(post(base + "/" + alexInterview.getId() + "/confirm").with(user("mkt-iv-b-marketer")).contentType(MediaType.APPLICATION_JSON)).andReturn(),
            mockMvc.perform(post(base + "/" + alexInterview.getId() + "/remind").with(user("mkt-iv-b-marketer")).contentType(MediaType.APPLICATION_JSON)).andReturn(),
            mockMvc.perform(post(base + "/" + alexInterview.getId() + "/feedback").with(user("mkt-iv-b-marketer")).contentType(MediaType.APPLICATION_JSON).content("{\"outcome\":\"PASSED\"}")).andReturn(),
            mockMvc.perform(patch(base + "/" + alexInterview.getId() + "/prep/1").with(user("mkt-iv-b-marketer")).contentType(MediaType.APPLICATION_JSON).content("{\"done\":true}")).andReturn(),
        }) {
            assertThat(r.getResponse().getStatus()).isEqualTo(404);
            assertThat(r.getResponse().getContentAsString().toLowerCase()).contains("not_found").doesNotContain("forbidden").doesNotContain("not a member");
        }
        assertThat(metas.countByOrgId(a.getId())).isZero();
        assertThat(events.countByOrgId(a.getId())).isZero();
    }
}
