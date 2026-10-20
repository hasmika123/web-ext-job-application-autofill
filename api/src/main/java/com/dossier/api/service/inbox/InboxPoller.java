package com.dossier.api.service.inbox;

import com.dossier.api.domain.InboxConnection;
import com.dossier.api.domain.User;
import com.dossier.api.repository.InboxConnectionRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.repository.org.OrgMemberRepository;
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
 * the user to reconnect aren't read at all, nor are those of people nothing includes inbox tracking for any more
 * ({@link #reconcile}: not Pro and no organization license grants it; the connection is kept and marked, and reading resumes if it comes back). Nothing runs without a usable inbox key.
 */
@Component
public class InboxPoller {

    private static final Logger LOG = LoggerFactory.getLogger(InboxPoller.class);
    static final Duration ROUND = Duration.ofMinutes(15);
    static final Duration MAX_BACKOFF = Duration.ofHours(6);

    private final InboxConnectionRepository connections;
    private final UserRepository users;
    private final InboxEntitlement entitlement;
    private final OrgMemberRepository members;
    private final InboxService service;
    private final InboxSyncService sync;
    private final SecretBox box;
    private final AtomicBoolean running = new AtomicBoolean(false);

    public InboxPoller(
        InboxConnectionRepository connections,
        UserRepository users,
        InboxEntitlement entitlement,
        OrgMemberRepository members,
        InboxService service,
        InboxSyncService sync,
        SecretBox box
    ) {
        this.connections = connections;
        this.users = users;
        this.entitlement = entitlement;
        this.members = members;
        this.service = service;
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
                if (!reconcile(c) || !due(c, now)) continue;
                sync.sync(c.getUserId());
                read++;
            }
            if (read > 0) LOG.info("Read {} connected inbox(es)", read);
        } finally {
            running.set(false);
        }
    }

    /**
     * "Check now" from the consultant's Inbox page: read that one inbox straight away, in the background, through the same gate a scheduled round
     * applies (entitlement, a usable key). The 15-minute round is unchanged; this only brings one read forward.
     */
    @Async
    public void checkNow(Long userId) {
        if (!box.usable() || userId == null) return;
        connections.findById(userId).ifPresent(c -> {
            if (reconcile(c)) sync.sync(userId);
        });
    }

    /** Straight after a connect is committed: read that inbox now, in the background. */
    @Async
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT, fallbackExecution = true)
    public void onConnected(InboxService.Connected e) {
        connections.findById(e.userId()).ifPresent(c -> {
            if (reconcile(c)) sync.sync(e.userId());
        });
    }

    /**
     * Whether this connection may be read right now, and the bookkeeping that follows from the answer. Nothing is ever read silently without a ground:
     * <ul>
     *   <li>the personal account's own Pro plan, or a live organization license that grants {@code inbox.monitoring} (the only ground an enterprise
     *       account can have): read (and a connection that was stopped
     *       comes back to CONNECTED);</li>
     *   <li>neither: the connection is marked {@code NO_ENTITLEMENT} (the page says so) and is not read;</li>
     *   <li>a connection made through an organization whose seat has ended (left, removed, erased): purged with its password and mail. A personal
     *       connection is never purged here.</li>
     * </ul>
     */
    public boolean reconcile(InboxConnection c) {
        Long userId = c.getUserId();
        User owner = users.findById(userId).orElse(null);
        // An enterprise account (decision O4) belongs to its organization: when its seat has ended the connection goes with it. Older rows that
        // recorded connected_via_org_id are still honoured.
        Long orgOfAccount = owner == null ? null : owner.getOrgId();
        Long via = orgOfAccount != null ? orgOfAccount : c.getConnectedViaOrgId();
        if (via != null && seatEnded(userId, via)) {
            service.purgeConnectedVia(userId, via);
            return false;
        }
        // Decision O4 (S8): a SUSPENDED enterprise account is not read (the connection and its mail are kept; reinstating resumes the reading).
        if (orgOfAccount != null && members.findMine(userId).stream().noneMatch(s -> orgOfAccount.equals(s.getOrgId()) && s.getStatus() == OrgMemberStatus.ACTIVE)) return false;
        String login = owner == null ? null : owner.getLogin();
        InboxEntitlement.Decision d = entitlement.decide(userId, login);
        if (d.allowed()) {
            if (InboxConnection.NO_ENTITLEMENT.equals(c.getStatus())) {
                c.setStatus(InboxConnection.CONNECTED);
                c.setLastError(null);
                c.setConsecutiveFailures(0);
                connections.save(c);
            }
            return true;
        }
        if (!InboxConnection.NO_ENTITLEMENT.equals(c.getStatus()) && !InboxConnection.NEEDS_RECONNECT.equals(c.getStatus())) {
            c.setStatus(InboxConnection.NO_ENTITLEMENT);
            c.setLastError(via != null ? "Your organization no longer includes inbox tracking." : "Inbox tracking is part of Pro.");
            connections.save(c);
            LOG.info("An inbox stopped being read: nothing includes inbox tracking for its owner any more");
        }
        return false;
    }

    private boolean seatEnded(Long userId, Long orgId) {
        var seats = members.findMine(userId).stream().filter(s -> orgId.equals(s.getOrgId())).toList();
        return seats.isEmpty() || seats.stream().noneMatch(s -> s.getStatus() == OrgMemberStatus.ACTIVE || s.getStatus() == OrgMemberStatus.SUSPENDED || s.getStatus() == OrgMemberStatus.INVITED);
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
}
