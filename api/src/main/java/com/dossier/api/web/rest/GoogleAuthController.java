package com.dossier.api.web.rest;

import com.dossier.api.security.LoginWorld;
import com.dossier.api.domain.Authority;
import com.dossier.api.domain.User;
import com.dossier.api.security.AuthoritiesConstants;
import com.dossier.api.service.AccountScopes;
import com.dossier.api.service.DemoAccountService;
import com.dossier.api.service.GoogleIdTokenService;
import com.dossier.api.service.TokenIssuer;
import com.dossier.api.service.UserService;
import com.dossier.api.service.ent.TenantBinding;
import com.dossier.api.service.ent.TenantSessionService;
import com.dossier.api.service.org.OrgException;
import java.util.Optional;
import org.springframework.beans.factory.ObjectProvider;
import com.dossier.api.web.rest.vm.GoogleLoginVM;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * "Sign in with Google". Kept SEPARATE from {@link AuthenticateController} on purpose: that
 * controller's constructor is pinned by a sliced security test ({@code TokenAuthenticationIT})
 * that hand-lists its context beans, so adding deps there breaks the slice. This controller
 * has its own deps and mints tokens via {@link TokenIssuer}.
 *
 * <p>Flow: verify the Google ID token (signature/expiry/issuer/audience), find-or-create the
 * user by verified email, return our access + refresh pair (same shape as {@code /authenticate}).
 * Public, like the other auth endpoints. 503 when Google sign-in isn't configured; 401 for any
 * invalid/unverified credential.
 */
@RestController
@RequestMapping("/api/auth")
@Tag(name = "authentication", description = "Google sign-in (public).")
public class GoogleAuthController {

    private static final Logger LOG = LoggerFactory.getLogger(GoogleAuthController.class);

    private final GoogleIdTokenService googleIdTokenService;
    private final UserService userService;
    private final TokenIssuer tokenIssuer;
    private final DemoAccountService demoAccountService;
    private final ObjectProvider<TenantSessionService> tenantSessions;
    private final AccountScopes accountScopes;

    public GoogleAuthController(
        GoogleIdTokenService googleIdTokenService,
        UserService userService,
        TokenIssuer tokenIssuer,
        DemoAccountService demoAccountService,
        ObjectProvider<TenantSessionService> tenantSessions,
        AccountScopes accountScopes
    ) {
        this.accountScopes = accountScopes;
        this.tenantSessions = tenantSessions;
        this.googleIdTokenService = googleIdTokenService;
        this.userService = userService;
        this.tokenIssuer = tokenIssuer;
        this.demoAccountService = demoAccountService;
    }

    @Operation(
        summary = "Sign in with Google",
        description = "Verify a Google ID token and exchange it for our access + refresh tokens (find-or-create by verified email)."
    )
    @PostMapping("/google")
    public ResponseEntity<TokenIssuer.TokenPair> googleLogin(@RequestBody GoogleLoginVM googleLoginVM) {
        if (!googleIdTokenService.isConfigured()) {
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).build();
        }
        if (googleLoginVM == null || googleLoginVM.getCredential() == null || googleLoginVM.getCredential().isBlank()) {
            return ResponseEntity.badRequest().build();
        }
        try {
            GoogleIdTokenService.GoogleProfile profile = googleIdTokenService.verify(googleLoginVM.getCredential());
            if (profile.email() == null || profile.email().isBlank() || !profile.emailVerified()) {
                return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
            }
            // Google sign-in never maps to a demo account (it would link to the shared demo user by email).
            if (demoAccountService.isDemoIdentifier(profile.email())) {
                return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
            }
            // O4: on a SEPARATE organization's host Google finds that organization's enterprise account by its verified address, and only finds:
            // it never creates one and never looks at personal accounts. No such account = the same 401 as any other refused credential.
            LoginWorld world = accountScopes.loginWorld();
            User user;
            if (world.enterprise()) {
                user = userService.findActiveEnterpriseAccount(world.orgId(), profile.email()).orElse(null);
                if (user == null) {
                    return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
                }
            } else {
                user = userService.findOrCreateGoogleUser(profile.email(), profile.firstName(), profile.lastName());
            }
            String authorities = user.getAuthorities().stream().map(Authority::getName).collect(Collectors.joining(" "));
            if (authorities.isBlank()) {
                authorities = AuthoritiesConstants.USER;
            }
            // X1.5: on a tenant host the sign-in needs an active seat there and the tokens carry tid/hid (NOT_A_MEMBER = 403).
            TenantSessionService sessions = tenantSessions.getIfAvailable();
            Optional<TenantBinding> binding;
            if (world.enterprise()) {
                if (sessions == null) throw OrgException.notAMember();
                binding = Optional.of(sessions.bindingForEnterpriseAccount(user.getOrgId(), user.getId(), user.getLogin()));
            } else {
                binding = sessions == null ? Optional.empty() : sessions.bindingForLogin(user.getId(), user.getLogin());
            }
            TokenIssuer.TokenPair pair = tokenIssuer.issue(user.getLogin(), authorities, user.getId(), binding.orElse(null));
            HttpHeaders httpHeaders = new HttpHeaders();
            httpHeaders.setBearerAuth(pair.accessToken());
            return new ResponseEntity<>(pair, httpHeaders, HttpStatus.OK);
        } catch (OrgException e) {
            throw e; // NOT_A_MEMBER (403) / unserved host (404) are answers, not failures
        } catch (Exception e) {
            // Log the cause server-side for ops; never leak internals to the client.
            LOG.warn("Google sign-in failed", e);
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
    }
}
