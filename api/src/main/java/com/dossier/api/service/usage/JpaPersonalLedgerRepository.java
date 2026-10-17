package com.dossier.api.service.usage;

import com.dossier.api.domain.usage.PersonalUsageCounter;
import com.dossier.api.domain.usage.PersonalUsageEvent;
import com.dossier.api.repository.sub.PersonalUsageCounterRepository;
import com.dossier.api.repository.sub.PersonalUsageEventRepository;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Component;

/** The production {@link PersonalLedgerRepository}: the two Spring Data repositories, the counter read with a pessimistic write lock. */
@Component
public class JpaPersonalLedgerRepository implements PersonalLedgerRepository {

    private final PersonalUsageEventRepository events;
    private final PersonalUsageCounterRepository counters;

    public JpaPersonalLedgerRepository(PersonalUsageEventRepository events, PersonalUsageCounterRepository counters) {
        this.events = events;
        this.counters = counters;
    }

    @Override
    public Optional<PersonalUsageEvent> findEventByKey(String idempotencyKey) {
        return events.findByIdempotencyKey(idempotencyKey);
    }

    @Override
    public Optional<PersonalUsageEvent> lockEvent(Long id) {
        return events.findByIdForUpdate(id);
    }

    @Override
    public PersonalUsageEvent saveEvent(PersonalUsageEvent event) {
        return events.save(event);
    }

    @Override
    public PersonalUsageCounter lockCounter(long userId, String featureKey, String limitKey, String periodKey, long allowance) {
        counters.insertIgnore(userId, featureKey, limitKey, periodKey, allowance, Instant.now());
        return counters
            .findForUpdate(userId, featureKey, limitKey, periodKey)
            .orElseThrow(() -> new IllegalStateException("usage counter vanished right after it was created"));
    }

    @Override
    public PersonalUsageCounter saveCounter(PersonalUsageCounter counter) {
        return counters.save(counter);
    }

    @Override
    public List<PersonalUsageEvent> expiredReservations(Instant now, int max) {
        return events.findExpired(now, PageRequest.of(0, max));
    }
}
