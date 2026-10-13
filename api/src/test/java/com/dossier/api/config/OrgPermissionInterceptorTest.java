package com.dossier.api.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgPermission;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.service.ent.EnterpriseFeatureFlag;
import com.dossier.api.service.org.OrgAccessService;
import com.dossier.api.service.org.OrgFeatureFlag;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import com.dossier.api.web.rest.org.OrgPermissionRequired;
import com.dossier.api.web.rest.org.OrgUnscoped;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.servlet.HandlerMapping;

/** O1.2: the interceptor runs the check before the handler, from the {orgId} path variable, and fails closed. */
class OrgPermissionInterceptorTest {

    static class Controller {

        @OrgPermissionRequired(OrgPermission.REPORTS_VIEW)
        public void guarded() {}

        @OrgPermissionRequired
        public void anyMember() {}

        @OrgUnscoped
        public void unscoped() {}

        public void forgotten() {}
    }

    private OrgAccessService access;
    private OrgFeatureFlag flag;
    private OrgPermissionInterceptor interceptor;
    private MockHttpServletRequest request;
    private final MockHttpServletResponse response = new MockHttpServletResponse();

    @BeforeEach
    void setUp() {
        access = mock(OrgAccessService.class);
        flag = mock(OrgFeatureFlag.class);
        when(flag.isEnabled()).thenReturn(true);
        interceptor = new OrgPermissionInterceptor(access, flag, null);
        request = new MockHttpServletRequest();
    }

    private static HandlerMethod handler(String name) throws Exception {
        return new HandlerMethod(new Controller(), Controller.class.getMethod(name));
    }

    private void orgIdVariable(String value) {
        request.setAttribute(HandlerMapping.URI_TEMPLATE_VARIABLES_ATTRIBUTE, Map.of("orgId", value));
    }

    private static OrgMembership membership() {
        return new OrgMembership(7L, 1L, 2L, "carol", OrgRole.ADMIN, OrgMemberStatus.ACTIVE, OrgStatus.ACTIVE);
    }

    @Test
    void aGuardedHandlerIsCheckedAgainstThePathOrgAndTheMembershipIsHandedOver() throws Exception {
        orgIdVariable("7");
        when(access.requireAll(eq(7L), eq(List.of(OrgPermission.REPORTS_VIEW)))).thenReturn(membership());

        assertThat(interceptor.preHandle(request, response, handler("guarded"))).isTrue();

        assertThat(request.getAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE)).isEqualTo(membership());
    }

    @Test
    void aFailedCheckPropagatesTheGeneric404AndTheHandlerNeverRuns() throws Exception {
        orgIdVariable("7");
        when(access.requireAll(any(), any())).thenThrow(new OrgNotFoundException());

        assertThatThrownBy(() -> interceptor.preHandle(request, response, handler("guarded"))).isInstanceOf(OrgNotFoundException.class);
        assertThat(request.getAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE)).isNull();
    }

    @Test
    void noPermissionsMeansAnyActiveMember() throws Exception {
        orgIdVariable("7");
        when(access.requireMember(7L)).thenReturn(membership());

        assertThat(interceptor.preHandle(request, response, handler("anyMember"))).isTrue();

        verify(access, never()).requireAll(any(), any());
    }

    @Test
    void aNonNumericOrgIdIsA404WithoutTouchingTheService() throws Exception {
        orgIdVariable("not-a-number");
        assertThatThrownBy(() -> interceptor.preHandle(request, response, handler("guarded"))).isInstanceOf(OrgNotFoundException.class);
        verify(access, never()).requireAll(any(), any());
        verify(access, never()).requireMember(any());
    }

    @Test
    void aCheckedHandlerWithNoOrgIdVariableIsA404() throws Exception {
        assertThatThrownBy(() -> interceptor.preHandle(request, response, handler("guarded"))).isInstanceOf(OrgNotFoundException.class);
    }

    @Test
    void anUnscopedHandlerPassesThroughWithoutACheck() throws Exception {
        assertThat(interceptor.preHandle(request, response, handler("unscoped"))).isTrue();
        verify(access, never()).requireAll(any(), any());
        verify(access, never()).requireMember(any());
    }

    @Test
    void aHandlerWithNeitherAnnotationFailsClosed() throws Exception {
        orgIdVariable("7");
        assertThatThrownBy(() -> interceptor.preHandle(request, response, handler("forgotten"))).isInstanceOf(OrgNotFoundException.class);
    }

    @Test
    void whileTheFeatureFlagIsOffEveryOrgHandlerIsA404WithoutTouchingTheService() throws Exception {
        when(flag.isEnabled()).thenReturn(false);
        orgIdVariable("7");
        for (String name : List.of("guarded", "anyMember", "unscoped")) {
            assertThatThrownBy(() -> interceptor.preHandle(request, response, handler(name))).isInstanceOf(OrgNotFoundException.class);
        }
        verify(access, never()).requireAll(any(), any());
        verify(access, never()).requireMember(any());
    }

    @Test
    void aNonHandlerDispatchIsIgnored() {
        assertThat(interceptor.preHandle(request, response, new Object())).isTrue();
    }

    // ---- Enterprise V2 (X1.1): the per-org wall behind EnterpriseEnabledFilter ----------------------------------------

    @Test
    void anEnterpriseRouteOfAnOrgOutsideTheFlagIsA404BeforeTheMembershipCheck() throws Exception {
        EnterpriseFeatureFlag enterprise = mock(EnterpriseFeatureFlag.class);
        when(enterprise.isEnabled(7L)).thenReturn(false);
        OrgPermissionInterceptor wired = new OrgPermissionInterceptor(access, flag, enterprise);
        orgIdVariable("7");
        request.setRequestURI("/api/orgs/7/enterprise/roles");

        assertThatThrownBy(() -> wired.preHandle(request, response, handler("guarded"))).isInstanceOf(OrgNotFoundException.class);
        verify(access, never()).requireAll(any(), any());
        verify(access, never()).requireMember(any());
    }

    @Test
    void anEnterpriseRouteOfAnOrgInsideTheFlagGoesOnToTheMembershipCheck() throws Exception {
        EnterpriseFeatureFlag enterprise = mock(EnterpriseFeatureFlag.class);
        when(enterprise.isEnabled(7L)).thenReturn(true);
        when(access.requireAll(eq(7L), eq(List.of(OrgPermission.REPORTS_VIEW)))).thenReturn(membership());
        OrgPermissionInterceptor wired = new OrgPermissionInterceptor(access, flag, enterprise);
        orgIdVariable("7");
        request.setRequestURI("/api/orgs/7/enterprise/roles");

        assertThat(wired.preHandle(request, response, handler("guarded"))).isTrue();
    }

    @Test
    void withoutAnEnterpriseFlagEveryEnterpriseRouteIsClosed() throws Exception {
        orgIdVariable("7"); // the two-argument constructor used by every pre-enterprise caller
        request.setRequestURI("/api/orgs/7/enterprise/roles");
        assertThatThrownBy(() -> interceptor.preHandle(request, response, handler("guarded"))).isInstanceOf(OrgNotFoundException.class);
    }

    @Test
    void anOrdinaryOrgRouteNeverConsultsTheEnterpriseFlag() throws Exception {
        EnterpriseFeatureFlag enterprise = mock(EnterpriseFeatureFlag.class);
        when(access.requireAll(eq(7L), eq(List.of(OrgPermission.REPORTS_VIEW)))).thenReturn(membership());
        OrgPermissionInterceptor wired = new OrgPermissionInterceptor(access, flag, enterprise);
        orgIdVariable("7");
        request.setRequestURI("/api/orgs/7/groups");

        assertThat(wired.preHandle(request, response, handler("guarded"))).isTrue();
        verify(enterprise, never()).isEnabled(any(Long.class));
    }
}
