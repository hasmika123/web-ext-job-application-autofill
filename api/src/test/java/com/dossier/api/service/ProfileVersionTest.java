package com.dossier.api.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.dossier.api.domain.enumeration.ResumeKind;
import com.dossier.api.domain.enumeration.ResumeRole;
import com.dossier.api.domain.enumeration.ResumeStatus;
import com.dossier.api.service.dto.BioDTO;
import com.dossier.api.service.dto.ResumeActorDTO;
import com.dossier.api.service.dto.ResumeDTO;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;

/**
 * The profile version is what the extension compares to decide whether to re-pull. The Resume
 * Builder's additive DTO fields (R0.1) must not move it: nothing fillable changed.
 */
class ProfileVersionTest {

    private static ResumeDTO resume() {
        ResumeDTO r = new ResumeDTO();
        r.setId(7L);
        r.setLabel("Backend SWE");
        r.setr2ObjectKey("resumes/7.pdf");
        r.setParsedJson("{\"summary\":\"x\"}");
        r.setStatus(ResumeStatus.CONFIRMED);
        r.setCreatedAt(Instant.parse("2026-10-01T00:00:00Z"));
        r.setArchived(false);
        r.setStarred(false);
        r.setDefaultResume(true);
        return r;
    }

    private static Optional<BioDTO> bio() {
        BioDTO b = new BioDTO();
        b.setPayload("{\"firstName\":\"A\"}");
        b.setUpdatedAt(Instant.parse("2026-10-01T00:00:00Z"));
        return Optional.of(b);
    }

    @Test
    void kindAndTemplateIdDoNotChangeTheVersion() {
        String plain = ProfileVersion.compute(bio(), List.of(resume()));

        ResumeDTO built = resume();
        built.setKind(ResumeKind.BUILT);
        built.setTemplateId("classic");

        assertThat(ProfileVersion.compute(bio(), List.of(built))).isEqualTo(plain);
    }

    @Test
    void metadataTheExtensionDoesNotReadDoesNotMoveTheVersion() {
        String plain = ProfileVersion.compute(bio(), List.of(resume()));

        ResumeDTO meta = resume();
        meta.setTags(List.of("2026", "backend"));
        meta.setTarget("Backend SWE");
        meta.setRole(ResumeRole.TAILORED);
        meta.setCreatedBy(new ResumeActorDTO("user", "A User"));
        meta.setUpdatedBy(new ResumeActorDTO("other", "Other"));
        meta.setUpdatedAt(Instant.parse("2026-10-12T00:00:00Z"));
        meta.setShareWithOrg(false);
        meta.setLifecycle("DRAFT");

        assertThat(ProfileVersion.compute(bio(), List.of(meta))).isEqualTo(plain);
    }

    @Test
    void aRenameOrAPrimaryChangeMovesTheVersionSoTheExtensionRePulls() {
        String before = ProfileVersion.compute(bio(), List.of(resume()));

        ResumeDTO renamed = resume();
        renamed.setLabel("Backend SWE v2");
        assertThat(ProfileVersion.compute(bio(), List.of(renamed))).isNotEqualTo(before);

        ResumeDTO demoted = resume();
        demoted.setDefaultResume(false);
        assertThat(ProfileVersion.compute(bio(), List.of(demoted))).isNotEqualTo(before);
    }

    @Test
    void primaryIsTheSameValueAsDefaultResume() {
        ResumeDTO r = resume();
        assertThat(r.getPrimary()).isTrue();
        r.setDefaultResume(false);
        assertThat(r.getPrimary()).isFalse();
    }

    @Test
    void aChangeToWhatIsFilledMovesTheVersion() {
        String before = ProfileVersion.compute(bio(), List.of(resume()));
        ResumeDTO changed = resume();
        changed.setParsedJson("{\"summary\":\"y\"}");

        assertThat(ProfileVersion.compute(bio(), List.of(changed))).isNotEqualTo(before);
    }
}
