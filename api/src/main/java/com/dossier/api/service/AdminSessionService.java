package com.dossier.api.service;

import com.dossier.api.domain.RefreshToken;
import com.dossier.api.domain.User;
import com.dossier.api.repository.RefreshTokenRepository;
import com.dossier.api.repository.UserRepository;
import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/**
 * Admin sessions/security view (Phase 9.A2.3): a user's refresh tokens grouped into families
 * (one family ≈ one sign-in lineage that rotation extends), and per-family revoke. Revoking a
 * family signs out that session (its tokens can no longer rotate); it's audited.
 */
@Service
@Transactional
public class AdminSessionService {

    /** One sign-in session lineage. */
    public record SessionFamily(String familyId, Instant createdAt, Instant expiresAt, int tokenCount, boolean active) {}

    private final RefreshTokenRepository refreshTokenRepository;
    private final UserRepository userRepository;
    private final AdminAuditService auditService;

    public AdminSessionService(
        RefreshTokenRepository refreshTokenRepository,
        UserRepository userRepository,
        AdminAuditService auditService
    ) {
        this.refreshTokenRepository = refreshTokenRepository;
        this.userRepository = userRepository;
        this.auditService = auditService;
    }

    @Transactional(readOnly = true)
    public List<SessionFamily> listFamilies(String login) {
        Long userId = requireUser(login).getId();
        Instant now = Instant.now();
        Map<String, List<RefreshToken>> byFamily = refreshTokenRepository
            .findByUserId(userId)
            .stream()
            .collect(Collectors.groupingBy(RefreshToken::getFamilyId));
        return byFamily
            .values()
            .stream()
            .map(tokens -> {
                Instant created = tokens.stream().map(RefreshToken::getCreatedAt).min(Comparator.naturalOrder()).orElse(null);
                Instant expires = tokens.stream().map(RefreshToken::getExpiresAt).max(Comparator.naturalOrder()).orElse(null);
                boolean active = tokens.stream().anyMatch(t -> !t.isRevoked() && t.getExpiresAt().isAfter(now));
                return new SessionFamily(tokens.get(0).getFamilyId(), created, expires, tokens.size(), active);
            })
            .sorted(Comparator.comparing(SessionFamily::createdAt, Comparator.nullsLast(Comparator.reverseOrder())))
            .toList();
    }

    /** Revoke a single family — only if it belongs to this user (else 404, no info leak). */
    public void revokeFamily(String login, String familyId) {
        Long userId = requireUser(login).getId();
        boolean owned = refreshTokenRepository
            .findByUserId(userId)
            .stream()
            .anyMatch(t -> t.getFamilyId().equals(familyId));
        if (!owned) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "No such session for this user");
        }
        refreshTokenRepository.revokeFamily(familyId);
        auditService.record(AdminAuditService.SESSION_REVOKE, AdminAuditService.TARGET_USER, login.toLowerCase(), null, "family=" + familyId);
    }

    private User requireUser(String login) {
        return userRepository
            .findOneByLogin(login.toLowerCase())
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No such user"));
    }
}
