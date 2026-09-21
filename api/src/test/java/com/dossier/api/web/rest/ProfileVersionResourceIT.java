package com.dossier.api.web.rest;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.Resume;
import com.dossier.api.domain.User;
import com.dossier.api.domain.enumeration.ResumeStatus;
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
 * Integration tests for {@code GET /api/profile/version} (Phase 11.2) — the fingerprint the
 * extension polls to decide whether to re-pull its mirror. The contract that matters: it never
 * 404s, it is stable while nothing changes, it moves on EVERY kind of change a pull would show
 * (bio, resume create / partial update / delete), and another user's changes never move it.
 */
@IntegrationTest
@AutoConfigureMockMvc
@WithMockUser(username = "user")
class ProfileVersionResourceIT {

    private static final String HEX16 = "^[0-9a-f]{16}$";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper om;

    @Autowired
    private ResumeRepository resumeRepository;

    @Autowired
    private UserRepository userRepository;

    private String version() throws Exception {
        String body = mockMvc
            .perform(get("/api/profile/version"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.version").isString())
            .andReturn()
            .getResponse()
            .getContentAsString();
        return om.readTree(body).get("version").asText();
    }

    private Long createResume(String label) throws Exception {
        String body = om.writeValueAsString(Map.of("label", label, "status", "NEEDS_REVIEW", "createdAt", Instant.ofEpochMilli(0).toString()));
        String created = mockMvc
            .perform(post("/api/profile/resumes").contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isCreated())
            .andReturn()
            .getResponse()
            .getContentAsString();
        return om.readTree(created).get("id").asLong();
    }

    @Test
    @Transactional
    void emptyProfileStillHasAStableVersion() throws Exception {
        // No bio, no resumes — the extension must still be able to compare, so never 404.
        String v1 = version();
        assertThat(v1).matches(HEX16);
        assertThat(version()).isEqualTo(v1);
    }

    @Test
    @Transactional
    void movesWhenTheBioChanges() throws Exception {
        String before = version();
        mockMvc
            .perform(put("/api/profile").contentType(MediaType.APPLICATION_JSON).content(om.writeValueAsBytes(Map.of("payload", "{\"firstName\":\"Ada\"}"))))
            .andExpect(status().isOk());
        String after = version();
        assertThat(after).matches(HEX16).isNotEqualTo(before);
        // ...and is stable again until the next change.
        assertThat(version()).isEqualTo(after);
    }

    @Test
    @Transactional
    void movesOnEveryKindOfResumeChange() throws Exception {
        String v0 = version();

        Long id = createResume("Backend resume");
        String v1 = version();
        assertThat(v1).isNotEqualTo(v0);

        // A partial update the pull would show (archive toggle) must move it too — this is the
        // case a createdAt-based counter would have missed.
        mockMvc
            .perform(put("/api/profile/resumes/" + id).contentType(MediaType.APPLICATION_JSON).content(om.writeValueAsString(Map.of("archived", true))))
            .andExpect(status().isOk());
        String v2 = version();
        assertThat(v2).isNotEqualTo(v1);

        // Toggling back does NOT have to return to v1 (it may, since the content is identical) —
        // what matters is it differs from the archived state.
        mockMvc
            .perform(put("/api/profile/resumes/" + id).contentType(MediaType.APPLICATION_JSON).content(om.writeValueAsString(Map.of("archived", false))))
            .andExpect(status().isOk());
        String v3 = version();
        assertThat(v3).isNotEqualTo(v2);

        mockMvc.perform(delete("/api/profile/resumes/" + id)).andExpect(status().isNoContent());
        String v4 = version();
        assertThat(v4).isNotEqualTo(v3);
    }

    @Test
    @Transactional
    void anotherUsersChangesDoNotMoveMyVersion() throws Exception {
        String mine = version();

        // Seed a resume for a DIFFERENT user straight through the repository.
        User admin = userRepository.findOneByLogin("admin").orElseThrow();
        Resume theirs = new Resume();
        theirs.setLabel("Not yours");
        theirs.setStatus(ResumeStatus.NEEDS_REVIEW);
        theirs.setr2ObjectKey("resumes/admin/not-yours.pdf"); // @NotNull on the entity (the API fills it; the repo doesn't)
        theirs.setCreatedAt(Instant.now());
        theirs.setUser(admin);
        resumeRepository.saveAndFlush(theirs);

        assertThat(version()).isEqualTo(mine);
    }
}
