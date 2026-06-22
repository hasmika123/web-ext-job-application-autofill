package com.dossier.api.web.rest;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.AiAnswer;
import com.dossier.api.domain.Application;
import com.dossier.api.domain.Bio;
import com.dossier.api.domain.FieldCache;
import com.dossier.api.domain.Resume;
import com.dossier.api.domain.User;
import com.dossier.api.domain.enumeration.ApplicationStatus;
import com.dossier.api.domain.enumeration.ResumeStatus;
import com.dossier.api.repository.AiAnswerRepository;
import com.dossier.api.repository.ApplicationRepository;
import com.dossier.api.repository.BioRepository;
import com.dossier.api.repository.FieldCacheRepository;
import com.dossier.api.repository.ResumeRepository;
import com.dossier.api.repository.UserRepository;
import java.time.Instant;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

/**
 * Integration test for {@link AccountDeletionResource} — GDPR/CCPA "delete my account and
 * all my data". Seeds one row of every user-owned entity for the seeded "user", then
 * deletes the account and asserts every row AND the user are gone. The whole test runs in
 * one rolled-back transaction, so the seeded "user" is restored afterwards.
 */
@IntegrationTest
@AutoConfigureMockMvc
class AccountDeletionResourceIT {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private BioRepository bioRepository;

    @Autowired
    private ResumeRepository resumeRepository;

    @Autowired
    private ApplicationRepository applicationRepository;

    @Autowired
    private AiAnswerRepository aiAnswerRepository;

    @Autowired
    private FieldCacheRepository fieldCacheRepository;

    @Test
    @Transactional
    @WithMockUser(username = "user")
    void deletesAllOwnedDataAndTheAccount() throws Exception {
        User user = userRepository.findOneByLogin("user").orElseThrow();
        Instant now = Instant.ofEpochMilli(0);

        Bio bio = new Bio().payload("{}").updatedAt(now);
        bio.setUser(user);
        bio = bioRepository.saveAndFlush(bio);

        // Empty object key => no object-storage call needed for this DB-focused test.
        Resume resume = new Resume().label("R").r2ObjectKey("").status(ResumeStatus.NEEDS_REVIEW).createdAt(now);
        resume.setUser(user);
        resume = resumeRepository.saveAndFlush(resume);

        Application app = new Application()
            .company("Acme")
            .roleTitle("Engineer")
            .status(ApplicationStatus.DRAFT)
            .createdAt(now)
            .updatedAt(now);
        app.setUser(user);
        app = applicationRepository.saveAndFlush(app);

        AiAnswer ai = new AiAnswer().questionHash("qh").answer("a").createdAt(now);
        ai.setUser(user);
        ai = aiAnswerRepository.saveAndFlush(ai);

        FieldCache fc = new FieldCache().fieldKey("k").contextHash("ch").value("v").hitCount(1).updatedAt(now);
        fc.setUser(user);
        fc = fieldCacheRepository.saveAndFlush(fc);

        mockMvc.perform(delete("/api/account")).andExpect(status().isNoContent());

        assertThat(userRepository.findOneByLogin("user")).isEmpty();
        assertThat(bioRepository.findById(bio.getId())).isEmpty();
        assertThat(resumeRepository.findById(resume.getId())).isEmpty();
        assertThat(applicationRepository.findById(app.getId())).isEmpty();
        assertThat(aiAnswerRepository.findById(ai.getId())).isEmpty();
        assertThat(fieldCacheRepository.findById(fc.getId())).isEmpty();
    }
}
