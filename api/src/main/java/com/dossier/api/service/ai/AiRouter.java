package com.dossier.api.service.ai;

import com.dossier.api.security.SecurityUtils;
import com.dossier.api.service.AiMeteringService;
import com.dossier.api.service.ai.AiRuntimeSettings.Route;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import java.time.Duration;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * The one {@link AiProvider} bean (AI-ADMIN-CONFIG-DESIGN 4.2). Every service injects this and calls it as
 * before; the router decides, PER CALL and from {@link AiRuntimeSettings}, which provider adapter answers and on
 * which model, so an admin edit applies on the next request with no restart.
 *
 * <ul>
 *   <li><b>Route</b> - {@code runtime.route(task)}: provider, model, fallback, output ceiling, on/off. The
 *       {@code model} argument (the budget service's decision: routed or economy) wins; blank means the route's.</li>
 *   <li><b>Disabled</b> - server AI off, or the task off: the call fails with a {@code DISABLED} ledger row and
 *       nothing is sent anywhere.</li>
 *   <li><b>One-step fallback</b> - a retryable failure (timeout, 5xx, rate limit, transport, empty answer, provider
 *       off or without a key, input it cannot take) is retried ONCE on the route's fallback provider. A 4xx,
 *       an unknown model or unparsable JSON is the request's fault and never hops provider.</li>
 *   <li><b>Ledger</b> - every failed attempt writes a failure row (its own transaction); a success is stamped with
 *       the provider and latency, and the calling service records it as before.</li>
 * </ul>
 *
 * <p>Provider text never leaves here unscrubbed: error messages pass the registry's {@link AiKeyScrubber}.
 */
public class AiRouter implements AiProvider {

    private static final Logger LOG = LoggerFactory.getLogger(AiRouter.class);

    /** The admin probe: tiny prompt, tiny answer, short fuse. */
    static final String PROBE_PROMPT = "Reply with exactly: OK";
    static final int PROBE_MAX_TOKENS = 16;
    static final int PROBE_TIMEOUT_MS = 15_000;
    static final int PROBE_MESSAGE_MAX = 200;

    /** What one adapter call does, given the adapter and the model to ask. */
    @FunctionalInterface
    private interface Invocation {
        AiResult run(AiProvider adapter, String model) throws AiProviderException;
    }

    /** The outcome of the admin Test: {@code errorKind} null on success; {@code message} is scrubbed and short. */
    public record ProbeResult(boolean ok, String model, int latencyMs, int inputTokens, int cachedTokens, int outputTokens, long costMicros, String errorKind, String message) {}

    private final AiProviderRegistry registry;
    private final AiRuntimeSettings runtime;
    private final AiMeteringService metering;
    private final AiPricing pricing;
    private final MeterRegistry meters;
    private final String defaultModel;

    public AiRouter(
        AiProviderRegistry registry,
        AiRuntimeSettings runtime,
        AiMeteringService metering,
        AiPricing pricing,
        MeterRegistry meters,
        String defaultModel
    ) {
        this.registry = registry;
        this.runtime = runtime;
        this.metering = metering;
        this.pricing = pricing;
        this.meters = meters;
        this.defaultModel = defaultModel == null ? "" : defaultModel;
    }

    @Override
    public String id() {
        return "router";
    }

    /** Server AI is on and at least one enabled provider has what it needs to be called. */
    @Override
    public boolean isConfigured() {
        if (!runtime.globalEnabled()) return false;
        for (String id : registry.ids()) {
            if (runtime.providerEnabled(id) && registry.get(id).isConfigured()) return true;
        }
        return false;
    }

    /** Kept for compatibility; the budget service takes the model from the route instead. */
    @Override
    public String defaultModel() {
        return defaultModel;
    }

    @Override
    public AiResult generate(AiTask task, String model, String question, String context) throws AiProviderException {
        return generate(task, model, question, context, 0);
    }

    @Override
    public AiResult generate(AiTask task, String model, String question, String context, int maxOutputTokens) throws AiProviderException {
        Route route = runtime.route(task);
        String m = isBlank(model) ? route.model() : model.trim();
        int cap = maxOutputTokens > 0 ? maxOutputTokens : route.maxOutputTokens();
        return execute(task, route, m, (adapter, mm) -> adapter.generate(task, mm, question, context, cap));
    }

    @Override
    public AiResult parseResume(String model, String text, String fileBase64, String fileMimeType) throws AiProviderException {
        Route route = runtime.route(AiTask.PARSE);
        String m = isBlank(model) ? route.model() : model.trim();
        int cap = route.maxOutputTokens();
        return execute(AiTask.PARSE, route, m, (adapter, mm) -> adapter.parseResume(mm, text, fileBase64, fileMimeType, cap));
    }

    // ---- the call -----------------------------------------------------------

    private AiResult execute(AiTask task, Route route, String model, Invocation call) {
        if (!runtime.globalEnabled() || !route.enabled()) {
            recordFailure(task, route.provider(), model, AiErrorKind.DISABLED, 0);
            count(task, route.provider(), AiErrorKind.DISABLED.name());
            throw new AiProviderException("AI is disabled for " + task.wire(), AiErrorKind.DISABLED);
        }
        Attempt first = attempt(task, route.provider(), model, call);
        if (first.result != null) return first.result;

        String fallback = route.fallbackProvider();
        if (first.kind.retryable() && fallback != null && !fallback.equals(route.provider())) {
            String fallbackModel = isBlank(route.fallbackModel()) ? registry.get(fallback).defaultModel() : route.fallbackModel();
            LOG.warn("AI {} failed on {} ({}); trying fallback {}", task.wire(), route.provider(), first.kind, fallback);
            Attempt second = attempt(task, fallback, fallbackModel, call);
            if (second.result != null) return second.result;
            throw second.error;
        }
        throw first.error;
    }

    private record Attempt(AiResult result, AiErrorKind kind, AiProviderException error) {}

    private Attempt attempt(AiTask task, String providerId, String model, Invocation call) {
        AiProvider adapter = registry.get(providerId);
        if (!runtime.providerEnabled(providerId)) return failed(task, providerId, model, AiErrorKind.DISABLED, 0, new AiProviderException("AI provider " + providerId + " is off", AiErrorKind.DISABLED));
        if (!adapter.isConfigured()) return failed(task, providerId, model, AiErrorKind.UNCONFIGURED, 0, new AiProviderException("AI provider " + providerId + " is not configured", AiErrorKind.UNCONFIGURED));

        long t0 = System.nanoTime();
        try {
            AiResult res = call.run(adapter, model);
            int ms = elapsedMs(t0);
            count(task, providerId, "ok");
            time(task, providerId, "ok", ms);
            return new Attempt(res.withProvider(providerId, ms), null, null);
        } catch (AiProviderException e) {
            AiErrorKind kind = AiErrorKind.classify(e);
            return failed(task, providerId, model, kind, elapsedMs(t0), scrubbed(e, kind));
        } catch (RuntimeException e) {
            return failed(task, providerId, model, AiErrorKind.UNKNOWN, elapsedMs(t0), scrubbed(new AiProviderException(e.getClass().getSimpleName(), AiErrorKind.UNKNOWN, e), AiErrorKind.UNKNOWN));
        }
    }

    private Attempt failed(AiTask task, String providerId, String model, AiErrorKind kind, int ms, AiProviderException error) {
        recordFailure(task, providerId, model, kind, ms);
        count(task, providerId, kind.name());
        time(task, providerId, kind.name(), ms);
        return new Attempt(null, kind, error);
    }

    /** The same failure with its message passed through the key scrubber, so nothing that propagates carries a key. */
    private AiProviderException scrubbed(AiProviderException e, AiErrorKind kind) {
        String message = scrubber().scrub(e.getMessage());
        AiProviderException out = e.httpStatus() > 0 ? new AiProviderException(message, e.httpStatus(), null) : new AiProviderException(message, kind);
        return out;
    }

    private void recordFailure(AiTask task, String provider, String model, AiErrorKind kind, int ms) {
        try {
            metering.recordFailure(SecurityUtils.getCurrentUserLogin().orElse(null), task, provider, model, kind, ms);
        } catch (RuntimeException e) {
            // The ledger is bookkeeping: never let it turn a provider failure into a different failure.
            LOG.warn("Could not record the failed AI call ({} on {}): {}", task.wire(), provider, e.getClass().getSimpleName());
        }
    }

    // ---- the admin probe ----------------------------------------------------

    /**
     * The admin "Test connection": one real, metered call of {@link AiTask#PROBE} (16 output tokens, 15 s
     * timeout) straight to {@code providerId}'s adapter - no routing, no fallback. Written to the ledger as
     * {@code probe} either way. A deployment with server AI off (env master) is not called at all.
     */
    public ProbeResult probe(String providerId, String modelOrBlank) {
        AiProvider adapter = registry.get(providerId);
        String model = isBlank(modelOrBlank) ? adapter.defaultModel() : modelOrBlank.trim();
        if (!runtime.envMasterEnabled()) {
            recordFailure(AiTask.PROBE, providerId, model, AiErrorKind.DISABLED, 0);
            return new ProbeResult(false, model, 0, 0, 0, 0, 0, AiErrorKind.DISABLED.name(), "Server AI is off by deployment config (DOSSIER_AI_ENABLED=false).");
        }
        if (!adapter.isConfigured()) {
            recordFailure(AiTask.PROBE, providerId, model, AiErrorKind.UNCONFIGURED, 0);
            return new ProbeResult(false, model, 0, 0, 0, 0, 0, AiErrorKind.UNCONFIGURED.name(), "The provider has no key configured.");
        }
        long t0 = System.nanoTime();
        try {
            AiResult res = adapter.generateWithTimeout(AiTask.PROBE, model, PROBE_PROMPT, "", PROBE_MAX_TOKENS, PROBE_TIMEOUT_MS);
            int ms = elapsedMs(t0);
            AiResult stamped = res.withProvider(providerId, ms);
            metering.record(SecurityUtils.getCurrentUserLogin().orElse(null), AiTask.PROBE, stamped);
            count(AiTask.PROBE, providerId, "ok");
            time(AiTask.PROBE, providerId, "ok", ms);
            long cost = pricing.costMicros(stamped.model(), stamped.inputTokens(), stamped.cachedTokens(), stamped.outputTokens());
            return new ProbeResult(true, stamped.model(), ms, stamped.inputTokens() + stamped.cachedTokens(), stamped.cachedTokens(), stamped.outputTokens(), cost, null, null);
        } catch (RuntimeException e) {
            AiErrorKind kind = AiErrorKind.classify(e);
            int ms = elapsedMs(t0);
            recordFailure(AiTask.PROBE, providerId, model, kind, ms);
            count(AiTask.PROBE, providerId, kind.name());
            time(AiTask.PROBE, providerId, kind.name(), ms);
            String message = scrubber().scrub(e instanceof AiProviderException ? e.getMessage() : e.getClass().getSimpleName(), PROBE_MESSAGE_MAX);
            return new ProbeResult(false, model, ms, 0, 0, 0, 0, kind.name(), message);
        }
    }

    // ---- helpers ------------------------------------------------------------

    private void count(AiTask task, String provider, String outcome) {
        try {
            meters.counter("ai.call.count", "task", task.wire(), "provider", String.valueOf(provider), "outcome", outcome.toLowerCase(java.util.Locale.ROOT)).increment();
        } catch (RuntimeException e) {
            // metrics must never break a call
        }
    }

    private void time(AiTask task, String provider, String outcome, int ms) {
        try {
            Timer.builder("ai.call")
                .tag("task", task.wire())
                .tag("provider", String.valueOf(provider))
                .tag("outcome", outcome.toLowerCase(java.util.Locale.ROOT))
                .register(meters)
                .record(Duration.ofMillis(ms));
        } catch (RuntimeException e) {
            // metrics must never break a call
        }
    }

    private AiKeyScrubber scrubber() {
        AiKeyScrubber s = registry.scrubber();
        return s == null ? AiKeyScrubber.shapesOnly() : s;
    }

    private static int elapsedMs(long startNanos) {
        return (int) Math.min(Integer.MAX_VALUE, (System.nanoTime() - startNanos) / 1_000_000);
    }

    private static boolean isBlank(String s) {
        return s == null || s.isBlank();
    }
}
