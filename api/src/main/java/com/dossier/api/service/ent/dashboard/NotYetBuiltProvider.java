package com.dossier.api.service.ent.dashboard;

import java.util.List;

/**
 * A widget whose data does not exist yet (applications, interviews, placements, pipeline, spend, analytics). It is registered so
 * the board has its place and the permission rules are in force, but it can only answer "not enabled": no number, no zero, no
 * sample. The story that builds the module replaces the subclass with a real provider under the same key.
 */
public abstract class NotYetBuiltProvider implements DashboardWidgetProvider {

    private final String key;
    private final int order;
    private final List<String> permissions;
    private final String module;

    protected NotYetBuiltProvider(String key, int order, List<String> permissions, String module) {
        this.key = key;
        this.order = order;
        this.permissions = List.copyOf(permissions);
        this.module = module;
    }

    @Override
    public String key() {
        return key;
    }

    @Override
    public int order() {
        return order;
    }

    @Override
    public List<String> permissions() {
        return permissions;
    }

    @Override
    public String module() {
        return module;
    }

    @Override
    public WidgetResult compute(DashboardContext ctx) {
        return WidgetResult.notEnabled(module);
    }
}
