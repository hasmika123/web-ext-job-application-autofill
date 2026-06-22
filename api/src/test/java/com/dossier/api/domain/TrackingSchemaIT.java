package com.dossier.api.domain;

import static org.assertj.core.api.Assertions.assertThat;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.enumeration.ApplicationStatus;
import com.dossier.api.domain.enumeration.ResumeStatus;
import com.dossier.api.repository.ApplicationRepository;
import com.dossier.api.repository.ResumeRepository;
import java.time.Instant;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.annotation.Transactional;

/**
 * Verifies the Phase 1.8 additive migration: the new tracking columns exist and
 * round-trip through MySQL (Testcontainers), and ApplicationStatus.DRAFT persists.
 * If the Liquibase changelog failed to apply, the context wouldn't even load.
 */
@IntegrationTest
class TrackingSchemaIT {

    @Autowired
    private ApplicationRepository applicationRepository;

    @Autowired
    private ResumeRepository resumeRepository;

    @Test
    @Transactional
    void applicationKeepsNewTrackingFieldsIncludingDraftStatus() {
        Application app = new Application()
            .company("Acme")
            .roleTitle("Backend Engineer")
            .location("Remote (US)")
            .externalJobId("ACME-12345")
            .submissionConfirmed(false)
            .status(ApplicationStatus.DRAFT)
            .createdAt(Instant.now())
            .updatedAt(Instant.now());

        Long id = applicationRepository.saveAndFlush(app).getId();
        applicationRepository.flush();

        Application read = applicationRepository.findById(id).orElseThrow();
        assertThat(read.getStatus()).isEqualTo(ApplicationStatus.DRAFT);
        assertThat(read.getLocation()).isEqualTo("Remote (US)");
        assertThat(read.getExternalJobId()).isEqualTo("ACME-12345");
        assertThat(read.getSubmissionConfirmed()).isFalse();
    }

    @Test
    @Transactional
    void resumeKeepsArchivedFlag() {
        Resume resume = new Resume()
            .label("Archived resume")
            .r2ObjectKey("key")
            .status(ResumeStatus.CONFIRMED)
            .archived(true)
            .createdAt(Instant.now());

        Long id = resumeRepository.saveAndFlush(resume).getId();
        Resume read = resumeRepository.findById(id).orElseThrow();
        assertThat(read.getArchived()).isTrue();
    }
}
