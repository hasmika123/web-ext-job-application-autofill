package com.dossier.api.security;

import static org.assertj.core.api.Assertions.assertThat;

import jakarta.servlet.http.HttpServletRequest;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;

/** X1.13: the scrape token authenticates only /management/prometheus, only when configured long enough. */
class ScrapeTokenFilterTest {

    private static final String TOKEN = "s".repeat(40);

    @AfterEach
    void clear() {
        SecurityContextHolder.clearContext();
    }

    private MockFilterChain run(String configured, String path, String authorization) throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", path);
        if (authorization != null) request.addHeader("Authorization", authorization);
        MockFilterChain chain = new MockFilterChain();
        new ScrapeTokenFilter(configured).doFilter(request, new MockHttpServletResponse(), chain);
        return chain;
    }

    @Test
    void rightTokenAuthenticatesAsScraperOnlyAndHidesTheHeader() throws Exception {
        MockFilterChain chain = run(TOKEN, "/management/prometheus", "Bearer " + TOKEN);
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        assertThat(auth).isNotNull();
        assertThat(auth.getAuthorities()).extracting(Object::toString).containsExactly(ScrapeTokenFilter.AUTHORITY);
        assertThat(((HttpServletRequest) chain.getRequest()).getHeader("Authorization")).isNull();
    }

    @Test
    void wrongTokenAuthenticatesNothing() throws Exception {
        run(TOKEN, "/management/prometheus", "Bearer " + "x".repeat(40));
        assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
    }

    @Test
    void noHeaderAuthenticatesNothing() throws Exception {
        run(TOKEN, "/management/prometheus", null);
        assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
    }

    @Test
    void otherPathsAreNeverAuthenticatedByTheToken() throws Exception {
        run(TOKEN, "/management/info", "Bearer " + TOKEN);
        run(TOKEN, "/api/admin/users", "Bearer " + TOKEN);
        assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
    }

    @Test
    void unsetOrShortTokenDisablesThePath() throws Exception {
        run("", "/management/prometheus", "Bearer ");
        run(null, "/management/prometheus", "Bearer anything");
        run("short", "/management/prometheus", "Bearer short");
        assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
    }
}
