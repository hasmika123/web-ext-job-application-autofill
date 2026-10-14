package com.dossier.api.service.ent.jobs;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.ent.OrgSetting;
import com.dossier.api.domain.ent.talent.ClientRequirement;
import com.dossier.api.repository.ent.OrgSettingRepository;
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.ent.jobs.JobDetailMapper.MinimalJob;
import com.dossier.api.service.ent.jobs.JobDetailMapper.View;
import com.dossier.api.service.settings.EnterpriseSettingKeys;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.json.JsonMapper;
import java.lang.reflect.RecordComponent;
import java.time.LocalDate;
import java.util.Arrays;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;

/** One mapper, two controls (doc 60 section 10): the lower of the stored level and the cap, and no FULL-only field in what a MINIMAL job shows. */
class JobDetailMapperTest {

    static ClientRequirement fullJob() {
        ClientRequirement j = new ClientRequirement();
        j.setId(55L);
        j.setOrgId(7L);
        j.setClientId(3L);
        j.setTitle("Senior Java Engineer");
        j.setDescriptionText("SECRET-MARKETER-SUMMARY");
        j.setLocation("Austin, TX");
        j.setWorkMode("HYBRID");
        j.setEmploymentLabel("Contract");
        j.setRateMinMinor(7000L);
        j.setRateMaxMinor(8000L);
        j.setRateUnit("HOUR");
        j.setPayLabel("$70-80/hr");
        j.setJobUrl("https://boards.greenhouse.io/acme/jobs/1");
        j.setAtsPlatform("greenhouse");
        j.setExternalJobId("1");
        j.setPostedOn(LocalDate.parse("2026-10-10"));
        j.setCapturePayloadHash("a".repeat(64));
        j.setExtensionVersion("1.0.0");
        j.setOwnerMemberId(9L);
        j.setContactId(77L);
        return j;
    }

    // ---- the level -------------------------------------------------------------------------------------------------------------

    @Test
    void theEffectiveLevelIsTheLowerOfTheRowAndTheCap() {
        assertThat(JobDetailMapper.effectiveLevel("MINIMAL", "MINIMAL")).isEqualTo("MINIMAL");
        assertThat(JobDetailMapper.effectiveLevel("MINIMAL", "FULL")).isEqualTo("MINIMAL");
        assertThat(JobDetailMapper.effectiveLevel("FULL", "MINIMAL")).isEqualTo("MINIMAL");
        assertThat(JobDetailMapper.effectiveLevel("FULL", "FULL")).isEqualTo("FULL");
    }

    @Test
    void anythingUnrecognisedFailsTowardsMinimal() {
        assertThat(JobDetailMapper.effectiveLevel(null, "FULL")).isEqualTo("MINIMAL");
        assertThat(JobDetailMapper.effectiveLevel("FULL", null)).isEqualTo("MINIMAL");
        assertThat(JobDetailMapper.effectiveLevel("full", "FULL")).isEqualTo("MINIMAL");
        assertThat(JobDetailMapper.effectiveLevel("EXTRA", "EXTRA")).isEqualTo("MINIMAL");
    }

    // ---- the field set ------------------------------------------------------------------------------------------------------------

    @Test
    void theMinimalSetIsTheContractsFields() {
        MinimalJob m = JobDetailMapper.minimalJobFields(fullJob(), "Acme Corp", List.of("Java", "Spring"));
        assertThat(m.id()).isEqualTo(55L);
        assertThat(m.title()).isEqualTo("Senior Java Engineer");
        assertThat(m.employer()).isEqualTo("Acme Corp");
        assertThat(m.location()).isEqualTo("Austin, TX");
        assertThat(m.workMode()).isEqualTo("HYBRID");
        assertThat(m.employmentType()).isEqualTo("Contract");
        assertThat(m.payLabel()).isEqualTo("$70-80/hr");
        assertThat(m.payMinMinor()).isEqualTo(7000L);
        assertThat(m.payMaxMinor()).isEqualTo(8000L);
        assertThat(m.payPeriod()).isEqualTo("HOUR");
        assertThat(m.jobUrl()).isEqualTo("https://boards.greenhouse.io/acme/jobs/1");
        assertThat(m.atsPlatform()).isEqualTo("greenhouse");
        assertThat(m.externalJobId()).isEqualTo("1");
        assertThat(m.postedOn()).isEqualTo(LocalDate.parse("2026-10-10"));
        assertThat(m.skills()).containsExactly("Java", "Spring");
    }

    @Test
    void theOneArgumentFormLeavesEmployerAndSkillsForTheCallerToJoin() {
        MinimalJob m = JobDetailMapper.minimalJobFields(fullJob());
        assertThat(m.employer()).isNull();
        assertThat(m.skills()).isEmpty();
        assertThat(JobDetailMapper.minimalJobFields(fullJob(), "Acme", null).skills()).isEmpty();
    }

    @Test
    void noFullOnlyFieldNameExistsInTheMinimalSet() {
        List<String> names = Arrays.stream(MinimalJob.class.getRecordComponents()).map(RecordComponent::getName).toList();
        assertThat(names).doesNotContainAnyElementsOf(JobDetailMapper.FULL_ONLY_FIELDS);
        assertThat(names).containsExactlyInAnyOrder(
            "id", "title", "employer", "location", "workMode", "employmentType", "payLabel", "payMinMinor", "payMaxMinor", "payPeriod", "currency", "jobUrl", "atsPlatform",
            "externalJobId", "postedOn", "skills"
        );
    }

    @Test
    void noJobTextOrInternalFieldSurvivesIntoTheJson() throws Exception {
        ObjectMapper json = JsonMapper.builder().addModule(new com.fasterxml.jackson.datatype.jsr310.JavaTimeModule()).build();
        String out = json.writeValueAsString(JobDetailMapper.view(fullJob(), "Acme Corp", List.of("Java"), "MINIMAL"));
        assertThat(out).doesNotContain("SECRET-MARKETER-SUMMARY").doesNotContain("descriptionText").doesNotContain("description").doesNotContain("capturePayloadHash")
            .doesNotContain("ownerMemberId").doesNotContain("contactId").doesNotContain("extensionVersion").doesNotContain("77");
        for (String f : JobDetailMapper.FULL_ONLY_FIELDS) assertThat(out).as("field %s", f).doesNotContain("\"" + f + "\"");
        assertThat(out).contains("\"detailLevel\":\"MINIMAL\"").contains("\"title\":\"Senior Java Engineer\"").contains("\"jobUrl\"");
    }

    @Test
    void aFullRowUnderAMinimalCapIsShownAsMinimalAndAMinimalRowUnderAFullCapToo() {
        ClientRequirement j = fullJob();
        j.setDetailLevel("FULL");
        View capped = JobDetailMapper.view(j, "Acme", List.of(), "MINIMAL");
        assertThat(capped.detailLevel()).isEqualTo("MINIMAL");
        View both = JobDetailMapper.view(j, "Acme", List.of(), "FULL");
        assertThat(both.detailLevel()).isEqualTo("FULL");
        j.setDetailLevel("MINIMAL");
        assertThat(JobDetailMapper.view(j, "Acme", List.of(), "FULL").detailLevel()).isEqualTo("MINIMAL");
        // the same fields today: FULL-only fields do not exist yet (Phase 2)
        assertThat(both.job()).isEqualTo(JobDetailMapper.minimalJobFields(j, "Acme", List.of()));
    }

    @Test
    void aNewJobDefaultsToMinimalAndManualEntry() {
        ClientRequirement j = new ClientRequirement();
        assertThat(j.getDetailLevel()).isEqualTo("MINIMAL");
        assertThat(j.getCaptureMethod()).isEqualTo("MANUAL_ENTRY");
    }

    // ---- the cap setting ----------------------------------------------------------------------------------------------------------

    @Test
    void theSettingIsDeclaredLiveAsAnEnumThatDefaultsToMinimal() {
        var key = EnterpriseSettingKeys.find(EnterpriseSettingKeys.JOBS_DETAIL_CAP);
        assertThat(key).isNotNull();
        assertThat(key.key()).isEqualTo("enterprise.jobs.detail_cap");
        assertThat(key.defaultValue()).isEqualTo("MINIMAL");
        assertThat(key.type().name()).isEqualTo("ENUM");
        assertThat(key.allowed()).containsExactly("MINIMAL", "FULL");
        assertThat(EnterpriseSettingKeys.all()).contains(key);
        assertThat(EnterpriseSettingKeys.deferred()).doesNotContain(key);
    }

    @Test
    void theCapComesFromTheOrganizationThenThePlatformThenMinimal() {
        OrgSettingRepository org = mock(OrgSettingRepository.class);
        ResumeBuilderSettings platform = mock(ResumeBuilderSettings.class);
        JobDetailCap cap = new JobDetailCap(org, platform);
        when(platform.getString(EnterpriseSettingKeys.JOBS_DETAIL_CAP)).thenReturn("MINIMAL");
        when(org.findByOrgIdAndSettingKey(any(), eq(EnterpriseSettingKeys.JOBS_DETAIL_CAP))).thenReturn(Optional.empty());

        assertThat(cap.capFor(7L)).isEqualTo("MINIMAL");

        when(platform.getString(EnterpriseSettingKeys.JOBS_DETAIL_CAP)).thenReturn("FULL");
        assertThat(cap.capFor(7L)).isEqualTo("FULL");

        when(org.findByOrgIdAndSettingKey(7L, EnterpriseSettingKeys.JOBS_DETAIL_CAP)).thenReturn(Optional.of(override("\"MINIMAL\"")));
        assertThat(cap.capFor(7L)).isEqualTo("MINIMAL"); // the organization narrows the platform's FULL
        assertThat(cap.capFor(8L)).isEqualTo("FULL"); // another organization keeps the platform value

        when(org.findByOrgIdAndSettingKey(7L, EnterpriseSettingKeys.JOBS_DETAIL_CAP)).thenReturn(Optional.of(override("FULL")));
        assertThat(cap.capFor(7L)).isEqualTo("FULL");
    }

    @Test
    void aMalformedValueFallsBackAndEndsAtMinimal() {
        OrgSettingRepository org = mock(OrgSettingRepository.class);
        ResumeBuilderSettings platform = mock(ResumeBuilderSettings.class);
        JobDetailCap cap = new JobDetailCap(org, platform);
        when(org.findByOrgIdAndSettingKey(7L, EnterpriseSettingKeys.JOBS_DETAIL_CAP)).thenReturn(Optional.of(override("{\"x\":1}")));
        when(platform.getString(EnterpriseSettingKeys.JOBS_DETAIL_CAP)).thenReturn("FULL");
        assertThat(cap.capFor(7L)).isEqualTo("FULL"); // the bad override is ignored, the platform value applies
        when(platform.getString(EnterpriseSettingKeys.JOBS_DETAIL_CAP)).thenReturn("EVERYTHING");
        assertThat(cap.capFor(7L)).isEqualTo("MINIMAL");
        when(platform.getString(EnterpriseSettingKeys.JOBS_DETAIL_CAP)).thenThrow(new IllegalStateException("settings down"));
        assertThat(cap.capFor(7L)).isEqualTo("MINIMAL");
        assertThat(cap.capFor(null)).isEqualTo("MINIMAL");
    }

    private static OrgSetting override(String json) {
        OrgSetting s = new OrgSetting();
        s.setOrgId(7L);
        s.setSettingKey(EnterpriseSettingKeys.JOBS_DETAIL_CAP);
        s.setValueJson(json);
        return s;
    }
}
