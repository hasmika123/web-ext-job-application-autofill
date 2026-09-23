package com.dossier.api.service.inbox;

import com.dossier.api.repository.InboxMessageRepository;
import java.time.Duration;
import java.time.Instant;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Mail doesn't stay forever (Phase 14.7): every night, messages read more than
 * {@code dossier.inbox.retention-days} (365) ago — by the date they were sent — are deleted. What
 * they did stays: the application's status and the notification are the user's board, not their
 * mail. Disconnecting and deleting the account remove everything at once (14.1, 14.3).
 */
@Component
public class InboxRetention {

    private static final Logger LOG = LoggerFactory.getLogger(InboxRetention.class);

    private final InboxMessageRepository messages;
    private final InboxProperties props;

    public InboxRetention(InboxMessageRepository messages, InboxProperties props) {
        this.messages = messages;
        this.props = props;
    }

    @Scheduled(cron = "${dossier.inbox.retention-cron:0 30 3 * * *}", zone = "UTC")
    public void purge() {
        purge(Instant.now());
    }

    int purge(Instant now) {
        int n = messages.deleteOlderThan(now.minus(Duration.ofDays(props.getRetentionDays())));
        if (n > 0) LOG.info("Deleted {} inbox message(s) past the {}-day retention", n, props.getRetentionDays());
        return n;
    }
}
