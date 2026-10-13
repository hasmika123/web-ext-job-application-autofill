package com.dossier.api.config;

import static org.assertj.core.api.Assertions.assertThat;

import com.dossier.api.security.SecurityUtils;
import com.dossier.api.service.ent.TenantContext;
import com.dossier.api.service.ent.TenantContextHolder;
import java.time.Instant;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.jwt.Jwt;

class TenantTokenBindingTest {

    @AfterEach
    void clear() {
        TenantContextHolder.clear();
    }

    private static Jwt token(Long tid) {
        Jwt.Builder b = Jwt.withTokenValue("t").header("alg", "HS512").subject("u").issuedAt(Instant.now()).expiresAt(Instant.now().plusSeconds(60));
        if (tid != null) b.claim(SecurityUtils.TENANT_CLAIM, tid);
        return b.build();
    }

    @Test
    void noContextMeansNoOpinion() {
        assertThat(TenantTokenBinding.validate(token(7L)).hasErrors()).isFalse();
    }

    @Test
    void anUnboundTokenIsAlwaysAcceptedHere() {
        TenantContextHolder.set(TenantContext.tenant(7L, null, "acme.kiwiply.com"));
        assertThat(TenantTokenBinding.validate(token(null)).hasErrors()).isFalse();
    }

    @Test
    void aBoundTokenMustMatchTheTenantHost() {
        TenantContextHolder.set(TenantContext.tenant(7L, null, "acme.kiwiply.com"));
        assertThat(TenantTokenBinding.validate(token(7L)).hasErrors()).isFalse();
        var bad = TenantTokenBinding.validate(token(8L));
        assertThat(bad.hasErrors()).isTrue();
        assertThat(bad.getErrors().iterator().next().getDescription()).isEqualTo("TOKEN_TENANT_MISMATCH");
    }

    @Test
    void aBoundTokenIsAcceptedOnThePlatformAndWithNoHostButNotOnAnUnservedHost() {
        TenantContextHolder.set(TenantContext.platform("kiwiply.com"));
        assertThat(TenantTokenBinding.validate(token(7L)).hasErrors()).isFalse();
        TenantContextHolder.set(TenantContext.unknown(null, TenantContext.Reason.NO_HOST));
        assertThat(TenantTokenBinding.validate(token(7L)).hasErrors()).isFalse();
        TenantContextHolder.set(TenantContext.unknown("nobody.kiwiply.com", TenantContext.Reason.UNKNOWN_HOST));
        assertThat(TenantTokenBinding.validate(token(7L)).hasErrors()).isTrue();
    }
}
