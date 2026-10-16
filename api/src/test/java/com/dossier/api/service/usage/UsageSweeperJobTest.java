package com.dossier.api.service.usage;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Instant;
import org.junit.jupiter.api.Test;

class UsageSweeperJobTest {

    @Test
    void sweepsOneBatchAndSwallowsFailures() {
        UsageLedgerService ledger = mock(UsageLedgerService.class);
        UsageSweeperJob job = new UsageSweeperJob(ledger);
        when(ledger.sweepExpired(any(Instant.class), anyInt())).thenReturn(3).thenThrow(new IllegalStateException("db down"));
        job.sweep();
        job.sweep(); // must not throw: a scheduler thread that dies stops sweeping for good
        verify(ledger, org.mockito.Mockito.times(2)).sweepExpired(any(Instant.class), anyInt());
    }
}
