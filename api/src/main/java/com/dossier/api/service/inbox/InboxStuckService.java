package com.dossier.api.service.inbox;

import com.dossier.api.repository.InboxConnectionRepository;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Platform admin, read-only: which connected inboxes are not being read (inbox-safety). An inbox is stuck when it needs the person to reconnect, or was
 * not polled for more than two poll intervals. Account ids, status and the last poll time only - never an address, a password, a mail or an error text.
 */
@Service
public class InboxStuckService {

    public record Stuck(Long accountId, String status, Instant lastPolledAt) {}

    private final InboxConnectionRepository connections;
    private final Clock clock;

    public InboxStuckService(InboxConnectionRepository connections) {
        this(connections, Clock.systemUTC());
    }

    InboxStuckService(InboxConnectionRepository connections, Clock clock) {
        this.connections = connections;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public List<Stuck> stuck() {
        Instant cutoff = Instant.now(clock).minus(InboxPoller.ROUND.multipliedBy(2));
        return connections.findStuck(cutoff).stream().map(c -> new Stuck(c.getUserId(), c.getStatus(), c.getLastCheckedAt())).toList();
    }
}
