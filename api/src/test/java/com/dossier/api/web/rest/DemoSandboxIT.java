package com.dossier.api.web.rest;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.Resume;
import com.dossier.api.domain.User;
import com.dossier.api.repository.ResumeDocRepository;
import com.dossier.api.repository.ResumeRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.service.DemoAccountService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.transaction.annotation.Transactional;

/**
 * The demo sandbox (phase demo): a demo account can build and edit resumes, still gets
 * {@code DEMO_READ_ONLY} on account, billing, inbox and notification endpoints, and a reset erases
 * what the demo accounts made without touching any real user's data.
 */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
class DemoSandboxIT {

    private static final String BUILT = "/api/profile/resumes/built";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper om;

    @Autowired
    private DemoAccountService demoAccounts;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private ResumeRepository resumeRepository;

    @Autowired
    private ResumeDocRepository resumeDocRepository;

    private ResultActions createBuilt(String login, String label) throws Exception {
        return mockMvc.perform(
            post(BUILT).with(user(login)).contentType(MediaType.APPLICATION_JSON).content("{\"templateId\":\"modern\",\"target\":\"Designer\",\"label\":\"" + label + "\"}")
        );
    }

    @Test
    void aDemoAccountCanCreateAndEditABuiltResume() throws Exception {
        demoAccounts.ensureAccounts();

        String created = createBuilt("demo", "Sandbox resume").andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        JsonNode json = om.readTree(created);
        long id = json.get("resume").get("id").asLong();
        ObjectNode doc = (ObjectNode) om.readTree(
            "{\"schema\":1,\"meta\":{\"title\":\"Sandbox resume\"},\"basics\":{\"name\":\"Priya Sharma\"},\"sections\":[" +
            "{\"id\":\"s_sum0001\",\"kind\":\"SUMMARY\",\"title\":\"Summary\",\"hidden\":false," +
            "\"items\":[{\"id\":\"i_sum0001\",\"text\":\"Edited by a visitor\"}]}]}"
        );

        mockMvc
            .perform(
                put("/api/profile/resumes/" + id + "/doc")
                    .with(user("demo"))
                    .header(HttpHeaders.IF_MATCH, "\"1\"")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(om.writeValueAsString(Map.of("doc", doc)))
            )
            .andExpect(status().isOk());

        mockMvc
            .perform(get("/api/profile/resumes/" + id + "/doc").with(user("demo")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.doc.sections[0].items[0].text").value("Edited by a visitor"));
    }

    @Test
    void aDemoAccountCanOpenAnUploadedResumeInTheBuilderTwice() throws Exception {
        demoAccounts.ensureAccounts();
        User demo = userRepository.findOneByLogin("demo").orElseThrow();
        Resume file = new Resume().label("Uploaded").r2ObjectKey("").status(com.dossier.api.domain.enumeration.ResumeStatus.CONFIRMED).createdAt(java.time.Instant.now());
        file.setUser(demo);
        file = resumeRepository.saveAndFlush(file);

        String first = mockMvc.perform(post("/api/profile/resumes/" + file.getId() + "/doc/import").with(user("demo"))).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        String second = mockMvc.perform(post("/api/profile/resumes/" + file.getId() + "/doc/import").with(user("demo"))).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertThat(om.readTree(second).at("/doc/contentHash").asText()).isEqualTo(om.readTree(first).at("/doc/contentHash").asText());
        mockMvc.perform(get("/api/profile/resumes/" + file.getId() + "/doc").with(user("demo"))).andExpect(status().isOk());
    }

    @Test
    void aDemoAccountIsStillReadOnlyOnAccountBillingInboxAndNotifications() throws Exception {
        demoAccounts.ensureAccounts();

        mockMvc
            .perform(post("/api/account/change-password").with(user("demo")).contentType(MediaType.APPLICATION_JSON).content("{}"))
            .andExpect(status().isForbidden())
            .andExpect(jsonPath("$.code").value("DEMO_READ_ONLY"));
        mockMvc.perform(delete("/api/account").with(user("demo"))).andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("DEMO_READ_ONLY"));
        mockMvc.perform(get("/api/account/export").with(user("demo"))).andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("DEMO_READ_ONLY"));
        mockMvc
            .perform(post("/api/billing/portal").with(user("demo")).contentType(MediaType.APPLICATION_JSON).content("{}"))
            .andExpect(status().isForbidden())
            .andExpect(jsonPath("$.code").value("DEMO_READ_ONLY"));
        mockMvc
            .perform(delete("/api/profile/inbox").with(user("demo")))
            .andExpect(status().isForbidden())
            .andExpect(jsonPath("$.code").value("DEMO_READ_ONLY"));
        mockMvc
            .perform(put("/api/profile/notification-preferences").with(user("demo")).contentType(MediaType.APPLICATION_JSON).content("{\"tz\":\"UTC\"}"))
            .andExpect(status().isForbidden())
            .andExpect(jsonPath("$.code").value("DEMO_READ_ONLY"));
    }

    @Test
    void resetErasesWhatTheDemoMadeAndLeavesRealUsersAlone() throws Exception {
        demoAccounts.ensureAccounts();
        User demo = userRepository.findOneByLogin("demo").orElseThrow();
        // A real user with a built resume of their own (their data must survive a demo reset).
        User real = userRepository.findOneByLogin("user").orElseThrow();

        createBuilt("demo", "Visitor made this").andExpect(status().isCreated());
        createBuilt("user", "Real resume").andExpect(status().isCreated());
        long realDocsBefore = resumeDocRepository.findAll().stream().filter(d -> real.getId().equals(d.getUser().getId())).count();
        assertThat(realDocsBefore).isEqualTo(1);

        demoAccounts.resetData();

        List<Resume> demoResumes = resumeRepository.findByUserId(demo.getId());
        assertThat(demoResumes).extracting(Resume::getLabel).doesNotContain("Visitor made this");
        assertThat(resumeDocRepository.findAll().stream().filter(d -> demo.getId().equals(d.getUser().getId()))).isEmpty();
        assertThat(resumeRepository.findByUserId(real.getId())).extracting(Resume::getLabel).contains("Real resume");
        assertThat(resumeDocRepository.findAll().stream().filter(d -> real.getId().equals(d.getUser().getId())).count()).isEqualTo(1);
    }
}
