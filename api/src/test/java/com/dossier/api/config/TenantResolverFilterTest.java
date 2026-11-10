package com.dossier.api.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
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
    private final TenantResolverFilter filter = new TenantResolverFilter(resolver, flag, new TenantHostTrust("", false));

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

        verify(resolver, never()).resolve(any(), any());
        verify(chain).doFilter(any(), any());
        assertThat(req.getAttribute(TenantContextHolder.REQUEST_ATTRIBUTE)).isNull();
        assertThat(MDC.get("tenant")).isNull();
    }

    @Test
    void theContextIsVisibleDuringTheChainAndGoneAfterwards() throws Exception {
        TenantContext ctx = TenantContext.tenant(12L, null, "acme.kiwiply.com");
        when(resolver.resolve("acme.kiwiply.com", "127.0.0.1")).thenReturn(ctx);
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
        when(resolver.resolve(anyString(), anyString())).thenReturn(TenantContext.platform("kiwiply.com"));
        assertThatThrownBy(() -> filter.doFilter(request("/api/x", "kiwiply.com"), new MockHttpServletResponse(), (rq, rs) -> {
            throw new ServletException("boom");
        })).isInstanceOf(ServletException.class);
        assertThat(TenantContextHolder.current()).isEmpty();
        assertThat(MDC.get("tenant")).isNull();
    }

    @Test
    void anUnservedHostMakesOrgPathsAGeneric404WithoutRunningTheChain() throws Exception {
        when(resolver.resolve("nobody.example", "127.0.0.1")).thenReturn(TenantContext.unknown("nobody.example", Reason.UNKNOWN_HOST));
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
        when(resolver.resolve("nobody.example", "127.0.0.1")).thenReturn(TenantContext.unknown("nobody.example", Reason.UNKNOWN_HOST));
        FilterChain chain = mock(FilterChain.class);
        MockHttpServletResponse res = new MockHttpServletResponse();
        filter.doFilter(request("/api/public/tenant", "nobody.example"), res, chain);
        verify(chain).doFilter(any(), any()); // the resource answers its own 404
        assertThat(res.getStatus()).isEqualTo(200);
    }

    @Test
    void aRequestWithNoHostIsALegacyCallerAndKeepsTodaysBehaviour() throws Exception {
        when(resolver.resolve(isNull(), anyString())).thenReturn(TenantContext.unknown(null, Reason.NO_HOST));
        FilterChain chain = mock(FilterChain.class);
        filter.doFilter(request("/api/orgs/7"), new MockHttpServletResponse(), chain);
        verify(chain).doFilter(any(), any());
    }

    @Test
    void aRepeatedHeaderIsHandedToTheResolverAsAnInvalidHost() throws Exception {
        when(resolver.resolve(",", "127.0.0.1")).thenReturn(TenantContext.unknown(null, Reason.INVALID_HOST));
        MockHttpServletResponse res = new MockHttpServletResponse();
        filter.doFilter(request("/api/orgs/7", "acme.kiwiply.com", "acme.kiwiply.com"), res, mock(FilterChain.class));
        verify(resolver).resolve(",", "127.0.0.1");
        assertThat(res.getStatus()).isEqualTo(404);
    }
    // ---- the shared secret (review finding 3): only the web server may name a host ---------------------------------------------

    private MockHttpServletRequest withSecret(MockHttpServletRequest req, String... secrets) {
        for (String v : secrets) req.addHeader(TenantHostTrust.SECRET_HEADER, v);
        return req;
    }

    @Test
    void aHostWithoutTheSecretIsNeverBelievedWhenASecretIsConfigured() throws Exception {
        TenantResolverFilter strict = new TenantResolverFilter(resolver, flag, new TenantHostTrust("s3cret-value", true));
        when(resolver.resolve(isNull(), anyString())).thenReturn(TenantContext.unknown(null, Reason.NO_HOST));
        for (MockHttpServletRequest req : new MockHttpServletRequest[] {
            request("/api/orgs/7", "acme.kiwiply.com"), // no secret
            withSecret(request("/api/orgs/7", "acme.kiwiply.com"), "wrong"),
            withSecret(request("/api/orgs/7", "acme.kiwiply.com"), "s3cret-value", "s3cret-value"), // repeated
            withSecret(request("/api/orgs/7", "acme.kiwiply.com"), ""),
        }) {
            FilterChain chain = mock(FilterChain.class);
            MockHttpServletResponse res = new MockHttpServletResponse();
            strict.doFilter(req, res, chain);
            verify(chain).doFilter(any(), any());
            assertThat(res.getStatus()).isEqualTo(200); // a legacy caller: path-based behaviour, not a tenant 404
            assertThat(((TenantContext) req.getAttribute(TenantContextHolder.REQUEST_ATTRIBUTE)).kind()).isEqualTo(TenantContext.Kind.UNKNOWN);
            assertThat(((TenantContext) req.getAttribute(TenantContextHolder.REQUEST_ATTRIBUTE)).reason()).isEqualTo(Reason.NO_HOST);
        }
        verify(resolver, never()).resolve(eq("acme.kiwiply.com"), any());
    }

    @Test
    void theRightSecretLetsTheHostThrough() throws Exception {
        TenantResolverFilter strict = new TenantResolverFilter(resolver, flag, new TenantHostTrust("s3cret-value", true));
        when(resolver.resolve("acme.kiwiply.com", "127.0.0.1")).thenReturn(TenantContext.tenant(12L, null, "acme.kiwiply.com"));
        MockHttpServletRequest req = withSecret(request("/api/profile", "acme.kiwiply.com"), "s3cret-value");
        strict.doFilter(req, new MockHttpServletResponse(), mock(FilterChain.class));
        assertThat(((TenantContext) req.getAttribute(TenantContextHolder.REQUEST_ATTRIBUTE)).orgId()).isEqualTo(12L);
    }

    @Test
    void aMissingSecretThatIsRequiredFailsClosedForEveryHost() throws Exception {
        TenantResolverFilter prodWithoutSecret = new TenantResolverFilter(resolver, flag, new TenantHostTrust("", true));
        when(resolver.resolve(isNull(), anyString())).thenReturn(TenantContext.unknown(null, Reason.NO_HOST));
        prodWithoutSecret.doFilter(request("/api/orgs/7", "acme.kiwiply.com"), new MockHttpServletResponse(), mock(FilterChain.class));
        verify(resolver, never()).resolve(eq("acme.kiwiply.com"), any());
    }

    @Test
    void theClientAddressIsTheLastForwardedHopNotTheFirst() throws Exception {
        when(resolver.resolve(anyString(), anyString())).thenReturn(TenantContext.platform("kiwiply.com"));
        MockHttpServletRequest req = request("/api/x", "kiwiply.com");
        req.addHeader("X-Forwarded-For", "6.6.6.6, 203.0.113.5");
        filter.doFilter(req, new MockHttpServletResponse(), mock(FilterChain.class));
        verify(resolver).resolve("kiwiply.com", "203.0.113.5");
    }
}
