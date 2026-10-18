package com.dossier.api.service.privacy;

import com.dossier.api.service.MailService;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.Locale;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * The three e-mails of a self-service account deletion (T1.3): asked for, cancelled, and erased. They go to the account's own address only, say nothing but the date, and
 * a mail problem never stands in the way of the deletion, the undo or the erasure (it is logged without the address). The completed mail is sent AFTER the erasure succeeded,
 * to the address the caller read just before it: that address exists nowhere else once the account is gone, and it is kept in memory only for that one send.
 */
@Component
public class AccountDeletionMailer {

    private static final Logger LOG = LoggerFactory.getLogger(AccountDeletionMailer.class);
    private static final DateTimeFormatter WHEN = DateTimeFormatter.ofPattern("d MMM yyyy, HH:mm 'UTC'", Locale.ENGLISH).withZone(ZoneOffset.UTC);

    private final MailService mail;

    public AccountDeletionMailer(MailService mail) {
        this.mail = mail;
    }

    /** "Your account will be deleted on ..." - sent when a new request is recorded. */
    public void scheduled(String email, Instant purgeAfter) {
        send(email, "SCHEDULED", purgeAfter == null ? null : WHEN.format(purgeAfter));
    }

    /** "Your account will not be deleted" - sent when the request was withdrawn. */
    public void cancelled(String email) {
        send(email, "CANCELLED", null);
    }

    /** "Your account has been deleted" - sent after the erasure succeeded, to the address read before it. */
    public void completed(String email) {
        send(email, "COMPLETED", null);
    }

    private void send(String email, String stage, String when) {
        if (email == null || email.isBlank()) return;
        try {
            mail.sendAccountDeletionEmail(email, stage, when);
        } catch (RuntimeException e) {
            LOG.warn("Account-deletion e-mail ({}) could not be handed to the mail service ({})", stage, e.getClass().getSimpleName());
        }
    }
}
