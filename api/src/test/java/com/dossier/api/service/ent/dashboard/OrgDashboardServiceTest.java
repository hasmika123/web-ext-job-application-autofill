package com.dossier.api.service.ent.dashboard;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.domain.enumeration.PermissionScope;
import com.dossier.api.repository.ent.OrgDashboardRepository;
import com.dossier.api.service.dto.ent.DashboardDTO;
import com.dossier.api.service.dto.ent.DashboardDTO.State;
import com.dossier.api.service.ent.OrgRoleService;
import com.dossier.api.service.ent.TenantModule;
import com.dossier.api.service.ent.TenantModules;
import com.dossier.api.service.ent.authz.AuthorizationService;
import com.dossier.api.service.ent.authz.AuthzReason;
import com.dossier.api.service.ent.authz.ReasonToHttp;
import com.dossier.api.service.ent.authz.ScopeEvaluator;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** The registry loop of {@link OrgDashboardService}: omission, module gating, failure isolation, no data outside {@code ok}, and the gate. */
class OrgDashboardServiceTest {

    private static final Instant NOW = Instant.parse("2026-10-13T10:00:00Z");

    private final AuthorizationService authorization = mock(AuthorizationService.class);
    private final OrgRoleService roles = mock(OrgRoleService.class);
    private final TenantModules modules = mock(TenantModules.class);
    private final DashboardAlertService alerts = mock(DashboardAlertService.class);
    private final List<String> computed = new ArrayList<>();

    @BeforeEach
    void rolesFromData() {
        when(roles.rolesFromData(1L)).thenReturn(true);
    }

    private OrgMembership me(String... keys) {
        Map<String, PermissionScope> grants = new LinkedHashMap<>();
        grants.put("dashboard.view_org", PermissionScope.ORG);
        for (String k : keys) grants.put(k, PermissionScope.ORG);
        return new OrgMembership(1L, 7L, 70L, "admin", OrgRole.ADMIN, OrgMemberStatus.ACTIVE, OrgStatus.ACTIVE, List.of(new OrgMembership.RoleRef(1L, "ORG_ADMIN", "Admin", true)), grants);
    }

    private DashboardWidgetProvider provider(String key, int order, String permission, String module, java.util.function.Supplier<WidgetResult> result) {
        return new DashboardWidgetProvider() {
            public String key() { return key; }
            public int order() { return order; }
            public List<String> permissions() { return List.of(permission); }
            public String module() { return module; }
            public WidgetResult compute(DashboardContext ctx) {
                computed.add(key);
                return result.get();
            }
        };
    }

    private OrgDashboardService service(DashboardWidgetProvider... providers) {
        return new OrgDashboardService(
            new DashboardWidgetRegistry(List.of(providers)),
            modules,
            authorization,
            roles,
            mock(ScopeEvaluator.class),
            mock(OrgDashboardRepository.class),
            alerts,
            Clock.fixed(NOW, ZoneOffset.UTC)
        );
    }

    @Test
    void widgetsComeInBoardOrderAndAWidgetWithoutItsPermissionIsAbsent() {
        OrgDashboardService s = service(
            provider("b", 20, "hr.view", null, () -> WidgetResult.ok("b-data")),
            provider("a", 10, "members.invite", null, () -> WidgetResult.ok("a-data")),
            provider("c", 30, "finance.view", null, () -> WidgetResult.ok("c-data"))
        );
        DashboardDTO.Response r = s.get(me("members.invite", "hr.view"));
        assertThat(r.widgets()).extracting(DashboardDTO.Widget::key).containsExactly("a", "b");
        assertThat(computed).as("a widget the caller may not see is never computed").doesNotContain("c");
        assertThat(r.generatedAt()).isEqualTo(NOW);
        assertThat(r.orgId()).isEqualTo(1L);
    }

    @Test
    void aWidgetWhoseModuleIsOffIsUnavailableWithoutBeingComputed() {
        when(modules.isOn(TenantModule.HR_FINANCE, 1L)).thenReturn(false);
        when(modules.isOn(TenantModule.MARKETING, 1L)).thenReturn(true);
        OrgDashboardService s = service(
            provider("fin", 10, "hr.view", "hrFinance", () -> WidgetResult.ok("secret")),
            provider("mkt", 20, "hr.view", "marketing", () -> WidgetResult.ok("shown")),
            provider("apps", 30, "hr.view", "applications", () -> WidgetResult.ok("never")) // a module that has no tables: always off
        );
        Map<String, DashboardDTO.Widget> w = byKey(s.get(me("hr.view")));
        assertThat(w.get("fin").state()).isEqualTo(State.UNAVAILABLE);
        assertThat(w.get("fin").reason()).isEqualTo("NOT_ENABLED");
        assertThat(w.get("fin").module()).isEqualTo("hrFinance");
        assertThat(w.get("fin").data()).isNull();
        assertThat(w.get("mkt").state()).isEqualTo(State.OK);
        assertThat(w.get("apps").state()).isEqualTo(State.UNAVAILABLE);
        assertThat(computed).containsExactly("mkt");
    }

    @Test
    void aThrowingProviderIsAnErrorWidgetAndTheOthersStillAnswer() {
        OrgDashboardService s = service(
            provider("ok1", 10, "hr.view", null, () -> WidgetResult.ok("one")),
            provider("boom", 20, "hr.view", null, () -> {
                throw new IllegalStateException("jdbc:mysql://secret-host");
            }),
            provider("ok2", 30, "hr.view", null, () -> WidgetResult.ok("two"))
        );
        Map<String, DashboardDTO.Widget> w = byKey(s.get(me("hr.view")));
        assertThat(w.get("boom").state()).isEqualTo(State.ERROR);
        assertThat(w.get("boom").reason()).isEqualTo("PROVIDER_FAILED");
        assertThat(w.get("boom").data()).isNull();
        assertThat(w.get("boom").toString()).doesNotContain("secret-host");
        assertThat(w.get("ok1").data()).isEqualTo("one");
        assertThat(w.get("ok2").data()).isEqualTo("two");
    }

    @Test
    void aProviderReturningNothingIsAnErrorToo() {
        OrgDashboardService s = service(provider("nil", 10, "hr.view", null, () -> null));
        assertThat(s.get(me("hr.view")).widgets().get(0).state()).isEqualTo(State.ERROR);
    }

    @Test
    void dataTravelsOnlyWithTheOkState() {
        OrgDashboardService s = service(
            provider("empty", 10, "hr.view", null, () -> new WidgetResult(State.EMPTY, "NO_ROWS", null, "should not leak")),
            provider("off", 20, "hr.view", null, () -> new WidgetResult(State.UNAVAILABLE, "NOT_ENABLED", "x", 42))
        );
        for (DashboardDTO.Widget w : s.get(me("hr.view")).widgets()) assertThat(w.data()).as(w.key()).isNull();
    }

    @Test
    void theGateIs404WithoutTheRolesFlagOrTheDashboardPermission() {
        OrgDashboardService s = service(provider("a", 10, "hr.view", null, () -> WidgetResult.ok("x")));
        when(roles.rolesFromData(1L)).thenReturn(false);
        assertThatThrownBy(() -> s.get(me("hr.view"))).isInstanceOf(OrgNotFoundException.class);

        when(roles.rolesFromData(1L)).thenReturn(true);
        when(authorization.require(any())).thenThrow(ReasonToHttp.toException(AuthzReason.PERMISSION_DENIED, Map.of()));
        assertThatThrownBy(() -> s.get(me("hr.view"))).isInstanceOf(OrgNotFoundException.class);
        assertThat(computed).isEmpty();
    }

    @Test
    void dismissAcceptsOnlyKnownAlertKeysAndRecordsForTheCallerOnly() {
        OrgDashboardService s = service(provider("a", 10, "hr.view", null, () -> WidgetResult.ok("x")));
        Instant until = NOW.plusSeconds(7 * 24 * 3600L);
        when(alerts.dismiss(1L, 7L, "SINGLE_ADMIN", NOW)).thenReturn(until);
        DashboardDTO.DismissResponse r = s.dismissAlert(me(), "SINGLE_ADMIN");
        assertThat(r.key()).isEqualTo("SINGLE_ADMIN");
        assertThat(r.until()).isEqualTo(until);

        assertThatThrownBy(() -> s.dismissAlert(me(), "NOPE")).isInstanceOf(OrgNotFoundException.class);
        assertThatThrownBy(() -> s.dismissAlert(me(), null)).isInstanceOf(OrgNotFoundException.class);
        verify(alerts, never()).dismiss(anyLong(), anyLong(), org.mockito.ArgumentMatchers.eq("NOPE"), any());
    }

    private static Map<String, DashboardDTO.Widget> byKey(DashboardDTO.Response r) {
        Map<String, DashboardDTO.Widget> m = new LinkedHashMap<>();
        for (DashboardDTO.Widget w : r.widgets()) m.put(w.key(), w);
        return m;
    }
}
