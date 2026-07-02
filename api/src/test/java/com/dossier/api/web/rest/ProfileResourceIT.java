package com.dossier.api.web.rest;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.Application;
import com.dossier.api.domain.Bio;
import com.dossier.api.domain.Resume;
import com.dossier.api.domain.User;
import com.dossier.api.domain.enumeration.ApplicationStatus;
import com.dossier.api.domain.enumeration.ResumeStatus;
import com.dossier.api.repository.ApplicationRepository;
import com.dossier.api.repository.BioRepository;
import com.dossier.api.repository.ResumeRepository;
import com.dossier.api.repository.UserRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

/**
 * Integration tests for {@link ProfileResource} — the user-scoped sync API.
 * Runs as the seeded "user"; verifies the single-bio profile, resume CRUD, and
 * that another user's data never leaks in.
 */
@IntegrationTest
@AutoConfigureMockMvc
@WithMockUser(username = "user")
class ProfileResourceIT {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper om;

    @Autowired
    private BioRepository bioRepository;

    @Autowired
    private ResumeRepository resumeRepository;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private ApplicationRepository applicationRepository;

    @Test
    @Transactional
    void getProfileReturns404WhenNoneYet() throws Exception {
        mockMvc.perform(get("/api/profile")).andExpect(status().isNotFound());
    }

    @Test
    @Transactional
    void putProfileCreatesThenOverwritesASingleBio() throws Exception {
        mockMvc
            .perform(put("/api/profile").contentType(MediaType.APPLICATION_JSON).content(om.writeValueAsBytes(Map.of("payload", "{\"firstName\":\"Ada\"}"))))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.payload").value("{\"firstName\":\"Ada\"}"))
            .andExpect(jsonPath("$.user.login").value("user"));

        // GET now returns it
        mockMvc.perform(get("/api/profile")).andExpect(status().isOk()).andExpect(jsonPath("$.payload").value("{\"firstName\":\"Ada\"}"));

        // A second PUT overwrites the SAME row — still one bio for the user.
        mockMvc
            .perform(put("/api/profile").contentType(MediaType.APPLICATION_JSON).content(om.writeValueAsBytes(Map.of("payload", "{\"firstName\":\"Grace\"}"))))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.payload").value("{\"firstName\":\"Grace\"}"));
        // single bio per user: the two PUTs upserted the same row (Bio has no seed data)
        assertThat(bioRepository.count()).isEqualTo(1);
    }

    @Test
    @Transactional
    void resumeCrudIsScopedToTheCurrentUser() throws Exception {
        // create
        String body = om.writeValueAsString(Map.of("label", "Backend resume", "status", "NEEDS_REVIEW", "createdAt", Instant.ofEpochMilli(0).toString()));
        String created = mockMvc
            .perform(post("/api/profile/resumes").contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.label").value("Backend resume"))
            .andExpect(jsonPath("$.user.login").value("user"))
            .andReturn()
            .getResponse()
            .getContentAsString();
        Long id = om.readTree(created).get("id").asLong();

        // list includes it
        mockMvc.perform(get("/api/profile/resumes")).andExpect(status().isOk()).andExpect(jsonPath("$[?(@.id == " + id + ")].label").value("Backend resume"));

        // update
        mockMvc
            .perform(put("/api/profile/resumes/" + id).contentType(MediaType.APPLICATION_JSON).content(om.writeValueAsString(Map.of("label", "Renamed", "status", "CONFIRMED"))))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.label").value("Renamed"))
            .andExpect(jsonPath("$.status").value("CONFIRMED"));

        // delete
        mockMvc.perform(delete("/api/profile/resumes/" + id)).andExpect(status().isNoContent());
        assertThat(resumeRepository.findById(id)).isEmpty();
    }

    @Test
    @Transactional
    void archiveIsAPartialUpdateThatPreservesOtherFields() throws Exception {
        // create with a label + parsed JSON, not archived
        String body = om.writeValueAsString(
            Map.of("label", "Grad resume", "parsedJson", "{\"skills\":[\"Java\"]}", "status", "NEEDS_REVIEW")
        );
        String created = mockMvc
            .perform(post("/api/profile/resumes").contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isCreated())
            .andReturn()
            .getResponse()
            .getContentAsString();
        Long id = om.readTree(created).get("id").asLong();

        // PUT only {archived:true} — label + parsedJson must survive (PATCH-like semantics)
        mockMvc
            .perform(put("/api/profile/resumes/" + id).contentType(MediaType.APPLICATION_JSON).content(om.writeValueAsString(Map.of("archived", true))))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.archived").value(true))
            .andExpect(jsonPath("$.label").value("Grad resume"))
            .andExpect(jsonPath("$.parsedJson").value("{\"skills\":[\"Java\"]}"));

        // unarchive
        mockMvc
            .perform(put("/api/profile/resumes/" + id).contentType(MediaType.APPLICATION_JSON).content(om.writeValueAsString(Map.of("archived", false))))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.archived").value(false))
            .andExpect(jsonPath("$.label").value("Grad resume"));
    }

    @Test
    @Transactional
    void firstResumeAutoDefaultsAndSettingDefaultUnsetsTheOther() throws Exception {
        // The FIRST resume auto-becomes the default.
        Long first = createResume("Resume A");
        mockMvc.perform(get("/api/profile/resumes")).andExpect(status().isOk())
            .andExpect(jsonPath("$[?(@.id == " + first + ")].defaultResume").value(true));

        // A SECOND resume is not default.
        Long second = createResume("Resume B");
        mockMvc.perform(get("/api/profile/resumes")).andExpect(status().isOk())
            .andExpect(jsonPath("$[?(@.id == " + second + ")].defaultResume").value(false));

        // Promoting the second to default clears the first (at most one default per user).
        mockMvc
            .perform(put("/api/profile/resumes/" + second).contentType(MediaType.APPLICATION_JSON).content(om.writeValueAsString(Map.of("defaultResume", true))))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.defaultResume").value(true));
        mockMvc.perform(get("/api/profile/resumes")).andExpect(status().isOk())
            .andExpect(jsonPath("$[?(@.id == " + first + ")].defaultResume").value(false))
            .andExpect(jsonPath("$[?(@.id == " + second + ")].defaultResume").value(true));

        // Starring is a partial update like archive.
        mockMvc
            .perform(put("/api/profile/resumes/" + first).contentType(MediaType.APPLICATION_JSON).content(om.writeValueAsString(Map.of("starred", true))))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.starred").value(true));
    }

    private Long createResume(String label) throws Exception {
        String created = mockMvc
            .perform(
                post("/api/profile/resumes")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(om.writeValueAsString(Map.of("label", label, "status", "NEEDS_REVIEW")))
            )
            .andExpect(status().isCreated())
            .andReturn()
            .getResponse()
            .getContentAsString();
        return om.readTree(created).get("id").asLong();
    }

    @Test
    @Transactional
    void anotherUsersResumeIsNeverVisibleOrMutable() throws Exception {
        // A resume owned by "admin", created directly.
        User admin = userRepository.findOneByLogin("admin").orElseThrow();
        Resume adminResume = new Resume()
            .label("Admin secret")
            .r2ObjectKey("k")
            .status(ResumeStatus.CONFIRMED)
            .createdAt(Instant.ofEpochMilli(0));
        adminResume.setUser(admin);
        adminResume = resumeRepository.saveAndFlush(adminResume);

        // "user" cannot see it in their list...
        mockMvc.perform(get("/api/profile/resumes")).andExpect(status().isOk()).andExpect(jsonPath("$[?(@.id == " + adminResume.getId() + ")]").isEmpty());
        // ...nor update or delete it (404, no existence leak).
        mockMvc
            .perform(put("/api/profile/resumes/" + adminResume.getId()).contentType(MediaType.APPLICATION_JSON).content(om.writeValueAsString(Map.of("label", "hax"))))
            .andExpect(status().isNotFound());
        mockMvc.perform(delete("/api/profile/resumes/" + adminResume.getId())).andExpect(status().isNotFound());
        assertThat(resumeRepository.findById(adminResume.getId())).isPresent();
    }

    @Test
    @Transactional
    void deletingAResumeReferencedByAnApplicationIsBlockedWithArchiveNudge() throws Exception {
        User user = userRepository.findOneByLogin("user").orElseThrow();
        Resume resume = new Resume()
            .label("Used resume")
            .r2ObjectKey("k")
            .status(ResumeStatus.CONFIRMED)
            .createdAt(Instant.ofEpochMilli(0));
        resume.setUser(user);
        resume = resumeRepository.saveAndFlush(resume);

        Application app = new Application()
            .company("Acme")
            .roleTitle("Engineer")
            .status(ApplicationStatus.APPLIED)
            .createdAt(Instant.ofEpochMilli(0))
            .updatedAt(Instant.ofEpochMilli(0));
        app.setUser(user);
        app.setResume(resume);
        applicationRepository.saveAndFlush(app);

        // The resume is referenced by an application → delete is blocked (409), not lost.
        mockMvc.perform(delete("/api/profile/resumes/" + resume.getId())).andExpect(status().isConflict());
        assertThat(resumeRepository.findById(resume.getId())).isPresent();

        // Archiving instead is allowed (keeps the tracker link).
        mockMvc
            .perform(put("/api/profile/resumes/" + resume.getId()).contentType(MediaType.APPLICATION_JSON).content(om.writeValueAsString(Map.of("archived", true))))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.archived").value(true));
    }
}
