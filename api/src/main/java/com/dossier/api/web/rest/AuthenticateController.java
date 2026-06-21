package com.dossier.api.web.rest;

import static com.dossier.api.security.SecurityUtils.ACCESS_TOKEN_TYPE;
import static com.dossier.api.security.SecurityUtils.AUTHORITIES_CLAIM;
import static com.dossier.api.security.SecurityUtils.JWT_ALGORITHM;
import static com.dossier.api.security.SecurityUtils.REFRESH_TOKEN_TYPE;
import static com.dossier.api.security.SecurityUtils.TOKEN_TYPE_CLAIM;
import static com.dossier.api.security.SecurityUtils.USER_ID_CLAIM;

import com.dossier.api.security.DomainUserDetailsService.UserWithId;
import com.dossier.api.web.rest.vm.LoginVM;
import com.dossier.api.web.rest.vm.RefreshVM;
import com.fasterxml.jackson.annotation.JsonInclude;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.security.Principal;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
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

    public AuthenticateController(
        JwtEncoder jwtEncoder,
        @Qualifier("refreshTokenDecoder") JwtDecoder refreshTokenDecoder,
        AuthenticationManagerBuilder authenticationManagerBuilder
    ) {
        this.jwtEncoder = jwtEncoder;
        this.refreshTokenDecoder = refreshTokenDecoder;
        this.authenticationManagerBuilder = authenticationManagerBuilder;
    }

    @Operation(
        summary = "Sign in",
        description = "Exchange username + password for a short-lived access token and a long-lived refresh token."
    )
    @PostMapping("/authenticate")
    public ResponseEntity<TokenResponse> authorize(@Valid @RequestBody LoginVM loginVM) {
        UsernamePasswordAuthenticationToken authenticationToken = new UsernamePasswordAuthenticationToken(
            loginVM.getUsername(),
            loginVM.getPassword()
        );

        Authentication authentication = authenticationManagerBuilder.getObject().authenticate(authenticationToken);
        SecurityContextHolder.getContext().setAuthentication(authentication);

        String authorities = authentication.getAuthorities().stream().map(GrantedAuthority::getAuthority).collect(Collectors.joining(" "));
        Long userId = authentication.getPrincipal() instanceof UserWithId user ? user.getId() : null;

        String accessToken = buildToken(authentication.getName(), authorities, userId, ACCESS_TOKEN_TYPE, accessTokenValidityInSeconds);
        String refreshToken = buildToken(authentication.getName(), authorities, userId, REFRESH_TOKEN_TYPE, refreshTokenValidityInSeconds);

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
        description = "Exchange a valid refresh token for a fresh access token. Returns 401 if the token is missing, " +
        "expired, tampered, or is not a refresh token. The refresh token itself stays valid until it expires."
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

        String authorities = jwt.getClaimAsString(AUTHORITIES_CLAIM);
        Object rawUserId = jwt.getClaim(USER_ID_CLAIM);
        Long userId = rawUserId instanceof Number n ? n.longValue() : null;

        String accessToken = buildToken(jwt.getSubject(), authorities, userId, ACCESS_TOKEN_TYPE, accessTokenValidityInSeconds);
        HttpHeaders httpHeaders = new HttpHeaders();
        httpHeaders.setBearerAuth(accessToken);
        return new ResponseEntity<>(new TokenResponse(accessToken, null), httpHeaders, HttpStatus.OK);
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

    private String buildToken(String subject, String authorities, Long userId, String tokenType, long validityInSeconds) {
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
        // @formatter:on

        JwsHeader jwsHeader = JwsHeader.with(JWT_ALGORITHM).build();
        return this.jwtEncoder.encode(JwtEncoderParameters.from(jwsHeader, builder.build())).getTokenValue();
    }

    /**
     * Response body for {@code /authenticate} (both tokens) and {@code /refresh}
     * (access token only — {@code refreshToken} is omitted when null).
     */
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
