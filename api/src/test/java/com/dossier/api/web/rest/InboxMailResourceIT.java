package com.dossier.api.web.rest;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.Application;
import com.dossier.api.domain.InboxMessage;
import com.dossier.api.domain.User;
import com.dossier.api.domain.enumeration.ApplicationStatus;
import com.dossier.api.repository.ApplicationRepository;
import com.dossier.api.repository.InboxMessageRepository;
import com.dossier.api.repository.UserRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

/**
 * The inbox on the board (Phase 14.4b) over HTTP: suggestions listed, accepted at the stage the mail
 * showed (folding in the company's other suggestions), dismissed; an application's emails; ownership.
 */
@IntegrationTest
@AutoConfigureMockMvc
@WithMockUser(username = "user")
@Transactional
class InboxMailResourceIT {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper om;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private InboxMessageRepository messages;

    @Autowired
    private ApplicationRepository applications;

    private User me;

    @BeforeEach
    void setUp() {
        me = userRepository.findOneByLogin("user").orElseThrow();
    }

    private InboxMessage mail(User owner, String subject, String category, String company, String role, String suggestion, Long appId, Duration ago) {
        InboxMessage m = new InboxMessage();
        m.setUserId(owner.getId());
        m.setFolder("INBOX");
        m.setDirection(InboxMessage.IN);
        m.setUid(1);
        m.setDedupKey(UUID.randomUUID().toString().replace("-", ""));
        m.setSubject(subject);
        m.setFromName(company + " Recruiting");
        m.setFromAddress("no-reply@lever.co");
        m.setSentAt(Instant.now().minus(ago));
        m.setJobMail(true);
        m.setBodyText("Hi Sam, " + subject + ". We look forward to speaking with you.");
        m.setCategory(category);
        m.setClassifiedBy("RULE");
        m.setCompanyGuess(company);
        m.setRoleGuess(role);
        m.setSuggestion(suggestion);
        m.setApplicationId(appId);
        m.setParsedAt(Instant.now());
        return messages.saveAndFlush(m);
    }

    @Test
    void suggestionsAreListedAndAcceptedAtTheStageTheMailShowed() throws Exception {
        InboxMessage confirm = mail(me, "Thank you for applying to Globex", "APPLIED", "Globex", "Data Analyst", "NEW", null, Duration.ofDays(3));
        InboxMessage invite = mail(me, "Interview with Globex", "INTERVIEW", "Globex", "Data Analyst", "NEW", null, Duration.ofDays(1));

        mockMvc
            .perform(get("/api/profile/inbox/suggestions"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.length()").value(2))
            .andExpect(jsonPath("$[0].id").value(invite.getId())); // newest first

        String body = mockMvc
            .perform(post("/api/profile/inbox/suggestions/" + invite.getId() + "/accept").contentType(MediaType.APPLICATION_JSON).content("{}"))
            .andExpect(status().isOk())
            .andReturn()
            .getResponse()
            .getContentAsString();
        Long appId = om.readTree(body).path("applicationId").asLong();

        Application a = applications.findById(appId).orElseThrow();
        assertThat(a.getCompany()).isEqualTo("Globex");
        assertThat(a.getRoleTitle()).isEqualTo("Data Analyst");
        assertThat(a.getStatus()).isEqualTo(ApplicationStatus.INTERVIEW);
        assertThat(a.getSource()).isEqualTo("inbox");
        assertThat(a.getAppliedAt()).isNotNull();

        // The company's other suggestion is folded into the same application.
        assertThat(messages.findById(confirm.getId()).orElseThrow().getSuggestion()).isEqualTo("ACCEPTED");
        assertThat(messages.findById(confirm.getId()).orElseThrow().getApplicationId()).isEqualTo(appId);
        mockMvc.perform(get("/api/profile/inbox/suggestions")).andExpect(jsonPath("$.length()").value(0));

        // And both now show as the application's emails.
        mockMvc
            .perform(get("/api/profile/applications/" + appId + "/mail"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.length()").value(2))
            .andExpect(jsonPath("$[0].subject").value("Interview with Globex"))
            .andExpect(jsonPath("$[0].snippet").exists());

        // Handled once only.
        mockMvc.perform(post("/api/profile/inbox/suggestions/" + invite.getId() + "/accept")).andExpect(status().isConflict());
    }

    @Test
    void aSuggestionWithoutARoleNeedsOne() throws Exception {
        InboxMessage m = mail(me, "Thanks for applying to Hooli", "APPLIED", "Hooli", null, "NEW", null, Duration.ofDays(1));
        mockMvc.perform(post("/api/profile/inbox/suggestions/" + m.getId() + "/accept")).andExpect(status().isBadRequest());
        mockMvc
            .perform(
                post("/api/profile/inbox/suggestions/" + m.getId() + "/accept")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(om.writeValueAsString(Map.of("roleTitle", "Site Reliability Engineer")))
            )
            .andExpect(status().isOk());
    }

    @Test
    void dismissHidesTheCompanysSuggestions() throws Exception {
        InboxMessage a = mail(me, "Thanks for applying to Initech", "APPLIED", "Initech", "PM", "NEW", null, Duration.ofDays(2));
        mail(me, "Initech assessment", "ASSESSMENT", "Initech, Inc.", "PM", "NEW", null, Duration.ofDays(1));
        mockMvc.perform(post("/api/profile/inbox/suggestions/" + a.getId() + "/dismiss")).andExpect(status().isOk());
        mockMvc.perform(get("/api/profile/inbox/suggestions")).andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    void nobodyElsesMailOrSuggestions() throws Exception {
        User admin = userRepository.findOneByLogin("admin").orElseThrow();
        InboxMessage theirs = mail(admin, "Thanks for applying to Umbrella", "APPLIED", "Umbrella", "Researcher", "NEW", null, Duration.ofDays(1));
        Application theirApp = new Application()
            .company("Umbrella")
            .roleTitle("Researcher")
            .status(ApplicationStatus.APPLIED)
            .createdAt(Instant.now())
            .updatedAt(Instant.now());
        theirApp.setUser(admin);
        theirApp = applications.saveAndFlush(theirApp);

        mockMvc.perform(get("/api/profile/inbox/suggestions")).andExpect(jsonPath("$[?(@.id == " + theirs.getId() + ")]").isEmpty());
        mockMvc.perform(post("/api/profile/inbox/suggestions/" + theirs.getId() + "/accept")).andExpect(status().isNotFound());
        mockMvc.perform(get("/api/profile/applications/" + theirApp.getId() + "/mail")).andExpect(status().isNotFound());
    }
}
