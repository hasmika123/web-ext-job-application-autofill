package com.dossier.api.service.inbox;

import com.dossier.api.domain.InboxConnection;
import com.dossier.api.domain.User;
import com.dossier.api.repository.InboxConnectionRepository;
import com.dossier.api.repository.InboxFolderStateRepository;
import com.dossier.api.repository.InboxMessageRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.security.SecurityUtils;
import com.dossier.api.service.EntitlementService;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Pattern;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/**
 * Connecting a user's dedicated Gmail (Phase 14.1, Pro). No Kiwiply address, no forwarding, no
 * OAuth: the user makes a Gmail just for job hunting, turns on 2-Step Verification, creates an app
 * password, and pastes the address and app password here.
 *
 * <p>Before anything is stored, the pair is tried against Gmail: sign in, open the inbox read-only,
 * find the Sent folder, sign out. Only a pair that works is kept, and the app password only ever as
 * {@link SecretBox} ciphertext bound to this user. Two checks happen before Gmail is even asked:
 * the address must be a consumer Gmail ({@code @gmail.com} — Workspace blocks password sign-in),
 * and the password must look like an app password (16 letters) — so a user who pastes their real
 * Google password by mistake never has it sent anywhere.
 *
 * <p>Attempts are limited to five per quarter hour per user, so a wrong password can't be retried
 * into a Google lock-out. Disconnecting deletes the connection and all stored mail; connecting a
 * different Gmail drops what was read from the old one.
 */
@Service
public class InboxService {

    static final Pattern GMAIL = Pattern.compile("^[a-z0-9._%+-]+@(gmail\\.com|googlemail\\.com)$");
    /** Google shows app passwords as four groups of four lower-case letters. */
    static final Pattern APP_PASSWORD = Pattern.compile("^[a-z]{16}$");
    static final int MAX_ATTEMPTS = 5;
    static final Duration ATTEMPT_WINDOW = Duration.ofMinutes(15);

    /** What the settings page shows. The password never leaves the server in any form. */
    public record View(
        boolean available,
        boolean connected,
        String address,
        String status,
        Instant connectedAt,
        Instant lastCheckedAt,
        String lastError,
        long messages,
        boolean notifyEmail
    ) {}

    /** Published after a successful connect, so the first read starts now rather than at the next quarter hour. */
    public record Connected(Long userId) {}

    /** Why a connect didn't happen — a code for the page, and the sentence to show. */
    public record Refusal(String code, String message, HttpStatus status) {}

    /** Either the new connection's view, or why not. */
    public record ConnectResult(View view, Refusal refusal) {}

    private final InboxConnectionRepository connections;
    private final UserRepository users;
    private final EntitlementService entitlement;
    private final SecretBox box;
    private final ImapGateway imap;
    private final InboxMessageRepository messages;
    private final InboxFolderStateRepository states;
    private final ApplicationEventPublisher events;
    private final Map<Long, Deque<Instant>> attempts = new ConcurrentHashMap<>();

    public InboxService(
        InboxConnectionRepository connections,
        UserRepository users,
        EntitlementService entitlement,
        SecretBox box,
        ImapGateway imap,
        InboxMessageRepository messages,
        InboxFolderStateRepository states,
        ApplicationEventPublisher events
    ) {
        this.connections = connections;
        this.users = users;
        this.entitlement = entitlement;
        this.box = box;
        this.imap = imap;
        this.messages = messages;
        this.states = states;
        this.events = events;
    }

    @Transactional(readOnly = true)
    public View mine() {
        User user = currentUser();
        return connections.findById(user.getId()).map(c -> view(c)).orElse(new View(box.usable(), false, null, null, null, null, null, 0, true));
    }

    /**
     * Try the address and app password against Gmail; keep them only if they work. Deliberately not
     * one transaction: the Gmail sign-in can take seconds, and no database connection is held for it.
     */
    public ConnectResult connect(String rawAddress, String rawPassword) {
        User user = currentUser();
        entitlement.requirePro(user.getLogin());
        if (!box.usable()) {
            return refuse("UNAVAILABLE", "Connecting an inbox isn't available right now. Please try again later.", HttpStatus.SERVICE_UNAVAILABLE);
        }
        String address = rawAddress == null ? "" : rawAddress.trim().toLowerCase(Locale.ROOT);
        if (!GMAIL.matcher(address).matches()) {
            return refuse(
                "NOT_GMAIL",
                "Use a Gmail address (…@gmail.com). Google Workspace and other email providers aren't supported yet.",
                HttpStatus.BAD_REQUEST
            );
        }
        // Google shows it as "abcd efgh ijkl mnop"; the spaces aren't part of it.
        String password = rawPassword == null ? "" : rawPassword.replaceAll("\\s+", "").toLowerCase(Locale.ROOT);
        if (!APP_PASSWORD.matcher(password).matches()) {
            return refuse(
                "APP_PASSWORD_FORMAT",
                "Paste the 16-letter app password Google showed you — not your Gmail password.",
                HttpStatus.BAD_REQUEST
            );
        }
        if (!allowAttempt(user.getId(), Instant.now())) {
            return refuse("TOO_MANY_ATTEMPTS", "That's several tries in a row. Wait a few minutes, then try again.", HttpStatus.TOO_MANY_REQUESTS);
        }

        ImapGateway.Probe probe = imap.probe(address, password);
        if (probe.outcome() != ImapGateway.Outcome.OK) {
            Refusal r = refusalFor(probe.outcome());
            return new ConnectResult(null, r);
        }

        InboxConnection c = connections.findById(user.getId()).orElseGet(() -> new InboxConnection(user.getId()));
        boolean changedAccount = c.getAddress() != null && !c.getAddress().equals(address);
        if (changedAccount) {
            // A different Gmail: nothing read from the old one stays.
            messages.deleteByUser(user.getId());
            states.deleteByUser(user.getId());
        }
        c.setAddress(address);
        c.setPasswordEnc(box.encrypt(password, context(user.getId())));
        c.setSentFolder(probe.sentFolder());
        c.setStatus(InboxConnection.CONNECTED);
        c.setLastError(null);
        c.setConsecutiveFailures(0);
        if (changedAccount || c.getLastCheckedAt() == null) c.setConnectedAt(Instant.now());
        c.setUpdatedAt(Instant.now());
        attempts.remove(user.getId());
        InboxConnection saved = connections.save(c);
        events.publishEvent(new Connected(user.getId()));
        return new ConnectResult(view(saved), null);
    }

    /**
     * Everything Kiwiply holds from the user's inbox, for their data export (14.7): the connection
     * without its password (not even encrypted), and every message read, as stored.
     */
    @Transactional(readOnly = true)
    public Map<String, Object> exportCurrentUser() {
        User user = currentUser();
        Map<String, Object> out = new LinkedHashMap<>();
        out.put(
            "connection",
            connections
                .findById(user.getId())
                .map(c -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("address", c.getAddress());
                    m.put("status", c.getStatus());
                    m.put("connectedAt", c.getConnectedAt());
                    m.put("lastCheckedAt", c.getLastCheckedAt());
                    m.put("emailAboutInterviewsAndOffers", c.isNotifyEmail());
                    return m;
                })
                .orElse(null)
        );
        out.put(
            "messages",
            messages
                .findByUserIdOrderBySentAtDesc(user.getId())
                .stream()
                .map(m -> {
                    Map<String, Object> r = new LinkedHashMap<>();
                    r.put("folder", m.getFolder());
                    r.put("direction", m.getDirection());
                    r.put("sentAt", m.getSentAt());
                    r.put("from", m.getFromAddress());
                    r.put("fromName", m.getFromName());
                    r.put("to", m.getToAddresses());
                    r.put("subject", m.getSubject());
                    r.put("messageId", m.getMessageId());
                    r.put("bodyText", m.getBodyText());
                    r.put("readAs", m.getCategory());
                    r.put("readBy", m.getClassifiedBy());
                    r.put("applicationId", m.getApplicationId());
                    r.put("statusChange", m.getStatusChange());
                    return r;
                })
                .toList()
        );
        return out;
    }

    /** The user's switch for emails about interviews and offers (14.6). */
    @Transactional
    public View setNotifyEmail(boolean on) {
        User user = currentUser();
        InboxConnection c = connections
            .findById(user.getId())
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No inbox connected"));
        c.setNotifyEmail(on);
        return view(connections.save(c));
    }

    /** Forget the inbox: the connection, its password, and every message read from it. */
    @Transactional
    public void disconnect() {
        User user = currentUser();
        deleteAllForUser(user.getId());
    }

    public void deleteAllForUser(Long userId) {
        connections.findById(userId).ifPresent(connections::delete);
        messages.deleteByUser(userId);
        states.deleteByUser(userId);
        attempts.remove(userId);
    }

    /** The associated data every inbox password is bound to — a copy in another row won't decrypt. */
    public static String context(Long userId) {
        return "inbox:" + userId;
    }

    static Refusal refusalFor(ImapGateway.Outcome o) {
        return switch (o) {
            case BAD_CREDENTIALS -> new Refusal(
                "BAD_CREDENTIALS",
                "Gmail didn't accept that address and app password. Check the address, or create a new app password and paste that.",
                HttpStatus.UNPROCESSABLE_ENTITY
            );
            case APP_PASSWORD_REQUIRED -> new Refusal(
                "APP_PASSWORD_REQUIRED",
                "Gmail wants an app password here. Turn on 2-Step Verification for this Gmail, then create an app password (steps 2 and 3).",
                HttpStatus.UNPROCESSABLE_ENTITY
            );
            case WEB_LOGIN_REQUIRED -> new Refusal(
                "WEB_LOGIN_REQUIRED",
                "Google paused sign-ins for this Gmail. Sign in to it once in your browser, then try again.",
                HttpStatus.UNPROCESSABLE_ENTITY
            );
            case IMAP_DISABLED -> new Refusal(
                "IMAP_DISABLED",
                "IMAP is switched off for this Gmail. In Gmail, open Settings → Forwarding and POP/IMAP and enable IMAP.",
                HttpStatus.UNPROCESSABLE_ENTITY
            );
            case UNREACHABLE -> new Refusal("UNREACHABLE", "We couldn't reach Gmail just now. Please try again in a minute.", HttpStatus.BAD_GATEWAY);
            default -> new Refusal("FAILED", "Connecting didn't work. Please try again.", HttpStatus.BAD_GATEWAY);
        };
    }

    boolean allowAttempt(Long userId, Instant now) {
        Deque<Instant> q = attempts.computeIfAbsent(userId, k -> new ArrayDeque<>());
        synchronized (q) {
            while (!q.isEmpty() && q.peekFirst().isBefore(now.minus(ATTEMPT_WINDOW))) q.pollFirst();
            if (q.size() >= MAX_ATTEMPTS) return false;
            q.addLast(now);
            return true;
        }
    }

    private View view(InboxConnection c) {
        return new View(
            box.usable(),
            true,
            c.getAddress(),
            c.getStatus(),
            c.getConnectedAt(),
            c.getLastCheckedAt(),
            c.getLastError(),
            messages.countByUserId(c.getUserId()),
            c.isNotifyEmail()
        );
    }

    private static ConnectResult refuse(String code, String message, HttpStatus status) {
        return new ConnectResult(null, new Refusal(code, message, status));
    }

    private User currentUser() {
        String login = SecurityUtils.getCurrentUserLogin().orElseThrow(() ->
            new ResponseStatusException(HttpStatus.UNAUTHORIZED, "No authenticated user")
        );
        return users.findOneByLogin(login).orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Authenticated user not found"));
    }
}
