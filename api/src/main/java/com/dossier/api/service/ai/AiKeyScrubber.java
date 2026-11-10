package com.dossier.api.service.ai;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;

/**
 * Replaces every configured provider key (and anything shaped like a Google API key) with
 * {@code [redacted]}. Applied to every provider message before it is logged or returned, so a key can never
 * leave through an error text even if an HTTP library echoes a header or URL. Keys shorter than
 * {@value #MIN_KEY_LENGTH} characters are not scrubbed by value (a stand-in like {@code k} would shred every
 * message); real keys are far longer.
 */
public final class AiKeyScrubber {

    public static final String REDACTED = "[redacted]";
    static final int MIN_KEY_LENGTH = 6;

    /** A Google API key: {@code AIza} followed by 30+ url-safe characters. */
    private static final Pattern GOOGLE_KEY = Pattern.compile("AIza[0-9A-Za-z_\\-]{30,}");

    private final List<String> keys = new ArrayList<>();

    public AiKeyScrubber(List<String> configuredKeys) {
        if (configuredKeys != null) {
            for (String k : configuredKeys) {
                if (k != null && k.trim().length() >= MIN_KEY_LENGTH) keys.add(k.trim());
            }
        }
    }

    /** A scrubber that only knows the key SHAPES (no configured values). */
    public static AiKeyScrubber shapesOnly() {
        return new AiKeyScrubber(List.of());
    }

    /** {@code text} with every key value redacted; null stays null. */
    public String scrub(String text) {
        if (text == null) return null;
        String out = text;
        for (String k : keys) out = out.replace(k, REDACTED);
        return GOOGLE_KEY.matcher(out).replaceAll(REDACTED);
    }

    /** {@link #scrub(String)} cut to {@code max} characters (with an ellipsis). */
    public String scrub(String text, int max) {
        String s = scrub(text);
        if (s == null) return null;
        return s.length() > max ? s.substring(0, Math.max(0, max - 3)) + "..." : s;
    }
}
