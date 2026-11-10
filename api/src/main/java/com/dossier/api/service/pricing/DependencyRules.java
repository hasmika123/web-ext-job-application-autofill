package com.dossier.api.service.pricing;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Feature-dependency semantics of a quote (docs/enterprise-v2/21 section 4, golden G14). Pure. TECHNICAL deps that are free are
 * added silently, paid ones are refused; COMMERCIAL deps need the caller to confirm them (their full price is shown first).
 */
public final class DependencyRules {

    private DependencyRules() {}

    public enum Kind {
        TECHNICAL,
        COMMERCIAL,
    }

    /** {@code feature} needs {@code requires}; {@code paid}/{@code priceMinor} describe the required feature's own price line. */
    public record Dependency(String feature, String requires, Kind kind, boolean paid, long priceMinor, String requiresName) {}

    public record Confirmation(String featureKey, String requires, Kind kind, long priceMinor, String name) {}

    public record Outcome(Set<String> finalFeatures, List<String> autoAdded, List<Confirmation> requiresConfirmation) {}

    /**
     * @param features    the feature set the license would have after the change
     * @param confirming  true on confirm/apply: an unconfirmed COMMERCIAL dep is then an error, not just a prompt
     * @param confirmed   the confirmedCommercialDeps the caller sent
     */
    public static Outcome resolve(Set<String> features, List<Dependency> graph, boolean confirming, Set<String> confirmed) {
        Set<String> result = new LinkedHashSet<>(features);
        List<String> auto = new ArrayList<>();
        List<Confirmation> prompts = new ArrayList<>();
        boolean changed = true;
        while (changed) {
            changed = false;
            for (Dependency d : graph) {
                if (!result.contains(d.feature()) || result.contains(d.requires())) {
                    continue;
                }
                if (d.kind() == Kind.TECHNICAL) {
                    if (d.paid()) {
                        throw new PricingException("DEPENDENCY_REQUIRED", d.feature() + " requires " + d.requires(), Map.of("requires", d.requires()));
                    }
                    result.add(d.requires());
                    auto.add(d.requires());
                    changed = true;
                } else if (confirmed.contains(d.requires())) {
                    result.add(d.requires());
                    changed = true;
                } else {
                    if (confirming) {
                        throw new PricingException("DEPENDENCY_UNCONFIRMED", d.feature() + " needs " + d.requires() + " confirmed", Map.of("requires", d.requires()));
                    }
                    if (prompts.stream().noneMatch(p -> p.requires().equals(d.requires()) && p.featureKey().equals(d.feature()))) {
                        prompts.add(new Confirmation(d.feature(), d.requires(), d.kind(), d.priceMinor(), d.requiresName()));
                    }
                }
            }
        }
        return new Outcome(Set.copyOf(result), List.copyOf(auto), List.copyOf(prompts));
    }

    /** Removing the base is a cancel; removing a feature other remaining features technically depend on is refused. */
    public static void checkRemoval(String removedFeature, String baseFeature, Set<String> remaining, List<Dependency> graph) {
        if (removedFeature.equals(baseFeature)) {
            throw new PricingException("DEPENDENCY_BLOCKS_REMOVAL", "removing the base is a cancel, not a feature removal");
        }
        for (Dependency d : graph) {
            if (d.kind() == Kind.TECHNICAL && d.requires().equals(removedFeature) && remaining.contains(d.feature())) {
                throw new PricingException("DEPENDENCY_BLOCKS_REMOVAL", d.feature() + " depends on " + removedFeature, Map.of("dependent", d.feature()));
            }
        }
    }
}
