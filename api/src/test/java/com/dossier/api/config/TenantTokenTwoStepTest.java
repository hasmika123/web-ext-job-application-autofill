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
import com.dossier.api.service.ent.settings.OrgSecurityPolicy;
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
 * Gap D-2 (user decision 2026-11-19): while an organization requires two-step sign-in, a session signed in on kiwiply.com (no {@code tid}) never
 * reaches that organization's routes; its own address (which asked for the code) is the way in. Other organizations and personal routes are untouched.
 */
class TenantTokenTwoStepTest {

    @AfterEach
    void clear() {
        TenantContextHolder.clear();
        SecurityContextHolder.clearContext();
    }

    @SuppressWarnings("unchecked")
    private static TenantTokenBindingFilter filter(long strictOrg) {
        OrgSecurityPolicy policy = mock(OrgSecurityPolicy.class);
        when(policy.twoStepRequired(strictOrg)).thenReturn(true);
        ObjectProvider<OrgSecurityPolicy> provider = mock(ObjectProvider.class);
        when(provider.getIfAvailable()).thenReturn(policy);
        return new TenantTokenBindingFilter(null, null, provider);
    }

    private static void signedIn(Long tid) {
        Jwt.Builder b = Jwt.withTokenValue("t").header("alg", "HS512").subject("u").issuedAt(Instant.now()).expiresAt(Instant.now().plusSeconds(60));
        if (tid != null) b.claim(SecurityUtils.TENANT_CLAIM, tid);
        SecurityContextHolder.getContext().setAuthentication(new JwtAuthenticationToken(b.build()));
    }

    private static MockHttpServletResponse run(TenantTokenBindingFilter f, String path, FilterChain chain) throws Exception {
        MockHttpServletResponse res = new MockHttpServletResponse();
        f.doFilter(new MockHttpServletRequest("GET", path), res, chain);
        return res;
    }

    @Test
    void aKiwiplySessionCannotOpenAnOrganizationThatRequiresTwoStep() throws Exception {
        TenantContextHolder.set(TenantContext.platform("kiwiply.com"));
        signedIn(null);
        for (String path : new String[] { "/api/orgs/7", "/api/orgs/7/members", "/api/orgs/7/me-workspace/features" }) {
            FilterChain chain = mock(FilterChain.class);
            MockHttpServletResponse res = run(filter(7L), path, chain);
            assertThat(res.getStatus()).as(path).isEqualTo(403);
            assertThat(res.getContentAsString()).contains(TenantTokenBindingFilter.TWO_STEP_HERE).contains("its own address");
            verify(chain, never()).doFilter(any(), any());
        }
    }

    @Test
    void otherOrganizationsPersonalRoutesAndTheOrganizationsOwnHostAreUntouched() throws Exception {
        TenantContextHolder.set(TenantContext.platform("kiwiply.com"));
        signedIn(null);
        for (String path : new String[] { "/api/orgs/8", "/api/account", "/api/orgs/70" }) {
            FilterChain chain = mock(FilterChain.class);
            run(filter(7L), path, chain);
            verify(chain).doFilter(any(), any());
        }

        TenantContextHolder.set(TenantContext.tenant(7L, 70L, "careers.acme.com"));
        signedIn(7L); // signed in on its own address: the code was asked there
        FilterChain own = mock(FilterChain.class);
        assertThat(run(filter(7L), "/api/orgs/7", own).getStatus()).isEqualTo(200);
        verify(own).doFilter(any(), any());
    }
}
