package com.dossier.api.service;

import com.dossier.api.service.dto.BioDTO;
import com.dossier.api.service.dto.ResumeDTO;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Comparator;
import java.util.HexFormat;
import java.util.List;
import java.util.Optional;

/**
 * The profile "version" the extension polls to decide whether to re-pull its mirror (Phase 11.2).
 *
 * <p>It is a <b>hash of exactly what a pull returns</b>, not a counter. {@code Resume} has no
 * {@code updatedAt} column (only {@code createdAt}), so a counter would need a migration plus a
 * touch on every write path — and could still miss one. Hashing the bio and every resume DTO
 * cannot miss a change and needs no schema change; a user has at most ~50 resumes, so it is cheap.
 *
 * <p>Canonical form: {@code v1|bio:<updatedAt>|<payload>} then, for each resume sorted by id,
 * {@code |r:<id>|<label>|<status>|<archived>|<starred>|<defaultResume>|<createdAt>|<r2ObjectKey>|<parsedJson>}.
 * SHA-256, first 16 hex chars. A user with no profile yet hashes to a stable "empty" value —
 * the endpoint never 404s, because the extension must always be able to compare.
 */
public final class ProfileVersion {

    private static final String SCHEME = "v1";
    private static final int HEX_CHARS = 16;

    private ProfileVersion() {}

    public static String compute(Optional<BioDTO> bio, List<ResumeDTO> resumes) {
        StringBuilder sb = new StringBuilder(SCHEME).append("|bio:");
        bio.ifPresent(b -> sb.append(b.getUpdatedAt()).append('|').append(b.getPayload()));
        resumes
            .stream()
            .sorted(Comparator.comparing(ResumeDTO::getId, Comparator.nullsLast(Comparator.naturalOrder())))
            .forEach(r ->
                sb
                    .append("|r:")
                    .append(r.getId())
                    .append('|')
                    .append(r.getLabel())
                    .append('|')
                    .append(r.getStatus())
                    .append('|')
                    .append(r.getArchived())
                    .append('|')
                    .append(r.getStarred())
                    .append('|')
                    .append(r.getDefaultResume())
                    .append('|')
                    .append(r.getCreatedAt())
                    .append('|')
                    .append(r.getr2ObjectKey()) // JavaBeans keeps the leading lowercase for "r2ObjectKey"
                    .append('|')
                    .append(r.getParsedJson())
            );
        return sha256Hex(sb.toString()).substring(0, HEX_CHARS);
    }

    private static String sha256Hex(String s) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(md.digest(s.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 is mandatory in every JVM", e);
        }
    }
}
