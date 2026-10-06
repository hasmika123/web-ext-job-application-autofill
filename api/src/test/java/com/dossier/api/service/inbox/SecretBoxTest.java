package com.dossier.api.service.inbox;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.security.SecureRandom;
import java.util.Base64;
import java.util.HexFormat;
import java.util.Map;
import org.junit.jupiter.api.Test;

/**
 * Inbox credential encryption (Phase 14.2). Keys are generated per test run — no key, real or
 * test, is ever committed.
 */
class SecretBoxTest {

    private static final SecureRandom RANDOM = new SecureRandom();

    private static String newKey() {
        byte[] k = new byte[32];
        RANDOM.nextBytes(k);
        return Base64.getEncoder().encodeToString(k);
    }

    private static SecretBox box(String key, int version, Map<Integer, String> retired) {
        InboxProperties p = new InboxProperties();
        p.setKey(key);
        p.setKeyVersion(version);
        p.setRetiredKeys(retired);
        return new SecretBox(p);
    }

    @Test
    void roundTripsAndNeverRepeatsACiphertext() {
        SecretBox b = box(newKey(), 1, Map.of());
        assertThat(b.status()).isEqualTo(SecretBox.Status.OK);
        String a = b.encrypt("abcd efgh ijkl mnop", "inbox:42");
        String c = b.encrypt("abcd efgh ijkl mnop", "inbox:42");
        assertThat(a).startsWith("v1:").doesNotContain("abcd");
        assertThat(a).isNotEqualTo(c); // a fresh IV every time
        assertThat(b.decrypt(a, "inbox:42")).isEqualTo("abcd efgh ijkl mnop");
    }

    @Test
    void aValueOnlyReadsInItsOwnPlace() {
        SecretBox b = box(newKey(), 1, Map.of());
        String mine = b.encrypt("secret", "inbox:42");
        // Copied into another user's row, it doesn't decrypt.
        assertThatThrownBy(() -> b.decrypt(mine, "inbox:43")).isInstanceOf(SecretBox.SecretBoxException.class);
    }

    @Test
    void aChangedByteIsCaught() {
        SecretBox b = box(newKey(), 1, Map.of());
        String v = b.encrypt("secret", "inbox:42");
        byte[] raw = Base64.getDecoder().decode(v.substring(3));
        raw[raw.length - 1] ^= 1;
        String tampered = "v1:" + Base64.getEncoder().encodeToString(raw);
        assertThatThrownBy(() -> b.decrypt(tampered, "inbox:42")).isInstanceOf(SecretBox.SecretBoxException.class);
    }

    @Test
    void anotherKeyCantReadIt() {
        String v = box(newKey(), 1, Map.of()).encrypt("secret", "inbox:42");
        assertThatThrownBy(() -> box(newKey(), 1, Map.of()).decrypt(v, "inbox:42")).isInstanceOf(SecretBox.SecretBoxException.class);
    }

    @Test
    void rotationReadsTheOldKeyAndWritesTheNew() {
        String oldKey = newKey();
        String v1 = box(oldKey, 1, Map.of()).encrypt("secret", "inbox:42");

        SecretBox rotated = box(newKey(), 2, Map.of(1, oldKey));
        assertThat(rotated.needsRotation(v1)).isTrue();
        assertThat(rotated.decrypt(v1, "inbox:42")).isEqualTo("secret");
        String v2 = rotated.reencrypt(v1, "inbox:42");
        assertThat(v2).startsWith("v2:");
        assertThat(rotated.needsRotation(v2)).isFalse();
        assertThat(rotated.reencrypt(v2, "inbox:42")).isSameAs(v2);
        assertThat(rotated.decrypt(v2, "inbox:42")).isEqualTo("secret");

        // Without the retired key, the old value is unreadable — no silent fallback.
        assertThatThrownBy(() -> box(newKey(), 2, Map.of()).decrypt(v1, "inbox:42")).isInstanceOf(SecretBox.SecretBoxException.class);
    }

    @Test
    void noKeyOrABadKeyMeansOff() {
        SecretBox none = box("", 1, Map.of());
        assertThat(none.status()).isEqualTo(SecretBox.Status.MISSING);
        assertThat(none.usable()).isFalse();
        assertThatThrownBy(() -> none.encrypt("x", "inbox:1")).isInstanceOf(SecretBox.SecretBoxException.class);

        assertThat(box("too-short", 1, Map.of()).status()).isEqualTo(SecretBox.Status.INVALID);
        assertThat(box(Base64.getEncoder().encodeToString(new byte[16]), 1, Map.of()).status()).isEqualTo(SecretBox.Status.INVALID);
    }

    @Test
    void hexKeysWorkToo() {
        byte[] k = new byte[32];
        RANDOM.nextBytes(k);
        SecretBox b = box(HexFormat.of().formatHex(k), 1, Map.of());
        assertThat(b.usable()).isTrue();
        assertThat(b.fingerprint()).hasSize(8);
        assertThat(b.fingerprint()).isEqualTo(box(Base64.getEncoder().encodeToString(k), 1, Map.of()).fingerprint());
    }

    @Test
    void garbageIsRejectedNotDecoded() {
        SecretBox b = box(newKey(), 1, Map.of());
        assertThatThrownBy(() -> b.decrypt("plain text password", "inbox:1")).isInstanceOf(SecretBox.SecretBoxException.class);
        assertThatThrownBy(() -> b.decrypt("v9:AAAA", "inbox:1")).isInstanceOf(SecretBox.SecretBoxException.class);
        assertThatThrownBy(() -> b.decrypt(null, "inbox:1")).isInstanceOf(SecretBox.SecretBoxException.class);
    }
}
