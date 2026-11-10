package com.dossier.api.web.rest;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.Application;
import com.dossier.api.domain.ApplicationEvent;
import com.dossier.api.domain.User;
import com.dossier.api.domain.enumeration.ApplicationStatus;
import com.dossier.api.repository.ApplicationEventRepository;
import com.dossier.api.repository.ApplicationRepository;
import com.dossier.api.repository.UserRepository;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

/**
 * {@code GET /api/profile/analytics} (APP-E2E U12.1) over the real schema as the seeded "user". Another user's
 * applications ("admin" here) must never change a number, and a fresh account is honestly empty.
 */
@IntegrationTest
@AutoConfigureMockMvc
@WithMockUser(username = "user")
@Transactional
class ProfileAnalyticsResourceIT {

    private static final String URL = "/api/profile/analytics";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ApplicationRepository applicationRepository;

    @Autowired
    private ApplicationEventRepository eventRepository;

    @Autowired
    private UserRepository userRepository;

    private User me;
    private User other;

    @BeforeEach
    void users() {
        me = userRepository.findOneByLogin("user").orElseThrow();
        other = userRepository.findOneByLogin("admin").orElseThrow();
    }

    private Application applied(User owner, String company, ApplicationStatus status, int appliedDaysAgo, ApplicationStatus laterStatus, int laterDaysAgo, String laterSource) {
        Application a = new Application();
        a.setUser(owner);
        a.setCompany(company);
        a.setRoleTitle("Engineer");
        a.setStatus(laterStatus != null ? laterStatus : status);
        a.setCreatedAt(Instant.now().minus(appliedDaysAgo + 1L, ChronoUnit.DAYS));
        a.setUpdatedAt(Instant.now());
        a.setArchived(false);
        a = applicationRepository.saveAndFlush(a);
        event(a, status, appliedDaysAgo, "WEB");
        if (laterStatus != null) event(a, laterStatus, laterDaysAgo, laterSource);
        return a;
    }

    private void event(Application a, ApplicationStatus to, int daysAgo, String source) {
        ApplicationEvent e = new ApplicationEvent();
        e.setApplicationId(a.getId());
        e.setKind(ApplicationEvent.STATUS);
        e.setToStatus(to);
        e.setSource(source);
        e.setCreatedAt(Instant.now().minus(daysAgo, ChronoUnit.DAYS));
        eventRepository.saveAndFlush(e);
    }

    @Test
    void aFreshAccountIsNotRealAndEveryNumberIsZero() throws Exception {
        mockMvc
            .perform(get(URL))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.real").value(false))
            .andExpect(jsonPath("$.range").value(30))
            .andExpect(jsonPath("$.stats.applied").value(0))
            .andExpect(jsonPath("$.stats.responseRate").doesNotExist())
            .andExpect(jsonPath("$.byStatus.length()").value(0))
            .andExpect(jsonPath("$.responseByCompany.length()").value(0));
    }

    @Test
    void numbersComeFromTheEventsAndTheRangeIsHonoured() throws Exception {
        applied(me, "Acme", ApplicationStatus.APPLIED, 20, ApplicationStatus.INTERVIEW, 5, "INBOX");
        applied(me, "Beta", ApplicationStatus.APPLIED, 50, null, 0, null);

        mockMvc
            .perform(get(URL).param("range", "30").param("tz", "America/Chicago"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.real").value(true))
            .andExpect(jsonPath("$.stats.applied").value(1))
            .andExpect(jsonPath("$.stats.replies").value(1))
            .andExpect(jsonPath("$.stats.interviews").value(1))
            .andExpect(jsonPath("$.stats.responseRate").value(100))
            .andExpect(jsonPath("$.inboxSeen").value(true))
            .andExpect(jsonPath("$.responseByCompany[0].company").value("Acme"));
        mockMvc
            .perform(get(URL).param("range", "90"))
            .andExpect(jsonPath("$.stats.applied").value(2))
            .andExpect(jsonPath("$.stats.responseRate").value(50))
            .andExpect(jsonPath("$.granularity").value("week"));
        mockMvc.perform(get(URL).param("range", "365")).andExpect(jsonPath("$.granularity").value("month"));
    }

    @Test
    void anotherUsersApplicationsNeverCount() throws Exception {
        applied(other, "Theirs", ApplicationStatus.APPLIED, 3, ApplicationStatus.OFFER, 1, "INBOX");

        mockMvc
            .perform(get(URL))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.real").value(false))
            .andExpect(jsonPath("$.stats.applied").value(0))
            .andExpect(jsonPath("$.stats.offers").value(0))
            .andExpect(jsonPath("$.inboxSeen").value(false));
    }

    @Test
    void anUnknownTimeZoneIsRefused() throws Exception {
        mockMvc.perform(get(URL).param("tz", "Mars/Olympus")).andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("TRACKER_INVALID"));
    }

    @Test
    @WithUnauthenticatedMockUser
    void signedOutIsRefused() throws Exception {
        mockMvc.perform(get(URL)).andExpect(status().isUnauthorized());
    }
}
