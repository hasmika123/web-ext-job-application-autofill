package com.dossier.api.security;

import static org.assertj.core.api.Assertions.assertThat;

import jakarta.servlet.FilterChain;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.core.context.SecurityContextHolder;

/** The service-to-service token check (Resume Builder R3.7): exact match or 401, and a blank secret admits nobody. */
class InternalTokenFilterTest {

    @AfterEach
    void clear() {
        SecurityContextHolder.clearContext();
    }

    private record Outcome(int status, boolean chainCalled, String principal) {}

    private Outcome run(String configured, String presented) throws Exception {
        MockHttpServletRequest req = new MockHttpServletRequest("POST", "/api/internal/resume-pdf-jobs/claim");
        if (presented != null) req.addHeader(InternalTokenFilter.HEADER, presented);
        MockHttpServletResponse res = new MockHttpServletResponse();
        boolean[] called = { false };
        FilterChain chain = (r, s) -> called[0] = true;
        new InternalTokenFilter(configured).doFilter(req, res, chain);
        var auth = SecurityContextHolder.getContext().getAuthentication();
        return new Outcome(res.getStatus(), called[0], auth == null ? null : String.valueOf(auth.getPrincipal()));
    }

    @Test
    void theExactTokenPassesAsTheInternalWorker() throws Exception {
        Outcome o = run("s3cret-value", "s3cret-value");
        assertThat(o.chainCalled()).isTrue();
        assertThat(o.principal()).isEqualTo("internal-worker");
        assertThat(SecurityContextHolder.getContext().getAuthentication().getAuthorities()).extracting(Object::toString).containsExactly(InternalTokenFilter.AUTHORITY);
    }

    @Test
    void anythingElseIs401AndNeverReachesTheController() throws Exception {
        for (String presented : new String[] { null, "", "wrong", "s3cret-valu", "s3cret-value ", "S3CRET-VALUE", "s3cret-value-and-more" }) {
            Outcome o = run("s3cret-value", presented);
            assertThat(o.status()).as("presented=%s", presented).isEqualTo(401);
            assertThat(o.chainCalled()).isFalse();
            assertThat(o.principal()).isNull();
        }
    }

    @Test
    void aBlankConfiguredTokenAdmitsNobodyNotEvenABlankHeader() throws Exception {
        for (String configured : new String[] { null, "", "   " }) {
            for (String presented : new String[] { null, "", "   ", "anything" }) {
                Outcome o = run(configured, presented);
                assertThat(o.status()).isEqualTo(401);
                assertThat(o.chainCalled()).isFalse();
            }
        }
    }
}
