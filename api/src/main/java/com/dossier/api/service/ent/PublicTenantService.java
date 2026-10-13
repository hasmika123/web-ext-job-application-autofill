package com.dossier.api.service.ent;

import com.dossier.api.domain.ent.OrgBranding;
import com.dossier.api.domain.enumeration.OrgBrandingTheme;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.ent.OrgBrandingRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.dto.ent.PublicTenantDTO;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Builds the anonymous view of a tenant ({@link PublicTenantDTO}). The organization comes from the resolved
 * {@link TenantContext} (the host), never from the request; only PUBLISHED branding is read, so a draft can not leak; and
 * nothing but display fields leaves this class.
 */
@Service
public class PublicTenantService {

    private static final Logger LOG = LoggerFactory.getLogger(PublicTenantService.class);
    private static final int MAX_TERMS = 50;
    private static final int MAX_TERM_LENGTH = 60;
    private static final TypeReference<Map<String, String>> STRING_MAP = new TypeReference<>() {};

    private final OrganizationRepository organizations;
    private final OrgBrandingRepository brandings;
    private final ObjectMapper mapper;

    public PublicTenantService(OrganizationRepository organizations, OrgBrandingRepository brandings, ObjectMapper mapper) {
        this.organizations = organizations;
        this.brandings = brandings;
        this.mapper = mapper;
    }

    /** The public view for a TENANT context; empty when the context is not a tenant or its organization is gone. */
    @Transactional(readOnly = true)
    public Optional<PublicTenantDTO> forContext(TenantContext context) {
        if (context == null || !context.isTenant() || context.orgId() == null) return Optional.empty();
        Organization org = organizations.findByOrgId(context.orgId()).orElse(null);
        if (org == null) return Optional.empty();
        OrgBranding published = brandings.findByOrgId(org.getId()).filter(b -> b.getPublishedAt() != null).orElse(null);
        String displayName = org.getDisplayName() != null && !org.getDisplayName().isBlank() ? org.getDisplayName() : org.getName();
        return Optional.of(new PublicTenantDTO(
            "TENANT",
            displayName,
            branding(published, org.getConfigVersion()),
            new PublicTenantDTO.Login(true, false, false, false) // password only until an org enables Google / MFA (ADR-004)
        ));
    }

    /**
     * The same-origin URL a browser loads an asset from (X2.13): the web BFF proxies {@code /tenant-assets/{kind}} to the
     * host-scoped API route, and {@code v} (the organization's config_version) busts caches after a publish. Null when unset.
     */
    static String assetUrl(String key, String kind, int configVersion) {
        return key == null || key.isBlank() ? null : "/tenant-assets/" + kind + "?v=" + configVersion;
    }

    private PublicTenantDTO.Branding branding(OrgBranding b, int configVersion) {
        if (b == null) return new PublicTenantDTO.Branding(null, null, null, null, null, null, OrgBrandingTheme.SYSTEM.name(), null, null, null, null, Map.of());
        return new PublicTenantDTO.Branding(
            assetUrl(b.getLogoKey(), "logo", configVersion),
            assetUrl(b.getFaviconKey(), "favicon", configVersion),
            assetUrl(b.getLoginBannerKey(), "banner", configVersion),
            b.getPrimaryColor(),
            b.getSecondaryColor(),
            b.getAccentColor(),
            (b.getTheme() == null ? OrgBrandingTheme.SYSTEM : b.getTheme()).name(),
            b.getWelcomeTitle(),
            b.getWelcomeMessage(),
            b.getSupportEmail(),
            chips(b.getLoginChipsJson()),
            terminology(b.getTerminologyJson())
        );
    }

    /** The login's feature chip labels: at most three short strings, anything else dropped (null = the web's defaults). */
    private java.util.List<String> chips(String json) {
        if (json == null || json.isBlank()) return null;
        try {
            java.util.List<String> raw = mapper.readValue(json, new TypeReference<java.util.List<String>>() {});
            java.util.List<String> out = raw.stream().filter(x -> x != null && !x.isBlank() && x.length() <= 24).limit(3).toList();
            return out.isEmpty() ? null : out;
        } catch (Exception e) {
            return null;
        }
    }

    /** The label overrides, defensively: invalid JSON, non-string values and over-long text are dropped, not trusted. */
    private Map<String, String> terminology(String json) {
        if (json == null || json.isBlank()) return Map.of();
        try {
            Map<String, String> raw = mapper.readValue(json, STRING_MAP);
            Map<String, String> out = new LinkedHashMap<>();
            for (Map.Entry<String, String> e : raw.entrySet()) {
                if (out.size() >= MAX_TERMS) break;
                if (e.getKey() != null && e.getValue() != null && e.getValue().length() <= MAX_TERM_LENGTH) out.put(e.getKey(), e.getValue());
            }
            return out;
        } catch (Exception e) {
            LOG.warn("An organization's terminology JSON could not be read; serving none");
            return Map.of();
        }
    }
}
