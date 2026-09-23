package com.dossier.api.service.inbox;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.SecretCanary;
import com.dossier.api.repository.SecretCanaryRepository;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

/** The startup check that the inbox key still reads what's stored (Phase 14.2). */
class InboxKeyCheckTest {

    private static String newKey() {
        byte[] k = new byte[32];
        new SecureRandom().nextBytes(k);
        return Base64.getEncoder().encodeToString(k);
    }

    private static SecretBox box(String key, int version, Map<Integer, String> retired) {
        InboxProperties p = new InboxProperties();
        p.setKey(key);
        p.setKeyVersion(version);
        p.setRetiredKeys(retired);
        return new SecretBox(p);
    }

    private static SecretCanary canaryFrom(SecretBox b) {
        SecretCanary c = new SecretCanary(InboxKeyCheck.NAME);
        c.setCiphertext(b.encrypt(InboxKeyCheck.VALUE, InboxKeyCheck.CONTEXT));
        c.setKeyVersion(b.currentVersion());
        c.setFingerprint(b.fingerprint());
        return c;
    }

    @Test
    void theFirstBootWithAKeyWritesTheCanary() {
        SecretBox b = box(newKey(), 1, Map.of());
        SecretCanaryRepository repo = mock(SecretCanaryRepository.class);
        when(repo.findById(InboxKeyCheck.NAME)).thenReturn(Optional.empty());

        new InboxKeyCheck(b, repo).check();

        ArgumentCaptor<SecretCanary> saved = ArgumentCaptor.forClass(SecretCanary.class);
        verify(repo).save(saved.capture());
        assertThat(b.decrypt(saved.getValue().getCiphertext(), InboxKeyCheck.CONTEXT)).isEqualTo(InboxKeyCheck.VALUE);
        assertThat(saved.getValue().getFingerprint()).isEqualTo(b.fingerprint());
        assertThat(b.status()).isEqualTo(SecretBox.Status.OK);
    }

    @Test
    void theSameKeyPasses() {
        SecretBox b = box(newKey(), 1, Map.of());
        SecretCanaryRepository repo = mock(SecretCanaryRepository.class);
        when(repo.findById(InboxKeyCheck.NAME)).thenReturn(Optional.of(canaryFrom(b)));

        new InboxKeyCheck(b, repo).check();

        assertThat(b.status()).isEqualTo(SecretBox.Status.OK);
        verify(repo, never()).save(any());
    }

    @Test
    void aDifferentKeyIsAMismatchAndNothingIsOverwritten() {
        SecretCanary stored = canaryFrom(box(newKey(), 1, Map.of()));
        SecretBox wrong = box(newKey(), 1, Map.of());
        SecretCanaryRepository repo = mock(SecretCanaryRepository.class);
        when(repo.findById(InboxKeyCheck.NAME)).thenReturn(Optional.of(stored));

        new InboxKeyCheck(wrong, repo).check();

        assertThat(wrong.status()).isEqualTo(SecretBox.Status.MISMATCH);
        assertThat(wrong.usable()).isFalse();
        verify(repo, never()).save(any());
    }

    @Test
    void aRotatedKeyRewritesTheCanary() {
        String oldKey = newKey();
        SecretCanary stored = canaryFrom(box(oldKey, 1, Map.of()));
        SecretBox rotated = box(newKey(), 2, Map.of(1, oldKey));
        SecretCanaryRepository repo = mock(SecretCanaryRepository.class);
        when(repo.findById(InboxKeyCheck.NAME)).thenReturn(Optional.of(stored));

        new InboxKeyCheck(rotated, repo).check();

        assertThat(rotated.status()).isEqualTo(SecretBox.Status.OK);
        assertThat(stored.getKeyVersion()).isEqualTo(2);
        assertThat(stored.getCiphertext()).startsWith("v2:");
        verify(repo).save(stored);
    }

    @Test
    void noKeyMeansNoDatabaseWork() {
        SecretCanaryRepository repo = mock(SecretCanaryRepository.class);
        new InboxKeyCheck(box("", 1, Map.of()), repo).check();
        verify(repo, never()).findById(any());
    }

    @Test
    void aDatabaseErrorDoesntStopTheApi() {
        SecretBox b = box(newKey(), 1, Map.of());
        SecretCanaryRepository repo = mock(SecretCanaryRepository.class);
        when(repo.findById(InboxKeyCheck.NAME)).thenThrow(new IllegalStateException("db down"));
        new InboxKeyCheck(b, repo).check(); // no exception
        assertThat(b.status()).isEqualTo(SecretBox.Status.OK);
    }
}
