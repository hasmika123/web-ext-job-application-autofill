package com.dossier.api.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

import jakarta.servlet.FilterChain;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;

/**
 * Decision O4: an {@code ext=1} token reaches only {@link ExtensionRoutes}, WHOEVER the subject is. A member of a shared-accounts organization connects
 * the extension with an ordinary account (no {@code ent#} login); its extension token must be held to the same list as a separate-accounts member's.
 * A personal extension token (no {@code ext}) keeps today's route set, and the personal-only refusals stay for {@code ent#} subjects.
 */
class AccountKindRouteFilterTest {

    private static final long TID = 7L;

    private final AccountKindRouteFilter filter = new AccountKindRouteFilter();
    private FilterChain chain;
    private MockHttpServletResponse response;

    @BeforeEach
    void wire() {
        fresh();
    }

    @AfterEach
    void clear() {
        SecurityContextHolder.clearContext();
    }

    private void fresh() {
        chain = mock(FilterChain.class);
        response = new MockHttpServletResponse();
    }

    private void token(String subject, Long tid, Integer ext) {
        Jwt.Builder b = Jwt.withTokenValue("t").header("alg", "none").subject(subject).claim("userId", 3L).issuedAt(Instant.now()).expiresAt(Instant.now().plusSeconds(60));
        if (tid != null) b.claim("tid", tid);
        if (ext != null) b.claim("ext", ext);
        SecurityContextHolder.getContext().setAuthentication(new JwtAuthenticationToken(b.build(), List.of()));
    }

    private void run(String method, String path) throws Exception {
        filter.doFilter(new MockHttpServletRequest(method, path), response, chain);
    }

    private void assertPassed() throws Exception {
        assertThat(response.getStatus()).isEqualTo(200);
        verify(chain).doFilter(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any());
    }

    private void assertRefused() {
        assertThat(response.getStatus()).isEqualTo(404);
        verifyNoInteractions(chain);
    }

    @Test
    void anExtensionTokenOfAnOrdinaryAccountIsHeldToExtensionRoutes() throws Exception {
        for (String path : List.of("/api/account", "/api/billing/me", "/api/profile/inbox", "/api/notifications", "/api/orgs/" + TID + "/members", "/api/orgs/99/me-workspace/profile", "/api/admin/users")) {
            fresh();
            token("anika-shared", TID, 1);
            run("GET", path);
            assertRefused();
        }
    }

    @Test
    void anExtensionTokenOfAnOrdinaryAccountReachesTheExtensionRoutesOfItsOwnOrganization() throws Exception {
        for (String path : List.of("/api/profile", "/api/profile/version", "/api/profile/resumes", "/api/ai/usage", "/api/orgs/" + TID + "/me-workspace/profile", "/api/orgs/" + TID + "/con/opportunities")) {
            fresh();
            token("anika-shared", TID, 1);
            run("GET", path);
            assertPassed();
        }
    }

    @Test
    void aPersonalTokenWithoutExtIsNotJudgedEvenWithATid() throws Exception {
        // a shared-accounts member's ordinary web session carries tid but not ext: unchanged
        token("anika-shared", TID, null);
        run("GET", "/api/account");
        assertPassed();
    }

    @Test
    void aTokenWithoutTidOrExtIsNotJudged() throws Exception {
        token("someone", null, null);
        run("GET", "/api/billing/me");
        assertPassed();
    }

    @Test
    void anEnterpriseLoginKeepsItsPersonalOnlyRefusalsAndItsExtensionAllowList() throws Exception {
        token("ent#7#lee@x.test", TID, null);
        run("GET", "/api/billing/me");
        assertRefused();

        fresh();
        token("ent#7#lee@x.test", TID, 1);
        run("GET", "/api/account");
        assertRefused();

        fresh();
        token("ent#7#lee@x.test", TID, 1);
        run("GET", "/api/profile/version");
        assertPassed();
    }
}
