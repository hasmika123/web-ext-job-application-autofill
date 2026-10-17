package com.dossier.api.web.rest.ent;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.ent.OrgSetting;
import com.dossier.api.domain.ent.talent.ClientAccount;
import com.dossier.api.domain.ent.talent.ClientRequirement;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.ent.OrgSettingRepository;
import com.dossier.api.repository.ent.talent.ClientAccountRepository;
import com.dossier.api.repository.ent.talent.ClientRequirementRepository;
import com.dossier.api.repository.ent.talent.ConsultantProfileRepository;
import com.dossier.api.service.settings.EnterpriseSettingKeys;
import java.time.Duration;
import java.time.Instant;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;

/**
 * Record time of the duplicate-submission guard (Sprint 2 / B1, X8.8): adding an application for the same role through another vendor is a 409
 * {@code DUPLICATE_WARNING} until the caller confirms with a reason (audited), BLOCK refuses it, the very same job still answers
 * {@code DUPLICATE_APPLICATION}, and another organization's applications never count. Two organizations from {@link MemberItSupport}.
 */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
class PipelineGuardApplicationsIT extends MemberItSupport {

    @Autowired private ConsultantProfileRepository consultants;
    @Autowired private ClientAccountRepository clients;
    @Autowired private ClientRequirementRepository requirements;
    @Autowired private OrgSettingRepository orgSettings;

    private ConsultantProfile consultant;
    private ConsultantProfile bConsultant;
    private final String title = "Quality Engineer " + System.nanoTime();

    @BeforeEach
    void world() {
        consultant = consultant(a, "Kay One");
        bConsultant = consultant(b, "Bea One");
    }

    private ConsultantProfile consultant(Organization org, String name) {
        ConsultantProfile c = new ConsultantProfile();
        c.setOrgId(org.getId());
        c.setDisplayName(name);
        c.setEmail(name.toLowerCase().replace(' ', '.') + "@example.org");
        c.setStatus("ACTIVE");
        c.setJobTitle("Engineer");
        c.setCreatedAt(Instant.now().minus(Duration.ofDays(30)));
        return consultants.saveAndFlush(c);
    }

    private Long job(Organization org, String client, String jobTitle) {
        ClientAccount c = new ClientAccount();
        c.setOrgId(org.getId());
        c.setName(client + " " + System.nanoTime());
        c = clients.saveAndFlush(c);
        ClientRequirement r = new ClientRequirement();
        r.setOrgId(org.getId());
        r.setClientId(c.getId());
        r.setTitle(jobTitle);
        r.setLocation("Austin, TX");
        return requirements.saveAndFlush(r).getId();
    }

    private MvcResult add(Organization org, ConsultantProfile c, Long jobId, String extra) throws Exception {
        return call(login(org == a ? "owner" : "bowner"), post("/api/orgs/" + org.getId() + "/applications"),
            "{\"requirementId\":" + jobId + ",\"consultantId\":" + c.getId() + (extra == null ? "" : "," + extra) + "}", null, key());
    }

    @Test
    void theSameRoleThroughAnotherVendorIsAWarningThenGoesAheadWithAReasonAndIsAudited() throws Exception {
        assertStatus(add(a, consultant, job(a, "TekVendor", title), null), 201);
        Long again = job(a, "Globex", title);

        MvcResult warned = add(a, consultant, again, null);
        assertCode(warned, 409, "DUPLICATE_WARNING");
        assertThat(warned.getResponse().getContentAsString()).contains("VENDOR_CHAIN").contains("another vendor");
        assertThat(auditCount(a, "PIPELINE_DUPLICATE_OVERRIDE")).isZero();
        long applications = auditCount(a, "APPLICATION_CREATE");

        assertStatus(add(a, consultant, again, "\"confirmDuplicate\":true"), 400); // a reason is required
        assertStatus(add(a, consultant, again, "\"confirmDuplicate\":true,\"duplicateReason\":\"Both vendors asked for her\""), 201);
        assertThat(auditCount(a, "PIPELINE_DUPLICATE_OVERRIDE")).isEqualTo(1);
        assertThat(auditCount(a, "APPLICATION_CREATE")).isEqualTo(applications + 1);
    }

    @Test
    void theBlockPolicyRefusesEvenWithAConfirmation() throws Exception {
        OrgSetting block = new OrgSetting();
        block.setOrgId(a.getId());
        block.setSettingKey(EnterpriseSettingKeys.ORG_PIPELINE_DUPLICATE_POLICY);
        block.setValueJson("\"BLOCK\"");
        orgSettings.saveAndFlush(block);
        assertStatus(add(a, consultant, job(a, "TekVendor", title), null), 201);
        assertCode(add(a, consultant, job(a, "Globex", title), "\"confirmDuplicate\":true,\"duplicateReason\":\"Please\""), 409, "DUPLICATE_BLOCKED");
        assertThat(auditCount(a, "PIPELINE_DUPLICATE_OVERRIDE")).isZero();
    }

    @Test
    void theVeryJobStillAnswersDuplicateApplication() throws Exception {
        Long j = job(a, "TekVendor", title);
        assertStatus(add(a, consultant, j, null), 201);
        assertCode(add(a, consultant, j, null), 409, "DUPLICATE_APPLICATION");
    }

    @Test
    void aDifferentRoleIsNotADuplicate() throws Exception {
        assertStatus(add(a, consultant, job(a, "TekVendor", title), null), 201);
        assertStatus(add(a, consultant, job(a, "Globex", "Completely Different " + System.nanoTime()), null), 201);
    }

    @Test
    void anotherOrganizationsApplicationsNeverCount() throws Exception {
        assertStatus(add(b, bConsultant, job(b, "TekVendor", title), null), 201);
        assertStatus(add(a, consultant, job(a, "Globex", title), null), 201); // the same role, in Acme: nothing to warn about
        // and the owner of A cannot add an application for B's consultant on B's path
        assertThat(add(b, consultant, job(b, "Globex", title), null).getResponse().getStatus()).isEqualTo(404);
    }
}
