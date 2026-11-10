package com.dossier.api.service.ent.dashboard;

import java.util.List;

/**
 * One widget of the Org Admin dashboard (09 row 3, 14-organization-administration.md section 2.2). A provider is a Spring bean:
 * a later story adds a widget by adding a bean, never by changing {@code OrgDashboardService}. The registry orders providers by
 * {@link #order()} (the board order) and the service decides, before it calls {@link #compute}, whether the caller may see the
 * widget at all (any one of {@link #permissions()}) and whether its {@link #module()} is on for the organization.
 *
 * <p>Real data only: a provider that has no real table behind it yet extends {@link NotYetBuiltProvider} and returns no numbers.
 * A provider that throws is caught by the service and shown as {@code error}; it cannot take the page down.
 */
public interface DashboardWidgetProvider {
    /** The widget key, one of the first column of the table in 14 section 2.2 (a test diffs them). */
    String key();

    /** Position on the board; lower is earlier. */
    int order();

    /** The caller must hold at least one of these (canonical permission keys); with none held the widget is omitted. */
    List<String> permissions();

    /**
     * The module the widget needs: the wire name of a {@code TenantModule} (its flag must be on for the organization), any other
     * name for a module that has no tables yet (always off), or null for a core widget that needs no module.
     */
    String module();

    /** The widget's content for this caller. Called only after the permission and module checks passed. */
    WidgetResult compute(DashboardContext ctx);
}
