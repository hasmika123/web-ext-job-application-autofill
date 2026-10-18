package com.dossier.api.web.rest;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.Application;
import com.dossier.api.domain.ApplicationEvent;
import com.dossier.api.domain.InboxConnection;
import com.dossier.api.domain.InboxHold;
import com.dossier.api.domain.InboxMessage;
import com.dossier.api.domain.User;
import com.dossier.api.domain.enumeration.ApplicationStatus;
import com.dossier.api.repository.ApplicationEventRepository;
import com.dossier.api.repository.ApplicationRepository;
import com.dossier.api.repository.InboxConnectionRepository;
import com.dossier.api.repository.InboxHoldRepository;
import com.dossier.api.repository.InboxMessageRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.service.ApplicationEventService;
import com.dossier.api.service.dto.TrackerDTOs.EventDTO;
import com.dossier.api.service.inbox.InboxHoldExpiryJob;
import com.dossier.api.service.inbox.InboxParser;
import com.dossier.api.service.inbox.InboxSafetyService;
import com.dossier.api.service.inbox.MailClassifier;
import com.dossier.api.service.inbox.MailEvent;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

/**
 * Inbox safety over HTTP (inbox-safety): a rejection read from mail is HELD, shown for review, accepted or dismissed; an applied change can be undone
 * inside the window and not after; the rejection switch; and nobody sees or touches another person's holds or timeline.
 */
@IntegrationTest
@AutoConfigureMockMvc
@WithMockUser(username = "user")
@Transactional
class InboxReviewIT {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper om;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private InboxMessageRepository messages;

    @Autowired
    private InboxHoldRepository holds;

    @Autowired
    private InboxConnectionRepository connections;

    @Autowired
    private ApplicationRepository applications;

    @Autowired
    private ApplicationEventRepository eventRows;

    @Autowired
    private ApplicationEventService eventService;

    @Autowired
    private InboxParser parser;

    @Autowired
    private InboxSafetyService safety;

    @Autowired
    private InboxHoldExpiryJob expiry;

    private User me;
    private User other;

    @BeforeEach
    void setUp() {
        me = userRepository.findOneByLogin("user").orElseThrow();
        other = userRepository.findOneByLogin("admin").orElseThrow();
    }

    private Application app(User owner, String company, String role, ApplicationStatus status) {
        Application a = new Application().company(company).roleTitle(role).status(status).createdAt(Instant.now()).updatedAt(Instant.now());
        a.setUser(owner);
        return applications.saveAndFlush(a);
    }

    private InboxMessage mail(User owner, String subject, String body, String fromName) {
        InboxMessage m = new InboxMessage();
        m.setUserId(owner.getId());
        m.setFolder("INBOX");
        m.setDirection(InboxMessage.IN);
        m.setUid(1);
        m.setDedupKey(UUID.randomUUID().toString().replace("-", ""));
        m.setSubject(subject);
        m.setFromName(fromName);
        m.setFromAddress("no-reply@greenhouse.io");
        m.setSentAt(Instant.now().minus(Duration.ofHours(2)));
        m.setJobMail(true);
        m.setBodyText(body);
        return messages.saveAndFlush(m);
    }

    private InboxMessage rejectionFor(User owner, String company) {
        return mail(owner, "Your application to " + company, "Dear Sam, we regret to inform you that we are not moving forward with your application.", company + " Recruiting");
    }

    private JsonNode json(String body) throws Exception {
        return om.readTree(body);
    }

    private String fetch(String url) throws Exception {
        return mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get(url)).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
    }

    @Test
    void aRejectionIsHeldShownAndAcceptedOnlyByThePerson() throws Exception {
        Application a = app(me, "Initech", "Engineer", ApplicationStatus.APPLIED);
        rejectionFor(me, "Initech");

        parser.parse(me.getId(), "me@gmail.com");

        // Held, not applied.
        assertThat(applications.findById(a.getId()).orElseThrow().getStatus()).isEqualTo(ApplicationStatus.APPLIED);
        JsonNode review = json(fetch("/api/inbox/review"));
        assertThat(review.path("count").asInt()).isEqualTo(1);
        JsonNode item = review.path("items").get(0);
        assertThat(item.path("kind").asText()).isEqualTo("REJECTION");
        assertThat(item.path("applicationId").asLong()).isEqualTo(a.getId());
        assertThat(item.path("company").asText()).isEqualTo("Initech");
        assertThat(item.path("currentStatus").asText()).isEqualTo("APPLIED");
        assertThat(item.path("proposedStatus").asText()).isEqualTo("REJECTED");
        assertThat(item.path("expiresAt").asText()).isNotEmpty();
        assertThat(item.path("evidence").asText().length()).isLessThanOrEqualTo(200);
        long id = item.path("id").asLong();

        // Someone else sees nothing and can do nothing with it (the generic 404).
        mockMvc.perform(get("/api/inbox/review").with(user("admin"))).andExpect(status().isOk()).andExpect(jsonPath("$.count").value(0));
        mockMvc.perform(post("/api/inbox/review/" + id + "/accept").with(user("admin")).contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isNotFound());
        mockMvc.perform(post("/api/inbox/review/" + id + "/dismiss").with(user("admin"))).andExpect(status().isNotFound());

        // The person says yes: the status moves, once.
        mockMvc
            .perform(post("/api/inbox/review/" + id + "/accept").contentType(MediaType.APPLICATION_JSON).content("{}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.application.id").value(a.getId()))
            .andExpect(jsonPath("$.application.status").value("REJECTED"));
        mockMvc.perform(post("/api/inbox/review/" + id + "/accept")).andExpect(status().isOk()).andExpect(jsonPath("$.application.status").value("REJECTED"));
        assertThat(fetch("/api/inbox/review")).contains("\"count\":0");

        // The timeline names the person and offers Undo.
        List<EventDTO> timeline = eventService.recent(a.getId());
        EventDTO row = timeline.stream().filter(e -> e.inboxEventId() != null).findFirst().orElseThrow();
        assertThat(row.undoable()).isTrue();
        assertThat(row.actorKind()).isEqualTo(ApplicationEvent.ACTOR_PERSON);
    }

    @Test
    void dismissingIsRememberedAndIdempotent() throws Exception {
        Application a = app(me, "Hooli", "PM", ApplicationStatus.INTERVIEW);
        rejectionFor(me, "Hooli");
        parser.parse(me.getId(), "me@gmail.com");
        long id = json(fetch("/api/inbox/review")).path("items").get(0).path("id").asLong();

        mockMvc.perform(post("/api/inbox/review/" + id + "/dismiss")).andExpect(status().isNoContent());
        mockMvc.perform(post("/api/inbox/review/" + id + "/dismiss")).andExpect(status().isNoContent());

        assertThat(applications.findById(a.getId()).orElseThrow().getStatus()).isEqualTo(ApplicationStatus.INTERVIEW);
        assertThat(fetch("/api/inbox/review")).contains("\"count\":0");
        // The same mail never asks again: a second pass over it changes nothing and re-holds nothing.
        assertThat(holds.findByUserIdAndStateAndExpiresAtAfterOrderByCreatedAtDesc(me.getId(), InboxHold.PENDING, Instant.now())).isEmpty();
    }

    @Test
    void anAutomaticRejectionCanBeUndoneInsideTheWindowAndNotAfter() throws Exception {
        InboxConnection c = new InboxConnection();
        c.setUserId(me.getId());
        c.setAddress("me@gmail.com");
        c.setPasswordEnc("x");
        connections.saveAndFlush(c);
        mockMvc.perform(get("/api/inbox/settings")).andExpect(status().isOk()).andExpect(jsonPath("$.applyRejectionsAutomatically").value(false));
        mockMvc
            .perform(put("/api/inbox/settings").contentType(MediaType.APPLICATION_JSON).content("{\"applyRejectionsAutomatically\":true}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.applyRejectionsAutomatically").value(true));

        Application a = app(me, "Globex", "Analyst", ApplicationStatus.INTERVIEW);
        rejectionFor(me, "Globex");
        parser.parse(me.getId(), "me@gmail.com");

        assertThat(applications.findById(a.getId()).orElseThrow().getStatus()).isEqualTo(ApplicationStatus.REJECTED);
        EventDTO row = eventService.recent(a.getId()).stream().filter(e -> e.inboxEventId() != null).findFirst().orElseThrow();
        assertThat(row.undoable()).isTrue();
        assertThat(row.actorKind()).isEqualTo(ApplicationEvent.ACTOR_MAIL);

        // Another person cannot undo it.
        mockMvc.perform(post("/api/applications/" + a.getId() + "/inbox-undo/" + row.inboxEventId()).with(user("admin"))).andExpect(status().isNotFound());

        // Undo puts the old status back, writes "Undone by you", and is idempotent.
        mockMvc
            .perform(post("/api/applications/" + a.getId() + "/inbox-undo/" + row.inboxEventId()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.application.status").value("INTERVIEW"));
        mockMvc.perform(post("/api/applications/" + a.getId() + "/inbox-undo/" + row.inboxEventId())).andExpect(status().isOk()).andExpect(jsonPath("$.application.status").value("INTERVIEW"));
        List<EventDTO> after = eventService.recent(a.getId());
        assertThat(after.get(0).summary()).isEqualTo("Undone by you");
        assertThat(after.stream().filter(e -> e.inboxEventId() != null).allMatch(e -> !e.undoable())).isTrue();

        // Past the window the same call is 409 UNDO_EXPIRED.
        Application b = app(me, "Umbrella", "Researcher", ApplicationStatus.APPLIED);
        ApplicationEvent old = eventService.recordAt(
            b,
            ApplicationEvent.STATUS,
            ApplicationStatus.APPLIED,
            ApplicationStatus.INTERVIEW,
            ApplicationEvent.SRC_INBOX,
            null,
            "Moved to Interview - from an email",
            Instant.now().minus(Duration.ofDays(30)),
            com.dossier.api.service.tracker.ChangeActor.mail(),
            null
        );
        b.setStatus(ApplicationStatus.INTERVIEW);
        applications.saveAndFlush(b);
        mockMvc
            .perform(post("/api/applications/" + b.getId() + "/inbox-undo/" + old.getId()))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.code").value("UNDO_EXPIRED"));
    }

    @Test
    void anAmbiguousMailIsHeldWithCandidatesAndNeedsAChoice() throws Exception {
        Application one = app(me, "Acme", "Engineer", ApplicationStatus.APPLIED);
        Application two = app(me, "Acme", "Designer", ApplicationStatus.APPLIED);
        InboxMessage m = mail(me, "Interview invitation", "We would like to schedule an interview.", "Acme Recruiting");
        MailEvent e = new MailEvent(
            m.getId(),
            MailClassifier.Category.INTERVIEW,
            40,
            90,
            40,
            MailEvent.MatchKind.AMBIGUOUS,
            null,
            List.of(new MailEvent.Candidate(one.getId(), 50, MailEvent.MatchKind.COMPANY, "Same company"), new MailEvent.Candidate(two.getId(), 50, MailEvent.MatchKind.COMPANY, "Same company")),
            null,
            "Interview invitation"
        );
        safety.holdAmbiguous(me.getId(), m, e);

        JsonNode item = json(fetch("/api/inbox/review")).path("items").get(0);
        assertThat(item.path("kind").asText()).isEqualTo("AMBIGUOUS");
        assertThat(item.path("applicationId").isNull()).isTrue();
        assertThat(item.path("candidates").size()).isEqualTo(2);
        long id = item.path("id").asLong();

        mockMvc.perform(post("/api/inbox/review/" + id + "/accept").contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isBadRequest());
        mockMvc
            .perform(post("/api/inbox/review/" + id + "/accept").contentType(MediaType.APPLICATION_JSON).content("{\"applicationId\":" + two.getId() + "}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.application.id").value(two.getId()))
            .andExpect(jsonPath("$.application.status").value("INTERVIEW"));
        assertThat(applications.findById(one.getId()).orElseThrow().getStatus()).isEqualTo(ApplicationStatus.APPLIED);
    }

    @Test
    void anUnansweredHoldExpiresAndChangesNothing() throws Exception {
        Application a = app(me, "Stark", "Welder", ApplicationStatus.APPLIED);
        InboxMessage m = rejectionFor(me, "Stark");
        parser.parse(me.getId(), "me@gmail.com");
        InboxHold h = holds.findFirstByUserIdAndMessageId(me.getId(), m.getId()).orElseThrow();
        h.setExpiresAt(Instant.now().minusSeconds(60));
        holds.saveAndFlush(h);

        assertThat(fetch("/api/inbox/review")).contains("\"count\":0");
        assertThat(expiry.expire(Instant.now())).isGreaterThanOrEqualTo(1);
        mockMvc.perform(post("/api/inbox/review/" + h.getId() + "/accept").contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isConflict());
        assertThat(applications.findById(a.getId()).orElseThrow().getStatus()).isEqualTo(ApplicationStatus.APPLIED);
    }

    @Test
    void theRejectionSwitchNeedsAConnectedInbox() throws Exception {
        mockMvc.perform(get("/api/inbox/settings")).andExpect(status().isOk()).andExpect(jsonPath("$.applyRejectionsAutomatically").value(false));
        mockMvc
            .perform(put("/api/inbox/settings").contentType(MediaType.APPLICATION_JSON).content("{\"applyRejectionsAutomatically\":true}"))
            .andExpect(status().isConflict());
    }

    @Test
    @WithMockUser(username = "user")
    void theStuckListIsForThePlatformAdminOnly() throws Exception {
        mockMvc.perform(get("/api/admin/inbox/stuck")).andExpect(status().isForbidden());
        mockMvc
            .perform(get("/api/admin/inbox/stuck").with(user("admin").roles("ADMIN")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.count").isNumber());
    }
}
