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
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
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
// The opportunity services look a job up with a transaction of their own (JobIdentityTx, REQUIRES_NEW) when the plain read finds nothing: with the test pool of ONE connection that read
// waits 30 s for a connection and answers 500. A pool of three lets it run (it only reads, so it cannot wait on the uncommitted rows of this test).
@org.springframework.test.context.TestPropertySource(properties = "spring.datasource.hikari.maximum-pool-size=3")
// Every route is attacked by every caller: with the groups routes (X4.5) and the talent boards the sweeps outgrew the global 15 s default on a loaded machine.
@org.junit.jupiter.api.Timeout(2400) // 300 s was not enough for the legitimate-call sweep on a loaded machine (it creates a world per route)
class OrgIsolationIT {

    // ---- the coverage registry: add a line here when you add an org route ------------------------------------------

    /** How to attack a route, and what a legitimate call by the org's owner must do. */
    private record Case(
        String body,
        int legitStatus,
        String auditAction,
        boolean multipart,
        java.util.function.Function<World, String> bodyFor,
        java.util.function.Function<World, String> ifMatchFor,
        int auditRows,
        java.util.function.Consumer<World> prepare
    ) {
        static Case read() {
            return new Case(null, 200, null, false, null, null, 1, null);
        }

        /** A read that is deliberately audited (an export): it answers 200 and writes exactly one audit row, whose action is {@code action}. */
        static Case auditedRead(String action) {
            return new Case(null, 200, action, false, null, null, 1, null);
        }

        /** A consultant-workspace read: the owner is made a consultant first, and no audit row is written. */
        static Case consultantRead() {
            return new Case(null, 200, null, false, null, null, 1, World::makeOwnerAConsultant);
        }

        /** A consultant-workspace write: same caller, own-scoped data, no org audit row. */
        static Case consultantWrite(String body, int status) {
            return new Case(body, status, null, false, null, null, 1, World::makeOwnerAConsultant);
        }

        /** A consultant-workspace write whose body depends on the fixture world or the clock (ids of A's rows, dates). */
        static Case consultantWriteFor(java.util.function.Function<World, String> bodyFor, int status) {
            return new Case(null, status, null, false, bodyFor, null, 1, World::makeOwnerAConsultant);
        }

        static Case write(String body, int status, String action) {
            return new Case(body, status, action, false, null, null, 1, null);
        }

        /**
         * A route that is closed to EVERYONE in this world, the org's owner included, because the feature flag behind it ships off here (the consultant
         * jobs flag): a legitimate call is the same generic 404 and writes nothing. The route is still attacked by every hostile caller above.
         */
        static Case denied(String body) {
            return new Case(body, 404, null, false, null, null, 1, null);
        }

        /** A multipart upload (field "file", a small valid PNG) instead of a JSON body. */
        static Case upload(int status, String action) {
            return new Case(null, status, action, true, null, null, 1, null);
        }

        /** A write whose body and If-Match version depend on the fixture world (role ids, role versions: X1.14). */
        static Case versioned(int status, String action, java.util.function.Function<World, String> bodyFor, java.util.function.Function<World, String> ifMatchFor) {
            return new Case(null, status, action, false, bodyFor, ifMatchFor, 1, null);
        }

        /** ent-marketer: a read of the Marketing workspace. The world's marketing rows are made first, so the ids in the path name real rows. */
        static Case mktRead() {
            return new Case(null, 200, null, false, null, null, 1, World::seedMkt);
        }

        /**
         * ent-marketer: a write of the Marketing workspace, made by the org's owner (who holds every marketing permission at ORG scope). The marketing rows are made
         * first ({@link World#seedMkt}), then {@code prepare} puts them in the state the route needs. {@code action} is null for a write that is documented as writing no audit row.
         */
        static Case mkt(int status, String action, java.util.function.Function<World, String> bodyFor, java.util.function.Consumer<World> prepare) {
            return new Case(null, status, action, false, bodyFor, null, 1, w -> {
                w.seedMkt();
                if (prepare != null) prepare.accept(w);
            });
        }

        /** X4.3/X4.4: a write that writes {@code auditRows} audit rows (the action's own plus a bulk summary), the newest being {@code action}, after {@code prepare} put the world in the state it needs. */
        static Case people(int status, String action, int auditRows, java.util.function.Function<World, String> bodyFor, java.util.function.Function<World, String> ifMatchFor, java.util.function.Consumer<World> prepare) {
            return new Case(null, status, action, false, bodyFor, ifMatchFor, auditRows, prepare);
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
        // Enterprise V2 X4.5: the flag is on in every world here, so a group edit or delete carries the group's ETag as If-Match.
        Map.entry("PATCH /api/orgs/{orgId}/groups/{groupId}", Case.versioned(200, OrgAuditService.GROUP_UPDATE, w -> "{\"name\":\"Hijack\"}", w -> w.groupVersion)),
        Map.entry("DELETE /api/orgs/{orgId}/groups/{groupId}", Case.versioned(204, OrgAuditService.GROUP_DELETE, w -> null, w -> w.groupVersion)),
        Map.entry("GET /api/orgs/{orgId}/groups/directory", Case.read()),
        Map.entry("GET /api/orgs/{orgId}/groups/structure", Case.read()),
        Map.entry("GET /api/orgs/{orgId}/groups/pickers", Case.read()),
        Map.entry("GET /api/orgs/{orgId}/groups/people", Case.read()),
        Map.entry("GET /api/orgs/{orgId}/groups/{groupId}", Case.read()),
        Map.entry("POST /api/orgs/{orgId}/groups/{groupId}/members", Case.versioned(200, OrgAuditService.GROUP_MOVE, w -> "{\"memberIds\":[" + w.member.getId() + "]}", w -> null)),
        Map.entry("DELETE /api/orgs/{orgId}/groups/{groupId}/members/{memberId}", Case.write(null, 204, null)),
        Map.entry("GET /api/orgs/{orgId}/roles", Case.read()),
        // Enterprise V2 X1.14: role writes and the Roles and Permissions board data. Role edits and deletes carry the role version as If-Match.
        Map.entry("GET /api/orgs/{orgId}/roles/overview", Case.read()),
        Map.entry("GET /api/orgs/{orgId}/roles/{roleId}", Case.read()),
        // Enterprise V2 X4.1: the permissions catalog, the diff against the template, the change history and the resync.
        Map.entry("GET /api/orgs/{orgId}/permissions", Case.read()),
        Map.entry("GET /api/orgs/{orgId}/roles/{roleId}/diff", Case.read()),
        Map.entry("GET /api/orgs/{orgId}/roles/{roleId}/history", Case.read()),
        Map.entry("GET /api/orgs/{orgId}/roles/history", Case.read()),
        Map.entry("POST /api/orgs/{orgId}/roles/{roleId}/resync", Case.versioned(200, "ROLE_RESYNC", w -> null, w -> w.roleVersion)),
        Map.entry("POST /api/orgs/{orgId}/roles", Case.write("{\"name\":\"Hijack\",\"templateKey\":\"EXECUTIVE_VIEWER\"}", 201, "ROLE_CREATE")),
        Map.entry("PATCH /api/orgs/{orgId}/roles/{roleId}", Case.versioned(200, "ROLE_UPDATE", w -> "{\"name\":\"Hijacked\"}", w -> w.roleVersion)),
        Map.entry("DELETE /api/orgs/{orgId}/roles/{roleId}", Case.versioned(204, "ROLE_DELETE", w -> null, w -> w.roleVersion)),
        Map.entry("PUT /api/orgs/{orgId}/members/{memberId}/roles", Case.versioned(200, "ROLE_ASSIGN", w -> "{\"roleIds\":[" + w.consultantRoleId + "],\"primaryRoleId\":" + w.consultantRoleId + "}", w -> null)),
        // Enterprise V2 X4.3 / X4.4: the Employees board. Reads write no audit row; bulk calls write the action's own rows plus one MEMBER_BULK summary.
        Map.entry("GET /api/orgs/{orgId}/members", Case.read()),
        Map.entry("GET /api/orgs/{orgId}/members/counts", Case.read()),
        Map.entry("GET /api/orgs/{orgId}/members/{memberId}", Case.read()),
        Map.entry("GET /api/orgs/{orgId}/members/{memberId}/activity", Case.read()),
        Map.entry("PATCH /api/orgs/{orgId}/members/{memberId}", Case.people(200, "MEMBER_UPDATE", 1, w -> "{\"title\":\"Hijacked\"}", w -> w.memberVersion, null)),
        Map.entry("POST /api/orgs/{orgId}/members/bulk/roles", Case.people(200, "MEMBER_BULK", 2, w -> "{\"memberIds\":[" + w.member.getId() + "],\"add\":[" + w.consultantRoleId + "]}", null, null)),
        Map.entry("POST /api/orgs/{orgId}/members/bulk/groups", Case.people(200, "MEMBER_BULK", 2, w -> "{\"memberIds\":[" + w.member.getId() + "],\"departmentGroupId\":" + w.department.getId() + ",\"teamGroupId\":null}", null, null)),
        Map.entry("POST /api/orgs/{orgId}/members/bulk/manager", Case.people(200, "MEMBER_BULK", 2, w -> "{\"memberIds\":[" + w.member.getId() + "],\"managerMemberId\":" + w.owner.getId() + "}", null, null)),
        Map.entry("POST /api/orgs/{orgId}/members/bulk/status", Case.people(200, "MEMBER_BULK", 2, w -> "{\"memberIds\":[" + w.member.getId() + "],\"action\":\"SUSPEND\",\"reason\":\"Policy review pending\"}", null, null)),
        Map.entry("POST /api/orgs/{orgId}/members/{memberId}/suspend", Case.people(200, "MEMBER_SUSPEND", 1, w -> "{\"reason\":\"Policy review pending\"}", null, null)),
        Map.entry("POST /api/orgs/{orgId}/members/{memberId}/reinstate", Case.people(200, "MEMBER_REINSTATE", 1, w -> "{\"reason\":\"Review finished\"}", null, w -> w.suspendMember())),
        Map.entry("GET /api/orgs/{orgId}/members/{memberId}/offboard-preview", Case.read()),
        Map.entry("POST /api/orgs/{orgId}/members/{memberId}/offboard", Case.people(200, "MEMBER_REMOVE", 1, w -> "{\"reason\":\"Left the company\",\"confirm\":\"" + w.p + "-member\"}", null, null)),
        // Decision O4, S8: an offboarded person's enterprise account. Every member of this world is ACTIVE (or a personal account of a legacy organization), so a legitimate call is the 409 NO_ENTERPRISE_ACCOUNT and writes nothing;
        // the success paths (export, early erase, retention) are in AccountDeletionSeparateIT.
        Map.entry("GET /api/orgs/{orgId}/members/{memberId}/account-export", Case.write(null, 409, null)),
        Map.entry("POST /api/orgs/{orgId}/members/{memberId}/account-erase", Case.write(null, 409, null)),
        Map.entry("GET /api/orgs/{orgId}/members/offboarding", Case.read()),
        Map.entry("DELETE /api/orgs/{orgId}/members/offboarding/{offboardingId}", Case.people(204, "MEMBER_OFFBOARD_CANCELLED", 1, w -> null, null, null)),
        // Enterprise V2 X2.5: branding. Draft edits, discards and removing an absent asset write no audit row (by design).
        // Resume Builder policy (consultant share links, default off): the owner turns it on, one ORG_SETTINGS audit row.
        Map.entry("GET /api/orgs/{orgId}/org-settings", Case.read()),
        Map.entry("PUT /api/orgs/{orgId}/org-settings/general", Case.write("{\"timeZone\":\"America/Chicago\"}", 200, OrgAuditService.ORG_SETTINGS)),
        Map.entry("PUT /api/orgs/{orgId}/org-settings/security", Case.write("{\"passwordMinLength\":10,\"reason\":\"Isolation check\"}", 200, OrgAuditService.ORG_SETTINGS)),
        Map.entry("GET /api/orgs/{orgId}/resume-policy", Case.read()),
        Map.entry("PUT /api/orgs/{orgId}/resume-policy", Case.write("{\"consultantShareLinks\":true}", 200, OrgAuditService.ORG_SETTINGS)),
        Map.entry("GET /api/orgs/{orgId}/branding", Case.read()),
        Map.entry("GET /api/orgs/{orgId}/branding/preview-theme", Case.read()),
        Map.entry("PATCH /api/orgs/{orgId}/branding/draft", Case.write("{\"welcomeTitle\":\"Hijacked\"}", 200, null)),
        Map.entry("POST /api/orgs/{orgId}/branding/publish", Case.write(null, 200, OrgAuditService.BRANDING_PUBLISH)),
        Map.entry("POST /api/orgs/{orgId}/branding/discard", Case.write(null, 200, null)),
        Map.entry("POST /api/orgs/{orgId}/branding/versions/{versionNo}/restore", Case.write(null, 200, OrgAuditService.BRANDING_RESTORE)),
        Map.entry("POST /api/orgs/{orgId}/branding/assets/{kind}", Case.upload(200, OrgAuditService.BRANDING_ASSET)),
        Map.entry("DELETE /api/orgs/{orgId}/branding/assets/{kind}", Case.write(null, 200, null)),
        // Tenant policy pages (docs/enterprise-v2/62): the Org Admin's draft / template / submit / withdraw. Publishing is the platform reviewer's (AdminPolicyReviewResource), never an org route.
        Map.entry("GET /api/orgs/{orgId}/policies", Case.read()),
        Map.entry("GET /api/orgs/{orgId}/policies/{policyKind}", Case.read()),
        Map.entry("PUT /api/orgs/{orgId}/policies/{policyKind}/draft", Case.write("{\"body\":\"# Hijacked\\n\\nText of the policy.\"}", 200, OrgAuditService.POLICY_DRAFT_SAVE)),
        Map.entry("POST /api/orgs/{orgId}/policies/{policyKind}/template", Case.write(null, 200, OrgAuditService.POLICY_TEMPLATE)),
        Map.entry("POST /api/orgs/{orgId}/policies/{policyKind}/request-review", Case.people(200, OrgAuditService.POLICY_SUBMIT, 1, null, null, w -> w.seedPolicy(false))),
        Map.entry("POST /api/orgs/{orgId}/policies/{policyKind}/withdraw", Case.people(200, OrgAuditService.POLICY_WITHDRAW, 1, null, null, w -> w.seedPolicy(true))),
        Map.entry("POST /api/orgs/{orgId}/members/invite", Case.write("{\"emails\":[\"newcomer@example.org\"],\"role\":\"MEMBER\"}", 200, OrgAuditService.MEMBER_INVITE)),
        Map.entry("POST /api/orgs/{orgId}/members/{memberId}/resend", Case.write(null, 200, OrgAuditService.MEMBER_INVITE_RESEND)),
        // Direct account creation with a temporary password: the legitimate call creates an account (HIGH audit row); a reset of a member who
        // already chose a password is a 409 that changes nothing (the reset itself is covered in OrgAccountResourceIT).
        Map.entry("POST /api/orgs/{orgId}/members/account", Case.write("{\"email\":\"newhire.iso@example.org\",\"role\":\"MEMBER\"}", 200, OrgAuditService.MEMBER_ACCOUNT_CREATE)),
        Map.entry("GET /api/orgs/{orgId}/members/temp-password", Case.read()),
        Map.entry("POST /api/orgs/{orgId}/members/{memberId}/reset-password", Case.write("{\"reason\":\"Isolation sweep, nothing to reset\"}", 409, null)),
        // Enterprise V2 X1.15: the Invitations page. The bulk bodies name an id that is nobody's, so a legitimate call changes nothing
        // (their real behaviour is in OrgInvitationResourceIT).
        Map.entry("GET /api/orgs/{orgId}/invitations", Case.read()),
        Map.entry("GET /api/orgs/{orgId}/invitations/counts", Case.read()),
        Map.entry("GET /api/orgs/{orgId}/invitations/activity", Case.read()),
        Map.entry("POST /api/orgs/{orgId}/invitations", Case.write("{\"emails\":[\"newcomer2@example.org\"],\"role\":\"MEMBER\"}", 200, OrgAuditService.MEMBER_INVITE)),
        Map.entry("POST /api/orgs/{orgId}/invitations/{invitationId}/resend", Case.write(null, 200, OrgAuditService.MEMBER_INVITE_RESEND)),
        Map.entry("POST /api/orgs/{orgId}/invitations/{invitationId}/revoke", Case.write(null, 204, OrgAuditService.MEMBER_INVITE_REVOKE)),
        Map.entry("POST /api/orgs/{orgId}/invitations/bulk/resend", Case.write("{\"ids\":[1]}", 200, null)),
        Map.entry("POST /api/orgs/{orgId}/invitations/bulk/revoke", Case.write("{\"ids\":[1]}", 200, null)),
        // Enterprise V2 X2.4: the dashboard. Dismissing an alert is a personal preference of the caller, so it writes no audit row.
        Map.entry("GET /api/orgs/{orgId}/dashboard", Case.read()),
        Map.entry("POST /api/orgs/{orgId}/dashboard/alerts/{alertKey}/dismiss", Case.write(null, 200, null)),
        // Doc 60 WP3: the consultant's assigned opportunities (/con/**, Java packages "consultant"). BEST EFFORT, not executed on the machine that wrote it: this world switches
        // only the master and roles flags on, so flag.enterprise.consultant_jobs is off and the owner's legitimate call is the same generic 404 as everyone's. The behaviour
        // behind the gate (a real consultant seat, the lifecycle, IDOR) is in ConOpportunitiesIT. Fixture id {id} is deliberately nobody's.
        Map.entry("GET /api/orgs/{orgId}/con/opportunities", Case.denied(null)),
        Map.entry("GET /api/orgs/{orgId}/con/opportunities/{id}", Case.denied(null)),
        Map.entry("POST /api/orgs/{orgId}/con/opportunities/{id}/viewed", Case.denied("{}")),
        Map.entry("POST /api/orgs/{orgId}/con/opportunities/{id}/interest", Case.denied("{}")),
        Map.entry("POST /api/orgs/{orgId}/con/opportunities/{id}/decline", Case.denied("{\"reason\":\"OTHER\"}")),
        Map.entry("POST /api/orgs/{orgId}/con/opportunities/{id}/request-info", Case.denied("{\"question\":\"Is a W2 option available?\"}")),
        Map.entry("POST /api/orgs/{orgId}/con/opportunities/{id}/applied", Case.denied("{\"applicationId\":1}")),
        Map.entry("POST /api/orgs/{orgId}/con/opportunities/{id}/link", Case.denied("{\"applicationId\":1}")),
        Map.entry("POST /api/orgs/{orgId}/con/opportunities/{id}/unlink", Case.denied("{}")),
        // Prepare selected openings (doc 63): the feature switch is off in this world (and the caller is no consultant), so a legitimate call is the same generic 404. The real gate is in ConPrepareIT.
        Map.entry("GET /api/orgs/{orgId}/con/prepare/status", Case.denied(null)),
        Map.entry("POST /api/orgs/{orgId}/con/prepare", Case.denied("{\"matchIds\":[1]}")),
        Map.entry("POST /api/orgs/{orgId}/con/prepare/{sessionId}/events", Case.denied("{\"matchId\":1,\"event\":\"OPENED\"}")),
        Map.entry("GET /api/orgs/{orgId}/con/prepare/{sessionId}", Case.denied(null)),
        // Consultant workspace Home: own-scoped. Only a consultant (opportunities.respond + a consultant_profile) may read it, so the legitimate call makes the owner one.
        Map.entry("GET /api/orgs/{orgId}/me-workspace/home", Case.consultantRead()),
        // The other consultant-workspace pages: own-scoped too, same legitimate caller (the owner made a consultant), no org audit row.
        Map.entry("GET /api/orgs/{orgId}/me-workspace/profile", Case.consultantRead()),
        Map.entry("PUT /api/orgs/{orgId}/me-workspace/profile/availability", Case.consultantWrite("{\"status\":\"NOTICE\"}", 200)),
        Map.entry("PUT /api/orgs/{orgId}/me-workspace/profile/summary", Case.consultantWrite("{\"text\":\"Hijacked summary\"}", 200)),
        Map.entry("PUT /api/orgs/{orgId}/me-workspace/profile/contact", Case.consultantWrite("{\"phone\":\"555-0100\",\"timeZone\":\"America/Chicago\",\"preferredContact\":\"EMAIL\"}", 200)),
        Map.entry("PUT /api/orgs/{orgId}/me-workspace/profile/career-goals",Case.consultantWrite("{\"text\":\"Hijacked goals\"}", 200)),
        Map.entry("PUT /api/orgs/{orgId}/me-workspace/profile/work-authorization", Case.consultantWrite("{\"value\":\"authorized_no_sponsorship\"}", 200)),
        Map.entry("PUT /api/orgs/{orgId}/me-workspace/profile/employment-types", Case.consultantWrite("{\"values\":[\"CONTRACT\"]}", 200)),
        Map.entry("POST /api/orgs/{orgId}/me-workspace/profile/skills", Case.consultantWrite("{\"skill\":\"Hijack\"}", 200)),
        Map.entry("DELETE /api/orgs/{orgId}/me-workspace/profile/skills/{skillId}", Case.consultantWrite(null, 200)),
        Map.entry("POST /api/orgs/{orgId}/me-workspace/profile/certifications", Case.consultantWrite("{\"name\":\"Hijack cert\"}", 200)),
        Map.entry("DELETE /api/orgs/{orgId}/me-workspace/profile/certifications/{certId}", Case.consultantWrite(null, 200)),
        Map.entry("POST /api/orgs/{orgId}/me-workspace/profile/prefs", Case.consultantWrite("{\"kind\":\"ROLE\",\"value\":\"Hijack role\"}", 200)),
        Map.entry("DELETE /api/orgs/{orgId}/me-workspace/profile/prefs/{prefId}", Case.consultantWrite(null, 200)),
        Map.entry("GET /api/orgs/{orgId}/me-workspace/resumes", Case.consultantRead()),
        Map.entry("GET /api/orgs/{orgId}/me-workspace/resumes/sources", Case.consultantRead()),
        Map.entry("GET /api/orgs/{orgId}/me-workspace/resumes/{resumeId}/preview", Case.consultantRead()),
        Map.entry("POST /api/orgs/{orgId}/me-workspace/resumes/{resumeId}/primary", Case.consultantWrite(null, 200)),
        Map.entry("PATCH /api/orgs/{orgId}/me-workspace/resumes/{resumeId}", Case.consultantWrite("{\"name\":\"Hijacked resume\"}", 200)),
        Map.entry("POST /api/orgs/{orgId}/me-workspace/resumes/{resumeId}/activity", Case.consultantWrite("{\"kind\":\"VIEWED\"}", 204)),
        Map.entry("POST /api/orgs/{orgId}/me-workspace/resumes/{resumeId}/duplicate", Case.consultantWrite(null, 201)),
        // Resume Builder in the organization workspace (ent-resume): a consultant creates a builder resume under the license cap, and approves (or sends back) one a marketer made for them. Create writes no org audit row (the consultant's own data); the two decisions record theirs.
        Map.entry("POST /api/orgs/{orgId}/me-workspace/resumes/built", Case.consultantWrite("{\"label\":\"Hijacked builder resume\",\"source\":\"scratch\"}", 201)),
        Map.entry("POST /api/orgs/{orgId}/me-workspace/resumes/{resumeId}/approve", new Case("{\"versionNo\":1}", 200, "RESUME_APPROVE", false, null, null, 1, w -> { w.makeOwnerAConsultant(); w.makeCwsResumeAwaitConsultant(); })),
        Map.entry("POST /api/orgs/{orgId}/me-workspace/resumes/{resumeId}/request-changes", new Case("{\"note\":\"Please add my last role\",\"versionNo\":1}", 200, "RESUME_CHANGES_REQUESTED", false, null, null, 1, w -> { w.makeOwnerAConsultant(); w.makeCwsResumeAwaitConsultant(); })),
        Map.entry("GET /api/orgs/{orgId}/me-workspace/marketer", Case.consultantRead()),
        Map.entry("GET /api/orgs/{orgId}/me-workspace/matches", Case.consultantRead()),
        Map.entry("GET /api/orgs/{orgId}/me-workspace/matches/{matchId}", Case.consultantRead()),
        Map.entry("POST /api/orgs/{orgId}/me-workspace/matches/{matchId}/view", Case.consultantWrite(null, 200)),
        Map.entry("PUT /api/orgs/{orgId}/me-workspace/matches/{matchId}/save", Case.consultantWrite(null, 200)),
        Map.entry("DELETE /api/orgs/{orgId}/me-workspace/matches/{matchId}/save", Case.consultantWrite(null, 200)),
        Map.entry("POST /api/orgs/{orgId}/me-workspace/matches/{matchId}/interest", Case.consultantWrite("{\"note\":\"Hijack\"}", 200)),
        Map.entry("GET /api/orgs/{orgId}/me-workspace/job-discovery/overview", Case.consultantRead()),
        Map.entry("GET /api/orgs/{orgId}/me-workspace/job-discovery/search", Case.consultantRead()),
        Map.entry("GET /api/orgs/{orgId}/me-workspace/job-discovery/jobs/{requirementId}", Case.consultantRead()),
        Map.entry("POST /api/orgs/{orgId}/me-workspace/job-discovery/saved/{requirementId}", Case.consultantWrite(null, 200)),
        Map.entry("DELETE /api/orgs/{orgId}/me-workspace/job-discovery/saved/{requirementId}", Case.consultantWrite(null, 200)),
        Map.entry("POST /api/orgs/{orgId}/me-workspace/job-discovery/saved-searches", Case.consultantWrite("{\"name\":\"Hijack search\",\"filters\":{\"q\":\"java\"}}", 200)),
        Map.entry("DELETE /api/orgs/{orgId}/me-workspace/job-discovery/saved-searches/{id}", Case.consultantWrite(null, 204)),
        Map.entry("POST /api/orgs/{orgId}/me-workspace/job-discovery/saved-searches/{id}/viewed", Case.consultantWrite(null, 200)),
        Map.entry("POST /api/orgs/{orgId}/me-workspace/job-discovery/recent-searches", Case.consultantWrite("{\"q\":\"hijack\"}", 200)),
        // Second set of consultant pages. {matchId} of an opportunities route, {id} of a submissions route and {interviewId} of a feedback route
        // are substituted by World.ids() under another name (see uri()): those routes need an ASSIGNED match, a pending submission, a completed interview.
        Map.entry("GET /api/orgs/{orgId}/me-workspace/applications", Case.consultantRead()),
        Map.entry("GET /api/orgs/{orgId}/me-workspace/applications/{applicationId}", Case.consultantRead()),
        Map.entry("GET /api/orgs/{orgId}/me-workspace/interviews", Case.consultantRead()),
        Map.entry("GET /api/orgs/{orgId}/me-workspace/interviews/{interviewId}", Case.consultantRead()),
        Map.entry("PUT /api/orgs/{orgId}/me-workspace/interviews/{interviewId}/detail", Case.consultantWrite("{\"mode\":\"VIDEO\",\"meetingUrl\":\"https://meet.example.com/hijack\",\"interviewerTitle\":\"Hijack\",\"prepNote\":\"Hijacked note\"}", 200)),
        Map.entry("POST /api/orgs/{orgId}/me-workspace/interviews/{interviewId}/feedback", Case.consultantWrite("{\"outcome\":\"POSITIVE\",\"summary\":\"Hijacked feedback\"}", 200)),
        Map.entry("PUT /api/orgs/{orgId}/me-workspace/interviews/{interviewId}/feedback", new Case("{\"outcome\":\"NEGATIVE\",\"summary\":\"Hijacked feedback\"}", 200, null, false, null, null, 1, w -> { w.makeOwnerAConsultant(); w.addFeedbackToCompletedInterview(); })),
        Map.entry("GET /api/orgs/{orgId}/me-workspace/interview-prep", Case.consultantRead()),
        Map.entry("GET /api/orgs/{orgId}/me-workspace/interview-prep/sessions/{sessionId}", Case.consultantRead()),
        Map.entry("POST /api/orgs/{orgId}/me-workspace/interview-prep/sessions", Case.consultantWrite("{\"moduleKey\":\"technical\",\"durationMinutes\":10,\"answers\":[{\"questionId\":\"tech-1\",\"score\":80}]}", 200)),
        Map.entry("PUT /api/orgs/{orgId}/me-workspace/interview-prep/checklist/{itemKey}", Case.consultantWrite("{\"checked\":true}", 200)),
        Map.entry("GET /api/orgs/{orgId}/me-workspace/submissions", Case.consultantRead()),
        Map.entry("GET /api/orgs/{orgId}/me-workspace/submissions/past", Case.consultantRead()),
        Map.entry("GET /api/orgs/{orgId}/me-workspace/submissions/{id}", Case.consultantRead()),
        Map.entry("POST /api/orgs/{orgId}/me-workspace/submissions/{id}/approve", Case.consultantWrite(null, 200)),
        Map.entry("POST /api/orgs/{orgId}/me-workspace/submissions/{id}/decline", Case.consultantWrite("{\"reason\":\"Hijacked decline\"}", 200)),
        Map.entry("GET /api/orgs/{orgId}/me-workspace/opportunities", Case.consultantRead()),
        Map.entry("GET /api/orgs/{orgId}/me-workspace/opportunities/{matchId}", Case.consultantRead()),
        // The consultant's answer is the ONE shared mkt_opportunity record (the same transitions as /con/opportunities), so each answer writes its own CONSULTANT_OPPORTUNITY_* audit row.
        Map.entry("POST /api/orgs/{orgId}/me-workspace/opportunities/{matchId}/express-interest", new Case("{\"note\":\"Hijacked interest\"}", 200, "CONSULTANT_OPPORTUNITY_INTERESTED", false, null, null, 1, World::makeOwnerAConsultant)),
        Map.entry("POST /api/orgs/{orgId}/me-workspace/opportunities/{matchId}/need-more-info", new Case("{\"message\":\"Hijacked question\"}", 200, "CONSULTANT_OPPORTUNITY_INFO_REQUESTED", false, null, null, 1, World::makeOwnerAConsultant)),
        Map.entry("POST /api/orgs/{orgId}/me-workspace/opportunities/{matchId}/decline", new Case("{\"reason\":\"Hijacked decline\"}", 200, "CONSULTANT_OPPORTUNITY_DECLINED", false, null, null, 1, World::makeOwnerAConsultant)),
        Map.entry("POST /api/orgs/{orgId}/me-workspace/opportunities/{matchId}/reopen", new Case(null, 200, "CONSULTANT_OPPORTUNITY_REOPENED", false, null, null, 1, w -> { w.makeOwnerAConsultant(); w.declineAssignedOpportunity(); })),
        Map.entry("POST /api/orgs/{orgId}/me-workspace/opportunities/{matchId}/applied", new Case(null, 200, "CONSULTANT_OPPORTUNITY_APPLIED", false, null, null, 1, World::makeOwnerAConsultant)),
        Map.entry("POST /api/orgs/{orgId}/me-workspace/opportunities/{matchId}/request-resume-update", Case.consultantWrite("{\"note\":\"Hijacked update\"}", 200)),
        // The last eight consultant pages. {id} means the task / calendar entry / offer / notification by route prefix (see uri()).
        // ent-inbox: the consultant's OWN Gmail. Only the consultant reaches any of it (every other caller is the generic 404 below); the legitimate owner-as-consultant
        // has no license add-on in this world, so connecting is the 402 FEATURE_NOT_LICENSED, notify has no inbox to switch (409), a suggestion id nobody owns is 404.
        Map.entry("GET /api/orgs/{orgId}/me-workspace/inbox", Case.consultantRead()),
        Map.entry("POST /api/orgs/{orgId}/me-workspace/inbox", Case.consultantWrite("{\"address\":\"hijack.jobs@gmail.com\",\"appPassword\":\"abcdefghijklmnop\"}", 402)),
        Map.entry("DELETE /api/orgs/{orgId}/me-workspace/inbox", Case.consultantWrite(null, 200)),
        Map.entry("PUT /api/orgs/{orgId}/me-workspace/inbox/notify", Case.consultantWrite("{\"email\":false}", 409)),
        Map.entry("GET /api/orgs/{orgId}/me-workspace/inbox/suggestions", Case.consultantRead()),
        Map.entry("POST /api/orgs/{orgId}/me-workspace/inbox/suggestions/{suggestionId}/accept", Case.consultantWrite("{\"company\":\"Hijack Co\",\"roleTitle\":\"Hijacked\"}", 404)),
        Map.entry("POST /api/orgs/{orgId}/me-workspace/inbox/suggestions/{suggestionId}/dismiss", Case.consultantWrite(null, 404)),
        Map.entry("GET /api/orgs/{orgId}/me-workspace/inbox/updates", Case.consultantRead()),
        Map.entry("GET /api/orgs/{orgId}/me-workspace/tasks", Case.consultantRead()),
        Map.entry("GET /api/orgs/{orgId}/me-workspace/tasks/list", Case.consultantRead()),
        Map.entry("POST /api/orgs/{orgId}/me-workspace/tasks", Case.consultantWrite("{\"title\":\"A valid title\"}", 201)),
        Map.entry("PUT /api/orgs/{orgId}/me-workspace/tasks/{id}", Case.consultantWrite("{\"title\":\"A valid title\"}", 200)),
        Map.entry("PUT /api/orgs/{orgId}/me-workspace/tasks/{id}/status", Case.consultantWrite("{\"status\":\"DONE\"}", 200)),
        Map.entry("DELETE /api/orgs/{orgId}/me-workspace/tasks/{id}", Case.consultantWrite(null, 204)),
        Map.entry("GET /api/orgs/{orgId}/me-workspace/availability", Case.consultantRead()),
        Map.entry("PUT /api/orgs/{orgId}/me-workspace/availability/status", Case.consultantWrite("{\"status\":\"AVAILABLE\"}", 200)),
        Map.entry("POST /api/orgs/{orgId}/me-workspace/availability/blocks", Case.consultantWriteFor(w -> "{\"kind\":\"PERSONAL\",\"startDate\":\"" + java.time.LocalDate.now().plusDays(90) + "\",\"endDate\":\"" + java.time.LocalDate.now().plusDays(91) + "\"}", 200)),
        Map.entry("PUT /api/orgs/{orgId}/me-workspace/availability/blocks/{id}", Case.consultantWriteFor(w -> "{\"kind\":\"PERSONAL\",\"startDate\":\"" + java.time.LocalDate.now().plusDays(90) + "\",\"endDate\":\"" + java.time.LocalDate.now().plusDays(91) + "\",\"reason\":\"Hijacked\"}", 200)),
        Map.entry("DELETE /api/orgs/{orgId}/me-workspace/availability/blocks/{id}", Case.consultantWrite(null, 200)),
        Map.entry("PUT /api/orgs/{orgId}/me-workspace/availability/preferences", Case.consultantWrite("{\"workMode\":\"REMOTE\"}", 200)),
        Map.entry("GET /api/orgs/{orgId}/me-workspace/offers", Case.consultantRead()),
        Map.entry("GET /api/orgs/{orgId}/me-workspace/offers/list", Case.consultantRead()),
        Map.entry("GET /api/orgs/{orgId}/me-workspace/offers/{id}", Case.consultantRead()),
        Map.entry("POST /api/orgs/{orgId}/me-workspace/offers/{id}/accept", Case.consultantWrite(null, 200)),
        Map.entry("POST /api/orgs/{orgId}/me-workspace/offers/{id}/decline", Case.consultantWrite("{\"reason\":\"Hijacked decline\"}", 200)),
        Map.entry("POST /api/orgs/{orgId}/me-workspace/offers/{id}/negotiate", Case.consultantWrite("{\"note\":\"Hijacked negotiation\"}", 200)),
        Map.entry("GET /api/orgs/{orgId}/me-workspace/placements", Case.consultantRead()),
        Map.entry("PUT /api/orgs/{orgId}/me-workspace/placements/checklist/{itemId}", Case.consultantWrite("{\"completed\":true}", 200)),
        Map.entry("POST /api/orgs/{orgId}/me-workspace/placements/status-note", Case.consultantWrite("{\"note\":\"Going well\"}", 200)),
        Map.entry("GET /api/orgs/{orgId}/me-workspace/notifications", Case.consultantRead()),
        Map.entry("POST /api/orgs/{orgId}/me-workspace/notifications/read", Case.consultantWriteFor(w -> "{\"ids\":[" + w.notificationId + "],\"read\":true}", 200)),
        Map.entry("POST /api/orgs/{orgId}/me-workspace/notifications/resolve", Case.consultantWriteFor(w -> "{\"ids\":[" + w.notificationId + "]}", 200)),
        Map.entry("POST /api/orgs/{orgId}/me-workspace/notifications/snooze", Case.consultantWriteFor(w -> "{\"ids\":[" + w.notificationId + "],\"until\":\"" + Instant.now().plusSeconds(5 * 3600) + "\"}", 200)),
        Map.entry("POST /api/orgs/{orgId}/me-workspace/notifications/delete", Case.consultantWriteFor(w -> "{\"ids\":[" + w.notificationId + "]}", 200)),
        Map.entry("DELETE /api/orgs/{orgId}/me-workspace/notifications/{id}", Case.consultantWrite(null, 200)),
        Map.entry("POST /api/orgs/{orgId}/me-workspace/notifications/mark-all-read", Case.consultantWrite(null, 200)),
        Map.entry("POST /api/orgs/{orgId}/me-workspace/notifications/mute-non-critical", Case.consultantWrite(null, 200)),
        Map.entry("PUT /api/orgs/{orgId}/me-workspace/notifications/preferences/{category}", Case.consultantWrite("{\"enabled\":false}", 200)),
        Map.entry("PUT /api/orgs/{orgId}/me-workspace/notifications/preferences", Case.consultantWrite("{\"items\":[{\"category\":\"JOB_MATCH\",\"enabled\":false}]}", 200)),
        Map.entry("GET /api/orgs/{orgId}/me-workspace/activity-timeline", Case.consultantRead()),
        Map.entry("GET /api/orgs/{orgId}/me-workspace/features", Case.consultantRead()),
        Map.entry("GET /api/orgs/{orgId}/me-workspace/settings", Case.consultantRead()),
        Map.entry("PUT /api/orgs/{orgId}/me-workspace/settings/privacy", Case.consultantWrite("{\"profileVisibility\":\"PRIVATE\"}", 200)),
        Map.entry("PUT /api/orgs/{orgId}/me-workspace/settings/appearance", Case.consultantWrite("{\"theme\":\"DARK\"}", 200)),
        // Enterprise V2 Consultants board (talent-foundation.md section 5). Reads write no audit row; bulk calls write the changed rows plus one CONSULTANT_BULK summary.
        Map.entry("GET /api/orgs/{orgId}/consultants", Case.read()),
        Map.entry("GET /api/orgs/{orgId}/consultants/counts", Case.read()),
        Map.entry("GET /api/orgs/{orgId}/consultants/filters", Case.read()),
        Map.entry("GET /api/orgs/{orgId}/consultants/{consultantId}", Case.read()),
        Map.entry("GET /api/orgs/{orgId}/consultants/{consultantId}/assignments", Case.read()),
        Map.entry("GET /api/orgs/{orgId}/consultants/{consultantId}/applications", Case.read()),
        Map.entry("GET /api/orgs/{orgId}/consultants/{consultantId}/activity", Case.read()),
        Map.entry("GET /api/orgs/{orgId}/consultants/{consultantId}/job-options", Case.read()),
        Map.entry("GET /api/orgs/{orgId}/consultants/linkable-members", Case.read()),
        Map.entry("POST /api/orgs/{orgId}/consultants/{consultantId}/member", Case.versioned(200, "CONSULTANT_UPDATE", w -> "{\"memberId\":" + w.member.getId() + "}", w -> null)),
        Map.entry("POST /api/orgs/{orgId}/consultants", Case.write("{\"displayName\":\"Isolation Test\",\"email\":\"isolation.test@example.org\"}", 201, "CONSULTANT_CREATE")),
        Map.entry("PATCH /api/orgs/{orgId}/consultants/{consultantId}", Case.versioned(200, "CONSULTANT_UPDATE", w -> "{\"locationLabel\":\"Hijacked\"}", w -> w.consultantVersion)),
        Map.entry("POST /api/orgs/{orgId}/consultants/{consultantId}/marketer", Case.versioned(200, "CONSULTANT_ASSIGN", w -> "{\"marketerMemberId\":" + w.member.getId() + "}", w -> null)),
        Map.entry("POST /api/orgs/{orgId}/consultants/{consultantId}/deactivate", Case.write("{\"reason\":\"Isolation test deactivation\"}", 200, "CONSULTANT_DEACTIVATE")),
        Map.entry("POST /api/orgs/{orgId}/consultants/{consultantId}/reactivate", Case.write(null, 200, null)),
        Map.entry("POST /api/orgs/{orgId}/consultants/{consultantId}/applications", Case.versioned(201, "APPLICATION_CREATE", w -> "{\"requirementId\":" + w.requirementId + "}", w -> null)),
        Map.entry("POST /api/orgs/{orgId}/consultants/bulk/availability", Case.people(200, "CONSULTANT_BULK", 2, w -> "{\"ids\":[" + w.consultantId + "],\"availability\":\"ON_PROJECT\"}", null, null)),
        Map.entry("POST /api/orgs/{orgId}/consultants/bulk/marketer", Case.people(200, "CONSULTANT_BULK", 2, w -> "{\"ids\":[" + w.consultantId + "],\"marketerMemberId\":" + w.member.getId() + "}", null, null)),
        Map.entry("POST /api/orgs/{orgId}/consultants/bulk/status", Case.people(200, "CONSULTANT_BULK", 2, w -> "{\"ids\":[" + w.consultantId + "],\"action\":\"DEACTIVATE\",\"reason\":\"Isolation test deactivation\"}", null, null)),
        // Talent pages: the Resumes board (ent-resumes). The world holds one approved, non-primary, internal resume of one consultant.
        Map.entry("GET /api/orgs/{orgId}/resumes", Case.read()),
        Map.entry("GET /api/orgs/{orgId}/resumes/counts", Case.read()),
        Map.entry("GET /api/orgs/{orgId}/resumes/filters", Case.read()),
        Map.entry("GET /api/orgs/{orgId}/resumes/consultants", Case.read()),
        Map.entry("GET /api/orgs/{orgId}/resumes/{resumeId}", Case.read()),
        Map.entry("GET /api/orgs/{orgId}/resumes/{resumeId}/export", Case.write(null, 200, "RESUME_EXPORT")),
        // Only an APPROVED resume can be primary, and REOPEN of a resume that is still PENDING is a recorded no-op (nothing changed, so no audit row): both need an approved resume first.
        Map.entry("PUT /api/orgs/{orgId}/resumes/{resumeId}/primary", Case.people(200, "RESUME_PRIMARY", 1, w -> "{\"primary\":true}", null, World::approveResume)),
        Map.entry("PUT /api/orgs/{orgId}/resumes/{resumeId}/visibility", Case.write("{\"visibility\":\"PUBLIC\"}", 200, "RESUME_VISIBILITY")),
        Map.entry("POST /api/orgs/{orgId}/resumes/{resumeId}/decision", Case.people(200, "RESUME_REOPEN", 1, w -> "{\"decision\":\"REOPEN\"}", null, World::approveResume)),
        Map.entry("POST /api/orgs/{orgId}/resumes", Case.versioned(201, "RESUME_CREATE", w -> "{\"consultantId\":" + w.consultantProfileId + ",\"name\":\"Isolation resume\"}", w -> null)),
        Map.entry("POST /api/orgs/{orgId}/resumes/bulk", Case.people(200, "RESUME_BULK", 2, w -> "{\"ids\":[" + w.resumeId + "],\"action\":\"VISIBILITY\",\"visibility\":\"PUBLIC\"}", null, null)),
        // Talent board "Jobs": reads, create (Idempotency-Key), edit (If-Match), bulk status (a JOB_STATUS row per job + the JOB_BULK summary), assign and dismiss a match
        Map.entry("GET /api/orgs/{orgId}/jobs", Case.read()),
        Map.entry("GET /api/orgs/{orgId}/jobs/summary", Case.read()),
        Map.entry("GET /api/orgs/{orgId}/jobs/{jobId}", Case.read()),
        Map.entry("POST /api/orgs/{orgId}/jobs", Case.versioned(201, "JOB_CREATE", w -> "{\"title\":\"Hijack job\",\"clientId\":" + w.jobClientId + "}", w -> null)),
        Map.entry("PATCH /api/orgs/{orgId}/jobs/{jobId}", Case.versioned(200, "JOB_UPDATE", w -> "{\"title\":\"Hijacked job\"}", w -> w.jobVersion)),
        // Enterprise V2 (ent-accounts-ws): the Account Manager's Requirements page. {requirementId} here means the world's job (see uri()).
        Map.entry("GET /api/orgs/{orgId}/requirements", Case.read()),
        Map.entry("GET /api/orgs/{orgId}/requirements/summary", Case.read()),
        Map.entry("GET /api/orgs/{orgId}/requirements/{requirementId}", Case.read()),
        Map.entry("GET /api/orgs/{orgId}/requirements/{requirementId}/candidates", Case.read()),
        Map.entry("POST /api/orgs/{orgId}/requirements", Case.people(201, "REQUIREMENT_INTAKE", 2, w -> "{\"title\":\"Hijack requirement\",\"clientId\":" + w.jobClientId + ",\"source\":\"MANUAL\"}", null, null)),
        Map.entry("PATCH /api/orgs/{orgId}/requirements/{requirementId}", Case.versioned(200, "JOB_UPDATE", w -> "{\"priority\":\"URGENT\"}", w -> w.jobVersion)),
        Map.entry("POST /api/orgs/{orgId}/requirements/{requirementId}/assignments", Case.mkt(200, "REQUIREMENT_ASSIGN", w -> "{\"consultantId\":" + w.consultantProfileId + "}", World::approveResume)),
        Map.entry("POST /api/orgs/{orgId}/jobs/bulk/status", Case.people(200, "JOB_BULK", 2, w -> "{\"ids\":[" + w.jobId + "],\"status\":\"ON_HOLD\"}", null, null)),
        Map.entry("POST /api/orgs/{orgId}/jobs/{jobId}/matches/{matchId}/assign", Case.people(200, "JOB_ASSIGN", 1, null, null, null)),
        Map.entry("PATCH /api/orgs/{orgId}/jobs/{jobId}/matches/{matchId}", Case.versioned(200, "JOB_MATCH_DISMISS", w -> "{\"status\":\"DISMISSED\"}", w -> null)),
        // Enterprise V2 (ent-clients): the Clients page. Reads write no audit row; each change writes its own CLIENT_* row (target type CLIENT).
        Map.entry("GET /api/orgs/{orgId}/clients", Case.read()),
        Map.entry("GET /api/orgs/{orgId}/clients/summary", Case.read()),
        Map.entry("GET /api/orgs/{orgId}/clients/contacts", Case.read()),
        Map.entry("GET /api/orgs/{orgId}/clients/requirements", Case.read()),
        Map.entry("GET /api/orgs/{orgId}/clients/activity", Case.read()),
        Map.entry("GET /api/orgs/{orgId}/clients/{clientId}", Case.read()),
        Map.entry("POST /api/orgs/{orgId}/clients", Case.versioned(201, "CLIENT_CREATE", w -> "{\"name\":\"Hijack client\"}", w -> null)),
        Map.entry("PATCH /api/orgs/{orgId}/clients/{clientId}", Case.versioned(200, "CLIENT_UPDATE", w -> "{\"about\":\"Hijacked\"}", w -> w.clientVersion)),
        Map.entry("POST /api/orgs/{orgId}/clients/{clientId}/contacts", Case.versioned(201, "CLIENT_CONTACT_ADD", w -> "{\"name\":\"Mallory Contact\"}", w -> null)),
        Map.entry("PATCH /api/orgs/{orgId}/clients/{clientId}/contacts/{contactId}", Case.versioned(200, "CLIENT_CONTACT_UPDATE", w -> "{\"status\":\"LEFT\"}", w -> null)),
        Map.entry("POST /api/orgs/{orgId}/clients/{clientId}/notes", Case.versioned(201, "CLIENT_NOTE_ADD", w -> "{\"body\":\"Hijack note\"}", w -> null)),
        // Enterprise V2 (ent-marketing): the Marketing Assignments board. Reads write no audit row; every change writes its own rows plus one MARKETING_BULK summary (marketer admin: one row).
        Map.entry("GET /api/orgs/{orgId}/marketing-assignments/marketers", Case.read()),
        Map.entry("GET /api/orgs/{orgId}/marketing-assignments/marketers/candidates", Case.read()),
        Map.entry("GET /api/orgs/{orgId}/marketing-assignments/consultants", Case.read()),
        Map.entry("GET /api/orgs/{orgId}/marketing-assignments/filters", Case.read()),
        Map.entry("GET /api/orgs/{orgId}/marketing-assignments/kpis", Case.read()),
        Map.entry("GET /api/orgs/{orgId}/marketing-assignments/workload", Case.read()),
        Map.entry("POST /api/orgs/{orgId}/marketing-assignments/marketers", Case.people(201, "MARKETER_ADD", 1, w -> "{\"memberId\":" + w.mktFreshMarketer() + ",\"capacity\":9}", null, null)),
        Map.entry("PATCH /api/orgs/{orgId}/marketing-assignments/marketers/{memberId}", Case.people(200, "MARKETER_UPDATE", 1, w -> "{\"capacity\":7}", null, w -> w.mktCapacity())),
        Map.entry("POST /api/orgs/{orgId}/marketing-assignments/assign", Case.people(200, "MARKETING_BULK", 2, w -> "{\"consultantIds\":[" + w.mktConsultantId + "],\"marketerMemberId\":" + w.member.getId() + "}", null, w -> w.mktCapacity())),
        Map.entry("POST /api/orgs/{orgId}/marketing-assignments/update", Case.people(200, "MARKETING_BULK", 2, w -> "{\"consultantIds\":[" + w.mktConsultantId + "],\"priority\":\"HIGH\"}", null, w -> w.mktAssigned())),
        Map.entry("POST /api/orgs/{orgId}/marketing-assignments/unassign", Case.people(200, "MARKETING_BULK", 2, w -> "{\"consultantIds\":[" + w.mktConsultantId + "]}", null, w -> w.mktAssigned())),
        Map.entry("POST /api/orgs/{orgId}/marketing-assignments/restore", Case.people(200, "MARKETING_BULK", 2, w -> "{\"rows\":[{\"consultantId\":" + w.mktConsultantId + ",\"marketerMemberId\":null}]}", null, w -> w.mktAssigned())),
        // Enterprise V2 Applications page (docs/enterprise-v2/page-applications.md): reads write no audit row; every mutation writes one APPLICATION_* row.
        Map.entry("GET /api/orgs/{orgId}/applications", Case.read()),
        Map.entry("GET /api/orgs/{orgId}/applications/counts", Case.read()),
        Map.entry("GET /api/orgs/{orgId}/applications/filters", Case.read()),
        Map.entry("GET /api/orgs/{orgId}/applications/pickers", Case.read()),
        Map.entry("GET /api/orgs/{orgId}/applications/pipeline", Case.read()),
        Map.entry("GET /api/orgs/{orgId}/applications/analytics", Case.read()),
        Map.entry("GET /api/orgs/{orgId}/applications/{applicationId}", Case.read()),
        Map.entry("POST /api/orgs/{orgId}/applications", Case.versioned(201, "APPLICATION_CREATE", w -> "{\"requirementId\":" + w.appTalent.requirementId() + ",\"consultantId\":" + w.appTalent.spareConsultantId() + "}", w -> null)),
        Map.entry("PATCH /api/orgs/{orgId}/applications/{applicationId}", Case.versioned(200, "APPLICATION_UPDATE", w -> "{\"nextAction\":\"Hijacked\"}", w -> null)),
        Map.entry("POST /api/orgs/{orgId}/applications/{applicationId}/stage", Case.versioned(200, "APPLICATION_STAGE", w -> "{\"stage\":\"SUBMITTED\"}", w -> null)),
        Map.entry("POST /api/orgs/{orgId}/applications/{applicationId}/notes", Case.versioned(201, "APPLICATION_NOTE", w -> "{\"body\":\"Hijacked note\"}", w -> null)),
        // Enterprise V2 Interviews page (docs/enterprise-v2/page-interviews.md): reads write no audit row; every mutation writes one INTERVIEW_* row.
        Map.entry("GET /api/orgs/{orgId}/interviews", Case.read()),
        Map.entry("GET /api/orgs/{orgId}/interviews/counts", Case.read()),
        Map.entry("GET /api/orgs/{orgId}/interviews/filters", Case.read()),
        Map.entry("GET /api/orgs/{orgId}/interviews/pickers", Case.read()),
        Map.entry("GET /api/orgs/{orgId}/interviews/pipeline", Case.read()),
        Map.entry("GET /api/orgs/{orgId}/interviews/analytics", Case.read()),
        Map.entry("GET /api/orgs/{orgId}/interviews/{interviewId}", Case.read()),
        Map.entry("POST /api/orgs/{orgId}/interviews", Case.versioned(201, "INTERVIEW_CREATE", w -> "{\"consultantId\":" + w.appTalent.spareConsultantId() + ",\"clientId\":" + w.appTalent.clientId() + ",\"scheduledAt\":\"" + java.time.Instant.now().plus(java.time.Duration.ofDays(40)).truncatedTo(java.time.temporal.ChronoUnit.HOURS) + "\"}", w -> null)),
        Map.entry("PATCH /api/orgs/{orgId}/interviews/{interviewId}", Case.versioned(200, "INTERVIEW_UPDATE", w -> "{\"notes\":\"Hijacked note\"}", w -> null)),
        Map.entry("POST /api/orgs/{orgId}/interviews/{interviewId}/reschedule", Case.people(200, "INTERVIEW_RESCHEDULE", 1, w -> "{\"scheduledAt\":\"" + java.time.Instant.now().plus(java.time.Duration.ofDays(12)).truncatedTo(java.time.temporal.ChronoUnit.HOURS) + "\"}", null, w -> w.interviewState("SCHEDULED"))),
        Map.entry("POST /api/orgs/{orgId}/interviews/{interviewId}/status", Case.people(200, "INTERVIEW_STATUS", 1, w -> "{\"status\":\"IN_PROGRESS\"}", null, w -> w.interviewState("SCHEDULED"))),
        Map.entry("POST /api/orgs/{orgId}/interviews/{interviewId}/reminder", Case.people(200, "INTERVIEW_REMINDER", 1, w -> "{}", null, w -> w.interviewState("SCHEDULED"))),
        Map.entry("POST /api/orgs/{orgId}/interviews/{interviewId}/feedback", Case.people(201, "INTERVIEW_FEEDBACK", 1, w -> "{\"rating\":4,\"recommendation\":\"ADVANCE\"}", null, w -> w.interviewState("COMPLETED"))),
        // Org Admin Reports (reports.view at ORG scope): a read, no audit row; a stranger or a member without the key gets the generic 404.
        Map.entry("GET /api/orgs/{orgId}/reports/overview", Case.read()),
        // Enterprise V2 Placements page (docs/enterprise-v2/page-placements.md): reads write no audit row; every mutation writes one PLACEMENT_* row.
        Map.entry("GET /api/orgs/{orgId}/placements", Case.read()),
        Map.entry("GET /api/orgs/{orgId}/placements/counts", Case.read()),
        Map.entry("GET /api/orgs/{orgId}/placements/filters", Case.read()),
        Map.entry("GET /api/orgs/{orgId}/placements/pickers", Case.read()),
        Map.entry("GET /api/orgs/{orgId}/placements/{placementId}", Case.read()),
        Map.entry("POST /api/orgs/{orgId}/placements", Case.versioned(201, "PLACEMENT_CREATE", w -> "{\"consultantId\":" + w.plTalent.spareConsultantId() + ",\"clientId\":" + w.plTalent.clientId() + ",\"roleTitle\":\"Hijack\",\"startDate\":\"2026-01-05\"}", w -> null)),
        Map.entry("POST /api/orgs/{orgId}/placements/{placementId}/extend", Case.versioned(200, "PLACEMENT_EXTEND", w -> "{\"endDate\":\"" + java.time.LocalDate.now().plusDays(400) + "\"}", w -> null)),
        Map.entry("POST /api/orgs/{orgId}/placements/{placementId}/extension-requests", Case.people(201, "PLACEMENT_EXTENSION_REQUEST", 1, w -> "{\"requestedEndDate\":\"" + java.time.LocalDate.now().plusDays(400) + "\"}", w -> null, World::clearPlacementExtensions)),
        Map.entry("POST /api/orgs/{orgId}/placements/{placementId}/extensions/{extensionId}/decision", Case.versioned(200, "PLACEMENT_EXTENSION_DECIDE", w -> "{\"decision\":\"APPROVE\"}", w -> null)),
        Map.entry("POST /api/orgs/{orgId}/placements/{placementId}/complete", Case.versioned(200, "PLACEMENT_COMPLETE", w -> "{\"note\":\"Hijacked\"}", w -> null)),
        Map.entry("POST /api/orgs/{orgId}/placements/{placementId}/redeploy", Case.versioned(200, "PLACEMENT_REDEPLOY", w -> "{}", w -> null)),
        Map.entry("POST /api/orgs/{orgId}/placements/{placementId}/redeploy/cancel", Case.people(200, "PLACEMENT_REDEPLOY_CANCEL", 1, w -> null, w -> null, World::putPlacementInPool)),
        Map.entry("POST /api/orgs/{orgId}/placements/{placementId}/notes", Case.versioned(201, "PLACEMENT_NOTE", w -> "{\"body\":\"Hijacked note\"}", w -> null)),
        // Offers to placement (X9.8, X10.4): the Accounts Offers page and the end of a placement. The CONSULTANT answers an offer; there is no accept or decline route here.
        Map.entry("GET /api/orgs/{orgId}/offers", Case.read()),
        Map.entry("GET /api/orgs/{orgId}/offers/counts", Case.read()),
        Map.entry("GET /api/orgs/{orgId}/offers/pickers", Case.read()),
        Map.entry("GET /api/orgs/{orgId}/offers/{offerId}", Case.read()),
        Map.entry("POST /api/orgs/{orgId}/offers", Case.versioned(201, "OFFER_CREATE", w -> "{\"consultantId\":" + w.plTalent.spareConsultantId() + ",\"clientId\":" + w.plTalent.clientId() + ",\"roleTitle\":\"Hijack\",\"startDate\":\"" + java.time.LocalDate.now().plusDays(20) + "\"}", w -> null)),
        Map.entry("PUT /api/orgs/{orgId}/offers/{offerId}", Case.versioned(200, "OFFER_UPDATE", w -> "{\"rateMinor\":10500,\"ratePeriod\":\"HOUR\"}", w -> null)),
        Map.entry("POST /api/orgs/{orgId}/offers/{offerId}/extend", Case.people(200, "OFFER_EXTEND", 1, w -> null, w -> null, World::draftTheOffer)),
        Map.entry("POST /api/orgs/{orgId}/offers/{offerId}/withdraw", Case.versioned(200, "OFFER_WITHDRAW", w -> "{}", w -> null)),
        Map.entry("POST /api/orgs/{orgId}/offers/{offerId}/placement", Case.people(200, "OFFER_PLACEMENT", 2, w -> null, w -> null, World::acceptTheOffer)),
        Map.entry("POST /api/orgs/{orgId}/placements/{placementId}/terminate", Case.versioned(200, "PLACEMENT_TERMINATE", w -> "{\"reason\":\"Hijacked\"}", w -> null)),
        Map.entry("POST /api/orgs/{orgId}/placements/{placementId}/notice", Case.versioned(200, "PLACEMENT_NOTICE", w -> "{\"endDate\":\"" + java.time.LocalDate.now().plusDays(10) + "\"}", w -> null)),
        Map.entry("GET /api/orgs/{orgId}/submissions", Case.read()),
        Map.entry("GET /api/orgs/{orgId}/submissions/counts", Case.read()),
        Map.entry("POST /api/orgs/{orgId}/placements/{placementId}/undo", Case.people(200, "PLACEMENT_UNDO", 1, w -> "{\"eventId\":" + w.plUndoEventId + "}", w -> null, World::preparePlacementUndo)),
        // Enterprise V2 job data audit (docs/enterprise-v2/60 section 11): read only, needs audit.view at ORG scope (the owner has it, every role without it gets the generic 404).
        Map.entry("GET /api/orgs/{orgId}/audit/job-data", Case.read()),
        Map.entry("GET /api/orgs/{orgId}/audit", Case.read()),
        Map.entry("GET /api/orgs/{orgId}/audit/export", Case.auditedRead(OrgAuditService.EXPORT)),
        Map.entry("GET /api/orgs/{orgId}/reports/export", Case.auditedRead(OrgAuditService.EXPORT)),
        // Enterprise V2 Marketing workspace (mkt/**, ent-marketer). The legitimate caller is the owner (every marketing permission at ORG scope) in a world whose marketing module is on and whose
        // marketing rows were made through the real API (World.seedMkt). Reads write no audit row; every write records its own MARKETER_* row; the writes below that are documented as audit-free
        // are personal working state of the caller (a saved view, a saved search's "seen" marker, a prep checklist tick), like the dashboard alert dismissal above.
        Map.entry("GET /api/orgs/{orgId}/mkt/home", Case.mktRead()),
        Map.entry("GET /api/orgs/{orgId}/mkt/activity", Case.mktRead()),
        Map.entry("POST /api/orgs/{orgId}/mkt/activity", Case.mkt(200, "MARKETER_ACTIVITY_CREATE", w -> "{\"consultantId\":" + w.consultantProfileId + ",\"type\":\"RESUME_UPDATED\",\"title\":\"Hijack activity\"}", null)),
        Map.entry("PATCH /api/orgs/{orgId}/mkt/activity/{id}/status", Case.mkt(200, "MARKETER_ACTIVITY_STATUS", w -> "{\"status\":\"CANCELLED\"}", null)),
        Map.entry("GET /api/orgs/{orgId}/mkt/applications", Case.mktRead()),
        Map.entry("POST /api/orgs/{orgId}/mkt/applications/{applicationId}/notes", Case.mkt(200, "MKT_APPLICATION_NOTE", w -> "{\"body\":\"Hijacked note\"}", null)),
        Map.entry("PATCH /api/orgs/{orgId}/mkt/applications/{applicationId}/next-action", Case.mkt(200, "MKT_APPLICATION_NEXT_ACTION", w -> "{\"nextAction\":\"Hijacked next action\"}", null)),
        Map.entry("POST /api/orgs/{orgId}/mkt/applications/{applicationId}/follow-up-done", Case.mkt(200, "MKT_APPLICATION_FOLLOWUP_DONE", w -> null, World::mktApplicationNextAction)),
        Map.entry("POST /api/orgs/{orgId}/mkt/applications/{applicationId}/stage", Case.mkt(200, "MKT_APPLICATION_STAGE_RECORDED", w -> "{\"stage\":\"interviewing\"}", null)),
        Map.entry("GET /api/orgs/{orgId}/mkt/followups", Case.mktRead()),
        Map.entry("GET /api/orgs/{orgId}/mkt/followups/list", Case.mktRead()),
        Map.entry("POST /api/orgs/{orgId}/mkt/followups", Case.mkt(200, "MARKETER_FOLLOWUP_CREATE", w -> "{\"consultantId\":" + w.consultantProfileId + ",\"title\":\"Hijack follow-up\",\"dueAt\":\"" + Instant.now().plusSeconds(2 * 86400L) + "\"}", null)),
        Map.entry("PATCH /api/orgs/{orgId}/mkt/followups/{id}/status", Case.mkt(200, "MARKETER_FOLLOWUP_STATUS", w -> "{\"status\":\"IN_PROGRESS\"}", null)),
        Map.entry("POST /api/orgs/{orgId}/mkt/followups/{id}/complete", Case.mkt(200, "MARKETER_FOLLOWUP_STATUS", w -> null, null)),
        Map.entry("POST /api/orgs/{orgId}/mkt/followups/{id}/call", Case.mkt(200, "MARKETER_FOLLOWUP_CALL", w -> "{\"note\":\"Called the recruiter\"}", null)),
        Map.entry("POST /api/orgs/{orgId}/mkt/followups/{id}/reminder", Case.mkt(200, "MARKETER_FOLLOWUP_REMINDER", w -> "{\"note\":\"Nudge\"}", null)),
        // The browser extension's "save for consultant": needs an Idempotency-Key (request()). The world's job is already known by its ATS identity, so the call assigns the consultant to it.
        Map.entry("POST /api/orgs/{orgId}/mkt/opportunities/job", Case.mkt(201, "MARKETER_JOB_CREATE", w -> "{\"title\":\"Hijack hand job\",\"company\":\"Hijack Co\",\"location\":\"Austin, TX\",\"workMode\":\"REMOTE\",\"description\":\"Entered by hand.\"}", World::mktHandJobStored)),
        Map.entry("POST /api/orgs/{orgId}/mkt/opportunities/from-extension",Case.mkt(200, "MARKETER_JOB_CAPTURE", w -> "{\"jobUrl\":\"https://boards.example.com/jobs/" + w.p + "-1\",\"title\":\"Hijack capture\",\"company\":\"Hijack Co\",\"atsPlatform\":\"greenhouse\",\"externalJobId\":\"" + w.p + "1\",\"consultantIds\":[" + w.consultantProfileId + "],\"keyInfo\":\"Lead with the integration work.\",\"extensionVersion\":\"1.0.0\"}", World::approveResume)),
        Map.entry("GET /api/orgs/{orgId}/mkt/interviews", Case.mktRead()),
        Map.entry("GET /api/orgs/{orgId}/mkt/interviews/{interviewId}/prep", Case.mktRead()),
        // Ticking a prep item is the checklist's own working state (the item row carries who and when); it writes no audit row by design.
        Map.entry("PATCH /api/orgs/{orgId}/mkt/interviews/{interviewId}/prep/{itemId}", Case.mkt(200, null, w -> "{\"done\":true}", null)),
        Map.entry("POST /api/orgs/{orgId}/mkt/interviews/{interviewId}/reschedule", Case.mkt(200, "MARKETER_INTERVIEW_RESCHEDULE", w -> "{\"proposedAt\":\"" + Instant.now().plusSeconds(20 * 86400L) + "\"}", null)),
        Map.entry("POST /api/orgs/{orgId}/mkt/interviews/{interviewId}/confirm", Case.mkt(200, "MARKETER_INTERVIEW_CONFIRM", w -> null, null)),
        Map.entry("POST /api/orgs/{orgId}/mkt/interviews/{interviewId}/feedback", Case.mkt(200, "MARKETER_INTERVIEW_FEEDBACK", w -> "{\"outcome\":\"PASSED\",\"note\":\"Went well\"}", w -> w.interviewState("COMPLETED"))),
        Map.entry("POST /api/orgs/{orgId}/mkt/interviews/{interviewId}/remind", Case.mkt(200, "MARKETER_INTERVIEW_REMIND", w -> null, null)),
        Map.entry("GET /api/orgs/{orgId}/mkt/jobs", Case.mktRead()),
        Map.entry("GET /api/orgs/{orgId}/mkt/jobs/{jobId}", Case.mktRead()),
        Map.entry("GET /api/orgs/{orgId}/mkt/jobs/{jobId}/candidates", Case.mktRead()),
        Map.entry("POST /api/orgs/{orgId}/mkt/jobs/{jobId}/assign", Case.mkt(200, "MKT_JOB_ASSIGN", w -> "{\"consultantId\":" + w.consultantProfileId + "}", World::approveResume)),
        Map.entry("POST /api/orgs/{orgId}/mkt/jobs/saved-searches", Case.mkt(201, "MKT_SAVED_SEARCH_CREATE", w -> "{\"name\":\"Hijack search\",\"criteria\":{\"q\":\"python\"}}", null)),
        // "Seen" only moves the caller's own last-looked-at marker on the caller's own search; it writes no audit row by design.
        Map.entry("POST /api/orgs/{orgId}/mkt/jobs/saved-searches/{searchId}/seen", Case.mkt(204, null, w -> null, null)),
        Map.entry("DELETE /api/orgs/{orgId}/mkt/jobs/saved-searches/{searchId}", Case.mkt(204, "MKT_SAVED_SEARCH_DELETE", w -> null, null)),
        Map.entry("GET /api/orgs/{orgId}/mkt/matches", Case.mktRead()),
        Map.entry("GET /api/orgs/{orgId}/mkt/matches/compare", Case.mktRead()),
        Map.entry("GET /api/orgs/{orgId}/mkt/matches/{id}", Case.mktRead()),
        Map.entry("POST /api/orgs/{orgId}/mkt/matches/{id}/assign", Case.mkt(200, "MKT_MATCH_ASSIGN", w -> null, World::approveResume)),
        Map.entry("POST /api/orgs/{orgId}/mkt/matches/{id}/dismiss", Case.mkt(200, "MKT_MATCH_DISMISS", w -> null, null)),
        Map.entry("GET /api/orgs/{orgId}/mkt/opportunities", Case.mktRead()),
        Map.entry("GET /api/orgs/{orgId}/mkt/opportunities/export", Case.mkt(200, "EXPORT", w -> null, null)),
        Map.entry("GET /api/orgs/{orgId}/mkt/opportunities/options", Case.mktRead()),
        Map.entry("GET /api/orgs/{orgId}/mkt/opportunities/{id}", Case.mktRead()),
        Map.entry("POST /api/orgs/{orgId}/mkt/opportunities", Case.mkt(200, "MARKETER_OPPORTUNITY_CREATE", w -> "{\"consultantId\":" + w.consultantProfileId + ",\"requirementId\":" + w.jobId + "}", World::mktDismissMatch)),
        Map.entry("POST /api/orgs/{orgId}/mkt/opportunities/{id}/assign", Case.mkt(200, "MARKETER_OPPORTUNITY_ASSIGN", w -> null, World::approveResume)),
        Map.entry("POST /api/orgs/{orgId}/mkt/opportunities/bulk-assign", Case.mkt(200, "MARKETER_OPPORTUNITY_BULK_ASSIGN", w -> "{\"ids\":[" + w.mktMatchId + "]}", World::approveResume)),
        Map.entry("POST /api/orgs/{orgId}/mkt/opportunities/notify", Case.mkt(200, "MARKETER_OPPORTUNITY_NOTIFY", w -> null, World::mktAwaitingInterest)),
        Map.entry("POST /api/orgs/{orgId}/mkt/opportunities/{id}/request", Case.mkt(200, "MARKETER_OPPORTUNITY_REQUEST", w -> "{\"kind\":\"RESUME\"}", null)),
        Map.entry("POST /api/orgs/{orgId}/mkt/opportunities/{id}/withdraw", Case.mkt(200, "MARKETER_OPPORTUNITY_WITHDRAW", w -> "{\"reason\":\"The client paused hiring for this role.\"}", World::mktAssignOpportunity)),
        Map.entry("POST /api/orgs/{orgId}/mkt/opportunities/{id}/reassign", Case.mkt(200, "MARKETER_OPPORTUNITY_REASSIGN", w -> "{\"consultantId\":" + w.consultantId + "}", World::mktReassignable)),
        Map.entry("POST /api/orgs/{orgId}/mkt/opportunities/{id}/answer-info",Case.mkt(200, "MARKETER_OPPORTUNITY_INFO_ANSWER", w -> "{\"answer\":\"Yes, a W2 option is available.\"}", World::mktNeedsInfo)),
        Map.entry("POST /api/orgs/{orgId}/mkt/opportunities/{id}/review", Case.mkt(200, "MARKETER_OPPORTUNITY_REVIEW", w -> null, null)),
        Map.entry("PATCH /api/orgs/{orgId}/mkt/opportunities/{id}/next-action", Case.mkt(200, "MARKETER_OPPORTUNITY_NEXT_ACTION", w -> "{\"nextActionAt\":\"" + Instant.now().plusSeconds(5 * 86400L) + "\"}", null)),
        Map.entry("GET /api/orgs/{orgId}/mkt/performance", Case.mktRead()),
        Map.entry("PUT /api/orgs/{orgId}/mkt/performance/goals", Case.mkt(200, "MARKETER_GOALS_UPDATE", w -> "{\"submissions\":12}", null)),
        Map.entry("GET /api/orgs/{orgId}/mkt/resumes", Case.mktRead()),
        Map.entry("GET /api/orgs/{orgId}/mkt/resumes/{id}", Case.mktRead()),
        // No file bytes are stored for an org resume: a legitimate download is a 404 with its own code (NO_FILE_STORED), after the scope check; every hostile caller gets the generic one.
        Map.entry("GET /api/orgs/{orgId}/mkt/resumes/{id}/download", Case.mkt(404, null, w -> null, null)),
        Map.entry("PATCH /api/orgs/{orgId}/mkt/resumes/{id}", Case.mkt(200, "MARKETER_RESUME_EDIT", w -> "{\"title\":\"Hijacked resume title\"}", null)),
        Map.entry("POST /api/orgs/{orgId}/mkt/resumes/{id}/approval-request", Case.mkt(200, "MARKETER_APPROVAL_REQUEST", w -> null, World::approveResume)),
        Map.entry("POST /api/orgs/{orgId}/mkt/resumes/{id}/needs-update", Case.mkt(200, "MARKETER_RESUME_FLAG", w -> "{\"note\":\"Refresh the skills\"}", null)),
        Map.entry("POST /api/orgs/{orgId}/mkt/resumes/{id}/approve", Case.mkt(200, "RESUME_APPROVE", w -> null, null)),
        // New resume for a consultant (act-for): the picker, the sources of one consultant, and the create, which saves the resume under the CONSULTANT's account and records MARKETER_RESUME_CREATE with the consultant as beneficiary.
        Map.entry("GET /api/orgs/{orgId}/mkt/resumes/consultants", Case.mktRead()),
        Map.entry("GET /api/orgs/{orgId}/mkt/resumes/consultants/{consultantId}/sources", Case.mktRead()),
        Map.entry("POST /api/orgs/{orgId}/mkt/resumes/consultants/{consultantId}/built", Case.mkt(201, "MARKETER_RESUME_CREATE", w -> "{\"label\":\"Hijacked resume for a consultant\",\"source\":\"scratch\"}", null)),
        Map.entry("GET /api/orgs/{orgId}/mkt/streams", Case.mktRead()),
        Map.entry("POST /api/orgs/{orgId}/mkt/streams", Case.mkt(201, "MARKETER_STREAM_CREATE", w -> "{\"sourceLabel\":\"Hijack stream\"}", null)),
        Map.entry("PATCH /api/orgs/{orgId}/mkt/streams/{streamId}", Case.mkt(200, "MARKETER_STREAM_UPDATE", w -> "{\"subtitle\":\"Hijacked\"}", null)),
        Map.entry("POST /api/orgs/{orgId}/mkt/streams/{streamId}/pause", Case.mkt(200, "MARKETER_STREAM_PAUSE", w -> null, null)),
        Map.entry("POST /api/orgs/{orgId}/mkt/streams/{streamId}/resume", Case.mkt(200, "MARKETER_STREAM_RESUME", w -> null, null)),
        Map.entry("PATCH /api/orgs/{orgId}/mkt/streams/rules/{ruleKey}", Case.mkt(200, "MARKETER_STREAM_RULE", w -> "{\"enabled\":true,\"value\":\"java\"}", null)),
        Map.entry("GET /api/orgs/{orgId}/mkt/submissions", Case.mktRead()),
        Map.entry("GET /api/orgs/{orgId}/mkt/submissions/options", Case.mktRead()),
        Map.entry("GET /api/orgs/{orgId}/mkt/submissions/{id}", Case.mktRead()),
        Map.entry("POST /api/orgs/{orgId}/mkt/submissions", Case.mkt(201, "MARKETER_SUBMISSION_CREATE", w -> "{\"consultantId\":" + w.consultantProfileId + ",\"requirementId\":" + w.jobId + ",\"resumeId\":" + w.resumeId + "}", null)),
        Map.entry("POST /api/orgs/{orgId}/mkt/submissions/{id}/request-approval", Case.mkt(200, "MARKETER_SUBMISSION_REQUEST_APPROVAL", w -> null, null)),
        Map.entry("POST /api/orgs/{orgId}/mkt/submissions/{id}/approval", Case.mkt(200, "MARKETER_SUBMISSION_APPROVAL", w -> "{\"decision\":\"APPROVED\"}", World::mktSubmissionAwaiting)),
        Map.entry("PATCH /api/orgs/{orgId}/mkt/submissions/{id}/status", Case.mkt(200, "MARKETER_SUBMISSION_STATUS", w -> "{\"status\":\"SUBMITTED\"}", World::mktSubmissionApproved)),
        Map.entry("DELETE /api/orgs/{orgId}/mkt/submissions/{id}", Case.mkt(204, "MARKETER_SUBMISSION_WITHDRAW", w -> null, null)),
        // Saved views are the caller's own convenience (a name and a filter); they write no audit row by design.
        Map.entry("POST /api/orgs/{orgId}/mkt/submissions/views", Case.mkt(201, null, w -> "{\"name\":\"Hijack view\",\"q\":\"python\"}", null)),
        Map.entry("DELETE /api/orgs/{orgId}/mkt/submissions/views/{viewId}", Case.mkt(204, null, w -> null, null)),
        Map.entry("GET /api/orgs/{orgId}/mkt/talent", Case.mktRead()),
        Map.entry("GET /api/orgs/{orgId}/mkt/talent/{consultantId}", Case.mktRead()),
        // Demo gaps: the selected consultant in full (read-only, MarketerAccess seam), and a marketer saving a job for an assigned consultant (save only, never submit).
        Map.entry("GET /api/orgs/{orgId}/mkt/talent/{consultantId}/overview", Case.mktRead()),
        // The only consultant with an enterprise account in this world is the owner, and acting for yourself is refused (the generic 404), so a legitimate call here is the 404 that writes nothing;
        // the success path (assigned marketer saves, duplicate, audit, Updated by) is in SaveForConsultantResourceIT.
        Map.entry("POST /api/orgs/{orgId}/consultants/{memberId}/applications/save", Case.denied("{\"company\":\"Isolation Co\",\"roleTitle\":\"Engineer\"}")),
        Map.entry("POST /api/orgs/{orgId}/mkt/talent/views", Case.mkt(201, null, w -> "{\"name\":\"Hijack view\",\"q\":\"python\"}", null)),
        Map.entry("DELETE /api/orgs/{orgId}/mkt/talent/views/{viewId}", Case.mkt(204, null, w -> null, null)),
        Map.entry("GET /api/orgs/{orgId}/mkt/tasks", Case.mktRead()),
        Map.entry("GET /api/orgs/{orgId}/mkt/tasks/calendar", Case.mktRead()),
        Map.entry("GET /api/orgs/{orgId}/mkt/tasks/{id}/assignees", Case.mktRead()),
        Map.entry("POST /api/orgs/{orgId}/mkt/tasks", Case.mkt(200, "MARKETER_TASK_CREATE", w -> "{\"title\":\"Hijack task\",\"dueAt\":\"" + Instant.now().plusSeconds(2 * 86400L) + "\"}", null)),
        Map.entry("PATCH /api/orgs/{orgId}/mkt/tasks/{id}", Case.mkt(200, "MARKETER_TASK_UPDATE", w -> "{\"title\":\"Hijacked task\"}", null)),
        Map.entry("POST /api/orgs/{orgId}/mkt/tasks/{id}/complete", Case.mkt(200, "MARKETER_TASK_COMPLETE", w -> null, null)),
        Map.entry("POST /api/orgs/{orgId}/mkt/tasks/{id}/reopen", Case.mkt(200, "MARKETER_TASK_REOPEN", w -> null, World::mktCompleteTask)),
        Map.entry("POST /api/orgs/{orgId}/mkt/tasks/{id}/reassign", Case.mkt(200, "MARKETER_TASK_REASSIGN", w -> "{\"ownerMemberId\":" + w.member.getId() + "}", World::mktAssigned)), // a task about no consultant can go to any marketer that holds an assignment
        Map.entry("DELETE /api/orgs/{orgId}/mkt/tasks/{id}", Case.mkt(200, "MARKETER_TASK_DELETE", w -> null, null))
    ));

    // ---- wiring ---------------------------------------------------------------------------------------------------

    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper om;
    @Autowired @Qualifier("requestMappingHandlerMapping") private RequestMappingHandlerMapping mapping;
    @Autowired private EntityManager em;
    @Autowired private UserRepository users;
    @Autowired private OrganizationRepository orgs;
    @Autowired private OrgMemberRepository members;
    @Autowired private OrgGroupRepository groups;
    @Autowired private com.dossier.api.repository.org.OrgGroupPlacementRepository placements;
    @Autowired private OrgInviteBatchRepository batches;
    @Autowired private OrgJoinCodeRepository codes;
    @Autowired private OrgDomainRepository domains;
    @Autowired private OrgAuditEventRepository audit;
    @Autowired private DataShareRepository shares;
    @Autowired private DataShareEventRepository shareEvents;
    @Autowired private DataShareService dataShare;
    @Autowired private OrgResumeSharing resumeSharing;
    @Autowired private com.dossier.api.service.ent.OrgRoleService roleService;
    @Autowired private com.dossier.api.repository.ent.OrgRoleRepository roleRepo;
    @Autowired private com.dossier.api.repository.ent.OrgRolePermissionRepository permissionRepo;
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
        // The Marketing workspace (mkt/**) answers the generic 404 to EVERYONE, the owner included, while the marketing module is off for the org: switched on here so that the
        // hostile callers below are refused by the tenant and permission checks themselves, and the legitimate calls really run the services.
        settingRows.save(new AppSetting(EnterpriseSettingKeys.FLAG_MARKETING, "{\"on\":true}", FLAG_WRITER, Instant.now()));
        settingsCache.invalidate();
    }

    @AfterEach
    void enterpriseFlagsOff() {
        for (AppSetting row : settingRows.findAll()) if (FLAG_WRITER.equals(row.getUpdatedBy())) settingRows.delete(row);
        settingsCache.invalidate();
    }
    @Autowired private com.dossier.api.repository.ent.OrgMemberOffboardingRepository offboardingRows;
    // Jobs page (talent board): one client, consultant, job and suggested match per world
    @Autowired private com.dossier.api.repository.ent.talent.ClientAccountRepository jobClients;
    @Autowired private com.dossier.api.repository.ent.talent.ClientContactRepository clientContactRows;
    @Autowired private com.dossier.api.repository.ent.talent.ClientNoteRepository clientNoteRows;
    @Autowired private com.dossier.api.repository.ent.talent.ConsultantProfileRepository jobConsultants;
    @Autowired private com.dossier.api.repository.ent.talent.ClientRequirementRepository jobRows;
    @Autowired private com.dossier.api.repository.ent.talent.RequirementMatchRepository jobMatches;
    @Autowired private com.dossier.api.service.ent.members.OrgMemberQueryService memberQuery;
    @Autowired private OrgBrandingRepository brandings;
    @Autowired private com.dossier.api.service.ent.OrgPolicyService policyService;
    @Autowired private OrgBrandingVersionRepository brandingVersions;
    @Autowired private com.dossier.api.repository.ent.talent.ConsultantProfileRepository talentConsultants;
    @Autowired private com.dossier.api.repository.ent.talent.OrgResumeRepository talentResumes;

    // ---- ent-marketing fixtures: the Marketing Assignments routes need a marketer (capacity row), a consultant profile and sometimes an assignment (helpers live in World) ----
    @Autowired private com.dossier.api.repository.ent.talent.ConsultantProfileRepository mktConsultants;
    @Autowired private com.dossier.api.repository.ent.talent.MarketerCapacityRepository mktCapacities;
    @Autowired private com.dossier.api.repository.ent.talent.MarketerAssignmentRepository mktAssignments;
    @Autowired private com.dossier.api.repository.ent.mkt.MktOpportunityRepository mktOpportunities;

    @Autowired private com.dossier.api.repository.ent.talent.ConsultantSkillRepository consultantSkills;
    @Autowired private com.dossier.api.repository.ent.talent.OrgResumeRepository orgResumes;
    @Autowired private com.dossier.api.repository.ent.consultantws.CwsCertificationRepository cwsCerts;
    @Autowired private com.dossier.api.repository.ent.consultantws.CwsProfilePrefRepository cwsPrefs;
    @Autowired private com.dossier.api.repository.ent.consultantws.CwsSavedSearchRepository cwsSavedSearches;
    @Autowired private com.dossier.api.repository.ent.talent.ClientAccountRepository clientAccounts;
    @Autowired private com.dossier.api.repository.ent.talent.ClientRequirementRepository clientRequirements;
    @Autowired private com.dossier.api.repository.ent.talent.RequirementMatchRepository requirementMatches;

    @Autowired private com.dossier.api.repository.ent.consultantws.CwsInterviewRepository cwsInterviews;
    @Autowired private com.dossier.api.repository.ent.consultantws.CwsInterviewFeedbackRepository cwsInterviewFeedback;
    @Autowired private com.dossier.api.repository.ent.consultantws.CwsPrepSessionRepository cwsPrepSessions;
    @Autowired private com.dossier.api.repository.ent.consultantws.CwsSubmissionRepository cwsSubmissions;
    @Autowired private com.dossier.api.repository.ent.consultantws.CwsOpportunityResponseRepository cwsOpportunityResponses;
    @Autowired private com.dossier.api.repository.ent.talent.TalentApplicationRepository talentApplications;
    @Autowired private com.dossier.api.repository.ent.consultantws.CwsTaskRepository cwsTasks;
    @Autowired private com.dossier.api.repository.ent.consultantws.CwsAvailabilityBlockRepository cwsBlocks;
    @Autowired private com.dossier.api.repository.ent.consultantws.CwsOfferRepository cwsOffers;
    @Autowired private com.dossier.api.repository.ent.talent.TalentPlacementRepository talentPlacements;
    @Autowired private com.dossier.api.repository.ent.consultantws.CwsPlacementChecklistRepository cwsChecklist;
    @Autowired private com.dossier.api.repository.ent.consultantws.CwsNotificationRepository cwsNotifications;

    private OrgFixtures fx;

    @Autowired private com.dossier.api.repository.ent.OrgMemberRoleRepository memberRoleRows;
    @Autowired private com.dossier.api.repository.ent.talent.ConsultantProfileRepository consultantProfiles;

    /** Gives the seat the Consultant role; the consultant_profile is already there (every World seeds one for its owner). */
    private void makeConsultant(Long orgId, OrgMember seat) {
        com.dossier.api.domain.ent.OrgMemberRole r = new com.dossier.api.domain.ent.OrgMemberRole();
        r.setOrgId(orgId);
        r.setMemberId(seat.getId());
        r.setRoleId(roleRepo.findSystemByRoleKey(com.dossier.api.service.ent.RoleTemplates.CONSULTANT).orElseThrow().getId());
        r.setPrimary(false);
        r.setGrantedAt(Instant.now());
        memberRoleRows.saveAndFlush(r);
    }

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
        /** X1.14: one custom role of this organization, its version, and the id of the CONSULTANT template (what a legitimate PUT hands to the member). */
        Long roleId;
        String roleVersion;
        Long consultantRoleId;
        /** X4.5: the weak ETag of this world's group, what a legitimate edit or delete sends as If-Match. */
        String groupVersion;
        /** X4.3/X4.4: a department of this organization, the member's version (ETag), and one scheduled last day for the member. */
        OrgGroup department;
        String memberVersion;
        Long offboardingId;
        /** Consultant workspace: the rows of the owner's consultant profile (own-scoped; A's ids are named from B's org in the cross-tenant sweep). */
        Long skillId, certId, prefId, resumeId, matchId, requirementId, savedSearchId;
        /** The second set of consultant pages: an ASSIGNED match, a SCHEDULED and a COMPLETED interview, a prep session, a PENDING_APPROVAL submission, an application. */
        Long consultantId, clientId, assignedRequirementId, assignedMatchId, scheduledInterviewId, completedInterviewId, prepSessionId, submissionId, applicationId;
        /** The last eight pages: a task, a calendar entry, a PENDING_REVIEW offer with a future deadline, a checklist item of an ACTIVE placement, a notification. */
        Long taskId, availabilityBlockId, offerId, placementChecklistId, notificationId;
        /** Consultants board: one consultant (with its ETag), one OPEN job, and marketer capacity for the member. */
        String consultantVersion;
        /** Resumes board: one consultant of this organization and one approved, non-primary, internal resume of theirs. */
        Long consultantProfileId;
        /** Jobs page: a client, an OPEN job of it (with its ETag version) and one suggested match of that job. */
        Long jobClientId;
        Long jobId;
        String jobVersion;
        /** Clients page: the version (ETag) of that client and one contact of it. */
        String clientVersion;
        Long clientContactId;
        /** Applications page: one client, job, two consultants and an ASSIGNED application of this organization. */
        com.dossier.api.web.rest.ent.ApplicationItSupport.Rows appTalent;
        /** Interviews page: one SCHEDULED interview of that application. */
        Long interviewId;
        /** Placements page: one client, two consultants, an ACTIVE placement and a REQUESTED extension of it (the id of an undoable event is made by the route prepare step). */
        com.dossier.api.web.rest.ent.PlacementItSupport.Rows plTalent;
        Long plUndoEventId = 1L;
        /** The consultant workspace's own RequirementMatch (the owner-as-consultant's matches routes mean this one, not the jobs page's match). */
        Long cwsMatchId, cwsResumeId, cwsRequirementId, cwsApplicationId, cwsConsultantId;

        /** The Undo route needs the callers own latest, still undoable change. */
        Long offerRowId;

        void preparePlacementUndo() {
            plUndoEventId = com.dossier.api.web.rest.ent.PlacementItSupport.undoableEvent(em, org.getId(), plTalent.placementId(), owner.getId());
        }

        /** The extend route needs a draft offer. */
        void draftTheOffer() {
            em.createQuery("update CwsOffer o set o.status = 'DRAFT' where o.orgId = :o").setParameter("o", org.getId()).executeUpdate();
            em.flush();
            em.clear();
        }

        /** The create-placement route needs an accepted offer of a consultant with no placement and a linked client. */
        void acceptTheOffer() {
            em.createQuery("update CwsOffer o set o.status = 'ACCEPTED', o.respondedAt = :now where o.orgId = :o").setParameter("o", org.getId()).setParameter("now", java.time.Instant.now()).executeUpdate();
            em.flush();
            em.clear();
        }

        /** The request an extension route needs a placement with no extension waiting. */
        void clearPlacementExtensions() {
            em.createQuery("update PlacementExtension e set e.status = 'CANCELLED' where e.orgId = :o").setParameter("o", org.getId()).executeUpdate();
            em.flush();
            em.clear();
        }

        /** The leave the pool route needs a consultant who is in it. */
        void putPlacementInPool() {
            em.createQuery("update TalentPlacement p set p.redeploymentPool = true where p.orgId = :o").setParameter("o", org.getId()).executeUpdate();
            em.flush();
            em.clear();
        }

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
            groupVersion = "W/\"" + group.getVersion() + "\"";

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

            // X1.14: every seat reads its roles from data (the write routes need a data-backed caller), and the org owns one custom role.
            for (OrgMember seat : everySeat()) roleService.syncFromLegacy(seat);
            consultantRoleId = roleRepo.findSystemByRoleKey(com.dossier.api.service.ent.RoleTemplates.CONSULTANT).orElseThrow().getId();
            com.dossier.api.domain.ent.OrgRoleDefinition custom = new com.dossier.api.domain.ent.OrgRoleDefinition();
            custom.setOrgId(org.getId());
            custom.setRoleKey("CUSTOM_" + prefix.toUpperCase());
            custom.setName(prefix + " custom role");
            custom.setTemplateKey(com.dossier.api.service.ent.RoleTemplates.EXECUTIVE_VIEWER);
            custom = roleRepo.saveAndFlush(custom);
            com.dossier.api.domain.ent.OrgRolePermission customRow = permissionRepo.saveAndFlush(
                new com.dossier.api.domain.ent.OrgRolePermission(custom.getId(), "reports.view", com.dossier.api.domain.enumeration.PermissionScope.ORG, null, null)
            );
            roleId = custom.getId();
            roleVersion = com.dossier.api.service.ent.OrgRoleWriteService.versionOf(custom, java.util.List.of(customRow));

            // The member shares a summary with their org: one data_share row and its event.
            dataShare.grant(me(member), ShareScope.SUMMARY, null, OrgShareConsent.CURRENT, ShareContext.EMPTY);
            // X4.3/X4.4: a department, the version of the member's sheet, and a scheduled last day (far ahead) for the member.
            OrgGroup dept = new OrgGroup();
            dept.setOrgId(org.getId());
            dept.setName(prefix + " department");
            dept.setKind(OrgGroupKind.DEPARTMENT);
            department = groups.saveAndFlush(dept);
            com.dossier.api.domain.ent.OrgMemberOffboarding sched = new com.dossier.api.domain.ent.OrgMemberOffboarding();
            sched.setOrgId(org.getId());
            sched.setMemberId(member.getId());
            sched.setEffectiveAt(Instant.now().plusSeconds(86400L * 90));
            sched.setReason("Scheduled for the isolation test");
            sched.setCreatedByMemberId(owner.getId());
            offboardingId = offboardingRows.saveAndFlush(sched).getId();
            // Consultant workspace: a consultant_profile for the owner (the Consultant ROLE is only added by makeOwnerAConsultant) and one
            // row of every table the me-workspace routes name by id, all belonging to that profile.
            com.dossier.api.domain.ent.talent.ConsultantProfile cp = new com.dossier.api.domain.ent.talent.ConsultantProfile();
            cp.setOrgId(org.getId());
            cp.setMemberId(owner.getId());
            cp.setDisplayName("Isolation Consultant");
            cp.setEmail(prefix + "-consultant@example.org");
            cp = consultantProfiles.saveAndFlush(cp);
            // decision O4 + the act-for review (2026-10-15): a marketer only prepares a resume for a consultant whose sign-in is an ENTERPRISE account of the organization
            com.dossier.api.domain.User ownerAccount = users.findById(owner.getUserId()).orElseThrow();
            ownerAccount.setOrgId(org.getId());
            users.saveAndFlush(ownerAccount);
            com.dossier.api.domain.ent.talent.ConsultantSkill sk = new com.dossier.api.domain.ent.talent.ConsultantSkill();
            sk.setOrgId(org.getId());
            sk.setConsultantId(cp.getId());
            sk.setSkill("Java");
            sk.setPrimarySkill(true);
            sk.setSortOrder(0);
            skillId = consultantSkills.saveAndFlush(sk).getId();
            com.dossier.api.domain.ent.consultantws.CwsCertification ce = new com.dossier.api.domain.ent.consultantws.CwsCertification();
            ce.setOrgId(org.getId());
            ce.setConsultantId(cp.getId());
            ce.setName("Isolation cert");
            certId = cwsCerts.saveAndFlush(ce).getId();
            com.dossier.api.domain.ent.consultantws.CwsProfilePref pf = new com.dossier.api.domain.ent.consultantws.CwsProfilePref();
            pf.setOrgId(org.getId());
            pf.setConsultantId(cp.getId());
            pf.setKind("ROLE");
            pf.setValue("Architect");
            prefId = cwsPrefs.saveAndFlush(pf).getId();
            com.dossier.api.domain.ent.talent.OrgResume rs = new com.dossier.api.domain.ent.talent.OrgResume();
            rs.setOrgId(org.getId());
            rs.setConsultantId(cp.getId());
            rs.setMemberId(owner.getId());
            rs.setName(prefix + " resume");
            rs.setPrimaryForOrg(true);
            resumeId = orgResumes.saveAndFlush(rs).getId();
            cwsResumeId = resumeId;
            com.dossier.api.domain.ent.talent.ClientAccount ca = new com.dossier.api.domain.ent.talent.ClientAccount();
            ca.setOrgId(org.getId());
            ca.setName(prefix + " client");
            ca = clientAccounts.saveAndFlush(ca);
            com.dossier.api.domain.ent.talent.ClientRequirement rq = new com.dossier.api.domain.ent.talent.ClientRequirement();
            rq.setOrgId(org.getId());
            rq.setClientId(ca.getId());
            rq.setTitle(prefix + " Java Developer");
            requirementId = clientRequirements.saveAndFlush(rq).getId();
            cwsRequirementId = requirementId;
            com.dossier.api.domain.ent.talent.RequirementMatch rm = new com.dossier.api.domain.ent.talent.RequirementMatch();
            rm.setOrgId(org.getId());
            rm.setRequirementId(requirementId);
            rm.setConsultantId(cp.getId());
            rm.setScore(88);
            rm.setStatus("SUGGESTED");
            rm.setReason("Skills align with this role.");
            matchId = requirementMatches.saveAndFlush(rm).getId();
            cwsMatchId = matchId; // a merge let the jobs page's `matchId = jm.getId()` overwrite this one, so the consultant's own match routes got another consultant's match
            com.dossier.api.domain.ent.consultantws.CwsSavedSearch ss = new com.dossier.api.domain.ent.consultantws.CwsSavedSearch();
            ss.setOrgId(org.getId());
            ss.setConsultantId(cp.getId());
            ss.setKind(com.dossier.api.domain.ent.consultantws.CwsSavedSearch.SAVED);
            ss.setName(prefix + " search");
            ss.setKeyword("java");
            savedSearchId = cwsSavedSearches.saveAndFlush(ss).getId();
            consultantId = cp.getId();
            cwsConsultantId = consultantId; // the Consultants page's fixture below overwrites consultantId; the consultant workspace helpers mean this one
            clientId = ca.getId();
            com.dossier.api.domain.ent.talent.ClientRequirement rq2 = new com.dossier.api.domain.ent.talent.ClientRequirement();
            rq2.setOrgId(org.getId());
            rq2.setClientId(ca.getId());
            rq2.setTitle(prefix + " Platform Engineer");
            assignedRequirementId = clientRequirements.saveAndFlush(rq2).getId();
            com.dossier.api.domain.ent.talent.RequirementMatch am = new com.dossier.api.domain.ent.talent.RequirementMatch();
            am.setOrgId(org.getId());
            am.setRequirementId(assignedRequirementId);
            am.setConsultantId(cp.getId());
            am.setScore(81);
            am.setStatus("ASSIGNED");
            am.setReason("Assigned by the marketer.");
            assignedMatchId = requirementMatches.saveAndFlush(am).getId();
            com.dossier.api.domain.ent.talent.TalentApplication app = new com.dossier.api.domain.ent.talent.TalentApplication();
            app.setOrgId(org.getId());
            app.setCode("APP-" + prefix.toUpperCase());
            app.setRequirementId(requirementId);
            app.setConsultantId(cp.getId());
            app.setClientId(ca.getId());
            app.setStage("SUBMITTED");
            app.setAppliedOn(java.time.LocalDate.now().minusDays(3));
            applicationId = talentApplications.saveAndFlush(app).getId();
            cwsApplicationId = applicationId;
            scheduledInterviewId = interview(app, "SCHEDULED", Instant.now().plusSeconds(86400L * 2));
            completedInterviewId = interview(app, "COMPLETED", Instant.now().minusSeconds(86400L * 2));
            com.dossier.api.domain.ent.consultantws.CwsPrepSession ps = new com.dossier.api.domain.ent.consultantws.CwsPrepSession();
            ps.setOrgId(org.getId());
            ps.setConsultantId(cp.getId());
            ps.setTitle(prefix + " practice");
            ps.setKind(com.dossier.api.domain.ent.consultantws.CwsPrepSession.TECHNICAL);
            ps.setScore(70);
            ps.setDurationMinutes(10);
            prepSessionId = cwsPrepSessions.saveAndFlush(ps).getId();
            com.dossier.api.domain.ent.consultantws.CwsSubmission sub = new com.dossier.api.domain.ent.consultantws.CwsSubmission();
            sub.setOrgId(org.getId());
            sub.setConsultantId(cp.getId());
            sub.setRequirementId(requirementId);
            sub.setResumeId(resumeId);
            sub.setDueAt(Instant.now().plusSeconds(86400L * 3));
            submissionId = cwsSubmissions.saveAndFlush(sub).getId();
            com.dossier.api.domain.ent.consultantws.CwsTask tk = new com.dossier.api.domain.ent.consultantws.CwsTask();
            tk.setOrgId(org.getId());
            tk.setConsultantId(cp.getId());
            tk.setTitle(prefix + " follow-up");
            taskId = cwsTasks.saveAndFlush(tk).getId();
            com.dossier.api.domain.ent.consultantws.CwsAvailabilityBlock blk = new com.dossier.api.domain.ent.consultantws.CwsAvailabilityBlock();
            blk.setOrgId(org.getId());
            blk.setConsultantId(cp.getId());
            blk.setKind("PERSONAL");
            blk.setStartDate(java.time.LocalDate.now().plusDays(10));
            blk.setEndDate(java.time.LocalDate.now().plusDays(12));
            blk.setStatus("APPROVED");
            availabilityBlockId = cwsBlocks.saveAndFlush(blk).getId();
            com.dossier.api.domain.ent.consultantws.CwsOffer of = new com.dossier.api.domain.ent.consultantws.CwsOffer();
            of.setOrgId(org.getId());
            of.setConsultantId(cp.getId());
            of.setClientName(prefix + " client");
            of.setRoleTitle(prefix + " Staff Engineer");
            of.setOfferDeadline(java.time.LocalDate.now().plusDays(14));
            of.setStatus("PENDING_REVIEW");
            offerId = cwsOffers.saveAndFlush(of).getId();
            com.dossier.api.domain.ent.talent.TalentPlacement pl = new com.dossier.api.domain.ent.talent.TalentPlacement();
            pl.setOrgId(org.getId());
            pl.setConsultantId(cp.getId());
            pl.setClientId(ca.getId());
            pl.setRoleTitle(prefix + " Placement");
            pl.setStatus("ACTIVE");
            pl.setStartDate(java.time.LocalDate.now().minusDays(30));
            pl = talentPlacements.saveAndFlush(pl);
            com.dossier.api.domain.ent.consultantws.CwsPlacementChecklist pc = new com.dossier.api.domain.ent.consultantws.CwsPlacementChecklist();
            pc.setOrgId(org.getId());
            pc.setPlacementId(pl.getId());
            pc.setLabel("Send the signed paperwork");
            pc.setDueOn(java.time.LocalDate.now().plusDays(3));
            placementChecklistId = cwsChecklist.saveAndFlush(pc).getId();
            com.dossier.api.domain.ent.consultantws.CwsNotification nf = new com.dossier.api.domain.ent.consultantws.CwsNotification();
            nf.setOrgId(org.getId());
            nf.setConsultantId(cp.getId());
            nf.setCategory("JOB_MATCH");
            nf.setTitle(prefix + " notification");
            nf.setSourceKey("isolation-" + prefix);
            notificationId = cwsNotifications.saveAndFlush(nf).getId();
            em.flush();
            memberVersion = memberQuery.currentVersion(org.getId(), member);
            ConsultantIsolationFixture.Rows talent = ConsultantIsolationFixture.create(em, org.getId(), prefix, member.getId());
            consultantId = talent.consultantId();
            consultantVersion = talent.consultantVersion();
            requirementId = talent.requirementId();
            com.dossier.api.domain.ent.talent.ConsultantProfile cpB = new com.dossier.api.domain.ent.talent.ConsultantProfile();
            cpB.setOrgId(org.getId());
            cpB.setDisplayName(prefix + " consultant");
            cpB.setEmail(prefix + "-consultant@example.org");
            consultantProfileId = talentConsultants.saveAndFlush(cpB).getId();
            com.dossier.api.domain.ent.talent.OrgResume rsB = new com.dossier.api.domain.ent.talent.OrgResume();
            rsB.setOrgId(org.getId());
            rsB.setConsultantId(consultantProfileId);
            rsB.setName(prefix + " resume");
            rsB.setOwnerMemberId(member.getId());
            resumeId = talentResumes.saveAndFlush(rsB).getId();
            // Jobs page: one client, one consultant, one OPEN job and one suggested match
            com.dossier.api.domain.ent.talent.ClientAccount jc = new com.dossier.api.domain.ent.talent.ClientAccount();
            jc.setOrgId(org.getId());
            jc.setName(prefix + " jobs-board client");
            jc = jobClients.saveAndFlush(jc);
            jobClientId = jc.getId();
            com.dossier.api.domain.ent.talent.ClientContact cc = new com.dossier.api.domain.ent.talent.ClientContact();
            cc.setOrgId(org.getId());
            cc.setClientId(jobClientId);
            cc.setName(prefix + " client contact");
            cc.setWorkEmail(prefix.replaceAll("[^A-Za-z0-9]", "") + "@client.example.com");
            clientContactId = clientContactRows.saveAndFlush(cc).getId();
            com.dossier.api.domain.ent.talent.ConsultantProfile jp = new com.dossier.api.domain.ent.talent.ConsultantProfile();
            jp.setOrgId(org.getId());
            jp.setDisplayName(prefix + " consultant");
            jp.setEmail(prefix + "-consultant@example.com");
            jp = jobConsultants.saveAndFlush(jp);
            com.dossier.api.domain.ent.talent.ClientRequirement jr = new com.dossier.api.domain.ent.talent.ClientRequirement();
            jr.setOrgId(org.getId());
            jr.setClientId(jobClientId);
            jr.setTitle(prefix + " job");
            jr = jobRows.saveAndFlush(jr);
            com.dossier.api.domain.ent.talent.RequirementMatch jm = new com.dossier.api.domain.ent.talent.RequirementMatch();
            jm.setOrgId(org.getId());
            jm.setRequirementId(jr.getId());
            jm.setConsultantId(jp.getId());
            jm.setScore(91);
            jm = jobMatches.saveAndFlush(jm);
            em.flush();
            em.refresh(jr); // the version is the stored (microsecond) instant, not the in-memory one
            em.refresh(jc);
            clientVersion = com.dossier.api.service.ent.clients.ClientBoardService.versionOf(jc);
            jobId = jr.getId();
            matchId = jm.getId();
            jobVersion = com.dossier.api.service.ent.jobs.JobBoardService.versionOf(jr);
            appTalent = com.dossier.api.web.rest.ent.ApplicationItSupport.seed(em, org.getId(), owner.getId());
            plTalent = com.dossier.api.web.rest.ent.PlacementItSupport.seed(em, org.getId(), owner.getId()); // (a merge had moved this line into interviewState)
            com.dossier.api.domain.ent.consultantws.CwsOffer offerRow = new com.dossier.api.domain.ent.consultantws.CwsOffer();
            offerRow.setOrgId(org.getId());
            offerRow.setConsultantId(plTalent.spareConsultantId());
            offerRow.setClientId(plTalent.clientId());
            offerRow.setClientName(prefix + " offer client");
            offerRow.setRoleTitle("Offer Fixture Engineer");
            offerRow.setStatus(com.dossier.api.domain.ent.consultantws.CwsOffer.PENDING_REVIEW);
            offerRow.setStartDate(java.time.LocalDate.now().plusDays(30));
            offerRow.setOfferDeadline(java.time.LocalDate.now().plusDays(30));
            offerRow.setCreatedByMemberId(owner.getId());
            offerRow.setUpdatedByMemberId(owner.getId());
            em.persist(offerRow);
            em.flush();
            offerRowId = offerRow.getId();
            com.dossier.api.domain.ent.talent.TalentInterview iv = new com.dossier.api.domain.ent.talent.TalentInterview();
            iv.setOrgId(org.getId());
            iv.setApplicationId(appTalent.applicationId());
            iv.setConsultantId(appTalent.consultantId());
            iv.setClientId(appTalent.clientId());
            iv.setScheduledAt(java.time.Instant.now().plus(java.time.Duration.ofDays(10)).truncatedTo(java.time.temporal.ChronoUnit.HOURS));
            em.persist(iv);
            em.flush();
            interviewId = iv.getId();
        }

        /** Puts the world's interview in {@code status}, ten days out, with no reminder recorded (what each interview route needs to find). */
        void interviewState(String status) {
            em.createQuery("update TalentInterview i set i.status = :s, i.reminderRequestedAt = null, i.scheduledAt = :t where i.orgId = :o and i.id = :id")
                .setParameter("s", status).setParameter("t", java.time.Instant.now().plus(java.time.Duration.ofDays(10)).truncatedTo(java.time.temporal.ChronoUnit.HOURS)).setParameter("o", org.getId()).setParameter("id", interviewId).executeUpdate();
            em.clear();
        }

        /** ent-marketing: the id of this world's consultant profile (a made-up id until a prepare created it, which must also give a generic answer). */
        Long mktConsultantId = 1L;
        Long mktFresh;

        /** The world's member holds a marketing role (what "add a marketer" promotes). */
        void mktMarketingRole() {
            member.setRole(OrgRole.MARKETER);
            members.saveAndFlush(member);
            roleService.syncFromLegacy(member);
            em.flush();
        }

        /** A marketer (capacity row) for the world's member, plus one consultant profile. */
        /** A second active seat with a marketing role and no capacity row yet (the member itself already has one from the Consultants fixture). */
        Long mktFreshMarketer() {
            if (mktFresh == null) {
                OrgMember seat = fx.active(org, p + "-mkt-new", OrgRole.MARKETER);
                roleService.syncFromLegacy(seat);
                em.flush();
                mktFresh = seat.getId();
            }
            return mktFresh;
        }

        void mktCapacity() {
            mktMarketingRole();
            if (mktCapacities.findByOrgIdAndMemberId(org.getId(), member.getId()).isEmpty()) { // the Consultants fixture may have added it already
                com.dossier.api.domain.ent.talent.MarketerCapacity c = new com.dossier.api.domain.ent.talent.MarketerCapacity();
                c.setOrgId(org.getId());
                c.setMemberId(member.getId());
                c.setCapacity(5);
                mktCapacities.saveAndFlush(c);
            }
            com.dossier.api.domain.ent.talent.ConsultantProfile k = new com.dossier.api.domain.ent.talent.ConsultantProfile();
            k.setOrgId(org.getId());
            k.setDisplayName(p + " consultant");
            k.setEmail(p + "-consultant@example.org");
            mktConsultantId = mktConsultants.saveAndFlush(k).getId();
        }

        void mktAssigned() {
            mktCapacity();
            com.dossier.api.domain.ent.talent.MarketerAssignment a = new com.dossier.api.domain.ent.talent.MarketerAssignment();
            a.setOrgId(org.getId());
            a.setConsultantId(mktConsultantId);
            a.setMarketerMemberId(member.getId());
            mktAssignments.saveAndFlush(a);
        }

        // ---- ent-marketer: the Marketing workspace (mkt/**). Its rows are made through the real API as the owner (who holds every marketing permission at ORG scope),
        // so every id in a path names a row the service itself wrote. They are made on demand (seedMkt), not for every world: only the mkt routes and the sweeps that need them.
        boolean mktSeeded;
        Long mktReqId = 1L, mktTaskId = 1L, mktFollowupId = 1L, mktActivityId = 1L, mktMatchId = 1L, mktSubmissionId = 1L, mktStreamId = 1L, mktSearchId = 1L;
        Long mktSubmissionViewId = 1L, mktTalentViewId = 1L, mktPrepItemId = 1L;

        /** One call of the real API as this world's owner; any 2xx is the fixture working. */
        JsonNode mktApi(HttpMethod method, String path, String body) {
            try {
                MockHttpServletRequestBuilder req = MockMvcRequestBuilders.request(method, "/api/orgs/" + org.getId() + path).contentType(MediaType.APPLICATION_JSON).with(user(p + "-owner"));
                if (body != null) req.content(body);
                MvcResult r = mockMvc.perform(req).andReturn();
                String out = r.getResponse().getContentAsString();
                assertThat(r.getResponse().getStatus()).as(method + " " + path + " (marketing fixture) -> " + out).isBetween(200, 299);
                return out.isEmpty() ? null : om.readTree(out);
            } catch (Exception e) {
                throw new IllegalStateException(e);
            }
        }

        private long mktIdOf(JsonNode n) {
            String id = n.path("id").asText();
            return Long.parseLong(id.substring(id.indexOf(':') + 1)); // the activity feed names a manual line MANUAL:<id>
        }

        /** Tenant policy pages: a PRIVACY draft started from the template, and optionally submitted (so a withdraw has something to take back). */
        void seedPolicy(boolean submitIt) {
            policyService.startFromTemplate(me(owner), "PRIVACY");
            if (submitIt) policyService.requestReview(me(owner), "PRIVACY");
        }

        void seedMkt() {
            if (mktSeeded) return;
            mktSeeded = true;
            Long cp = consultantProfileId; // the consultant who owns this world's org resume
            String due = Instant.now().plusSeconds(3 * 86400L).toString();
            com.dossier.api.domain.ent.talent.ClientRequirement jr = new com.dossier.api.domain.ent.talent.ClientRequirement();
            jr.setOrgId(org.getId());
            jr.setClientId(jobClientId);
            jr.setTitle(p + " marketing job");
            mktReqId = clientRequirements.saveAndFlush(jr).getId();
            // The pair (the world's OPEN job, this consultant): a SUGGESTED match plus its opportunity overlay row. Both are made here, in this transaction, because the
            // assignment service inserts a missing match or overlay in a transaction of its own (REQUIRES_NEW), whose foreign keys would wait for this test's uncommitted rows.
            com.dossier.api.domain.ent.talent.RequirementMatch rm = new com.dossier.api.domain.ent.talent.RequirementMatch();
            rm.setOrgId(org.getId());
            rm.setRequirementId(jobId);
            rm.setConsultantId(cp);
            rm.setScore(77);
            rm.setStatus("SUGGESTED");
            rm.setReason("Skills align with this role.");
            mktMatchId = requirementMatches.saveAndFlush(rm).getId(); // a match is also the opportunity of /mkt/opportunities/{id}
            com.dossier.api.domain.ent.mkt.MktOpportunity opp = new com.dossier.api.domain.ent.mkt.MktOpportunity();
            opp.setOrgId(org.getId());
            opp.setMatchId(mktMatchId);
            opp.setOwnerMemberId(owner.getId());
            mktOpportunities.save(opp);
            em.flush();
            // The job is known to the extension capture by its ATS identity (so "save for consultant" finds it instead of inserting one in a transaction of its own).
            em.createQuery("update ClientRequirement r set r.atsPlatform = 'greenhouse', r.externalJobId = :x where r.orgId = :o and r.id = :id").setParameter("x", p + "1").setParameter("o", org.getId()).setParameter("id", jobId).executeUpdate();
            em.flush();
            mktTaskId = mktApi(HttpMethod.POST, "/mkt/tasks", "{\"title\":\"Isolation task\",\"dueAt\":\"" + due + "\"}").path("item").path("id").asLong(); // about no consultant, so any marketer may be handed it (reassign)
            mktFollowupId = mktApi(HttpMethod.POST, "/mkt/followups", "{\"consultantId\":" + cp + ",\"title\":\"Isolation follow-up\",\"dueAt\":\"" + due + "\"}").path("item").path("id").asLong();
            mktActivityId = mktIdOf(mktApi(HttpMethod.POST, "/mkt/activity", "{\"consultantId\":" + cp + ",\"type\":\"RESUME_UPDATED\",\"title\":\"Isolation activity\"}").path("item"));
            mktSubmissionId = mktApi(HttpMethod.POST, "/mkt/submissions", "{\"consultantId\":" + cp + ",\"requirementId\":" + mktReqId + ",\"resumeId\":" + resumeId + "}").path("id").asLong();
            mktStreamId = mktApi(HttpMethod.POST, "/mkt/streams", "{\"sourceLabel\":\"Isolation stream\"}").path("id").asLong();
            mktSearchId = mktApi(HttpMethod.POST, "/mkt/jobs/saved-searches", "{\"name\":\"Isolation search\",\"criteria\":{\"q\":\"java\"}}").path("id").asLong();
            mktSubmissionViewId = mktApi(HttpMethod.POST, "/mkt/submissions/views", "{\"name\":\"Isolation view\",\"q\":\"java\"}").path("id").asLong();
            mktTalentViewId = mktApi(HttpMethod.POST, "/mkt/talent/views", "{\"name\":\"Isolation view\",\"q\":\"java\"}").path("id").asLong();
            mktPrepItemId = mktApi(HttpMethod.GET, "/mkt/interviews/" + interviewId + "/prep", null).path("items").path(0).path("id").asLong();
            em.flush();
        }

        /** The world's org resume is approved (what assigning its consultant to a job, making it primary and re-opening a decision all require; a new resume starts PENDING). */
        void approveResume() {
            em.createQuery("update OrgResume r set r.approvalStatus = 'APPROVED', r.approvedAt = :now where r.orgId = :o and r.id = :id").setParameter("now", Instant.now()).setParameter("o", org.getId()).setParameter("id", resumeId).executeUpdate();
            em.flush();
            em.clear();
        }

        /** The world's org resume is one a marketer made through the builder and that now waits for the consultant (a builder document, ORG_MANAGED, PENDING): what the consultant's approve and send-back routes need. */
        void makeCwsResumeAwaitConsultant() {
            em.createQuery("update OrgResume r set r.resumeId = 987654321, r.kind = 'ORG_MANAGED', r.approvalStatus = 'PENDING', r.primaryForOrg = false where r.orgId = :o and r.id = :id").setParameter("o", org.getId()).setParameter("id", cwsResumeId).executeUpdate();
            em.flush();
            em.clear();
        }

        /** The opportunity is assigned (the marketer asked the consultant for their interest). */
        void mktAssignOpportunity() {
            approveResume();
            mktApi(HttpMethod.POST, "/mkt/opportunities/" + mktMatchId + "/assign", null);
        }

        /** The pair was dismissed once (adding the opportunity again re-opens it, with no insert). */
        void mktDismissMatch() {
            em.createQuery("update RequirementMatch m set m.status = 'DISMISSED' where m.orgId = :o and m.id = :id").setParameter("o", org.getId()).setParameter("id", mktMatchId).executeUpdate();
            em.flush();
            em.clear();
        }

        /** An assigned opportunity the consultant has not been asked about for more than a day (what "notify" finds). */
        void mktAwaitingInterest() {
            mktAssignOpportunity();
            // "Notify" walks every assigned match of the organization, and gives each the opportunity row it lacks in a transaction of its own (REQUIRES_NEW), which would
            // wait for this test's uncommitted rows: every match of the world gets its overlay row here, as production data has.
            for (com.dossier.api.domain.ent.talent.RequirementMatch m : requirementMatches.findByOrgId(org.getId())) {
                if (mktOpportunities.findByOrgIdAndMatchId(org.getId(), m.getId()).isPresent()) continue;
                com.dossier.api.domain.ent.mkt.MktOpportunity o = new com.dossier.api.domain.ent.mkt.MktOpportunity();
                o.setOrgId(org.getId());
                o.setMatchId(m.getId());
                o.setOwnerMemberId(owner.getId());
                mktOpportunities.save(o);
            }
            em.createQuery("update MktOpportunity o set o.interestRequestedAt = null where o.orgId = :o").setParameter("o", org.getId()).executeUpdate();
            em.flush();
            em.clear();
        }

        /** An assigned opportunity whose consultant asked a question and waits for the answer. */
        void mktNeedsInfo() {
            mktAssignOpportunity();
            em.createQuery("update MktOpportunity o set o.state = 'NEEDS_INFO', o.infoRequest = 'Is a W2 option available?' where o.orgId = :o").setParameter("o", org.getId()).executeUpdate();
            em.flush();
            em.clear();
        }

        /** The assigned opportunity was declined by its consultant, and a second consultant of the world (approved resume, pair already suggested) can take it. */
        void mktReassignable() {
            mktAssignOpportunity();
            com.dossier.api.domain.ent.talent.OrgResume second = new com.dossier.api.domain.ent.talent.OrgResume();
            second.setOrgId(org.getId());
            second.setConsultantId(consultantId);
            second.setName(p + " second consultant resume");
            second.setOwnerMemberId(owner.getId());
            second.setApprovalStatus("APPROVED");
            second.setApprovedAt(Instant.now());
            talentResumes.saveAndFlush(second);
            com.dossier.api.domain.ent.talent.RequirementMatch rm = new com.dossier.api.domain.ent.talent.RequirementMatch();
            rm.setOrgId(org.getId());
            rm.setRequirementId(jobId);
            rm.setConsultantId(consultantId);
            rm.setScore(70);
            rm.setStatus("SUGGESTED");
            rm.setReason("Skills align with this role.");
            Long secondMatch = requirementMatches.saveAndFlush(rm).getId();
            com.dossier.api.domain.ent.mkt.MktOpportunity o2 = new com.dossier.api.domain.ent.mkt.MktOpportunity();
            o2.setOrgId(org.getId());
            o2.setMatchId(secondMatch);
            o2.setOwnerMemberId(owner.getId());
            mktOpportunities.save(o2);
            em.createQuery("update MktOpportunity o set o.state = 'DECLINED' where o.orgId = :o and o.matchId = :m").setParameter("o", org.getId()).setParameter("m", mktMatchId).executeUpdate();
            em.flush();
            em.clear();
        }

        /** The hand-typed job is already stored (the employer and job inserts of a new one run in transactions of their own, which would wait for this test's uncommitted rows). */
        void mktHandJobStored() {
            seedMkt();
            com.dossier.api.domain.ent.talent.ClientRequirement jr = new com.dossier.api.domain.ent.talent.ClientRequirement();
            jr.setOrgId(org.getId());
            jr.setClientId(jobClientId);
            jr.setTitle("Hijack hand job");
            String key = com.dossier.api.service.ent.mkt.opportunities.MktManualJobService.manualKey("Hijack Co", "Hijack hand job", "Austin, TX");
            jr.setUrlKey(key);
            jr.setUrlKeyHash(com.dossier.api.service.ent.jobs.UrlKeys.hash(key));
            clientRequirements.saveAndFlush(jr);
            em.flush();
            em.clear();
        }

        void mktCompleteTask() {
            mktApi(HttpMethod.POST, "/mkt/tasks/" + mktTaskId + "/complete", null);
        }

        /** The package waits for its approval (DRAFT to AWAITING_APPROVAL). */
        void mktSubmissionAwaiting() {
            mktApi(HttpMethod.POST, "/mkt/submissions/" + mktSubmissionId + "/request-approval", null);
        }

        /** The package is approved (what recording it as submitted requires). */
        void mktSubmissionApproved() {
            mktSubmissionAwaiting();
            mktApi(HttpMethod.POST, "/mkt/submissions/" + mktSubmissionId + "/approval", "{\"decision\":\"APPROVED\"}");
        }

        /** The application has a next action to mark as done. */
        void mktApplicationNextAction() {
            em.createQuery("update TalentApplication a set a.nextAction = 'Call the recruiter' where a.orgId = :o and a.id = :id").setParameter("o", org.getId()).setParameter("id", appTalent.applicationId()).executeUpdate();
            em.flush();
            em.clear();
        }

        private Long interview(com.dossier.api.domain.ent.talent.TalentApplication app, String status, Instant at) {
            com.dossier.api.domain.ent.talent.TalentInterview iv = new com.dossier.api.domain.ent.talent.TalentInterview();
            iv.setOrgId(org.getId());
            iv.setApplicationId(app.getId());
            iv.setConsultantId(cwsConsultantId);
            iv.setClientId(clientId);
            iv.setScheduledAt(at);
            iv.setStatus(status);
            iv.setRoundLabel("Round 1");
            iv.setInterviewerName("Isolation Interviewer");
            return cwsInterviews.saveAndFlush(iv).getId();
        }

        /** What the PUT .../feedback route edits: the owner already recorded feedback on the completed interview. */
        void addFeedbackToCompletedInterview() {
            com.dossier.api.domain.ent.consultantws.CwsInterviewFeedback f = new com.dossier.api.domain.ent.consultantws.CwsInterviewFeedback();
            f.setOrgId(org.getId());
            f.setInterviewId(completedInterviewId);
            f.setConsultantId(cwsConsultantId);
            f.setOutcome("NEUTRAL");
            f.setSummary("Went fine.");
            cwsInterviewFeedback.saveAndFlush(f);
        }

        /** What the POST .../reopen route undoes: the owner declined the assigned opportunity (on the shared mkt_opportunity record). */
        void declineAssignedOpportunity() {
            com.dossier.api.domain.ent.mkt.MktOpportunity o = new com.dossier.api.domain.ent.mkt.MktOpportunity();
            o.setOrgId(org.getId());
            o.setMatchId(assignedMatchId);
            o.setState("DECLINED");
            o.setInterest("NOT_INTERESTED");
            o.setDeclineReason("OTHER");
            o.setDeclineNote("Not for me.");
            mktOpportunities.save(o); em.flush();
        }

        void makeOwnerAConsultant() {
            makeConsultant(org.getId(), owner);
        }

        /** Puts the member in the SUSPENDED state (what a reinstate needs to find). */
        void suspendMember() {
            member.setStatus(OrgMemberStatus.SUSPENDED);
            members.saveAndFlush(member);
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
            ids.put("roleId", String.valueOf(roleId));
            ids.put("memberId", String.valueOf(member.getId()));
            ids.put("offboardingId", String.valueOf(offboardingId));
            ids.put("kind", "logo");
            ids.put("policyKind", "PRIVACY");
            ids.put("pendingMemberId", String.valueOf(pending.getId())); // X1.8's resend names the INVITED seat; every other {memberId} route is the ACTIVE member
            ids.put("invitationId", String.valueOf(pending.getId())); // an invitation is a seat in state INVITED
            ids.put("alertKey", "MEMBERS_SUSPENDED");
            ids.put("id", "999999999"); // the consultant routes' opportunity id: nobody's, and the routes answer 404 before looking (the flag is off in this world)
            ids.put("suggestionId", "999999999"); // an inbox suggestion nobody owns: the routes answer 404 for the legitimate caller too
            ids.put("skillId", String.valueOf(skillId));
            ids.put("certId", String.valueOf(certId));
            ids.put("prefId", String.valueOf(prefId));
            ids.put("resumeId", String.valueOf(resumeId));
            ids.put("matchId", String.valueOf(matchId));
            ids.put("requirementId", String.valueOf(requirementId));
            ids.put("id", String.valueOf(savedSearchId)); // saved-searches/{id}
            ids.put("applicationId", String.valueOf(applicationId));
            ids.put("interviewId", String.valueOf(scheduledInterviewId));
            ids.put("completedInterviewId", String.valueOf(completedInterviewId)); // {interviewId} of the feedback routes (see uri())
            ids.put("sessionId", String.valueOf(prepSessionId));
            ids.put("itemKey", "review-jd"); // a fixed checklist word, not a row
            ids.put("submissionId", String.valueOf(submissionId)); // {id} of the submissions routes (see uri())
            // The consultant workspace routes (/me-workspace/**) mean the consultant's OWN rows; the same variable names on the org pages mean the pages' rows, assigned later in the constructor (see uri()).
            ids.put("cwsMatchId", String.valueOf(cwsMatchId));
            ids.put("cwsResumeId", String.valueOf(cwsResumeId));
            ids.put("cwsRequirementId", String.valueOf(cwsRequirementId));
            ids.put("cwsApplicationId", String.valueOf(cwsApplicationId));
            ids.put("cwsInterviewId", String.valueOf(scheduledInterviewId));
            ids.put("opportunityMatchId", String.valueOf(assignedMatchId)); // {matchId} of the opportunities routes (see uri())
            ids.put("taskId", String.valueOf(taskId)); // {id} of the tasks routes (see uri())
            ids.put("availabilityBlockId", String.valueOf(availabilityBlockId)); // {id} of the availability/blocks routes (see uri())
            ids.put("cwsOfferId", String.valueOf(offerId)); // {id} of the /me-workspace/offers routes (see uri()); {offerId} below is the Accounts page's row
            ids.put("itemId", String.valueOf(placementChecklistId)); // placements/checklist/{itemId}
            ids.put("notificationId", String.valueOf(notificationId)); // {id} of DELETE notifications/{id} (see uri())
            ids.put("category", "JOB_MATCH"); // a fixed notification category, not a row
            ids.put("consultantId", String.valueOf(consultantId));
            ids.put("resumeId", String.valueOf(resumeId));
            ids.put("jobId", String.valueOf(jobId));
            ids.put("clientId", String.valueOf(jobClientId));
            ids.put("contactId", String.valueOf(clientContactId));
            ids.put("matchId", String.valueOf(matchId));
            ids.put("applicationId", String.valueOf(appTalent.applicationId()));
            ids.put("interviewId", String.valueOf(interviewId));
            ids.put("placementId", String.valueOf(plTalent.placementId()));
            ids.put("offerId", String.valueOf(offerRowId)); // {offerId} of the Accounts Offers routes
            ids.put("extensionId", String.valueOf(plTalent.extensionId()));
            // ent-marketer: the Marketing workspace names its rows by variables that mean other rows on other pages, so uri() renames them by route prefix.
            ids.put("mktTaskId", String.valueOf(mktTaskId));
            ids.put("mktFollowupId", String.valueOf(mktFollowupId));
            ids.put("mktActivityId", String.valueOf(mktActivityId));
            ids.put("mktMatchId", String.valueOf(mktMatchId)); // {id} of mkt/matches and mkt/opportunities: the match is the opportunity
            ids.put("mktSubmissionId", String.valueOf(mktSubmissionId));
            ids.put("mktSubmissionViewId", String.valueOf(mktSubmissionViewId));
            ids.put("mktTalentViewId", String.valueOf(mktTalentViewId));
            ids.put("mktInterviewId", String.valueOf(interviewId)); // {interviewId} of mkt/interviews
            ids.put("mktPrepItemId", String.valueOf(mktPrepItemId));
            ids.put("mktResumeId", String.valueOf(resumeId)); // {id} of mkt/resumes
            ids.put("mktBuilderConsultantId", String.valueOf(cwsConsultantId)); // {consultantId} of mkt/resumes/consultants/...: the owner's own consultant profile, which has a seat and an account (act-for needs one)
            ids.put("streamId", String.valueOf(mktStreamId));
            ids.put("searchId", String.valueOf(mktSearchId));
            ids.put("ruleKey", "DEFAULT_KEYWORDS"); // a fixed word of the stream rules, not a row
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
        // The same variable name names different rows on different pages: the route prefix decides which fixture row a route means.
        String pattern = route.pattern()
            .replace("/orgs/{orgId}/requirements/{requirementId}", "/orgs/{orgId}/requirements/{jobId}") // the Account Manager page's requirement is the world's job
            .replace("/mkt/interviews/{interviewId}", "/mkt/interviews/{mktInterviewId}") // before the generic interviews rename below
            .replace("/prep/{itemId}", "/prep/{mktPrepItemId}")
            .replace("/mkt/activity/{id}", "/mkt/activity/{mktActivityId}")
            .replace("/mkt/followups/{id}", "/mkt/followups/{mktFollowupId}")
            .replace("/mkt/matches/{id}", "/mkt/matches/{mktMatchId}")
            .replace("/mkt/opportunities/{id}", "/mkt/opportunities/{mktMatchId}")
            .replace("/mkt/resumes/consultants/{consultantId}", "/mkt/resumes/consultants/{mktBuilderConsultantId}") // before the generic {id} rename below: the consultant whose account is the world's owner
            .replace("/mkt/resumes/{id}", "/mkt/resumes/{mktResumeId}")
            .replace("/mkt/submissions/views/{viewId}", "/mkt/submissions/views/{mktSubmissionViewId}")
            .replace("/mkt/submissions/{id}", "/mkt/submissions/{mktSubmissionId}")
            .replace("/mkt/talent/views/{viewId}", "/mkt/talent/views/{mktTalentViewId}")
            .replace("/mkt/tasks/{id}", "/mkt/tasks/{mktTaskId}")
            .replace("/members/{memberId}/resend", "/members/{pendingMemberId}/resend")
            .replace("/opportunities/{matchId}", "/opportunities/{opportunityMatchId}")
            .replace("/submissions/{id}", "/submissions/{submissionId}")
            .replace("/tasks/{id}", "/tasks/{taskId}")
            .replace("/blocks/{id}", "/blocks/{availabilityBlockId}")
            .replace("/me-workspace/offers/{id}", "/me-workspace/offers/{cwsOfferId}") // the consultant's own offer, not the Accounts page's offer row (same name, different row)
            .replace("/offers/{id}", "/offers/{offerId}")
            .replace("/notifications/{id}", "/notifications/{notificationId}")
            .replace("/interviews/{interviewId}/feedback", "/interviews/{completedInterviewId}/feedback");
        if (pattern.contains("/me-workspace/")) {
            pattern = pattern.replace("{matchId}", "{cwsMatchId}").replace("{resumeId}", "{cwsResumeId}").replace("{requirementId}", "{cwsRequirementId}").replace("{applicationId}", "{cwsApplicationId}").replace("{interviewId}", "{cwsInterviewId}");
        }
        if (route.pattern().endsWith("/mkt/matches/compare")) pattern += "?a={mktMatchId}&b={matchId}"; // two different matches (the second is the jobs page's), both required query parameters
        Matcher m = VAR.matcher(pattern);
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

    private MockHttpServletRequestBuilder request(Route route, String uri, World world) {
        if (COVERAGE.get(route.key()).multipart()) {
            return MockMvcRequestBuilders.multipart(HttpMethod.valueOf(route.method()), uri).file(new MockMultipartFile("file", "logo.png", "image/png", samplePng()));
        }
        MockHttpServletRequestBuilder req = MockMvcRequestBuilders.request(HttpMethod.valueOf(route.method()), uri).contentType(MediaType.APPLICATION_JSON);
        if (route.key().equals("POST /api/orgs/{orgId}/groups/{groupId}/members") || route.key().equals("POST /api/orgs/{orgId}/resumes") || route.key().equals("POST /api/orgs/{orgId}/resumes/bulk")) req.header("Idempotency-Key", java.util.UUID.randomUUID().toString());
        Case c = COVERAGE.get(route.key());
        String body = c.bodyFor() != null ? c.bodyFor().apply(world) : c.body();
        if (route.method().equals("POST") && (route.pattern().contains("/members/bulk/") || route.pattern().endsWith("/offboard") || route.pattern().contains("/consultants") || route.pattern().endsWith("/jobs") || route.pattern().endsWith("/orgs/{orgId}/requirements") || route.pattern().endsWith("/clients") || route.pattern().endsWith("/jobs/bulk/status") || route.pattern().contains("/marketing-assignments/") || route.pattern().endsWith("/from-extension") || route.pattern().endsWith("/opportunities/job"))) {
            req.header("Idempotency-Key", java.util.UUID.randomUUID().toString()); // the people actions require one (doc 40 section 6)
        }
        if (c.ifMatchFor() != null) {
            String version = c.ifMatchFor().apply(world);
            if (version != null) req.header("If-Match", version);
        }
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

    private MvcResult hostile(Route route, String uri, World world, org.springframework.test.web.servlet.request.RequestPostProcessor caller) throws Exception {
        return mockMvc.perform(request(route, uri, world).with(caller)).andReturn();
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
        for (OrgGroup g : groups.findByOrgIdOrderBySortOrderAscNameAsc(w.org.getId())) s.append("group:").append(g.getId()).append('|').append(g.getName()).append('|').append(g.getKind()).append('|').append(g.getSortOrder()).append('|').append(g.getParentGroupId()).append('|').append(g.getLeadMemberId()).append('|').append(g.getStatus()).append('|').append(g.getVersion()).append('\n');
        for (OrgMember m : w.everySeat()) {
            OrgMember row = members.findByOrgIdAndId(w.org.getId(), m.getId()).orElseThrow();
            s.append("seat:").append(row.getId()).append('|').append(row.getRole()).append('|').append(row.getStatus()).append('|').append(row.getGroupId()).append('|').append(row.getDepartmentGroupId()).append('|').append(row.getTeamGroupId()).append('|').append(row.getDisplayLabel()).append('|').append(row.getSupportOwnerMemberId()).append('|').append(row.getInviteTokenHash()).append('|').append(row.getInviteSentAt()).append('|').append(row.getInviteResendCount()).append('\n');
            s.append("share:").append(shares.findByOrgIdAndMemberId(w.org.getId(), m.getId()).map(d -> d.getScope() + "|" + d.getFullToMemberId() + "|" + d.getUpdatedAt()).orElse("none")).append('\n');
        }
        s.append("batches:").append(batches.findByOrgIdOrderByCreatedAtDesc(w.org.getId()).size()).append('\n');
        s.append("codes:").append(codes.findByOrgIdOrderByCreatedAtDesc(w.org.getId()).stream().map(c -> c.getCode() + "|" + c.getUses() + "|" + c.getRevokedAt()).toList()).append('\n');
        s.append("domains:").append(domains.findByOrgIdOrderByDomain(w.org.getId()).stream().map(d -> d.getDomain() + "|" + d.getVerifiedAt()).toList()).append('\n');
        brandings.findByOrgId(w.org.getId()).ifPresent(b -> s.append("branding:").append(b.getPrimaryColor()).append('|').append(b.getWelcomeTitle()).append('|').append(b.getDraftJson()).append('|').append(b.getDraftVersion()).append('|').append(b.getPublishedAt()).append('|').append(b.getLogoKey()).append('\n'));
        s.append("brandingVersions:").append(brandingVersions.findAllByOrgIdNewestFirst(w.org.getId()).stream().map(v -> v.getVersionNo() + "|" + v.getSnapshotJson()).toList()).append('\n');
        s.append("jobs:").append(jobRows.findByOrgId(w.org.getId()).stream().map(r -> r.getId() + "|" + r.getTitle() + "|" + r.getStatus() + "|" + r.getUpdatedAt()).toList()).append('\n');
        s.append("clients:").append(jobClients.findByOrgId(w.org.getId()).stream().map(c -> c.getId() + "|" + c.getName() + "|" + c.getAbout() + "|" + c.getStatus() + "|" + c.getUpdatedAt()).toList()).append('\n');
        s.append("clientContacts:").append(clientContactRows.findByOrgId(w.org.getId()).stream().map(c -> c.getId() + "|" + c.getName() + "|" + c.getStatus()).toList()).append('\n');
        s.append("clientNotes:").append(clientNoteRows.countByOrgId(w.org.getId())).append('\n');
        s.append("jobMatches:").append(jobMatches.findByOrgId(w.org.getId()).stream().sorted(java.util.Comparator.comparing(com.dossier.api.domain.ent.talent.RequirementMatch::getId)).map(m -> m.getId() + "|" + m.getStatus() + "|" + m.getAssignedAt()).toList()).append('\n');
        s.append("audit:").append(audit.countByOrgId(w.org.getId())).append('\n');
        s.append("events:").append(shareEvents.countByOrgId(w.org.getId())).append('\n');
        s.append(com.dossier.api.web.rest.ent.ApplicationItSupport.fingerprint(em, w.org.getId()));
        s.append(com.dossier.api.web.rest.ent.PlacementItSupport.fingerprint(em, w.org.getId()));
        s.append(mktFingerprint(w.org.getId()));
        for (String table : List.of("org_policy", "org_policy_version")) {
            s.append(table).append(':').append(em.createNativeQuery("select * from " + table + " where org_id = ?1 order by 1").setParameter(1, w.org.getId()).getResultList().stream().map(r -> r instanceof Object[] a ? Arrays.deepToString(a) : String.valueOf(r)).toList()).append('\n');
        }
        return s.toString();
    }

    /** Every table of the Marketing workspace (plus the org resumes it edits), row by row and column by column: any change by a refused caller shows. */
    private static final List<String> MKT_TABLES = List.of(
        "mkt_activity", "mkt_benchmark", "mkt_followup", "mkt_followup_event", "mkt_goal", "mkt_interview_event", "mkt_interview_feedback", "mkt_interview_meta",
        "mkt_interview_prep_item", "mkt_job_meta", "mkt_job_stream", "mkt_opportunity", "mkt_opportunity_event", "mkt_resume_event", "mkt_saved_search", "mkt_saved_view",
        "mkt_stream_alert", "mkt_stream_rule", "mkt_stream_sync_log", "mkt_submission", "mkt_submission_event", "mkt_submission_view", "mkt_task", "mkt_task_event",
        "pipeline_application_link", "org_resume"
    );

    private String mktFingerprint(Long orgId) {
        StringBuilder s = new StringBuilder();
        for (String table : MKT_TABLES) {
            List<?> rows = em.createNativeQuery("select * from " + table + " where org_id = ?1 order by 1").setParameter(1, orgId).getResultList();
            s.append(table).append(':').append(rows.stream().map(r -> r instanceof Object[] a ? Arrays.deepToString(a) : String.valueOf(r)).toList()).append('\n');
        }
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
        a.seedMkt(); // the Marketing workspace rows the mkt/** ids name

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
                assertGeneric404(hostile(route, target, a, caller.getValue()), route.key() + " as " + caller.getKey());
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
        a.seedMkt();

        String beforeA = snapshot(a);
        String beforeB = snapshot(b);
        int variants = 0;
        for (Route route : orgRoutes()) {
            Map<String, String> ids = new LinkedHashMap<>(a.ids());
            ids.put("orgId", String.valueOf(b.org.getId())); // his own org, but A's row ids
            if (ids.equals(b.ids())) continue; // the route has no row id: nothing of A's to name
            Matcher m = VAR.matcher(route.pattern());
            boolean hasRowId = false;
            while (m.find()) hasRowId |= !m.group(1).equals("orgId") && !m.group(1).equals("kind") && !m.group(1).equals("policyKind") && !m.group(1).equals("alertKey") && !m.group(1).equals("itemKey") && !m.group(1).equals("category") && !m.group(1).equals("ruleKey"); // kind, alertKey, itemKey, category and ruleKey are fixed words, not rows
            if (!hasRowId) continue;
            assertGeneric404(hostile(route, uri(route, ids), a, user("bravo-owner")), route.key() + " as B's owner with B's orgId and A's row id");
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
        a.seedMkt();
        for (Route route : orgRoutes()) {
            for (String bad : List.of("0", "-1", "999999999", "abc", "0x1", "9999999999999999999999")) {
                Map<String, String> ids = new LinkedHashMap<>(a.ids());
                ids.put("orgId", bad);
                MvcResult r = hostile(route, uri(route, ids), a, user("alpha-owner"));
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
            if (c.prepare() != null) c.prepare().accept(w);
            long before = audit.countByOrgId(w.org.getId());
            MvcResult r = mockMvc.perform(request(route, uri(route, w.ids()), w).with(user(w.p + "-owner"))).andReturn();
            assertThat(r.getResponse().getStatus()).as(route.key() + " legitimately -> " + r.getResponse().getContentAsString()).isEqualTo(c.legitStatus());
            em.flush();
            long delta = audit.countByOrgId(w.org.getId()) - before;
            if (c.auditAction() == null) {
                assertThat(delta).as(route.key() + " is a read and must write no audit row").isZero();
            } else {
                assertThat(delta).as(route.key() + " must write exactly " + c.auditRows() + " audit row(s)").isEqualTo(c.auditRows());
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

        checks.put("OrganizationRepository", new RepoCheck(Set.of("findByOrgId", "findAllByOrgIdIn", "existsBySlug", "findBySlug", "countByCreatedByUserId", "findAllOrgIds"), () -> {
            assertThat(orgs.findAllOrgIds()).as("the history retention job (X9.15) lists WHICH organizations to visit, ids only; each one then runs inside TenantScoped").contains(A, B);
            assertThat(orgs.findAllByOrgIdIn(Set.of(B))).extracting(Organization::getId).containsExactly(B);
            assertThat(orgs.findByOrgId(B).orElseThrow().getId()).isNotEqualTo(A);
            assertThat(orgs.countByCreatedByUserId(a.owner.getUserId())).as("scoped by the creating person").isZero(); // fixtures set no creator
        }));
        checks.put("OrgMemberRepository", new RepoCheck(Set.of("findByOrgIdAndId", "findByOrgIdAndUserIdAndStatusIn", "findByOrgIdAndInviteEmailAndStatusIn", "countByOrgIdAndStatus", "countByOrgIdAndRoleAndStatus", "countByOrgIdAndGroupIdAndStatusIn", "countByOrgIdAndStatusIn", "countByOrgIdAndRoleAndStatusIn", "countByOrgIdAndInviteSentAtAfter", "countByOrgIdAndInviteBatchId", "findByInviteTokenHash", "findByOrgIdAndIdIn", "findExpiredInvites", "findOrgIdsWithExpiredInvites", "findByOrgIdAndRoleInAndStatus"), () -> {
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
            assertThat(members.findByOrgIdAndRoleInAndStatus(B, List.of(OrgRole.OWNER, OrgRole.ADMIN), OrgMemberStatus.ACTIVE)).as("only B's own owner and admins are told about a policy decision").allSatisfy(m -> assertThat(m.getOrgId()).isEqualTo(B)).extracting(OrgMember::getId).doesNotContain(a.owner.getId());
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
        checks.put("OrgGroupPlacementRepository", new RepoCheck(Set.of("placements"), () -> {
            assertThat(placements.placements(B, OrgMemberStatus.LIVE)).as("only B's own live seats, never A's").extracting(r -> (Long) r[0]).doesNotContain(a.owner.getId(), a.member.getId(), a.pending.getId());
            assertThat(placements.placements(B, OrgMemberStatus.LIVE)).hasSize(3); // B's owner, member and pending invite
        }));
        checks.put("OrgGroupRepository", new RepoCheck(Set.of("findByOrgIdAndId", "findByOrgIdOrderBySortOrderAscNameAsc", "existsByOrgIdAndName", "countByOrgId", "deleteByOrgIdAndId", "countByOrgIdAndParentGroupId", "findByOrgIdAndParentGroupIdOrderBySortOrderAscNameAsc"), () -> {
            assertThat(groups.countByOrgIdAndParentGroupId(B, a.group.getId())).isZero();
            assertThat(groups.findByOrgIdAndParentGroupIdOrderBySortOrderAscNameAsc(B, a.group.getId())).isEmpty();
            assertThat(groups.findByOrgIdAndId(B, a.group.getId())).isEmpty();
            assertThat(groups.findByOrgIdOrderBySortOrderAscNameAsc(B)).extracting(OrgGroup::getId).doesNotContain(a.group.getId());
            assertThat(groups.existsByOrgIdAndName(B, a.group.getName())).isFalse();
            assertThat(groups.countByOrgId(B)).as("B's cohort and B's department (X4.3 fixtures)").isEqualTo(2);
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
        checks.put("OrgAuditEventRepository", new RepoCheck(Set.of("findByOrgId", "findByOrgIdAndAction", "findByOrgIdAndActionIn", "findByOrgIdAndTargetTypeAndTargetId", "countByOrgId", "countByOrgIdAndActorLogin", "countByOrgIdAndAction", "countByOrgIdAndActionInAndCreatedAtAfter"), () -> {
            List<String> roleActions = List.of("ROLE_CREATE", "ROLE_UPDATE", "ROLE_ASSIGN", "ROLE_DELETE", "ROLE_RESYNC");
            assertThat(audit.countByOrgIdAndActionInAndCreatedAtAfter(B, roleActions, java.time.Instant.EPOCH)).as("counts B's own rows of those actions only, never A's").isEqualTo(audit.findByOrgIdAndActionIn(B, roleActions, PageRequest.of(0, 1000)).getTotalElements());
            assertThat(audit.findByOrgIdAndActionIn(B, List.of("ROLE_CREATE", "ROLE_UPDATE", "ROLE_ASSIGN", "ROLE_DELETE", "ROLE_RESYNC"), PageRequest.of(0, 100)).getContent()).extracting(OrgAuditEvent::getOrgId).doesNotContain(A);
            assertThat(audit.findByOrgIdAndTargetTypeAndTargetId(B, "ROLE", String.valueOf(a.roleId), PageRequest.of(0, 100)).getContent()).as("A role id in B has no rows").isEmpty();
            assertThat(audit.findByOrgId(B, PageRequest.of(0, 100)).getContent()).extracting(OrgAuditEvent::getOrgId).containsOnly(B);
            assertThat(audit.findByOrgIdAndAction(B, OrgAuditService.SHARE_SCOPE_CHANGED, PageRequest.of(0, 100)).getContent()).extracting(OrgAuditEvent::getActorLogin).containsOnly("bravo-member");
            assertThat(audit.countByOrgIdAndActorLogin(B, "alpha-owner")).as("A's actor never appears in B's trail").isZero();
            for (String action : List.of("ROLE_CREATE", OrgAuditService.SHARE_SCOPE_CHANGED)) {
                assertThat(audit.countByOrgIdAndAction(B, action)).as("counts B's own " + action + " rows only, never A's").isEqualTo(audit.findByOrgIdAndAction(B, action, PageRequest.of(0, 1000)).getTotalElements());
            }
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
