package com.dossier.api.service;

import com.dossier.api.domain.AiCall;
import com.dossier.api.domain.AppSettingHistory;
import com.dossier.api.repository.AiCallRepository;
import com.dossier.api.repository.AiCallStatRow;
import com.dossier.api.repository.AppSettingHistoryRepository;
import com.dossier.api.security.SecurityUtils;
import com.dossier.api.service.AdminSettingsWriter.Risk;
import com.dossier.api.service.ResumeBuilderSettingKeys.Key;
import com.dossier.api.service.ai.AiPricing;
import com.dossier.api.service.ai.AiProvider;
import com.dossier.api.service.ai.AiProviderRegistry;
import com.dossier.api.service.ai.AiRouter;
import com.dossier.api.service.ai.AiRuntimeSettings;
import com.dossier.api.service.ai.AiRuntimeSettings.Resolved;
import com.dossier.api.service.ai.AiRuntimeSettings.Route;
import com.dossier.api.service.ai.AiSettingKeys;
import com.dossier.api.service.ai.AiTask;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Deque;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The admin AI configuration (AI-ADMIN-CONFIG-DESIGN 6): one place that shows which provider and model answers
 * each task, what each model costs and what recent calls did, and that changes them. Every write is validated
 * against the {@link AiSettingKeys} registry and goes through {@link AdminSettingsWriter} (history, audit,
 * cache drop); a PATCH of several fields writes several rows in ONE transaction, so a refusal changes nothing.
 *
 * <p>Keys are never handled here: a provider is described by whether its key is present and the NAME of the env
 * variable that holds it. The Test is a real, metered, audited, rate-limited call recorded as the {@code probe} task.
 */
@Service
public class AdminAiConfigService {

    /** Human names of the tasks, for the routing table. */
    private static final Map<AiTask, String> LABELS = Map.ofEntries(
        Map.entry(AiTask.PARSE, "Resume parsing"),
        Map.entry(AiTask.DRAFT, "Answer drafting"),
        Map.entry(AiTask.PICK, "Option picks"),
        Map.entry(AiTask.MAP, "Field mapping"),
        Map.entry(AiTask.ENRICH, "Job enrichment"),
        Map.entry(AiTask.MATCH, "Resume match"),
        Map.entry(AiTask.FIT, "Job fit"),
        Map.entry(AiTask.TAILOR, "Resume tailoring"),
        Map.entry(AiTask.JOBS, "Daily job matches"),
        Map.entry(AiTask.INBOX, "Inbox reading"),
        Map.entry(AiTask.REWRITE, "Rewrite"),
        Map.entry(AiTask.SUMMARY, "Summary"),
        Map.entry(AiTask.SUGGEST, "Suggestions"),
        Map.entry(AiTask.COVER, "Cover letter"),
        Map.entry(AiTask.TRANSLATE, "Translate"),
        Map.entry(AiTask.PROBE, "Connection test")
    );

    private static final int ERROR_MESSAGE_MAX = 200;
    private static final Duration TEST_WINDOW = Duration.ofHours(1);

    // ---- response shapes ------------------------------------------------------

    public record GlobalView(Resolved<Boolean> enabled) {}

    public record EconomyView(Resolved<String> model, Resolved<Integer> softCapPct) {}

    public record LimitsView(Resolved<Integer> testPerHour, Resolved<Integer> callsWindowHours) {}

    public record LastProbe(Instant at, boolean ok, String model, Integer latencyMs, int inputTokens, int outputTokens, long costMicros, String errorKind) {}

    public record ProviderView(
        String id,
        String label,
        String kind,
        Resolved<Boolean> enabled,
        boolean keyPresent,
        boolean keyRequired,
        String keyEnvVar,
        Resolved<String> baseUrl,
        Resolved<Integer> timeoutMs,
        Resolved<List<String>> models,
        List<String> capabilities,
        boolean configured,
        List<String> usedByTasks,
        LastProbe lastProbe
    ) {}

    public record RouteView(
        String task,
        String label,
        Resolved<Boolean> enabled,
        Resolved<String> provider,
        Resolved<String> model,
        Resolved<String> fallbackProvider,
        Resolved<String> fallbackModel,
        Resolved<Integer> maxOutputTokens,
        String risk
    ) {}

    /** {@code custom}: the admin set a price row; {@code builtin}: a code default exists (when neither, the model is gone). */
    public record PriceView(
        String model,
        Resolved<Integer> inputPerMtokMicros,
        Resolved<Integer> cachedPerMtokMicros,
        Resolved<Integer> outputPerMtokMicros,
        boolean custom,
        boolean builtin
    ) {}

    public record ConfigView(
        boolean envMasterEnabled,
        GlobalView global,
        EconomyView economy,
        List<ProviderView> providers,
        List<RouteView> routes,
        List<PriceView> prices,
        LimitsView limits
    ) {}

    public record TestError(String kind, String message) {}

    /** The Test result; {@code error} is null when {@code ok}. */
    public record TestResult(boolean ok, String model, int latencyMs, int inputTokens, int outputTokens, long costMicros, TestError error) {}

    public record ProviderCalls(String provider, long calls, long failed, int p95LatencyMs) {}

    public record CallsSummary(long calls, long failed, double failedPct, int p95LatencyMs, long costMicros, List<ProviderCalls> byProvider) {}

    public record CallRow(
        Long id,
        Instant createdAt,
        String login,
        String task,
        String provider,
        String model,
        boolean success,
        String errorKind,
        Integer latencyMs,
        int inputTokens,
        int cachedTokens,
        int outputTokens,
        long costMicros
    ) {}

    public record CallsView(CallsSummary summary, List<CallRow> rows, Long nextBefore) {}

    public record HistoryRow(Long id, String key, String oldValue, String newValue, String actorLogin, String reason, Instant changedAt) {}

    // ---- collaborators --------------------------------------------------------

    private final AiRuntimeSettings runtime;
    private final AdminSettingsWriter writer;
    private final AiProviderRegistry registry;
    private final AiProvider provider;
    private final AiPricing pricing;
    private final AiCallRepository calls;
    private final AppSettingHistoryRepository history;
    private final AdminAuditService audit;
    private final ObjectMapper mapper;
    private final Clock clock;
    private final Map<String, Deque<Instant>> testRuns = new ConcurrentHashMap<>();

    @Autowired
    public AdminAiConfigService(
        AiRuntimeSettings runtime,
        AdminSettingsWriter writer,
        AiProviderRegistry registry,
        AiProvider provider,
        AiPricing pricing,
        AiCallRepository calls,
        AppSettingHistoryRepository history,
        AdminAuditService audit,
        ObjectMapper mapper
    ) {
        this(runtime, writer, registry, provider, pricing, calls, history, audit, mapper, Clock.systemUTC());
    }

    AdminAiConfigService(
        AiRuntimeSettings runtime,
        AdminSettingsWriter writer,
        AiProviderRegistry registry,
        AiProvider provider,
        AiPricing pricing,
        AiCallRepository calls,
        AppSettingHistoryRepository history,
        AdminAuditService audit,
        ObjectMapper mapper,
        Clock clock
    ) {
        this.runtime = runtime;
        this.writer = writer;
        this.registry = registry;
        this.provider = provider;
        this.pricing = pricing;
        this.calls = calls;
        this.history = history;
        this.audit = audit;
        this.mapper = mapper;
        this.clock = clock;
    }

    // ---- reads ----------------------------------------------------------------

    @Transactional(readOnly = true)
    public ConfigView config() {
        List<ProviderView> providers = new ArrayList<>();
        for (String id : registry.ids()) providers.add(providerView(id));
        List<RouteView> routes = new ArrayList<>();
        for (AiTask t : AiTask.values()) if (t != AiTask.PROBE) routes.add(routeView(t));
        List<PriceView> prices = new ArrayList<>();
        for (String model : priceModels()) prices.add(priceView(model));
        return new ConfigView(runtime.envMasterEnabled(), globalView(), economyView(), providers, routes, prices, limitsView());
    }

    private GlobalView globalView() {
        return new GlobalView(r(AiSettingKeys.ENABLED));
    }

    private EconomyView economyView() {
        return new EconomyView(r(AiSettingKeys.ECONOMY_MODEL), r(AiSettingKeys.SOFT_CAP_PCT));
    }

    private LimitsView limitsView() {
        return new LimitsView(r(AiSettingKeys.ADMIN_TEST_PER_HOUR), r(AiSettingKeys.CALLS_DEFAULT_WINDOW_HOURS));
    }

    private ProviderView providerView(String id) {
                List<String> usedBy = new ArrayList<>();
        for (AiTask t : AiTask.values()) {
            if (t != AiTask.PROBE && id.equals(runtime.route(t).provider())) usedBy.add(t.wire());
        }
        LastProbe last = calls
            .findFirstByTaskAndProviderOrderByIdDesc(AiTask.PROBE.wire(), id)
            .map(c ->
                new LastProbe(
                    c.getCreatedAt(),
                    c.isSuccess(),
                    c.getModel(),
                    c.getLatencyMs(),
                    c.getInputTokens() + c.getCachedTokens(),
                    c.getOutputTokens(),
                    c.getCostMicros(),
                    c.getErrorKind()
                )
            )
            .orElse(null);
        return new ProviderView(
            id,
            registry.label(id),
            registry.kind(id),
            r(AiSettingKeys.providerKey(id, "enabled")),
            registry.keyPresent(id),
            registry.keyRequired(id),
            registry.keyEnvVar(id),
            r(AiSettingKeys.providerKey(id, "base_url")),
            r(AiSettingKeys.providerKey(id, "timeout_ms")),
            r(AiSettingKeys.providerKey(id, "models")),
            registry.capabilities(id),
            registry.get(id).isConfigured(),
            usedBy,
            last
        );
    }

    private RouteView routeView(AiTask t) {
        return new RouteView(
            t.wire(),
            LABELS.getOrDefault(t, t.wire()),
            r(AiSettingKeys.routeKey(t, "enabled")),
            r(AiSettingKeys.routeKey(t, "provider")),
            r(AiSettingKeys.routeKey(t, "model")),
            r(AiSettingKeys.routeKey(t, "fallback_provider")),
            r(AiSettingKeys.routeKey(t, "fallback_model")),
            r(AiSettingKeys.routeKey(t, "max_output_tokens")),
            t == AiTask.PARSE ? "HIGH" : "MEDIUM"
        );
    }

    /** The models with a price: code defaults and configured names, plus every model the admin has stored a row for. */
    private Set<String> priceModels() {
        Set<String> models = new TreeSet<>();
        for (String m : pricing.getModels().keySet()) if (AiSettingKeys.isModelId(m)) models.add(m);
        models.addAll(runtime.storedPrices().keySet());
        return models;
    }

    private PriceView priceView(String model) {
        boolean custom = runtime.storedPrices().containsKey(model);
        boolean builtin = pricing.getModels().containsKey(model);
        return new PriceView(
            model,
            r(AiSettingKeys.priceKey(model, "input")),
            r(AiSettingKeys.priceKey(model, "cached")),
            r(AiSettingKeys.priceKey(model, "output")),
            custom,
            builtin
        );
    }

    @SuppressWarnings("unchecked")
    private <T> Resolved<T> r(String key) {
        Resolved<Object> o = runtime.resolved(key);
        return new Resolved<>((T) o.value(), o.source(), (T) o.envDefault(), (T) o.codeDefault());
    }

    // ---- writes ---------------------------------------------------------------

    /** {@code PATCH /config/global}: {@code enabled} (null clears the row), {@code reason} (required to turn AI off). */
    @Transactional
    public GlobalView patchGlobal(Map<String, Object> body) {
        requireOnly(body, "enabled", "reason");
        if (!body.containsKey("enabled")) throw AiConfigException.unknownKey("enabled");
        write(AiSettingKeys.ENABLED, body.get("enabled"), reason(body));
        return globalView();
    }

    /** {@code PATCH /providers/{id}}: any of enabled, baseUrl, timeoutMs, models (null clears), reason, force. */
    @Transactional
    public ProviderView patchProvider(String id, Map<String, Object> body) {
        requireProvider(id);
        requireOnly(body, "enabled", "baseUrl", "timeoutMs", "models", "reason", "force");
        String reason = reason(body);
        if (body.containsKey("enabled") && Boolean.FALSE.equals(body.get("enabled")) && !Boolean.TRUE.equals(body.get("force"))) {
            List<String> stranded = new ArrayList<>();
            for (AiTask t : AiTask.values()) {
                if (t == AiTask.PROBE) continue;
                Route route = runtime.route(t);
                if (id.equals(route.provider()) && (route.fallbackProvider() == null || id.equals(route.fallbackProvider()))) stranded.add(t.wire());
            }
            if (!stranded.isEmpty()) throw AiConfigException.providerInUse(id, stranded);
        }
        if (body.containsKey("enabled")) write(AiSettingKeys.providerKey(id, "enabled"), body.get("enabled"), reason);
        if (body.containsKey("baseUrl")) write(AiSettingKeys.providerKey(id, "base_url"), body.get("baseUrl"), reason);
        if (body.containsKey("timeoutMs")) write(AiSettingKeys.providerKey(id, "timeout_ms"), body.get("timeoutMs"), reason);
        if (body.containsKey("models")) write(AiSettingKeys.providerKey(id, "models"), body.get("models"), reason);
        return providerView(id);
    }

    /** {@code PATCH /routes/{task}}: any of enabled, provider, model, fallbackProvider, fallbackModel, maxOutputTokens (null clears), reason. */
    @Transactional
    public RouteView patchRoute(String taskWire, Map<String, Object> body) {
        AiTask task = requireTask(taskWire);
        requireOnly(body, "enabled", "provider", "model", "fallbackProvider", "fallbackModel", "maxOutputTokens", "reason");
        String reason = reason(body);
        if (body.get("provider") instanceof String p && !p.isBlank()) requireUsableProvider(p);
        if (body.get("fallbackProvider") instanceof String p && !p.isBlank() && !"none".equals(p)) requireUsableProvider(p);

        if (body.containsKey("enabled")) write(AiSettingKeys.routeKey(task, "enabled"), body.get("enabled"), reason);
        if (body.containsKey("provider")) write(AiSettingKeys.routeKey(task, "provider"), body.get("provider"), reason);
        if (body.containsKey("model")) write(AiSettingKeys.routeKey(task, "model"), blankToNull(body.get("model")), reason);
        if (body.containsKey("fallbackProvider")) write(AiSettingKeys.routeKey(task, "fallback_provider"), body.get("fallbackProvider"), reason);
        if (body.containsKey("fallbackModel")) write(AiSettingKeys.routeKey(task, "fallback_model"), blankToNull(body.get("fallbackModel")), reason);
        if (body.containsKey("maxOutputTokens")) write(AiSettingKeys.routeKey(task, "max_output_tokens"), body.get("maxOutputTokens"), reason);
        return routeView(task);
    }

    /** {@code DELETE /routes/{task}}: removes all six rows of the route (back to env). */
    @Transactional
    public RouteView deleteRoute(String taskWire) {
        AiTask task = requireTask(taskWire);
        for (String field : AiSettingKeys.ROUTE_FIELDS) write(AiSettingKeys.routeKey(task, field), null, null);
        return routeView(task);
    }

    /** {@code PUT /prices/{model}}: all three of inputPerMtokMicros, cachedPerMtokMicros, outputPerMtokMicros. */
    @Transactional
    public PriceView putPrice(String model, Map<String, Object> body) {
        requireModel(model);
        requireOnly(body, "inputPerMtokMicros", "cachedPerMtokMicros", "outputPerMtokMicros");
        for (String f : List.of("inputPerMtokMicros", "cachedPerMtokMicros", "outputPerMtokMicros")) {
            if (body.get(f) == null) throw AiConfigException.outOfBounds(AiSettingKeys.priceKey(model, f.substring(0, f.indexOf("PerMtok"))), 0d, 100_000_000d, null);
        }
        write(AiSettingKeys.priceKey(model, "input"), body.get("inputPerMtokMicros"), null);
        write(AiSettingKeys.priceKey(model, "cached"), body.get("cachedPerMtokMicros"), null);
        write(AiSettingKeys.priceKey(model, "output"), body.get("outputPerMtokMicros"), null);
        return priceView(model);
    }

    /** {@code DELETE /prices/{model}}: removes the admin's rows (back to the code default, or gone when there is none). */
    @Transactional
    public PriceView deletePrice(String model) {
        requireModel(model);
        for (String part : List.of("input", "cached", "output")) write(AiSettingKeys.priceKey(model, part), null, null);
        return priceView(model);
    }

    // ---- test connection ------------------------------------------------------

    /**
     * {@code POST /providers/{id}/test}: one real metered call, at most {@code ai.admin.test_per_hour} an hour per
     * admin. Always returns when the test RAN (a provider failure is {@code ok=false} with a scrubbed error).
     * Deliberately not transactional: the HTTP call must not hold a database connection.
     */
    public TestResult test(String id, String model) {
        requireProvider(id);
        String m = model == null || model.isBlank() ? null : model.trim();
        if (m != null && !AiSettingKeys.isModelId(m)) throw AiConfigException.modelInvalid(m);
        if (!registry.get(id).isConfigured()) throw AiConfigException.providerNotConfigured(id, registry.keyEnvVar(id));
        String login = SecurityUtils.getCurrentUserLogin().orElse("system");
        reserveTestSlot(login);

        if (!(provider instanceof AiRouter router)) throw new IllegalStateException("The AI provider bean is not the router");
        AiRouter.ProbeResult p = router.probe(id, m);
        audit.record(
            AdminAuditService.AI_PROVIDER_TEST,
            AdminAuditService.TARGET_AI_PROVIDER,
            id,
            null,
            "model=" + p.model() + " ok=" + p.ok() + (p.ok() ? "" : " kind=" + p.errorKind()) + " latencyMs=" + p.latencyMs()
        );
        TestError error = p.ok() ? null : new TestError(p.errorKind(), scrubber().scrub(p.message(), ERROR_MESSAGE_MAX));
        return new TestResult(p.ok(), p.model(), p.latencyMs(), p.inputTokens(), p.outputTokens(), p.costMicros(), error);
    }

    /** Sliding window of the last hour per admin login; throws 429 with the seconds until a slot frees up. */
    private void reserveTestSlot(String login) {
        int limit = runtime.adminTestPerHour();
        Instant now = clock.instant();
        Instant cutoff = now.minus(TEST_WINDOW);
        Deque<Instant> window = testRuns.computeIfAbsent(login, k -> new ArrayDeque<>());
        synchronized (window) {
            while (!window.isEmpty() && !window.peekFirst().isAfter(cutoff)) window.pollFirst();
            if (window.size() >= limit) {
                long retry = Math.max(1, Duration.between(now, window.peekFirst().plus(TEST_WINDOW)).toSeconds() + 1);
                throw AiConfigException.testRateLimited((int) Math.min(retry, TEST_WINDOW.toSeconds()));
            }
            window.addLast(now);
        }
    }

    // ---- calls and history ----------------------------------------------------

    /** {@code GET /calls}: the recent-calls panel - a summary of the window and a page of rows, newest first. */
    @Transactional(readOnly = true)
    public CallsView calls(Integer hours, String task, String providerFilter, boolean failedOnly, Integer limit, Long before) {
        int h = hours == null ? runtime.callsDefaultWindowHours() : Math.min(168, Math.max(1, hours));
        int l = limit == null ? 100 : Math.min(200, Math.max(1, limit));
        String t = task == null ? "" : task.trim().toLowerCase(Locale.ROOT);
        if (!t.isEmpty() && java.util.Arrays.stream(AiTask.values()).noneMatch(x -> x.wire().equals(t))) throw AiConfigException.unknownKey("task=" + t);
        String p = providerFilter == null ? "" : providerFilter.trim().toLowerCase(Locale.ROOT);
        Instant since = clock.instant().minus(Duration.ofHours(h));

        AiCallStatRow.Totals totals = calls.summarize(since, t, p);
        List<AiCallStatRow.Latency> latencies = calls.latencies(since, t, p);
        Map<String, List<Integer>> byProviderLatency = new LinkedHashMap<>();
        List<Integer> all = new ArrayList<>();
        for (AiCallStatRow.Latency lat : latencies) {
            all.add(lat.latencyMs());
            byProviderLatency.computeIfAbsent(lat.provider(), k -> new ArrayList<>()).add(lat.latencyMs());
        }
        List<ProviderCalls> byProvider = new ArrayList<>();
        for (AiCallStatRow.Group g : calls.summarizeByProvider(since, t, p)) {
            byProvider.add(new ProviderCalls(g.key(), n(g.calls()), n(g.failed()), p95(byProviderLatency.getOrDefault(g.key(), List.of()))));
        }
        long total = n(totals.calls());
        long failed = n(totals.failed());
        double failedPct = total == 0 ? 0 : Math.round(failed * 1000.0 / total) / 10.0;
        CallsSummary summary = new CallsSummary(total, failed, failedPct, p95(all), n(totals.costMicros()), byProvider);

        List<AiCall> found = calls.recent(since, t, p, failedOnly, before == null ? Long.MAX_VALUE : before, PageRequest.of(0, l + 1));
        boolean more = found.size() > l;
        List<AiCall> page = more ? found.subList(0, l) : found;
        List<CallRow> rows = new ArrayList<>();
        for (AiCall c : page) {
            rows.add(
                new CallRow(
                    c.getId(),
                    c.getCreatedAt(),
                    c.getLogin(),
                    c.getTask(),
                    c.getProvider(),
                    c.getModel(),
                    c.isSuccess(),
                    c.getErrorKind(),
                    c.getLatencyMs(),
                    c.getInputTokens(),
                    c.getCachedTokens(),
                    c.getOutputTokens(),
                    c.getCostMicros()
                )
            );
        }
        return new CallsView(summary, rows, more ? page.get(page.size() - 1).getId() : null);
    }

    /** {@code GET /config/history}: the newest changes to AI settings (or to one key), newest first. */
    @Transactional(readOnly = true)
    public List<HistoryRow> history(String key, Integer limit) {
        int l = limit == null ? 50 : Math.min(200, Math.max(1, limit));
        List<AppSettingHistory> rows;
        if (key == null || key.isBlank()) {
            rows = history.findByKeyStartingWithOrderByIdDesc("ai.", PageRequest.of(0, l));
        } else {
            rows = history.findByKeyOrderByIdDesc(ResumeBuilderSettingKeys.canonical(key.trim()), PageRequest.of(0, l));
        }
        List<HistoryRow> out = new ArrayList<>();
        for (AppSettingHistory h : rows) {
            out.add(new HistoryRow(h.getId(), h.getKey(), h.getOldValue(), h.getNewValue(), h.getActorLogin(), h.getReason(), h.getChangedAt()));
        }
        return out;
    }

    // ---- validation helpers ---------------------------------------------------

    private void requireProvider(String id) {
        if (id == null || !registry.ids().contains(id)) throw AiConfigException.providerUnknown(id);
    }

    private void requireUsableProvider(String id) {
        requireProvider(id);
        if (!registry.get(id).isConfigured()) throw AiConfigException.providerNotConfigured(id, registry.keyEnvVar(id));
    }

    private AiTask requireTask(String wire) {
        for (AiTask t : AiTask.values()) if (t != AiTask.PROBE && t.wire().equals(wire)) return t;
        throw AiConfigException.unknownKey("ai.route." + wire);
    }

    private void requireModel(String model) {
        if (!AiSettingKeys.isModelId(model)) throw AiConfigException.modelInvalid(model);
    }

    private static void requireOnly(Map<String, Object> body, String... allowed) {
        if (body == null) throw AiConfigException.unknownKey("body");
        Set<String> ok = new LinkedHashSet<>(List.of(allowed));
        for (String f : body.keySet()) if (!ok.contains(f)) throw AiConfigException.unknownKey(f);
    }

    private static String reason(Map<String, Object> body) {
        Object r = body.get("reason");
        return r instanceof String s ? s : null;
    }

    private static Object blankToNull(Object v) {
        return v instanceof String s && s.isBlank() ? null : v;
    }

    /** Converts a JSON value to the setting's stored text (checking its JSON type), then writes it with the right risk. */
    private void write(String key, Object value, String reason) {
        Key k = ResumeBuilderSettingKeys.find(key);
        if (k == null) throw AiConfigException.unknownKey(key);
        String text = value == null ? null : toText(k, value);
        writer.write(key, text, reason, AiSettingKeys.riskOf(key, text));
    }

    private String toText(Key k, Object value) {
        switch (k.type()) {
            case BOOL -> {
                if (value instanceof Boolean b) return b.toString();
            }
            case INT -> {
                if (value instanceof Number n && n.doubleValue() == Math.rint(n.doubleValue()) && Math.abs(n.doubleValue()) < 1e15) return String.valueOf(n.longValue());
            }
            case STRING, ENUM -> {
                if (value instanceof String s) return s;
            }
            case JSON -> {
                if (value instanceof List<?> list) {
                    try {
                        return mapper.writeValueAsString(list);
                    } catch (JsonProcessingException e) {
                        throw AiConfigException.outOfBounds(k.key(), k.min(), k.max(), k.allowed());
                    }
                }
            }
            default -> {
            }
        }
        throw AiConfigException.outOfBounds(k.key(), k.min(), k.max(), k.allowed());
    }

    private com.dossier.api.service.ai.AiKeyScrubber scrubber() {
        com.dossier.api.service.ai.AiKeyScrubber s = registry.scrubber();
        return s == null ? com.dossier.api.service.ai.AiKeyScrubber.shapesOnly() : s;
    }

    private static long n(Long v) {
        return v == null ? 0 : v;
    }

    /** Nearest-rank 95th percentile of latencies in ms (0 when there are none). */
    static int p95(List<Integer> latencies) {
        if (latencies == null || latencies.isEmpty()) return 0;
        List<Integer> sorted = new ArrayList<>(latencies);
        Collections.sort(sorted);
        int idx = (int) Math.ceil(0.95 * sorted.size()) - 1;
        return sorted.get(Math.max(0, Math.min(sorted.size() - 1, idx)));
    }
}
