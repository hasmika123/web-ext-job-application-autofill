package com.dossier.api.service.ent;

import com.dossier.api.domain.OrgTrustedDevice;
import com.dossier.api.domain.OrgTwoStepChallenge;
import com.dossier.api.domain.User;
import com.dossier.api.repository.OrgTrustedDeviceRepository;
import com.dossier.api.repository.OrgTwoStepChallengeRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.MailService;
import com.dossier.api.service.ent.settings.OrgSecurityPolicy;
import com.dossier.api.service.org.OrgAuditService;
import com.dossier.api.service.org.OrgException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.util.HtmlUtils;

/**
 * Two-step sign-in an organization can require (gap D-2; user decisions 2026-11-19): after a correct password on that organization's host,
 * every member is emailed a 6-digit code, unless this browser was remembered (for {@code org.security.two_step_remember_days}, default 30;
 * a password change ends it). The code is bound to the organization and the hostname it was asked for; it is single use, expires
 * ({@code two_step_code_minutes}), allows 5 tries, and one person can be sent at most {@code two_step_codes_per_hour} codes an hour. A member
 * with no email address is refused ({@code TWO_STEP_NO_EMAIL}), never let through. Every code sent, passed and failed is in the organization's
 * own audit trail. The email names the organization only.
 */
@Service
@Transactional
public class OrgTwoStepService {

    private static final Logger LOG = LoggerFactory.getLogger(OrgTwoStepService.class);
    public static final String CODE_NO_EMAIL = "TWO_STEP_NO_EMAIL";
    public static final String CODE_TOO_MANY = "TWO_STEP_TOO_MANY_CODES";
    static final int MAX_ATTEMPTS = 5;
    private static final SecureRandom RANDOM = new SecureRandom();

    /** A passed second step: who signed in, and where the code was asked for. */
    public record Verified(String login, String authorities, Long userId, Long orgId, Long hostnameId) {}

    /** A remembered browser: the token it keeps (only its hash is stored) and when it stops counting. */
    public record Device(String token, Instant expiresAt) {}

    /** What {@link #start} hands back: the challenge handle and how long a browser would be remembered (0 = not offered). */
    public record Challenge(String token, int rememberDays) {}

    private final OrgTwoStepChallengeRepository challenges;
    private final OrgTrustedDeviceRepository devices;
    private final UserRepository users;
    private final OrganizationRepository organizations;
    private final PasswordEncoder encoder;
    private final MailService mail;
    private final OrgSecurityPolicy policy;
    private final OrgAuditService audit;
    private Clock clock = Clock.systemUTC();

    public OrgTwoStepService(
        OrgTwoStepChallengeRepository challenges,
        OrgTrustedDeviceRepository devices,
        UserRepository users,
        OrganizationRepository organizations,
        PasswordEncoder encoder,
        MailService mail,
        OrgSecurityPolicy policy,
        OrgAuditService audit
    ) {
        this.challenges = challenges;
        this.devices = devices;
        this.users = users;
        this.organizations = organizations;
        this.encoder = encoder;
        this.mail = mail;
        this.policy = policy;
        this.audit = audit;
    }

    /** Tests pin the time. */
    @Autowired(required = false)
    void setClock(Clock clock) {
        if (clock != null) this.clock = clock;
    }

    /** Whether the organization requires the second step. */
    @Transactional(readOnly = true)
    public boolean required(Long orgId) {
        return policy.twoStepRequired(orgId);
    }

    /** Whether {@code deviceToken} is a live remembered browser of this person in this organization (and their password has not changed since). */
    public boolean trusted(Long orgId, Long userId, String deviceToken) {
        if (orgId == null || userId == null || deviceToken == null || deviceToken.isBlank() || deviceToken.length() > 200) return false;
        OrgTrustedDevice d = devices.findByTokenHash(sha256(deviceToken.strip())).orElse(null);
        if (d == null || !orgId.equals(d.getOrgId()) || !userId.equals(d.getUserId())) return false;
        Instant now = clock.instant();
        if (!d.getExpiresAt().isAfter(now)) return false;
        String tag = users.findById(userId).map(OrgTwoStepService::pwTag).orElse(null);
        if (tag == null || !tag.equals(d.getPwTag())) return false;
        d.setLastUsedAt(now);
        devices.save(d);
        return true;
    }

    /**
     * Email a code for a sign-in on organization {@code orgId}'s host ({@code hostnameId}, null for its Kiwiply subdomain without a row). 403
     * {@code TWO_STEP_NO_EMAIL} when the account has no email; 429 {@code TWO_STEP_TOO_MANY_CODES} past the hourly limit.
     */
    public Challenge start(Long orgId, Long hostnameId, Long userId, String login, String authorities) {
        User user = users.findById(userId).orElseThrow(OrgException::notAMember);
        String email = user.getEmail();
        if (email == null || email.isBlank()) {
            throw OrgException.coded(403, CODE_NO_EMAIL, "This organization requires a sign-in code sent by email, and your account has no email address. Ask your administrator to add one.", Map.of());
        }
        Instant now = clock.instant();
        if (challenges.countByUserIdSince(userId, now.minus(Duration.ofHours(1))) >= policy.twoStepCodesPerHour()) {
            throw OrgException.coded(429, CODE_TOO_MANY, "Too many sign-in codes were sent. Wait a while, then try again.", Map.of());
        }
        challenges.deleteExpired(now.minus(Duration.ofHours(1))); // keep the last hour: the per-person limit counts those rows
        // only one code works at a time: an older one expires now (its row stays until swept, so the hourly count still sees it)
        challenges.expireLiveForUser(userId, now);
        String code = String.format("%06d", RANDOM.nextInt(1_000_000));
        OrgTwoStepChallenge c = new OrgTwoStepChallenge();
        c.setChallengeToken(UUID.randomUUID().toString());
        c.setOrgId(orgId);
        c.setHostnameId(hostnameId);
        c.setUserId(userId);
        c.setLogin(login);
        c.setAuthorities(authorities);
        c.setCodeHash(encoder.encode(code));
        int minutes = policy.twoStepCodeMinutes();
        c.setExpiresAt(now.plus(Duration.ofMinutes(minutes)));
        c.setAttempts(0);
        c.setCreatedAt(now);
        challenges.save(c);

        String orgName = organizations.findByOrgId(orgId).map(o -> o.getDisplayName() == null || o.getDisplayName().isBlank() ? o.getName() : o.getDisplayName()).orElse("your organization");
        String safe = HtmlUtils.htmlEscape(orgName);
        String html =
            "<p>Your sign-in code for " + safe + " is:</p>" +
            "<p style=\"font-size:22px;font-weight:bold;letter-spacing:3px\">" + code + "</p>" +
            "<p style=\"color:#666;font-size:12px\">It expires in " + minutes + " minute(s). If you didn't try to sign in, ignore this email and change your password.</p>";
        mail.sendEmail(email, "Your sign-in code for " + orgName, html, false, true);
        audit.recordHostEvent(orgId, hostnameId, login, OrgAuditService.LOGIN_TWO_STEP_CHALLENGED, "LOW", "a sign-in code was emailed");
        LOG.info("Issued an organization sign-in code (org {}).", orgId);
        return new Challenge(c.getChallengeToken(), policy.twoStepRememberDays());
    }

    /** Whether {@code token} names a pending organization challenge (so the code endpoint knows which flow it is). */
    @Transactional(readOnly = true)
    public boolean owns(String token) {
        return token != null && challenges.findByChallengeToken(token).isPresent();
    }

    /**
     * Check a code. It must be presented on the same organization and hostname it was asked for ({@code orgId}/{@code hostnameId} of the current
     * host), before it expires and within 5 tries. A right code consumes the challenge. Empty on any failure (audited).
     */
    public Optional<Verified> verify(String token, String code, Long orgId, Long hostnameId) {
        if (token == null || code == null) return Optional.empty();
        OrgTwoStepChallenge c = challenges.findByChallengeToken(token).orElse(null);
        if (c == null) return Optional.empty();
        Instant now = clock.instant();
        if (!c.getOrgId().equals(orgId) || !Objects.equals(c.getHostnameId(), hostnameId)) {
            audit.recordHostEvent(c.getOrgId(), c.getHostnameId(), c.getLogin(), OrgAuditService.LOGIN_TWO_STEP_FAILED, "MEDIUM", "the code was presented on another address");
            return Optional.empty();
        }
        if (!c.getExpiresAt().isAfter(now) || c.getAttempts() >= MAX_ATTEMPTS) {
            challenges.delete(c);
            audit.recordHostEvent(c.getOrgId(), c.getHostnameId(), c.getLogin(), OrgAuditService.LOGIN_TWO_STEP_FAILED, "LOW", "the code had expired");
            return Optional.empty();
        }
        if (encoder.matches(code.strip(), c.getCodeHash())) {
            challenges.delete(c);
            return Optional.of(new Verified(c.getLogin(), c.getAuthorities(), c.getUserId(), c.getOrgId(), c.getHostnameId()));
        }
        c.setAttempts(c.getAttempts() + 1);
        if (c.getAttempts() >= MAX_ATTEMPTS) challenges.delete(c);
        else challenges.save(c);
        audit.recordHostEvent(c.getOrgId(), c.getHostnameId(), c.getLogin(), OrgAuditService.LOGIN_TWO_STEP_FAILED, c.getAttempts() >= MAX_ATTEMPTS ? "MEDIUM" : "LOW", "a wrong sign-in code (" + c.getAttempts() + " of " + MAX_ATTEMPTS + ")");
        return Optional.empty();
    }

    /** Record the passed second step in the organization's trail; with {@code remember}, also remember this browser (empty when remembering is off). */
    public Optional<Device> passed(Verified v, boolean remember) {
        Optional<Device> device = remember ? rememberDevice(v.orgId(), v.userId()) : Optional.empty();
        audit.recordHostEvent(v.orgId(), v.hostnameId(), v.login(), OrgAuditService.LOGIN_TWO_STEP_PASSED, "LOW", device.isPresent() ? "the code was right; this browser is remembered" : "the code was right");
        return device;
    }

    private Optional<Device> rememberDevice(Long orgId, Long userId) {
        int days = policy.twoStepRememberDays();
        if (days <= 0) return Optional.empty();
        String tag = users.findById(userId).map(OrgTwoStepService::pwTag).orElse(null);
        if (tag == null) return Optional.empty();
        byte[] raw = new byte[32];
        RANDOM.nextBytes(raw);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(raw);
        Instant now = clock.instant();
        devices.deleteExpired(now);
        OrgTrustedDevice d = new OrgTrustedDevice();
        d.setOrgId(orgId);
        d.setUserId(userId);
        d.setTokenHash(sha256(token));
        d.setPwTag(tag);
        d.setCreatedAt(now);
        d.setExpiresAt(now.plus(Duration.ofDays(days)));
        devices.save(d);
        return Optional.of(new Device(token, d.getExpiresAt()));
    }

    /** A person's seat ended in the organization: their remembered browsers stop counting there. */
    public void forgetSeat(Long orgId, Long userId) {
        if (orgId != null && userId != null) devices.deleteByOrgIdAndUserId(orgId, userId);
    }

    /** A tag of the account's current password hash: any password change makes every remembered browser stop counting. */
    static String pwTag(User u) {
        return u.getPassword() == null ? null : sha256(u.getPassword());
    }

    static String sha256(String s) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(s.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
