package com.dossier.api.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dossier.api.service.ent.members.EnterpriseAccountLifecycle;
import jakarta.servlet.FilterChain;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;

/**
 * Decision O4 S8: an enterprise token works only while its person holds an active seat; personal tokens, organization routes and the token endpoints are
 * not this filter's business; and {@code DELETE /api/account} is closed to enterprise accounts.
 */
class EnterpriseSeatFilterTest {

    private EnterpriseAccountLifecycle lifecycle;
    private EnterpriseSeatFilter filter;
    private FilterChain chain;
    private MockHttpServletResponse response;

    @SuppressWarnings("unchecked")
    @BeforeEach
    void wire() {
        lifecycle = mock(EnterpriseAccountLifecycle.class);
        ObjectProvider<EnterpriseAccountLifecycle> provider = mock(ObjectProvider.class);
        when(provider.getIfAvailable()).thenReturn(lifecycle);
        filter = new EnterpriseSeatFilter(provider);
        chain = mock(FilterChain.class);
        response = new MockHttpServletResponse();
    }

    @AfterEach
    void clear() {
        SecurityContextHolder.clearContext();
    }

    private void token(String subject, Long tid, Long uid) {
        Jwt.Builder b = Jwt.withTokenValue("t").header("alg", "none").subject(subject).claim("userId", uid).issuedAt(Instant.now()).expiresAt(Instant.now().plusSeconds(60));
        if (tid != null) b.claim("tid", tid);
        SecurityContextHolder.getContext().setAuthentication(new JwtAuthenticationToken(b.build(), List.of()));
    }

    private void run(String method, String path) throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest(method, path);
        filter.doFilter(request, response, chain);
    }

    @Test
    void anAccountWithoutAnActiveSeatIsRefusedOnAUserScopedRoute() throws Exception {
        token("ent#5#lee@x.test", 5L, 7L);
        when(lifecycle.hasActiveSeat(5L, 7L)).thenReturn(false);
        run("GET", "/api/profile/version");
        assertThat(response.getStatus()).isEqualTo(401);
        assertThat(response.getContentAsString()).contains("TOKEN_ACCOUNT_DISABLED");
        assertThat(response.getHeader("WWW-Authenticate")).contains("TOKEN_ACCOUNT_DISABLED");
        org.mockito.Mockito.verifyNoInteractions(chain);
    }

    @Test
    void anAccountWithAnActiveSeatPasses() throws Exception {
        token("ent#5#lee@x.test", 5L, 7L);
        when(lifecycle.hasActiveSeat(5L, 7L)).thenReturn(true);
        run("GET", "/api/profile/version");
        assertThat(response.getStatus()).isEqualTo(200);
        verify(chain).doFilter(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any());
    }

    @Test
    void personalTokensAndTokensWithoutTenantAreNotJudged() throws Exception {
        token("someone", null, 7L);
        run("GET", "/api/profile/version");
        token("ent#5#lee@x.test", null, 7L); // the world check owns a tid-less enterprise token
        run("GET", "/api/profile/version");
        org.mockito.Mockito.verify(lifecycle, org.mockito.Mockito.never()).hasActiveSeat(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any());
        assertThat(response.getStatus()).isEqualTo(200);
    }

    @Test
    void organizationRoutesAndTheTokenEndpointsKeepTheirOwnAnswers() throws Exception {
        token("ent#5#lee@x.test", 5L, 7L);
        when(lifecycle.hasActiveSeat(5L, 7L)).thenReturn(false);
        for (String path : List.of("/api/orgs/5", "/api/orgs/5/members", "/api/ent/x", "/api/me/tenant", "/api/join/abc/accept", "/api/refresh", "/api/logout")) {
            response = new MockHttpServletResponse();
            run("GET", path);
            assertThat(response.getStatus()).as(path).isEqualTo(200);
        }
        assertThat(EnterpriseSeatFilter.selfChecking("/api/profile")).isFalse();
        assertThat(EnterpriseSeatFilter.selfChecking("/api/orgs-x")).isFalse();
    }

    @Test
    void selfServiceDeleteIsClosedToEnterpriseAccountsOnly() {
        assertThat(AccountKindRouteFilter.isPersonalDelete("DELETE", "/api/account")).isTrue();
        assertThat(AccountKindRouteFilter.isPersonalDelete("DELETE", "/api/account/delete")).isTrue();
        assertThat(AccountKindRouteFilter.isPersonalDelete("GET", "/api/account")).isFalse();
        assertThat(AccountKindRouteFilter.isPersonalDelete("GET", "/api/account/export")).isFalse();
        assertThat(AccountKindRouteFilter.isPersonalDelete("DELETE", "/api/account/sessions/3")).isFalse();
        assertThat(AccountKindRouteFilter.isPersonalDelete("DELETE", "/api/resumes/3")).isFalse();
    }
}
