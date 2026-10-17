package com.dossier.api.service.privacy;

import com.dossier.api.domain.privacy.TermsAcceptance;
import com.dossier.api.repository.privacy.TermsAcceptanceRepository;
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.settings.AdminSettingKeys;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/**
 * The record of terms acceptance (REAL-GAPS-C T0.2): which version of the terms of service and of the privacy notice an account accepted, and when.
 * The versions in force are admin settings ({@code legal.terms_version}, {@code legal.privacy_version}); an acceptance is only recorded for the
 * version currently in force (accepting an old version proves nothing), once per account, document and version, so a repeat call is a harmless no-op
 * that returns the first timestamp. The rows are erased with the account (foreign key cascade) and appear in the account export.
 */
@Service
public class TermsAcceptanceService {

    static final Set<String> SOURCES = Set.of("SIGNUP", "ACCOUNT", "RECONFIRM");

    private final TermsAcceptanceRepository rows;
    private final ResumeBuilderSettings settings;

    public TermsAcceptanceService(TermsAcceptanceRepository rows, ResumeBuilderSettings settings) {
        this.rows = rows;
        this.settings = settings;
    }

    /** The version in force for {@code document} ({@code TERMS} or {@code PRIVACY}). */
    public String currentVersion(String document) {
        return switch (document) {
            case TermsAcceptance.TERMS -> settings.getString(AdminSettingKeys.LEGAL_TERMS_VERSION);
            case TermsAcceptance.PRIVACY -> settings.getString(AdminSettingKeys.LEGAL_PRIVACY_VERSION);
            default -> throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unknown document");
        };
    }

    /** Records the acceptance (or returns the existing one). 400 for an unknown document or a version that is not the one in force. */
    @Transactional
    public TermsAcceptance accept(Long userId, String document, String version, String source, Instant now) {
        String doc = document == null ? "" : document.trim().toUpperCase();
        if (!TermsAcceptance.TERMS.equals(doc) && !TermsAcceptance.PRIVACY.equals(doc)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unknown document");
        }
        String current = currentVersion(doc);
        if (version == null || !version.trim().equals(current)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "That is not the version currently in force");
        }
        String src = source == null || source.isBlank() ? "ACCOUNT" : source.trim().toUpperCase();
        if (!SOURCES.contains(src)) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unknown source");
        return rows
            .findByUserIdOrderByAcceptedAtDescIdDesc(userId)
            .stream()
            .filter(a -> a.getDocument().equals(doc) && a.getVersion().equals(current))
            .findFirst()
            .orElseGet(() -> {
                TermsAcceptance a = new TermsAcceptance();
                a.setUserId(userId);
                a.setDocument(doc);
                a.setVersion(current);
                a.setSource(src);
                a.setAcceptedAt(now);
                return rows.save(a);
            });
    }

    /** What is in force, what the account accepted, and whether the account is up to date with both. */
    @Transactional(readOnly = true)
    public Map<String, Object> status(Long userId) {
        List<TermsAcceptance> mine = rows.findByUserIdOrderByAcceptedAtDescIdDesc(userId);
        Map<String, Object> out = new LinkedHashMap<>();
        boolean upToDate = true;
        for (String doc : List.of(TermsAcceptance.TERMS, TermsAcceptance.PRIVACY)) {
            String current = currentVersion(doc);
            TermsAcceptance latest = mine.stream().filter(a -> a.getDocument().equals(doc)).findFirst().orElse(null);
            boolean accepted = mine.stream().anyMatch(a -> a.getDocument().equals(doc) && a.getVersion().equals(current));
            upToDate &= accepted;
            Map<String, Object> d = new LinkedHashMap<>();
            d.put("currentVersion", current);
            d.put("accepted", accepted);
            d.put("lastAcceptedVersion", latest == null ? null : latest.getVersion());
            d.put("lastAcceptedAt", latest == null ? null : latest.getAcceptedAt());
            out.put(doc.toLowerCase(), d);
        }
        out.put("upToDate", upToDate);
        return out;
    }

    /** The acceptance history for the account export, newest first. */
    @Transactional(readOnly = true)
    public List<Map<String, Object>> exportFor(Long userId) {
        return rows
            .findByUserIdOrderByAcceptedAtDescIdDesc(userId)
            .stream()
            .map(a -> {
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("document", a.getDocument());
                m.put("version", a.getVersion());
                m.put("source", a.getSource());
                m.put("acceptedAt", a.getAcceptedAt());
                return m;
            })
            .toList();
    }
}
