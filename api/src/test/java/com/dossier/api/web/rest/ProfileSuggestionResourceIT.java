package com.dossier.api.web.rest;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.ProfileSuggestion;
import com.dossier.api.domain.User;
import com.dossier.api.domain.enumeration.SuggestionStatus;
import com.dossier.api.repository.ProfileSuggestionRepository;
import com.dossier.api.repository.UserRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

/**
 * Integration tests for {@link ProfileSuggestionResource} (Phase 10.3c) — learned answers become
 * suggestions, and only an explicit accept writes the profile.
 *
 * <p>What must hold: a blank field is suggested at once; a change to an existing value needs the
 * same value on two DIFFERENT applications; EEO and unknown keys are never stored; accept writes
 * the profile without disturbing other keys (and moves the version the extension polls); dismiss
 * is permanent; another user's suggestion is invisible; and none of it needs Pro — the seeded
 * "user" is Free throughout.
 */
@IntegrationTest
@AutoConfigureMockMvc
@WithMockUser(username = "user")
class ProfileSuggestionResourceIT {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper om;

    @Autowired
    private ProfileSuggestionRepository repository;

    @Autowired
    private UserRepository userRepository;

    private static Map<String, String> answer(String key, String value, String context) {
        Map<String, String> m = new HashMap<>();
        m.put("fieldKey", key);
        m.put("value", value);
        m.put("context", context);
        return m;
    }

    @SafeVarargs
    private void report(Map<String, String>... answers) throws Exception {
        mockMvc
            .perform(post("/api/profile/suggestions").contentType(MediaType.APPLICATION_JSON).content(om.writeValueAsBytes(List.of(answers))))
            .andExpect(status().isNoContent());
    }

    private JsonNode list() throws Exception {
        String body = mockMvc.perform(get("/api/profile/suggestions")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return om.readTree(body);
    }

    private void setBio(Map<String, Object> bio) throws Exception {
        String payload = om.writeValueAsString(bio);
        mockMvc
            .perform(put("/api/profile").contentType(MediaType.APPLICATION_JSON).content(om.writeValueAsBytes(Map.of("payload", payload))))
            .andExpect(status().isOk());
    }

    private JsonNode bio() throws Exception {
        String body = mockMvc.perform(get("/api/profile")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return om.readTree(om.readTree(body).get("payload").asText());
    }

    private String version() throws Exception {
        String body = mockMvc.perform(get("/api/profile/version")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return om.readTree(body).get("version").asText();
    }

    private long idOf(String fieldKey) throws Exception {
        for (JsonNode n : list()) if (n.get("fieldKey").asText().equals(fieldKey)) return n.get("id").asLong();
        throw new AssertionError("no suggestion for " + fieldKey + " in " + list());
    }

    // ---- what gets suggested ----------------------------------------------------------------

    @Test
    @Transactional
    void aBlankFieldIsSuggestedAtOnce() throws Exception {
        setBio(Map.of("firstName", "Ada"));
        report(answer("desiredSalary", "$120,000", "app1"));

        JsonNode l = list();
        assertThat(l.size()).isEqualTo(1);
        assertThat(l.get(0).get("fieldKey").asText()).isEqualTo("desiredSalary");
        assertThat(l.get(0).get("value").asText()).isEqualTo("$120,000");
        assertThat(l.get(0).get("currentValue").asText()).isEmpty();
    }

    @Test
    @Transactional
    void aChangeWaitsForTwoDifferentApplications() throws Exception {
        setBio(Map.of("workPreference", "Remote"));

        report(answer("workPreference", "Hybrid", "app1"));
        assertThat(list().size()).as("one application is not enough to change a value").isZero();

        report(answer("workPreference", "Hybrid", "app1"));
        assertThat(list().size()).as("seen twice on the SAME application still counts once").isZero();

        report(answer("workPreference", "hybrid ", "app2"));
        JsonNode l = list();
        assertThat(l.size()).isEqualTo(1);
        assertThat(l.get(0).get("value").asText()).isEqualTo("Hybrid");
        assertThat(l.get(0).get("currentValue").asText()).isEqualTo("Remote");
        assertThat(l.get(0).get("seenCount").asInt()).isEqualTo(2);
    }

    @Test
    @Transactional
    void whatTheProfileAlreadySaysIsNotSuggested() throws Exception {
        setBio(Map.of("city", "Atlanta"));
        report(answer("city", "  atlanta ", "app1"));
        assertThat(list().size()).isZero();
        assertThat(repository.findAll()).noneMatch(s -> "city".equals(s.getFieldKey()));
    }

    @Test
    @Transactional
    void eeoUnknownAndMalformedEntriesAreNeverStored() throws Exception {
        long before = repository.count();
        report(
            answer("gender", "Female", "app1"),
            answer("race", "Asian", "app1"),
            answer("disabilityStatus", "No", "app1"),
            answer("summary", "I build things", "app1"),
            answer("notAField", "x", "app1"),
            answer("city", "", "app1"),
            answer("city", "x".repeat(501), "app1")
        );
        assertThat(repository.count()).isEqualTo(before);
    }

    @Test
    @Transactional
    void oneSuggestionPerFieldTheLatestWins() throws Exception {
        report(answer("noticePeriod", "2 weeks", "app1"));
        report(answer("noticePeriod", "1 month", "app2"));
        JsonNode l = list();
        assertThat(l.size()).isEqualTo(1);
        assertThat(l.get(0).get("value").asText()).isEqualTo("1 month");
    }

    @Test
    @Transactional
    void pendingSuggestionsAreCapped() throws Exception {
        for (int round = 0; round < 3; round++) {
            List<Map<String, String>> b = new ArrayList<>();
            for (int i = 0; i < 25; i++) b.add(answer("city", "City " + round + "-" + i, "a" + i));
            mockMvc
                .perform(post("/api/profile/suggestions").contentType(MediaType.APPLICATION_JSON).content(om.writeValueAsBytes(b)))
                .andExpect(status().isNoContent());
        }
        User user = userRepository.findOneByLogin("user").orElseThrow();
        assertThat(repository.countByUserIdAndStatus(user.getId(), SuggestionStatus.PENDING)).isEqualTo(50);
    }

    // ---- accept / dismiss --------------------------------------------------------------------

    @Test
    @Transactional
    void acceptWritesTheProfileKeepsOtherKeysAndMovesTheVersion() throws Exception {
        setBio(Map.of("firstName", "Ada", "email", "ada@example.com"));
        report(answer("referralSource", "LinkedIn", "app1"), answer("referralSource", "Indeed", "app2"));
        String before = version();

        long id = idOf("referralSource");
        mockMvc.perform(post("/api/profile/suggestions/" + id + "/accept")).andExpect(status().isNoContent());

        JsonNode b = bio();
        assertThat(b.get("referralSource").asText()).isEqualTo("Indeed");
        assertThat(b.get("firstName").asText()).isEqualTo("Ada");
        assertThat(b.get("email").asText()).isEqualTo("ada@example.com");
        assertThat(version()).as("the extension must see the change").isNotEqualTo(before);
        assertThat(list().size()).as("the other undecided value for the field is dropped").isZero();

        // Decided is decided: reporting it again doesn't reopen it.
        report(answer("referralSource", "Indeed", "app3"));
        assertThat(list().size()).isZero();
    }

    @Test
    @Transactional
    void acceptCanTakeTheUsersEdit() throws Exception {
        report(answer("desiredSalary", "120k", "app1"));
        long id = idOf("desiredSalary");
        mockMvc
            .perform(
                post("/api/profile/suggestions/" + id + "/accept")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(om.writeValueAsBytes(Map.of("value", "$125,000")))
            )
            .andExpect(status().isNoContent());
        assertThat(bio().get("desiredSalary").asText()).isEqualTo("$125,000");

        report(answer("noticePeriod", "2 weeks", "app1"));
        mockMvc
            .perform(
                post("/api/profile/suggestions/" + idOf("noticePeriod") + "/accept")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(om.writeValueAsBytes(Map.of("value", "   ")))
            )
            .andExpect(status().isBadRequest());
    }

    @Test
    @Transactional
    void aDismissedValueIsNeverSuggestedAgain() throws Exception {
        report(answer("willingToRelocate", "Yes", "app1"));
        long id = idOf("willingToRelocate");
        mockMvc.perform(post("/api/profile/suggestions/" + id + "/dismiss")).andExpect(status().isNoContent());
        assertThat(list().size()).isZero();

        report(answer("willingToRelocate", "Yes", "app2"), answer("willingToRelocate", "yes", "app3"));
        assertThat(list().size()).isZero();
        mockMvc.perform(post("/api/profile/suggestions/" + id + "/accept")).andExpect(status().isNotFound());
    }

    @Test
    @Transactional
    void anotherUsersSuggestionIsInvisibleAndUntouchable() throws Exception {
        User admin = userRepository.findOneByLogin("admin").orElseThrow();
        ProfileSuggestion theirs = new ProfileSuggestion();
        theirs.setUser(admin);
        theirs.setFieldKey("city");
        theirs.setValue("Lisbon");
        theirs = repository.saveAndFlush(theirs);

        assertThat(list().size()).isZero();
        mockMvc.perform(post("/api/profile/suggestions/" + theirs.getId() + "/accept")).andExpect(status().isNotFound());
        mockMvc.perform(post("/api/profile/suggestions/" + theirs.getId() + "/dismiss")).andExpect(status().isNotFound());
        assertThat(repository.findById(theirs.getId()).orElseThrow().getStatus()).isEqualTo(SuggestionStatus.PENDING);
    }

    @Test
    @Transactional
    void acceptRefusesToOverwriteAnUnreadableProfile() throws Exception {
        report(answer("city", "Atlanta", "app1"));
        long id = idOf("city");
        mockMvc
            .perform(put("/api/profile").contentType(MediaType.APPLICATION_JSON).content(om.writeValueAsBytes(Map.of("payload", "not json"))))
            .andExpect(status().isOk());
        mockMvc.perform(post("/api/profile/suggestions/" + id + "/accept")).andExpect(status().isConflict());
    }
}
