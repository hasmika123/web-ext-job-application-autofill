package com.dossier.api.web.rest;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
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
import org.springframework.http.MediaType;
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
        resume.setr2ObjectKey("resumes/" + resume.getUser().getId() + "/" + resume.getId() + "-vanished-" + System.nanoTime() + ".pdf"); // the owner's own prefix: a vanished object, not a foreign key
        resumeRepository.saveAndFlush(resume);

        mockMvc.perform(get("/api/resumes/" + resume.getId() + "/file")).andExpect(status().isNotFound());
    }
    // ---- a stored key outside the owner's own prefix is never followed (security review 2026-10-15) ----------------------

    /** Somebody else's file in the blob store (the admin's), and its key. */
    private String victimObject() {
        User admin = userRepository.findOneByLogin("admin").orElseThrow();
        String key = "resumes/" + admin.getId() + "/987654-" + System.nanoTime() + "-secret.pdf";
        storage.store(key, "%PDF-1.7 the victim's private resume".getBytes(StandardCharsets.UTF_8), "application/pdf");
        return key;
    }

    @Test
    void aPoisonedPointerToSomebodyElsesObjectIsNeitherDownloadedNorDeletedNorReplacedOver() throws Exception {
        String victim = victimObject();
        Resume resume = newResume();
        resume.setr2ObjectKey(victim); // a row that already carries a foreign pointer (written by the old bug)
        resumeRepository.saveAndFlush(resume);
        String url = "/api/resumes/" + resume.getId() + "/file";

        mockMvc.perform(get(url)).andExpect(status().isNotFound());
        mockMvc.perform(delete(url)).andExpect(status().isNoContent());
        assertThat(storage.exists(victim)).as("DELETE must not touch a key outside the owner's prefix").isTrue();

        // an upload replaces the pointer with the resume's own key and does not delete the foreign object it replaced
        mockMvc.perform(multipart(url).file(pdf("%PDF-1.7 mine"))).andExpect(status().isOk());
        String mine = resumeRepository.findById(resume.getId()).orElseThrow().getr2ObjectKey();
        assertThat(mine).startsWith("resumes/" + resume.getUser().getId() + "/" + resume.getId() + "-");
        assertThat(storage.exists(victim)).isTrue();
        storage.delete(victim);
    }

    @Test
    void aClientCannotSetTheObjectKeyThroughTheProfileRouteSoItCanNeverReadSomebodyElsesFile() throws Exception {
        String victim = victimObject();
        Resume resume = newResume();
        String url = "/api/resumes/" + resume.getId() + "/file";

        // the old bug: PUT /api/profile/resumes/{id} {"r2ObjectKey": "<someone else's key>"} then GET .../file served their bytes
        mockMvc
            .perform(put("/api/profile/resumes/" + resume.getId()).contentType(MediaType.APPLICATION_JSON).content("{\"label\":\"mine\",\"r2ObjectKey\":\"" + victim + "\"}"))
            .andExpect(status().isOk());
        Resume after = resumeRepository.findById(resume.getId()).orElseThrow();
        assertThat(after.getLabel()).isEqualTo("mine");
        assertThat(after.getr2ObjectKey()).as("the pointer is server-assigned only").isNotEqualTo(victim).isEmpty();
        mockMvc.perform(get(url)).andExpect(status().isNotFound());
        mockMvc.perform(delete(url)).andExpect(status().isNoContent());
        assertThat(storage.exists(victim)).isTrue();

        // creating a resume with a key does not set it either
        String created = mockMvc
            .perform(post("/api/profile/resumes").contentType(MediaType.APPLICATION_JSON).content("{\"label\":\"new\",\"r2ObjectKey\":\"" + victim + "\"}"))
            .andExpect(status().isCreated())
            .andReturn()
            .getResponse()
            .getContentAsString();
        long id = new com.fasterxml.jackson.databind.ObjectMapper().readTree(created).get("id").asLong();
        assertThat(resumeRepository.findById(id).orElseThrow().getr2ObjectKey()).isEmpty();
        storage.delete(victim);
    }
}
