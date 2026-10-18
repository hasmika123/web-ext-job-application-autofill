package com.dossier.api.web.rest.ent;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.AppSetting;
import com.dossier.api.domain.Application;
import com.dossier.api.domain.User;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.ent.talent.MarketerAssignment;
import com.dossier.api.domain.enumeration.ApplicationStatus;
import com.dossier.api.domain.org.OrgAuditEvent;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.repository.ApplicationRepository;
import com.dossier.api.service.settings.EnterpriseSettingKeys;
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
 * X9.12 (re-scoped): {@code POST /api/orgs/{orgId}/consultants/{memberId}/applications/save} through the real chain. An ASSIGNED marketer saves a job on the
 * consultant's tracker (status SAVED, never submitted, 'Updated by <marketer> on behalf of <consultant>'); the same posting twice is the same application;
 * an unassigned marketer, the consultant, a member without the permission, another organization's people and a module that is off are all the generic 404
 * with nothing written; a burst is rate limited. The world is {@link MemberItSupport}'s: Sam (marketing specialist, ASSIGNED scope) is assigned to Anita (c2).
 */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
@org.junit.jupiter.api.Timeout(240)
class SaveForConsultantResourceIT extends MemberItSupport {

    @Autowired private ApplicationRepository applications;

    private static final String JOB = "{\"company\":\"Figma\",\"roleTitle\":\"Product Designer\",\"jobUrl\":\"https://boards.greenhouse.io/figma/jobs/%s\",\"location\":\"Remote\",\"atsPlatform\":\"greenhouse\"}";

    private ConsultantProfile anita;
    private ConsultantProfile anika;

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

    private String url(com.dossier.api.domain.org.Organization org, OrgMember consultantSeat) {
        return "/api/orgs/" + org.getId() + "/consultants/" + consultantSeat.getId() + "/applications/save";
    }

    private User userOf(OrgMember seat) {
        return users.findById(seat.getUserId()).orElseThrow();
    }

    private List<Application> allApplications() {
        return applications.findAll().stream().filter(x -> x.getUser() != null && x.getUser().getLogin().startsWith(p + "-")).toList();
    }

    private String job() {
        return JOB.formatted(p);
    }

    @Test
    void anAssignedMarketerSavesAndTheConsultantSeesWhoDidItOnTheirBehalf() throws Exception {
        long auditBefore = auditCount(a);
        MvcResult r = call(login("spec"), post(url(a, c2)), job());
        assertStatus(r, 200);
        JsonNode saved = json(r);
        assertThat(saved.path("status").asText()).as("saved, never applied").isEqualTo("SAVED");
        assertThat(saved.path("alreadySaved").asBoolean()).isFalse();
        assertThat(saved.path("company").asText()).isEqualTo("Figma");
        assertThat(r.getResponse().getContentAsString()).as("nothing else of the consultant's tracker is returned").doesNotContain("notes").doesNotContain("jobDescription");

        Application stored = applications.findById(saved.path("applicationId").asLong()).orElseThrow();
        assertThat(stored.getUser().getId()).as("the application is the consultant's").isEqualTo(userOf(c2).getId());
        assertThat(stored.getStatus()).isEqualTo(ApplicationStatus.SAVED);
        assertThat(allApplications()).as("the marketer's own tracker is untouched").extracting(x -> x.getUser().getId()).containsOnly(userOf(c2).getId());

        assertThat(auditCount(a)).isEqualTo(auditBefore + 1);
        OrgAuditEvent row = newestAudit(a);
        assertThat(row.getAction()).isEqualTo("MARKETER_SAVE_FOR_CONSULTANT");
        assertThat(row.getActorLogin()).isEqualTo(userOf(mktSpec).getLogin());
        assertThat(row.getBeneficiaryLogin()).isEqualTo(userOf(c2).getLogin());

        // 'Updated by Sam Spec on behalf of Anita Rao', as the consultant's own tracker reports it
        MvcResult mine = mockMvc.perform(get("/api/profile/applications/" + stored.getId()).with(org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user(userOf(c2).getLogin()))).andReturn();
        assertStatus(mine, 200);
        JsonNode d = json(mine);
        assertThat(d.at("/updatedBy/label").asText()).isEqualTo("Sam Spec");
        assertThat(d.at("/events/0/actor/label").asText()).isEqualTo("Sam Spec");
        assertThat(d.at("/events/0/onBehalfOf/userId").asLong()).isEqualTo(userOf(c2).getId());
        assertThat(mine.getResponse().getContentAsString()).doesNotContain("ent#");
    }

    @Test
    void savingTheSamePostingTwiceIsOneApplicationAndNeverMovesItBeyondSaved() throws Exception {
        JsonNode first = json(call(login("spec"), post(url(a, c2)), job()));
        // a client cannot ask for a status: the request has none, and an unknown field changes nothing
        MvcResult again = call(login("spec"), post(url(a, c2)), job().replace("{", "{\"status\":\"APPLIED\","));
        assertStatus(again, 200);
        JsonNode second = json(again);
        assertThat(second.path("applicationId").asLong()).isEqualTo(first.path("applicationId").asLong());
        assertThat(second.path("alreadySaved").asBoolean()).isTrue();
        assertThat(second.path("status").asText()).isEqualTo("SAVED");
        assertThat(allApplications()).hasSize(1);
    }

    @Test
    void everyOtherCallerIsTheGeneric404AndNothingIsWritten() throws Exception {
        long auditBefore = auditCount(a);
        assertGeneric404(call(login("spec"), post(url(a, c1)), job()), "an unassigned consultant");
        assertGeneric404(call(login("spec"), post(url(a, mktSpec)), job()), "yourself");
        assertGeneric404(call(login("c2"), post(url(a, c2)), job()), "the consultant (not a marketer)");
        assertGeneric404(call(login("plain"), post(url(a, c2)), job()), "a plain member");
        assertGeneric404(call(login("hr"), post(url(a, c2)), job()), "an HR specialist");
        assertGeneric404(call(login("bowner"), post(url(a, c2)), job()), "another organization's owner on this organization's path");
        assertGeneric404(call(login("bowner"), post(url(b, c2)), job()), "another organization's owner with this organization's member id on their own path");
        assertGeneric404(call(login("spec"), post("/api/orgs/" + a.getId() + "/consultants/987654321/applications/save"), job()), "an id that does not exist");
        marketing(false);
        assertGeneric404(call(login("spec"), post(url(a, c2)), job()), "the marketing module is off");
        marketing(true);

        assertThat(allApplications()).as("nothing was written for anyone").isEmpty();
        assertThat(auditCount(a)).isEqualTo(auditBefore);
        assertThat(anika.getId()).isNotNull();
    }

    @Test
    void aRequestWithoutAJobIsRefusedAndWritesNothing() throws Exception {
        MvcResult r = call(login("spec"), post(url(a, c2)), "{\"company\":\"\",\"roleTitle\":\"\"}");
        assertThat(r.getResponse().getStatus()).isGreaterThanOrEqualTo(400).isLessThan(500);
        assertThat(allApplications()).isEmpty();
    }

    @Test
    void aBurstIsRateLimited() throws Exception {
        int ok = 0;
        MvcResult last = null;
        for (int i = 0; i < 40; i++) {
            last = call(login("spec"), post(url(a, c2)), job());
            if (last.getResponse().getStatus() == 200) ok++;
            else break;
        }
        assertThat(last).isNotNull();
        assertThat(last.getResponse().getStatus()).isEqualTo(429);
        assertThat(last.getResponse().getHeader("Retry-After")).isNotBlank();
        assertThat(ok).isEqualTo(SaveForConsultantResource.LIMIT);
        assertThat(allApplications()).as("the same posting every time: one application").hasSize(1);
    }
}
