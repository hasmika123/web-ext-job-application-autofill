package com.dossier.api.service.inbox;

import static org.assertj.core.api.Assertions.assertThat;

import com.dossier.api.IntegrationTest;
import com.dossier.api.TestInboxKey;
import com.dossier.api.domain.SecretCanary;
import com.dossier.api.repository.SecretCanaryRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

/**
 * The inbox key check against the real schema (Phase 14.2): with a key configured, booting leaves a
 * readable canary in {@code secret_canary}. The key is generated per test run (TestInboxKey) — none is committed.
 */
@IntegrationTest
class InboxKeyCheckIT {

    @DynamicPropertySource
    static void key(DynamicPropertyRegistry r) {
        r.add("dossier.inbox.key", () -> TestInboxKey.VALUE);
    }

    @Autowired
    private SecretBox box;

    @Autowired
    private SecretCanaryRepository canaries;

    @Autowired
    private InboxKeyCheck check;

    @Test
    void bootingWithAKeyLeavesAReadableCanary() {
        check.check(); // idempotent — the runner already did this at startup
        SecretCanary c = canaries.findById(InboxKeyCheck.NAME).orElseThrow();
        assertThat(box.status()).isEqualTo(SecretBox.Status.OK);
        assertThat(box.decrypt(c.getCiphertext(), InboxKeyCheck.CONTEXT)).isEqualTo(InboxKeyCheck.VALUE);
        assertThat(c.getFingerprint()).isEqualTo(box.fingerprint());
    }
}
