package com.dossier.api.service.inbox;

import com.dossier.api.domain.Application;
import com.dossier.api.domain.User;
import com.dossier.api.domain.enumeration.ApplicationStatus;
import com.dossier.api.repository.ApplicationRepository;
import java.time.Duration;
import java.time.Instant;
import org.springframework.stereotype.Component;

/**
 * Puts the demo consultant's OWN tracker rows in place for the sample mailbox (ent-inbox demo seed). It lives with the inbox, not with the
 * organization code, on purpose: no organization class may set an application's status ({@code NoSubmitSurfaceTest}), and these rows are the person's
 * own board, not an organization record. Called only by the enterprise demo seeder; idempotent by company and role.
 */
@Component
public class DemoInboxApplications {

    private final ApplicationRepository applications;

    public DemoInboxApplications(ApplicationRepository applications) {
        this.applications = applications;
    }

    /** @return 1 when a row was made, 0 when the person already tracks that company and role */
    public int ensure(User user, String company, String role, ApplicationStatus status, long daysAgo) {
        boolean exists = applications.findByUserId(user.getId()).stream().anyMatch(a -> company.equalsIgnoreCase(a.getCompany()) && role.equalsIgnoreCase(a.getRoleTitle()));
        if (exists) return 0;
        Instant at = Instant.now().minus(Duration.ofDays(daysAgo));
        Application a = new Application();
        a.setUser(user);
        a.setCompany(company);
        a.setRoleTitle(role);
        a.setStatus(status);
        a.setSource("demo");
        a.setStarred(false);
        a.setArchived(false);
        a.setSubmissionConfirmed(false);
        a.setAppliedAt(at);
        a.setCreatedAt(at);
        a.setUpdatedAt(at);
        applications.save(a);
        return 1;
    }
}
