package com.dossier.api.service.inbox;

import static org.assertj.core.api.Assertions.assertThat;

import com.dossier.api.domain.InboxConnection;
import java.time.Duration;
import java.time.Instant;
import org.junit.jupiter.api.Test;

/** When an inbox is due for a read (Phase 14.3): every round, backing off after failures. */
class InboxPollerTest {

    private static final Instant NOW = Instant.parse("2026-09-23T10:00:00Z");

    private static InboxConnection checked(Duration ago, int failures, String status) {
        InboxConnection c = new InboxConnection(1L);
        c.setLastCheckedAt(ago == null ? null : NOW.minus(ago));
        c.setConsecutiveFailures(failures);
        c.setStatus(status);
        return c;
    }

    @Test
    void neverReadIsDue() {
        assertThat(InboxPoller.due(checked(null, 0, InboxConnection.CONNECTED), NOW)).isTrue();
    }

    @Test
    void aHealthyInboxIsReadEveryRound() {
        assertThat(InboxPoller.due(checked(Duration.ofMinutes(15), 0, InboxConnection.CONNECTED), NOW)).isTrue();
        assertThat(InboxPoller.due(checked(Duration.ofSeconds(14 * 60 + 20), 0, InboxConnection.CONNECTED), NOW)).isTrue(); // finished a little late last time
        assertThat(InboxPoller.due(checked(Duration.ofMinutes(5), 0, InboxConnection.CONNECTED), NOW)).isFalse();
    }

    @Test
    void failuresBackOffUpToSixHours() {
        assertThat(InboxPoller.due(checked(Duration.ofMinutes(20), 1, InboxConnection.CONNECTED), NOW)).isFalse(); // 30 min after one failure
        assertThat(InboxPoller.due(checked(Duration.ofMinutes(30), 1, InboxConnection.CONNECTED), NOW)).isTrue();
        assertThat(InboxPoller.due(checked(Duration.ofMinutes(90), 3, InboxConnection.ERROR), NOW)).isFalse(); // 2 h after three
        assertThat(InboxPoller.due(checked(Duration.ofHours(2), 3, InboxConnection.ERROR), NOW)).isTrue();
        assertThat(InboxPoller.due(checked(Duration.ofHours(6), 20, InboxConnection.ERROR), NOW)).isTrue(); // capped
    }

    @Test
    void aRejectedPasswordIsNeverPolled() {
        assertThat(InboxPoller.due(checked(Duration.ofDays(3), 0, InboxConnection.NEEDS_RECONNECT), NOW)).isFalse();
    }
}
