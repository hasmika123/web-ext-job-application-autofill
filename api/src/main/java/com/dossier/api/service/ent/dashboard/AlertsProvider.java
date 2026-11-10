package com.dossier.api.service.ent.dashboard;

import com.dossier.api.service.dto.ent.DashboardDTO.Alert;
import com.dossier.api.service.dto.ent.DashboardDTO.Alerts;
import java.util.List;
import org.springframework.stereotype.Component;

/** {@code alerts}: the conditions in 14 section 2.3 that hold right now, minus what this member dismissed. Hidden (empty) when there are none. */
@Component
public class AlertsProvider implements DashboardWidgetProvider {

    private final DashboardAlertService alerts;

    public AlertsProvider(DashboardAlertService alerts) {
        this.alerts = alerts;
    }

    @Override
    public String key() {
        return "alerts";
    }

    @Override
    public int order() {
        return 100;
    }

    @Override
    public List<String> permissions() {
        return DashboardAlertService.permissions();
    }

    @Override
    public String module() {
        return null;
    }

    @Override
    public WidgetResult compute(DashboardContext ctx) {
        List<Alert> items = alerts.alerts(ctx);
        return items.isEmpty() ? WidgetResult.empty("NO_ALERTS") : WidgetResult.ok(new Alerts(items));
    }
}
