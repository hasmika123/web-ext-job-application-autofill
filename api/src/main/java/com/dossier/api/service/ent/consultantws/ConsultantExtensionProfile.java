package com.dossier.api.service.ent.consultantws;

import com.dossier.api.domain.User;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.security.SecurityUtils;
import com.dossier.api.service.dto.BioDTO;
import com.dossier.api.service.ent.consultantws.ConsultantProfileDTO.Response;
import com.dossier.api.service.org.OrgAccessService;
import com.dossier.api.service.org.OrgMembership;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.time.Instant;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * What the browser extension pulls as "the profile" for an organization consultant: the consultant's own "My Career Profile" (the workspace profile of
 * {@code GET /api/orgs/{orgId}/me-workspace/profile}) in the bio shape the fill engine reads ({@code GET /api/profile}, key names of the extension's
 * {@code schema.emptyBio}). Applies ONLY to an extension token ({@code ext=1}) bound to an organization ({@code tid}) whose holder is an ACTIVE consultant
 * there; for everyone else (a personal extension session, a web session, a marketer, a member with no consultant record) {@link #overlay} is empty and the
 * caller serves the account's own bio exactly as before.
 *
 * <p>Read-only and derived: nothing here writes. The workspace values (name, phone, location, work mode, work-authorization CHOICE) are laid over the
 * account's own bio, so what the consultant keeps there (address, links) still fills, and the account email comes from the account itself. The summary,
 * skills and experience of "My Career Profile" belong to a resume, not to the bio, so they are not part of this view. No date of birth, document number or
 * other sensitive identifier exists in the workspace profile and none is added.
 */
@Service
public class ConsultantExtensionProfile {

    private static final Logger LOG = LoggerFactory.getLogger(ConsultantExtensionProfile.class);

    private final OrgAccessService access;
    private final ConsultantProfileService profiles;
    private final UserRepository users;
    private final ObjectMapper mapper;

    public ConsultantExtensionProfile(OrgAccessService access, ConsultantProfileService profiles, UserRepository users, ObjectMapper mapper) {
        this.access = access;
        this.profiles = profiles;
        this.users = users;
        this.mapper = mapper;
    }

    /**
     * The bio the extension should see for the current request, or empty when this request is not an organization consultant's extension session (serve
     * {@code personal} unchanged). {@code personal} is the account's own bio, when it has one.
     */
    @Transactional(readOnly = true)
    public Optional<BioDTO> overlay(Optional<BioDTO> personal) {
        Optional<Long> tid = SecurityUtils.currentExtensionTenant();
        if (tid.isEmpty()) return Optional.empty();
        try {
            Optional<OrgMembership> me = access.resolve(tid.get());
            if (me.isEmpty()) return Optional.empty();
            Response workspace = profiles.profile(me.get()); // the consultant gate: 404 (an exception) for anyone who is not an active consultant
            String email = SecurityUtils.getCurrentUserLogin().flatMap(users::findOneByLogin).map(User::getEmail).orElse(null);
            BioDTO out = new BioDTO();
            out.setId(personal.map(BioDTO::getId).orElse(null));
            out.setUpdatedAt(personal.map(BioDTO::getUpdatedAt).orElse(Instant.EPOCH));
            out.setPayload(payload(personal.map(BioDTO::getPayload).orElse(null), workspace, email));
            return Optional.of(out);
        } catch (RuntimeException e) {
            // not a consultant here (or the workspace is off): the account's own bio is the answer; the sync poll must never fail over this
            LOG.debug("No consultant profile for the extension session of organization {}: {}", tid.get(), e.toString());
            return Optional.empty();
        }
    }

    String payload(String personalPayload, Response workspace, String email) {
        ObjectNode bio = baseOf(personalPayload);
        ConsultantProfileDTO.Me me = workspace.me();
        if (me != null) {
            put(bio, "firstName", firstName(me.name()));
            put(bio, "lastName", lastName(me.name()));
            put(bio, "phone", me.phone());
            location(bio, me.location());
            put(bio, "workPreference", workPreference(me.workMode()));
        }
        put(bio, "email", email);
        String auth = workspace.workAuthorization();
        if ("AUTHORIZED_NO_SPONSORSHIP".equals(auth)) {
            bio.put("authorizedToWork", "Yes");
            bio.put("requireSponsorship", "No");
        } else if ("AUTHORIZED_NEEDS_SPONSORSHIP".equals(auth)) {
            bio.put("authorizedToWork", "Yes");
            bio.put("requireSponsorship", "Yes");
        } else if ("NOT_AUTHORIZED".equals(auth)) {
            bio.put("authorizedToWork", "No");
        }
        return bio.toString();
    }

    private ObjectNode baseOf(String payload) {
        if (payload != null && !payload.isBlank()) {
            try {
                JsonNode node = mapper.readTree(payload);
                if (node instanceof ObjectNode o) return o;
            } catch (Exception e) {
                LOG.debug("The account's own bio is not readable JSON; starting from the workspace profile alone");
            }
        }
        return mapper.createObjectNode();
    }

    private static void put(ObjectNode bio, String key, String value) {
        if (value != null && !value.isBlank()) bio.put(key, value.trim());
    }

    /** "Mary Ann Smith" is first name "Mary Ann", last name "Smith"; a single word is a first name only. */
    static String firstName(String name) {
        String n = name == null ? "" : name.trim().replaceAll("\\s+", " ");
        int i = n.lastIndexOf(' ');
        return i < 0 ? n : n.substring(0, i);
    }

    static String lastName(String name) {
        String n = name == null ? "" : name.trim().replaceAll("\\s+", " ");
        int i = n.lastIndexOf(' ');
        return i < 0 ? "" : n.substring(i + 1);
    }

    /** Only a label that is plainly "City, ST" (or "City, ST, Country") is split; "Remote" or free text fills nothing rather than a wrong city. */
    private static void location(ObjectNode bio, String label) {
        if (label == null) return;
        String[] parts = label.split(",");
        if (parts.length < 2 || parts.length > 3) return;
        String city = parts[0].trim();
        String state = parts[1].trim();
        if (city.isEmpty() || state.isEmpty() || !city.matches("[\\p{L} .'-]+") || !state.matches("[\\p{L} .]+")) return;
        bio.put("city", city);
        bio.put("state", state);
        if (parts.length == 3 && !parts[2].isBlank()) bio.put("country", parts[2].trim());
    }

    private static String workPreference(String mode) {
        if (mode == null) return null;
        return switch (mode.trim().toUpperCase().replace('-', '_')) {
            case "REMOTE" -> "Remote";
            case "HYBRID" -> "Hybrid";
            case "ONSITE", "ON_SITE" -> "On-site";
            default -> null;
        };
    }
}
