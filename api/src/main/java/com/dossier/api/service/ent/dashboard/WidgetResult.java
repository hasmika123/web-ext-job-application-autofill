package com.dossier.api.service.ent.dashboard;

import com.dossier.api.service.dto.ent.DashboardDTO.State;

/** What a provider returns: a state, why, and the data (only for {@code ok}). */
public record WidgetResult(State state, String reason, String module, Object data) {
    public static final String NOT_ENABLED = "NOT_ENABLED";
    public static final String PROVIDER_FAILED = "PROVIDER_FAILED";

    public static WidgetResult ok(Object data) {
        return new WidgetResult(State.OK, null, null, data);
    }

    public static WidgetResult empty(String reason) {
        return new WidgetResult(State.EMPTY, reason, null, null);
    }

    /** The module is off or does not exist yet: no numbers at all. */
    public static WidgetResult notEnabled(String module) {
        return new WidgetResult(State.UNAVAILABLE, NOT_ENABLED, module, null);
    }

    public static WidgetResult error() {
        return new WidgetResult(State.ERROR, PROVIDER_FAILED, null, null);
    }
}
