package com.dossier.api.service;

import com.dossier.api.domain.InboxConnection;
import com.dossier.api.domain.Notification;
import com.dossier.api.domain.User;
import com.dossier.api.domain.enumeration.ApplicationStatus;
import com.dossier.api.repository.InboxConnectionRepository;
import com.dossier.api.repository.NotificationRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.security.SecurityUtils;
import com.dossier.api.service.inbox.InboxParser;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.event.EventListener;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/**
 * Notifications (Phase 14.6): when mail moves an application, the user hears about it.
 *
 * <ul>
 *   <li><b>In-app</b>, for every change, with a link that opens the application on the board.</li>
 *   <li><b>Email</b> to the account's own address for <b>Interview and Offer only</b> (user decision
 *       2026-09-22) — the news worth an interruption. The user can switch these off on the Inbox
 *       page.</li>
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

    private final NotificationRepository notifications;
    private final InboxConnectionRepository connections;
    private final UserRepository users;
    private final MailService mail;
    private final String baseUrl;

    public NotificationService(
        NotificationRepository notifications,
        InboxConnectionRepository connections,
        UserRepository users,
        MailService mail,
        @Value("${jhipster.mail.base-url:http://localhost:3000}") String baseUrl
    ) {
        this.notifications = notifications;
        this.connections = connections;
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
        Notification n = new Notification();
        n.setUserId(e.userId());
        n.setKind(Notification.STATUS_FROM_MAIL);
        n.setTitle(job);
        n.setBody(WORDS.getOrDefault(e.to(), "Updated") + " — from an email in your inbox.");
        n.setLink("/board?app=" + e.applicationId());
        n.setApplicationId(e.applicationId());
        n.setStatus(e.to().name());
        notifications.save(n);

        boolean worthAnEmail = e.to() == ApplicationStatus.INTERVIEW || e.to() == ApplicationStatus.OFFER;
        if (!worthAnEmail || sent.isBefore(now.minus(EMAIL_WINDOW))) return;
        boolean wanted = connections.findById(e.userId()).map(InboxConnection::isNotifyEmail).orElse(false);
        if (!wanted) return;
        users
            .findById(e.userId())
            .ifPresent(u -> {
                mail.sendStatusChangeEmail(u, e.company(), e.role() == null || e.role().isBlank() ? "the role" : e.role(), e.to().name(), baseUrl + n.getLink());
                LOG.info("Sent a {} email for an application", e.to());
            });
    }

    @Transactional(readOnly = true)
    public Inbox mine() {
        User u = currentUser();
        List<View> items = notifications
            .findTop30ByUserIdOrderByCreatedAtDesc(u.getId())
            .stream()
            .map(n -> new View(n.getId(), n.getTitle(), n.getBody(), n.getLink(), n.getCreatedAt(), n.getReadAt() != null))
            .toList();
        return new Inbox(notifications.countByUserIdAndReadAtIsNull(u.getId()), items);
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

    public void deleteAllForUser(Long userId) {
        notifications.deleteByUser(userId);
    }

    private User currentUser() {
        String login = SecurityUtils.getCurrentUserLogin().orElseThrow(() ->
            new ResponseStatusException(HttpStatus.UNAUTHORIZED, "No authenticated user")
        );
        return users.findOneByLogin(login).orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Authenticated user not found"));
    }
}
