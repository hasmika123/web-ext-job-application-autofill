package com.dossier.api.web.rest.ent;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.ent.consultantws.CwsSubmission;
import com.dossier.api.domain.ent.talent.ClientAccount;
import com.dossier.api.domain.ent.talent.ClientRequirement;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.ent.talent.TalentApplication;
import com.dossier.api.domain.ent.talent.TalentApplicationEvent;
import com.dossier.api.domain.enumeration.ApplicationStatus;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.repository.ent.consultantws.CwsSubmissionRepository;
import com.dossier.api.service.ent.consultant.LinkedApplicationProjection;
import com.fasterxml.jackson.databind.JsonNode;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;

/**
 * X9.13 (docs/change-audit/README.md section 2.2, 2.5): the organization's application carries who changed it last and the person behind every
 * history row, with the relation to the consultant it is about. A marketer's stage move, an admin's, the linker's projection (SYSTEM), an enterprise
 * login with no name ("a member", never the login) and an erased seat ("a former member"). A member id of another organization cannot even be stored on a
 * row (the foreign key (org_id, actor_member_id) keeps the tenants apart); what the resolver answers for such an id is {@code EntChangeActorsTest}.
 */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
@org.junit.jupiter.api.Timeout(120)
class ApplicationChangeAuditIT extends MemberItSupport {

    @Autowired
    private LinkedApplicationProjection linker;

    @Autowired
    private CwsSubmissionRepository cwsSubmissions;

    private ConsultantProfile kara;
    private TalentApplication app;

    @BeforeEach
    void world() {
        ClientAccount client = ApplicationItSupport.client(em, a.getId(), "Initech");
        ClientRequirement job = ApplicationItSupport.job(em, a.getId(), client, "Data Engineer");
        kara = ApplicationItSupport.consultant(em, a.getId(), "Kara One");
        kara.setMemberId(c1.getId());
        em.persist(kara);
        ApplicationItSupport.capacity(em, a.getId(), mktSpec.getId());
        ApplicationItSupport.capacity(em, a.getId(), owner.getId());
        app = ApplicationItSupport.application(em, a.getId(), job, kara, mktSpec.getId(), "ASSIGNED", 2);
        em.flush();
    }

    private String url() {
        return "/api/orgs/" + a.getId() + "/applications";
    }

    private MvcResult send(String who, org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder req, String body) throws Exception {
        return call(login(who), req, body, null, key());
    }

    private JsonNode detail(String who) throws Exception {
        MvcResult r = call(login(who), get(url() + "/" + app.getId()));
        assertStatus(r, 200);
        assertThat(r.getResponse().getContentAsString()).as("no enterprise login in any ent response body").doesNotContain("ent#");
        return json(r);
    }

    private List<TalentApplicationEvent> events() {
        em.flush();
        em.clear();
        return em.createQuery("select e from TalentApplicationEvent e where e.orgId = :o and e.applicationId = :a order by e.occurredAt desc, e.id desc", TalentApplicationEvent.class)
            .setParameter("o", a.getId()).setParameter("a", app.getId()).getResultList();
    }

    private TalentApplicationEvent eventBy(OrgMember actor, String type) {
        TalentApplicationEvent e = new TalentApplicationEvent();
        e.setOrgId(a.getId());
        e.setApplicationId(app.getId());
        e.setEventType(type);
        e.setFromStage("ASSIGNED");
        e.setToStage("SUBMITTED");
        e.setActorMemberId(actor == null ? null : actor.getId());
        e.setOccurredAt(Instant.now().plusSeconds(60));
        em.persist(e);
        em.flush();
        return e;
    }

    @Test
    void aMarketersStageMoveStampsTheEventAndTheRecordAndTheDetailNamesThemAsTheMarketer() throws Exception {
        assertStatus(send("spec", post(url() + "/" + app.getId() + "/stage"), "{\"stage\":\"SUBMITTED\"}"), 200);

        TalentApplicationEvent e = events().get(0);
        assertThat(e.getEventType()).isEqualTo("STAGE_CHANGE");
        assertThat(e.getActorKind()).isEqualTo("PERSON");
        assertThat(e.getActorMemberId()).isEqualTo(mktSpec.getId());
        assertThat(e.getChanges()).isEqualTo("[{\"f\":\"stage\",\"from\":\"ASSIGNED\",\"to\":\"SUBMITTED\"}]");
        TalentApplication stored = em.find(TalentApplication.class, app.getId());
        assertThat(stored.getUpdatedByMemberId()).isEqualTo(mktSpec.getId());

        JsonNode d = detail("owner");
        assertThat(d.at("/updatedBy/label").asText()).isEqualTo("Sam Spec");
        assertThat(d.at("/updatedBy/relation").asText()).isEqualTo("marketer");
        assertThat(d.at("/updatedBy/memberId").asLong()).isEqualTo(mktSpec.getId());
        assertThat(d.at("/updatedBy/kind").asText()).isEqualTo("PERSON");
        assertThat(d.at("/activity/0/by/label").asText()).isEqualTo("Sam Spec");
        assertThat(d.at("/activity/0/by/relation").asText()).isEqualTo("marketer");
        assertThat(d.at("/activity/0/changes/0/f").asText()).isEqualTo("stage");
        assertThat(d.at("/activity/0/changes/0/to").asText()).isEqualTo("SUBMITTED");
        assertThat(d.path("updatedAt").isNull()).isFalse();
    }

    @Test
    void anOwnersEditReadsAsAdmin() throws Exception {
        assertStatus(send("owner", post(url() + "/" + app.getId() + "/stage"), "{\"stage\":\"SUBMITTED\"}"), 200);
        JsonNode d = detail("owner");
        assertThat(d.at("/updatedBy/label").asText()).isEqualTo("Olivia Owner");
        assertThat(d.at("/updatedBy/relation").asText()).isEqualTo("admin");
    }

    @Test
    void theOrganizationsRowCarriesUpdatedAtAndUpdatedBy() throws Exception {
        assertStatus(send("spec", post(url() + "/" + app.getId() + "/stage"), "{\"stage\":\"SUBMITTED\"}"), 200);
        MvcResult r = call(login("owner"), get(url() + "?size=10"));
        assertStatus(r, 200);
        assertThat(r.getResponse().getContentAsString()).doesNotContain("ent#");
        JsonNode row = json(r).path("items").get(0);
        assertThat(row.at("/updatedBy/label").asText()).isEqualTo("Sam Spec");
        assertThat(row.at("/updatedBy/relation").asText()).isEqualTo("marketer");
        assertThat(row.path("updatedAt").isNull()).isFalse();
    }

    @Test
    void theConsultantsOwnActionReadsAsConsultant() throws Exception {
        TalentApplication t = em.find(TalentApplication.class, app.getId());
        t.setUpdatedByMemberId(c1.getId());
        em.flush();
        eventBy(c1, "NOTE");
        JsonNode d = detail("owner");
        assertThat(d.at("/updatedBy/label").asText()).isEqualTo("Anika Khan");
        assertThat(d.at("/updatedBy/relation").asText()).isEqualTo("consultant");
    }

    @Test
    void anotherMemberIsJustAMember() throws Exception {
        TalentApplication t = em.find(TalentApplication.class, app.getId());
        t.setUpdatedByMemberId(hr.getId());
        em.flush();
        assertThat(detail("owner").at("/updatedBy/relation").asText()).isEqualTo("member");
    }

    @Test
    void aLinkerProjectionIsSystemWithNoPersonAndTheHeadForgetsTheEarlierPerson() throws Exception {
        TalentApplication t = em.find(TalentApplication.class, app.getId());
        t.setPersonalApplicationId(777L);
        t.setUpdatedByMemberId(mktSpec.getId());
        em.flush();

        linker.mirror(a.getId(), 777L, ApplicationStatus.INTERVIEW);
        em.flush();

        TalentApplicationEvent e = events().get(0);
        assertThat(e.getActorKind()).isEqualTo("SYSTEM");
        assertThat(e.getActorMemberId()).isNull();
        assertThat(e.getChanges()).isEqualTo("[{\"f\":\"stage\",\"from\":\"ASSIGNED\",\"to\":\"INTERVIEWING\"}]");
        assertThat(em.find(TalentApplication.class, app.getId()).getUpdatedByMemberId()).isNull();

        JsonNode d = detail("owner");
        assertThat(d.at("/updatedBy/label").asText()).isEqualTo("Kiwiply");
        assertThat(d.at("/updatedBy/kind").asText()).isEqualTo("SYSTEM");
        assertThat(d.at("/updatedBy/relation").asText()).isEqualTo("system");
        assertThat(d.at("/activity/0/by/kind").asText()).isEqualTo("SYSTEM");
    }

    @Autowired
    private org.springframework.jdbc.core.JdbcTemplate jdbc;

    @Test
    void anEnterpriseAccountWithNoNameAndNoSeatLabelIsAMemberNeverItsLogin() throws Exception {
        OrgMember ghost = fx.active(a, p + "-ghost", OrgRole.MEMBER);
        // what an organization seat's own account looks like: the synthetic login, and no name
        jdbc.update("update jhi_user set login = ?, first_name = null, last_name = null where id = ?", "ent#" + a.getId() + "#ghost@example.test", ghost.getUserId());
        em.clear();
        eventBy(ghost, "NOTE");
        JsonNode d = detail("owner");
        assertThat(d.at("/activity/0/by/label").asText()).isEqualTo("a member");
    }

    @Test
    void anErasedSeatIsAFormerMember() throws Exception {
        OrgMember gone = person(a, "gone", OrgRole.MEMBER, "Gil", "Gone");
        eventBy(gone, "NOTE");
        OrgMember seat = em.find(OrgMember.class, gone.getId());
        seat.setStatus(OrgMemberStatus.ERASED);
        seat.setUserId(null);
        seat.setDisplayLabel(null);
        em.flush();
        em.clear();
        JsonNode d = detail("owner");
        assertThat(d.at("/activity/0/by/label").asText()).isEqualTo("a former member");
        assertThat(d.at("/activity/0/actor/name").asText()).as("the original shape follows the same words").isEqualTo("a former member");
    }

    @Test
    void theConsultantsApproveStampsTheirSeatOnTheSubmission() {
        CwsSubmission s = new CwsSubmission();
        s.setOrgId(a.getId());
        s.setConsultantId(kara.getId());
        s.setRequirementId(app.getRequirementId());
        s.setMarketerMemberId(mktSpec.getId());
        s.setCreatedByMemberId(mktSpec.getId());
        s.setUpdatedByMemberId(mktSpec.getId());
        s.setStatus(CwsSubmission.PENDING);
        s.setSampleData(false);
        s = cwsSubmissions.saveAndFlush(s);

        int moved = cwsSubmissions.transition(a.getId(), kara.getId(), s.getId(), CwsSubmission.PENDING, CwsSubmission.APPROVED, Instant.now(), null, c1.getId());
        assertThat(moved).isEqualTo(1);
        em.clear();
        CwsSubmission after = em.find(CwsSubmission.class, s.getId());
        assertThat(after.getUpdatedByMemberId()).isEqualTo(c1.getId());
        assertThat(after.getCreatedByMemberId()).as("the preparer stays the creator").isEqualTo(mktSpec.getId());
    }

    @Test
    void aStageMoveWithAClosedReasonRecordsTheReasonCodeAndNotFreeText() throws Exception {
        assertStatus(send("owner", post(url() + "/" + app.getId() + "/stage"), "{\"stage\":\"SUBMITTED\"}"), 200);
        assertStatus(send("owner", post(url() + "/" + app.getId() + "/stage"), "{\"stage\":\"CLOSED\",\"closedReason\":\"REJECTED\"}"), 200);
        TalentApplicationEvent e = events().get(0);
        assertThat(e.getChanges()).contains("{\"f\":\"stage\",\"from\":\"SUBMITTED\",\"to\":\"CLOSED\"}").contains("{\"f\":\"closedReason\",\"to\":\"REJECTED\"}");
    }

    @Test
    void aNoteRecordsTheFieldNameNotTheText() throws Exception {
        assertStatus(send("owner", post(url() + "/" + app.getId() + "/notes"), "{\"body\":\"Spoke with the recruiter about the team\"}"), 201);
        TalentApplicationEvent e = events().get(0);
        assertThat(e.getEventType()).isEqualTo("NOTE");
        assertThat(e.getChanges()).isEqualTo("[{\"f\":\"body\"}]");
        assertThat(e.getActorKind()).isEqualTo("PERSON");
    }
}
