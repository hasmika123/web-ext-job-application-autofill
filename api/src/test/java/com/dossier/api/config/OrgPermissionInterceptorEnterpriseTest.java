package com.dossier.api.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgPermission;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.service.ent.EnterpriseFeatureFlag;
import com.dossier.api.service.ent.TenantContext;
import com.dossier.api.service.ent.TenantContextHolder;
import com.dossier.api.service.ent.authz.AuthorizationService;
import com.dossier.api.service.ent.authz.AuthzDecision;
import com.dossier.api.service.ent.authz.AuthzOperation;
import com.dossier.api.service.ent.authz.AuthzRequest;
import com.dossier.api.service.ent.authz.Beneficiary;
import com.dossier.api.service.org.OrgAccessService;
import com.dossier.api.service.org.OrgFeatureFlag;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import com.dossier.api.web.rest.org.OrgPermissionRequired;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.servlet.HandlerMapping;

/**
 * X1.7: for an organization in the enterprise flag the interceptor builds an {@link AuthzRequest} from the annotation (the
 * beneficiary from the path, the query or the actor) and lets {@link AuthorizationService} decide; for every other organization
 * the legacy {@link OrgAccessService} calls run and the new service is never touched.
 */
class OrgPermissionInterceptorEnterpriseTest {

    static class Controller {

        @OrgPermissionRequired(OrgPermission.REPORTS_VIEW)
        public void orgLevel() {}

        @OrgPermissionRequired(value = OrgPermission.MEMBER_ACT_FOR, beneficiary = Beneficiary.PATH_MEMBER)
        public void forPathMember() {}

        @OrgPermissionRequired(value = OrgPermission.MEMBER_ACT_FOR, beneficiary = Beneficiary.PATH_MEMBER, scopeTarget = "consultantId")
        public void forNamedPathMember() {}

        @OrgPermissionRequired(value = OrgPermission.MEMBER_VIEW_SUMMARY, beneficiary = Beneficiary.QUERY_MEMBER)
        public void forQueryMember() {}

        @OrgPermissionRequired(value = OrgPermission.SELF_LEAVE, beneficiary = Beneficiary.SELF)
        public void forSelf() {}

        @OrgPermissionRequired(value = OrgPermission.MEMBER_ACT_FOR, beneficiary = Beneficiary.BODY_MEMBER)
        public void forBodyMember() {}

        @OrgPermissionRequired(value = OrgPermission.ORG_CLOSE, stateAction = true)
        public void closeIt() {}

        @OrgPermissionRequired
        public void anyMember() {}
    }

    private OrgAccessService access;
    private EnterpriseFeatureFlag enterprise;
    private AuthorizationService authorization;
    private OrgPermissionInterceptor interceptor;
    private MockHttpServletRequest request;
    private final MockHttpServletResponse response = new MockHttpServletResponse();

    @BeforeEach
    void setUp() {
        access = mock(OrgAccessService.class);
        OrgFeatureFlag flag = mock(OrgFeatureFlag.class);
        when(flag.isEnabled()).thenReturn(true);
        enterprise = mock(EnterpriseFeatureFlag.class);
        when(enterprise.isEnabled(7L)).thenReturn(true);
        authorization = mock(AuthorizationService.class);
        interceptor = new OrgPermissionInterceptor(access, flag, enterprise, authorization);
        request = new MockHttpServletRequest("GET", "/api/orgs/7/consultants");
        TenantContextHolder.clear();
    }

    private static HandlerMethod handler(String name) throws Exception {
        return new HandlerMethod(new Controller(), Controller.class.getMethod(name));
    }

    private void vars(String orgId, String... more) {
        Map<String, String> m = new java.util.HashMap<>(Map.of("orgId", orgId));
        for (int i = 0; i < more.length; i += 2) m.put(more[i], more[i + 1]);
        request.setAttribute(HandlerMapping.URI_TEMPLATE_VARIABLES_ATTRIBUTE, m);
    }

    private static OrgMembership membership() {
        return new OrgMembership(7L, 1L, 2L, "carol", OrgRole.MARKETER, OrgMemberStatus.ACTIVE, OrgStatus.ACTIVE);
    }

    private AuthzRequest captured() {
        ArgumentCaptor<AuthzRequest> c = ArgumentCaptor.forClass(AuthzRequest.class);
        verify(authorization).require(c.capture());
        return c.getValue();
    }

    private void allow() {
        when(authorization.require(any())).thenAnswer(i -> {
            AuthzRequest r = i.getArgument(0);
            return AuthzDecision.allow(r.orgId(), membership(), r.beneficiaryMemberId(), r.permissionKeys(), Map.of());
        });
    }

    @Test
    void anOrganizationInsideTheFlagIsAuthorizedByTheServiceAndTheLegacyCheckIsNotUsed() throws Exception {
        allow();
        vars("7");
        assertThat(interceptor.preHandle(request, response, handler("orgLevel"))).isTrue();

        AuthzRequest r = captured();
        assertThat(r.orgId()).isEqualTo(7L);
        assertThat(r.permissionKeys()).containsExactly("reports.view");
        assertThat(r.beneficiary()).isEqualTo(Beneficiary.NONE);
        assertThat(r.beneficiaryMemberId()).isNull();
        assertThat(r.operation()).isEqualTo(AuthzOperation.READ);
        assertThat(r.stateAction()).isFalse();
        verify(access, never()).requireAll(any(), any());
        verify(access, never()).requireMember(any());
        assertThat(request.getAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE)).isEqualTo(membership());
        assertThat(request.getAttribute(AuthzDecision.ATTRIBUTE)).isInstanceOf(AuthzDecision.class);
    }

    @Test
    void anOrganizationOutsideTheFlagKeepsTheLegacyCheckAndNeverTouchesTheService() throws Exception {
        when(enterprise.isEnabled(8L)).thenReturn(false);
        when(access.requireAll(any(), any())).thenReturn(membership());
        vars("8");
        assertThat(interceptor.preHandle(request, response, handler("orgLevel"))).isTrue();
        verify(authorization, never()).require(any());
        verify(authorization, never()).authorize(any());
        assertThat(request.getAttribute(AuthzDecision.ATTRIBUTE)).isNull();
    }

    @Test
    void aWriteIsAWriteAndAStateActionIsMarked() throws Exception {
        allow();
        request = new MockHttpServletRequest("POST", "/api/orgs/7/close");
        vars("7");
        interceptor.preHandle(request, response, handler("closeIt"));
        AuthzRequest r = captured();
        assertThat(r.operation()).isEqualTo(AuthzOperation.WRITE);
        assertThat(r.stateAction()).isTrue();
    }

    @Test
    void theTenantTheFilterDerivedIsHandedToTheService() throws Exception {
        allow();
        TenantContext tenant = TenantContext.tenant(7L, 3L, "acme.example.org");
        request.setAttribute(TenantContextHolder.REQUEST_ATTRIBUTE, tenant);
        vars("7");
        interceptor.preHandle(request, response, handler("orgLevel"));
        assertThat(captured().tenant()).isEqualTo(tenant);
    }

    // ---- resolving the beneficiary ---------------------------------------------------------------------------------

    @Test
    void aPathMemberIsReadFromMemberIdOrFromTheNamedVariable() throws Exception {
        allow();
        vars("7", "memberId", "42");
        interceptor.preHandle(request, response, handler("forPathMember"));
        AuthzRequest r = captured();
        assertThat(r.beneficiary()).isEqualTo(Beneficiary.PATH_MEMBER);
        assertThat(r.beneficiaryMemberId()).isEqualTo(42L);

        org.mockito.Mockito.reset(authorization);
        allow();
        vars("7", "consultantId", "43", "memberId", "999");
        interceptor.preHandle(request, response, handler("forNamedPathMember"));
        assertThat(captured().beneficiaryMemberId()).as("scopeTarget wins over memberId").isEqualTo(43L);
    }

    @Test
    void aBadPathMemberIsA404WithoutCallingTheService() throws Exception {
        for (String bad : new String[] { "abc", "0", "-5", "", "9999999999999999999999", "1.5" }) {
            vars("7", "memberId", bad);
            assertThatThrownBy(() -> interceptor.preHandle(request, response, handler("forPathMember"))).as(bad).isInstanceOf(OrgNotFoundException.class);
        }
        vars("7"); // no memberId variable at all
        assertThatThrownBy(() -> interceptor.preHandle(request, response, handler("forPathMember"))).isInstanceOf(OrgNotFoundException.class);
        verify(authorization, never()).require(any());
    }

    @Test
    void aQueryMemberComesFromForOrMemberIdAndNoneMeansTheCaller() throws Exception {
        allow();
        vars("7");
        request.setParameter("for", "55");
        interceptor.preHandle(request, response, handler("forQueryMember"));
        assertThat(captured().beneficiaryMemberId()).isEqualTo(55L);
        assertThat(captured().beneficiary()).isEqualTo(Beneficiary.QUERY_MEMBER);

        org.mockito.Mockito.reset(authorization);
        allow();
        request = new MockHttpServletRequest("GET", "/api/orgs/7/jobs");
        vars("7");
        request.setParameter("memberId", "56");
        interceptor.preHandle(request, response, handler("forQueryMember"));
        assertThat(captured().beneficiaryMemberId()).isEqualTo(56L);

        org.mockito.Mockito.reset(authorization);
        allow();
        request = new MockHttpServletRequest("GET", "/api/orgs/7/jobs");
        vars("7");
        interceptor.preHandle(request, response, handler("forQueryMember"));
        assertThat(captured().beneficiary()).as("no ?for= is the caller's own").isEqualTo(Beneficiary.SELF);
        assertThat(captured().beneficiaryMemberId()).isNull();
    }

    @Test
    void twoDifferentQueryAnswersAreRefusedNeverPicked() throws Exception {
        vars("7");
        request.setParameter("for", "55");
        request.setParameter("memberId", "56");
        assertThatThrownBy(() -> interceptor.preHandle(request, response, handler("forQueryMember"))).isInstanceOf(OrgNotFoundException.class);
        request = new MockHttpServletRequest("GET", "/x");
        vars("7");
        request.addParameter("for", "55", "56");
        assertThatThrownBy(() -> interceptor.preHandle(request, response, handler("forQueryMember"))).isInstanceOf(OrgNotFoundException.class);
        request = new MockHttpServletRequest("GET", "/x");
        vars("7");
        request.setParameter("for", "not-a-number");
        assertThatThrownBy(() -> interceptor.preHandle(request, response, handler("forQueryMember"))).isInstanceOf(OrgNotFoundException.class);
        verify(authorization, never()).require(any());
    }

    @Test
    void theSameValueInBothQueryParametersIsOneAnswer() throws Exception {
        allow();
        vars("7");
        request.setParameter("for", "55");
        request.setParameter("memberId", "55");
        interceptor.preHandle(request, response, handler("forQueryMember"));
        assertThat(captured().beneficiaryMemberId()).isEqualTo(55L);
    }

    @Test
    void selfLeavesTheSubstitutionToTheService() throws Exception {
        allow();
        vars("7");
        interceptor.preHandle(request, response, handler("forSelf"));
        assertThat(captured().beneficiary()).isEqualTo(Beneficiary.SELF);
        assertThat(captured().beneficiaryMemberId()).isNull();
    }

    @Test
    void aBodyMemberNeedsAnIdFromABodyCachingComponentAndFailsClosedWithoutOne() throws Exception {
        vars("7");
        assertThatThrownBy(() -> interceptor.preHandle(request, response, handler("forBodyMember"))).isInstanceOf(OrgNotFoundException.class);
        verify(authorization, never()).require(any());

        allow();
        request.setAttribute(OrgPermissionInterceptor.BODY_BENEFICIARY_ATTRIBUTE, 77L);
        interceptor.preHandle(request, response, handler("forBodyMember"));
        assertThat(captured().beneficiaryMemberId()).isEqualTo(77L);

        org.mockito.Mockito.reset(authorization);
        request.setAttribute(OrgPermissionInterceptor.BODY_BENEFICIARY_ATTRIBUTE, "77"); // not a Long: not trusted
        assertThatThrownBy(() -> interceptor.preHandle(request, response, handler("forBodyMember"))).isInstanceOf(OrgNotFoundException.class);
    }

    // ---- refusals ---------------------------------------------------------------------------------------------------

    @Test
    void aRefusalPropagatesAndStoresNothing() throws Exception {
        when(authorization.require(any())).thenThrow(new OrgNotFoundException());
        vars("7");
        assertThatThrownBy(() -> interceptor.preHandle(request, response, handler("orgLevel"))).isInstanceOf(OrgNotFoundException.class);
        assertThat(request.getAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE)).isNull();
        assertThat(request.getAttribute(AuthzDecision.ATTRIBUTE)).isNull();
    }

    @Test
    void aTenantHostForAnotherOrgIsStillRefusedBeforeTheService() throws Exception {
        request.setAttribute(TenantContextHolder.REQUEST_ATTRIBUTE, TenantContext.tenant(9L, 1L, "beta.example.org"));
        vars("7");
        assertThatThrownBy(() -> interceptor.preHandle(request, response, handler("orgLevel"))).isInstanceOf(OrgNotFoundException.class);
        verify(authorization, never()).require(any());
    }

    @Test
    void aHandlerWithNoPermissionsAsksForAnyActiveMember() throws Exception {
        allow();
        vars("7");
        interceptor.preHandle(request, response, handler("anyMember"));
        assertThat(captured().permissionKeys()).isEmpty();
    }

    @Test
    void withoutAnAuthorizationServiceEveryOrgUsesTheLegacyCheck() throws Exception {
        OrgFeatureFlag flag = mock(OrgFeatureFlag.class);
        when(flag.isEnabled()).thenReturn(true);
        OrgPermissionInterceptor legacy = new OrgPermissionInterceptor(access, flag, enterprise, null);
        when(access.requireAll(any(), any())).thenReturn(membership());
        vars("7");
        assertThat(legacy.preHandle(request, response, handler("orgLevel"))).isTrue();
        verify(access).requireAll(any(), any());
        assertThat(List.of(AuthzDecision.ATTRIBUTE)).isNotEmpty();
    }
}
