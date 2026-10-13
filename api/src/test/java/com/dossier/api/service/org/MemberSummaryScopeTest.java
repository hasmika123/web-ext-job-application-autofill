package com.dossier.api.service.org;

import static org.assertj.core.api.Assertions.assertThat;

import com.dossier.api.domain.enumeration.ShareScope;
import com.dossier.api.service.dto.org.MemberSummaryDTO;
import java.util.EnumMap;
import java.util.Map;
import org.junit.jupiter.api.Test;

/** O6.1: the member summary shows exactly the fields the scope allows; a hidden field is absent, not null. */
class MemberSummaryScopeTest {

    private static Map<ShareField, Object> everything() {
        Map<ShareField, Object> all = new EnumMap<>(ShareField.class);
        for (ShareField f : ShareField.values()) all.put(f, "value-of-" + f.name());
        return all;
    }

    @Test
    void noneShowsOnlyTheSeat() {
        MemberSummaryDTO dto = MemberSummaryDTO.of(ShareScope.NONE, everything());
        assertThat(dto.shareScope()).isEqualTo(ShareScope.NONE);
        assertThat(dto.fields()).containsOnlyKeys("SEAT", "ACTIVATED");
    }

    @Test
    void summaryAddsCountsAndStatesButNeverEmployersOrDocuments() {
        MemberSummaryDTO dto = MemberSummaryDTO.of(ShareScope.SUMMARY, everything());
        assertThat(dto.fields()).containsOnlyKeys("SEAT", "ACTIVATED", "STAGE_COUNTS", "LAST_ACTIVITY", "RESUME_READINESS", "UPCOMING_INTERVIEW_COUNT", "PLACEMENT");
        assertThat(dto.fields()).doesNotContainKeys("EMPLOYER_DETAILS", "APPLICATION_DETAIL", "RESUMES", "INTERVIEW_CALENDAR", "JOB_ASSIGNMENTS", "PRIVATE_DATA");
    }

    @Test
    void fullAddsTheDetailButNeverThePrivateData() {
        MemberSummaryDTO dto = MemberSummaryDTO.of(ShareScope.FULL, everything());
        assertThat(dto.fields()).containsKeys("EMPLOYER_DETAILS", "APPLICATION_DETAIL", "RESUMES", "INTERVIEW_CALENDAR", "JOB_ASSIGNMENTS");
        assertThat(dto.fields()).doesNotContainKey("PRIVATE_DATA");
    }

    @Test
    void aVisibleFieldWithoutAValueIsPresentAndNullWhileAHiddenOneIsAbsent() {
        Map<ShareField, Object> some = new EnumMap<>(ShareField.class);
        some.put(ShareField.SEAT, "Aarav");
        some.put(ShareField.EMPLOYER_DETAILS, "Acme Corp"); // the caller handed over more than the scope allows
        MemberSummaryDTO dto = MemberSummaryDTO.of(ShareScope.SUMMARY, some);
        assertThat(dto.fields()).containsEntry("SEAT", "Aarav").containsEntry("STAGE_COUNTS", null);
        assertThat(dto.fields()).doesNotContainKey("EMPLOYER_DETAILS");
        assertThat(dto.fields().toString()).doesNotContain("Acme");
    }

    @Test
    void anUnknownScopeShowsNothing() {
        assertThat(ShareField.project(null, everything())).isEmpty();
    }
}
