package com.dossier.api.service.inbox;

import com.dossier.api.repository.InboxHoldRepository;
import java.time.Instant;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Nightly: a held change nobody answered within {@code inbox.review_expiry_days} expires. Nothing is applied by expiring - the application stays as it
 * was, and the row is kept as EXPIRED so the same mail does not ask again.
 */
@Component
public class InboxHoldExpiryJob {

    private final InboxHoldRepository holds;
    private final InboxCounters counters;

    public InboxHoldExpiryJob(InboxHoldRepository holds, InboxCounters counters) {
        this.holds = holds;
        this.counters = counters;
    }

    @Scheduled(cron = "0 20 3 * * *", zone = "UTC")
    public void run() {
        expire(Instant.now());
    }

    /** Expire every pending hold whose time is up; returns how many. */
    @Transactional
    public int expire(Instant now) {
        int n = holds.expire(now);
        counters.count(InboxCounters.EXPIRED, n);
        return n;
    }
}
