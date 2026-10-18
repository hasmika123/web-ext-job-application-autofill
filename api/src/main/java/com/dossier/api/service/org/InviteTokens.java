package com.dossier.api.service.org;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.util.HexFormat;
import java.util.regex.Pattern;

/**
 * The secrets behind join links. An emailed invite carries a 32-character random token (about 190 bits); only its SHA-256
 * is stored ({@code org_member.invite_token_hash}), so a database leak cannot be turned into working links. A shared join
 * code is eight characters of Crockford base32 (no I, L, O or U), easy to read aloud in a classroom and forgiving to type:
 * the lower-case letters and the look-alikes O/I/L are folded before lookup.
 */
public final class InviteTokens {

    public static final int TOKEN_LENGTH = 32;

    private static final String BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
    private static final String CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
    private static final Pattern TOKEN = Pattern.compile("[A-Za-z0-9]{" + TOKEN_LENGTH + "}");
    private static final SecureRandom RANDOM = new SecureRandom();

    private InviteTokens() {}

    /** A new invite token. */
    public static String newToken() {
        StringBuilder sb = new StringBuilder(TOKEN_LENGTH);
        for (int i = 0; i < TOKEN_LENGTH; i++) sb.append(BASE62.charAt(RANDOM.nextInt(BASE62.length())));
        return sb.toString();
    }

    /** A new join code of {@code length} Crockford base32 characters (6 to 8). */
    public static String newCode(int length) {
        StringBuilder sb = new StringBuilder(length);
        for (int i = 0; i < length; i++) sb.append(CROCKFORD.charAt(RANDOM.nextInt(CROCKFORD.length())));
        return sb.toString();
    }

    /** True when {@code token} has the shape of an invite token (so junk never reaches the database). */
    public static boolean looksLikeToken(String token) {
        return token != null && TOKEN.matcher(token).matches();
    }

    /** The stored form of a token: lower-case hex SHA-256, 64 characters. */
    public static String hash(String token) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(token.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e); // SHA-256 is mandatory on every JVM
        }
    }

    /** The canonical spelling of a code a person typed, or null when it cannot be a code. */
    public static String normaliseCode(String raw) {
        if (raw == null) return null;
        StringBuilder sb = new StringBuilder(raw.length());
        for (char c : raw.strip().toUpperCase(java.util.Locale.ROOT).toCharArray()) {
            if (c == '-' || c == ' ') continue;
            if (c == 'O') c = '0';
            if (c == 'I' || c == 'L') c = '1';
            if (CROCKFORD.indexOf(c) < 0) return null;
            sb.append(c);
        }
        return sb.length() >= 6 && sb.length() <= 8 ? sb.toString() : null;
    }
}
