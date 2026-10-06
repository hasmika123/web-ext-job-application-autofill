package com.dossier.api.service.inbox;

import com.dossier.api.domain.InboxConnection;
import com.dossier.api.domain.User;
import com.dossier.api.repository.InboxConnectionRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.service.EntitlementService;
import java.time.Duration;
import java.time.Instant;
import java.util.concurrent.atomic.AtomicBoolean;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Async;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

/**
 * When connected inboxes are read (Phase 14.3): every 15 minutes ({@code dossier.inbox.poll-cron}),
 * one inbox at a time, and once straight after a user connects so their first read doesn't wait.
 *
 * <p>An inbox is read when it's due: normally once per round; after failures, less often —
 * 30 minutes, an hour, two… up to six hours — so a Gmail outage isn't hammered. Inboxes waiting for
 * the user to reconnect aren't read at all, nor are those of users who are no longer Pro (the
 * connection is kept; reading resumes if they come back). Nothing runs without a usable inbox key.
 */
@Component
public class InboxPoller {

    private static final Logger LOG = LoggerFactory.getLogger(InboxPoller.class);
    static final Duration ROUND = Duration.ofMinutes(15);
    static final Duration MAX_BACKOFF = Duration.ofHours(6);

    private final InboxConnectionRepository connections;
    private final UserRepository users;
    private final EntitlementService entitlement;
    private final InboxSyncService sync;
    private final SecretBox box;
    private final AtomicBoolean running = new AtomicBoolean(false);

    public InboxPoller(
        InboxConnectionRepository connections,
        UserRepository users,
        EntitlementService entitlement,
        InboxSyncService sync,
        SecretBox box
    ) {
        this.connections = connections;
        this.users = users;
        this.entitlement = entitlement;
        this.sync = sync;
        this.box = box;
    }

    @Scheduled(cron = "${dossier.inbox.poll-cron:0 */15 * * * *}", zone = "UTC")
    public void poll() {
        if (!box.usable() || !running.compareAndSet(false, true)) return;
        try {
            Instant now = Instant.now();
            int read = 0;
            for (InboxConnection c : connections.findAll()) {
                if (!due(c, now) || !isPro(c.getUserId())) continue;
                sync.sync(c.getUserId());
                read++;
            }
            if (read > 0) LOG.info("Read {} connected inbox(es)", read);
        } finally {
            running.set(false);
        }
    }

    /** Straight after a connect is committed: read that inbox now, in the background. */
    @Async
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT, fallbackExecution = true)
    public void onConnected(InboxService.Connected e) {
        sync.sync(e.userId());
    }

    /** Whether an inbox should be read in this round. */
    static boolean due(InboxConnection c, Instant now) {
        if (InboxConnection.NEEDS_RECONNECT.equals(c.getStatus())) return false;
        if (c.getLastCheckedAt() == null) return true;
        Duration wait = ROUND;
        if (c.getConsecutiveFailures() > 0) {
            long factor = 1L << Math.min(c.getConsecutiveFailures(), 5); // 2, 4, 8, 16, 32 rounds
            wait = ROUND.multipliedBy(factor);
            if (wait.compareTo(MAX_BACKOFF) > 0) wait = MAX_BACKOFF;
        }
        // A minute's slack, so a read that finished at :00:40 is still due at the next :00.
        return !c.getLastCheckedAt().isAfter(now.minus(wait).plus(Duration.ofMinutes(1)));
    }

    private boolean isPro(Long userId) {
        return users.findById(userId).map(User::getLogin).map(entitlement::isPro).orElse(false);
    }
}
