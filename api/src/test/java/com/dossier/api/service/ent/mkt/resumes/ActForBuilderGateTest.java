package com.dossier.api.service.ent.mkt.resumes;

import static org.assertj.core.api.Assertions.assertThat;

import com.dossier.api.domain.User;
import com.dossier.api.service.dto.ResumeBuilderConfigDTO;
import com.dossier.api.service.ent.TenantContext;
import com.dossier.api.service.ent.TenantContextHolder;
import com.dossier.api.service.ent.resumes.OrgResumePolicy;
import com.dossier.api.service.resume.ResumeActAs;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

/** The act-for allow-list and the capabilities of each mode: what the web hides is exactly what the API refuses. */
class ActForBuilderGateTest {

    @AfterEach
    void clear() {
        TenantContextHolder.clear();
    }

    @Test
    void onlyTheEditingRoutesOfTheNamedResumeAreAllowed() {
        for (String ok : new String[] { "GET /doc", "PUT /doc", "PATCH /doc/template", "PATCH /doc/theme", "GET /meta", "GET /lineage", "GET /doc/versions", "GET /doc/versions/3/text", "GET /doc/pdf-status", "POST /doc/pdf-now" }) {
            String[] p = ok.split(" ");
            assertThat(ActForBuilderGate.allows(p[0], "/api/profile/resumes/42" + p[1], 42L)).as(ok).isTrue();
            assertThat(ActForBuilderGate.allows(p[0], "/api/profile/resumes/42" + p[1], 43L)).as(ok + " of another resume").isFalse();
        }
        assertThat(ActForBuilderGate.allows("GET", "/api/profile/resume-builder/config", 42L)).isTrue();
    }

    @Test
    void sharingDeleteSetPrimaryCheckpointsRestoresAiAndTheOriginalAreNeverAllowed() {
        assertThat(ActForBuilderGate.allows("POST", "/api/profile/resumes/42/access/link", 42L)).isFalse();
        assertThat(ActForBuilderGate.allows("POST", "/api/profile/resumes/42/access", 42L)).isFalse();
        assertThat(ActForBuilderGate.allows("DELETE", "/api/profile/resumes/42", 42L)).isFalse();
        assertThat(ActForBuilderGate.allows("PATCH", "/api/profile/resumes/42/meta", 42L)).isFalse();
        assertThat(ActForBuilderGate.allows("POST", "/api/profile/resumes/42/doc/checkpoint", 42L)).isFalse();
        assertThat(ActForBuilderGate.allows("POST", "/api/profile/resumes/42/doc/versions/1/restore", 42L)).isFalse();
        assertThat(ActForBuilderGate.allows("POST", "/api/profile/resumes/42/ai/rewrite", 42L)).isFalse();
        assertThat(ActForBuilderGate.allows("GET", "/api/profile/resumes/42/original", 42L)).isFalse();
        assertThat(ActForBuilderGate.allows("POST", "/api/profile/resumes/built", 42L)).isFalse();
        assertThat(ActForBuilderGate.allows("GET", "/api/profile/resumes/42/doc/../access", 42L)).isFalse();
    }

    @Test
    void capabilitiesFollowTheModeOfTheRequest() {
        assertThat(OrgResumePolicy.mode()).isEqualTo(OrgResumePolicy.Mode.PERSONAL);
        ResumeBuilderConfigDTO.Capabilities personal = OrgResumePolicy.capabilities();
        assertThat(personal.mode()).isEqualTo("personal");
        assertThat(personal.shareLinks() && personal.deleteResume() && personal.archiveResume() && personal.setPrimary() && personal.ai()).isTrue();

        TenantContextHolder.set(TenantContext.tenant(5L, null, "acme.kiwiply.com"));
        ResumeBuilderConfigDTO.Capabilities consultant = OrgResumePolicy.capabilities();
        assertThat(consultant.mode()).isEqualTo("consultant");
        assertThat(consultant.shareLinks() || consultant.deleteResume() || consultant.archiveResume() || consultant.setPrimary() || consultant.ai() || consultant.tailor()).isFalse();
        assertThat(consultant.rename() && consultant.versionRestore() && consultant.downloadOriginal()).isTrue();

        User owner = new User();
        owner.setLogin("consultant");
        ResumeBuilderConfigDTO.Capabilities actFor = ResumeActAs.run(owner, new ResumeActAs.Scope(5L, "marketer", 1L), OrgResumePolicy::capabilities);
        assertThat(actFor.mode()).isEqualTo("marketer-act-for");
        assertThat(actFor.approvalNotice()).isEqualTo("Pending consultant approval");
        assertThat(actFor.shareLinks() || actFor.deleteResume() || actFor.archiveResume() || actFor.setPrimary() || actFor.rename() || actFor.versionRestore() || actFor.downloadOriginal() || actFor.ai() || actFor.tailor()).isFalse();
    }
}
