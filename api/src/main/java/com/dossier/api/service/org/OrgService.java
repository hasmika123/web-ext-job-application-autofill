package com.dossier.api.service.org;

import com.dossier.api.domain.User;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgPermission;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.security.SecurityUtils;
import com.dossier.api.service.ResumeBuilderSettingKeys;
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.ent.OrgRoleService;
import com.dossier.api.service.dto.org.OrgCreateRequest;
import com.dossier.api.service.dto.org.OrgDTO;
import com.dossier.api.service.dto.org.OrgDetailDTO;
import com.dossier.api.service.dto.org.OrgMineDTO;
import com.dossier.api.service.dto.org.OrgPatchRequest;
import com.dossier.api.service.dto.org.OrgSettings;
import com.dossier.api.service.privacy.SensitiveContent;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.net.URISyntaxException;
import java.time.Instant;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Pattern;
import com.dossier.api.service.ent.TenantConfigChangedEvent;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/**
 * Creates, lists, reads, configures and closes organizations (docs/design/org/tenant-model.md sections 3 and 5).
 *
 * <p>Every method that acts on one org takes the {@link OrgMembership} the access check resolved; nothing here looks
 * an org up by a bare id from the caller. Every mutation writes exactly one {@code org_audit_event} row in the same
 * transaction. Until billing ships an org is {@code DRAFT} or {@code CLOSED} (activation arrives with the setup-fee
 * webhook / the dev activation path).
 */
@Service
public class OrgService {

    private static final Set<String> SIZE_BANDS = Set.of("1_50", "51_200", "201_500", "501_1000", "1001_PLUS");
    private static final Set<String> COUNTRIES = Set.of(Locale.getISOCountries());
    private static final Pattern EMAIL = Pattern.compile("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$");

    private final OrganizationRepository orgs;
    private final OrgMemberRepository members;
    private final UserRepository users;
    private final OrgAuditService audit;
    private final ObjectMapper json;
    private final ApplicationEventPublisher events;
    private final ResumeBuilderSettings settings;
    private final OrgRoleService roleService;

    public OrgService(
        OrganizationRepository orgs,
        OrgMemberRepository members,
        UserRepository users,
        OrgAuditService audit,
        ObjectMapper json,
        ApplicationEventPublisher events,
        ResumeBuilderSettings settings,
        OrgRoleService roleService
    ) {
        this.settings = settings;
        this.roleService = roleService;
        this.orgs = orgs;
        this.members = members;
        this.users = users;
        this.audit = audit;
        this.json = json;
        this.events = events;
    }

    /** Published when an org is closed, so the area that owns grants (billing, O4.9) can end them. */
    public record OrgClosedEvent(Long orgId, Instant at) {}

    // ---- create -------------------------------------------------------------------------------------------------

    /** Makes a DRAFT org with the signed-in caller as its OWNER. Needs no org yet, so it takes no membership. */
    @Transactional
    public OrgDetailDTO create(OrgCreateRequest req) {
        if (req == null) throw OrgException.invalid("body", "is required");
        String login = SecurityUtils.getCurrentUserLogin().orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "No authenticated user"));
        User user = users.findOneByLogin(login).orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "No authenticated user"));

        // Abuse cap (admin setting org.limits.createdPerUser): orgs this person has ever created, closed ones included
        // (a closed org still holds its slug). Checked before anything is written.
        int maxOrgs = settings.getInt(ResumeBuilderSettingKeys.ORG_LIMIT_CREATED_PER_USER);
        if (orgs.countByCreatedByUserId(user.getId()) >= maxOrgs) throw OrgException.limitReached("orgsCreatedPerUser", maxOrgs);

        String name = cleanName(req.name());
        OrgRules.requireAssignable(req.type());
        String slug = req.slug() == null || req.slug().isBlank() ? OrgSlugs.derive(name) : req.slug().strip().toLowerCase(Locale.ROOT);
        if (!OrgSlugs.isWellFormed(slug)) throw OrgException.invalid("slug", "must be 3 to 60 lower-case letters, digits or single dashes");
        if (OrgSlugs.isReserved(slug) || orgs.existsBySlug(slug)) throw OrgException.slugTaken(slug, OrgSlugs.suggest(slug, orgs::existsBySlug));

        Organization org = new Organization();
        org.setName(name);
        org.setType(req.type());
        org.setSlug(slug);
        org.setStatus(OrgStatus.DRAFT);
        org.setSizeBand(cleanSizeBand(req.sizeBand()));
        org.setCountry(cleanCountry(req.country()));
        org.setCreatedByUserId(user.getId());
        org.setSettingsJson(writeSettings(OrgSettings.defaults()));
        try {
            org = orgs.saveAndFlush(org);
        } catch (DataIntegrityViolationException e) { // lost a race for the same slug
            throw OrgException.slugTaken(slug, OrgSlugs.suggest(slug, orgs::existsBySlug));
        }

        OrgMember owner = new OrgMember();
        owner.setOrgId(org.getId());
        owner.setUserId(user.getId());
        owner.setRole(OrgRole.OWNER);
        owner.setStatus(OrgMemberStatus.ACTIVE);
        owner.setJoinedAt(Instant.now());
        owner = members.saveAndFlush(owner);
        roleService.syncFromLegacy(owner); // Enterprise V2 (X1.6): the role rows follow the enum this code still writes

        audit.record(org.getId(), OrgRole.OWNER, OrgAuditService.ORG_CREATE, OrgAuditService.TARGET_ORG, null, org.getId().toString(), "type=" + org.getType() + " slug=" + slug);
        OrgMembership me = new OrgMembership(org.getId(), owner.getId(), user.getId(), login, OrgRole.OWNER, OrgMemberStatus.ACTIVE, org.getStatus());
        return detail(org, me);
    }

    // ---- mine / get ---------------------------------------------------------------------------------------------

    /** The organizations the caller is an ACTIVE member of, by name. No other state of a seat shows an org. */
    @Transactional(readOnly = true)
    public List<OrgMineDTO> mine() {
        Optional<User> user = SecurityUtils.getCurrentUserLogin().flatMap(users::findOneByLogin);
        if (user.isEmpty()) return List.of();
        Map<Long, OrgRole> roleByOrg = new LinkedHashMap<>();
        for (OrgMember m : members.findMine(user.get().getId())) {
            if (m.getStatus() == OrgMemberStatus.ACTIVE && m.getRole() != null && !m.getRole().isReserved()) roleByOrg.put(m.getOrgId(), m.getRole());
        }
        if (roleByOrg.isEmpty()) return List.of();
        List<OrgMineDTO> out = new ArrayList<>();
        for (Organization o : orgs.findAllByOrgIdIn(roleByOrg.keySet())) {
            out.add(new OrgMineDTO(o.getId(), o.getSlug(), o.getName(), roleByOrg.get(o.getId()), o.getStatus(), activeSeats(o.getId())));
        }
        out.sort(Comparator.comparing(OrgMineDTO::name, String.CASE_INSENSITIVE_ORDER));
        return out;
    }

    @Transactional(readOnly = true)
    public OrgDetailDTO get(OrgMembership me) {
        return detail(load(me), me);
    }

    // ---- patch --------------------------------------------------------------------------------------------------

    /** Applies the supplied fields; audits ORG_SETTINGS naming the fields that changed (not their values). */
    @Transactional
    public OrgDetailDTO patch(OrgMembership me, OrgPatchRequest req) {
        if (req == null) throw OrgException.invalid("body", "is required");
        Organization org = load(me);
        requireOpen(org);
        List<String> changed = new ArrayList<>();

        if (req.name() != null) {
            String name = cleanName(req.name());
            if (!name.equals(org.getName())) {
                org.setName(name);
                changed.add("name");
            }
        }
        if (req.website() != null) {
            String website = cleanWebsite(req.website());
            if (!java.util.Objects.equals(website, org.getWebsite())) {
                org.setWebsite(website);
                changed.add("website");
            }
        }
        if (req.sizeBand() != null) {
            String band = cleanSizeBand(req.sizeBand());
            if (!java.util.Objects.equals(band, org.getSizeBand())) {
                org.setSizeBand(band);
                changed.add("sizeBand");
            }
        }
        if (req.country() != null) {
            String country = cleanCountry(req.country());
            if (!java.util.Objects.equals(country, org.getCountry())) {
                org.setCountry(country);
                changed.add("country");
            }
        }
        if (req.timezone() != null) {
            String tz = cleanTimezone(req.timezone());
            if (!tz.equals(org.getTimezone())) {
                org.setTimezone(tz);
                changed.add("timezone");
            }
        }
        if (req.billingEmail() != null) {
            String email = cleanEmail(req.billingEmail());
            if (!java.util.Objects.equals(email, org.getBillingEmail())) {
                org.setBillingEmail(email);
                changed.add("billingEmail");
            }
        }
        if (req.settings() != null && !req.settings().isNull()) {
            OrgSettings current = readSettings(org.getSettingsJson());
            OrgSettings merged = OrgSettings.merge(current, req.settings());
            if (!merged.equals(current)) {
                org.setSettingsJson(writeSettings(merged));
                changed.add("settings");
            }
        }

        if (!changed.isEmpty()) {
            org = orgs.saveAndFlush(org);
            audit.record(me, OrgAuditService.ORG_SETTINGS, OrgAuditService.TARGET_ORG, null, org.getId().toString(), "fields=" + String.join(",", changed));
        }
        return detail(org, me);
    }

    // ---- close --------------------------------------------------------------------------------------------------

    /** OWNER only (the caller holds {@code org.close}). Soft: the row, its members and billing history stay. Idempotent. */
    @Transactional
    public OrgDetailDTO close(OrgMembership me) {
        Organization org = load(me);
        if (org.getStatus() == OrgStatus.CLOSED) return detail(org, me); // already closed: nothing changed, nothing to audit
        OrgStatus before = org.getStatus();
        Instant now = Instant.now();
        org.setStatus(OrgStatus.CLOSED);
        org.setClosedAt(now);
        org = orgs.saveAndFlush(org);
        audit.record(me, OrgAuditService.ORG_CLOSE, OrgAuditService.TARGET_ORG, null, org.getId().toString(), "status " + before + " -> CLOSED");
        events.publishEvent(new TenantConfigChangedEvent("org " + org.getId() + " closed")); // its tenant host stops resolving at once
        events.publishEvent(new OrgClosedEvent(org.getId(), now)); // grants end now: the billing area listens (O4.9)
        return detail(org, new OrgMembership(me.orgId(), me.memberId(), me.userId(), me.login(), me.role(), me.status(), OrgStatus.CLOSED));
    }

    // ---- helpers ------------------------------------------------------------------------------------------------

    private Organization load(OrgMembership me) {
        return orgs.findByOrgId(me.orgId()).orElseThrow(OrgNotFoundException::new);
    }

    /** A CLOSED org is read-only. */
    static void requireOpen(Organization org) {
        if (org.getStatus() == OrgStatus.CLOSED) throw OrgException.notEditable("This organization is closed and read-only");
    }

    private long activeSeats(Long orgId) {
        return members.countByOrgIdAndStatus(orgId, OrgMemberStatus.ACTIVE);
    }

    private OrgDetailDTO detail(Organization org, OrgMembership me) {
        boolean billing = me.can(OrgPermission.BILLING_VIEW);
        boolean configure = me.can(OrgPermission.ORG_SETTINGS_MANAGE);
        OrgDTO dto = new OrgDTO(
            org.getId(),
            org.getSlug(),
            org.getName(),
            org.getType(),
            org.getStatus(),
            org.getWebsite(),
            org.getSizeBand(),
            org.getCountry(),
            org.getTimezone(),
            billing ? org.getBillingEmail() : null,
            configure ? readSettings(org.getSettingsJson()) : null,
            org.getCreatedAt(),
            org.getClosedAt()
        );
        return new OrgDetailDTO(dto, new OrgDetailDTO.Me(me.memberId(), me.role(), me.permissionKeys()), activeSeats(org.getId()), org.getStatus());
    }

    private OrgSettings readSettings(String raw) {
        if (raw == null || raw.isBlank()) return OrgSettings.defaults();
        try {
            return OrgSettings.merge(OrgSettings.defaults(), json.readTree(raw)); // a missing key keeps its default
        } catch (JsonProcessingException e) {
            return OrgSettings.defaults();
        }
    }

    private String writeSettings(OrgSettings settings) {
        try {
            return json.writeValueAsString(settings);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("could not serialise org settings", e);
        }
    }

    // ---- field cleaning (every free-text value is scanned for never-collected data) ------------------------------

    static String cleanName(String raw) {
        String name = raw == null ? "" : raw.strip().replaceAll("\\s+", " ");
        if (name.isEmpty()) throw OrgException.invalid("name", "is required");
        if (name.length() > 120) throw OrgException.invalid("name", "must be at most 120 characters");
        SensitiveContent.check("name", "name", name);
        return name;
    }

    private static String cleanWebsite(String raw) {
        String w = raw.strip();
        if (w.isEmpty()) return null;
        if (w.length() > 255) throw OrgException.invalid("website", "must be at most 255 characters");
        try {
            URI u = new URI(w);
            boolean ok = ("https".equalsIgnoreCase(u.getScheme()) || "http".equalsIgnoreCase(u.getScheme())) && u.getHost() != null;
            if (!ok) throw OrgException.invalid("website", "must be an http(s) address");
        } catch (URISyntaxException e) {
            throw OrgException.invalid("website", "must be an http(s) address");
        }
        SensitiveContent.check("website", "website", w);
        return w;
    }

    private static String cleanSizeBand(String raw) {
        if (raw == null || raw.isBlank()) return null;
        String band = raw.strip().toUpperCase(Locale.ROOT);
        if (!SIZE_BANDS.contains(band)) throw OrgException.invalid("sizeBand", "must be one of " + String.join(", ", new java.util.TreeSet<>(SIZE_BANDS)));
        return band;
    }

    private static String cleanCountry(String raw) {
        if (raw == null || raw.isBlank()) return null;
        String c = raw.strip().toUpperCase(Locale.ROOT);
        if (!COUNTRIES.contains(c)) throw OrgException.invalid("country", "must be an ISO 3166 two-letter code");
        return c;
    }

    private static String cleanTimezone(String raw) {
        String tz = raw.strip();
        if (!ZoneId.getAvailableZoneIds().contains(tz)) throw OrgException.invalid("timezone", "must be an IANA time zone such as America/New_York");
        return tz;
    }

    private static String cleanEmail(String raw) {
        String e = raw.strip().toLowerCase(Locale.ROOT);
        if (e.isEmpty()) return null;
        if (e.length() > 254 || !EMAIL.matcher(e).matches()) throw OrgException.invalid("billingEmail", "must be an email address");
        return e;
    }
}
