package com.dossier.api.service;

import com.dossier.api.domain.EmailSubscriber;
import com.dossier.api.domain.enumeration.SubscriberStatus;
import com.dossier.api.repository.EmailSubscriberRepository;
import java.time.Instant;
import java.util.Locale;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import tech.jhipster.config.JHipsterProperties;

/**
 * Newsletter double-opt-in (Phase 9.A4). Subscribing creates/refreshes a PENDING row and emails a
 * confirmation link; clicking it confirms. Every email carries a one-click, no-login unsubscribe
 * link. Marketing consent is recorded (source + timestamp) and kept separate from the user account.
 *
 * To avoid leaking who is subscribed, the public subscribe call is generic — it never reveals
 * whether the address already existed.
 */
@Service
@Transactional
public class NewsletterService {

    private static final Logger LOG = LoggerFactory.getLogger(NewsletterService.class);
    private static final String EMAIL_REGEX = "^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$";

    private final EmailSubscriberRepository repository;
    private final MailService mailService;
    private final JHipsterProperties jHipsterProperties;
    private final BrevoContactService brevoContactService;
    private final String postalAddress;

    public NewsletterService(
        EmailSubscriberRepository repository,
        MailService mailService,
        JHipsterProperties jHipsterProperties,
        BrevoContactService brevoContactService,
        @org.springframework.beans.factory.annotation.Value("${dossier.newsletter.postal-address:}") String postalAddress
    ) {
        this.repository = repository;
        this.mailService = mailService;
        this.jHipsterProperties = jHipsterProperties;
        this.brevoContactService = brevoContactService;
        this.postalAddress = postalAddress;
    }

    /** Public opt-in. Generic by design (no enumeration). A confirmed address is a no-op. */
    public void subscribe(String rawEmail, String source) {
        String email = rawEmail == null ? "" : rawEmail.trim().toLowerCase(Locale.ENGLISH);
        if (!email.matches(EMAIL_REGEX) || email.length() > 254) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Please enter a valid email.");
        }

        EmailSubscriber sub = repository.findByEmailIgnoreCase(email).orElse(null);
        if (sub != null && sub.getStatus() == SubscriberStatus.CONFIRMED) {
            // Already subscribed — do nothing (don't re-send, don't reveal status).
            return;
        }
        if (sub == null) {
            sub = new EmailSubscriber();
            sub.setEmail(email);
            sub.setUnsubscribeToken(UUID.randomUUID().toString());
            sub.setCreatedDate(Instant.now());
        }
        sub.setStatus(SubscriberStatus.PENDING);
        sub.setConsentSource(source == null || source.isBlank() ? "web" : source.trim());
        sub.setConsentAt(Instant.now());
        sub.setConfirmToken(UUID.randomUUID().toString());
        sub.setConfirmedAt(null);
        repository.save(sub);

        sendConfirmEmail(sub);
        LOG.info("Newsletter opt-in recorded (source={}); confirmation email sent.", sub.getConsentSource());
    }

    /** Double-opt-in confirm. Returns true when a PENDING subscriber is confirmed by this token. */
    public boolean confirm(String token) {
        if (token == null || token.isBlank()) {
            return false;
        }
        return repository
            .findByConfirmToken(token)
            .filter(s -> s.getStatus() == SubscriberStatus.PENDING)
            .map(s -> {
                s.setStatus(SubscriberStatus.CONFIRMED);
                s.setConfirmedAt(Instant.now());
                s.setConfirmToken(null);
                repository.save(s);
                brevoContactService.addConfirmedContact(s.getEmail()); // best-effort mirror to Brevo
                LOG.info("Newsletter subscription confirmed.");
                return true;
            })
            .orElse(false);
    }

    /** One-click unsubscribe (no login). Idempotent — returns true if the token is known. */
    public boolean unsubscribe(String token) {
        if (token == null || token.isBlank()) {
            return false;
        }
        return repository
            .findByUnsubscribeToken(token)
            .map(s -> {
                if (s.getStatus() != SubscriberStatus.UNSUBSCRIBED) {
                    s.setStatus(SubscriberStatus.UNSUBSCRIBED);
                    s.setUnsubscribedAt(Instant.now());
                    repository.save(s);
                    brevoContactService.removeContact(s.getEmail()); // best-effort opt-out in Brevo
                }
                return true;
            })
            .orElse(false);
    }

    private void sendConfirmEmail(EmailSubscriber sub) {
        String baseUrl = jHipsterProperties.getMail().getBaseUrl();
        String confirmUrl = baseUrl + "/newsletter/confirm?token=" + sub.getConfirmToken();
        String unsubUrl = baseUrl + "/newsletter/unsubscribe?token=" + sub.getUnsubscribeToken();
        String from = jHipsterProperties.getMail().getFrom();
        String html =
            "<p>Thanks for subscribing to Kiwiply updates.</p>" +
            "<p>Please confirm your subscription:</p>" +
            "<p><a href=\"" + confirmUrl + "\">Confirm my subscription</a></p>" +
            "<p style=\"color:#888;font-size:12px\">You received this because someone entered this address at kiwiply.com. " +
            "If that wasn't you, ignore this email or <a href=\"" + unsubUrl + "\">unsubscribe</a>. Sent by Kiwiply (" + from + ")." +
            (postalAddress == null || postalAddress.isBlank() ? "" : "<br>" + postalAddress) +
            "</p>";
        mailService.sendEmail(sub.getEmail(), "Confirm your Kiwiply subscription", html, false, true);
    }
}
