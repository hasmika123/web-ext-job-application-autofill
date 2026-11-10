package com.dossier.api.web.rest.ent;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.AppSetting;
import com.dossier.api.domain.Application;
import com.dossier.api.domain.ApplicationEvent;
import com.dossier.api.domain.User;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.ent.talent.MarketerAssignment;
import com.dossier.api.domain.enumeration.ApplicationStatus;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.org.OrgAuditEvent;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.repository.ApplicationEventRepository;
import com.dossier.api.repository.ApplicationRepository;
import com.dossier.api.service.ent.tracker.SaveForConsultantService;
import com.dossier.api.service.ent.tracker.SaveForConsultantService.Request;
import com.dossier.api.service.org.OrgAccessService;
import com.dossier.api.service.org.OrgAuditAsserts;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import com.dossier.api.service.settings.EnterpriseSettingKeys;
import com.dossier.api.service.tracker.TrackerActAs;
import com.fasterxml.jackson.databind.JsonNode;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.data.domain.PageRequest;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;

/**
 * X9.15: a marketer saves a job onto an assigned consultant's own tracker. The application is the consultant's, the history names the marketer as the actor
 * and the consultant as {@code on_behalf_of}, the marketer's own tracker is untouched, the org audit trail gets a row, and EVERY refusal (unassigned,
 * foreign organization, foreign member id, a seat that is not active, a caller without the permission, the marketing module off) is the generic 404 with
 * nothing written. The world is {@link MemberItSupport}'s: Sam (mktSpec, ASSIGNED scope) is assigned to Anita (c2); Anika (c1) is not assigned to anyone.
 */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
@org.junit.jupiter.api.Timeout(180)
class SaveForConsultantIT extends MemberItSupport {

    @Autowired private SaveForConsultantService service;
    @Autowired private OrgAccessService access;
    @Autowired private ApplicationRepository applications;
    @Autowired private ApplicationEventRepository events;

    private ConsultantProfile anita;
    private ConsultantProfile anika;
    private Request job;

    @BeforeEach
    void world() {
        flags(true, true);
        marketing(true);
        anita = profile(c2, "Anita Rao");
        anika = profile(c1, "Anika Khan");
        MarketerAssignment ma = new MarketerAssignment();
        ma.setOrgId(a.getId());
        ma.setConsultantId(anita.getId());
        ma.setMarketerMemberId(mktSpec.getId());
        em.persist(ma);
        em.flush();
        job = new Request("Figma", "Product Designer", "https://boards.greenhouse.io/figma/jobs/" + p, "Remote", null, "greenhouse", null);
    }

    @AfterEach
    void signOut() {
        SecurityContextHolder.clearContext();
    }

    private ConsultantProfile profile(OrgMember seat, String name) {
        ConsultantProfile c = ApplicationItSupport.consultant(em, a.getId(), name);
        c.setMemberId(seat.getId());
        em.flush();
        return c;
    }

    private void marketing(boolean on) {
        settingRows.save(new AppSetting(EnterpriseSettingKeys.FLAG_MARKETING, "{\"on\":" + on + "}", WHO, Instant.now()));
        settingsCache.invalidate();
    }

    private OrgMembership signedInAs(OrgMember who, Long orgId) {
        SecurityContextHolder.getContext().setAuthentication(
            new UsernamePasswordAuthenticationToken(userOf(who).getLogin(), "n/a", List.of(new SimpleGrantedAuthority("ROLE_USER")))
        );
        return access.resolve(orgId).orElseThrow();
    }

    private User userOf(OrgMember seat) {
        return users.findById(seat.getUserId()).orElseThrow();
    }

    private List<Application> allApplications() {
        return applications.findAll().stream().filter(x -> x.getUser() != null && x.getUser().getLogin().startsWith(p + "-")).toList();
    }

    @Test
    void anAssignedMarketerSavesForTheConsultantAndTheHistoryNamesBoth() throws Exception {
        OrgMembership sam = signedInAs(mktSpec, a.getId());
        long auditBefore = auditCount(a);

        var saved = service.save(sam, c2.getId(), job);

        Application stored = applications.findById(saved.getId()).orElseThrow();
        User anitaUser = userOf(c2);
        User samUser = userOf(mktSpec);
        assertThat(stored.getUser().getId()).as("the application is the consultant's").isEqualTo(anitaUser.getId());
        assertThat(stored.getStatus()).isEqualTo(ApplicationStatus.SAVED);
        assertThat(stored.getSource()).isEqualTo("org");
        assertThat(stored.getCreatedByUserId()).isEqualTo(samUser.getId());
        assertThat(stored.getUpdatedByUserId()).isEqualTo(samUser.getId());

        ApplicationEvent e = events.findByApplicationIdOrderByCreatedAtDescIdDesc(stored.getId(), PageRequest.of(0, 5)).get(0);
        assertThat(e.getKind()).isEqualTo(ApplicationEvent.CREATED);
        assertThat(e.getActorKind()).isEqualTo("PERSON");
        assertThat(e.getActorUserId()).isEqualTo(samUser.getId());
        assertThat(e.getOnBehalfOfUserId()).isEqualTo(anitaUser.getId());
        assertThat(e.getSource()).isEqualTo(ApplicationEvent.SRC_WEB);

        assertThat(allApplications()).as("the marketer's own tracker is untouched").extracting(x -> x.getUser().getId()).containsOnly(anitaUser.getId());

        assertThat(auditCount(a)).isEqualTo(auditBefore + 1);
        OrgAuditEvent row = newestAudit(a);
        assertThat(row.getAction()).isEqualTo("MARKETER_SAVE_FOR_CONSULTANT");
        assertThat(row.getActorLogin()).isEqualTo(samUser.getLogin());
        assertThat(row.getBeneficiaryLogin()).isEqualTo(anitaUser.getLogin());
        assertThat(row.getRisk()).isEqualTo("MEDIUM");
        assertThat(row.getDetails()).doesNotContain("Figma").doesNotContain("greenhouse");

        // the consultant reads it back: named, never an enterprise login
        SecurityContextHolder.clearContext();
        MvcResult r = mockMvc.perform(get("/api/profile/applications/" + stored.getId()).with(user(anitaUser.getLogin()))).andReturn();
        assertThat(r.getResponse().getStatus()).isEqualTo(200);
        String body = r.getResponse().getContentAsString();
        assertThat(body).doesNotContain("ent#");
        JsonNode d = om.readTree(body);
        assertThat(d.at("/createdBy/label").asText()).isEqualTo("Sam Spec");
        assertThat(d.at("/events/0/actor/label").asText()).isEqualTo("Sam Spec");
        assertThat(d.at("/events/0/actorKind").asText()).isEqualTo("PERSON");
        assertThat(d.at("/events/0/onBehalfOf/userId").asLong()).isEqualTo(anitaUser.getId());
    }

    @Test
    void savingAJobTheConsultantAlreadyHasKeepsItsStatusAndSource() {
        User anitaUser = userOf(c2);
        Application mine = new Application();
        mine.setUser(anitaUser);
        mine.setCompany("Figma");
        mine.setRoleTitle("Product Designer");
        mine.setJobUrl(job.jobUrl());
        mine.setStatus(ApplicationStatus.APPLIED);
        mine.setSource("extension");
        mine.setArchived(false);
        mine.setCreatedAt(Instant.now());
        mine.setUpdatedAt(Instant.now());
        mine = applications.saveAndFlush(mine);

        service.save(signedInAs(mktSpec, a.getId()), c2.getId(), job);

        Application after = applications.findById(mine.getId()).orElseThrow();
        assertThat(after.getStatus()).as("a re-save never pulls an applied job back to saved").isEqualTo(ApplicationStatus.APPLIED);
        assertThat(after.getSource()).isEqualTo("extension");
        assertThat(allApplications()).hasSize(1);
    }

    @Test
    void everyRefusalIsTheGeneric404AndNothingIsWritten() {
        OrgMembership sam = signedInAs(mktSpec, a.getId());
        long auditBefore = auditCount(a);

        // a consultant that is not assigned to this marketer
        assertNotFound(() -> service.save(sam, c1.getId(), job), "unassigned consultant");
        // a seat of another organization, a member id that does not exist, nonsense ids
        assertNotFound(() -> service.save(sam, bMember.getId(), job), "another organization's member id");
        assertNotFound(() -> service.save(sam, 987654321L, job), "unknown member id");
        assertNotFound(() -> service.save(sam, 0L, job), "zero");
        assertNotFound(() -> service.save(sam, null, job), "null");
        // acting for yourself is just using your own tracker
        assertNotFound(() -> service.save(sam, mktSpec.getId(), job), "yourself");

        // the consultant's seat is no longer active
        OrgMember seat = members.findByOrgIdAndId(a.getId(), c2.getId()).orElseThrow();
        seat.setStatus(OrgMemberStatus.SUSPENDED);
        members.saveAndFlush(seat);
        assertNotFound(() -> service.save(sam, c2.getId(), job), "suspended consultant seat");
        seat.setStatus(OrgMemberStatus.ACTIVE);
        members.saveAndFlush(seat);

        // a paused assignment no longer gives sight of the consultant
        MarketerAssignment ma = em.createQuery("select m from MarketerAssignment m where m.orgId = :o and m.consultantId = :c", MarketerAssignment.class)
            .setParameter("o", a.getId()).setParameter("c", anita.getId()).getSingleResult();
        ma.setStatus("PAUSED");
        em.flush();
        assertNotFound(() -> service.save(sam, c2.getId(), job), "paused assignment");
        ma.setStatus("ACTIVE");
        em.flush();

        // the marketing module is off for the organization
        marketing(false);
        assertNotFound(() -> service.save(sam, c2.getId(), job), "marketing module off");
        marketing(true);

        // callers who do not hold member.act_for: the owner-free plain member, an HR specialist, the consultant themself
        for (OrgMember caller : List.of(plain, hr, c2)) {
            OrgMembership other = signedInAs(caller, a.getId());
            assertNotFound(() -> service.save(other, c2.getId(), job), "caller without member.act_for: " + userOf(caller).getLogin());
        }
        assertThat(allApplications()).as("nothing was written for anyone").isEmpty();
        assertThat(auditCount(a)).isEqualTo(auditBefore);
        assertThat(OrgAuditAsserts.rows(audit, a.getId())).extracting(OrgAuditEvent::getAction).doesNotContain("MARKETER_SAVE_FOR_CONSULTANT");
    }

    @Test
    void aMemberOfAnotherOrganizationCannotReachThisOrganizationsConsultant() {
        OrgMembership bobOfB = signedInAs(bOwner, b.getId());
        assertNotFound(() -> service.save(bobOfB, c2.getId(), job), "foreign organization's caller with a member id of A");
        assertThat(allApplications()).isEmpty();
    }

    @Test
    void theActingWindowIsClosedEvenWhenTheWriteFails() {
        OrgMembership sam = signedInAs(mktSpec, a.getId());
        // company and role are required: the existing create refuses the request after the window was opened
        assertThatThrownBy(() -> service.save(sam, c2.getId(), new Request(null, null, "https://example.test/x", null, null, null, null))).isInstanceOf(RuntimeException.class);

        assertThat(TrackerActAs.current()).isEmpty();
        assertThat(SecurityContextHolder.getContext().getAuthentication().getName()).as("the caller is restored, not the consultant").isEqualTo(userOf(mktSpec).getLogin());
        assertThat(allApplications()).isEmpty();
    }

    private static void assertNotFound(Runnable call, String why) {
        assertThatThrownBy(call::run).as(why).isInstanceOf(OrgNotFoundException.class);
    }
}
