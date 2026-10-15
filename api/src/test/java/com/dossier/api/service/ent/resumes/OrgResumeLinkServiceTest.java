package com.dossier.api.service.ent.resumes;

import static org.assertj.core.api.Assertions.assertThat;

import com.dossier.api.domain.ent.talent.OrgResume;
import org.junit.jupiter.api.Test;

class OrgResumeLinkServiceTest {

    @Test
    void yearsAreReadFromEveryDateShapeTheBuilderStores() {
        assertThat(OrgResumeLinkService.year("2019")).isEqualTo(2019);
        assertThat(OrgResumeLinkService.year("2019-03")).isEqualTo(2019);
        assertThat(OrgResumeLinkService.year("Jan 2020")).isEqualTo(2020);
        assertThat(OrgResumeLinkService.year("Present")).isNull();
        assertThat(OrgResumeLinkService.year("")).isNull();
        assertThat(OrgResumeLinkService.year(null)).isNull();
        assertThat(OrgResumeLinkService.year("12345")).as("not a year").isNull();
        assertThat(OrgResumeLinkService.year("1899")).isNull();
    }

    @Test
    void onlyAResumeAMarketerMadeThroughTheBuilderNeedsTheConsultant() {
        OrgResume made = new OrgResume();
        made.setKind("ORG_MANAGED");
        made.setResumeId(5L);
        assertThat(OrgResumeLinkService.requiresConsultantApproval(made)).isTrue();

        OrgResume own = new OrgResume();
        own.setKind("PERSONAL_SHARED");
        own.setResumeId(6L);
        assertThat(OrgResumeLinkService.requiresConsultantApproval(own)).isFalse();

        OrgResume metadataOnly = new OrgResume(); // the admin board's upload and every seeded row: the org admin approves those, as before
        metadataOnly.setKind("ORG_MANAGED");
        assertThat(OrgResumeLinkService.requiresConsultantApproval(metadataOnly)).isFalse();
        assertThat(OrgResumeLinkService.requiresConsultantApproval(null)).isFalse();
    }
}
