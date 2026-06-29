package com.dossier.api.service;

import com.dossier.api.domain.AdminMfaChallenge;
import com.dossier.api.repository.AdminMfaChallengeRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.security.AuthoritiesConstants;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Admin email-OTP MFA (Phase 9.X.3). After a correct password, an admin (when MFA is enabled) is
 * emailed a 6-digit code; submitting it completes sign-in. OFF by default
 * ({@code dossier.admin.mfa-enabled}); ships dormant so it can't lock anyone out on deploy.
 *
 * Safety rails: an admin with no email on file is NOT challenged (the caller logs in normally),
 * codes are single-use, expire quickly, and lock after a few wrong attempts.
 */
@Service
@Transactional
public class AdminMfaService {

    private static final Logger LOG = LoggerFactory.getLogger(AdminMfaService.class);
    private static final int MAX_ATTEMPTS = 5;
    private static final SecureRandom RANDOM = new SecureRandom();

    /** Claims stashed at challenge time so post-verify token issuance matches a normal login. */
    public record VerifiedClaims(String login, String authorities, Long userId) {}

    private final AdminMfaChallengeRepository repository;
    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final MailService mailService;
    private final boolean mfaEnabled;
    private final long ttlSeconds;

    public AdminMfaService(
        AdminMfaChallengeRepository repository,
        UserRepository userRepository,
        PasswordEncoder passwordEncoder,
        MailService mailService,
        @Value("${dossier.admin.mfa-enabled:false}") boolean mfaEnabled,
        @Value("${dossier.admin.mfa-code-ttl-seconds:600}") long ttlSeconds
    ) {
        this.repository = repository;
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.mailService = mailService;
        this.mfaEnabled = mfaEnabled;
        this.ttlSeconds = ttlSeconds;
    }

    /** True when MFA is enabled AND the just-authenticated principal is an admin. */
    public boolean shouldChallenge(String authorities) {
        return mfaEnabled && authorities != null && authorities.contains(AuthoritiesConstants.ADMIN);
    }

    /**
     * Create + email an OTP challenge. Returns the opaque mfaToken, or empty if the admin has no
     * email on file (in which case the caller should sign them in normally — never lock out).
     */
    public Optional<String> startChallenge(String login, Long userId, String authorities) {
        String email = userRepository.findOneByLogin(login).map(u -> u.getEmail()).orElse(null);
        if (email == null || email.isBlank()) {
            LOG.warn("Admin MFA enabled but '{}' has no email — skipping the OTP challenge.", login);
            return Optional.empty();
        }
        String code = String.format("%06d", RANDOM.nextInt(1_000_000));
        AdminMfaChallenge c = new AdminMfaChallenge();
        c.setMfaToken(UUID.randomUUID().toString());
        c.setLogin(login);
        c.setUserId(userId);
        c.setAuthorities(authorities);
        c.setCodeHash(passwordEncoder.encode(code));
        c.setExpiresAt(Instant.now().plusSeconds(ttlSeconds));
        c.setAttempts(0);
        repository.save(c);

        long minutes = Math.max(1, ttlSeconds / 60);
        String html =
            "<p>Your Kiwiply admin sign-in code is:</p>" +
            "<p style=\"font-size:22px;font-weight:bold;letter-spacing:3px\">" + code + "</p>" +
            "<p style=\"color:#888;font-size:12px\">It expires in " + minutes + " minute(s). If you didn't try to sign in, ignore this email and consider changing your password.</p>";
        mailService.sendEmail(email, "Your Kiwiply admin sign-in code", html, false, true);
        LOG.info("Issued an admin MFA challenge for '{}'.", login);
        return Optional.of(c.getMfaToken());
    }

    /** Verify a submitted code. On success the challenge is consumed and the claims returned. */
    public Optional<VerifiedClaims> verify(String mfaToken, String code) {
        if (mfaToken == null || code == null) {
            return Optional.empty();
        }
        AdminMfaChallenge c = repository.findByMfaToken(mfaToken).orElse(null);
        if (c == null) {
            return Optional.empty();
        }
        if (c.getExpiresAt().isBefore(Instant.now()) || c.getAttempts() >= MAX_ATTEMPTS) {
            repository.delete(c);
            return Optional.empty();
        }
        if (passwordEncoder.matches(code, c.getCodeHash())) {
            VerifiedClaims claims = new VerifiedClaims(c.getLogin(), c.getAuthorities(), c.getUserId());
            repository.delete(c);
            return Optional.of(claims);
        }
        c.setAttempts(c.getAttempts() + 1);
        if (c.getAttempts() >= MAX_ATTEMPTS) {
            repository.delete(c); // too many wrong tries — burn the challenge
        } else {
            repository.save(c);
        }
        return Optional.empty();
    }
}
