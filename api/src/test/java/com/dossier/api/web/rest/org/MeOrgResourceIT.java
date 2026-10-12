package com.dossier.api.web.rest.org;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.User;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.domain.enumeration.ShareScope;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.org.DataShareEventRepository;
import com.dossier.api.repository.org.DataShareRepository;
import com.dossier.api.repository.org.OrgAuditEventRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.org.DataShareService;
import com.dossier.api.service.org.OrgAuditAsserts;
import com.dossier.api.service.org.OrgAuditService;
import com.dossier.api.service.resume.OrgResumeSharing;
import java.time.Instant;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.transaction.annotation.Transactional;

/**
 * O6.2: the member's side of an organization (consent-data-sharing.md sections 4 and 5.2). My organizations and what each can
 * see (spelled out from the visibility matrix), changing what I share (effective at once, one event and one audit row, FULL
 * only for a named marketer), and leaving (all sharing ends, nothing is deleted). Everything acts on the CALLER's own seat.
 */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
class MeOrgResourceIT {

    private static final String V1 = "org-share/v1";

    @Autowired private MockMvc mockMvc;
    @Autowired private UserRepository users;
    @Autowired private OrganizationRepository orgs;
    @Autowired private OrgMemberRepository members;
    @Autowired private OrgAuditEventRepository audit;
    @Autowired private DataShareRepository shares;
    @Autowired private DataShareEventRepository events;
    @Autowired private DataShareService dataShare;
    @Autowired private OrgResumeSharing resumeSharing;

    private OrgFixtures fx;
    private Organization acme;
    private OrgMember owner;
    private OrgMember sam;
    private OrgMember rahul;

    @BeforeEach
    void seed() {
        fx = new OrgFixtures(users, orgs, members);
        acme = fx.org("acme", OrgStatus.ACTIVE);
        owner = fx.active(acme, "own", OrgRole.OWNER);
        sam = fx.active(acme, "sam", OrgRole.MEMBER);
        rahul = fx.active(acme, "rahul", OrgRole.MARKETER);
        User u = users.findOneByLogin("sam").orElseThrow();
        u.setFirstName("Sam");
        u.setLastName("Rivera");
        users.saveAndFlush(u);
        User r = users.findOneByLogin("rahul").orElseThrow();
        r.setFirstName("Rahul");
        r.setLastName("Shah");
        users.saveAndFlush(r);
    }

    private ResultActions listMine(String login) throws Exception {
        return mockMvc.perform(get("/api/me/orgs").with(user(login)));
    }

    private ResultActions share(String login, Organization org, String json) throws Exception {
        return mockMvc.perform(put("/api/me/orgs/" + org.getId() + "/share").with(user(login)).contentType(MediaType.APPLICATION_JSON).content(json));
    }

    private ResultActions leave(String login, Organization org) throws Exception {
        return mockMvc.perform(post("/api/me/orgs/" + org.getId() + "/leave").with(user(login)));
    }

    private String body(String scope) {
        return "{\"scope\":\"" + scope + "\",\"consentVersion\":\"" + V1 + "\"}";
    }

    // ---- GET /api/me/orgs -----------------------------------------------------------------------------------------

    @Test
    void myOrganizationsSaySpelledOutFromTheMatrixWhatEachCanSee() throws Exception {
        share("sam", acme, body("SUMMARY")).andExpect(status().isOk());
        listMine("sam")
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.length()").value(1))
            .andExpect(jsonPath("$[0].org.slug").value("acme"))
            .andExpect(jsonPath("$[0].role").value("MEMBER"))
            .andExpect(jsonPath("$[0].status").value("ACTIVE"))
            .andExpect(jsonPath("$[0].scope").value("SUMMARY"))
            .andExpect(jsonPath("$[0].effectiveScope").value("SUMMARY"))
            .andExpect(jsonPath("$[0].consentVersion").value(V1))
            .andExpect(jsonPath("$[0].sees.length()").value(7)) // seat, activated, stages, last activity, resume readiness, interviews, placement
            .andExpect(jsonPath("$[0].sees[2]").value("How many applications you have in each stage"))
            .andExpect(jsonPath("$[0].neverSees.length()").value(5))
            .andExpect(jsonPath("$[0].canLeave").value(true))
            .andExpect(jsonPath("$[0].canChangeScope").value(true));
        // no word of the FULL-only facts appears at SUMMARY
        String all = listMine("sam").andReturn().getResponse().getContentAsString();
        assertThat(all).doesNotContain("Company names").doesNotContain("Your resumes").doesNotContain("interview calendar");
    }

    @Test
    void whoNeverChoseSharesNothingAndTheOwnerCannotLeave() throws Exception {
        listMine("own")
            .andExpect(jsonPath("$[0].scope").value("NONE"))
            .andExpect(jsonPath("$[0].sees.length()").value(2))
            .andExpect(jsonPath("$[0].consentVersion").doesNotExist())
            .andExpect(jsonPath("$[0].canLeave").value(false));
    }

    @Test
    void onlyActiveOrSuspendedSeatsOfTheCallerAreListedAndAStrangerSeesNone() throws Exception {
        OrgMember invited = new OrgMember();
        invited.setOrgId(acme.getId());
        invited.setRole(OrgRole.MEMBER);
        invited.setStatus(OrgMemberStatus.INVITED);
        invited.setInviteEmail("later@example.org");
        members.saveAndFlush(invited);
        Organization other = fx.org("other", OrgStatus.ACTIVE);
        fx.seat(other, "sam", OrgRole.MEMBER, OrgMemberStatus.LEFT);
        Organization third = fx.org("third", OrgStatus.ACTIVE);
        fx.seat(third, "sam", OrgRole.MEMBER, OrgMemberStatus.SUSPENDED);

        listMine("sam").andExpect(jsonPath("$.length()").value(2)).andExpect(jsonPath("$[0].org.slug").value("acme")).andExpect(jsonPath("$[1].org.slug").value("third")).andExpect(jsonPath("$[1].canChangeScope").value(false));
        fx.user("stranger");
        listMine("stranger").andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(0));
    }

    // ---- PUT /api/me/orgs/{orgId}/share ---------------------------------------------------------------------------

    @Test
    void changingWhatIShareIsImmediateWritesOneEventAndOneAuditRowAndIsIdempotent() throws Exception {
        share("sam", acme, body("SUMMARY")).andExpect(status().isOk());
        assertThat(dataShare.scopeOf(acme.getId(), sam.getId())).isEqualTo(ShareScope.SUMMARY);
        long auditBefore = audit.countByOrgId(acme.getId());

        share("sam", acme, body("NONE")).andExpect(status().isOk()).andExpect(jsonPath("$.scope").value("NONE")).andExpect(jsonPath("$.sees.length()").value(2)).andExpect(jsonPath("$.scopeChangedAt").isNotEmpty());
        assertThat(dataShare.scopeOf(acme.getId(), sam.getId())).as("the very next request sees NONE").isEqualTo(ShareScope.NONE);
        assertThat(audit.countByOrgId(acme.getId()) - auditBefore).isEqualTo(1);
        assertThat(OrgAuditAsserts.rows(audit, acme.getId()).get(0).getAction()).isEqualTo(OrgAuditService.SHARE_SCOPE_CHANGED);
        var history = events.findByOrgIdAndMemberLoginOrderByIdAsc(acme.getId(), "sam");
        assertThat(history).extracting(e -> e.getReason() + ":" + e.getFromScope() + ">" + e.getToScope()).containsExactly("JOIN:NONE>SUMMARY", "MEMBER_CHANGE:SUMMARY>NONE");

        share("sam", acme, body("NONE")).andExpect(status().isOk()); // nothing changed: nothing recorded
        assertThat(audit.countByOrgId(acme.getId()) - auditBefore).isEqualTo(1);
        assertThat(events.countByOrgId(acme.getId())).isEqualTo(2);

        share("sam", acme, body("SUMMARY")).andExpect(status().isOk()).andExpect(jsonPath("$.scope").value("SUMMARY")); // as easy to give back
        assertThat(dataShare.scopeOf(acme.getId(), sam.getId())).isEqualTo(ShareScope.SUMMARY);
    }

    @Test
    void fullIsOnlyForANamedActiveMarketerAndStopsTheMomentTheMemberSaysSo() throws Exception {
        share("sam", acme, body("FULL")).andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.field").value("fullToMemberId"));
        share("sam", acme, "{\"scope\":\"FULL\",\"consentVersion\":\"" + V1 + "\",\"fullToMemberId\":" + owner.getId() + "}").andExpect(status().isUnprocessableEntity()); // an owner holds no FULL
        share("sam", acme, "{\"scope\":\"FULL\",\"consentVersion\":\"" + V1 + "\",\"fullToMemberId\":" + sam.getId() + "}").andExpect(status().isUnprocessableEntity()); // not yourself
        share("sam", acme, "{\"scope\":\"SUMMARY\",\"consentVersion\":\"" + V1 + "\",\"fullToMemberId\":" + rahul.getId() + "}").andExpect(status().isUnprocessableEntity()); // a person only with FULL
        assertThat(shares.findByOrgIdAndMemberId(acme.getId(), sam.getId())).isEmpty();

        share("sam", acme, "{\"scope\":\"FULL\",\"consentVersion\":\"" + V1 + "\",\"fullToMemberId\":" + rahul.getId() + "}")
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.scope").value("FULL"))
            .andExpect(jsonPath("$.fullTo.memberId").value(rahul.getId()))
            .andExpect(jsonPath("$.fullTo.name").value("Rahul Shah"))
            .andExpect(jsonPath("$.sees.length()").value(12));
        assertThat(resumeSharing.isFullPairedViewer("sam", "rahul")).isTrue();

        share("sam", acme, body("SUMMARY")).andExpect(status().isOk()).andExpect(jsonPath("$.fullTo").doesNotExist());
        assertThat(resumeSharing.isFullPairedViewer("sam", "rahul")).as("revoked on the very next call").isFalse();
    }

    @Test
    void anUnknownConsentVersionOrAMissingScopeIsRefusedAndNothingChanges() throws Exception {
        share("sam", acme, "{\"scope\":\"SUMMARY\",\"consentVersion\":\"org-share/v42\"}").andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.field").value("consentVersion"));
        share("sam", acme, "{\"consentVersion\":\"" + V1 + "\"}").andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.field").value("scope"));
        assertThat(shares.findByOrgIdAndMemberId(acme.getId(), sam.getId())).isEmpty();
    }

    @Test
    void onlyAnActiveMemberOfThatOrgCanChangeItAndEveryoneElseGetsTheSame404() throws Exception {
        fx.user("stranger");
        share("stranger", acme, body("NONE")).andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("NOT_FOUND"));
        Organization third = fx.org("third", OrgStatus.ACTIVE);
        fx.seat(third, "sam", OrgRole.MEMBER, OrgMemberStatus.SUSPENDED);
        share("sam", third, body("NONE")).andExpect(status().isNotFound());
        mockMvc.perform(put("/api/me/orgs/999999999/share").with(user("sam")).contentType(MediaType.APPLICATION_JSON).content(body("NONE"))).andExpect(status().isNotFound());
        mockMvc.perform(put("/api/me/orgs/abc/share").with(user("sam")).contentType(MediaType.APPLICATION_JSON).content(body("NONE"))).andExpect(status().isNotFound());
        // signed out is a 401, as for every API route
        mockMvc.perform(put("/api/me/orgs/" + acme.getId() + "/share").contentType(MediaType.APPLICATION_JSON).content(body("NONE"))).andExpect(status().isUnauthorized());
    }

    @Test
    void aClosedOrgDoesNotLetMeShareMoreButLetsMeShareLess() throws Exception {
        share("sam", acme, body("SUMMARY")).andExpect(status().isOk());
        acme.setStatus(OrgStatus.CLOSED);
        orgs.saveAndFlush(acme);
        share("sam", acme, body("NONE")).andExpect(status().isOk());
        share("sam", acme, body("SUMMARY")).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("ORG_NOT_EDITABLE"));
    }

    // ---- POST /api/me/orgs/{orgId}/leave --------------------------------------------------------------------------

    @Test
    void leavingEndsAllSharingDeletesNothingAndTheOrgDisappearsFromMyList() throws Exception {
        share("sam", acme, body("SUMMARY")).andExpect(status().isOk());
        long auditBefore = audit.countByOrgId(acme.getId());

        leave("sam", acme).andExpect(status().isNoContent());

        OrgMember seat = members.findByOrgIdAndId(acme.getId(), sam.getId()).orElseThrow();
        assertThat(seat.getStatus()).isEqualTo(OrgMemberStatus.LEFT);
        assertThat(seat.getLeftAt()).isNotNull().isBeforeOrEqualTo(Instant.now());
        assertThat(seat.getUserId()).as("the person stays recognisable if re-invited").isNotNull();
        assertThat(dataShare.scopeOf(acme.getId(), sam.getId())).isEqualTo(ShareScope.NONE);
        assertThat(shares.findByOrgIdAndMemberId(acme.getId(), sam.getId()).orElseThrow().getScope()).isEqualTo(ShareScope.NONE);
        var history = events.findByOrgIdAndMemberLoginOrderByIdAsc(acme.getId(), "sam");
        assertThat(history.get(history.size() - 1).getReason()).isEqualTo("MEMBER_LEFT");
        assertThat(history.get(history.size() - 1).getActor()).isEqualTo("MEMBER");
        assertThat(audit.countByOrgId(acme.getId()) - auditBefore).isEqualTo(1);
        assertThat(OrgAuditAsserts.rows(audit, acme.getId()).get(0).getAction()).isEqualTo(OrgAuditService.MEMBER_LEFT);

        listMine("sam").andExpect(jsonPath("$.length()").value(0));
        leave("sam", acme).andExpect(status().isNotFound()); // a departed seat is no longer anyone's to act on
        share("sam", acme, body("SUMMARY")).andExpect(status().isNotFound());
    }

    @Test
    void anOwnerMustTransferFirstAndALeavingMarketerEndsTheSharesThatNamedThem() throws Exception {
        leave("own", acme).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("OWNER_MUST_TRANSFER"));
        assertThat(members.findByOrgIdAndId(acme.getId(), owner.getId()).orElseThrow().getStatus()).isEqualTo(OrgMemberStatus.ACTIVE);

        share("sam", acme, "{\"scope\":\"FULL\",\"consentVersion\":\"" + V1 + "\",\"fullToMemberId\":" + rahul.getId() + "}").andExpect(status().isOk());
        leave("rahul", acme).andExpect(status().isNoContent());
        assertThat(dataShare.scopeOf(acme.getId(), sam.getId())).as("sam falls back to a summary").isEqualTo(ShareScope.SUMMARY);
        assertThat(resumeSharing.isFullPairedViewer("sam", "rahul")).isFalse();
    }

    @Test
    void anOrgThatSwitchedOffSelfLeaveRefusesItsMembersButNotItsAdmins() throws Exception {
        mockMvc.perform(patch("/api/orgs/" + acme.getId()).with(user("own")).contentType(MediaType.APPLICATION_JSON).content("{\"settings\":{\"allowSelfLeave\":false}}")).andExpect(status().isOk());
        listMine("sam").andExpect(jsonPath("$[0].canLeave").value(false));
        leave("sam", acme).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("LEAVE_NOT_ALLOWED"));
        fx.active(acme, "adm", OrgRole.ADMIN);
        leave("adm", acme).andExpect(status().isNoContent());
    }
}
