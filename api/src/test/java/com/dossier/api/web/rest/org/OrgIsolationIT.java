package com.dossier.api.web.rest.org;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.AppSetting;
import com.dossier.api.domain.ent.OrgBranding;
import com.dossier.api.domain.ent.OrgBrandingVersion;
import com.dossier.api.domain.enumeration.OrgGroupKind;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgPermission;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.domain.enumeration.ShareScope;
import com.dossier.api.domain.org.OrgAuditEvent;
import com.dossier.api.domain.org.OrgDomain;
import com.dossier.api.domain.org.OrgGroup;
import com.dossier.api.domain.org.OrgInviteBatch;
import com.dossier.api.domain.org.OrgJoinCode;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.AppSettingRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.ent.OrgBrandingRepository;
import com.dossier.api.repository.ent.OrgBrandingVersionRepository;
import com.dossier.api.repository.org.DataShareEventRepository;
import com.dossier.api.repository.org.DataShareRepository;
import com.dossier.api.repository.org.OrgAuditEventRepository;
import com.dossier.api.repository.org.OrgDomainRepository;
import com.dossier.api.repository.org.OrgGroupRepository;
import com.dossier.api.repository.org.OrgInviteBatchRepository;
import com.dossier.api.repository.org.OrgJoinCodeRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.org.DataShareService;
import com.dossier.api.service.org.DataShareService.ShareContext;
import com.dossier.api.service.org.OrgAuditService;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgShareConsent;
import com.dossier.api.service.org.ShareField;
import com.dossier.api.service.resume.OrgResumeSharing;
import com.dossier.api.service.settings.EnterpriseSettingKeys;
import jakarta.persistence.EntityManager;
import java.lang.reflect.Method;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.EnumMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.TreeSet;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.config.BeanDefinition;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.context.annotation.ClassPathScanningCandidateComponentProvider;
import org.springframework.core.type.filter.AssignableTypeFilter;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.repository.Repository;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.servlet.mvc.method.RequestMappingInfo;
import org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping;

/**
 * O1.5, the tenancy gate (docs/design/org/tenant-model.md section 7; ROADMAP 21.0): one org must never be able to see
 * or change another's anything, and a member's consent bounds what even their own org's staff can read. It runs in CI's
 * {@code integrationTest}; nothing under {@code (org)} merges while it is red.
 *
 * <p><b>Discovery, not a hand-written list.</b> Every {@code /api/orgs/{orgId}/**} route is found through the real
 * {@link RequestMappingHandlerMapping}. Each one must also be listed in {@link #COVERAGE} with a body to attack it with
 * and the audit action a legitimate call writes; a route that is mapped but not listed fails
 * {@link #everyOrgRouteIsListedInTheCoverageRegistry} with the line to add, and a route that is listed but gone fails it
 * too. The same goes for repositories ({@link #REPOSITORY_CHECKS}): a method added to a {@code repository.org} interface
 * fails {@link #everyOrgRepositoryMethodIsExercisedAcrossTenants} until a cross-tenant check names it.
 *
 * <p><b>What is asserted.</b> Org A (owner, admin, staff, member, marketer, finance, plus a suspended, an invited and a
 * departed seat; one row of every org table) and org B (owner, member). Every route is called with A's ids by: B's
 * owner, a platform {@code ROLE_ADMIN} who belongs to no org, a person with no org at all, A's own non-active seats, and
 * every role of A that lacks the permission the route needs. Also by B's owner against HIS OWN org id with A's row ids.
 * Each answer is the same generic 404 (never 403, never a hint), and afterwards nothing of A has changed: not a row, not
 * an audit line, not a share. Legitimate calls are made in separate worlds, and each mutating route is asserted to write
 * exactly one audit row.
 */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
class OrgIsolationIT {

    // ---- the coverage registry: add a line here when you add an org route ------------------------------------------

    /** How to attack a route, and what a legitimate call by the org's owner must do. */
    private record Case(String body, int legitStatus, String auditAction, boolean multipart) {
        static Case read() {
            return new Case(null, 200, null, false);
        }

        static Case write(String body, int status, String action) {
            return new Case(body, status, action, false);
        }

        /** A multipart upload (field "file", a small valid PNG) instead of a JSON body. */
        static Case upload(int status, String action) {
            return new Case(null, status, action, true);
        }
    }

    /**
     * Every {@code /api/orgs/{orgId}/**} route, as {@code "METHOD pattern"}. A new org endpoint is NOT covered until it
     * has a line here, and {@link #everyOrgRouteIsListedInTheCoverageRegistry} fails until it does.
     */
    private static final Map<String, Case> COVERAGE = new TreeMap<>(Map.ofEntries(
        Map.entry("GET /api/orgs/{orgId}", Case.read()),
        Map.entry("PATCH /api/orgs/{orgId}", Case.write("{\"name\":\"Hijacked\"}", 200, OrgAuditService.ORG_SETTINGS)),
        Map.entry("POST /api/orgs/{orgId}/close", Case.write(null, 200, OrgAuditService.ORG_CLOSE)),
        Map.entry("GET /api/orgs/{orgId}/groups", Case.read()),
        Map.entry("POST /api/orgs/{orgId}/groups", Case.write("{\"name\":\"Hijack\"}", 201, OrgAuditService.GROUP_CREATE)),
        Map.entry("PATCH /api/orgs/{orgId}/groups/{groupId}", Case.write("{\"name\":\"Hijack\"}", 200, OrgAuditService.GROUP_UPDATE)),
        Map.entry("DELETE /api/orgs/{orgId}/groups/{groupId}", Case.write(null, 204, OrgAuditService.GROUP_DELETE)),
        Map.entry("GET /api/orgs/{orgId}/roles", Case.read()),
        // Enterprise V2 X2.5: branding. Draft edits, discards and removing an absent asset write no audit row (by design).
        Map.entry("GET /api/orgs/{orgId}/branding", Case.read()),
        Map.entry("GET /api/orgs/{orgId}/branding/preview-theme", Case.read()),
        Map.entry("PATCH /api/orgs/{orgId}/branding/draft", Case.write("{\"welcomeTitle\":\"Hijacked\"}", 200, null)),
        Map.entry("POST /api/orgs/{orgId}/branding/publish", Case.write(null, 200, OrgAuditService.BRANDING_PUBLISH)),
        Map.entry("POST /api/orgs/{orgId}/branding/discard", Case.write(null, 200, null)),
        Map.entry("POST /api/orgs/{orgId}/branding/versions/{versionNo}/restore", Case.write(null, 200, OrgAuditService.BRANDING_RESTORE)),
        Map.entry("POST /api/orgs/{orgId}/branding/assets/{kind}", Case.upload(200, OrgAuditService.BRANDING_ASSET)),
        Map.entry("DELETE /api/orgs/{orgId}/branding/assets/{kind}", Case.write(null, 200, null)),
        Map.entry("POST /api/orgs/{orgId}/members/invite", Case.write("{\"emails\":[\"newcomer@example.org\"],\"role\":\"MEMBER\"}", 200, OrgAuditService.MEMBER_INVITE)),
        Map.entry("POST /api/orgs/{orgId}/members/{memberId}/resend", Case.write(null, 200, OrgAuditService.MEMBER_INVITE_RESEND)),
        // Enterprise V2 X1.15: the Invitations page. The bulk bodies name an id that is nobody's, so a legitimate call changes nothing
        // (their real behaviour is in OrgInvitationResourceIT).
        Map.entry("GET /api/orgs/{orgId}/invitations", Case.read()),
        Map.entry("GET /api/orgs/{orgId}/invitations/counts", Case.read()),
        Map.entry("GET /api/orgs/{orgId}/invitations/activity", Case.read()),
        Map.entry("POST /api/orgs/{orgId}/invitations", Case.write("{\"emails\":[\"newcomer2@example.org\"],\"role\":\"MEMBER\"}", 200, OrgAuditService.MEMBER_INVITE)),
        Map.entry("POST /api/orgs/{orgId}/invitations/{invitationId}/resend", Case.write(null, 200, OrgAuditService.MEMBER_INVITE_RESEND)),
        Map.entry("POST /api/orgs/{orgId}/invitations/{invitationId}/revoke", Case.write(null, 204, OrgAuditService.MEMBER_INVITE_REVOKE)),
        Map.entry("POST /api/orgs/{orgId}/invitations/bulk/resend", Case.write("{\"ids\":[1]}", 200, null)),
        Map.entry("POST /api/orgs/{orgId}/invitations/bulk/revoke", Case.write("{\"ids\":[1]}", 200, null))
    ));

    // ---- wiring ---------------------------------------------------------------------------------------------------

    @Autowired private MockMvc mockMvc;
    @Autowired @Qualifier("requestMappingHandlerMapping") private RequestMappingHandlerMapping mapping;
    @Autowired private EntityManager em;
    @Autowired private UserRepository users;
    @Autowired private OrganizationRepository orgs;
    @Autowired private OrgMemberRepository members;
    @Autowired private OrgGroupRepository groups;
    @Autowired private OrgInviteBatchRepository batches;
    @Autowired private OrgJoinCodeRepository codes;
    @Autowired private OrgDomainRepository domains;
    @Autowired private OrgAuditEventRepository audit;
    @Autowired private DataShareRepository shares;
    @Autowired private DataShareEventRepository shareEvents;
    @Autowired private DataShareService dataShare;
    @Autowired private OrgResumeSharing resumeSharing;
    @Autowired private AppSettingRepository settingRows;
    @Autowired private ResumeBuilderSettings settingsCache;

    private static final String FLAG_WRITER = "isolation-it";

    /**
     * Enterprise V2 routes (the roles API, X1.6) exist only behind their flags, which ship off. The gate must be proven with the
     * routes REACHABLE, so every test here runs with the master and roles flags on: a route that was only "protected" by being
     * switched off would otherwise pass the hostile-caller test for the wrong reason.
     */
    @BeforeEach
    void enterpriseFlagsOn() {
        settingRows.save(new AppSetting(EnterpriseSettingKeys.FLAG_ENTERPRISE, "{\"on\":true}", FLAG_WRITER, Instant.now()));
        settingRows.save(new AppSetting(EnterpriseSettingKeys.FLAG_ROLES, "{\"on\":true}", FLAG_WRITER, Instant.now()));
        settingsCache.invalidate();
    }

    @AfterEach
    void enterpriseFlagsOff() {
        for (AppSetting row : settingRows.findAll()) if (FLAG_WRITER.equals(row.getUpdatedBy())) settingRows.delete(row);
        settingsCache.invalidate();
    }
    @Autowired private OrgBrandingRepository brandings;
    @Autowired private OrgBrandingVersionRepository brandingVersions;

    private OrgFixtures fx;

    // ---- the two tenants ------------------------------------------------------------------------------------------

    /** One org with a person in every role and one row of every org table. */
    private final class World {
        final String p;
        final Organization org;
        final OrgMember owner, admin, staff, member, marketer, finance, suspended, invited, left, pending;
        final OrgGroup group;
        final OrgInviteBatch batch;
        final OrgJoinCode code;
        final OrgDomain domain;
        final OrgAuditEvent auditRow;
        int brandingVersionNo;

        World(String prefix, boolean everyRole) {
            this.p = prefix;
            org = fx.org(prefix, OrgStatus.ACTIVE);
            owner = fx.active(org, prefix + "-owner", OrgRole.OWNER);
            member = fx.active(org, prefix + "-member", OrgRole.MEMBER);
            if (everyRole) {
                admin = fx.active(org, prefix + "-admin", OrgRole.ADMIN);
                staff = fx.active(org, prefix + "-staff", OrgRole.STAFF);
                marketer = fx.active(org, prefix + "-marketer", OrgRole.MARKETER);
                finance = fx.active(org, prefix + "-finance", OrgRole.FINANCE);
                suspended = fx.seat(org, prefix + "-suspended", OrgRole.ADMIN, OrgMemberStatus.SUSPENDED);
                invited = fx.seat(org, prefix + "-invited", OrgRole.ADMIN, OrgMemberStatus.INVITED);
                left = fx.seat(org, prefix + "-left", OrgRole.OWNER, OrgMemberStatus.LEFT);
            } else {
                admin = staff = marketer = finance = suspended = invited = left = null;
            }

            OrgMember p = new OrgMember(); // a person invited by email who has not answered: owns a (hashed) token
            p.setOrgId(org.getId());
            p.setRole(OrgRole.MEMBER);
            p.setStatus(OrgMemberStatus.INVITED);
            p.setInviteEmail(prefix + "-pending@example.org");
            p.setInviteTokenHash(com.dossier.api.service.org.InviteTokens.hash(com.dossier.api.service.org.InviteTokens.newToken()));
            p.setInviteExpiresAt(java.time.Instant.now().plus(java.time.Duration.ofDays(14)));
            p.setInviteSentAt(java.time.Instant.now());
            pending = members.saveAndFlush(p);

            OrgGroup g = new OrgGroup();
            g.setOrgId(org.getId());
            g.setName(prefix + " cohort");
            g.setKind(OrgGroupKind.COHORT);
            group = groups.saveAndFlush(g);

            OrgInviteBatch b = new OrgInviteBatch();
            b.setOrgId(org.getId());
            b.setSource("CSV");
            b.setFileName(prefix + ".csv");
            b.setRowCount(3);
            batch = batches.save(b);

            OrgJoinCode c = new OrgJoinCode();
            c.setOrgId(org.getId());
            c.setCode((prefix + "XXXXXXXX").substring(0, 8).toUpperCase());
            c.setRole(OrgRole.MEMBER);
            code = codes.save(c);

            OrgDomain d = new OrgDomain();
            d.setOrgId(org.getId());
            d.setDomain(prefix + ".example.org");
            d.setVerificationToken("0".repeat(32));
            domain = domains.save(d);

            OrgAuditEvent e = new OrgAuditEvent();
            e.setOrgId(org.getId());
            e.setActorLogin(prefix + "-owner");
            e.setActorRole("OWNER");
            e.setAction(OrgAuditService.ORG_CREATE);
            e.setTargetType(OrgAuditService.TARGET_ORG);
            e.setTargetId(String.valueOf(org.getId()));
            auditRow = audit.save(e);

            // X2.5: one branding row (unpublished) and one published version. The version number differs per world kind so
            // "B's owner with A's row id" names a version B does not have.
            OrgBranding br = new OrgBranding();
            br.setOrgId(org.getId());
            br.setPrimaryColor("#0f5fc4");
            br.setWelcomeTitle(prefix + " welcome");
            brandings.saveAndFlush(br);
            OrgBrandingVersion bv = new OrgBrandingVersion();
            bv.setOrgId(org.getId());
            bv.setVersionNo(everyRole ? 5 : 6);
            bv.setSnapshotJson("{\"primary\":\"#0f5fc4\"}");
            brandingVersions.save(bv);
            brandingVersionNo = bv.getVersionNo();

            // The member shares a summary with their org: one data_share row and its event.
            dataShare.grant(me(member), ShareScope.SUMMARY, null, OrgShareConsent.CURRENT, ShareContext.EMPTY);
            em.flush();
        }

        OrgMembership me(OrgMember seat) {
            return new OrgMembership(org.getId(), seat.getId(), seat.getUserId(), loginOf(seat), seat.getRole(), seat.getStatus(), org.getStatus());
        }

        String loginOf(OrgMember seat) {
            return users.findById(seat.getUserId()).orElseThrow().getLogin();
        }

        /** Every row id by the name a path variable uses. */
        Map<String, String> ids() {
            Map<String, String> ids = new LinkedHashMap<>();
            ids.put("orgId", String.valueOf(org.getId()));
            ids.put("groupId", String.valueOf(group.getId()));
            ids.put("versionNo", String.valueOf(brandingVersionNo));
            ids.put("kind", "logo");
            ids.put("memberId", String.valueOf(pending.getId()));
            ids.put("invitationId", String.valueOf(pending.getId())); // an invitation is a seat in state INVITED
            return ids;
        }

        List<OrgMember> everySeat() {
            return Arrays.asList(owner, admin, staff, member, marketer, finance, suspended, invited, left, pending).stream().filter(java.util.Objects::nonNull).toList();
        }
    }

    // ---- route discovery ------------------------------------------------------------------------------------------

    private record Route(String method, String pattern, Set<OrgPermission> required) {
        String key() {
            return method + " " + pattern;
        }
    }

    private List<Route> orgRoutes() {
        List<Route> routes = new ArrayList<>();
        for (Map.Entry<RequestMappingInfo, HandlerMethod> e : mapping.getHandlerMethods().entrySet()) {
            var patterns = e.getKey().getPathPatternsCondition() == null ? Set.<String>of() : e.getKey().getPathPatternsCondition().getPatternValues();
            Method handler = e.getValue().getMethod();
            for (String pattern : patterns) {
                if (!pattern.startsWith("/api/orgs/{orgId}")) continue;
                Set<org.springframework.web.bind.annotation.RequestMethod> methods = e.getKey().getMethodsCondition().getMethods();
                assertThat(methods).as(pattern + " must declare its HTTP method (a wildcard route cannot be attacked precisely)").isNotEmpty();
                OrgPermissionRequired required = handler.getAnnotation(OrgPermissionRequired.class);
                assertThat(required).as(pattern + " must carry @OrgPermissionRequired").isNotNull();
                for (var m : methods) routes.add(new Route(m.name(), pattern, Set.copyOf(Arrays.asList(required.value()))));
            }
        }
        routes.sort(java.util.Comparator.comparing(Route::key));
        return routes;
    }

    private static final Pattern VAR = Pattern.compile("\\{([A-Za-z]+)}");

    private static String uri(Route route, Map<String, String> ids) {
        Matcher m = VAR.matcher(route.pattern());
        StringBuilder out = new StringBuilder();
        while (m.find()) {
            String id = ids.get(m.group(1));
            assertThat(id).as("no fixture id for path variable {" + m.group(1) + "} of " + route.key() + ": add it to World.ids() in OrgIsolationIT").isNotNull();
            m.appendReplacement(out, Matcher.quoteReplacement(id));
        }
        m.appendTail(out);
        return out.toString();
    }

    // ---- requests -------------------------------------------------------------------------------------------------

    private MockHttpServletRequestBuilder request(Route route, String uri) {
        if (COVERAGE.get(route.key()).multipart()) {
            return MockMvcRequestBuilders.multipart(HttpMethod.valueOf(route.method()), uri).file(new MockMultipartFile("file", "logo.png", "image/png", samplePng()));
        }
        MockHttpServletRequestBuilder req = MockMvcRequestBuilders.request(HttpMethod.valueOf(route.method()), uri).contentType(MediaType.APPLICATION_JSON);
        String body = COVERAGE.get(route.key()).body();
        return body == null ? req : req.content(body);
    }

    private static byte[] samplePng() {
        try {
            java.awt.image.BufferedImage img = new java.awt.image.BufferedImage(160, 80, java.awt.image.BufferedImage.TYPE_INT_ARGB);
            java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream();
            javax.imageio.ImageIO.write(img, "png", out);
            return out.toByteArray();
        } catch (java.io.IOException e) {
            throw new IllegalStateException(e);
        }
    }

    private MvcResult hostile(Route route, String uri, org.springframework.test.web.servlet.request.RequestPostProcessor caller) throws Exception {
        return mockMvc.perform(request(route, uri).with(caller)).andReturn();
    }

    private static void assertGeneric404(MvcResult r, String what) throws Exception {
        String body = r.getResponse().getContentAsString();
        assertThat(r.getResponse().getStatus()).as(what + " -> " + body).isEqualTo(404);
        String lower = body.toLowerCase().replaceAll("\"(instance|path)\":\"[^\"]*\"", ""); // the echoed request path may legitimately contain /roles
        assertThat(lower).as(what).contains("\"code\":\"not_found\"").doesNotContain("forbidden").doesNotContain("permission").doesNotContain("not a member").doesNotContain("role").doesNotContain("denied");
    }

    // ---- unchanged-ness -------------------------------------------------------------------------------------------

    /** Everything observable about a world, read fresh from the database. */
    private String snapshot(World w) {
        em.flush();
        em.clear();
        StringBuilder s = new StringBuilder();
        Organization o = orgs.findByOrgId(w.org.getId()).orElseThrow();
        s.append("org:").append(o.getName()).append('|').append(o.getStatus()).append('|').append(o.getSettingsJson()).append('|').append(o.getClosedAt()).append('|').append(o.getWebsite()).append('|').append(o.getBillingEmail()).append('\n');
        for (OrgGroup g : groups.findByOrgIdOrderBySortOrderAscNameAsc(w.org.getId())) s.append("group:").append(g.getId()).append('|').append(g.getName()).append('|').append(g.getKind()).append('|').append(g.getSortOrder()).append('\n');
        for (OrgMember m : w.everySeat()) {
            OrgMember row = members.findByOrgIdAndId(w.org.getId(), m.getId()).orElseThrow();
            s.append("seat:").append(row.getId()).append('|').append(row.getRole()).append('|').append(row.getStatus()).append('|').append(row.getGroupId()).append('|').append(row.getDisplayLabel()).append('|').append(row.getSupportOwnerMemberId()).append('|').append(row.getInviteTokenHash()).append('|').append(row.getInviteSentAt()).append('|').append(row.getInviteResendCount()).append('\n');
            s.append("share:").append(shares.findByOrgIdAndMemberId(w.org.getId(), m.getId()).map(d -> d.getScope() + "|" + d.getFullToMemberId() + "|" + d.getUpdatedAt()).orElse("none")).append('\n');
        }
        s.append("batches:").append(batches.findByOrgIdOrderByCreatedAtDesc(w.org.getId()).size()).append('\n');
        s.append("codes:").append(codes.findByOrgIdOrderByCreatedAtDesc(w.org.getId()).stream().map(c -> c.getCode() + "|" + c.getUses() + "|" + c.getRevokedAt()).toList()).append('\n');
        s.append("domains:").append(domains.findByOrgIdOrderByDomain(w.org.getId()).stream().map(d -> d.getDomain() + "|" + d.getVerifiedAt()).toList()).append('\n');
        brandings.findByOrgId(w.org.getId()).ifPresent(b -> s.append("branding:").append(b.getPrimaryColor()).append('|').append(b.getWelcomeTitle()).append('|').append(b.getDraftJson()).append('|').append(b.getDraftVersion()).append('|').append(b.getPublishedAt()).append('|').append(b.getLogoKey()).append('\n'));
        s.append("brandingVersions:").append(brandingVersions.findAllByOrgIdNewestFirst(w.org.getId()).stream().map(v -> v.getVersionNo() + "|" + v.getSnapshotJson()).toList()).append('\n');
        s.append("audit:").append(audit.countByOrgId(w.org.getId())).append('\n');
        s.append("events:").append(shareEvents.countByOrgId(w.org.getId())).append('\n');
        return s.toString();
    }

    // ---- 1. the registry -------------------------------------------------------------------------------------------

    @Test
    void everyOrgRouteIsListedInTheCoverageRegistry() {
        Set<String> discovered = new TreeSet<>();
        orgRoutes().forEach(r -> discovered.add(r.key()));

        Set<String> missing = new TreeSet<>(discovered);
        missing.removeAll(COVERAGE.keySet());
        Set<String> stale = new TreeSet<>(COVERAGE.keySet());
        stale.removeAll(discovered);

        assertThat(missing)
            .as("These /api/orgs/{orgId}/** routes are mapped but have NO isolation coverage. Add a line for each to COVERAGE in OrgIsolationIT "
                + "(a body to attack it with, the status of a legitimate call, and the audit action it writes) and substitute any new path variable in World.ids().")
            .isEmpty();
        assertThat(stale).as("COVERAGE lists routes that no longer exist; remove them").isEmpty();
        assertThat(discovered).as("routes discovered").hasSizeGreaterThanOrEqualTo(7);
    }

    @Test
    void everyOrgRouteIsGuardedByAnOrgPermissionAnnotation() {
        // orgRoutes() asserts @OrgPermissionRequired and a declared HTTP method on every route it returns.
        assertThat(orgRoutes()).isNotEmpty();
    }

    // ---- 2. hostile callers -----------------------------------------------------------------------------------------

    @Test
    void noCallerOutsideOrgAOrWithoutThePermissionCanReachAnyRouteOfOrgA() throws Exception {
        fx = new OrgFixtures(users, orgs, members);
        World a = new World("alpha", true);
        World b = new World("bravo", false);
        fx.user("loner"); // signed in, belongs to no org

        String before = snapshot(a);
        int calls = 0;
        for (Route route : orgRoutes()) {
            String target = uri(route, a.ids());
            Map<String, org.springframework.test.web.servlet.request.RequestPostProcessor> callers = new LinkedHashMap<>();
            callers.put("B's owner", user("bravo-owner"));
            callers.put("B's member", user("bravo-member"));
            callers.put("a platform ROLE_ADMIN who belongs to no org", user("platform-root").authorities(new SimpleGrantedAuthority("ROLE_ADMIN"), new SimpleGrantedAuthority("ROLE_USER")));
            callers.put("a person with no org", user("loner"));
            callers.put("a login that does not exist", user("ghost-login"));
            callers.put("A's SUSPENDED seat", user("alpha-suspended"));
            callers.put("A's INVITED seat", user("alpha-invited"));
            callers.put("A's departed owner", user("alpha-left"));
            for (OrgMember seat : List.of(a.admin, a.staff, a.member, a.marketer, a.finance)) {
                boolean allowed = seat.getRole().permissions().containsAll(route.required());
                if (!allowed) callers.put("A's " + seat.getRole() + " (lacks " + route.required() + ")", user(a.loginOf(seat)));
            }
            for (var caller : callers.entrySet()) {
                assertGeneric404(hostile(route, target, caller.getValue()), route.key() + " as " + caller.getKey());
                calls++;
            }
        }
        assertThat(calls).as("hostile calls made").isGreaterThan(40);
        assertThat(snapshot(a)).as("org A must be exactly as it was").isEqualTo(before);
        assertThat(b.org.getId()).isNotEqualTo(a.org.getId());
    }

    @Test
    void theOwnerOfOrgBCannotUseHisOwnOrgIdToReachOrgAsRows() throws Exception {
        fx = new OrgFixtures(users, orgs, members);
        World a = new World("alpha", true);
        World b = new World("bravo", false);

        String beforeA = snapshot(a);
        String beforeB = snapshot(b);
        int variants = 0;
        for (Route route : orgRoutes()) {
            Map<String, String> ids = new LinkedHashMap<>(a.ids());
            ids.put("orgId", String.valueOf(b.org.getId())); // his own org, but A's row ids
            if (ids.equals(b.ids())) continue; // the route has no row id: nothing of A's to name
            Matcher m = VAR.matcher(route.pattern());
            boolean hasRowId = false;
            while (m.find()) hasRowId |= !m.group(1).equals("orgId") && !m.group(1).equals("kind");
            if (!hasRowId) continue;
            assertGeneric404(hostile(route, uri(route, ids), user("bravo-owner")), route.key() + " as B's owner with B's orgId and A's row id");
            variants++;
        }
        assertThat(variants).as("routes that name a row id").isGreaterThanOrEqualTo(2);
        assertThat(snapshot(a)).isEqualTo(beforeA);
        assertThat(snapshot(b)).as("his own org is untouched too").isEqualTo(beforeB);
    }

    @Test
    void aMalformedOrUnknownOrgIdIsTheSame404AndNeverA500() throws Exception {
        fx = new OrgFixtures(users, orgs, members);
        World a = new World("alpha", true);
        for (Route route : orgRoutes()) {
            for (String bad : List.of("0", "-1", "999999999", "abc", "0x1", "9999999999999999999999")) {
                Map<String, String> ids = new LinkedHashMap<>(a.ids());
                ids.put("orgId", bad);
                MvcResult r = hostile(route, uri(route, ids), user("alpha-owner"));
                assertThat(r.getResponse().getStatus()).as(route.key() + " with orgId " + bad).isEqualTo(404);
            }
        }
    }

    @Test
    void thePlatformAdminListsNoOrgsOfTheirOwn() throws Exception {
        fx = new OrgFixtures(users, orgs, members);
        new World("alpha", true);
        MvcResult r = mockMvc.perform(MockMvcRequestBuilders.get("/api/orgs/mine").with(user("platform-root").authorities(new SimpleGrantedAuthority("ROLE_ADMIN")))).andReturn();
        assertThat(r.getResponse().getStatus()).isEqualTo(200);
        assertThat(r.getResponse().getContentAsString()).isEqualTo("[]");
    }

    // ---- 3. legitimate calls: one audit row per mutation ------------------------------------------------------------

    @Test
    void everyRouteWorksForTheOrgsOwnerAndEveryMutationWritesExactlyOneAuditRow() throws Exception {
        fx = new OrgFixtures(users, orgs, members);
        int n = 0;
        for (Route route : orgRoutes()) {
            Case c = COVERAGE.get(route.key());
            assertThat(c).as(route.key() + " is not in COVERAGE").isNotNull();
            World w = new World("legit" + (n++), false); // a world of its own, so a close or a delete cannot break the next route
            long before = audit.countByOrgId(w.org.getId());
            MvcResult r = mockMvc.perform(request(route, uri(route, w.ids())).with(user(w.p + "-owner"))).andReturn();
            assertThat(r.getResponse().getStatus()).as(route.key() + " legitimately -> " + r.getResponse().getContentAsString()).isEqualTo(c.legitStatus());
            em.flush();
            long delta = audit.countByOrgId(w.org.getId()) - before;
            if (c.auditAction() == null) {
                assertThat(delta).as(route.key() + " is a read and must write no audit row").isZero();
            } else {
                assertThat(delta).as(route.key() + " must write exactly one audit row").isEqualTo(1);
                assertThat(com.dossier.api.service.org.OrgAuditAsserts.rows(audit, w.org.getId()).get(0).getAction()).as(route.key()).isEqualTo(c.auditAction());
            }
        }
    }

    // ---- 4. repositories -------------------------------------------------------------------------------------------

    /** The methods of one repository a cross-tenant check exercises, and the check. */
    private record RepoCheck(Set<String> methods, Runnable check) {}

    private Map<String, RepoCheck> repositoryChecks(World a, World b) {
        Long A = a.org.getId();
        Long B = b.org.getId();
        Map<String, RepoCheck> checks = new LinkedHashMap<>();

        checks.put("OrganizationRepository", new RepoCheck(Set.of("findByOrgId", "findAllByOrgIdIn", "existsBySlug", "findBySlug", "countByCreatedByUserId"), () -> {
            assertThat(orgs.findAllByOrgIdIn(Set.of(B))).extracting(Organization::getId).containsExactly(B);
            assertThat(orgs.findByOrgId(B).orElseThrow().getId()).isNotEqualTo(A);
            assertThat(orgs.countByCreatedByUserId(a.owner.getUserId())).as("scoped by the creating person").isZero(); // fixtures set no creator
        }));
        checks.put("OrgMemberRepository", new RepoCheck(Set.of("findByOrgIdAndId", "findByOrgIdAndUserIdAndStatusIn", "findByOrgIdAndInviteEmailAndStatusIn", "countByOrgIdAndStatus", "countByOrgIdAndRoleAndStatus", "countByOrgIdAndGroupIdAndStatusIn", "countByOrgIdAndStatusIn", "countByOrgIdAndRoleAndStatusIn", "countByOrgIdAndInviteSentAtAfter", "countByOrgIdAndInviteBatchId", "findByInviteTokenHash", "findByOrgIdAndIdIn", "findExpiredInvites", "findOrgIdsWithExpiredInvites"), () -> {
            assertThat(members.findByOrgIdAndId(B, a.owner.getId())).isEmpty();
            assertThat(members.findByOrgIdAndId(B, a.member.getId())).isEmpty();
            assertThat(members.findByOrgIdAndUserIdAndStatusIn(B, a.member.getUserId(), List.of(OrgMemberStatus.ACTIVE, OrgMemberStatus.SUSPENDED))).isEmpty();
            assertThat(members.findByOrgIdAndInviteEmailAndStatusIn(B, "alpha-invited@example.com", List.of(OrgMemberStatus.INVITED))).isEmpty();
            assertThat(members.countByOrgIdAndStatus(B, OrgMemberStatus.ACTIVE)).as("only B's two ACTIVE seats").isEqualTo(2);
            assertThat(members.countByOrgIdAndRoleAndStatus(B, OrgRole.MARKETER, OrgMemberStatus.ACTIVE)).as("A's marketer is not B's").isZero();
            assertThat(members.countByOrgIdAndGroupIdAndStatusIn(B, a.group.getId(), OrgMemberStatus.LIVE)).isZero();
            assertThat(members.countByOrgIdAndStatusIn(B, List.of(OrgMemberStatus.SUSPENDED, OrgMemberStatus.INVITED, OrgMemberStatus.LEFT))).as("A's odd seats are not B's").isEqualTo(1); // B's own pending invite only
            assertThat(members.countByOrgIdAndRoleAndStatusIn(B, OrgRole.ADMIN, OrgMemberStatus.LIVE)).as("A's admins and the suspended / invited ones are not B's").isZero();
            assertThat(members.countByOrgIdAndInviteSentAtAfter(B, java.time.Instant.now().minus(java.time.Duration.ofDays(1)))).as("only B's own pending invite counts toward B's daily cap").isEqualTo(1);
            assertThat(members.countByOrgIdAndInviteBatchId(B, 0L)).isZero();
            assertThat(members.findByOrgIdAndIdIn(B, List.of(a.owner.getId(), a.pending.getId()))).as("A's seats by id are not B's").isEmpty();
            java.time.Instant farFuture = java.time.Instant.now().plus(java.time.Duration.ofDays(3650));
            assertThat(members.findExpiredInvites(B, farFuture, org.springframework.data.domain.PageRequest.of(0, 50))).as("only B's own invitations, never A's").isNotEmpty().allSatisfy(m -> assertThat(m.getOrgId()).isEqualTo(B));
            assertThat(members.findOrgIdsWithExpiredInvites(farFuture)).as("the one cross-tenant read lists WHICH orgs have work and nothing else").contains(A, B);
            // the one finder that names no org: a token finds the seat it was minted for, whose own orgId is the tenant
            String tokenOfA = com.dossier.api.service.org.InviteTokens.newToken();
            OrgMember pendingA = members.findByOrgIdAndId(A, a.pending.getId()).orElseThrow();
            String keptHash = pendingA.getInviteTokenHash();
            pendingA.setInviteTokenHash(com.dossier.api.service.org.InviteTokens.hash(tokenOfA));
            members.saveAndFlush(pendingA);
            assertThat(members.findByInviteTokenHash(com.dossier.api.service.org.InviteTokens.hash(tokenOfA)).orElseThrow().getOrgId()).as("a token opens exactly its own org").isEqualTo(A);
            assertThat(members.findByInviteTokenHash(com.dossier.api.service.org.InviteTokens.hash("x".repeat(32)))).isEmpty();
            pendingA.setInviteTokenHash(keptHash);
            members.saveAndFlush(pendingA);
        }));
        checks.put("OrgGroupRepository", new RepoCheck(Set.of("findByOrgIdAndId", "findByOrgIdOrderBySortOrderAscNameAsc", "existsByOrgIdAndName", "countByOrgId", "deleteByOrgIdAndId"), () -> {
            assertThat(groups.findByOrgIdAndId(B, a.group.getId())).isEmpty();
            assertThat(groups.findByOrgIdOrderBySortOrderAscNameAsc(B)).extracting(OrgGroup::getId).doesNotContain(a.group.getId());
            assertThat(groups.existsByOrgIdAndName(B, a.group.getName())).isFalse();
            assertThat(groups.countByOrgId(B)).isEqualTo(1);
            assertThat(groups.deleteByOrgIdAndId(B, a.group.getId())).as("a delete naming B and A's group row removes nothing").isZero();
            assertThat(groups.findByOrgIdAndId(A, a.group.getId())).isPresent();
        }));
        checks.put("OrgInviteBatchRepository", new RepoCheck(Set.of("findByOrgIdAndId", "findByOrgIdOrderByCreatedAtDesc", "incrementAccepted"), () -> {
            assertThat(batches.incrementAccepted(B, a.batch.getId())).as("counting a join through B for A's batch changes nothing").isZero();
            assertThat(batches.findByOrgIdAndId(B, a.batch.getId())).isEmpty();
            assertThat(batches.findByOrgIdOrderByCreatedAtDesc(B)).extracting(OrgInviteBatch::getId).doesNotContain(a.batch.getId());
        }));
        checks.put("OrgJoinCodeRepository", new RepoCheck(Set.of("findByOrgIdAndId", "findByOrgIdOrderByCreatedAtDesc", "findByCode", "redeem"), () -> {
            assertThat(codes.redeem(B, a.code.getId(), java.time.Instant.now())).as("redeeming A's code through B takes no place").isZero();
            assertThat(codes.findByCode(a.code.getCode()).orElseThrow().getOrgId()).as("a code opens exactly its own org").isEqualTo(A);
            assertThat(codes.findByCode("ZZZZZZZZ")).isEmpty();
            assertThat(codes.findByOrgIdAndId(B, a.code.getId())).isEmpty();
            assertThat(codes.findByOrgIdOrderByCreatedAtDesc(B)).extracting(OrgJoinCode::getId).doesNotContain(a.code.getId());
        }));
        checks.put("OrgDomainRepository", new RepoCheck(Set.of("findByOrgIdAndId", "findByOrgIdOrderByDomain"), () -> {
            assertThat(domains.findByOrgIdAndId(B, a.domain.getId())).isEmpty();
            assertThat(domains.findByOrgIdOrderByDomain(B)).extracting(OrgDomain::getId).doesNotContain(a.domain.getId());
        }));
        checks.put("OrgAuditEventRepository", new RepoCheck(Set.of("findByOrgId", "findByOrgIdAndAction", "countByOrgId", "countByOrgIdAndActorLogin"), () -> {
            assertThat(audit.findByOrgId(B, PageRequest.of(0, 100)).getContent()).extracting(OrgAuditEvent::getOrgId).containsOnly(B);
            assertThat(audit.findByOrgIdAndAction(B, OrgAuditService.SHARE_SCOPE_CHANGED, PageRequest.of(0, 100)).getContent()).extracting(OrgAuditEvent::getActorLogin).containsOnly("bravo-member");
            assertThat(audit.countByOrgIdAndActorLogin(B, "alpha-owner")).as("A's actor never appears in B's trail").isZero();
            assertThat(audit.countByOrgId(B)).isLessThan(audit.countByOrgId(A) + audit.countByOrgId(B));
        }));
        checks.put("DataShareRepository", new RepoCheck(Set.of("findByOrgIdAndMemberId", "findByOrgIdAndFullToMemberId", "countByOrgIdAndScope", "deleteByOrgIdAndMemberId"), () -> {
            assertThat(shares.findByOrgIdAndMemberId(B, a.member.getId())).isEmpty();
            assertThat(shares.findByOrgIdAndFullToMemberId(B, a.owner.getId())).isEmpty();
            assertThat(shares.countByOrgIdAndScope(B, ShareScope.SUMMARY)).as("only B's own member shares").isEqualTo(1);
            assertThat(shares.deleteByOrgIdAndMemberId(B, a.member.getId())).as("deleting A's member's consent through B removes nothing").isZero();
            assertThat(shares.findByOrgIdAndMemberId(A, a.member.getId())).isPresent();
        }));
        checks.put("DataShareEventRepository", new RepoCheck(Set.of("findByOrgIdAndMemberLoginOrderByIdAsc", "countByOrgId"), () -> {
            assertThat(shareEvents.findByOrgIdAndMemberLoginOrderByIdAsc(B, "alpha-member")).isEmpty();
            assertThat(shareEvents.findByOrgIdAndMemberLoginOrderByIdAsc(A, "alpha-member")).hasSize(1);
            assertThat(shareEvents.countByOrgId(B)).isEqualTo(1);
        }));
        return checks;
    }

    private static Set<Class<?>> orgRepositoryInterfaces() throws ClassNotFoundException {
        ClassPathScanningCandidateComponentProvider scanner = new ClassPathScanningCandidateComponentProvider(false) {
            @Override
            protected boolean isCandidateComponent(org.springframework.beans.factory.annotation.AnnotatedBeanDefinition bd) {
                return bd.getMetadata().isInterface();
            }
        };
        scanner.addIncludeFilter(new AssignableTypeFilter(Repository.class));
        Set<Class<?>> out = new java.util.LinkedHashSet<>();
        for (BeanDefinition bd : scanner.findCandidateComponents("com.dossier.api.repository.org")) out.add(Class.forName(bd.getBeanClassName()));
        return out;
    }

    @Test
    void everyOrgRepositoryMethodIsExercisedAcrossTenants() throws Exception {
        fx = new OrgFixtures(users, orgs, members);
        World a = new World("alpha", true);
        World b = new World("bravo", false);
        Map<String, RepoCheck> checks = repositoryChecks(a, b);

        Set<String> notExercised = new TreeSet<>();
        Set<String> unknownRepos = new TreeSet<>();
        Set<String> exempt = Set.of("save", "saveAndFlush", "flush", "findMine"); // writes of a row the caller built; findMine is scoped by the person
        for (Class<?> repo : orgRepositoryInterfaces()) {
            RepoCheck check = checks.get(repo.getSimpleName());
            if (check == null) {
                unknownRepos.add(repo.getSimpleName());
                continue;
            }
            for (Method m : repo.getMethods()) {
                if (exempt.contains(m.getName())) continue;
                if (!check.methods().contains(m.getName())) notExercised.add(repo.getSimpleName() + "." + m.getName());
            }
        }
        assertThat(unknownRepos).as("New repository in repository.org: add a cross-tenant check for it to repositoryChecks() in OrgIsolationIT").isEmpty();
        assertThat(notExercised).as("New repository method: add it to its RepoCheck in OrgIsolationIT and assert it cannot cross tenants").isEmpty();

        String before = snapshot(a);
        checks.values().forEach(c -> c.check().run());
        assertThat(snapshot(a)).as("no cross-tenant call changed org A").isEqualTo(before);
    }

    // ---- 5. consent bounds what an org's own staff can read ---------------------------------------------------------

    private Map<ShareField, Object> everything() {
        Map<ShareField, Object> all = new EnumMap<>(ShareField.class);
        for (ShareField f : ShareField.values()) all.put(f, "value-of-" + f.name());
        return all;
    }

    @Test
    void aMemberWithoutAShareCannotBeReadByTheirOrgsStaffBeyondTheSeat() throws Exception {
        fx = new OrgFixtures(users, orgs, members);
        World a = new World("alpha", true);
        World b = new World("bravo", false);
        OrgMember quiet = fx.active(a.org, "alpha-quiet", OrgRole.MEMBER); // never chose a scope
        quiet.setSupportOwnerMemberId(a.staff.getId()); // the staff member is their support owner
        members.saveAndFlush(quiet);

        assertThat(dataShare.scopeOf(a.org.getId(), quiet.getId())).as("no share means NONE").isEqualTo(ShareScope.NONE);
        assertThat(ShareField.project(dataShare.scopeOf(a.org.getId(), quiet.getId()), everything()).keySet()).containsExactlyInAnyOrder(ShareField.SEAT, ShareField.ACTIVATED);

        // The member who chose SUMMARY shows counts and states, never employers, documents or the calendar.
        assertThat(dataShare.scopeOf(a.org.getId(), a.member.getId())).isEqualTo(ShareScope.SUMMARY);
        Set<ShareField> visible = ShareField.project(dataShare.scopeOf(a.org.getId(), a.member.getId()), everything()).keySet();
        assertThat(visible).contains(ShareField.STAGE_COUNTS).doesNotContain(ShareField.EMPLOYER_DETAILS, ShareField.RESUMES, ShareField.INTERVIEW_CALENDAR, ShareField.APPLICATION_DETAIL, ShareField.JOB_ASSIGNMENTS, ShareField.PRIVATE_DATA);

        // Nobody in A is a FULL viewer of anyone: staff, admin, owner, finance, and B's owner.
        for (String viewer : List.of("alpha-staff", "alpha-admin", "alpha-owner", "alpha-finance", "alpha-marketer", "bravo-owner", "bravo-member")) {
            assertThat(resumeSharing.isFullPairedViewer("alpha-member", viewer)).as(viewer + " must not be a FULL viewer of alpha-member").isFalse();
            assertThat(resumeSharing.isFullPairedViewer("alpha-quiet", viewer)).as(viewer + " must not be a FULL viewer of alpha-quiet").isFalse();
            assertThat(resumeSharing.ownersSharingFullWith(viewer)).as(viewer).isEmpty();
        }

        // Org B asking about A's seats gets NONE, whatever they chose.
        assertThat(dataShare.scopeOf(b.org.getId(), a.member.getId())).isEqualTo(ShareScope.NONE);
        assertThat(dataShare.viewOf(b.org.getId(), a.member.getId())).isEmpty();
    }

    @Test
    void fullSharingReachesOnlyTheNamedMarketerAndEndsTheMomentTheMemberSaysSo() throws Exception {
        fx = new OrgFixtures(users, orgs, members);
        World a = new World("alpha", true);
        World b = new World("bravo", false);
        OrgMember rival = fx.active(b.org, "bravo-marketer", OrgRole.MARKETER); // a marketer of ANOTHER org

        dataShare.grant(a.me(a.member), ShareScope.FULL, a.marketer.getId(), OrgShareConsent.CURRENT, ShareContext.EMPTY);

        assertThat(resumeSharing.isFullPairedViewer("alpha-member", "alpha-marketer")).isTrue();
        for (String stranger : List.of("alpha-staff", "alpha-admin", "alpha-owner", "alpha-finance", "bravo-owner", "bravo-marketer", "bravo-member", "platform-root")) {
            assertThat(resumeSharing.isFullPairedViewer("alpha-member", stranger)).as(stranger).isFalse();
        }
        assertThat(rival.getRole()).isEqualTo(OrgRole.MARKETER);

        long auditA = audit.countByOrgId(a.org.getId());
        long auditB = audit.countByOrgId(b.org.getId());
        resumeSharing.auditFullRead("alpha-member", "bravo-marketer", 1L); // not paired: records nothing anywhere
        resumeSharing.auditFullRead("alpha-member", "alpha-staff", 1L);
        assertThat(audit.countByOrgId(a.org.getId())).isEqualTo(auditA);
        assertThat(audit.countByOrgId(b.org.getId())).isEqualTo(auditB);

        dataShare.revoke(a.me(a.member), ShareContext.EMPTY);
        assertThat(resumeSharing.isFullPairedViewer("alpha-member", "alpha-marketer")).as("revoked: refused on the very next call").isFalse();
        assertThat(dataShare.scopeOf(a.org.getId(), a.member.getId())).isEqualTo(ShareScope.NONE);
    }
}
