package com.dossier.api.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dossier.api.service.ent.EnterpriseFeatureFlag;
import com.dossier.api.service.ent.TenantContext;
import com.dossier.api.service.ent.TenantContext.Reason;
import com.dossier.api.service.ent.TenantContextHolder;
import com.dossier.api.service.ent.TenantResolver;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.slf4j.MDC;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

/** X1.3: the filter publishes the tenant for the request and only for the request; with enterprise off it does nothing at all. */
class TenantResolverFilterTest {

    private final TenantResolver resolver = mock(TenantResolver.class);
    private final EnterpriseFeatureFlag flag = mock(EnterpriseFeatureFlag.class);
    private final TenantResolverFilter filter = new TenantResolverFilter(resolver, flag);

    @BeforeEach
    void setUp() {
        when(flag.isEnabled()).thenReturn(true);
    }

    @AfterEach
    void clean() {
        TenantContextHolder.clear();
        MDC.clear();
    }

    private MockHttpServletRequest request(String uri, String... hostHeaders) {
        MockHttpServletRequest req = new MockHttpServletRequest("GET", uri);
        req.setRequestURI(uri);
        for (String h : hostHeaders) req.addHeader(TenantResolverFilter.HEADER, h);
        return req;
    }

    @Test
    void withEnterpriseOffTheFilterDoesNothing() throws Exception {
        when(flag.isEnabled()).thenReturn(false);
        FilterChain chain = mock(FilterChain.class);
        MockHttpServletRequest req = request("/api/orgs/7", "nobody.example");

        filter.doFilter(req, new MockHttpServletResponse(), chain);

        verify(resolver, never()).resolve(any());
        verify(chain).doFilter(any(), any());
        assertThat(req.getAttribute(TenantContextHolder.REQUEST_ATTRIBUTE)).isNull();
        assertThat(MDC.get("tenant")).isNull();
    }

    @Test
    void theContextIsVisibleDuringTheChainAndGoneAfterwards() throws Exception {
        TenantContext ctx = TenantContext.tenant(12L, null, "acme.kiwiply.com");
        when(resolver.resolve("acme.kiwiply.com")).thenReturn(ctx);
        AtomicReference<TenantContext> seenHolder = new AtomicReference<>();
        AtomicReference<String> seenTenant = new AtomicReference<>();
        AtomicReference<String> seenHost = new AtomicReference<>();
        MockHttpServletRequest req = request("/api/profile", "acme.kiwiply.com");

        filter.doFilter(req, new MockHttpServletResponse(), (rq, rs) -> {
            seenHolder.set(TenantContextHolder.current().orElse(null));
            seenTenant.set(MDC.get("tenant"));
            seenHost.set(MDC.get("host"));
        });

        assertThat(seenHolder.get()).isSameAs(ctx);
        assertThat(seenTenant.get()).isEqualTo("12");
        assertThat(seenHost.get()).isEqualTo("acme.kiwiply.com");
        assertThat(req.getAttribute(TenantContextHolder.REQUEST_ATTRIBUTE)).isSameAs(ctx);
        assertThat(TenantContextHolder.current()).isEmpty();
        assertThat(MDC.get("tenant")).isNull();
        assertThat(MDC.get("host")).isNull();
    }

    @Test
    void theContextIsClearedEvenWhenTheChainThrows() {
        when(resolver.resolve(anyString())).thenReturn(TenantContext.platform("kiwiply.com"));
        assertThatThrownBy(() -> filter.doFilter(request("/api/x", "kiwiply.com"), new MockHttpServletResponse(), (rq, rs) -> {
            throw new ServletException("boom");
        })).isInstanceOf(ServletException.class);
        assertThat(TenantContextHolder.current()).isEmpty();
        assertThat(MDC.get("tenant")).isNull();
    }

    @Test
    void anUnservedHostMakesOrgPathsAGeneric404WithoutRunningTheChain() throws Exception {
        when(resolver.resolve("nobody.example")).thenReturn(TenantContext.unknown("nobody.example", Reason.UNKNOWN_HOST));
        for (String uri : new String[] { "/api/orgs/7", "/api/orgs", "/api/me/orgs", "/api/join/abc", "/api/orgs;x=1/7", "//api/orgs/7" }) {
            FilterChain chain = mock(FilterChain.class);
            MockHttpServletResponse res = new MockHttpServletResponse();
            filter.doFilter(request(uri, "nobody.example"), res, chain);
            assertThat(res.getStatus()).as(uri).isEqualTo(404);
            assertThat(res.getContentType()).startsWith("application/problem+json");
            assertThat(res.getContentAsString()).contains("\"code\":\"NOT_FOUND\"");
            verify(chain, never()).doFilter(any(), any());
        }
        assertThat(TenantContextHolder.current()).isEmpty();
    }

    @Test
    void anUnservedHostLeavesOtherPathsToTheirOwnHandlers() throws Exception {
        when(resolver.resolve("nobody.example")).thenReturn(TenantContext.unknown("nobody.example", Reason.UNKNOWN_HOST));
        FilterChain chain = mock(FilterChain.class);
        MockHttpServletResponse res = new MockHttpServletResponse();
        filter.doFilter(request("/api/public/tenant", "nobody.example"), res, chain);
        verify(chain).doFilter(any(), any()); // the resource answers its own 404
        assertThat(res.getStatus()).isEqualTo(200);
    }

    @Test
    void aRequestWithNoHostIsALegacyCallerAndKeepsTodaysBehaviour() throws Exception {
        when(resolver.resolve(null)).thenReturn(TenantContext.unknown(null, Reason.NO_HOST));
        FilterChain chain = mock(FilterChain.class);
        filter.doFilter(request("/api/orgs/7"), new MockHttpServletResponse(), chain);
        verify(chain).doFilter(any(), any());
    }

    @Test
    void aRepeatedHeaderIsHandedToTheResolverAsAnInvalidHost() throws Exception {
        when(resolver.resolve(",")).thenReturn(TenantContext.unknown(null, Reason.INVALID_HOST));
        MockHttpServletResponse res = new MockHttpServletResponse();
        filter.doFilter(request("/api/orgs/7", "acme.kiwiply.com", "acme.kiwiply.com"), res, mock(FilterChain.class));
        verify(resolver).resolve(",");
        assertThat(res.getStatus()).isEqualTo(404);
    }
}
