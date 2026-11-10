package com.dossier.api.service.ent.dashboard;

import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import org.springframework.stereotype.Component;

/**
 * Every {@link DashboardWidgetProvider} bean, in board order (09 row 3). Built once at startup: two providers under one key, or a
 * provider with no permission, is a programming error and stops the application rather than showing up as a wrong dashboard.
 * A key with no bean simply is not in the registry, so the page never gets that widget (the web renders its own "not available").
 */
@Component
public class DashboardWidgetRegistry {

    private final List<DashboardWidgetProvider> providers;

    public DashboardWidgetRegistry(List<DashboardWidgetProvider> beans) {
        Set<String> seen = new HashSet<>();
        for (DashboardWidgetProvider p : beans) {
            if (p.key() == null || p.key().isBlank()) throw new IllegalStateException(p.getClass().getName() + " has no widget key");
            if (!seen.add(p.key())) throw new IllegalStateException("two dashboard providers for the key " + p.key());
            if (p.permissions() == null || p.permissions().isEmpty()) throw new IllegalStateException("dashboard provider " + p.key() + " declares no permission");
        }
        this.providers = beans.stream().sorted(Comparator.comparingInt(DashboardWidgetProvider::order).thenComparing(DashboardWidgetProvider::key)).toList();
    }

    /** The providers in board order. */
    public List<DashboardWidgetProvider> providers() {
        return providers;
    }

    /** The registered keys in board order. */
    public List<String> keys() {
        return providers.stream().map(DashboardWidgetProvider::key).toList();
    }
}
