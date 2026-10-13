package com.dossier.api.service.ent.dashboard;

import com.dossier.api.repository.ent.OrgDashboardRepository;
import com.dossier.api.service.dto.ent.DashboardDTO;
import com.dossier.api.service.dto.ent.DashboardDTO.State;
import com.dossier.api.service.dto.ent.DashboardDTO.Widget;
import com.dossier.api.service.ent.OrgRoleService;
import com.dossier.api.service.ent.TenantModule;
import com.dossier.api.service.ent.TenantModules;
import com.dossier.api.service.ent.authz.AuthorizationService;
import com.dossier.api.service.ent.authz.AuthzOperation;
import com.dossier.api.service.ent.authz.AuthzRequest;
import com.dossier.api.service.ent.authz.Beneficiary;
import com.dossier.api.service.ent.authz.ScopeEvaluator;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

/**
 * {@code GET /api/orgs/{orgId}/dashboard} (X2.4, 14-organization-administration.md section 2.2): the Org Admin landing page's data.
 *
 * <p>Order of events, each stopping at the first refusal with the same generic 404 as an organization that does not exist: the
 * enterprise and roles flags are on for the organization; the caller holds {@code dashboard.view_org} (the fixed authorization
 * order of {@link AuthorizationService}). Then every provider, in board order:
 * <ol>
 *   <li>the caller holds none of its permissions: the widget is omitted (no placeholder says it exists);</li>
 *   <li>its module is off for the organization or has no tables yet: {@code unavailable / NOT_ENABLED}, no numbers;</li>
 *   <li>otherwise it computes. A provider that throws is logged and shown as {@code error}; the other widgets are unaffected.</li>
 * </ol>
 *
 * <p>Nothing is cached: every figure is a small indexed count over one organization's rows, and a cache keyed by anything but the
 * tenant and the caller would be a leak waiting to happen, so there is none.
 */
@Service
public class OrgDashboardService {

    private static final Logger LOG = LoggerFactory.getLogger(OrgDashboardService.class);

    public static final String PERMISSION = "dashboard.view_org";

    private final DashboardWidgetRegistry registry;
    private final TenantModules modules;
    private final AuthorizationService authorization;
    private final OrgRoleService roles;
    private final ScopeEvaluator scopes;
    private final OrgDashboardRepository repo;
    private final DashboardAlertService alerts;
    private final Clock clock;

    @Autowired
    public OrgDashboardService(
        DashboardWidgetRegistry registry,
        TenantModules modules,
        AuthorizationService authorization,
        OrgRoleService roles,
        ScopeEvaluator scopes,
        OrgDashboardRepository repo,
        DashboardAlertService alerts
    ) {
        this(registry, modules, authorization, roles, scopes, repo, alerts, Clock.systemUTC());
    }

    OrgDashboardService(
        DashboardWidgetRegistry registry,
        TenantModules modules,
        AuthorizationService authorization,
        OrgRoleService roles,
        ScopeEvaluator scopes,
        OrgDashboardRepository repo,
        DashboardAlertService alerts,
        Clock clock
    ) {
        this.registry = registry;
        this.modules = modules;
        this.authorization = authorization;
        this.roles = roles;
        this.scopes = scopes;
        this.repo = repo;
        this.alerts = alerts;
        this.clock = clock;
    }

    /** The widgets {@code me} may see, in board order. */
    public DashboardDTO.Response get(OrgMembership me) {
        gate(me);
        Instant now = Instant.now(clock);
        DashboardContext ctx = new DashboardContext(me.orgId(), me, now, scopes, repo);
        List<Widget> out = new ArrayList<>();
        for (DashboardWidgetProvider p : registry.providers()) {
            if (p.permissions().stream().noneMatch(me::canKey)) continue; // not yours: absent, not greyed
            out.add(widget(p, ctx));
        }
        return new DashboardDTO.Response(me.orgId(), now, out);
    }

    /** Hides the alert {@code key} for this member for 7 days. An unknown key is the generic 404. */
    public DashboardDTO.DismissResponse dismissAlert(OrgMembership me, String key) {
        gate(me);
        if (key == null || !DashboardAlertService.KEYS.contains(key)) throw new OrgNotFoundException();
        Instant until = alerts.dismiss(me.orgId(), me.memberId(), key, Instant.now(clock));
        return new DashboardDTO.DismissResponse(key, until);
    }

    private void gate(OrgMembership me) {
        if (me == null || !roles.rolesFromData(me.orgId())) throw new OrgNotFoundException();
        authorization.require(AuthzRequest.of(me.orgId(), List.of(PERMISSION), Beneficiary.NONE, null, AuthzOperation.READ).withActor(me));
    }

    private Widget widget(DashboardWidgetProvider p, DashboardContext ctx) {
        try {
            if (!moduleOn(p.module(), ctx.orgId())) {
                WidgetResult off = WidgetResult.notEnabled(p.module());
                return new Widget(p.key(), off.state(), off.reason(), off.module(), null);
            }
            WidgetResult r = p.compute(ctx);
            if (r == null) throw new IllegalStateException("the provider returned nothing");
            Object data = r.state() == State.OK ? r.data() : null; // only an ok widget carries data
            return new Widget(p.key(), r.state(), r.reason(), r.module(), data);
        } catch (RuntimeException e) {
            // the widget fails, the page does not; the message stays in the log, never on the wire
            LOG.error("dashboard widget {} failed for org {}", p.key(), ctx.orgId(), e);
            WidgetResult err = WidgetResult.error();
            return new Widget(p.key(), err.state(), err.reason(), null, null);
        }
    }

    /** True for a core widget, or a module whose flag is on; a module name that is not a {@link TenantModule} has no tables yet and is off. */
    private boolean moduleOn(String module, Long orgId) {
        if (module == null) return true;
        Optional<TenantModule> m = TenantModule.ofWire(module);
        return m.isPresent() && modules.isOn(m.get(), orgId);
    }
}
