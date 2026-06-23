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
import com.dossier.api.domain.Resume;
import com.dossier.api.domain.User;
import com.dossier.api.domain.enumeration.ApplicationStatus;
import com.dossier.api.domain.enumeration.ResumeStatus;
import com.dossier.api.repository.ApplicationRepository;
import com.dossier.api.repository.ResumeRepository;
import com.dossier.api.repository.UserRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

/**
 * Integration tests for {@link ApplicationSyncResource} — the user-scoped applications
 * tracker. Runs as the seeded "user"; verifies upsert/dedup, the status guard, resume
 * linkage ownership, partial updates, delete, and that another user's rows never leak.
 */
@IntegrationTest
@AutoConfigureMockMvc
@WithMockUser(username = "user")
class ApplicationSyncResourceIT {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper om;

    @Autowired
    private ApplicationRepository applicationRepository;

    @Autowired
    private ResumeRepository resumeRepository;

    @Autowired
    private UserRepository userRepository;

    private static Map<String, Object> app(String company, String role) {
        Map<String, Object> m = new HashMap<>();
        m.put("company", company);
        m.put("roleTitle", role);
        return m;
    }

    @Test
    @Transactional
    void listIsEmptyForANewUser() throws Exception {
        mockMvc.perform(get("/api/profile/applications")).andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    @Transactional
    void upsertCreatesThenDedupsByExternalJobId() throws Exception {
        Map<String, Object> body = app("Acme", "Engineer");
        body.put("externalJobId", "JOB-1");
        body.put("status", "DRAFT");

        mockMvc
            .perform(post("/api/profile/applications").contentType(MediaType.APPLICATION_JSON).content(om.writeValueAsBytes(body)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.company").value("Acme"))
            .andExpect(jsonPath("$.status").value("DRAFT"))
            .andExpect(jsonPath("$.user.login").value("user"));

        // Re-fill the SAME job (same externalJobId) with a refreshed role -> updates the one row.
        Map<String, Object> again = app("Acme", "Senior Engineer");
        again.put("externalJobId", "JOB-1");
        mockMvc
            .perform(post("/api/profile/applications").contentType(MediaType.APPLICATION_JSON).content(om.writeValueAsBytes(again)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.roleTitle").value("Senior Engineer"));

        // Still ONE entry — the second fill upserted the same row.
        mockMvc.perform(get("/api/profile/applications")).andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(1));
    }

    @Test
    @Transactional
    void upsertDedupsByJobUrlWhenNoExternalId() throws Exception {
        Map<String, Object> body = app("Globex", "Designer");
        body.put("jobUrl", "https://jobs.globex.com/123");
        mockMvc
            .perform(post("/api/profile/applications").contentType(MediaType.APPLICATION_JSON).content(om.writeValueAsBytes(body)))
            .andExpect(status().isOk());

        Map<String, Object> again = app("Globex", "Designer");
        again.put("jobUrl", "https://jobs.globex.com/123");
        mockMvc
            .perform(post("/api/profile/applications").contentType(MediaType.APPLICATION_JSON).content(om.writeValueAsBytes(again)))
            .andExpect(status().isOk());

        mockMvc.perform(get("/api/profile/applications")).andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(1));
    }

    @Test
    @Transactional
    void reFillDoesNotRevertAppliedBackToDraft() throws Exception {
        Map<String, Object> body = app("Initech", "PM");
        body.put("externalJobId", "JOB-9");
        body.put("status", "APPLIED");
        mockMvc
            .perform(post("/api/profile/applications").contentType(MediaType.APPLICATION_JSON).content(om.writeValueAsBytes(body)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.status").value("APPLIED"));

        // A later fill sends DRAFT — must NOT downgrade an already-APPLIED entry.
        Map<String, Object> draftAgain = app("Initech", "PM");
        draftAgain.put("externalJobId", "JOB-9");
        draftAgain.put("status", "DRAFT");
        mockMvc
            .perform(post("/api/profile/applications").contentType(MediaType.APPLICATION_JSON).content(om.writeValueAsBytes(draftAgain)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.status").value("APPLIED"));
    }

    @Test
    @Transactional
    void companyAndRoleAreRequired() throws Exception {
        mockMvc
            .perform(post("/api/profile/applications").contentType(MediaType.APPLICATION_JSON).content(om.writeValueAsBytes(Map.of("company", "NoRole"))))
            .andExpect(status().isBadRequest());
    }

    @Test
    @Transactional
    void updateChangesStatusAndConfirmsSubmission() throws Exception {
        Long id = createOne(app("Hooli", "SRE"));

        Map<String, Object> patch = new HashMap<>();
        patch.put("status", "APPLIED");
        patch.put("submissionConfirmed", true);
        patch.put("appliedAt", Instant.ofEpochMilli(0).toString());
        mockMvc
            .perform(put("/api/profile/applications/" + id).contentType(MediaType.APPLICATION_JSON).content(om.writeValueAsBytes(patch)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.status").value("APPLIED"))
            .andExpect(jsonPath("$.submissionConfirmed").value(true))
            .andExpect(jsonPath("$.company").value("Hooli")); // untouched fields survive a partial update
    }

    @Test
    @Transactional
    void canLinkOwnedResumeButNotAnotherUsersResume() throws Exception {
        // The current user's own resume can be linked.
        User user = userRepository.findOneByLogin("user").orElseThrow();
        Resume mine = resumeRepository.saveAndFlush(ownedResume(user, "My resume"));

        Map<String, Object> body = app("Stark", "Engineer");
        body.put("externalJobId", "JOB-R1");
        body.put("resume", Map.of("id", mine.getId()));
        mockMvc
            .perform(post("/api/profile/applications").contentType(MediaType.APPLICATION_JSON).content(om.writeValueAsBytes(body)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.resume.id").value(mine.getId()));

        // An admin-owned resume must NOT be linkable (404, no leak).
        User admin = userRepository.findOneByLogin("admin").orElseThrow();
        Resume theirs = resumeRepository.saveAndFlush(ownedResume(admin, "Admin resume"));
        Map<String, Object> bad = app("Stark", "Engineer");
        bad.put("externalJobId", "JOB-R2");
        bad.put("resume", Map.of("id", theirs.getId()));
        mockMvc
            .perform(post("/api/profile/applications").contentType(MediaType.APPLICATION_JSON).content(om.writeValueAsBytes(bad)))
            .andExpect(status().isNotFound());
    }

    @Test
    @Transactional
    void deleteRemovesTheEntry() throws Exception {
        Long id = createOne(app("Umbrella", "Analyst"));
        mockMvc.perform(delete("/api/profile/applications/" + id)).andExpect(status().isNoContent());
        assertThat(applicationRepository.findById(id)).isEmpty();
    }

    @Test
    @Transactional
    void anotherUsersApplicationIsNeverVisibleOrMutable() throws Exception {
        User admin = userRepository.findOneByLogin("admin").orElseThrow();
        Application adminApp = new Application()
            .company("Secret Co")
            .roleTitle("Spy")
            .status(ApplicationStatus.APPLIED)
            .createdAt(Instant.ofEpochMilli(0))
            .updatedAt(Instant.ofEpochMilli(0));
        adminApp.setUser(admin);
        adminApp = applicationRepository.saveAndFlush(adminApp);

        // Not in "user"'s list...
        mockMvc
            .perform(get("/api/profile/applications"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$[?(@.id == " + adminApp.getId() + ")]").isEmpty());
        // ...nor updatable or deletable (404, no existence leak).
        mockMvc
            .perform(put("/api/profile/applications/" + adminApp.getId()).contentType(MediaType.APPLICATION_JSON).content(om.writeValueAsString(Map.of("status", "REJECTED"))))
            .andExpect(status().isNotFound());
        mockMvc.perform(delete("/api/profile/applications/" + adminApp.getId())).andExpect(status().isNotFound());
        assertThat(applicationRepository.findById(adminApp.getId())).isPresent();
    }

    // ---- helpers -----------------------------------------------------------

    private Long createOne(Map<String, Object> body) throws Exception {
        String created = mockMvc
            .perform(post("/api/profile/applications").contentType(MediaType.APPLICATION_JSON).content(om.writeValueAsBytes(body)))
            .andExpect(status().isOk())
            .andReturn()
            .getResponse()
            .getContentAsString();
        return om.readTree(created).get("id").asLong();
    }

    private static Resume ownedResume(User owner, String label) {
        Resume r = new Resume().label(label).r2ObjectKey("k").status(ResumeStatus.CONFIRMED).createdAt(Instant.ofEpochMilli(0));
        r.setUser(owner);
        return r;
    }
}
