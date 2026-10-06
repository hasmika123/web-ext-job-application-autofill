package com.dossier.api.service.inbox;

import com.dossier.api.domain.SecretCanary;
import com.dossier.api.repository.SecretCanaryRepository;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

/**
 * Proves at startup that {@code DOSSIER_INBOX_KEY} still reads what's stored (Phase 14.2).
 *
 * <p>The failure this is for: the box's {@code .env} is rebuilt (it happened on 2026-09-17) and the
 * key comes back different, or with a typo. Every stored app password is then unreadable, and without
 * this the first sign would be every inbox quietly failing on its next poll. So a known value is
 * encrypted with the key once, and read back at every boot:
 *
 * <ul>
 *   <li>no row yet → write one (a fresh install, or the first boot with a key);</li>
 *   <li>it reads → fine; if an older key wrote it, re-encrypt it with the current one;</li>
 *   <li>it doesn't → mark the key {@link SecretBox.Status#MISMATCH} (the inbox refuses to connect
 *       or poll, so nothing is overwritten with the wrong key) and say so, loudly, with both
 *       fingerprints.</li>
 * </ul>
 *
 * It never stops the API from starting: a wrong inbox key must not take the rest of Kiwiply down.
 */
@Component
public class InboxKeyCheck implements ApplicationRunner {

    private static final Logger LOG = LoggerFactory.getLogger(InboxKeyCheck.class);
    static final String NAME = "inbox";
    static final String CONTEXT = "canary:inbox";
    static final String VALUE = "kiwiply-inbox-key-check";

    private final SecretBox box;
    private final SecretCanaryRepository canaries;

    public InboxKeyCheck(SecretBox box, SecretCanaryRepository canaries) {
        this.box = box;
        this.canaries = canaries;
    }

    @Override
    public void run(ApplicationArguments args) {
        check();
    }

    void check() {
        switch (box.status()) {
            case MISSING -> {
                LOG.info("No DOSSIER_INBOX_KEY — the inbox (Phase 14) is off.");
                return;
            }
            case INVALID -> {
                return; // SecretBox already logged why
            }
            default -> {}
        }
        try {
            Optional<SecretCanary> row = canaries.findById(NAME);
            if (row.isEmpty()) {
                canaries.save(fresh(new SecretCanary(NAME)));
                LOG.info("Inbox key ready (fingerprint {}).", box.fingerprint());
                return;
            }
            SecretCanary c = row.get();
            String value;
            try {
                value = box.decrypt(c.getCiphertext(), CONTEXT);
            } catch (SecretBox.SecretBoxException e) {
                value = null;
            }
            if (!VALUE.equals(value)) {
                box.markMismatch();
                LOG.error(
                    "DOSSIER_INBOX_KEY (fingerprint {}) is not the key that encrypted the stored inbox passwords " +
                    "(fingerprint {}, version {}). The inbox is OFF until the right key is restored from the password " +
                    "manager — do not replace it, or every connected inbox will have to reconnect.",
                    box.fingerprint(),
                    c.getFingerprint(),
                    c.getKeyVersion()
                );
                return;
            }
            if (box.needsRotation(c.getCiphertext())) {
                canaries.save(fresh(c));
                LOG.info("Inbox key rotated to version {} (fingerprint {}).", box.currentVersion(), box.fingerprint());
            } else {
                LOG.info("Inbox key OK (fingerprint {}).", box.fingerprint());
            }
        } catch (RuntimeException e) {
            // A database hiccup at boot mustn't stop the API; the next restart checks again.
            LOG.warn("Couldn't check the inbox key: {}", e.getMessage());
        }
    }

    private SecretCanary fresh(SecretCanary c) {
        c.setCiphertext(box.encrypt(VALUE, CONTEXT));
        c.setKeyVersion(box.currentVersion());
        c.setFingerprint(box.fingerprint());
        return c;
    }
}
