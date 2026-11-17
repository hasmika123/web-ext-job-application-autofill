package com.dossier.api.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.dossier.api.domain.AiCall;
import com.dossier.api.service.ai.AiTask;
import org.junit.jupiter.api.Test;

/** Gap D1: an enterprise account without AI on its licence is told to ask its admin; its AI calls are the organization's in the ledger. */
class EnterpriseAiRefusalTest {

    @Test
    void anEnterpriseAccountIsToldToAskItsAdminNeverToUpgrade() {
        ProRequiredException ent = ProRequiredException.forAi("ent#7#ana@acme.test", "The job-fit check is part of Pro");
        assertThat(ent.getCode()).isEqualTo(ProRequiredException.CODE_FEATURE_NOT_LICENSED);
        assertThat(ent.getMessage()).contains("organization's admin").doesNotContain("Pro").doesNotContainIgnoringCase("upgrade");
        assertThat(ent.getExtra()).containsEntry("canSelfServe", false);
    }

    @Test
    void aPersonalAccountStillHearsAboutPro() {
        ProRequiredException personal = ProRequiredException.forAi("jane", "The job-fit check is part of Pro");
        assertThat(personal.getCode()).isEqualTo(ProRequiredException.CODE_PRO_REQUIRED);
        assertThat(personal.getMessage()).isEqualTo("The job-fit check is part of Pro");
        assertThat(ProRequiredException.forAi(null, "x").getCode()).isEqualTo(ProRequiredException.CODE_PRO_REQUIRED);
    }

    @Test
    void anEnterpriseAccountsCallIsStampedAsItsOrganizations() {
        AiCall ent = new AiCall();
        AiMeteringService.stamp(ent, "ent#7#ana@acme.test", AiTask.FIT);
        assertThat(ent.getUsageScope()).isEqualTo("ORG");
        assertThat(ent.getOrgId()).isEqualTo(7L);
        assertThat(ent.getFeatureKey()).isNotNull();

        AiCall personal = new AiCall();
        AiMeteringService.stamp(personal, "jane", AiTask.FIT);
        assertThat(personal.getUsageScope()).isEqualTo("PERSONAL");
        assertThat(personal.getOrgId()).isNull();

        AiCall job = new AiCall();
        AiMeteringService.stamp(job, null, AiTask.FIT);
        assertThat(job.getUsageScope()).isNull();
        assertThat(job.getOrgId()).isNull();
    }
}
