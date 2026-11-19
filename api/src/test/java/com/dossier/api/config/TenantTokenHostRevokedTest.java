package com.dossier.api.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dossier.api.security.SecurityUtils;
import com.dossier.api.service.ent.TenantContext;
import com.dossier.api.service.ent.TenantContextHolder;
import com.dossier.api.service.ent.TenantResolver;
import jakarta.servlet.FilterChain;
import java.time.Instant;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;

/**
 * Gap D-3 (10-domain-routing.md section 6, user decision 2026-11-18): a session signed in on a hostname that is suspended, removed or no longer served
 * ends on every route and every host with 401 TOKEN_HOST_REVOKED, not only on that hostname.
 */
class TenantTokenHostRevokedTest {

    @AfterEach
    void clear() {
        TenantContextHolder.clear();
        SecurityContextHolder.clearContext();
    }

    @SuppressWarnings("unchecked")
    private static TenantTokenBindingFilter filter(TenantResolver resolver) {
        ObjectProvider<TenantResolver> provider = mock(ObjectProvider.class);
        when(provider.getIfAvailable()).thenReturn(resolver);
        return new TenantTokenBindingFilter(null, provider);
    }

    private static void signedIn(Long tid, Long hid) {
        Jwt.Builder b = Jwt.withTokenValue("t").header("alg", "HS512").subject("u").issuedAt(Instant.now()).expiresAt(Instant.now().plusSeconds(60));
        if (tid != null) b.claim(SecurityUtils.TENANT_CLAIM, tid);
        if (hid != null) b.claim(SecurityUtils.HOSTNAME_CLAIM, hid);
        SecurityContextHolder.getContext().setAuthentication(new JwtAuthenticationToken(b.build()));
    }

    private static MockHttpServletResponse run(TenantTokenBindingFilter f, String path, FilterChain chain) throws Exception {
        MockHttpServletRequest req = new MockHttpServletRequest("GET", path);
        MockHttpServletResponse res = new MockHttpServletResponse();
        f.doFilter(req, res, chain);
        return res;
    }

    @Test
    void aSessionFromAHostnameThatIsNoLongerLiveIsRefusedOnEveryRouteAndHost() throws Exception {
        TenantResolver resolver = mock(TenantResolver.class);
        when(resolver.hostnameLive(7L, 77L)).thenReturn(false);
        signedIn(7L, 77L);
        for (TenantContext where : new TenantContext[] { TenantContext.tenant(7L, 78L, "acme.kiwiply.com"), TenantContext.platform("kiwiply.com") }) {
            TenantContextHolder.set(where);
            for (String path : new String[] { "/api/orgs/7", "/api/account", "/api/me/tenant" }) {
                FilterChain chain = mock(FilterChain.class);
                MockHttpServletResponse res = run(filter(resolver), path, chain);
                assertThat(res.getStatus()).as(where.host() + path).isEqualTo(401);
                assertThat(res.getContentAsString()).contains(TenantTokenBindingFilter.HOST_REVOKED);
                verify(chain, never()).doFilter(any(), any());
            }
        }
    }

    @Test
    void aSessionFromALiveHostnameAndASessionWithoutOneAreUntouched() throws Exception {
        TenantResolver resolver = mock(TenantResolver.class);
        when(resolver.hostnameLive(7L, 77L)).thenReturn(true);
        TenantContextHolder.set(TenantContext.tenant(7L, 77L, "careers.acme.com"));

        signedIn(7L, 77L);
        FilterChain live = mock(FilterChain.class);
        assertThat(run(filter(resolver), "/api/orgs/7", live).getStatus()).isEqualTo(200);
        verify(live).doFilter(any(), any());

        signedIn(7L, null); // a subdomain session has no hostname id: nothing to check
        FilterChain noHid = mock(FilterChain.class);
        run(filter(resolver), "/api/orgs/7", noHid);
        verify(noHid).doFilter(any(), any());
        verify(resolver, never()).hostnameLive(7L, null);
    }
}
