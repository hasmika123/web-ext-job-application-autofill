package com.dossier.api.web.rest;

import static com.dossier.api.security.SecurityUtils.ACCESS_TOKEN_TYPE;
import static com.dossier.api.security.SecurityUtils.AUTHORITIES_CLAIM;
import static com.dossier.api.security.SecurityUtils.JWT_ALGORITHM;
import static com.dossier.api.security.SecurityUtils.REFRESH_TOKEN_TYPE;
import static com.dossier.api.security.SecurityUtils.TOKEN_TYPE_CLAIM;
import static com.dossier.api.security.SecurityUtils.USER_ID_CLAIM;

import com.dossier.api.security.DomainUserDetailsService.UserWithId;
import com.dossier.api.service.AdminMfaService;
import com.dossier.api.service.RefreshTokenService;
import com.dossier.api.web.rest.vm.LoginVM;
import com.dossier.api.web.rest.vm.MfaVM;
import com.dossier.api.web.rest.vm.RefreshVM;
import com.fasterxml.jackson.annotation.JsonInclude;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.security.Principal;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.config.annotation.authentication.builders.AuthenticationManagerBuilder;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtException;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.bind.annotation.*;

/**
 * Controller to authenticate users.
 *
 * <p>Issues a short-lived <b>access</b> token plus a long-lived <b>refresh</b> token
 * (stateless — both are signed JWTs, nothing is stored server-side). The refresh
 * token is distinguished by a {@code token_type} claim and is only accepted by
 * {@code POST /api/refresh}, never as an access bearer token (enforced by the
 * strict resource-server decoder in {@code SecurityJwtConfiguration}).
 */
@RestController
@RequestMapping("/api")
@Tag(name = "authentication", description = "Obtain and refresh the JWT access token. These endpoints are public (no bearer token required).")
public class AuthenticateController {

    private static final Logger LOG = LoggerFactory.getLogger(AuthenticateController.class);

    private final JwtEncoder jwtEncoder;

    private final JwtDecoder refreshTokenDecoder;

    // Access-token lifetime (short). Reuses JHipster's standard token-validity key.
    @Value("${jhipster.security.authentication.jwt.token-validity-in-seconds:0}")
    private long accessTokenValidityInSeconds;

    // Refresh-token lifetime (long). Reuses JHipster's remember-me validity key.
    @Value("${jhipster.security.authentication.jwt.token-validity-in-seconds-for-remember-me:0}")
    private long refreshTokenValidityInSeconds;

    private final AuthenticationManagerBuilder authenticationManagerBuilder;

    private final RefreshTokenService refreshTokenService;

    private final AdminMfaService adminMfaService;

    public AuthenticateController(
        JwtEncoder jwtEncoder,
        @Qualifier("refreshTokenDecoder") JwtDecoder refreshTokenDecoder,
        AuthenticationManagerBuilder authenticationManagerBuilder,
        RefreshTokenService refreshTokenService,
        AdminMfaService adminMfaService
    ) {
        this.jwtEncoder = jwtEncoder;
        this.refreshTokenDecoder = refreshTokenDecoder;
        this.authenticationManagerBuilder = authenticationManagerBuilder;
        this.refreshTokenService = refreshTokenService;
        this.adminMfaService = adminMfaService;
    }

    @Operation(
        summary = "Sign in",
        description = "Exchange username + password for a short-lived access token and a long-lived refresh token."
    )
    @PostMapping("/authenticate")
    public ResponseEntity<?> authorize(@Valid @RequestBody LoginVM loginVM) {
        UsernamePasswordAuthenticationToken authenticationToken = new UsernamePasswordAuthenticationToken(
            loginVM.getUsername(),
            loginVM.getPassword()
        );

        Authentication authentication = authenticationManagerBuilder.getObject().authenticate(authenticationToken);
        SecurityContextHolder.getContext().setAuthentication(authentication);

        String authorities = authentication.getAuthorities().stream().map(GrantedAuthority::getAuthority).collect(Collectors.joining(" "));
        Long userId = authentication.getPrincipal() instanceof UserWithId user ? user.getId() : null;

        // Admin email-OTP MFA (Phase 9.X.3) — when enabled, an admin gets an emailed code instead
        // of tokens here, and completes sign-in at /authenticate/mfa. If they have no email on file,
        // startChallenge returns empty and we fall through to a normal login (never lock out).
        if (adminMfaService.shouldChallenge(authorities)) {
            Optional<String> mfaToken = adminMfaService.startChallenge(authentication.getName(), userId, authorities);
            if (mfaToken.isPresent()) {
                return ResponseEntity.ok(new MfaRequiredResponse(mfaToken.get()));
            }
        }

        return issueTokens(authentication.getName(), authorities, userId);
    }

    /**
     * {@code POST /authenticate/mfa} : complete an admin MFA sign-in by submitting the emailed code.
     * Returns the token pair on success, or {@code 401} if the code/token is wrong, expired, or used.
     */
    @Operation(summary = "Complete MFA sign-in", description = "Exchange a valid mfaToken + emailed code for the token pair.")
    @PostMapping("/authenticate/mfa")
    public ResponseEntity<?> authorizeMfa(@Valid @RequestBody MfaVM mfaVM) {
        Optional<AdminMfaService.VerifiedClaims> claims = adminMfaService.verify(mfaVM.getMfaToken(), mfaVM.getCode());
        if (claims.isEmpty()) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        AdminMfaService.VerifiedClaims c = claims.get();
        return issueTokens(c.login(), c.authorities(), c.userId());
    }

    /** Build the access + refresh token pair (new rotation family) and the bearer header. */
    private ResponseEntity<TokenResponse> issueTokens(String subject, String authorities, Long userId) {
        String accessToken = buildToken(subject, authorities, userId, ACCESS_TOKEN_TYPE, accessTokenValidityInSeconds, null);
        // New login starts a new rotation family. The refresh token carries a jti recorded
        // server-side so it can be rotated and revoked.
        String family = UUID.randomUUID().toString();
        String refreshJti = UUID.randomUUID().toString();
        refreshTokenService.record(refreshJti, family, userId, Instant.now().plusSeconds(refreshTokenValidityInSeconds));
        String refreshToken = buildToken(subject, authorities, userId, REFRESH_TOKEN_TYPE, refreshTokenValidityInSeconds, refreshJti);

        HttpHeaders httpHeaders = new HttpHeaders();
        httpHeaders.setBearerAuth(accessToken);
        return new ResponseEntity<>(new TokenResponse(accessToken, refreshToken), httpHeaders, HttpStatus.OK);
    }

    /**
     * {@code POST /refresh} : exchange a valid refresh token for a fresh access token.
     * The refresh token itself is unchanged and stays valid until it expires.
     *
     * @return {@code 200} with a new access token, or {@code 401} if the supplied
     * token is missing/expired/tampered or is not a refresh token.
     */
    @Operation(
        summary = "Refresh the access token",
        description = "Exchange a valid refresh token for a fresh access token AND a fresh refresh token (rotation). " +
        "The presented refresh token is revoked; reusing it later revokes the whole token family. Returns 401 if the " +
        "token is missing, expired, tampered, already used, revoked, or is not a refresh token. Clients MUST store the " +
        "returned refresh token."
    )
    @PostMapping("/refresh")
    public ResponseEntity<TokenResponse> refresh(@Valid @RequestBody RefreshVM refreshVM) {
        Jwt jwt;
        try {
            jwt = refreshTokenDecoder.decode(refreshVM.getRefreshToken());
        } catch (JwtException e) {
            LOG.debug("Rejected refresh token: {}", e.getMessage());
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        // Only a refresh token may be exchanged here — an access token must not.
        if (!REFRESH_TOKEN_TYPE.equals(jwt.getClaimAsString(TOKEN_TYPE_CLAIM))) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        // Rotate: spend the presented token and continue its family. Unknown / already-used
        // (reuse) / expired tokens are rejected (reuse also revokes the family).
        var family = refreshTokenService.rotateAndGetFamily(jwt.getId());
        if (family.isEmpty()) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        String authorities = jwt.getClaimAsString(AUTHORITIES_CLAIM);
        Object rawUserId = jwt.getClaim(USER_ID_CLAIM);
        Long userId = rawUserId instanceof Number n ? n.longValue() : null;

        String accessToken = buildToken(jwt.getSubject(), authorities, userId, ACCESS_TOKEN_TYPE, accessTokenValidityInSeconds, null);
        String newRefreshJti = UUID.randomUUID().toString();
        refreshTokenService.record(newRefreshJti, family.get(), userId, Instant.now().plusSeconds(refreshTokenValidityInSeconds));
        String refreshToken = buildToken(jwt.getSubject(), authorities, userId, REFRESH_TOKEN_TYPE, refreshTokenValidityInSeconds, newRefreshJti);

        HttpHeaders httpHeaders = new HttpHeaders();
        httpHeaders.setBearerAuth(accessToken);
        return new ResponseEntity<>(new TokenResponse(accessToken, refreshToken), httpHeaders, HttpStatus.OK);
    }

    /**
     * {@code POST /logout} : revoke the supplied refresh token's family so it can no longer
     * be used to mint access tokens. Best-effort and idempotent — an invalid or already-gone
     * token still returns {@code 200} (nothing to leak, nothing to revoke).
     */
    @Operation(
        summary = "Log out (revoke refresh token)",
        description = "Revoke the supplied refresh token (and its rotation family) server-side. Always returns 200."
    )
    @PostMapping("/logout")
    public ResponseEntity<Void> logout(@Valid @RequestBody RefreshVM refreshVM) {
        try {
            Jwt jwt = refreshTokenDecoder.decode(refreshVM.getRefreshToken());
            refreshTokenService.revokeByJti(jwt.getId());
        } catch (JwtException e) {
            LOG.debug("Logout with an unusable refresh token (ignored): {}", e.getMessage());
        }
        return ResponseEntity.ok().build();
    }

    /**
     * {@code GET /authenticate} : check if the user is authenticated.
     *
     * @return the {@link ResponseEntity} with status {@code 204 (No Content)},
     * or with status {@code 401 (Unauthorized)} if not authenticated.
     */
    @Operation(summary = "Check authentication", description = "204 if the bearer token is valid, 401 otherwise.")
    @GetMapping("/authenticate")
    public ResponseEntity<Void> isAuthenticated(Principal principal) {
        LOG.debug("REST request to check if the current user is authenticated");
        return ResponseEntity.status(principal == null ? HttpStatus.UNAUTHORIZED : HttpStatus.NO_CONTENT).build();
    }

    /**
     * {@code POST /extension/session} : mint a NEW access + refresh token pair for the
     * already-authenticated user, for the browser extension. The new refresh token starts its
     * own rotation family, so the extension and the web session never invalidate each other's
     * refresh token. Requires a valid access token — the web app calls this server-side on
     * behalf of a signed-in user (see the web {@code /api/extension/token} route).
     */
    @Operation(
        summary = "Mint an extension session",
        description = "For the authenticated user, issue a fresh access + refresh token pair in a NEW rotation family, " +
        "for the browser extension. Requires a valid access token."
    )
    @PostMapping("/extension/session")
    public ResponseEntity<TokenResponse> extensionSession(Authentication authentication) {
        if (authentication == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        String authorities = authentication.getAuthorities().stream().map(GrantedAuthority::getAuthority).collect(Collectors.joining(" "));
        Long userId = null;
        if (authentication instanceof JwtAuthenticationToken jwtAuth) {
            Object rawUserId = jwtAuth.getToken().getClaim(USER_ID_CLAIM);
            userId = rawUserId instanceof Number n ? n.longValue() : null;
        }
        String subject = authentication.getName();

        String accessToken = buildToken(subject, authorities, userId, ACCESS_TOKEN_TYPE, accessTokenValidityInSeconds, null);
        // New family — independent of the web session's refresh rotation.
        String family = UUID.randomUUID().toString();
        String refreshJti = UUID.randomUUID().toString();
        refreshTokenService.record(refreshJti, family, userId, Instant.now().plusSeconds(refreshTokenValidityInSeconds));
        String refreshToken = buildToken(subject, authorities, userId, REFRESH_TOKEN_TYPE, refreshTokenValidityInSeconds, refreshJti);

        HttpHeaders httpHeaders = new HttpHeaders();
        httpHeaders.setBearerAuth(accessToken);
        return new ResponseEntity<>(new TokenResponse(accessToken, refreshToken), httpHeaders, HttpStatus.OK);
    }

    private String buildToken(String subject, String authorities, Long userId, String tokenType, long validityInSeconds, String jti) {
        Instant now = Instant.now();
        Instant validity = now.plus(validityInSeconds, ChronoUnit.SECONDS);

        // @formatter:off
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
            builder.id(jti); // standard "jti" claim — recorded for rotation/revocation
        }
        // @formatter:on

        JwsHeader jwsHeader = JwsHeader.with(JWT_ALGORITHM).build();
        return this.jwtEncoder.encode(JwtEncoderParameters.from(jwsHeader, builder.build())).getTokenValue();
    }

    /**
     * Response body for {@code /authenticate} (both tokens) and {@code /refresh}
     * (access token only — {@code refreshToken} is omitted when null).
     */
    /** Returned by {@code /authenticate} when an admin must complete email-OTP MFA. */
    static class MfaRequiredResponse {

        private final boolean mfaRequired = true;
        private final String mfaToken;

        MfaRequiredResponse(String mfaToken) {
            this.mfaToken = mfaToken;
        }

        public boolean isMfaRequired() {
            return mfaRequired;
        }

        public String getMfaToken() {
            return mfaToken;
        }
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    static class TokenResponse {

        private String accessToken;
        private String refreshToken;

        TokenResponse(String accessToken, String refreshToken) {
            this.accessToken = accessToken;
            this.refreshToken = refreshToken;
        }

        public String getAccessToken() {
            return accessToken;
        }

        public void setAccessToken(String accessToken) {
            this.accessToken = accessToken;
        }

        public String getRefreshToken() {
            return refreshToken;
        }

        public void setRefreshToken(String refreshToken) {
            this.refreshToken = refreshToken;
        }
    }
}
