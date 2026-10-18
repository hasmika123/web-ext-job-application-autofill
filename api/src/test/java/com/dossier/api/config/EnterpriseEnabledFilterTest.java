package com.dossier.api.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dossier.api.service.ent.EnterpriseFeatureFlag;
import jakarta.servlet.FilterChain;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

/** X1.1: while the master flag is off the enterprise surface is a plain 404 (same body as an org that does not exist); on, and for every other path, the filter is invisible. */
class EnterpriseEnabledFilterTest {

    private final EnterpriseFeatureFlag flag = mock(EnterpriseFeatureFlag.class);
    private final EnterpriseEnabledFilter filter = new EnterpriseEnabledFilter(flag);

    private MockHttpServletResponse run(String uri, boolean enabled, FilterChain chain) throws Exception {
        when(flag.isEnabled()).thenReturn(enabled);
        MockHttpServletRequest req = new MockHttpServletRequest("GET", uri);
        req.setRequestURI(uri);
        MockHttpServletResponse res = new MockHttpServletResponse();
        filter.doFilter(req, res, chain);
        return res;
    }

    @Test
    void theEnterprisePathsAreRecognisedEvenWhenDecorated() {
        for (String p : List.of(
            "/api/public/tenant", "/api/public/tenant/", "/api/ent", "/api/ent/", "/api/ent/anything/at/all", "/api/orgs/7/enterprise", "/api/orgs/7/enterprise/roles",
            "//api//public//tenant", "/api/public;jsessionid=x/tenant", "/api/./ent/x", "/api/x/../ent/x", "/api/orgs;x=1/7/enterprise/x", "/api/orgs/7/./enterprise/x", "/api/orgs/7/x/../enterprise/x"
        )) {
            assertThat(EnterpriseEnabledFilter.isEnterprisePath(p)).as(p).isTrue();
        }
    }

    @Test
    void otherPathsAreNotEnterprisePaths() {
        for (String p : List.of(
            "/api/public/tenants", "/api/public/demo", "/api/public/resumes/abc", "/api/entities", "/api/entx", "/api/orgs/7", "/api/orgs/7/groups", "/api/orgs/enterprise",
            "/api/orgs/7/enterprises", "/api/me/orgs", "/api/profile", "/api", "/", "/api/internal/tenant-hosts/check"
        )) {
            assertThat(EnterpriseEnabledFilter.isEnterprisePath(p)).as(p).isFalse();
        }
        assertThat(EnterpriseEnabledFilter.isEnterprisePath(null)).isFalse();
    }

    @Test
    void whileOffEveryEnterprisePathIsAGeneric404AndTheChainNeverRuns() throws Exception {
        for (String uri : List.of("/api/public/tenant", "/api/ent/x", "/api/ent", "/api/orgs/7/enterprise/roles", "/api/orgs/7/enterprise")) {
            FilterChain chain = mock(FilterChain.class);
            MockHttpServletResponse res = run(uri, false, chain);
            assertThat(res.getStatus()).as(uri).isEqualTo(404);
            assertThat(res.getContentType()).startsWith("application/problem+json");
            assertThat(res.getContentAsString()).contains("\"code\":\"NOT_FOUND\"").contains("\"message\":\"error.org\"").doesNotContain("forbidden").doesNotContain("disabled").doesNotContain("flag").doesNotContain("enterprise\":");
            verify(chain, never()).doFilter(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any());
        }
    }

    @Test
    void theBodyIsTheSameOneTheOrgWallAnswers() throws Exception {
        MockHttpServletResponse res = run("/api/ent/x", false, mock(FilterChain.class));
        assertThat(res.getContentAsString()).isEqualTo(OrgsEnabledFilter.body("/api/ent/x"));
    }

    @Test
    void whileOnTheRequestPassesThrough() throws Exception {
        for (String uri : List.of("/api/public/tenant", "/api/ent/x", "/api/orgs/7/enterprise/roles")) {
            FilterChain chain = mock(FilterChain.class);
            MockHttpServletResponse res = run(uri, true, chain);
            assertThat(res.getStatus()).as(uri).isEqualTo(200);
            verify(chain).doFilter(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any());
        }
    }

    @Test
    void anyOtherPathPassesThroughWhileOff() throws Exception {
        for (String uri : List.of("/api/profile", "/api/orgs/7/groups", "/api/config/public", "/api/public/demo")) {
            FilterChain chain = mock(FilterChain.class);
            MockHttpServletResponse res = run(uri, false, chain);
            assertThat(res.getStatus()).as(uri).isEqualTo(200);
            verify(chain).doFilter(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any());
        }
    }
}
