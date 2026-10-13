package com.dossier.api.web.rest;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.Resume;
import com.dossier.api.domain.User;
import com.dossier.api.domain.enumeration.ResumeStatus;
import com.dossier.api.domain.AppSetting;
import com.dossier.api.repository.AppSettingRepository;
import com.dossier.api.repository.ResumeRepository;
import com.dossier.api.service.ResumeBuilderSettingKeys;
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.service.storage.FileStorage;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

/**
 * Resume file upload / download / delete over HTTP against the default (local-filesystem)
 * {@link FileStorage} driver: the bytes round-trip through the seam, a replaced file does not
 * orphan the old one, and a vanished object is a clean 404.
 */
@IntegrationTest
@AutoConfigureMockMvc
@WithMockUser(username = "user")
@Transactional
class ResumeFileResourceIT {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ResumeRepository resumeRepository;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private FileStorage storage;

    @Autowired
    private AppSettingRepository appSettingRepository;

    @Autowired
    private ResumeBuilderSettings settings;

    @AfterEach
    void dropSettingsCache() {
        settings.invalidate(); // the setting rows roll back with the test transaction; the cache must not outlive them
    }

    private Resume newResume() {
        User user = userRepository.findOneByLogin("user").orElseThrow();
        Resume r = new Resume()
            .label("Backend v3")
            .r2ObjectKey("")
            .status(ResumeStatus.CONFIRMED)
            .archived(false)
            .defaultResume(false)
            .createdAt(Instant.now());
        r.setUser(user);
        return resumeRepository.saveAndFlush(r);
    }

    private static MockMultipartFile pdf(String body) {
        return new MockMultipartFile("file", "cv.pdf", "application/pdf", body.getBytes(StandardCharsets.UTF_8));
    }

    @Test
    void uploadDownloadReplaceAndDeleteGoThroughTheStorageSeam() throws Exception {
        Resume resume = newResume();
        String url = "/api/resumes/" + resume.getId() + "/file";

        mockMvc.perform(multipart(url).file(pdf("%PDF-1.7 first"))).andExpect(status().isOk());
        String firstKey = resumeRepository.findById(resume.getId()).orElseThrow().getr2ObjectKey();
        assertThat(firstKey).startsWith("resumes/");
        assertThat(storage.exists(firstKey)).isTrue();

        mockMvc
            .perform(get(url))
            .andExpect(status().isOk())
            .andExpect(content().contentType("application/pdf"))
            .andExpect(content().bytes("%PDF-1.7 first".getBytes(StandardCharsets.UTF_8)));

        // Uploading again swaps the key and removes the previous object.
        mockMvc.perform(multipart(url).file(pdf("%PDF-1.7 second"))).andExpect(status().isOk());
        String secondKey = resumeRepository.findById(resume.getId()).orElseThrow().getr2ObjectKey();
        assertThat(secondKey).isNotEqualTo(firstKey);
        assertThat(storage.exists(firstKey)).isFalse();
        assertThat(storage.exists(secondKey)).isTrue();

        mockMvc.perform(delete(url)).andExpect(status().isNoContent());
        assertThat(storage.exists(secondKey)).isFalse();
    }

    @Test
    void theUploadSizeCapComesFromTheSetting() throws Exception {
        Resume resume = newResume();
        String url = "/api/resumes/" + resume.getId() + "/file";
        appSettingRepository.saveAndFlush(new AppSetting(ResumeBuilderSettingKeys.PROFILE_UPLOAD_MAX_BYTES, "1048576", "it", Instant.now()));
        settings.invalidate();

        mockMvc.perform(multipart(url).file(pdf("x".repeat(1_048_576)))).andExpect(status().isOk());
        mockMvc.perform(multipart(url).file(pdf("x".repeat(1_048_577)))).andExpect(status().isPayloadTooLarge());
    }

    @Test
    void aMissingObjectIsA404NotAServerError() throws Exception {
        Resume resume = newResume();
        resume.setr2ObjectKey("resumes/1/vanished-" + System.nanoTime() + ".pdf");
        resumeRepository.saveAndFlush(resume);

        mockMvc.perform(get("/api/resumes/" + resume.getId() + "/file")).andExpect(status().isNotFound());
    }
}
