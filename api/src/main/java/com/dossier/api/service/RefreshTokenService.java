package com.dossier.api.service;

import com.dossier.api.domain.RefreshToken;
import com.dossier.api.repository.RefreshTokenRepository;
import java.time.Instant;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Server-side bookkeeping for refresh-token rotation + revocation (1.11).
 *
 * Each issued refresh token has a row (keyed by its {@code jti}). Refreshing rotates:
 * the presented token is spent (revoked) and a fresh one is issued in the same
 * {@code family}. Presenting an already-revoked token means it was stolen and replayed,
 * so the whole family is revoked. Logout and account deletion revoke as well.
 */
@Service
@Transactional
public class RefreshTokenService {

    private static final Logger LOG = LoggerFactory.getLogger(RefreshTokenService.class);

    private final RefreshTokenRepository refreshTokenRepository;

    public RefreshTokenService(RefreshTokenRepository refreshTokenRepository) {
        this.refreshTokenRepository = refreshTokenRepository;
    }

    /** Persist a freshly issued refresh token. */
    public void record(String jti, String familyId, Long userId, Instant expiresAt) {
        RefreshToken token = new RefreshToken();
        token.setJti(jti);
        token.setFamilyId(familyId);
        token.setUserId(userId);
        token.setExpiresAt(expiresAt);
        token.setCreatedAt(Instant.now());
        token.setRevoked(false);
        refreshTokenRepository.save(token);
    }

    /**
     * Validate + spend the presented refresh token. On success the token's row is marked
     * revoked and its {@code familyId} is returned so the caller can issue the next token
     * in the same family. Returns empty (caller should 401) when the token is unknown,
     * already revoked (→ reuse: the family is revoked), or expired.
     */
    public Optional<String> rotateAndGetFamily(String jti) {
        if (jti == null) {
            return Optional.empty();
        }
        RefreshToken token = refreshTokenRepository.findByJti(jti).orElse(null);
        if (token == null) {
            // Unknown jti: forged, or issued before this feature existed. Reject.
            return Optional.empty();
        }
        if (token.isRevoked()) {
            // Replay of a spent/revoked token: treat the family as compromised.
            int n = refreshTokenRepository.revokeFamily(token.getFamilyId());
            LOG.warn(
                "Refresh-token reuse detected (jti family {}, user {}); revoked {} token(s)",
                token.getFamilyId(),
                token.getUserId(),
                n
            );
            return Optional.empty();
        }
        if (token.getExpiresAt().isBefore(Instant.now())) {
            token.setRevoked(true);
            return Optional.empty();
        }
        token.setRevoked(true); // spent on this rotation
        return Optional.of(token.getFamilyId());
    }

    /** Revoke the family that the given refresh token belongs to (used on logout). */
    public void revokeByJti(String jti) {
        if (jti == null) {
            return;
        }
        refreshTokenRepository.findByJti(jti).ifPresent(token -> refreshTokenRepository.revokeFamily(token.getFamilyId()));
    }

    /** Remove every refresh token for a user (used on account deletion). */
    public void deleteAllForUser(Long userId) {
        if (userId != null) {
            refreshTokenRepository.deleteByUserId(userId);
        }
    }

    /**
     * Revoke (but keep) every live refresh token for a user — admin force-logout (Phase 9.A1.4).
     * The user can no longer rotate, so they're signed out once their short access token expires.
     * Returns the number revoked.
     */
    public int revokeAllForUser(Long userId) {
        return userId == null ? 0 : refreshTokenRepository.revokeAllByUserId(userId);
    }
}
