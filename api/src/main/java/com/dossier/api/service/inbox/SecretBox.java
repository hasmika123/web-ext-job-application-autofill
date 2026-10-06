package com.dossier.api.service.inbox;

import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.HashMap;
import java.util.HexFormat;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import javax.crypto.Cipher;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * Encryption at rest for inbox credentials (Phase 14.2): a Gmail app password is the key to a
 * mailbox, so it's never stored as it came.
 *
 * <p>AES-256-GCM with a fresh random 12-byte IV per value and a 128-bit tag, so tampering is
 * detected, not just hidden. Each value is bound to where it lives by associated data (e.g.
 * {@code "inbox:42"} for user 42's connection): a ciphertext copied into another user's row won't
 * decrypt. Stored as {@code v<version>:<base64(iv ‖ ciphertext ‖ tag)>}, the version naming the key
 * that wrote it, so the key can be rotated: new key, version + 1, old key kept under
 * {@code retired-keys} until {@link #reencrypt} has moved everything forward.
 *
 * <p>The key comes only from the environment ({@link InboxProperties}). Without a usable key the box
 * reports {@link Status#MISSING} or {@link Status#INVALID} and the inbox stays off; it never falls
 * back to something weaker. {@link InboxKeyCheck} marks it {@link Status#MISMATCH} at startup when
 * the key can't read what's already stored.
 */
@Component
public class SecretBox {

    private static final Logger LOG = LoggerFactory.getLogger(SecretBox.class);
    private static final String ALGORITHM = "AES/GCM/NoPadding";
    private static final int IV_BYTES = 12;
    private static final int TAG_BITS = 128;
    private static final Pattern FORMAT = Pattern.compile("^v(\\d{1,4}):([A-Za-z0-9+/=]+)$");

    public enum Status {
        /** A valid key, and it reads what's stored (or nothing is stored yet). */
        OK,
        /** No key configured: the inbox is off. */
        MISSING,
        /** A key is configured but isn't 32 bytes of base64 or hex. */
        INVALID,
        /** The key is valid but isn't the one that encrypted what's stored. */
        MISMATCH,
    }

    /** Thrown when there's no usable key, or a value can't be read (wrong key, tampered, malformed). */
    public static class SecretBoxException extends RuntimeException {

        public SecretBoxException(String message) {
            super(message);
        }
    }

    private final SecureRandom random = new SecureRandom();
    private final int currentVersion;
    private final SecretKey current;
    private final Map<Integer, SecretKey> keys = new HashMap<>();
    private final String fingerprint;
    private volatile Status status;

    public SecretBox(InboxProperties props) {
        this.currentVersion = props.getKeyVersion();
        SecretKey k = null;
        Status s;
        String raw = props.getKey() == null ? "" : props.getKey().trim();
        if (raw.isEmpty()) {
            s = Status.MISSING;
        } else {
            byte[] bytes = decodeKey(raw);
            if (bytes == null) {
                s = Status.INVALID;
                LOG.error("DOSSIER_INBOX_KEY is set but isn't a 32-byte key (base64 or 64 hex characters) — the inbox stays off.");
            } else {
                k = new SecretKeySpec(bytes, "AES");
                s = Status.OK;
            }
        }
        this.current = k;
        this.status = s;
        this.fingerprint = k == null ? null : fingerprintOf(k.getEncoded());
        if (k != null) keys.put(currentVersion, k);
        props
            .getRetiredKeys()
            .forEach((v, rawOld) -> {
                byte[] b = decodeKey(rawOld == null ? "" : rawOld.trim());
                if (b == null) LOG.error("Retired inbox key v{} isn't a 32-byte key — values it wrote can't be read.", v);
                else if (v != currentVersion) keys.put(v, new SecretKeySpec(b, "AES"));
            });
    }

    public Status status() {
        return status;
    }

    /** True when values can be encrypted and read. */
    public boolean usable() {
        return status == Status.OK;
    }

    /** The first 8 hex characters of the current key's SHA-256 — safe to log, tells two keys apart. */
    public String fingerprint() {
        return fingerprint;
    }

    public int currentVersion() {
        return currentVersion;
    }

    void markMismatch() {
        status = Status.MISMATCH;
    }

    /** Encrypt {@code plaintext}, bound to {@code context} (which must be given again to read it). */
    public String encrypt(String plaintext, String context) {
        if (!usable()) throw new SecretBoxException("The inbox key isn't usable (" + status + ")");
        try {
            byte[] iv = new byte[IV_BYTES];
            random.nextBytes(iv);
            Cipher c = Cipher.getInstance(ALGORITHM);
            c.init(Cipher.ENCRYPT_MODE, current, new GCMParameterSpec(TAG_BITS, iv));
            c.updateAAD(context.getBytes(StandardCharsets.UTF_8));
            byte[] ct = c.doFinal(plaintext.getBytes(StandardCharsets.UTF_8));
            byte[] out = ByteBuffer.allocate(iv.length + ct.length).put(iv).put(ct).array();
            return "v" + currentVersion + ":" + Base64.getEncoder().encodeToString(out);
        } catch (GeneralSecurityException e) {
            throw new SecretBoxException("Couldn't encrypt: " + e.getClass().getSimpleName());
        }
    }

    /** Read a value {@link #encrypt} wrote, with the same {@code context}. */
    public String decrypt(String stored, String context) {
        Matcher m = FORMAT.matcher(stored == null ? "" : stored);
        if (!m.matches()) throw new SecretBoxException("Not an encrypted value");
        int version = Integer.parseInt(m.group(1));
        SecretKey k = keys.get(version);
        if (k == null) throw new SecretBoxException("No key for version " + version);
        byte[] all;
        try {
            all = Base64.getDecoder().decode(m.group(2));
        } catch (IllegalArgumentException e) {
            throw new SecretBoxException("Not an encrypted value");
        }
        if (all.length <= IV_BYTES + TAG_BITS / 8) throw new SecretBoxException("Not an encrypted value");
        try {
            Cipher c = Cipher.getInstance(ALGORITHM);
            c.init(Cipher.DECRYPT_MODE, k, new GCMParameterSpec(TAG_BITS, all, 0, IV_BYTES));
            c.updateAAD(context.getBytes(StandardCharsets.UTF_8));
            return new String(c.doFinal(all, IV_BYTES, all.length - IV_BYTES), StandardCharsets.UTF_8);
        } catch (GeneralSecurityException e) {
            // Wrong key, wrong context or a changed byte — GCM can't tell which, and neither should we.
            throw new SecretBoxException("Couldn't read the value (wrong key, or it was altered)");
        }
    }

    /** True when {@code stored} was written by an older key and should be re-encrypted. */
    public boolean needsRotation(String stored) {
        Matcher m = FORMAT.matcher(stored == null ? "" : stored);
        return m.matches() && Integer.parseInt(m.group(1)) != currentVersion;
    }

    /** {@code stored} under the current key — itself when it already is. */
    public String reencrypt(String stored, String context) {
        return needsRotation(stored) ? encrypt(decrypt(stored, context), context) : stored;
    }

    /** 32 bytes from base64 or 64 hex characters, else null. */
    static byte[] decodeKey(String raw) {
        if (raw.matches("[0-9a-fA-F]{64}")) return HexFormat.of().parseHex(raw);
        try {
            byte[] b = Base64.getDecoder().decode(raw);
            return b.length == 32 ? b : null;
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    private static String fingerprintOf(byte[] key) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(key)).substring(0, 8);
        } catch (GeneralSecurityException e) {
            return null;
        }
    }
}
