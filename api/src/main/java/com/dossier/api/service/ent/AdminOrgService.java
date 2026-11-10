package com.dossier.api.service.ent;

import com.dossier.api.domain.User;
import com.dossier.api.domain.ent.OrgHostname;
import com.dossier.api.domain.enumeration.OrgHostnameStatus;
import com.dossier.api.domain.enumeration.OrgAccountMode;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.domain.enumeration.OrgType;
import com.dossier.api.domain.org.OrgAuditEvent;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.ent.AdminOrgQueryRepository;
import com.dossier.api.repository.ent.OrgHostnameRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.security.SecurityUtils;
import com.dossier.api.service.AccountScopes;
import com.dossier.api.service.AdminAuditService;
import com.dossier.api.service.UserService;
import com.dossier.api.service.ResumeBuilderSettingKeys;
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.dto.AdminOrgDTOs.AuditRow;
import com.dossier.api.service.dto.AdminOrgDTOs.Created;
import com.dossier.api.service.dto.AdminOrgDTOs.ResetResult;
import com.dossier.api.service.dto.AdminOrgDTOs.CreateRequest;
import com.dossier.api.service.dto.AdminOrgDTOs.Detail;
import com.dossier.api.service.dto.AdminOrgDTOs.Enterprise;
import com.dossier.api.service.dto.AdminOrgDTOs.Hostname;
import com.dossier.api.service.dto.AdminOrgDTOs.LabelCheck;
import com.dossier.api.service.dto.AdminOrgDTOs.Module;
import com.dossier.api.service.dto.AdminOrgDTOs.OrgRow;
import com.dossier.api.service.dto.AdminOrgDTOs.Summary;
import com.dossier.api.service.dto.org.OrgSettings;
import com.dossier.api.service.org.OrgAuditService;
import com.dossier.api.service.org.OrgException;
import com.dossier.api.service.org.OrgNotFoundException;
import com.dossier.api.service.org.OrgRules;
import com.dossier.api.service.org.OrgService;
import com.dossier.api.service.privacy.SensitiveContent;
import com.dossier.api.service.org.OrgSlugs;
import com.dossier.api.service.settings.EnterpriseSettingKeys;
import com.dossier.api.service.settings.SettingsException;
import com.dossier.api.service.settings.SettingsService;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Pattern;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/**
 * The platform admin's Organizations page (X1.11): list and open organizations, provision a subdomain, turn enterprise on or off
 * for one organization, suspend or resume a hostname, and create an organization with its owner invited. Every caller has passed
 * {@code ROLE_ADMIN}. The tenancy writes themselves live in {@link OrgTenancyService}; the flag edit goes through
 * {@link SettingsService} (so {@code app_setting_history} holds the reason and the tenant cache is evicted).
 *
 * <p>Every mutation writes exactly one {@code admin_audit_event} (action {@code ORG_*}, target {@code ORG:<id>}) and exactly one
 * {@code org_audit_event} in the organization's own trail ({@code ADMIN_*}, risk HIGH, actor = the admin's login), in the same
 * transaction. The enterprise switch also leaves the generic {@code SETTING_CHANGE} row {@link SettingsService} writes for the flag.
 * Details never carry an email address or any member data.
 */
@Service
public class AdminOrgService {

    private static final Pattern EMAIL = Pattern.compile("^[^@\\s<>,;\"']+@[^@\\s<>,;\"']+\\.[^@\\s<>,;\"']+$");
    private static final int AUDIT_TAIL = 30;

    /** The enterprise modules a platform admin switches per organization: wire key, flag key, label. Only live flags (declared, offered in admin) appear. */
    private record ModuleDef(String key, String flag, String label) {}

    private static final List<ModuleDef> MODULES = List.of(
        new ModuleDef("roles", EnterpriseSettingKeys.FLAG_ROLES, "Roles and permissions"),
        new ModuleDef("marketing", EnterpriseSettingKeys.FLAG_MARKETING, "Talent marketing"),
        new ModuleDef("consultant_jobs", EnterpriseSettingKeys.FLAG_CONSULTANT_JOBS, "Consultant assigned jobs"),
        new ModuleDef("domains", EnterpriseSettingKeys.FLAG_DOMAINS, "Custom domains")
    );

    private final AdminOrgQueryRepository query;
    private final OrganizationRepository organizations;
    private final OrgHostnameRepository hostnames;
    private final OrgTenancyService tenancy;
    private final EnterpriseFeatureFlag flag;
    private final SettingsService settings;
    private final ResumeBuilderSettings resumeSettings;
    private final AdminAuditService adminAudit;
    private final OrgAuditService orgAudit;
    private final TenantUrls tenantUrls;
    private final UserRepository users;
    private final OrgMemberRepository members;
    private final OrgRoleService roles;
    private final UserService userService;
    private final AccountOnboardingNotices notices;
    private final ObjectMapper mapper;
    private final AccountScopes accountScopes;

    public AdminOrgService(
        AdminOrgQueryRepository query,
        OrganizationRepository organizations,
        OrgHostnameRepository hostnames,
        OrgTenancyService tenancy,
        EnterpriseFeatureFlag flag,
        SettingsService settings,
        ResumeBuilderSettings resumeSettings,
        AdminAuditService adminAudit,
        OrgAuditService orgAudit,
        TenantUrls tenantUrls,
        UserRepository users,
        OrgMemberRepository members,
        OrgRoleService roles,
        UserService userService,
        AccountOnboardingNotices notices,
        ObjectMapper mapper,
        AccountScopes accountScopes
    ) {
        this.query = query;
        this.organizations = organizations;
        this.hostnames = hostnames;
        this.tenancy = tenancy;
        this.flag = flag;
        this.settings = settings;
        this.resumeSettings = resumeSettings;
        this.adminAudit = adminAudit;
        this.orgAudit = orgAudit;
        this.tenantUrls = tenantUrls;
        this.users = users;
        this.members = members;
        this.roles = roles;
        this.userService = userService;
        this.notices = notices;
        this.mapper = mapper;
        this.accountScopes = accountScopes;
    }

    // ---- reads ------------------------------------------------------------------------------------------------------------

    @Transactional(readOnly = true)
    public Page<OrgRow> list(String search, String status, String type, Boolean enterprise, Pageable pageable) {
        AdminOrgQueryRepository.Filter filter = new AdminOrgQueryRepository.Filter(search, parseEnum(OrgStatus.class, status, "status"), parseEnum(OrgType.class, type, "type"));
        List<Organization> all = query.find(filter);
        if (enterprise != null) all = all.stream().filter(o -> flag.isEnabled(o.getId()) == enterprise).toList();
        int from = (int) Math.min(pageable.getOffset(), all.size());
        int to = Math.min(from + pageable.getPageSize(), all.size());
        List<Organization> slice = all.subList(from, to);
        List<Long> ids = slice.stream().map(Organization::getId).toList();
        Map<Long, Long> memberCounts = query.activeMemberCounts(ids);
        Map<Long, Long> hostCounts = query.activeHostnameCounts(ids);
        List<OrgRow> rows = new ArrayList<>();
        for (Organization o : slice) {
            String host = hostnames.findPrimaryByOrgId(o.getId()).map(OrgHostname::getHostname).orElse(null);
            rows.add(new OrgRow(o.getId(), o.getName(), o.getSlug(), o.getType().name(), o.getStatus().name(), o.getSubdomain(), o.isSubdomainEnabled(), flag.isEnabled(o.getId()), host, hostCounts.getOrDefault(o.getId(), 0L), memberCounts.getOrDefault(o.getId(), 0L), o.getCreatedAt()));
        }
        return new PageImpl<>(rows, pageable, all.size());
    }

    @Transactional(readOnly = true)
    public Summary summary() {
        long on = query.allIds().stream().filter(flag::isEnabled).count();
        return new Summary(query.countOrganizations(), on, query.countActiveHostnames(), query.countAwaitingHostname());
    }

    @Transactional(readOnly = true)
    public Detail detail(Long orgId) {
        Organization o = organizations.findByOrgId(orgId).orElseThrow(OrgNotFoundException::new);
        EnterpriseAllowList.State state = flagState();
        Enterprise enterprise = new Enterprise(flag.isEnabled(orgId), state.allow().contains(orgId), state.deny().contains(orgId), flag.isEnabled());
        List<Hostname> hosts = hostnames
            .findByOrgIdOrderByCreatedAt(orgId)
            .stream()
            .map(h -> new Hostname(h.getId(), h.getHostname(), h.getKind().name(), h.getStatus().name(), h.isPrimary(), h.getCertState() == null ? null : h.getCertState().name(), h.getActivatedAt(), h.getSuspendedAt(), h.getCreatedAt()))
            .toList();
        List<AuditRow> audit = query.adminAuditTail(orgId, AUDIT_TAIL).stream().map(AdminOrgService::auditRow).toList();
        return new Detail(
            o.getId(), o.getName(), o.getDisplayName(), o.getSlug(), o.getType().name(), o.getStatus().name(), o.getAccountMode().name(), o.getSizeBand(), o.getCountry(), o.getSubdomain(), o.isSubdomainEnabled(), o.getConfigVersion(), o.getCreatedAt(),
            query.countActiveMembers(orgId), query.countPendingInvites(orgId), tenantUrls.provisioningBaseDomain(), enterprise, modules(orgId), hosts, audit
        );
    }

    /** The provision dialog's live answer: is {@code rawLabel} usable (for {@code orgId}, or for a new organization when null)? Never throws for a bad label. */
    @Transactional(readOnly = true)
    public LabelCheck checkLabel(Long orgId, String rawLabel) {
        String label = rawLabel == null ? "" : rawLabel.strip().toLowerCase(Locale.ROOT);
        boolean wellFormed = OrgSubdomains.isWellFormed(label);
        boolean reserved = wellFormed && OrgSubdomains.isReserved(label);
        boolean taken = wellFormed && !reserved && !tenancy.isLabelFree(label, orgId);
        String base = tenantUrls.provisioningBaseDomain();
        String suggestion = taken || reserved ? tenancy.suggestFree(label.isEmpty() ? "org-team" : label) : null;
        return new LabelCheck(label, wellFormed && !reserved && !taken, reserved, taken, suggestion, wellFormed && base != null ? label + "." + base : null);
    }

    // ---- mutations --------------------------------------------------------------------------------------------------------

    @Transactional
    public Detail provisionSubdomain(Long orgId, String rawLabel) {
        organizations.findByOrgId(orgId).orElseThrow(OrgNotFoundException::new);
        String label = OrgSubdomains.requireValid(rawLabel);
        OrgTenancyService.Provisioned p = tenancy.provisionSubdomain(orgId, label, hostFor(label));
        String details = "host=" + p.hostname().getHostname() + " configVersion=" + p.org().getConfigVersion();
        record(orgId, AdminAuditService.ORG_SUBDOMAIN_PROVISION, OrgAuditService.ADMIN_SUBDOMAIN_PROVISION, null, details, p.hostname().getId());
        return detail(orgId);
    }

    @Transactional
    public Detail setEnterprise(Long orgId, boolean on, String rawReason) {
        organizations.findByOrgId(orgId).orElseThrow(OrgNotFoundException::new);
        String reason = requireReason(rawReason);
        EnterpriseAllowList.State before = flagState();
        EnterpriseAllowList.State after = on ? EnterpriseAllowList.turnOn(before, orgId) : EnterpriseAllowList.turnOff(before, orgId);
        settings.set(EnterpriseSettingKeys.FLAG_ENTERPRISE, after.toJson(), reason);
        String details = (on ? "on" : "off") + " masterOn=" + after.on() + " allow=" + after.allow().size() + " deny=" + after.deny().size();
        record(orgId, AdminAuditService.ORG_ENTERPRISE_SET, on ? OrgAuditService.ADMIN_ENTERPRISE_ON : OrgAuditService.ADMIN_ENTERPRISE_OFF, reason, details, null);
        return detail(orgId);
    }

    /** Turns one enterprise module on or off for the organization (its flag's allow list), with a reason, audited like the master switch. */
    @Transactional
    public Detail setModule(Long orgId, String key, boolean on, String rawReason) {
        organizations.findByOrgId(orgId).orElseThrow(OrgNotFoundException::new);
        ModuleDef def = MODULES.stream().filter(m -> m.key().equals(key)).findFirst().orElseThrow(() -> OrgException.invalid("key", "is not a module"));
        String reason = requireReason(rawReason);
        EnterpriseAllowList.State before = flagState(def.flag());
        EnterpriseAllowList.State after = on ? EnterpriseAllowList.turnOn(before, orgId) : EnterpriseAllowList.turnOff(before, orgId);
        settings.set(def.flag(), after.toJson(), reason);
        record(orgId, AdminAuditService.ORG_MODULE_SET, on ? OrgAuditService.ADMIN_MODULE_ON : OrgAuditService.ADMIN_MODULE_OFF, reason, "module=" + def.key() + " " + (on ? "on" : "off") + " allow=" + after.allow().size(), null);
        return detail(orgId);
    }

    private List<Module> modules(Long orgId) {
        List<Module> out = new ArrayList<>();
        for (ModuleDef m : MODULES) {
            out.add(new Module(m.key(), m.label(), flag.isEnabled(m.flag(), orgId), flagState(m.flag()).allow().contains(orgId)));
        }
        return out;
    }

    @Transactional
    public Detail suspendHostname(Long orgId, Long hostnameId, String rawReason) {
        String reason = requireReason(rawReason);
        OrgHostname h = tenancy.suspendHostname(orgId, hostnameId);
        record(orgId, AdminAuditService.ORG_HOSTNAME_SUSPEND, OrgAuditService.ADMIN_HOSTNAME_SUSPEND, reason, "host=" + h.getHostname(), h.getId());
        return detail(orgId);
    }

    @Transactional
    public Detail resumeHostname(Long orgId, Long hostnameId, String rawReason) {
        String reason = requireReason(rawReason);
        OrgHostname h = tenancy.resumeHostname(orgId, hostnameId);
        record(orgId, AdminAuditService.ORG_HOSTNAME_RESUME, OrgAuditService.ADMIN_HOSTNAME_RESUME, reason, "host=" + h.getHostname(), h.getId());
        return detail(orgId);
    }

    /**
     * Creates an ACTIVE organization (the platform admin vouches for it; the setup fee and licences attach later in the billing
     * story), gives it {@code label}.kiwiply.com and onboards its OWNER directly, with no email. While separate accounts are in force
     * (decision O4: {@code enterprise.separate_accounts} on) the organization is created SEPARATE and the owner is ALWAYS a NEW enterprise
     * account of this organization: a personal account with the same address is never read, attached, changed or revealed. With the
     * switch off (legacy): if a Kiwiply account already exists for {@code ownerEmail} it is attached as OWNER and its password is not
     * touched. Either way a new account is activated with a SERVER-GENERATED temporary password that must be changed on first sign-in and expires after
     * {@code org.tempPassword.expiryDays}. The clear-text password is returned ONCE, here, and is never stored, logged or audited
     * (the audit rows carry the owner's address and whether the account was created, nothing else).
     */
    @Transactional
    public Created create(CreateRequest req) {
        if (req == null) throw OrgException.invalid("body", "is required");
        String adminLogin = SecurityUtils.getCurrentUserLogin().orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "No authenticated user"));
        User admin = users.findOneByLogin(adminLogin).orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "No authenticated user"));
        String name = OrgService.cleanName(req.name());
        OrgType type = parseEnum(OrgType.class, req.type(), "type");
        if (type == null) throw OrgException.invalid("type", "is required");
        OrgRules.requireAssignable(type);
        String email = req.ownerEmail() == null ? "" : req.ownerEmail().strip().toLowerCase(Locale.ROOT);
        if (email.length() > 254 || !EMAIL.matcher(email).matches()) throw OrgException.invalid("ownerEmail", "must be an email address");
        String ownerName = req.ownerName() == null || req.ownerName().isBlank() ? null : req.ownerName().strip().replaceAll("\\s+", " ").replaceAll("\\p{Cntrl}", "");
        if (ownerName != null && ownerName.length() > 100) throw OrgException.invalid("ownerName", "must be at most 100 characters");
        SensitiveContent.check("ownerName", "name", ownerName == null ? "" : ownerName);

        String label = OrgSubdomains.requireValid(req.label() == null || req.label().isBlank() ? OrgSlugs.derive(name) : req.label());
        if (!OrgSlugs.isWellFormed(label)) throw OrgException.invalid("label", "must be 3 to 60 lower-case letters, digits or single dashes");
        if (organizations.existsBySlug(label) || !tenancy.isLabelFree(label, null)) throw OrgException.slugTaken(label, suggestLabel(label));

        Organization org = new Organization();
        org.setName(name);
        org.setDisplayName(name);
        org.setType(type);
        org.setSlug(label);
        org.setStatus(OrgStatus.ACTIVE);
        org.setCreatedByUserId(admin.getId());
        boolean separate = accountScopes.separateAccountsEnabled(); // O4: every organization created while the switch is on has its own enterprise accounts
        org.setAccountMode(separate ? OrgAccountMode.SEPARATE : OrgAccountMode.SHARED);
        org.setSettingsJson(writeSettings());
        try {
            org = organizations.saveAndFlush(org);
        } catch (DataIntegrityViolationException e) { // lost a race for the same slug
            throw OrgException.slugTaken(label, suggestLabel(label));
        }
        Long orgId = org.getId();
        OrgTenancyService.Provisioned p = tenancy.provisionSubdomain(orgId, label, hostFor(label));

        Instant expires = tempPasswordExpiry();
        String[] names = splitName(ownerName);
        UserService.TempAccount owner = separate
            ? userService.createEnterpriseAccount(orgId, email, names[0], names[1], null, expires) // a brand-new account of THIS organization; no personal lookup
            : userService.createTempAccount(email, names[0], names[1], null, expires);
        OrgMember seat = new OrgMember();
        seat.setOrgId(orgId);
        seat.setUserId(owner.user().getId());
        seat.setRole(OrgRole.OWNER);
        seat.setStatus(OrgMemberStatus.ACTIVE);
        seat.setJoinedAt(Instant.now());
        seat = members.saveAndFlush(seat);
        roles.syncFromLegacy(seat); // the Owner role row, exactly as organization creation and the demo seeder write it

        record(orgId, AdminAuditService.ORG_CREATE, OrgAuditService.ADMIN_ORG_CREATE, null,
            "type=" + type + " slug=" + label + " host=" + p.hostname().getHostname() + " owner=" + email + " ownerAccount=" + (owner.created() ? "CREATED" : "EXISTING"), p.hostname().getId());
        notices.accountCreated(org, p.hostname().getHostname(), owner.user(), "Owner", "admin", true, owner.created(), expires, admin);
        return new Created(orgId, label, p.hostname().getHostname(), email, owner.created() ? "CREATED" : "EXISTING", owner.tempPassword(), owner.created() ? expires : null);
    }

    /**
     * Gives the owner who has not yet set their own password a NEW temporary password (shown once, the flag set again, a fresh
     * expiry). 409 {@code OWNER_ACTIVE} when the owner already chose a password (or signs in some other way): that person uses
     * "Forgot password", the platform admin never overwrites a live credential. 404 when the organization has no active owner.
     */
    @Transactional
    public ResetResult resetOwnerPassword(Long orgId, String rawReason) {
        organizations.findByOrgId(orgId).orElseThrow(OrgNotFoundException::new);
        String reason = requireReason(rawReason);
        Long ownerUserId = query.activeOwnerUserId(orgId);
        User owner = ownerUserId == null ? null : users.findById(ownerUserId).orElse(null);
        if (owner == null) throw new OrgNotFoundException();
        if (!owner.isPasswordChangeRequired()) {
            throw OrgException.coded(409, "OWNER_ACTIVE", "The owner has already set their own password. They can use Forgot password on the sign-in page.", Map.of());
        }
        Instant expires = tempPasswordExpiry();
        String temp = userService.resetTempPassword(owner, null, expires);
        record(orgId, AdminAuditService.ORG_OWNER_PASSWORD_RESET, OrgAuditService.ADMIN_OWNER_PASSWORD_RESET, reason, "owner=" + owner.getEmail(), null);
        Organization org = organizations.findByOrgId(orgId).orElseThrow(OrgNotFoundException::new);
        String host = hostnames.findPrimaryByOrgId(orgId).map(OrgHostname::getHostname).orElse(null);
        users.findOneByLogin(SecurityUtils.getCurrentUserLogin().orElse("")).ifPresentOrElse(a -> notices.passwordReset(org, host, owner, expires, a), () -> notices.passwordReset(org, host, owner, expires, null));
        return new ResetResult(owner.getEmail(), temp, expires);
    }

    private Instant tempPasswordExpiry() {
        return Instant.now().plus(Duration.ofDays(resumeSettings.getInt(ResumeBuilderSettingKeys.ORG_TEMP_PASSWORD_EXPIRY_DAYS)));
    }

    private static String[] splitName(String full) {
        if (full == null) return new String[] { null, null };
        int i = full.indexOf(' ');
        return i < 0 ? new String[] { full, null } : new String[] { full.substring(0, i), full.substring(i + 1) };
    }

    // ---- helpers ----------------------------------------------------------------------------------------------------------

    private String suggestLabel(String label) {
        return OrgSlugs.suggest(label, l -> organizations.existsBySlug(l) || !tenancy.isLabelFree(l, null));
    }

    private String hostFor(String label) {
        String base = tenantUrls.provisioningBaseDomain();
        if (base == null) throw OrgException.invalid("subdomain", "no tenant base domain is configured (enterprise.hosts.tenant_base_domains)");
        return label + "." + base;
    }

    private EnterpriseAllowList.State flagState() {
        return flagState(EnterpriseSettingKeys.FLAG_ENTERPRISE);
    }

    private EnterpriseAllowList.State flagState(String flagKey) {
        try {
            return EnterpriseAllowList.State.parse(settings.getJson(flagKey, JsonNode.class));
        } catch (RuntimeException e) {
            return EnterpriseAllowList.State.parse(null);
        }
    }

    private static String requireReason(String raw) {
        String reason = raw == null ? "" : raw.strip();
        if (reason.length() < SettingsException.REASON_MIN_LENGTH) {
            throw OrgException.invalid("reason", "a reason of at least " + SettingsException.REASON_MIN_LENGTH + " characters is required");
        }
        return reason.length() > 500 ? reason.substring(0, 500) : reason;
    }

    /** The one admin row and the one tenant row of a mutation (HIGH, actor = the admin). */
    private void record(Long orgId, String adminAction, String orgAction, String reason, String details, Long hostnameId) {
        String login = SecurityUtils.getCurrentUserLogin().orElse(OrgAuditService.SYSTEM_ACTOR);
        adminAudit.record(adminAction, AdminAuditService.TARGET_ORG, String.valueOf(orgId), reason, details);
        orgAudit.record(orgId, login, null, orgAction, OrgAuditService.TARGET_ORG, null, String.valueOf(orgId), reason == null ? details : details + " reason=" + reason, null, hostnameId, null, "HIGH");
    }

    private static AuditRow auditRow(OrgAuditEvent e) {
        return new AuditRow(e.getId(), e.getAction(), e.getActorLogin(), e.getRisk(), e.getDetails(), e.getCreatedAt());
    }

    private static <E extends Enum<E>> E parseEnum(Class<E> type, String raw, String field) {
        if (raw == null || raw.isBlank()) return null;
        try {
            return Enum.valueOf(type, raw.strip().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            throw OrgException.invalid(field, "is not a known value");
        }
    }

    private String writeSettings() {
        try {
            return mapper.writeValueAsString(OrgSettings.defaults());
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("could not serialise org settings", e);
        }
    }

}
