package com.dossier.api.service.retirement;

import com.dossier.api.service.billing.IdempotencyKey;
import com.dossier.api.service.billing.personal.FakeStripeGateway;
import com.dossier.api.service.billing.StripeGatewayException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;

/**
 * The scripted Stripe of the retirement tests: {@link FakeStripeGateway} plus a record of the schedule, release and cancel-at-period-end calls (the retirement lifecycle's
 * three Stripe moves besides the item update and the proration invoice item the base fake already records). A repeated idempotency key replays the first result and is not
 * recorded again, like Stripe. There is no refund method on the gateway at all (the retirement code has no way to call one); {@link #refundLikeCalls} stays empty by construction
 * and the test that reads it documents the promise.
 */
public class RecordingStripeGateway extends FakeStripeGateway {

    public record ScheduleCall(String subscriptionId, List<ItemQuantity> phaseItems, Instant at, String key, String id) {}

    public record ReleaseCall(String scheduleId, String key) {}

    public record CancelCall(String subscriptionId, boolean cancel, String key) {}

    public final List<ScheduleCall> scheduleCalls = new ArrayList<>();
    public final List<ReleaseCall> releaseCalls = new ArrayList<>();
    public final List<CancelCall> cancelCalls = new ArrayList<>();
    /** Always empty: the gateway has no refund method, so nothing in a retirement can issue one. */
    public final List<String> refundLikeCalls = new ArrayList<>();
    private final Map<String, String> scheduleByKey = new HashMap<>();
    private final Map<String, Boolean> seen = new HashMap<>();
    private int scheduleCounter = 0;
    /** The next release throws this kind (then clears), to prove an already-released schedule is tolerated. */
    public StripeGatewayException.Kind failNextReleaseWith = null;
    /** The next N cancel-at-period-end calls fail with a retryable error before any effect, to prove the next run replays the same key. */
    public int failNextCancels = 0;

    @Override
    public void reset() {
        super.reset();
        scheduleCalls.clear();
        releaseCalls.clear();
        cancelCalls.clear();
        scheduleByKey.clear();
        seen.clear();
        failNextReleaseWith = null;
        failNextCancels = 0;
    }

    @Override
    public String createSchedule(String subscriptionId, List<ItemQuantity> phaseItems, Instant at, IdempotencyKey key) {
        String existing = scheduleByKey.get(key.value());
        if (existing != null) return existing;
        if (!enabled) throw new StripeGatewayException("billing is off", StripeGatewayException.Kind.NOT_ENABLED, null, null);
        String id = "sub_sched_" + (++scheduleCounter);
        scheduleByKey.put(key.value(), id);
        scheduleCalls.add(new ScheduleCall(subscriptionId, List.copyOf(phaseItems), at, key.value(), id));
        return id;
    }

    @Override
    public void releaseSchedule(String scheduleId, IdempotencyKey key) {
        if (failNextReleaseWith != null) {
            StripeGatewayException.Kind k = failNextReleaseWith;
            failNextReleaseWith = null;
            throw new StripeGatewayException("scripted", k, null, null);
        }
        if (seen.putIfAbsent("rel:" + key.value(), true) != null) return;
        releaseCalls.add(new ReleaseCall(scheduleId, key.value()));
    }

    @Override
    public void setCancelAtPeriodEnd(String subscriptionId, boolean cancel, IdempotencyKey key) {
        if (failNextCancels > 0) {
            failNextCancels--;
            throw new StripeGatewayException("scripted failure", StripeGatewayException.Kind.CONNECTION, null, null);
        }
        if (seen.putIfAbsent("cap:" + key.value(), true) != null) return;
        cancelCalls.add(new CancelCall(subscriptionId, cancel, key.value()));
    }

    /**
     * The test doubles every retirement test shares (so they all share one Spring context): this recording Stripe fake and a {@link RecordingMailSender}. Autowire
     * {@link RecordingStripeGateway} and {@link RecordingMailSender} to script and inspect them; call {@code reset()} on each first.
     */
    @TestConfiguration
    public static class Config {

        @Bean
        @Primary
        RecordingStripeGateway recordingStripeGateway() {
            return new RecordingStripeGateway();
        }

        @Bean
        @Primary
        RecordingMailSender recordingMailSender() {
            return new RecordingMailSender();
        }
    }
}
