package com.dossier.api.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.User;
import com.dossier.api.security.SecurityUtils;
import com.dossier.api.service.ent.TenantContext;
import com.dossier.api.service.ent.TenantContextHolder;
import com.dossier.api.service.ent.mkt.resumes.ActForBuilderGate;
import com.dossier.api.service.org.OrgNotFoundException;
import com.dossier.api.service.resume.ResumeActAs;
import jakarta.servlet.FilterChain;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.method.HandlerMethod;

/**
 * Thread hygiene of the act-for identity swap: the window is closed on every exit (return, refusal, error, a handler that went async), and a request-end
 * filter clears whatever is left, so a pooled thread never carries a consultant's identity or an acting scope into the next request.
 */
class ActForThreadHygieneTest {

    @AfterEach
    void clear() {
        SecurityContextHolder.clearContext();
        TenantContextHolder.clear();
        ResumeActAs.clearThread();
    }

    private static User consultant() {
        User u = new User();
        u.setLogin("consultant");
        return u;
    }

    private static final ResumeActAs.Scope SCOPE = new ResumeActAs.Scope(5L, "marketer", 11L);

    // ---- the filter ------------------------------------------------------------------------------------------------

    @Test
    void theFilterClearsAnActingScopeThatNobodyClosedEvenWhenTheChainThrows() throws Exception {
        ActForCleanupFilter filter = new ActForCleanupFilter();
        FilterChain leaky = (req, res) -> {
            ResumeActAs.open(consultant(), SCOPE); // a code path that forgets to close its window
            throw new IllegalStateException("boom");
        };
        assertThatThrownBy(() -> filter.doFilter(new MockHttpServletRequest(), new MockHttpServletResponse(), leaky)).isInstanceOf(IllegalStateException.class);
        assertThat(ResumeActAs.current()).as("the next request on this thread").isEmpty();
    }

    @Test
    void theFilterAlsoStartsEveryRequestWithNobodyActing() throws Exception {
        ResumeActAs.open(consultant(), SCOPE); // left over from a previous request on this pooled thread
        boolean[] sawEmpty = new boolean[1];
        new ActForCleanupFilter().doFilter(new MockHttpServletRequest(), new MockHttpServletResponse(), (req, res) -> sawEmpty[0] = ResumeActAs.current().isEmpty());
        assertThat(sawEmpty[0]).isTrue();
    }

    // ---- the interceptor ---------------------------------------------------------------------------------------------

    private static MockHttpServletRequest actForRequest() {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/profile/resumes/9/doc");
        request.addHeader(ActForBuilderGate.HEADER, "3");
        request.setAttribute(TenantContextHolder.REQUEST_ATTRIBUTE, TenantContext.tenant(5L, null, "acme.kiwiply.com"));
        return request;
    }

    private static JwtAuthenticationToken tokenWith(Long tid) {
        Jwt.Builder b = Jwt.withTokenValue("t").header("alg", "none").subject("marketer").issuedAt(Instant.now()).expiresAt(Instant.now().plusSeconds(60));
        if (tid != null) b.claim("tid", tid);
        return new JwtAuthenticationToken(b.build(), List.of(new SimpleGrantedAuthority("ROLE_USER")));
    }

    private static HandlerMethod handler() throws Exception {
        return new HandlerMethod(new Object(), Object.class.getMethod("toString"));
    }

    @Test
    void theWindowIsClosedWhenTheHandlerGoesAsyncNotJustAtCompletion() throws Exception {
        ActForBuilderGate gate = mock(ActForBuilderGate.class);
        when(gate.authorize(eq(5L), eq(5L), eq("3"), eq("GET"), any())).thenReturn(new ActForBuilderGate.Grant(consultant(), SCOPE, 9L, null));
        SecurityContextHolder.getContext().setAuthentication(tokenWith(5L));
        ActForBuilderInterceptor interceptor = new ActForBuilderInterceptor(gate);
        MockHttpServletRequest request = actForRequest();
        MockHttpServletResponse response = new MockHttpServletResponse();

        assertThat(interceptor.preHandle(request, response, handler())).isTrue();
        assertThat(ResumeActAs.current()).as("inside the window").isPresent();
        assertThat(SecurityUtils.getCurrentUserLogin()).contains("consultant");

        interceptor.afterConcurrentHandlingStarted(request, response, handler()); // Spring calls this INSTEAD of afterCompletion on the first thread
        assertThat(ResumeActAs.current()).as("the pooled thread is released clean").isEmpty();
        assertThat(SecurityUtils.getCurrentUserLogin()).as("and is the real caller again").contains("marketer");

        interceptor.afterCompletion(request, response, handler(), null); // closing twice is harmless
        assertThat(ResumeActAs.current()).isEmpty();
    }

    @Test
    void theGateGetsTheTokensTenantAndATidLessTokenIsHandedOverAsNull() throws Exception {
        ActForBuilderGate gate = mock(ActForBuilderGate.class);
        when(gate.authorize(anyLong(), any(), any(), any(), any())).thenThrow(new OrgNotFoundException());
        ActForBuilderInterceptor interceptor = new ActForBuilderInterceptor(gate);

        SecurityContextHolder.getContext().setAuthentication(tokenWith(null));
        assertThatThrownBy(() -> interceptor.preHandle(actForRequest(), new MockHttpServletResponse(), handler())).isInstanceOf(OrgNotFoundException.class);
        verify(gate).authorize(eq(5L), eq(null), eq("3"), eq("GET"), any());

        // a non-JWT authentication has no tenant claim either
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken("marketer", "x", List.of()));
        assertThatThrownBy(() -> interceptor.preHandle(actForRequest(), new MockHttpServletResponse(), handler())).isInstanceOf(OrgNotFoundException.class);
        assertThat(ResumeActAs.current()).as("a refusal never opens a window").isEmpty();
    }

    @Test
    void aRequestWithoutTheHeaderIsUntouched() throws Exception {
        ActForBuilderGate gate = mock(ActForBuilderGate.class);
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/profile/resumes/9/doc");
        assertThat(new ActForBuilderInterceptor(gate).preHandle(request, new MockHttpServletResponse(), handler())).isTrue();
        assertThat(ResumeActAs.current()).isEmpty();
    }
}
