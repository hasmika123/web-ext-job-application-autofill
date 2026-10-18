package com.dossier.api.service.ent;

import com.dossier.api.domain.User;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.domain.ent.OrgBranding;
import com.dossier.api.domain.ent.OrgRoleDefinition;
import com.dossier.api.domain.org.DataShare;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.ent.OrgBrandingRepository;
import com.dossier.api.repository.ent.OrgHostnameRepository;
import com.dossier.api.repository.ent.OrgRoleRepository;
import com.dossier.api.repository.org.DataShareRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.security.SecurityUtils;
import com.dossier.api.service.dto.ent.MeTenantDTO;
import com.dossier.api.service.ent.WorkspaceService.NavPrefs;
import com.dossier.api.service.ent.WorkspaceService.RoleWorkspace;
import com.dossier.api.service.org.OrgAccessService;
import com.dossier.api.service.org.OrgException;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.TreeMap;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * {@code GET /api/me/tenant}: the session contract of the tenant shell (X2.2; 12-identity.md section 3, 40-api-specs.md).
 *
 * <p><b>Who may ask.</b> Only a request whose host resolved to a TENANT, with the enterprise flag on for that organization, and a
 * token minted for exactly that organization ({@code tid}); the answer is about that organization and that caller and nothing
 * else. Every other situation is the generic 404 (a platform host, an unknown host, flag off, no {@code tid}, a {@code tid} for
 * another organization, no seat, a seat that is not ACTIVE or SUSPENDED), with one deliberate exception: a SUSPENDED member
 * gets 403 {@code MEMBER_SUSPENDED} with no organization data, so the shell can say "Your access is paused" and offer sign-out.
 * The caller NEVER names an organization: it comes from the host, and a wrong token is refused before and again here.
 *
 * <p><b>What is in it.</b> See {@link MeTenantDTO}. Navigation is computed from the member's real permissions through
 * {@code AuthorizationService} ({@link WorkspaceService}); the permissions map is the union across their roles (the widest scope
 * wins); modules come from the organization's flags ({@link TenantModules}); terminology and navigation preferences are the
 * PUBLISHED branding only, never a draft.
 *
 * <p>The {@code etag} is a hash of the roles, permissions, modules and the computed workspaces: when any of them changes the
 * shell shows "Your access changed". It contains nothing guessable about another tenant.
 */
@Service
public class MeTenantService {

    private static final Logger LOG = LoggerFactory.getLogger(MeTenantService.class);
    private static final int MAX_TERMS = 50;
    private static final int MAX_TERM_LENGTH = 60;
    private static final TypeReference<Map<String, String>> STRING_MAP = new TypeReference<>() {};

    /** The response and its entity tag. */
    public record Answer(MeTenantDTO body, String etag) {}

    private final EnterpriseFeatureFlag flag;
    private final UserRepository users;
    private final OrganizationRepository organizations;
    private final OrgMemberRepository members;
    private final OrgAccessService access;
    private final OrgRoleRepository roleDefinitions;
    private final OrgBrandingRepository brandings;
    private final OrgHostnameRepository hostnames;
    private final DataShareRepository shares;
    private final TenantModules modules;
    private final WorkspaceService workspaces;
    private final ObjectMapper mapper;

    public MeTenantService(
        EnterpriseFeatureFlag flag,
        UserRepository users,
        OrganizationRepository organizations,
        OrgMemberRepository members,
        OrgAccessService access,
        OrgRoleRepository roleDefinitions,
        OrgBrandingRepository brandings,
        OrgHostnameRepository hostnames,
        DataShareRepository shares,
        TenantModules modules,
        WorkspaceService workspaces,
        ObjectMapper mapper
    ) {
        this.flag = flag;
        this.users = users;
        this.organizations = organizations;
        this.members = members;
        this.access = access;
        this.roleDefinitions = roleDefinitions;
        this.brandings = brandings;
        this.hostnames = hostnames;
        this.shares = shares;
        this.modules = modules;
        this.workspaces = workspaces;
        this.mapper = mapper;
    }

    @Transactional(readOnly = true)
    public Answer forCaller(TenantContext tenant, Long tokenTid) {
        // ---- the tenant: from the host only, and the token must be for it ------------------------------------------
        if (tenant == null || !tenant.isTenant() || tenant.orgId() == null) throw new OrgNotFoundException();
        Long orgId = tenant.orgId();
        if (tokenTid == null || !tokenTid.equals(orgId)) throw new OrgNotFoundException();
        if (!flag.isEnabled(orgId)) throw new OrgNotFoundException();

        // ---- the caller and their seat -------------------------------------------------------------------------------
        String login = SecurityUtils.getCurrentUserLogin().orElseThrow(OrgNotFoundException::new);
        User user = users.findOneByLogin(login).orElseThrow(OrgNotFoundException::new);
        List<OrgMember> seats = members.findByOrgIdAndUserIdAndStatusIn(orgId, user.getId(), List.of(OrgMemberStatus.ACTIVE, OrgMemberStatus.SUSPENDED));
        if (seats.isEmpty()) throw new OrgNotFoundException(); // never a member, INVITED, LEFT, REMOVED: the same 404 as a foreign organization
        OrgMember seat = seats.stream().filter(s -> s.getStatus() == OrgMemberStatus.ACTIVE).findFirst().orElse(seats.get(0));
        if (seat.getStatus() == OrgMemberStatus.SUSPENDED) {
            throw OrgException.coded(403, "MEMBER_SUSPENDED", "Your access to this workspace is paused", Map.of());
        }
        Organization org = organizations.findByOrgId(orgId).orElseThrow(OrgNotFoundException::new);
        OrgMembership me = access.resolve(orgId).orElseThrow(OrgNotFoundException::new);

        // ---- the parts -----------------------------------------------------------------------------------------------
        OrgBranding published = brandings.findByOrgId(orgId).filter(b -> b.getPublishedAt() != null).orElse(null);
        NavPrefs prefs = published == null ? NavPrefs.NONE : workspaces.parsePrefs(published.getNavPrefsJson());
        Map<String, Boolean> moduleMap = modules.forOrg(orgId);
        List<RoleWorkspace> roleWorkspaces = roleWorkspaces(orgId, me);
        WorkspaceService.Result computed = workspaces.compute(me, roleWorkspaces, moduleMap, tenant, tokenTid, prefs, seat.getLandingWorkspace());

        Map<String, String> permissions = new TreeMap<>();
        me.grants().forEach((k, v) -> permissions.put(k, v.name()));
        List<MeTenantDTO.Role> roles = new ArrayList<>();
        for (int i = 0; i < me.roles().size(); i++) {
            OrgMembership.RoleRef r = me.roles().get(i);
            roles.add(new MeTenantDTO.Role(r.roleId(), r.key(), r.name(), r.primary(), roleWorkspaces.get(i).workspaceKey()));
        }
        boolean pastDue = org.getStatus() == OrgStatus.PAST_DUE;
        MeTenantDTO dto = new MeTenantDTO(
            new MeTenantDTO.Org(
                org.getId(), displayName(org), org.getStatus().name(), org.getType() == null ? null : org.getType().name(), primaryHost(orgId, tenant),
                terminology(published == null ? null : published.getTerminologyJson()),
                new MeTenantDTO.Flags(pastDue, pastDue && me.canKey("billing.manage"), prefs.greeting())
            ),
            new MeTenantDTO.Member(seat.getId(), seat.getStatus().name(), null, null, null, null, seat.getJoinedAt()),
            new MeTenantDTO.Person(name(user), user.getEmail(), user.getImageUrl()),
            List.copyOf(roles),
            permissions,
            moduleMap,
            computed.workspaces(),
            computed.landingHome(),
            computed.landingKey() == null ? null : computed.workspaces().stream().filter(w -> computed.landingKey().equals(w.workspaceKey())).map(MeTenantDTO.Workspace::key).findFirst().orElse(null),
            consent(orgId, seat.getId()),
            new MeTenantDTO.Features(List.of(), true) // X5.6 replaces this: licensed = entitlementsOf(member) for CONSULTANT members
        );
        return new Answer(dto, etag(dto));
    }

    /** Each role of the seat with the workspace it opens: the role row's own, else its template's, else (a legacy seat) the template the enum mirrors to. */
    private List<RoleWorkspace> roleWorkspaces(Long orgId, OrgMembership me) {
        List<Long> ids = me.roles().stream().map(OrgMembership.RoleRef::roleId).filter(Objects::nonNull).toList();
        Map<Long, OrgRoleDefinition> defs = ids.isEmpty()
            ? Map.of()
            : roleDefinitions.findVisibleByOrgIdAndIdIn(orgId, ids).stream().collect(Collectors.toMap(OrgRoleDefinition::getId, d -> d, (a, b) -> a));
        List<RoleWorkspace> out = new ArrayList<>();
        for (OrgMembership.RoleRef r : me.roles()) {
            String workspaceKey = null;
            OrgRoleDefinition def = r.roleId() == null ? null : defs.get(r.roleId());
            if (def != null) {
                workspaceKey = def.getWorkspaceKey();
                if (workspaceKey == null && def.getTemplateKey() != null) workspaceKey = RoleTemplates.find(def.getTemplateKey()).map(RoleTemplates.Template::workspaceKey).orElse(null);
            } else if (r.roleId() == null) {
                workspaceKey = LegacyRoleMirror.toTemplateKey(me.role()).flatMap(RoleTemplates::find).map(RoleTemplates.Template::workspaceKey).orElse(null);
            }
            out.add(new RoleWorkspace(r.key(), r.primary(), workspaceKey));
        }
        return out;
    }

    private String primaryHost(Long orgId, TenantContext tenant) {
        return hostnames.findPrimaryByOrgId(orgId).map(h -> h.getHostname()).orElse(tenant.host());
    }

    private static String displayName(Organization org) {
        return org.getDisplayName() != null && !org.getDisplayName().isBlank() ? org.getDisplayName() : org.getName();
    }

    /** Name as the basic profile shows it: first and last, else the login (never the email-as-login of a stranger: this is the caller). */
    private static String name(User u) {
        String full = ((u.getFirstName() == null ? "" : u.getFirstName()) + " " + (u.getLastName() == null ? "" : u.getLastName())).trim();
        return full.isEmpty() ? u.getLogin() : full;
    }

    private MeTenantDTO.Consent consent(Long orgId, Long memberId) {
        Optional<DataShare> share = shares.findByOrgIdAndMemberId(orgId, memberId);
        return share.map(s -> new MeTenantDTO.Consent(s.getScope().name(), s.getFullToMemberId())).orElse(new MeTenantDTO.Consent("NONE", null));
    }

    /** Published label overrides, defensively (the same limits as the public tenant DTO). */
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

    /** Quoted strong validator: hash of roles, permissions, modules and the computed workspaces (keys and nav keys) and landing. */
    static String etag(MeTenantDTO dto) {
        StringBuilder s = new StringBuilder();
        dto.roles().forEach(r -> s.append("r:").append(r.key()).append(r.isPrimary() ? "*" : "").append('|'));
        new TreeMap<>(dto.permissions()).forEach((k, v) -> s.append("p:").append(k).append('=').append(v).append('|'));
        new TreeMap<>(dto.modules()).forEach((k, v) -> s.append("m:").append(k).append('=').append(v).append('|'));
        dto.workspaces().forEach(w -> {
            s.append("w:").append(w.key()).append('[');
            w.nav().forEach(n -> s.append(n.key()).append(','));
            s.append("]|");
        });
        s.append("l:").append(dto.landing()).append('|').append("o:").append(dto.org().status());
        try {
            byte[] hash = MessageDigest.getInstance("SHA-256").digest(s.toString().getBytes(StandardCharsets.UTF_8));
            return "\"" + HexFormat.of().formatHex(hash, 0, 12) + "\"";
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
