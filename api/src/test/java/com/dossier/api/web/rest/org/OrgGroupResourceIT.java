package com.dossier.api.web.rest.org;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.domain.org.OrgAuditEvent;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.org.OrgAuditEventRepository;
import com.dossier.api.repository.org.OrgGroupRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.org.OrgAuditAsserts;
import com.dossier.api.service.org.OrgAuditService;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.transaction.annotation.Transactional;

/** O1.3: groups CRUD: unique names per org, role gates, closed orgs, foreign group ids, one audit row per mutation. */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
class OrgGroupResourceIT {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper om;

    @Autowired
    private UserRepository users;

    @Autowired
    private OrganizationRepository orgs;

    @Autowired
    private OrgMemberRepository members;

    @Autowired
    private OrgGroupRepository groups;

    @Autowired
    private OrgAuditEventRepository audit;

    @Autowired
    private EntityManager em;

    private OrgFixtures fx;
    private Organization org;
    private Organization other;

    @BeforeEach
    void seed() {
        fx = new OrgFixtures(users, orgs, members);
        org = fx.org("acme", OrgStatus.ACTIVE);
        other = fx.org("globex", OrgStatus.ACTIVE);
        fx.active(org, "owner", OrgRole.OWNER);
        fx.active(org, "admin1", OrgRole.ADMIN);
        fx.active(org, "staff1", OrgRole.STAFF);
        fx.active(org, "member1", OrgRole.MEMBER);
        fx.active(other, "otherowner", OrgRole.OWNER);
    }

    private ResultActions call(String login, MockHttpServletRequestBuilder req) throws Exception {
        return mockMvc.perform(req.with(user(login)).contentType(MediaType.APPLICATION_JSON));
    }

    private String url() {
        return "/api/orgs/" + org.getId() + "/groups";
    }

    private long createGroup(Organization o, String login, String json) throws Exception {
        ResultActions r = call(login, post("/api/orgs/" + o.getId() + "/groups").content(json)).andExpect(status().isCreated());
        return om.readTree(r.andReturn().getResponse().getContentAsString()).path("id").asLong();
    }

    @Test
    void createWritesTheGroupAndOneAuditRow() throws Exception {
        long before = audit.countByOrgId(org.getId());
        ResultActions r = call("owner", post(url()).content("{\"name\":\"Cohort 26-A\",\"kind\":\"COHORT\",\"sortOrder\":3}"))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.name").value("Cohort 26-A"))
            .andExpect(jsonPath("$.kind").value("COHORT"))
            .andExpect(jsonPath("$.sortOrder").value(3))
            .andExpect(jsonPath("$.memberCount").value(0));
        long id = om.readTree(r.andReturn().getResponse().getContentAsString()).path("id").asLong();
        assertThat(groups.findByOrgIdAndId(org.getId(), id)).isPresent();
        OrgAuditEvent row = OrgAuditAsserts.assertOneNewRow(audit, org.getId(), before, OrgAuditService.GROUP_CREATE);
        assertThat(row.getTargetType()).isEqualTo("GROUP");
        assertThat(row.getTargetId()).isEqualTo(String.valueOf(id));
        assertThat(row.getActorLogin()).isEqualTo("owner");
    }

    @Test
    void anAdminCanManageGroupsToo() throws Exception {
        createGroup(org, "admin1", "{\"name\":\"Engineering\",\"kind\":\"DEPARTMENT\"}");
    }

    @Test
    void defaultsAreTeamKindAndAppendedSortOrder() throws Exception {
        createGroup(org, "owner", "{\"name\":\"One\"}");
        call("owner", post(url()).content("{\"name\":\"Two\"}")).andExpect(jsonPath("$.kind").value("TEAM")).andExpect(jsonPath("$.sortOrder").value(1));
    }

    @Test
    void listIsSortedByOrderThenNameAndCountsLiveMembers() throws Exception {
        long b = createGroup(org, "owner", "{\"name\":\"Beta\",\"sortOrder\":1}");
        createGroup(org, "owner", "{\"name\":\"Alpha\",\"sortOrder\":1}");
        createGroup(org, "owner", "{\"name\":\"Zulu\",\"sortOrder\":0}");
        OrgMember m1 = fx.active(org, "g1", OrgRole.MEMBER);
        OrgMember m2 = fx.seat(org, "g2", OrgRole.MEMBER, OrgMemberStatus.SUSPENDED);
        OrgMember gone = fx.seat(org, "g3", OrgRole.MEMBER, OrgMemberStatus.LEFT);
        for (OrgMember m : new OrgMember[] { m1, m2, gone }) {
            m.setGroupId(b);
            members.saveAndFlush(m);
        }
        call("owner", get(url()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.length()").value(3))
            .andExpect(jsonPath("$[0].name").value("Zulu"))
            .andExpect(jsonPath("$[1].name").value("Alpha"))
            .andExpect(jsonPath("$[2].name").value("Beta"))
            .andExpect(jsonPath("$[2].memberCount").value(2)); // LEFT is not counted
    }

    @Test
    void staffCanListButNotChangeAndAMemberCanDoNeither() throws Exception {
        long id = createGroup(org, "owner", "{\"name\":\"Cohort\"}");
        long before = audit.countByOrgId(org.getId());
        call("staff1", get(url())).andExpect(status().isOk());
        call("staff1", post(url()).content("{\"name\":\"X\"}")).andExpect(status().isNotFound());
        call("staff1", patch(url() + "/" + id).content("{\"name\":\"X\"}")).andExpect(status().isNotFound());
        call("staff1", delete(url() + "/" + id)).andExpect(status().isNotFound());
        call("member1", get(url())).andExpect(status().isNotFound());
        call("member1", post(url()).content("{\"name\":\"X\"}")).andExpect(status().isNotFound());
        OrgAuditAsserts.assertNoNewRow(audit, org.getId(), before);
        assertThat(groups.findByOrgIdOrderBySortOrderAscNameAsc(org.getId())).hasSize(1);
    }

    @Test
    void duplicateNamesInAnOrgAre409EvenWithADifferentCaseButAnotherOrgMayReuseTheName() throws Exception {
        createGroup(org, "owner", "{\"name\":\"Cohort 26-A\"}");
        long before = audit.countByOrgId(org.getId());
        call("owner", post(url()).content("{\"name\":\"Cohort 26-A\"}")).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("GROUP_NAME_TAKEN"));
        call("owner", post(url()).content("{\"name\":\"cohort 26-a\"}")).andExpect(status().isConflict());
        OrgAuditAsserts.assertNoNewRow(audit, org.getId(), before);
        createGroup(other, "otherowner", "{\"name\":\"Cohort 26-A\"}");
    }

    @Test
    void patchRenamesRetypesAndReordersWithOneAuditRowNamingTheFields() throws Exception {
        long id = createGroup(org, "owner", "{\"name\":\"Old\"}");
        long before = audit.countByOrgId(org.getId());
        call("owner", patch(url() + "/" + id).content("{\"name\":\"New\",\"kind\":\"DEPARTMENT\",\"sortOrder\":7}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.name").value("New"))
            .andExpect(jsonPath("$.kind").value("DEPARTMENT"))
            .andExpect(jsonPath("$.sortOrder").value(7));
        OrgAuditEvent row = OrgAuditAsserts.assertOneNewRow(audit, org.getId(), before, OrgAuditService.GROUP_UPDATE);
        assertThat(row.getDetails()).isEqualTo("fields=name,kind,sortOrder");
        // a no-op patch audits nothing; a case-only rename of the same group is allowed
        long after = audit.countByOrgId(org.getId());
        call("owner", patch(url() + "/" + id).content("{\"name\":\"New\"}")).andExpect(status().isOk());
        OrgAuditAsserts.assertNoNewRow(audit, org.getId(), after);
        call("owner", patch(url() + "/" + id).content("{\"name\":\"NEW\"}")).andExpect(status().isOk()).andExpect(jsonPath("$.name").value("NEW"));
    }

    @Test
    void renamingOntoAnotherGroupsNameIs409() throws Exception {
        createGroup(org, "owner", "{\"name\":\"Alpha\"}");
        long beta = createGroup(org, "owner", "{\"name\":\"Beta\"}");
        long before = audit.countByOrgId(org.getId());
        call("owner", patch(url() + "/" + beta).content("{\"name\":\"alpha\"}")).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("GROUP_NAME_TAKEN"));
        OrgAuditAsserts.assertNoNewRow(audit, org.getId(), before);
    }

    @Test
    void deleteRemovesTheGroupDetachesItsMembersAndAuditsOnce() throws Exception {
        long id = createGroup(org, "owner", "{\"name\":\"Doomed\"}");
        OrgMember m = fx.active(org, "g1", OrgRole.MEMBER);
        m.setGroupId(id);
        members.saveAndFlush(m);
        long before = audit.countByOrgId(org.getId());

        call("owner", delete(url() + "/" + id)).andExpect(status().isNoContent());

        assertThat(groups.findByOrgIdAndId(org.getId(), id)).isEmpty();
        em.clear();
        assertThat(members.findByOrgIdAndId(org.getId(), m.getId()).orElseThrow().getGroupId()).isNull(); // the person stays
        assertThat(members.findByOrgIdAndId(org.getId(), m.getId()).orElseThrow().getStatus()).isEqualTo(OrgMemberStatus.ACTIVE);
        OrgAuditEvent row = OrgAuditAsserts.assertOneNewRow(audit, org.getId(), before, OrgAuditService.GROUP_DELETE);
        assertThat(row.getDetails()).isEqualTo("name=Doomed members=1");
        call("owner", delete(url() + "/" + id)).andExpect(status().isNotFound()); // already gone
    }

    @Test
    void aGroupIdFromAnotherOrgIsA404ForPatchAndDeleteAndStaysUntouched() throws Exception {
        long foreign = createGroup(other, "otherowner", "{\"name\":\"Secret cohort\"}");
        long before = audit.countByOrgId(other.getId());
        call("owner", patch(url() + "/" + foreign).content("{\"name\":\"Mine now\"}")).andExpect(status().isNotFound());
        call("owner", delete(url() + "/" + foreign)).andExpect(status().isNotFound());
        // and by the other org's URL the caller has no seat, so that is a 404 too
        call("owner", get("/api/orgs/" + other.getId() + "/groups")).andExpect(status().isNotFound());
        call("owner", post("/api/orgs/" + other.getId() + "/groups").content("{\"name\":\"Planted\"}")).andExpect(status().isNotFound());
        assertThat(groups.findByOrgIdAndId(other.getId(), foreign).orElseThrow().getName()).isEqualTo("Secret cohort");
        assertThat(groups.findByOrgIdOrderBySortOrderAscNameAsc(other.getId())).hasSize(1);
        OrgAuditAsserts.assertNoNewRow(audit, other.getId(), before);
        assertThat(audit.countByOrgIdAndActorLogin(other.getId(), "owner")).isZero();
    }

    @Test
    void validationAndSensitiveContent() throws Exception {
        call("owner", post(url()).content("{\"name\":\" \"}")).andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.field").value("name"));
        call("owner", post(url()).content("{\"name\":\"" + "g".repeat(81) + "\"}")).andExpect(status().isUnprocessableEntity());
        call("owner", post(url()).content("{\"name\":\"Fine\",\"sortOrder\":10000}")).andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.field").value("sortOrder"));
        call("owner", post(url()).content("{\"name\":\"Fine\",\"sortOrder\":-1}")).andExpect(status().isUnprocessableEntity());
        call("owner", post(url()).content("{\"name\":\"123-45-6789\"}")).andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("SENSITIVE_CONTENT"));
        call("owner", post(url()).content("{\"name\":\"Fine\",\"kind\":\"GALAXY\"}")).andExpect(status().isBadRequest());
        assertThat(groups.findByOrgIdOrderBySortOrderAscNameAsc(org.getId())).isEmpty();
    }

    @Test
    void aClosedOrgIsReadOnlyForGroups() throws Exception {
        long id = createGroup(org, "owner", "{\"name\":\"Before close\"}");
        Organization closed = orgs.findByOrgId(org.getId()).orElseThrow();
        closed.setStatus(OrgStatus.CLOSED);
        orgs.saveAndFlush(closed);
        call("owner", get(url())).andExpect(status().isOk());
        call("owner", post(url()).content("{\"name\":\"After\"}")).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("ORG_NOT_EDITABLE"));
        call("owner", patch(url() + "/" + id).content("{\"name\":\"After\"}")).andExpect(status().isConflict());
        call("owner", delete(url() + "/" + id)).andExpect(status().isConflict());
        assertThat(groups.findByOrgIdAndId(org.getId(), id)).isPresent();
    }

    @Test
    void aNonNumericGroupIdIsA400NotA500() throws Exception {
        call("owner", delete(url() + "/abc")).andExpect(status().isBadRequest());
    }
}
