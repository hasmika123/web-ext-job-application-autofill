package com.dossier.api.web.rest;

import com.dossier.api.domain.Authority;
import com.dossier.api.domain.User;
import com.dossier.api.security.AuthoritiesConstants;
import com.dossier.api.service.GoogleIdTokenService;
import com.dossier.api.service.TokenIssuer;
import com.dossier.api.service.UserService;
import com.dossier.api.web.rest.vm.GoogleLoginVM;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.Map;
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

    public GoogleAuthController(GoogleIdTokenService googleIdTokenService, UserService userService, TokenIssuer tokenIssuer) {
        this.googleIdTokenService = googleIdTokenService;
        this.userService = userService;
        this.tokenIssuer = tokenIssuer;
    }

    @Operation(
        summary = "Sign in with Google",
        description = "Verify a Google ID token and exchange it for our access + refresh tokens (find-or-create by verified email)."
    )
    @PostMapping("/google")
    public ResponseEntity<?> googleLogin(@RequestBody GoogleLoginVM googleLoginVM) {
        if (!googleIdTokenService.isConfigured()) {
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).build();
        }
        if (googleLoginVM == null || googleLoginVM.getCredential() == null || googleLoginVM.getCredential().isBlank()) {
            return ResponseEntity.badRequest().build();
        }
        GoogleIdTokenService.GoogleProfile profile;
        try {
            profile = googleIdTokenService.verify(googleLoginVM.getCredential());
        } catch (Exception e) {
            // WARN (not DEBUG) so the reason shows in prod logs; also returned in the body so a
            // failed sign-in is self-diagnosing. Not sensitive — it's an OAuth validation reason.
            LOG.warn("Rejected Google credential: {}", e.getMessage());
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("reason", String.valueOf(e.getMessage())));
        }
        if (profile.email() == null || profile.email().isBlank() || !profile.emailVerified()) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("reason", "email missing or not verified"));
        }

        User user = userService.findOrCreateGoogleUser(profile.email(), profile.firstName(), profile.lastName());
        String authorities = user.getAuthorities().stream().map(Authority::getName).collect(Collectors.joining(" "));
        if (authorities.isBlank()) {
            authorities = AuthoritiesConstants.USER;
        }

        TokenIssuer.TokenPair pair = tokenIssuer.issue(user.getLogin(), authorities, user.getId());
        HttpHeaders httpHeaders = new HttpHeaders();
        httpHeaders.setBearerAuth(pair.accessToken());
        return new ResponseEntity<>(pair, httpHeaders, HttpStatus.OK);
    }
}
