package com.dossier.api.web.filter;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Set;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

/** X1.13 (E12): table of Host x X-Forwarded-Host x path for the public-host guard. */
class PublicHostGuardFilterTest {

    private static final Set<String> INTERNAL = Set.of("localhost", "127.0.0.1", "[::1]", "api", "dossier-api", "web", "dossier-web");

    private int status(boolean enabled, String path, String serverName, String forwardedHost) throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", path);
        request.setServerName(serverName);
        if (forwardedHost != null) request.addHeader("X-Forwarded-Host", forwardedHost);
        MockHttpServletResponse response = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();
        new PublicHostGuardFilter(enabled, INTERNAL).doFilter(request, response, chain);
        boolean passed = chain.getRequest() != null;
        if (passed) assertThat(response.getStatus()).isEqualTo(200);
        else assertThat(response.getContentAsString()).isEmpty();
        return passed ? 200 : response.getStatus();
    }

    @Test
    void internalCallersPass() throws Exception {
        assertThat(status(true, "/api/internal/tenant-hosts/check", "api", null)).isEqualTo(200);
        assertThat(status(true, "/api/internal/resume-pdf-jobs", "dossier-api", null)).isEqualTo(200);
        assertThat(status(true, "/management/prometheus", "localhost", null)).isEqualTo(200);
        assertThat(status(true, "/management/info", "127.0.0.1", null)).isEqualTo(200);
    }

    @Test
    void forwardedRequestsAreRefusedEvenForAnInternalHost() throws Exception {
        assertThat(status(true, "/api/internal/tenant-hosts/check", "api", "api.kiwiply.com")).isEqualTo(404);
        assertThat(status(true, "/management/prometheus", "localhost", "api.kiwiply.com")).isEqualTo(404);
    }

    @Test
    void publicAndTenantHostsAreRefused() throws Exception {
        assertThat(status(true, "/api/internal/tenant-hosts/check", "api.kiwiply.com", null)).isEqualTo(404);
        assertThat(status(true, "/management/prometheus", "acme.kiwiply.com", null)).isEqualTo(404);
        assertThat(status(true, "/management/env", "hr.acme.com", null)).isEqualTo(404);
        assertThat(status(true, "/management", "api.kiwiply.com", null)).isEqualTo(404);
        assertThat(status(true, "/api/internal", "api.kiwiply.com", null)).isEqualTo(404);
    }

    @Test
    void healthStaysReachableFromAnywhere() throws Exception {
        assertThat(status(true, "/management/health", "api.kiwiply.com", "api.kiwiply.com")).isEqualTo(200);
        assertThat(status(true, "/management/health/liveness", "api.kiwiply.com", null)).isEqualTo(200);
        assertThat(status(true, "/management/health/readiness", "api.kiwiply.com", null)).isEqualTo(200);
        // a path that merely starts with the word is not the health probe
        assertThat(status(true, "/management/healthz", "api.kiwiply.com", null)).isEqualTo(404);
    }

    @Test
    void otherRoutesAreNeverTouched() throws Exception {
        assertThat(status(true, "/api/profile/version", "api.kiwiply.com", "api.kiwiply.com")).isEqualTo(200);
        assertThat(status(true, "/api/internalx", "api.kiwiply.com", null)).isEqualTo(200);
    }

    @Test
    void theMasterSwitchTurnsTheGuardOff() throws Exception {
        assertThat(status(false, "/management/prometheus", "api.kiwiply.com", "api.kiwiply.com")).isEqualTo(200);
    }

    @Test
    void hostCaseIsIgnored() throws Exception {
        assertThat(status(true, "/api/internal/x", "API", null)).isEqualTo(200);
    }
}
