package com.dossier.api.web.rest;

import com.dossier.api.security.LoginWorld;
import static com.dossier.api.security.SecurityUtils.ACCESS_TOKEN_TYPE;
import static com.dossier.api.security.SecurityUtils.AUTHORITIES_CLAIM;
import static com.dossier.api.security.SecurityUtils.EXTENSION_CLAIM;
import static com.dossier.api.security.SecurityUtils.HOSTNAME_CLAIM;
import static com.dossier.api.security.SecurityUtils.JWT_ALGORITHM;
import static com.dossier.api.security.SecurityUtils.REFRESH_TOKEN_TYPE;
import static com.dossier.api.security.SecurityUtils.TENANT_CLAIM;
import static com.dossier.api.security.SecurityUtils.TOKEN_TYPE_CLAIM;
import static com.dossier.api.security.SecurityUtils.PASSWORD_CHANGE_CLAIM;
import static com.dossier.api.security.SecurityUtils.USER_ID_CLAIM;

import com.dossier.api.security.DomainUserDetailsService.UserWithId;
import com.dossier.api.service.AccountScopes;
import com.dossier.api.service.AdminMfaService;
import com.dossier.api.service.DemoGuard;
import com.dossier.api.service.RefreshTokenService;
import com.dossier.api.service.ent.TenantBinding;
import com.dossier.api.service.ent.TenantSessionService;
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
import org.springframework.beans.factory.ObjectProvider;
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

    private final DemoGuard demoGuard;

    // Optional on purpose: this controller's constructor is pinned by the sliced AuthenticationIntegrationTest.
    private final ObjectProvider<TenantSessionService> tenantSessions;

    // Field-injected and optional: the sliced test pins the constructor. Used only to re-read the must-change-password flag on refresh.
    @org.springframework.beans.factory.annotation.Autowired(required = false)
    private com.dossier.api.repository.UserRepository userRepository;

    // Field-injected and optional for the same reason (the pinned slice): the O4 account-world services. Absent = legacy behaviour.
    @org.springframework.beans.factory.annotation.Autowired(required = false)
    private com.dossier.api.service.AccountScopes accountScopes;

    @org.springframework.beans.factory.annotation.Autowired(required = false)
    private com.dossier.api.web.filter.ScopedLoginThrottle loginThrottle;

    // Decision O4, phase S6: the enterprise extension connect (one-time code). Optional for the same reason (the pinned slice).
    @org.springframework.beans.factory.annotation.Autowired(required = false)
    private com.dossier.api.service.ExtensionConnectCodeService connectCodes;

    @org.springframework.beans.factory.annotation.Autowired(required = false)
    private com.dossier.api.web.filter.ConnectCodeThrottle connectThrottle;

    @org.springframework.beans.factory.annotation.Autowired(required = false)
    private com.dossier.api.service.ent.TenantUrls tenantUrls;

    @org.springframework.beans.factory.annotation.Autowired(required = false)
    private com.dossier.api.repository.org.OrganizationRepository organizations;

    // X2.9: the organization's own idle-session timeout. Optional for the same reason (the pinned slice): absent = the platform lifetime.
    @org.springframework.beans.factory.annotation.Autowired(required = false)
    private com.dossier.api.service.ent.settings.OrgSecurityPolicy orgSecurity;

    public AuthenticateController(
        JwtEncoder jwtEncoder,
        @Qualifier("refreshTokenDecoder") JwtDecoder refreshTokenDecoder,
        AuthenticationManagerBuilder authenticationManagerBuilder,
        RefreshTokenService refreshTokenService,
        AdminMfaService adminMfaService,
        DemoGuard demoGuard,
        ObjectProvider<TenantSessionService> tenantSessions
    ) {
        this.tenantSessions = tenantSessions;
        this.jwtEncoder = jwtEncoder;
        this.refreshTokenDecoder = refreshTokenDecoder;
        this.authenticationManagerBuilder = authenticationManagerBuilder;
        this.refreshTokenService = refreshTokenService;
        this.adminMfaService = adminMfaService;
        this.demoGuard = demoGuard;
    }

    @Operation(
        summary = "Sign in",
        description = "Exchange username + password for a short-lived access token and a long-lived refresh token."
    )
    @PostMapping("/authenticate")
    public ResponseEntity<?> authorize(@Valid @RequestBody LoginVM loginVM) {
        // A demo login (or its email) is refused with DEMO_DISABLED while the demo switch is off.
        demoGuard.assertLoginAllowed(loginVM.getUsername());
        UsernamePasswordAuthenticationToken authenticationToken = new UsernamePasswordAuthenticationToken(
            loginVM.getUsername(),
            loginVM.getPassword()
        );

        // O4: while separate accounts are in force, failed attempts are counted per (world, address), so one world's hammering never locks the other.
        String throttleKey = null;
        if (accountScopes != null && loginThrottle != null) {
            LoginWorld world = accountScopes.loginWorld();
            if (world.enforced()) {
                throttleKey = com.dossier.api.web.filter.ScopedLoginThrottle.key(world.key(), loginVM.getUsername());
                long retryAfter = loginThrottle.hit(throttleKey);
                if (retryAfter > 0) {
                    return ResponseEntity.status(429).header("Retry-After", Long.toString(retryAfter)).build();
                }
            }
        }

        Authentication authentication = authenticationManagerBuilder.getObject().authenticate(authenticationToken);
        if (throttleKey != null) loginThrottle.clear(throttleKey);
        SecurityContextHolder.getContext().setAuthentication(authentication);

        String authorities = authentication.getAuthorities().stream().map(GrantedAuthority::getAuthority).collect(Collectors.joining(" "));
        Long userId = authentication.getPrincipal() instanceof UserWithId user ? user.getId() : null;

        boolean passwordChangeRequired = false;
        if (authentication.getPrincipal() instanceof com.dossier.api.security.DomainUserDetailsService.UserWithId pu) {
            if (pu.isTempPasswordExpired()) {
                throw com.dossier.api.service.org.OrgException.coded(403, "TEMP_PASSWORD_EXPIRED", "This temporary password has expired. Ask your administrator to issue a new one.", java.util.Map.of());
            }
            passwordChangeRequired = pu.isPasswordChangeRequired();
        }

        // X1.5: on a tenant host the user needs an active seat in that org (403 NOT_A_MEMBER) BEFORE any MFA mail goes out.
        bindingFor(userId, authentication.getName(), true);

        // Admin email-OTP MFA (Phase 9.X.3) — when enabled, an admin gets an emailed code instead
        // of tokens here, and completes sign-in at /authenticate/mfa. If they have no email on file,
        // startChallenge returns empty and we fall through to a normal login (never lock out).
        if (adminMfaService.shouldChallenge(authorities)) {
            Optional<String> mfaToken = adminMfaService.startChallenge(authentication.getName(), userId, authorities);
            if (mfaToken.isPresent()) {
                return ResponseEntity.ok(new MfaRequiredResponse(mfaToken.get()));
            }
        }

        return issueTokens(authentication.getName(), authorities, userId, passwordChangeRequired);
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
        return issueTokens(c.login(), c.authorities(), c.userId(), false);
    }

    /** Build the access + refresh token pair (new rotation family) and the bearer header. */
    private ResponseEntity<TokenResponse> issueTokens(String subject, String authorities, Long userId, boolean pcr) {
        TenantBinding binding = bindingFor(userId, subject, false).orElse(null);
        long refreshSecs = refreshSecondsFor(binding, false);
        String accessToken = buildToken(subject, authorities, userId, ACCESS_TOKEN_TYPE, accessTokenValidityInSeconds, null, binding, pcr);
        // New login starts a new rotation family. The refresh token carries a jti recorded
        // server-side so it can be rotated and revoked.
        String family = UUID.randomUUID().toString();
        String refreshJti = UUID.randomUUID().toString();
        refreshTokenService.record(refreshJti, family, userId, Instant.now().plusSeconds(refreshSecs));
        String refreshToken = buildToken(subject, authorities, userId, REFRESH_TOKEN_TYPE, refreshSecs, refreshJti, binding, pcr);

        HttpHeaders httpHeaders = new HttpHeaders();
        httpHeaders.setBearerAuth(accessToken);
        return new ResponseEntity<>(new TokenResponse(accessToken, refreshToken), httpHeaders, HttpStatus.OK);
    }

    private Optional<TenantBinding> bindingFor(Long userId, String login, boolean auditInvite) {
        TenantSessionService sessions = tenantSessions.getIfAvailable();
        // O4: an enterprise account's tid is its own org_id (never the host's) and it has no tid-less invitation variant.
        Long accountOrgId = enterpriseOrgOf(userId);
        if (accountOrgId != null) {
            if (sessions == null) throw com.dossier.api.service.org.OrgException.notAMember();
            return Optional.of(sessions.bindingForEnterpriseAccount(accountOrgId, userId, login));
        }
        return sessions == null ? Optional.empty() : sessions.bindingForLogin(userId, login, inviteHeader(), auditInvite);
    }

    /** The organization of the signed-in ENTERPRISE account, or null (personal account, or separate accounts not in force). */
    private Long enterpriseOrgOf(Long userId) {
        if (accountScopes == null || userRepository == null || userId == null || !accountScopes.separateAccountsEnabled()) return null;
        return userRepository.findById(userId).map(com.dossier.api.domain.User::getOrgId).orElse(null);
    }

    /** The {@code X-Kiwiply-Invite} header of the current request (the invite token a not-yet-member signs in with, X1.8), or null. */
    private static String inviteHeader() {
        if (org.springframework.web.context.request.RequestContextHolder.getRequestAttributes() instanceof org.springframework.web.context.request.ServletRequestAttributes attrs) {
            return attrs.getRequest().getHeader("X-Kiwiply-Invite");
        }
        return null;
    }

    private static Long longClaim(Jwt jwt, String name) {
        Object raw = jwt.getClaim(name);
        return raw instanceof Number n ? n.longValue() : null;
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

        // O4: with separate accounts in force, a refresh token only works in its own world (host) and for an account whose org_id is its tid.
        Object worldUid = jwt.getClaim(USER_ID_CLAIM);
        if (accountScopes != null && userRepository != null && accountScopes.separateAccountsEnabled()) {
            Long worldUserId = worldUid instanceof Number n ? n.longValue() : null;
            com.dossier.api.domain.User account = worldUserId == null ? null : userRepository.findById(worldUserId).orElse(null);
            Long worldTid = longClaim(jwt, TENANT_CLAIM);
            // an enterprise extension token (ext=1) refreshes on the platform host (the extension calls api.kiwiply.com); it must belong to an enterprise account
            boolean worldExt = com.dossier.api.security.SecurityUtils.isExtension(jwt.getClaim(EXTENSION_CLAIM)) && worldTid != null && account != null && worldTid.equals(account.getOrgId());
            if (account == null || !accountScopes.tokenFitsAccount(worldTid, account.getOrgId()) || !accountScopes.tokenFitsWorld(worldTid, worldExt, com.dossier.api.service.ent.TenantContextHolder.current())) {
                return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
            }
        }

        // X1.5: a tenant-bound refresh token only works on its own tenant's host, while the seat is still active, and keeps its binding.
        Long tid = longClaim(jwt, TENANT_CLAIM);
        Long hid = longClaim(jwt, HOSTNAME_CLAIM);
        if (tid != null) {
            TenantSessionService sessions = tenantSessions.getIfAvailable();
            Object uid = jwt.getClaim(USER_ID_CLAIM);
            if (sessions == null || !sessions.refreshAllowed(tid, uid instanceof Number n ? n.longValue() : null)) {
                return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
            }
        }
        TenantBinding binding = tid == null ? null : new TenantBinding(tid, hid);
        // An enterprise extension token stays an extension token (ext=1, with its tid) through every rotation; only a token that already was one.
        boolean ext = tid != null && com.dossier.api.security.SecurityUtils.isExtension(jwt.getClaim(EXTENSION_CLAIM));

        // Rotate: spend the presented token and continue its family. Unknown / already-used
        // (reuse) / expired tokens are rejected (reuse also revokes the family).
        var family = refreshTokenService.rotateAndGetFamily(jwt.getId());
        if (family.isEmpty()) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        String authorities = jwt.getClaimAsString(AUTHORITIES_CLAIM);
        Object rawUserId = jwt.getClaim(USER_ID_CLAIM);
        Long userId = rawUserId instanceof Number n ? n.longValue() : null;

        boolean pcr = false;
        if (userRepository != null && userId != null) {
            com.dossier.api.domain.User u = userRepository.findById(userId).orElse(null);
            if (u != null && u.isPasswordChangeRequired()) {
                if (com.dossier.api.service.UserService.tempPasswordExpired(u)) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
                pcr = true;
            }
        }
        long refreshSecs = refreshSecondsFor(binding, ext);
        String accessToken = buildToken(jwt.getSubject(), authorities, userId, ACCESS_TOKEN_TYPE, accessTokenValidityInSeconds, null, binding, pcr, ext);
        String newRefreshJti = UUID.randomUUID().toString();
        refreshTokenService.record(newRefreshJti, family.get(), userId, Instant.now().plusSeconds(refreshSecs));
        String refreshToken = buildToken(jwt.getSubject(), authorities, userId, REFRESH_TOKEN_TYPE, refreshSecs, newRefreshJti, binding, pcr, ext);

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
        // Decision O4: this is the PERSONAL way in. An enterprise account connects with a one-time code from its tenant host (connect-code), so an
        // enterprise token gets the generic 404 here (it never receives a tid-less, personal-looking extension token).
        com.dossier.api.domain.User account = userRepository != null && userId != null ? userRepository.findById(userId).orElse(null) : null;
        if (com.dossier.api.config.Constants.isEnterpriseLogin(subject) || (account != null && account.getOrgId() != null)) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).build();
        }

        String accessToken = buildToken(subject, authorities, userId, ACCESS_TOKEN_TYPE, accessTokenValidityInSeconds, null, null); // personal: never tid
        // New family: independent of the web session's refresh rotation.
        String family = UUID.randomUUID().toString();
        String refreshJti = UUID.randomUUID().toString();
        refreshTokenService.record(refreshJti, family, userId, Instant.now().plusSeconds(refreshTokenValidityInSeconds));
        String refreshToken = buildToken(subject, authorities, userId, REFRESH_TOKEN_TYPE, refreshTokenValidityInSeconds, refreshJti, null);

        HttpHeaders httpHeaders = new HttpHeaders();
        httpHeaders.setBearerAuth(accessToken);
        // Which account this is travels with the session (doc 19 section 6.3): the web hands it to the extension next to access / refresh.
        TokenResponse body = new TokenResponse(accessToken, refreshToken).account("PERSONAL", userId, account == null ? null : account.getEmail(), subject, null, null);
        return new ResponseEntity<>(body, httpHeaders, HttpStatus.OK);
    }

    /**
     * {@code POST /extension/connect-code} : an enterprise account, signed in on its tenant host, asks for a one-time code that connects the browser
     * extension (decision O4, docs/enterprise-v2/19 section 6.3). The code is valid for 60 seconds, usable once, stored only as a hash, bound to this
     * account and its organization, and rate limited per account. The answer is the full link on the platform host (the web never builds a link to
     * another host itself). Anything but an enterprise session of an active seat is the generic 404.
     */
    @Operation(
        summary = "Start an extension connect (enterprise account)",
        description = "For an enterprise account's session: a one-time connect code (60 seconds, single use) as a link on the platform host. 404 for personal accounts and anything else."
    )
    @PostMapping("/extension/connect-code")
    public ResponseEntity<?> connectCode(Authentication authentication) {
        if (connectCodes == null || connectThrottle == null || userRepository == null || !(authentication instanceof JwtAuthenticationToken jwtAuth)) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).build();
        }
        Long userId = longClaim(jwtAuth.getToken(), USER_ID_CLAIM);
        Long tid = longClaim(jwtAuth.getToken(), TENANT_CLAIM);
        com.dossier.api.domain.User account = userId == null ? null : userRepository.findById(userId).orElse(null);
        TenantSessionService sessions = tenantSessions.getIfAvailable();
        if (
            account == null || !belongsTo(account, tid) || !account.isActivated() ||
            com.dossier.api.security.SecurityUtils.isExtension(jwtAuth.getToken().getClaim(EXTENSION_CLAIM)) || // an extension token can not mint another
            sessions == null || !sessions.refreshAllowed(tid, userId)
        ) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).build();
        }
        long wait = connectThrottle.hitMint(userId);
        if (wait > 0) return ResponseEntity.status(429).header("Retry-After", Long.toString(wait)).build();
        String code = connectCodes.mint(userId, tid);
        String base = tenantUrls == null ? "" : tenantUrls.base(null); // the platform base (never a tenant host)
        return ResponseEntity.ok(java.util.Map.of("connectUrl", base + "/connect?code=" + code, "expiresInSeconds", com.dossier.api.service.ExtensionConnectCodeService.VALID_SECONDS));
    }

    /**
     * {@code POST /extension/connect-code/exchange} : public. Spends a connect code once and returns the extension session of the enterprise account it
     * was minted for: an access + refresh pair in a NEW rotation family, both carrying {@code tid} and {@code ext=1}, plus who the account is. Every
     * failure (unknown, spent, expired, malformed, account or seat gone) is the same empty 401, so the exchange reveals nothing about a code.
     */
    @Operation(
        summary = "Exchange a connect code for an enterprise extension session",
        description = "Public. Single use, 60 seconds, rate limited. Returns the token pair (tid + ext=1) and the account; the same empty 401 for every failure."
    )
    @PostMapping("/extension/connect-code/exchange")
    public ResponseEntity<?> exchangeConnectCode(@RequestBody(required = false) java.util.Map<String, Object> body, jakarta.servlet.http.HttpServletRequest request) {
        if (connectCodes == null || connectThrottle == null || userRepository == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        long wait = connectThrottle.hitExchange(com.dossier.api.web.filter.RateLimitFilter.clientIp(request));
        if (wait > 0) return ResponseEntity.status(429).header("Retry-After", Long.toString(wait)).build();
        Object raw = body == null ? null : body.get("code");
        var spent = connectCodes.spend(raw instanceof String code ? code : null);
        if (spent.isEmpty()) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        com.dossier.api.domain.User account = userRepository.findById(spent.get().userId()).orElse(null);
        TenantSessionService sessions = tenantSessions.getIfAvailable();
        Long orgId = spent.get().orgId();
        if (
            account == null || !account.isActivated() || account.isPasswordChangeRequired() || !belongsTo(account, orgId) ||
            sessions == null || !sessions.refreshAllowed(orgId, account.getId())
        ) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        String subject = account.getLogin();
        // The authorities are lazy and this method runs outside a transaction (open-in-view is off), so read them with their own fetch-join query:
        // account.getAuthorities() here failed with a LazyInitializationException (a 500 on every enterprise extension connect).
        com.dossier.api.domain.User withAuthorities = userRepository.findOneWithAuthoritiesByLogin(subject).orElse(account);
        String authorities = withAuthorities.getAuthorities().stream().map(com.dossier.api.domain.Authority::getName).collect(Collectors.joining(" "));
        TenantBinding binding = new TenantBinding(orgId, null); // no hostname id: the platform host is not a tenant host
        String accessToken = buildToken(subject, authorities, account.getId(), ACCESS_TOKEN_TYPE, accessTokenValidityInSeconds, null, binding, false, true);
        String family = UUID.randomUUID().toString();
        String refreshJti = UUID.randomUUID().toString();
        refreshTokenService.record(refreshJti, family, account.getId(), Instant.now().plusSeconds(refreshTokenValidityInSeconds));
        String refreshToken = buildToken(subject, authorities, account.getId(), REFRESH_TOKEN_TYPE, refreshTokenValidityInSeconds, refreshJti, binding, false, true);
        String orgName = organizations == null ? null : organizations.findByOrgId(orgId).map(o -> o.getDisplayName() != null && !o.getDisplayName().isBlank() ? o.getDisplayName() : o.getName()).orElse(null);
        HttpHeaders httpHeaders = new HttpHeaders();
        httpHeaders.setBearerAuth(accessToken);
        // The synthetic ent# login is never sent: the extension identifies an enterprise account by user id and shows email + organization.
        TokenResponse out = new TokenResponse(accessToken, refreshToken).account("ENTERPRISE", account.getId(), account.getEmail(), null, orgId, orgName);
        return new ResponseEntity<>(out, httpHeaders, HttpStatus.OK);
    }

    /** X2.9: a session on an organization's host lives no longer than that organization's idle timeout (a refresh renews it). Extension tokens and personal sessions keep the platform lifetime. */
    /**
     * Whether {@code account} may hold an extension session of organization {@code orgId}: an enterprise account's own organization, or, for a
     * seeded enterprise DEMO member (a shared-mode login with no organization on its user row), the tenant it signed in on. The caller still checks
     * {@code refreshAllowed}, which proves the active membership; a personal account never passes.
     */
    static boolean belongsTo(com.dossier.api.domain.User account, Long orgId) {
        if (account == null || orgId == null) return false;
        if (account.getOrgId() != null) return account.getOrgId().equals(orgId);
        return com.dossier.api.service.ent.EnterpriseDemoSeeder.isEnterpriseDemoLogin(account.getLogin());
    }

    private long refreshSecondsFor(TenantBinding binding, boolean ext) {
        if (ext || binding == null || binding.orgId() == null || orgSecurity == null) return refreshTokenValidityInSeconds;
        return orgSecurity.refreshSeconds(binding.orgId(), refreshTokenValidityInSeconds);
    }

    private String buildToken(String subject, String authorities, Long userId, String tokenType, long validityInSeconds, String jti, TenantBinding binding) {
        return buildToken(subject, authorities, userId, tokenType, validityInSeconds, jti, binding, false);
    }

    private String buildToken(String subject, String authorities, Long userId, String tokenType, long validityInSeconds, String jti, TenantBinding binding, boolean pcr) {
        return buildToken(subject, authorities, userId, tokenType, validityInSeconds, jti, binding, pcr, false);
    }

    private String buildToken(String subject, String authorities, Long userId, String tokenType, long validityInSeconds, String jti, TenantBinding binding, boolean pcr, boolean ext) {
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
        if (binding != null && binding.orgId() != null) {
            builder.claim(TENANT_CLAIM, binding.orgId());
            if (binding.hostnameId() != null) builder.claim(HOSTNAME_CLAIM, binding.hostnameId());
        }
        if (ext) {
            builder.claim(EXTENSION_CLAIM, 1); // decision O4: an enterprise account's extension token (only ExtensionRoutes, see AccountKindRouteFilter)
        }
        if (pcr) {
            builder.claim(PASSWORD_CHANGE_CLAIM, true); // the session may only change the password (PasswordChangeRequiredFilter)
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

        // Decision O4 (extension handoff): which account the extension session belongs to. Absent (null, not serialized) on every other token response.
        private String kind;
        private Long userId;
        private String email;
        private String username;
        private Long orgId;
        private String orgName;

        TokenResponse account(String kind, Long userId, String email, String username, Long orgId, String orgName) {
            this.kind = kind;
            this.userId = userId;
            this.email = email;
            this.username = username;
            this.orgId = orgId;
            this.orgName = orgName;
            return this;
        }

        public String getKind() {
            return kind;
        }

        public Long getUserId() {
            return userId;
        }

        public String getEmail() {
            return email;
        }

        public String getUsername() {
            return username;
        }

        public Long getOrgId() {
            return orgId;
        }

        public String getOrgName() {
            return orgName;
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
