package com.dossier.api.service.usage;

import com.dossier.api.domain.usage.PersonalUsageCounter;
import com.dossier.api.domain.usage.PersonalUsageEvent;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.locks.ReentrantLock;
import java.util.function.Supplier;

/**
 * An in-memory {@link PersonalLedgerRepository} whose counter and event locks behave like SELECT ... FOR UPDATE: a lock taken inside {@link #tx} is held
 * until that "transaction" ends, so a second thread asking for the same row waits. That lets the concurrency rule be tested without a database.
 */
class InMemoryLedger implements PersonalLedgerRepository {

    private final Map<String, PersonalUsageEvent> byKey = new ConcurrentHashMap<>();
    private final Map<Long, PersonalUsageEvent> byId = new ConcurrentHashMap<>();
    private final Map<String, PersonalUsageCounter> counters = new ConcurrentHashMap<>();
    private final Map<String, ReentrantLock> locks = new ConcurrentHashMap<>();
    private final AtomicLong ids = new AtomicLong(1);
    private final ThreadLocal<List<ReentrantLock>> held = ThreadLocal.withInitial(ArrayList::new);

    <T> T tx(Supplier<T> body) {
        try {
            return body.get();
        } finally {
            held.get().forEach(ReentrantLock::unlock);
            held.get().clear();
        }
    }

    private void lock(String name) {
        ReentrantLock l = locks.computeIfAbsent(name, k -> new ReentrantLock());
        if (!l.isHeldByCurrentThread()) {
            l.lock();
            held.get().add(l);
        }
    }

    int eventCount() {
        return byId.size();
    }

    PersonalUsageCounter counter(long userId, String feature, String limit, String period) {
        return counters.get(userId + "|" + feature + "|" + limit + "|" + period);
    }

    @Override
    public Optional<PersonalUsageEvent> findEventByKey(String idempotencyKey) {
        return Optional.ofNullable(byKey.get(idempotencyKey));
    }

    @Override
    public Optional<PersonalUsageEvent> lockEvent(Long id) {
        lock("e" + id);
        return Optional.ofNullable(byId.get(id));
    }

    @Override
    public PersonalUsageEvent saveEvent(PersonalUsageEvent event) {
        if (event.getId() == null) event.setId(ids.getAndIncrement());
        byKey.put(event.getIdempotencyKey(), event);
        byId.put(event.getId(), event);
        return event;
    }

    @Override
    public PersonalUsageCounter lockCounter(long userId, String featureKey, String limitKey, String periodKey, long allowance) {
        String k = userId + "|" + featureKey + "|" + limitKey + "|" + periodKey;
        lock("c" + k);
        return counters.computeIfAbsent(k, x -> {
            PersonalUsageCounter c = new PersonalUsageCounter();
            c.setUserId(userId);
            c.setFeatureKey(featureKey);
            c.setLimitKey(limitKey);
            c.setPeriodKey(periodKey);
            c.setUsed(0L);
            c.setAllowance(allowance);
            c.setUpdatedAt(Instant.now());
            return c;
        });
    }

    @Override
    public PersonalUsageCounter saveCounter(PersonalUsageCounter counter) {
        return counter;
    }

    @Override
    public List<PersonalUsageEvent> expiredReservations(Instant now, int max) {
        return byId
            .values()
            .stream()
            .filter(e -> PersonalUsageEvent.RESERVED.equals(e.getStatus()) && e.getExpiresAt() != null && e.getExpiresAt().isBefore(now))
            .sorted(Comparator.comparing(PersonalUsageEvent::getExpiresAt))
            .limit(max)
            .toList();
    }
}
