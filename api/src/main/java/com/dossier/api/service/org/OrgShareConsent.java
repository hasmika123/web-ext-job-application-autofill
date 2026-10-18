package com.dossier.api.service.org;

import com.dossier.api.domain.enumeration.ShareScope;
import com.dossier.api.service.dto.org.OrgConsentDTO;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Pattern;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

/**
 * The versioned consent text a member sees before they choose a sharing scope
 * (consent-data-sharing.md section 2: "the text version is stored with the grant"). Texts live in the repo under
 * {@code resources/consent/org-share/{version}.md}; an old version is never edited, a new one is added next to it and
 * {@link #CURRENT} moves. A grant must name a version that exists, so what was consented to can always be shown again.
 */
@Component
public class OrgShareConsent {

    /** The version the join screen shows today. */
    public static final String CURRENT = "org-share/v1";

    private static final Pattern VERSION = Pattern.compile("org-share/v[0-9]{1,3}");

    private final Map<String, Optional<String>> cache = new ConcurrentHashMap<>();

    /**
     * What the join screen shows (consent-data-sharing.md section 5.1): the current text version, the scope the org proposes
     * (clamped to the two the join screen offers), the matrix of what each scope shows and the text itself. FULL is never an
     * option here.
     */
    public OrgConsentDTO view(String proposedScope) {
        ShareScope proposed = "NONE".equals(proposedScope) ? ShareScope.NONE : ShareScope.SUMMARY;
        java.util.List<OrgConsentDTO.Row> rows = new java.util.ArrayList<>();
        for (ShareField f : ShareField.values()) rows.add(new OrgConsentDTO.Row(f.name(), f.docLabel(), f.minScope()));
        return new OrgConsentDTO(CURRENT, proposed, java.util.List.of(ShareScope.SUMMARY, ShareScope.NONE), rows, text(CURRENT).orElse(""));
    }

    /** True when {@code version} names a text that ships with this build. */
    public boolean isKnown(String version) {
        return text(version).isPresent();
    }

    /** The markdown of {@code version}, or empty for an unknown or malformed version (never reads outside the folder). */
    public Optional<String> text(String version) {
        if (version == null || !VERSION.matcher(version).matches()) return Optional.empty();
        return cache.computeIfAbsent(version, v -> {
            ClassPathResource resource = new ClassPathResource("consent/" + v + ".md");
            if (!resource.exists()) return Optional.empty();
            try (InputStream in = resource.getInputStream()) {
                return Optional.of(new String(in.readAllBytes(), StandardCharsets.UTF_8));
            } catch (IOException e) {
                return Optional.empty();
            }
        });
    }
}
