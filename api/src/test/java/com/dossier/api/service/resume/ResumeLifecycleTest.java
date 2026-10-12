package com.dossier.api.service.resume;

import static org.assertj.core.api.Assertions.assertThat;

import com.dossier.api.domain.enumeration.ResumeKind;
import java.time.Instant;
import org.junit.jupiter.api.Test;

class ResumeLifecycleTest {

    private static final Instant WHEN = Instant.parse("2026-10-12T00:00:00Z");

    @Test
    void archivedWinsOverEverything() {
        assertThat(ResumeLifecycle.of(true, ResumeKind.BUILT, false, null)).isEqualTo("ARCHIVED");
        assertThat(ResumeLifecycle.of(true, ResumeKind.UPLOADED, true, WHEN)).isEqualTo("ARCHIVED");
    }

    @Test
    void aBuiltResumeWithNoCheckpointAndNoPdfIsADraft() {
        assertThat(ResumeLifecycle.of(false, ResumeKind.BUILT, false, null)).isEqualTo("DRAFT");
        assertThat(ResumeLifecycle.of(null, ResumeKind.BUILT, false, null)).isEqualTo("DRAFT");
    }

    @Test
    void aCheckpointOrAStoredPdfMakesItActive() {
        assertThat(ResumeLifecycle.of(false, ResumeKind.BUILT, true, null)).isEqualTo("ACTIVE");
        assertThat(ResumeLifecycle.of(false, ResumeKind.BUILT, false, WHEN)).isEqualTo("ACTIVE");
    }

    @Test
    void anUploadedFileIsNeverADraft() {
        assertThat(ResumeLifecycle.of(false, ResumeKind.UPLOADED, false, null)).isEqualTo("ACTIVE");
    }
}
