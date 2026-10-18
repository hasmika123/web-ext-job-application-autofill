package com.dossier.api.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dossier.api.service.org.OrgFeatureFlag;
import jakarta.servlet.FilterChain;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

/** E2E-O1.9: while the flag is off the org API is a plain 404; while on, and for every other path, the filter is invisible. */
class OrgsEnabledFilterTest {

    private final OrgFeatureFlag flag = mock(OrgFeatureFlag.class);
    private final OrgsEnabledFilter filter = new OrgsEnabledFilter(flag);

    private MockHttpServletResponse run(String uri, boolean enabled, FilterChain chain) throws Exception {
        when(flag.isEnabled()).thenReturn(enabled);
        MockHttpServletRequest req = new MockHttpServletRequest("GET", uri);
        req.setRequestURI(uri);
        MockHttpServletResponse res = new MockHttpServletResponse();
        filter.doFilter(req, res, chain);
        return res;
    }

    @Test
    void theOrgApiPathsAreRecognisedEvenWhenDecorated() {
        for (String p : List.of(
            "/api/orgs", "/api/orgs/", "/api/orgs/mine", "/api/orgs/7/groups", "/api/join/abc", "/api/join/code/KIWI7F3A", "/api/me/orgs", "/api/me/orgs/7/share",
            "//api//orgs/7", "/api/orgs;jsessionid=x/7", "/api/./orgs/7", "/api/x/../orgs/7", "/api/join;x=1/abc"
        )) {
            assertThat(OrgsEnabledFilter.isOrgPath(p)).as(p).isTrue();
        }
    }

    @Test
    void otherPathsAreNotOrgPaths() {
        for (String p : List.of("/api/organizations", "/api/orgsx", "/api/me/orgsx", "/api/me", "/api/profile", "/api/joined", "/api/config/public", "/api", "/", "/api/account/orgs")) {
            assertThat(OrgsEnabledFilter.isOrgPath(p)).as(p).isFalse();
        }
        assertThat(OrgsEnabledFilter.isOrgPath(null)).isFalse();
    }

    @Test
    void whileOffAnOrgRequestIsAGeneric404AndTheChainNeverRuns() throws Exception {
        FilterChain chain = mock(FilterChain.class);
        MockHttpServletResponse res = run("/api/orgs/7/groups", false, chain);

        assertThat(res.getStatus()).isEqualTo(404);
        assertThat(res.getContentType()).startsWith("application/problem+json");
        assertThat(res.getContentAsString()).contains("\"code\":\"NOT_FOUND\"").doesNotContain("forbidden").doesNotContain("disabled").doesNotContain("flag");
        verify(chain, never()).doFilter(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any());
    }

    @Test
    void whileOffTheJoinAndMemberSidePathsAreDarkToo() throws Exception {
        for (String uri : List.of("/api/join/abc", "/api/join/code/KIWI7F3A", "/api/me/orgs", "/api/me/orgs/7/share", "/api/orgs")) {
            FilterChain chain = mock(FilterChain.class);
            assertThat(run(uri, false, chain).getStatus()).as(uri).isEqualTo(404);
            verify(chain, never()).doFilter(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any());
        }
    }

    @Test
    void whileOnTheRequestPassesThrough() throws Exception {
        FilterChain chain = mock(FilterChain.class);
        MockHttpServletResponse res = run("/api/orgs/mine", true, chain);
        assertThat(res.getStatus()).isEqualTo(200);
        verify(chain).doFilter(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any());
    }

    @Test
    void anyOtherPathPassesThroughWhileOff() throws Exception {
        FilterChain chain = mock(FilterChain.class);
        MockHttpServletResponse res = run("/api/profile", false, chain);
        assertThat(res.getStatus()).isEqualTo(200);
        verify(chain).doFilter(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any());
    }
}
