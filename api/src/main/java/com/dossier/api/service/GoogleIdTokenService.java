package com.dossier.api.service;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2TokenValidatorResult;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtTimestampValidator;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.stereotype.Service;

/**
 * Verifies Google "Sign in with Google" ID tokens (the credential the browser receives
 * from Google Identity Services) WITHOUT any extra dependency — it reuses Spring
 * Security's JOSE stack (already on the classpath for the resource server).
 *
 * <p>The ID token is a JWT signed by Google. We validate signature (against Google's
 * published JWKS), expiry, issuer (Google issues {@code accounts.google.com} in both bare
 * and https:// forms), and — critically — that the {@code aud} claim equals OUR OAuth
 * client id, so a token minted for a different site can't be replayed against us. No
 * client secret is involved in this flow.
 *
 * <p>Configured via {@code dossier.google.client-id} ({@code GOOGLE_CLIENT_ID} env). When
 * unset, {@link #isConfigured()} is false and the controller responds 503 — the feature is
 * simply dark until the id is provided.
 */
@Service
public class GoogleIdTokenService {

    private static final String GOOGLE_JWKS = "https://www.googleapis.com/oauth2/v3/certs";
    private static final Set<String> GOOGLE_ISSUERS = Set.of("accounts.google.com", "https://accounts.google.com");

    private final String clientId;
    private volatile JwtDecoder decoder;

    public GoogleIdTokenService(@Value("${dossier.google.client-id:}") String clientId) {
        this.clientId = clientId == null ? "" : clientId.trim();
    }

    /** True once an OAuth client id is configured; otherwise Google sign-in is dark. */
    public boolean isConfigured() {
        return !clientId.isEmpty();
    }

    /** Verify a Google ID token and extract the profile. Throws on any invalid token. */
    public GoogleProfile verify(String idToken) {
        Jwt jwt = decoder().decode(idToken); // throws JwtException on bad signature/expiry/iss/aud
        Object emailVerified = jwt.getClaims().get("email_verified");
        boolean verified = (emailVerified instanceof Boolean b && b) || "true".equalsIgnoreCase(String.valueOf(emailVerified));
        return new GoogleProfile(
            jwt.getClaimAsString("email"),
            verified,
            jwt.getClaimAsString("given_name"),
            jwt.getClaimAsString("family_name")
        );
    }

    private JwtDecoder decoder() {
        JwtDecoder d = decoder;
        if (d == null) {
            synchronized (this) {
                if (decoder == null) {
                    NimbusJwtDecoder nimbus = NimbusJwtDecoder.withJwkSetUri(GOOGLE_JWKS).build();
                    nimbus.setJwtValidator(new DelegatingOAuth2TokenValidator<>(new JwtTimestampValidator(), issuerAndAudience()));
                    decoder = nimbus;
                }
                d = decoder;
            }
        }
        return d;
    }

    // Issuer must be Google's, and audience must contain OUR client id.
    private OAuth2TokenValidator<Jwt> issuerAndAudience() {
        return jwt -> {
            List<OAuth2Error> errors = new ArrayList<>();
            String iss = String.valueOf(jwt.getClaims().get("iss"));
            if (!GOOGLE_ISSUERS.contains(iss)) {
                errors.add(new OAuth2Error("invalid_issuer", "Token issuer is not Google", null));
            }
            List<String> aud = jwt.getAudience();
            if (aud == null || !aud.contains(clientId)) {
                errors.add(new OAuth2Error("invalid_audience", "Token audience is not this app", null));
            }
            return errors.isEmpty() ? OAuth2TokenValidatorResult.success() : OAuth2TokenValidatorResult.failure(errors);
        };
    }

    /** The slice of the Google profile we use to find-or-create the account. */
    public record GoogleProfile(String email, boolean emailVerified, String firstName, String lastName) {}
}
