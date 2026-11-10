package com.dossier.api.service.ent.dashboard;

import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.dto.ent.DashboardDTO.SubscriptionSummary;
import com.dossier.api.service.org.OrgNotFoundException;
import java.util.List;
import org.springframework.stereotype.Component;

/** {@code subscription.summary}: status only until billing is connected (the organization's state and when its setup fee was paid). */
@Component
public class SubscriptionSummaryProvider implements DashboardWidgetProvider {

    private final OrganizationRepository orgs;

    public SubscriptionSummaryProvider(OrganizationRepository orgs) {
        this.orgs = orgs;
    }

    @Override
    public String key() {
        return "subscription.summary";
    }

    @Override
    public int order() {
        return 130;
    }

    @Override
    public List<String> permissions() {
        return List.of("billing.view");
    }

    @Override
    public String module() {
        return null;
    }

    @Override
    public WidgetResult compute(DashboardContext ctx) {
        Organization org = orgs.findByOrgId(ctx.orgId()).orElseThrow(OrgNotFoundException::new);
        return WidgetResult.ok(new SubscriptionSummary(org.getStatus().name(), org.getSetupFeePaidAt()));
    }
}
