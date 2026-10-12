package com.dossier.api.web.rest.org;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.Application;
import com.dossier.api.domain.Interview;
import com.dossier.api.domain.enumeration.ApplicationStatus;
import com.dossier.api.domain.enumeration.OrgGroupKind;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.domain.enumeration.ShareScope;
import com.dossier.api.domain.org.OrgAuditEvent;
import com.dossier.api.domain.org.OrgGroup;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.ApplicationRepository;
import com.dossier.api.repository.InterviewRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.org.OrgAuditEventRepository;
import com.dossier.api.repository.org.OrgGroupRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.org.DataShareService;
import com.dossier.api.service.org.DataShareService.ShareContext;
import com.dossier.api.service.org.OrgAuditService;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgShareConsent;
import jakarta.persistence.EntityManager;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.transaction.annotation.Transactional;

/**
 * O2.7: the checklist and the dashboard numbers against MySQL. The point is the CONSENT arithmetic: only members who share
 * at least a SUMMARY count in any application number, a support owner sees only their own members, and no employer name or
 * role title ever appears in either response.
 */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
class OrgDashboardIT {

    @Autowired private MockMvc mockMvc;
    @Autowired private EntityManager em;
    @Autowired private UserRepository users;
    @Autowired private OrganizationRepository orgs;
    @Autowired private OrgMemberRepository members;
    @Autowired private OrgGroupRepository groups;
    @Autowired private OrgAuditEventRepository audit;
    @Autowired private ApplicationRepository applications;
    @Autowired private InterviewRepository interviews;
    @Autowired private DataShareService dataShare;

    private OrgFixtures fx;
    private Organization org;
    private OrgMember staff;
    private OrgMember sharingOwned;
    private OrgMember sharingFree;
    private OrgMember notSharing;

    @BeforeEach
    void world() {
        fx = new OrgFixtures(users, orgs, members);
        org = fx.org("dash", OrgStatus.ACTIVE);
        fx.active(org, "dash-owner", OrgRole.OWNER);
        fx.active(org, "dash-admin", OrgRole.ADMIN);
        fx.seat(org, "dash-admin-invited", OrgRole.ADMIN, OrgMemberStatus.INVITED);
        fx.active(org, "dash-finance", OrgRole.FINANCE);
        fx.active(org, "dash-marketer", OrgRole.MARKETER);
        staff = fx.active(org, "dash-staff", OrgRole.STAFF);

        sharingOwned = fx.active(org, "dash-m1", OrgRole.MEMBER); // shares, looked after by `staff`
        sharingOwned.setSupportOwnerMemberId(staff.getId());
        members.saveAndFlush(sharingOwned);
        sharingFree = fx.active(org, "dash-m2", OrgRole.MEMBER); // shares, nobody's
        notSharing = fx.active(org, "dash-m3", OrgRole.MEMBER); // shares nothing
        notSharing.setSupportOwnerMemberId(staff.getId());
        members.saveAndFlush(notSharing);
        fx.seat(org, "dash-m4", OrgRole.MEMBER, OrgMemberStatus.INVITED);

        share(sharingOwned, ShareScope.SUMMARY);
        share(sharingFree, ShareScope.SUMMARY);
        share(notSharing, ShareScope.NONE);

        Instant now = Instant.now();
        app(sharingOwned, "Secretco", "Staff Designer", ApplicationStatus.APPLIED, now.minus(3, ChronoUnit.DAYS), null);
        app(sharingOwned, "Hushco", "Lead Designer", ApplicationStatus.INTERVIEW, now.minus(10, ChronoUnit.DAYS), null);
        Application offer = app(sharingOwned, "Quietco", "Principal Designer", ApplicationStatus.OFFER, now.minus(20, ChronoUnit.DAYS), "ACCEPTED");
        app(sharingFree, "Oldco", "Designer", ApplicationStatus.REJECTED, now.minus(60, ChronoUnit.DAYS), null); // applied outside the 30 days
        app(notSharing, "Privateco", "Designer", ApplicationStatus.APPLIED, now.minus(1, ChronoUnit.DAYS), null); // must not count anywhere
        interview(sharingOwned, offer, now.plus(2, ChronoUnit.DAYS));
        interview(sharingOwned, offer, now.minus(2, ChronoUnit.DAYS)); // in the past
        interview(notSharing, offer, now.plus(3, ChronoUnit.DAYS)); // not sharing
        em.flush();
    }

    private void share(OrgMember seat, ShareScope scope) {
        OrgMembership as = new OrgMembership(org.getId(), seat.getId(), seat.getUserId(), users.findById(seat.getUserId()).orElseThrow().getLogin(), seat.getRole(), seat.getStatus(), org.getStatus());
        dataShare.grant(as, scope, null, OrgShareConsent.CURRENT, ShareContext.EMPTY);
    }

    private Application app(OrgMember seat, String company, String title, ApplicationStatus status, Instant applied, String outcome) {
        Application a = new Application();
        a.setUser(users.findById(seat.getUserId()).orElseThrow());
        a.setCompany(company);
        a.setRoleTitle(title);
        a.setStatus(status);
        a.setCreatedAt(applied);
        a.setUpdatedAt(applied);
        a.setAppliedAt(applied);
        a.setArchived(false);
        a.setOutcome(outcome);
        return applications.save(a);
    }

    private void interview(OrgMember seat, Application a, Instant at) {
        Interview i = new Interview();
        i.setApplicationId(a.getId());
        i.setUserId(seat.getUserId());
        i.setKind("VIDEO");
        i.setStartsAt(at);
        interviews.save(i);
    }

    private ResultActions as(String login, String path) throws Exception {
        return mockMvc.perform(get("/api/orgs/" + org.getId() + path).with(user(login)));
    }

    // ---- /overview ----------------------------------------------------------------------------------------------------

    @Test
    void anOwnerSeesSeatsAndOnlyTheProgressOfMembersWhoShare() throws Exception {
        as("dash-owner", "/overview")
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.seats.total").value(10)) // 8 active (owner, admin, finance, marketer, staff, three members) + 2 invited
            .andExpect(jsonPath("$.seats.active").value(8))
            .andExpect(jsonPath("$.seats.invited").value(2))
            .andExpect(jsonPath("$.seats.sharing").value(2)) // m1 and m2; m3 shares nothing
            .andExpect(jsonPath("$.groups").value(0))
            .andExpect(jsonPath("$.applications.submitted30d").value(3))
            .andExpect(jsonPath("$.applications.interviewing").value(1))
            .andExpect(jsonPath("$.applications.offers").value(1))
            .andExpect(jsonPath("$.applications.placedMembers").value(1))
            .andExpect(jsonPath("$.applications.upcomingInterviews").value(1))
            .andExpect(jsonPath("$.applications.pipeline.length()").value(5))
            .andExpect(jsonPath("$.applications.pipeline[0].stage").value("APPLIED"))
            .andExpect(jsonPath("$.applications.pipeline[0].count").value(1))
            .andExpect(jsonPath("$.applications.pipeline[4].stage").value("REJECTED"))
            .andExpect(jsonPath("$.applications.pipeline[4].count").value(1));
    }

    @Test
    void noEmployerNameOrRoleTitleLeavesTheServer() throws Exception {
        for (String login : new String[] { "dash-owner", "dash-admin", "dash-staff", "dash-finance" }) {
            String body = as(login, "/overview").andReturn().getResponse().getContentAsString();
            for (String secret : new String[] { "Secretco", "Hushco", "Quietco", "Oldco", "Privateco", "Designer" }) assertThat(body).as(login + " must not see " + secret).doesNotContain(secret);
        }
    }

    @Test
    void aSupportOwnerSeesOnlyTheirOwnMembers() throws Exception {
        as("dash-staff", "/overview")
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.seats.sharing").value(1)) // m1 only: m2 is nobody's, m3 shares nothing
            .andExpect(jsonPath("$.applications.submitted30d").value(3))
            .andExpect(jsonPath("$.applications.pipeline[4].count").value(0)) // m2's old rejection is not theirs
            .andExpect(jsonPath("$.recent.length()").value(0)); // a support owner has no audit.view
    }

    @Test
    void aMarketerHasNoPairingYetSoNoApplicationNumbers() throws Exception {
        as("dash-marketer", "/overview")
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.seats.sharing").value(0))
            .andExpect(jsonPath("$.applications.submitted30d").value(0));
    }

    @Test
    void financeSeesOnlyTheBillingAndOpsRowsOfTheTrail() throws Exception {
        audit(OrgAuditService.GROUP_CREATE, "dash-admin");
        audit(OrgAuditService.BILLING_DEV_ACTIVATED, "dash-owner");
        as("dash-finance", "/overview").andExpect(jsonPath("$.recent.length()").value(1)).andExpect(jsonPath("$.recent[0].action").value(OrgAuditService.BILLING_DEV_ACTIVATED));
        as("dash-admin", "/overview").andExpect(jsonPath("$.recent.length()").value(2)).andExpect(jsonPath("$.recent[0].action").value(OrgAuditService.BILLING_DEV_ACTIVATED)).andExpect(jsonPath("$.recent[0].mine").value(false)).andExpect(jsonPath("$.recent[1].mine").value(true));
    }

    private void audit(String action, String actor) {
        OrgAuditEvent e = new OrgAuditEvent();
        e.setOrgId(org.getId());
        e.setActorLogin(actor);
        e.setActorRole("ADMIN");
        e.setAction(action);
        e.setTargetType(OrgAuditService.TARGET_ORG);
        e.setCreatedAt(Instant.now().plusSeconds(action.startsWith("BILLING") ? 5 : 0));
        audit.save(e);
        em.flush();
    }

    @Test
    void aMemberAndAStrangerGetTheGenericNotFound() throws Exception {
        as("dash-m1", "/overview").andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("NOT_FOUND"));
        fx.user("dash-stranger");
        as("dash-stranger", "/overview").andExpect(status().isNotFound());
    }

    // ---- /onboarding -------------------------------------------------------------------------------------------------

    @Test
    void theChecklistCountsWhatIsReallyThere() throws Exception {
        OrgGroup g = new OrgGroup();
        g.setOrgId(org.getId());
        g.setName("Cohort 26-A");
        g.setKind(OrgGroupKind.COHORT);
        groups.saveAndFlush(g);

        as("dash-owner", "/onboarding")
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.items.length()").value(8))
            .andExpect(jsonPath("$.items[?(@.key=='activate')].done").value(true))
            .andExpect(jsonPath("$.items[?(@.key=='activate')].available").value(true))
            .andExpect(jsonPath("$.items[?(@.key=='groups')].done").value(true))
            .andExpect(jsonPath("$.items[?(@.key=='groups')].count").value(1))
            .andExpect(jsonPath("$.items[?(@.key=='admins')].count").value(1)) // one joined...
            .andExpect(jsonPath("$.items[?(@.key=='admins')].total").value(2)) // ...of two (one invited)
            .andExpect(jsonPath("$.items[?(@.key=='admins')].available").value(false))
            .andExpect(jsonPath("$.items[?(@.key=='invite')].count").value(3))
            .andExpect(jsonPath("$.items[?(@.key=='invite')].total").value(4))
            .andExpect(jsonPath("$.items[?(@.key=='plans')].done").value(false))
            .andExpect(jsonPath("$.items[?(@.key=='domain')].optional").value(true))
            .andExpect(jsonPath("$.total").value(7))
            .andExpect(jsonPath("$.complete").value(false));
    }

    @Test
    void aDraftOrgIsNotActivatedYetAndAnEmptyOneHasNothingDone() throws Exception {
        Organization draft = fx.org("dash-draft", OrgStatus.DRAFT);
        fx.active(draft, "draft-owner", OrgRole.OWNER);
        mockMvc
            .perform(get("/api/orgs/" + draft.getId() + "/onboarding").with(user("draft-owner")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.items[?(@.key=='activate')].done").value(false))
            .andExpect(jsonPath("$.items[?(@.key=='groups')].done").value(false))
            .andExpect(jsonPath("$.items[?(@.key=='invite')].count").value(0))
            .andExpect(jsonPath("$.done").value(0));
    }

    @Test
    void onlyThePeopleWhoSetTheWorkspaceUpSeeTheChecklist() throws Exception {
        as("dash-admin", "/onboarding").andExpect(status().isOk());
        for (String login : new String[] { "dash-staff", "dash-finance", "dash-marketer", "dash-m1" }) as(login, "/onboarding").andExpect(status().isNotFound());
    }
}
