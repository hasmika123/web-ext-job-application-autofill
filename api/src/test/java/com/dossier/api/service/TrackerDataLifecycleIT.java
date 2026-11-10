package com.dossier.api.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.Application;
import com.dossier.api.domain.ApplicationEvent;
import com.dossier.api.domain.ApplicationNote;
import com.dossier.api.domain.Interview;
import com.dossier.api.domain.User;
import com.dossier.api.domain.enumeration.ApplicationStatus;
import com.dossier.api.repository.ApplicationEventRepository;
import com.dossier.api.repository.ApplicationNoteRepository;
import com.dossier.api.repository.ApplicationRepository;
import com.dossier.api.repository.InterviewRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.service.billing.StripeGateway;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.annotation.Transactional;

/**
 * The tracker's rows follow the account's life (APP-E2E U6.1): erased on self-serve and admin deletion,
 * included in the data export, and one user's export never carries another's rows.
 */
@IntegrationTest
@Transactional
class TrackerDataLifecycleIT {

    @Autowired
    private AccountDeletionService accountDeletionService;

    @Autowired
    private AccountExportService accountExportService;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private ApplicationRepository applicationRepository;

    @Autowired
    private ApplicationEventRepository eventRepository;

    @Autowired
    private ApplicationNoteRepository noteRepository;

    @Autowired
    private InterviewRepository interviewRepository;

    @MockitoBean
    private StripeGateway stripeGateway;

    private Long appId;
    private Long noteId;
    private Long interviewId;
    private Long strangerEventId;

    @BeforeEach
    void seed() {
        User user = userRepository.findOneByLogin("user").orElseThrow();
        User other = userRepository.findOneByLogin("admin").orElseThrow();

        Application a = application(user, "Acme");
        appId = a.getId();
        event(a.getId(), ApplicationEvent.CREATED);
        event(a.getId(), ApplicationEvent.STATUS);

        ApplicationNote n = new ApplicationNote();
        n.setApplicationId(a.getId());
        n.setBody("Ask about the team size");
        noteId = noteRepository.saveAndFlush(n).getId();

        Interview i = new Interview();
        i.setApplicationId(a.getId());
        i.setUserId(user.getId());
        i.setKind("VIDEO");
        i.setStartsAt(Instant.parse("2026-11-02T15:00:00Z"));
        i.setTz("America/New_York");
        i.setOutcome(Interview.PENDING);
        interviewId = interviewRepository.saveAndFlush(i).getId();

        Application theirs = application(other, "Globex");
        strangerEventId = event(theirs.getId(), ApplicationEvent.CREATED);
    }

    private Application application(User u, String company) {
        Application a = new Application();
        a.setUser(u);
        a.setCompany(company);
        a.setRoleTitle("Engineer");
        a.setStatus(ApplicationStatus.APPLIED);
        a.setCreatedAt(Instant.now());
        a.setUpdatedAt(Instant.now());
        return applicationRepository.saveAndFlush(a);
    }

    private Long event(Long applicationId, String kind) {
        ApplicationEvent e = new ApplicationEvent();
        e.setApplicationId(applicationId);
        e.setKind(kind);
        e.setSource(ApplicationEvent.SRC_WEB);
        return eventRepository.saveAndFlush(e).getId();
    }

    private void assertTrackerRowsGone() {
        assertThat(applicationRepository.findById(appId)).isEmpty();
        assertThat(eventRepository.countByApplicationId(appId)).isZero();
        assertThat(noteRepository.findById(noteId)).isEmpty();
        assertThat(interviewRepository.findById(interviewId)).isEmpty();
        assertThat(eventRepository.findById(strangerEventId)).as("another user's history is untouched").isPresent();
    }

    @Test
    @WithMockUser(username = "user")
    void selfServeDeletionErasesEventsNotesAndInterviews() {
        accountDeletionService.deleteCurrentUserAccount();
        assertTrackerRowsGone();
        assertThat(userRepository.findOneByLogin("user")).isEmpty();
    }

    @Test
    @WithMockUser(username = "admin")
    void adminDeletionErasesEventsNotesAndInterviews() {
        accountDeletionService.deleteUserAccountByLogin("user");
        assertTrackerRowsGone();
    }

    @Test
    @WithMockUser(username = "user")
    void theExportCarriesTheUsersOwnEventsNotesAndInterviewsOnly() {
        Map<String, Object> export = accountExportService.exportCurrentUser();

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> events = (List<Map<String, Object>>) export.get("applicationEvents");
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> notes = (List<Map<String, Object>>) export.get("applicationNotes");
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> interviews = (List<Map<String, Object>>) export.get("interviews");

        assertThat(events).extracting(m -> m.get("applicationId")).containsOnly(appId);
        assertThat(events).extracting(m -> m.get("kind")).contains("CREATED", "STATUS");
        assertThat(notes).singleElement().satisfies(m -> assertThat(m.get("body")).isEqualTo("Ask about the team size"));
        assertThat(interviews).singleElement().satisfies(m -> {
            assertThat(m.get("kind")).isEqualTo("VIDEO");
            assertThat(m.get("tz")).isEqualTo("America/New_York");
        });
    }
}
