package com.dossier.api.service.ent;

import com.dossier.api.domain.User;
import com.dossier.api.domain.ent.OrgBranding;
import com.dossier.api.domain.enumeration.NotificationKind;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.ent.OrgBrandingRepository;
import com.dossier.api.service.MailService;
import com.dossier.api.service.NotificationService;
import com.dossier.api.service.TenantMailBrand;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.Locale;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * What the people involved are told when an administrator creates an account or resets a password (owner onboarding by the
 * Kiwiply app admin; employees by an Org Admin): the account holder gets the branded e-mail (after commit) and an in-app notice,
 * the creator gets an in-app confirmation. None of it ever carries the temporary password: the creator reads it once in the UI and
 * shares it separately. Failures are logged without the address and never fail the request.
 *
 * <p>An existing account that is merely attached to the organization signs in exactly as before, so it gets the in-app notice only
 * and no e-mail.
 */
@Service
public class AccountOnboardingNotices {

    private static final Logger LOG = LoggerFactory.getLogger(AccountOnboardingNotices.class);
    private static final Pattern HEX = Pattern.compile("#[0-9a-fA-F]{6}");
    private static final DateTimeFormatter EXPIRES = DateTimeFormatter.ofPattern("d MMM yyyy", Locale.ENGLISH).withZone(ZoneOffset.UTC);

    private final MailService mail;
    private final NotificationService notifications;
    private final OrgBrandingRepository brandings;
    private final TenantUrls tenantUrls;
    private final String bannerUrl;

    public AccountOnboardingNotices(
        MailService mail,
        NotificationService notifications,
        OrgBrandingRepository brandings,
        TenantUrls tenantUrls,
        @Value("${dossier.mail.banner-url:}") String bannerUrl
    ) {
        this.mail = mail;
        this.notifications = notifications;
        this.brandings = brandings;
        this.tenantUrls = tenantUrls;
        this.bannerUrl = bannerUrl == null || bannerUrl.isBlank() ? null : bannerUrl.strip();
    }

    /** The organization's e-mail look: its published primary colour and logo, else the Kiwiply defaults. Built from stored data only. */
    public TenantMailBrand brandFor(Long orgId, String host) {
        OrgBranding b = brandings.findByOrgId(orgId).filter(x -> x.getPublishedAt() != null).orElse(null);
        String hex = b != null && b.getPrimaryColor() != null && HEX.matcher(b.getPrimaryColor()).matches() ? b.getPrimaryColor() : null;
        String logo = b != null && b.getLogoKey() != null && host != null ? tenantUrls.originForHost(host) + "/tenant-assets/logo" : null;
        return new TenantMailBrand(hex, bannerUrl, logo);
    }

    /** The sign-in address on the organization's own host. */
    public String signInUrl(String host) {
        return tenantUrls.originForHost(host) + "/login";
    }

    /** An account was created (or an existing one attached). */
    public void accountCreated(Organization org, String host, User person, String roleLabel, boolean owner, boolean accountCreated, Instant expires, User creator) {
        String creatorName = displayName(creator);
        String personName = displayName(person);
        inApp(
            person,
            accountCreated ? "Your " + org.getName() + " account was created" : "You were added to " + org.getName(),
            accountCreated
                ? "Ask " + (creatorName == null ? "your administrator" : creatorName) + " for your temporary password, then sign in and choose your own."
                : "Sign in with your existing password to open " + org.getName() + "."
        );
        inApp(
            creator,
            "Account created for " + (personName == null ? (owner ? "the new owner" : "a new member") : personName),
            accountCreated ? "Share the temporary password with them securely. It stops working on " + EXPIRES.format(expires) + "." : "They already had a Kiwiply account, so no temporary password was issued."
        );
        if (!accountCreated || person.getEmail() == null || host == null) return; // an existing account signs in as before: no mail; no live address, no sign-in link to send
        String to = person.getEmail();
        TenantMailBrand brand = brandFor(org.getId(), host);
        String url = signInUrl(host);
        afterCommit(() -> mail.sendAccountCreatedEmail(to, personName, org.getName(), creatorName, roleLabel, owner, url, EXPIRES.format(expires), brand));
    }

    /** A new temporary password was issued to {@code person}. */
    public void passwordReset(Organization org, String host, User person, Instant expires, User actor) {
        String actorName = displayName(actor);
        String personName = displayName(person);
        inApp(person, "Your password was reset", "Ask " + (actorName == null ? "your administrator" : actorName) + " for the new temporary password, then sign in and choose your own.");
        inApp(actor, "Password reset for " + (personName == null ? "a member" : personName), "Share the new temporary password securely. It stops working on " + EXPIRES.format(expires) + ".");
        if (person.getEmail() == null || host == null) return;
        String to = person.getEmail();
        TenantMailBrand brand = brandFor(org.getId(), host);
        String url = signInUrl(host);
        afterCommit(() -> mail.sendAdminPasswordResetEmail(to, personName, org.getName(), actorName, url, EXPIRES.format(expires), brand));
    }

    private void inApp(User user, String title, String body) {
        if (user == null || user.getId() == null) return;
        try {
            // Kind SYSTEM, not emailed (emailWorthy = false): the account e-mail above is the one message by mail.
            notifications.publish(NotificationKind.SYSTEM, user.getId(), new NotificationService.Payload(title, body, "/", null, null, null, null, false, null));
        } catch (RuntimeException e) {
            LOG.warn("In-app notice could not be recorded ({})", e.getClass().getSimpleName());
        }
    }

    private static String displayName(User u) {
        if (u == null) return null;
        String first = u.getFirstName() == null ? "" : u.getFirstName().strip();
        String last = u.getLastName() == null ? "" : u.getLastName().strip();
        String full = (first + " " + last).strip();
        return full.isEmpty() ? null : full;
    }

    private static void afterCommit(Runnable task) {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(
                new TransactionSynchronization() {
                    @Override
                    public void afterCommit() {
                        task.run();
                    }
                }
            );
        } else {
            task.run();
        }
    }
}
