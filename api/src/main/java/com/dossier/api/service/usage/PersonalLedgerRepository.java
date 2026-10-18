package com.dossier.api.service.usage;

import com.dossier.api.domain.usage.PersonalUsageCounter;
import com.dossier.api.domain.usage.PersonalUsageEvent;
import java.time.Instant;
import java.util.List;
import java.util.Optional;

/**
 * What the personal usage ledger needs from storage (story K7.5). A port so the reserve/commit/release rules are unit-tested without a database
 * (an in-memory implementation) while production uses {@link JpaPersonalLedgerRepository}, whose {@link #lockCounter} is {@code SELECT ... FOR UPDATE}.
 */
public interface PersonalLedgerRepository {
    Optional<PersonalUsageEvent> findEventByKey(String idempotencyKey);

    /** The event, locked for the rest of the transaction. */
    Optional<PersonalUsageEvent> lockEvent(Long id);

    PersonalUsageEvent saveEvent(PersonalUsageEvent event);

    /** The counter of one account, service, limit and period, created (used 0) when absent, and locked for the rest of the transaction. */
    PersonalUsageCounter lockCounter(long userId, String featureKey, String limitKey, String periodKey, long allowance);

    PersonalUsageCounter saveCounter(PersonalUsageCounter counter);

    /** Reservations whose time-to-live ran out before {@code now}, oldest first. */
    List<PersonalUsageEvent> expiredReservations(Instant now, int max);
}
