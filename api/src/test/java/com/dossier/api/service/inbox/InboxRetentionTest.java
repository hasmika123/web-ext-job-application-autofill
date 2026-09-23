package com.dossier.api.service.inbox;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dossier.api.repository.InboxMessageRepository;
import java.time.Duration;
import java.time.Instant;
import org.junit.jupiter.api.Test;

/** Stored mail expires (Phase 14.7): a year after it was sent, by default. */
class InboxRetentionTest {

    @Test
    void mailOlderThanTheRetentionIsDeleted() {
        InboxMessageRepository messages = mock(InboxMessageRepository.class);
        Instant now = Instant.parse("2026-09-23T03:30:00Z");
        when(messages.deleteOlderThan(now.minus(Duration.ofDays(365)))).thenReturn(4);
        InboxProperties props = new InboxProperties();
        assertThat(props.getRetentionDays()).isEqualTo(365);
        assertThat(new InboxRetention(messages, props).purge(now)).isEqualTo(4);
        verify(messages).deleteOlderThan(now.minus(Duration.ofDays(365)));
    }
}
