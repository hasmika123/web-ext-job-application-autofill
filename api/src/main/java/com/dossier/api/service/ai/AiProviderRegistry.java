package com.dossier.api.service.ai;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * The provider adapters, by id (AI-ADMIN-CONFIG-DESIGN 4.1). Adapters are deliberately NOT Spring beans: that
 * keeps exactly one {@link AiProvider} bean ({@link AiRouter}), so every existing caller and every
 * {@code @MockitoBean AiProvider} test keeps working. Built once at startup from env (keys are read here and
 * nowhere else); base URLs, timeouts and switches are read live from {@link AiRuntimeSettings} by the adapters.
 *
 * <p>The registry also answers what the admin page may show about a provider's key: only whether one is
 * present and the NAME of the env variable that holds it - never the value, its length or a hash.
 */
public class AiProviderRegistry {

    /** What the registry knows about one provider. */
    public record Entry(
        String id,
        String label,
        String kind,
        String keyEnvVar,
        boolean keyRequired,
        boolean keyPresent,
        List<String> capabilities,
        AiProvider adapter
    ) {}

    private final Map<String, Entry> entries = new LinkedHashMap<>();
    private final AiKeyScrubber scrubber;

    public AiProviderRegistry(List<Entry> entries, AiKeyScrubber scrubber) {
        for (Entry e : entries) this.entries.put(e.id(), e);
        this.scrubber = scrubber == null ? AiKeyScrubber.shapesOnly() : scrubber;
    }

    /** The registered provider ids, in registration order. */
    public Set<String> ids() {
        return new java.util.LinkedHashSet<>(entries.keySet());
    }

    public boolean has(String id) {
        return id != null && entries.containsKey(id);
    }

    /** The adapter for {@code id}; a disabled stand-in for an id nobody registered. */
    public AiProvider get(String id) {
        Entry e = id == null ? null : entries.get(id);
        return e == null ? new DisabledAiProvider(id) : e.adapter();
    }

    public Entry entry(String id) {
        return id == null ? null : entries.get(id);
    }

    public List<Entry> all() {
        return new ArrayList<>(entries.values());
    }

    /** True when the provider's key is set in env. The value itself is not available from here. */
    public boolean keyPresent(String id) {
        Entry e = entry(id);
        return e != null && e.keyPresent();
    }

    /** The name of the env variable that holds the provider's key, e.g. {@code DOSSIER_AI_API_KEY}. */
    public String keyEnvVar(String id) {
        Entry e = entry(id);
        return e == null ? "" : e.keyEnvVar();
    }

    /** The provider's display name, e.g. "Google Gemini". */
    public String label(String id) {
        Entry e = entry(id);
        return e == null ? "" : e.label();
    }

    /** {@code cloud} or {@code local}. */
    public String kind(String id) {
        Entry e = entry(id);
        return e == null ? "" : e.kind();
    }

    public List<String> capabilities(String id) {
        Entry e = entry(id);
        return e == null ? List.of() : e.capabilities();
    }

    public boolean keyRequired(String id) {
        Entry e = entry(id);
        return e != null && e.keyRequired();
    }

    /** Redacts the configured keys from any provider text that is logged or returned. */
    public AiKeyScrubber scrubber() {
        return scrubber;
    }
}
