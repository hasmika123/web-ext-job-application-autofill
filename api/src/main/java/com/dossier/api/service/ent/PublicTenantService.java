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
            branding(published),
            new PublicTenantDTO.Login(true, false, false), // password only until an org enables Google / MFA (ADR-004)
            org.getStatus().name()
        ));
    }

    private PublicTenantDTO.Branding branding(OrgBranding b) {
        if (b == null) return new PublicTenantDTO.Branding(null, null, null, null, null, null, OrgBrandingTheme.SYSTEM.name(), null, null, Map.of());
        return new PublicTenantDTO.Branding(
            null, // logo / favicon / banner: signed URLs arrive with the branding-publish story
            null,
            null,
            b.getPrimaryColor(),
            b.getSecondaryColor(),
            b.getAccentColor(),
            (b.getTheme() == null ? OrgBrandingTheme.SYSTEM : b.getTheme()).name(),
            b.getWelcomeTitle(),
            b.getWelcomeMessage(),
            terminology(b.getTerminologyJson())
        );
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
