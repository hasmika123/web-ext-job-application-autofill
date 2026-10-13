package com.dossier.api.service.resume;

import com.fasterxml.jackson.databind.JsonNode;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;

/**
 * The render hash of a built resume (Resume Builder DESIGN 8.5): what the stored PDF is judged against.
 *
 * <pre>render_hash = sha256(content_hash + "|" + template_id + "|" + canonicalJson(theme))</pre>
 *
 * Theme and template changes alter the PDF without changing the content hash, so "is the stored PDF
 * out of date" is {@code exported_hash != render_hash}. The theme is canonicalised exactly like the
 * document ({@link ResumeDocumentCanonical}: trimmed strings, sorted keys), and an absent or null theme
 * is {@code {}}. The TypeScript twin is {@code resumeRenderHash} in {@code packages/ui}; both are pinned
 * by the same golden vector.
 */
public final class ResumeRenderHash {

    private ResumeRenderHash() {}

    /** As {@link #compute(String, String, JsonNode)} for a stored {@code theme_json} string; unparsable or blank is {@code {}}. */
    public static String computeFromThemeJson(String contentHash, String templateId, String themeJson) {
        JsonNode theme = null;
        if (themeJson != null && !themeJson.isBlank()) {
            try {
                theme = ResumeDocument.parse(themeJson);
            } catch (IllegalArgumentException e) {
                theme = null;
            }
        }
        return compute(contentHash, templateId, theme);
    }

    /** Lowercase-hex SHA-256 of {@code contentHash|templateId|canonicalJson(theme)}. */
    public static String compute(String contentHash, String templateId, JsonNode theme) {
        String themeJson = theme == null || theme.isNull() || theme.isMissingNode() ? "{}" : ResumeDocumentCanonical.canonicalJson(theme);
        String input = contentHash + "|" + templateId + "|" + themeJson;
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(input.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder(64);
            for (byte b : digest) {
                sb.append(Character.forDigit((b >> 4) & 0xF, 16)).append(Character.forDigit(b & 0xF, 16));
            }
            return sb.toString();
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 unavailable", e);
        }
    }
}
