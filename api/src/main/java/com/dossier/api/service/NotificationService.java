package com.dossier.api.service;

import com.dossier.api.domain.Notification;
import com.dossier.api.domain.User;
import com.dossier.api.domain.enumeration.ApplicationStatus;
import com.dossier.api.domain.enumeration.NotificationKind;
import com.dossier.api.repository.NotificationRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.security.SecurityUtils;
import com.dossier.api.service.inbox.InboxParser;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.event.EventListener;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/**
 * Notifications (Phase 14.6, E2E-U7.0): the one place a notice is made. {@link #publish} is the generic door:
 * it is idempotent on the payload's dedupe key, asks {@link NotificationPreferenceService} what this user wants
 * for the kind (in-app, email, quiet hours, locked kinds), then stores the in-app row and sends the email
 * accordingly. When mail moves an application, the user hears about it through it:
 *
 * <ul>
 *   <li><b>In-app</b>, for every change, with a link that opens the application on the board.</li>
 *   <li><b>Email</b> to the account's own address for <b>Interview and Offer only</b> (user decision
 *       2026-09-22) — the news worth an interruption — when the user's preferences say so. The same switch
 *       sits on the Inbox page.</li>
 * </ul>
 *
 * <p>Connecting an inbox reads 60 days of history, which can move many applications at once. None of
 * that is news, so mail older than a week notifies no one (the board still updates), and only mail
 * from the last two days sends an email. An application is never told about the same status twice.
 */
@Service
public class NotificationService {

    private static final Logger LOG = LoggerFactory.getLogger(NotificationService.class);
    static final Duration IN_APP_WINDOW = Duration.ofDays(7);
    static final Duration EMAIL_WINDOW = Duration.ofHours(48);
    private static final Map<ApplicationStatus, String> WORDS = Map.of(
        ApplicationStatus.APPLIED,
        "Application confirmed",
        ApplicationStatus.INTERVIEW,
        "Moved to Interview",
        ApplicationStatus.OFFER,
        "Moved to Offer",
        ApplicationStatus.REJECTED,
        "Marked Rejected"
    );

    public record View(Long id, String title, String body, String link, Instant createdAt, boolean read) {}

    public record Inbox(long unread, List<View> items) {}

    /** How to email one notice when the user's preferences allow it ({@code absoluteLink} is already absolute). */
    @FunctionalInterface
    public interface EmailSender {
        void send(User user, String absoluteLink);
    }

    /**
     * What {@link #publish} needs: the words, where to look, and optionally the application it is about, a group
     * (the bell collapses a group), a dedupe key (a second publish with the same key is dropped) and the status
     * it announced. {@code emailWorthy} lets the caller say this one is not worth an email even if the user
     * allows the kind; {@code email} replaces the generic email with a richer one.
     */
    public record Payload(
        String title,
        String body,
        String link,
        Long applicationId,
        String groupKey,
        String dedupeKey,
        String status,
        boolean emailWorthy,
        EmailSender email
    ) {
        public static Payload of(String title, String body, String link) {
            return new Payload(title, body, link, null, null, null, null, true, null);
        }

        public Payload forApplication(Long id) {
            return new Payload(title, body, link, id, groupKey, dedupeKey, status, emailWorthy, email);
        }

        public Payload grouped(String group) {
            return new Payload(title, body, link, applicationId, group, dedupeKey, status, emailWorthy, email);
        }

        public Payload deduped(String key) {
            return new Payload(title, body, link, applicationId, groupKey, key, status, emailWorthy, email);
        }
    }

    private final NotificationRepository notifications;
    private final NotificationPreferenceService preferences;
    private final UserRepository users;
    private final MailService mail;
    private final String baseUrl;

    public NotificationService(
        NotificationRepository notifications,
        NotificationPreferenceService preferences,
        UserRepository users,
        MailService mail,
        @Value("${jhipster.mail.base-url:http://localhost:3000}") String baseUrl
    ) {
        this.notifications = notifications;
        this.preferences = preferences;
        this.users = users;
        this.mail = mail;
        this.baseUrl = baseUrl.replaceAll("/+$", "");
    }

    /** An email moved an application: tell the user, once, if it's news. */
    @EventListener
    public void onStatusChanged(InboxParser.StatusChanged e) {
        notify(e, Instant.now());
    }

    void notify(InboxParser.StatusChanged e, Instant now) {
        if (e.to() == null || e.applicationId() == null) return;
        Instant sent = e.mailSentAt() != null ? e.mailSentAt() : now;
        if (sent.isBefore(now.minus(IN_APP_WINDOW))) return; // history, not news
        if (notifications.existsByUserIdAndApplicationIdAndStatus(e.userId(), e.applicationId(), e.to().name())) return;

        String job = e.company() + (e.role() == null || e.role().isBlank() ? "" : " · " + e.role());
        String role = e.role() == null || e.role().isBlank() ? "the role" : e.role();
        boolean worthAnEmail = (e.to() == ApplicationStatus.INTERVIEW || e.to() == ApplicationStatus.OFFER) && !sent.isBefore(now.minus(EMAIL_WINDOW));
        Payload payload = new Payload(
            job,
            WORDS.getOrDefault(e.to(), "Updated") + " — from an email in your inbox.",
            "/board?app=" + e.applicationId(),
            e.applicationId(),
            null,
            "app:" + e.applicationId() + ":status:" + e.to().name(),
            e.to().name(),
            worthAnEmail,
            (user, link) -> {
                mail.sendStatusChangeEmail(user, e.company(), role, e.to().name(), link);
                LOG.info("Sent a {} email for an application", e.to());
            }
        );
        publish(NotificationKind.APP_STATUS, e.userId(), payload, now);
    }

    /**
     * Make a notice for {@code userId} (E2E-U7.0). Idempotent: a payload whose dedupe key was already published
     * for this user is dropped and nothing is returned. The in-app row is always stored (it is the dedupe
     * ledger), marked muted when the user switched the kind off in-app; the email goes out only when the user's
     * preferences, the locks and quiet hours say so.
     */
    public Optional<Notification> publish(NotificationKind kind, Long userId, Payload payload) {
        return publish(kind, userId, payload, Instant.now());
    }

    Optional<Notification> publish(NotificationKind kind, Long userId, Payload payload, Instant now) {
        String dedupe = payload.dedupeKey();
        if (dedupe != null && notifications.existsByUserIdAndDedupeKey(userId, dedupe)) return Optional.empty();
        NotificationPolicy.Decision decision = preferences.decide(userId, kind, now);

        Notification n = new Notification();
        n.setUserId(userId);
        n.setKind(kind.name());
        n.setTitle(payload.title());
        n.setBody(payload.body());
        n.setLink(payload.link());
        n.setApplicationId(payload.applicationId());
        n.setStatus(payload.status());
        n.setDedupeKey(dedupe);
        n.setGroupKey(payload.groupKey());
        n.setInappMuted(!decision.inapp());
        try {
            n = notifications.save(n);
        } catch (DataIntegrityViolationException raced) {
            return Optional.empty(); // the same dedupe key landed in between
        }

        if (decision.email() && payload.emailWorthy()) {
            String link = payload.link() == null ? baseUrl : payload.link().startsWith("/") ? baseUrl + payload.link() : payload.link();
            users
                .findById(userId)
                .ifPresent(u -> {
                    if (payload.email() != null) payload.email().send(u, link);
                    else mail.sendNotificationEmail(u, kind.title(), payload.title(), payload.body(), link);
                });
        }
        return Optional.of(n);
    }

    @Transactional(readOnly = true)
    public Inbox mine() {
        User u = currentUser();
        List<View> items = notifications
            .findTop30ByUserIdAndInappMutedFalseOrderByCreatedAtDesc(u.getId())
            .stream()
            .map(n -> new View(n.getId(), n.getTitle(), n.getBody(), n.getLink(), n.getCreatedAt(), n.getReadAt() != null))
            .toList();
        return new Inbox(notifications.countByUserIdAndReadAtIsNullAndInappMutedFalse(u.getId()), items);
    }

    public void markAllRead() {
        notifications.markAllRead(currentUser().getId(), Instant.now());
    }

    @Transactional
    public void markRead(Long id) {
        User u = currentUser();
        Notification n = notifications.findOneByIdAndUserId(id, u.getId()).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (n.getReadAt() == null) n.setReadAt(Instant.now());
    }

    /** Every notification, for the user's data export (14.7). */
    @Transactional(readOnly = true)
    public List<View> exportCurrentUser() {
        User u = currentUser();
        return notifications
            .findByUserIdOrderByCreatedAtDesc(u.getId())
            .stream()
            .map(n -> new View(n.getId(), n.getTitle(), n.getBody(), n.getLink(), n.getCreatedAt(), n.getReadAt() != null))
            .toList();
    }

    /** The user's notifications and notification preferences, for account erasure. */
    public void deleteAllForUser(Long userId) {
        notifications.deleteByUser(userId);
        preferences.deleteAllForUser(userId);
    }

    private User currentUser() {
        String login = SecurityUtils.getCurrentUserLogin().orElseThrow(() ->
            new ResponseStatusException(HttpStatus.UNAUTHORIZED, "No authenticated user")
        );
        return users.findOneByLogin(login).orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Authenticated user not found"));
    }
}
