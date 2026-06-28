package com.dossier.api.service;

import static com.dossier.api.security.SecurityUtils.ACCESS_TOKEN_TYPE;
import static com.dossier.api.security.SecurityUtils.AUTHORITIES_CLAIM;
import static com.dossier.api.security.SecurityUtils.JWT_ALGORITHM;
import static com.dossier.api.security.SecurityUtils.REFRESH_TOKEN_TYPE;
import static com.dossier.api.security.SecurityUtils.TOKEN_TYPE_CLAIM;
import static com.dossier.api.security.SecurityUtils.USER_ID_CLAIM;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.stereotype.Service;

/**
 * Issues our access + refresh JWT pair (a new rotation family), mirroring
 * {@code AuthenticateController}'s token build. Extracted so alternative sign-in
 * controllers (e.g. Google) can mint tokens WITHOUT being wired into AuthenticateController
 * — whose constructor is pinned by a sliced security test's hand-listed context.
 */
@Service
public class TokenIssuer {

    private final JwtEncoder jwtEncoder;
    private final RefreshTokenService refreshTokenService;

    @Value("${jhipster.security.authentication.jwt.token-validity-in-seconds:0}")
    private long accessTokenValidityInSeconds;

    @Value("${jhipster.security.authentication.jwt.token-validity-in-seconds-for-remember-me:0}")
    private long refreshTokenValidityInSeconds;

    public TokenIssuer(JwtEncoder jwtEncoder, RefreshTokenService refreshTokenService) {
        this.jwtEncoder = jwtEncoder;
        this.refreshTokenService = refreshTokenService;
    }

    /** Issue an access + refresh pair for the user, recording the refresh jti for rotation. */
    public TokenPair issue(String subject, String authorities, Long userId) {
        String accessToken = buildToken(subject, authorities, userId, ACCESS_TOKEN_TYPE, accessTokenValidityInSeconds, null);
        String family = UUID.randomUUID().toString();
        String refreshJti = UUID.randomUUID().toString();
        refreshTokenService.record(refreshJti, family, userId, Instant.now().plusSeconds(refreshTokenValidityInSeconds));
        String refreshToken = buildToken(subject, authorities, userId, REFRESH_TOKEN_TYPE, refreshTokenValidityInSeconds, refreshJti);
        return new TokenPair(accessToken, refreshToken);
    }

    private String buildToken(String subject, String authorities, Long userId, String tokenType, long validityInSeconds, String jti) {
        Instant now = Instant.now();
        Instant validity = now.plus(validityInSeconds, ChronoUnit.SECONDS);
        JwtClaimsSet.Builder builder = JwtClaimsSet.builder()
            .issuedAt(now)
            .expiresAt(validity)
            .subject(subject)
            .claim(AUTHORITIES_CLAIM, authorities)
            .claim(TOKEN_TYPE_CLAIM, tokenType);
        if (userId != null) {
            builder.claim(USER_ID_CLAIM, userId);
        }
        if (jti != null) {
            builder.id(jti);
        }
        JwsHeader jwsHeader = JwsHeader.with(JWT_ALGORITHM).build();
        return jwtEncoder.encode(JwtEncoderParameters.from(jwsHeader, builder.build())).getTokenValue();
    }

    /** Serializes to {@code {accessToken, refreshToken}} — the same shape as the auth endpoints. */
    public record TokenPair(String accessToken, String refreshToken) {}
}
