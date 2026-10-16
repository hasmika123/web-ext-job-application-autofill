package com.dossier.api.web.filter;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

/** T5.2: the API's response headers. */
class SecurityHeadersFilterTest {

    private MockHttpServletResponse run(MockHttpServletResponse response) throws Exception {
        MockFilterChain chain = new MockFilterChain();
        new SecurityHeadersFilter().doFilter(new MockHttpServletRequest("GET", "/api/anything"), response, chain);
        assertThat(chain.getRequest()).as("the request continues").isNotNull();
        return response;
    }

    @Test
    void everyResponseCarriesTheSafeHeaders() throws Exception {
        MockHttpServletResponse r = run(new MockHttpServletResponse());
        assertThat(r.getHeader("Strict-Transport-Security")).isEqualTo("max-age=31536000; includeSubDomains");
        assertThat(r.getHeader("X-Content-Type-Options")).isEqualTo("nosniff");
        assertThat(r.getHeader("Referrer-Policy")).isEqualTo("no-referrer");
        assertThat(r.getHeader("X-Frame-Options")).isEqualTo("DENY");
        assertThat(r.getHeader("Content-Security-Policy")).contains("frame-ancestors 'none'");
        assertThat(r.getHeader("Permissions-Policy")).contains("camera=()", "microphone=()", "geolocation=()");
    }

    @Test
    void theCspNeverSetsDefaultOrObjectSrcSoTheInlinePdfViewerKeepsWorking() throws Exception {
        String csp = run(new MockHttpServletResponse()).getHeader("Content-Security-Policy");
        assertThat(csp).doesNotContain("default-src").doesNotContain("object-src");
    }

    @Test
    void aHeaderAnotherLayerAlreadySetIsNotOverwrittenOrDuplicated() throws Exception {
        MockHttpServletResponse seeded = new MockHttpServletResponse();
        seeded.setHeader("X-Frame-Options", "SAMEORIGIN");
        MockHttpServletResponse r = run(seeded);
        assertThat(r.getHeaders("X-Frame-Options")).containsExactly("SAMEORIGIN");
    }
}
