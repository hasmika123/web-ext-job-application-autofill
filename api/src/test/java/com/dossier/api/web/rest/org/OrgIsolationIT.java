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
// Every route is attacked by every caller: with the groups routes (X4.5) the sweeps outgrew the global 15 s default on a loaded machine.
@org.junit.jupiter.api.Timeout(90)
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

        /** A multipart upload (field "file", a small valid PNG) instead of a JSON body. */
        static Case upload(int status, String action) {
            return new Case(null, status, action, true, null, null, 1, null);
        }

        /** A write whose body and If-Match version depend on the fixture world (role ids, role versions: X1.14). */
        static Case versioned(int status, String action, java.util.function.Function<World, String> bodyFor, java.util.function.Function<World, String> ifMatchFor) {
            return new Case(null, status, action, false, bodyFor, ifMatchFor, 1, null);
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
        Map.entry("GET /api/orgs/{orgId}/members/offboarding", Case.read()),
        Map.entry("DELETE /api/orgs/{orgId}/members/offboarding/{offboardingId}", Case.people(204, "MEMBER_OFFBOARD_CANCELLED", 1, w -> null, null, null)),
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
        Map.entry("POST /api/orgs/{orgId}/invitations/bulk/revoke", Case.write("{\"ids\":[1]}", 200, null)),
        // Enterprise V2 X2.4: the dashboard. Dismissing an alert is a personal preference of the caller, so it writes no audit row.
        Map.entry("GET /api/orgs/{orgId}/dashboard", Case.read()),
        Map.entry("POST /api/orgs/{orgId}/dashboard/alerts/{alertKey}/dismiss", Case.write(null, 200, null)),
        // Consultant workspace Home: own-scoped. Only a consultant (opportunities.respond + a consultant_profile) may read it, so the legitimate call makes the owner one.
        Map.entry("GET /api/orgs/{orgId}/me-workspace/home", Case.consultantRead()),
        // The other consultant-workspace pages: own-scoped too, same legitimate caller (the owner made a consultant), no org audit row.
        Map.entry("GET /api/orgs/{orgId}/me-workspace/profile", Case.consultantRead()),
        Map.entry("PUT /api/orgs/{orgId}/me-workspace/profile/availability", Case.consultantWrite("{\"status\":\"NOTICE\"}", 200)),
        Map.entry("PUT /api/orgs/{orgId}/me-workspace/profile/summary", Case.consultantWrite("{\"text\":\"Hijacked summary\"}", 200)),
        Map.entry("PUT /api/orgs/{orgId}/me-workspace/profile/career-goals", Case.consultantWrite("{\"text\":\"Hijacked goals\"}", 200)),
        Map.entry("PUT /api/orgs/{orgId}/me-workspace/profile/work-authorization", Case.consultantWrite("{\"value\":\"authorized_no_sponsorship\"}", 200)),
        Map.entry("PUT /api/orgs/{orgId}/me-workspace/profile/employment-types", Case.consultantWrite("{\"values\":[\"CONTRACT\"]}", 200)),
        Map.entry("POST /api/orgs/{orgId}/me-workspace/profile/skills", Case.consultantWrite("{\"skill\":\"Hijack\"}", 200)),
        Map.entry("DELETE /api/orgs/{orgId}/me-workspace/profile/skills/{skillId}", Case.consultantWrite(null, 200)),
        Map.entry("POST /api/orgs/{orgId}/me-workspace/profile/certifications", Case.consultantWrite("{\"name\":\"Hijack cert\"}", 200)),
        Map.entry("DELETE /api/orgs/{orgId}/me-workspace/profile/certifications/{certId}", Case.consultantWrite(null, 200)),
        Map.entry("POST /api/orgs/{orgId}/me-workspace/profile/prefs", Case.consultantWrite("{\"kind\":\"ROLE\",\"value\":\"Hijack role\"}", 200)),
        Map.entry("DELETE /api/orgs/{orgId}/me-workspace/profile/prefs/{prefId}", Case.consultantWrite(null, 200)),
        Map.entry("GET /api/orgs/{orgId}/me-workspace/resumes", Case.consultantRead()),
        Map.entry("GET /api/orgs/{orgId}/me-workspace/resumes/{resumeId}/preview", Case.consultantRead()),
        Map.entry("POST /api/orgs/{orgId}/me-workspace/resumes/{resumeId}/primary", Case.consultantWrite(null, 200)),
        Map.entry("PATCH /api/orgs/{orgId}/me-workspace/resumes/{resumeId}", Case.consultantWrite("{\"name\":\"Hijacked resume\"}", 200)),
        Map.entry("POST /api/orgs/{orgId}/me-workspace/resumes/{resumeId}/activity", Case.consultantWrite("{\"kind\":\"VIEWED\"}", 204)),
        Map.entry("POST /api/orgs/{orgId}/me-workspace/resumes/{resumeId}/duplicate", Case.consultantWrite(null, 201)),
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
        Map.entry("POST /api/orgs/{orgId}/me-workspace/job-discovery/jobs/{requirementId}/apply", Case.consultantWrite(null, 200)),
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
        Map.entry("POST /api/orgs/{orgId}/me-workspace/opportunities/{matchId}/express-interest", Case.consultantWrite("{\"note\":\"Hijacked interest\"}", 200)),
        Map.entry("POST /api/orgs/{orgId}/me-workspace/opportunities/{matchId}/need-more-info", Case.consultantWrite("{\"message\":\"Hijacked question\"}", 200)),
        Map.entry("POST /api/orgs/{orgId}/me-workspace/opportunities/{matchId}/decline", Case.consultantWrite("{\"reason\":\"Hijacked decline\"}", 200)),
        Map.entry("POST /api/orgs/{orgId}/me-workspace/opportunities/{matchId}/reopen", new Case(null, 200, null, false, null, null, 1, w -> { w.makeOwnerAConsultant(); w.declineAssignedOpportunity(); })),
        Map.entry("POST /api/orgs/{orgId}/me-workspace/opportunities/{matchId}/request-resume-update", Case.consultantWrite("{\"note\":\"Hijacked update\"}", 200)),
        // The last eight consultant pages. {id} means the task / calendar entry / offer / notification by route prefix (see uri()).
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
        Map.entry("PUT /api/orgs/{orgId}/me-workspace/settings/appearance", Case.consultantWrite("{\"theme\":\"DARK\"}", 200))
    ));

    // ---- wiring ---------------------------------------------------------------------------------------------------

    @Autowired private MockMvc mockMvc;
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
        settingsCache.invalidate();
    }

    @AfterEach
    void enterpriseFlagsOff() {
        for (AppSetting row : settingRows.findAll()) if (FLAG_WRITER.equals(row.getUpdatedBy())) settingRows.delete(row);
        settingsCache.invalidate();
    }
    @Autowired private com.dossier.api.repository.ent.OrgMemberOffboardingRepository offboardingRows;
    @Autowired private com.dossier.api.service.ent.members.OrgMemberQueryService memberQuery;
    @Autowired private OrgBrandingRepository brandings;
    @Autowired private OrgBrandingVersionRepository brandingVersions;

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
            com.dossier.api.domain.ent.talent.ClientAccount ca = new com.dossier.api.domain.ent.talent.ClientAccount();
            ca.setOrgId(org.getId());
            ca.setName(prefix + " client");
            ca = clientAccounts.saveAndFlush(ca);
            com.dossier.api.domain.ent.talent.ClientRequirement rq = new com.dossier.api.domain.ent.talent.ClientRequirement();
            rq.setOrgId(org.getId());
            rq.setClientId(ca.getId());
            rq.setTitle(prefix + " Java Developer");
            requirementId = clientRequirements.saveAndFlush(rq).getId();
            com.dossier.api.domain.ent.talent.RequirementMatch rm = new com.dossier.api.domain.ent.talent.RequirementMatch();
            rm.setOrgId(org.getId());
            rm.setRequirementId(requirementId);
            rm.setConsultantId(cp.getId());
            rm.setScore(88);
            rm.setStatus("SUGGESTED");
            rm.setReason("Skills align with this role.");
            matchId = requirementMatches.saveAndFlush(rm).getId();
            com.dossier.api.domain.ent.consultantws.CwsSavedSearch ss = new com.dossier.api.domain.ent.consultantws.CwsSavedSearch();
            ss.setOrgId(org.getId());
            ss.setConsultantId(cp.getId());
            ss.setKind(com.dossier.api.domain.ent.consultantws.CwsSavedSearch.SAVED);
            ss.setName(prefix + " search");
            ss.setKeyword("java");
            savedSearchId = cwsSavedSearches.saveAndFlush(ss).getId();
            consultantId = cp.getId();
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
        }

        private Long interview(com.dossier.api.domain.ent.talent.TalentApplication app, String status, Instant at) {
            com.dossier.api.domain.ent.talent.TalentInterview iv = new com.dossier.api.domain.ent.talent.TalentInterview();
            iv.setOrgId(org.getId());
            iv.setApplicationId(app.getId());
            iv.setConsultantId(consultantId);
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
            f.setConsultantId(consultantId);
            f.setOutcome("NEUTRAL");
            f.setSummary("Went fine.");
            cwsInterviewFeedback.saveAndFlush(f);
        }

        /** What the POST .../reopen route undoes: the owner declined the assigned opportunity. */
        void declineAssignedOpportunity() {
            com.dossier.api.domain.ent.consultantws.CwsOpportunityResponse r = new com.dossier.api.domain.ent.consultantws.CwsOpportunityResponse();
            r.setOrgId(org.getId());
            r.setConsultantId(consultantId);
            r.setRequirementId(assignedRequirementId);
            r.setStatus(com.dossier.api.domain.ent.consultantws.CwsOpportunityResponse.DECLINED);
            r.setDeclineReason("Not for me.");
            cwsOpportunityResponses.saveAndFlush(r);
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
            ids.put("pendingMemberId", String.valueOf(pending.getId())); // X1.8's resend names the INVITED seat; every other {memberId} route is the ACTIVE member
            ids.put("invitationId", String.valueOf(pending.getId())); // an invitation is a seat in state INVITED
            ids.put("alertKey", "MEMBERS_SUSPENDED");
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
            ids.put("opportunityMatchId", String.valueOf(assignedMatchId)); // {matchId} of the opportunities routes (see uri())
            ids.put("taskId", String.valueOf(taskId)); // {id} of the tasks routes (see uri())
            ids.put("availabilityBlockId", String.valueOf(availabilityBlockId)); // {id} of the availability/blocks routes (see uri())
            ids.put("offerId", String.valueOf(offerId)); // {id} of the offers routes (see uri())
            ids.put("itemId", String.valueOf(placementChecklistId)); // placements/checklist/{itemId}
            ids.put("notificationId", String.valueOf(notificationId)); // {id} of DELETE notifications/{id} (see uri())
            ids.put("category", "JOB_MATCH"); // a fixed notification category, not a row
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
            .replace("/members/{memberId}/resend", "/members/{pendingMemberId}/resend")
            .replace("/opportunities/{matchId}", "/opportunities/{opportunityMatchId}")
            .replace("/submissions/{id}", "/submissions/{submissionId}")
            .replace("/tasks/{id}", "/tasks/{taskId}")
            .replace("/blocks/{id}", "/blocks/{availabilityBlockId}")
            .replace("/offers/{id}", "/offers/{offerId}")
            .replace("/notifications/{id}", "/notifications/{notificationId}")
            .replace("/interviews/{interviewId}/feedback", "/interviews/{completedInterviewId}/feedback");
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
        if (route.key().equals("POST /api/orgs/{orgId}/groups/{groupId}/members")) req.header("Idempotency-Key", java.util.UUID.randomUUID().toString());
        Case c = COVERAGE.get(route.key());
        String body = c.bodyFor() != null ? c.bodyFor().apply(world) : c.body();
        if (route.method().equals("POST") && (route.pattern().contains("/members/bulk/") || route.pattern().endsWith("/offboard"))) {
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

        String beforeA = snapshot(a);
        String beforeB = snapshot(b);
        int variants = 0;
        for (Route route : orgRoutes()) {
            Map<String, String> ids = new LinkedHashMap<>(a.ids());
            ids.put("orgId", String.valueOf(b.org.getId())); // his own org, but A's row ids
            if (ids.equals(b.ids())) continue; // the route has no row id: nothing of A's to name
            Matcher m = VAR.matcher(route.pattern());
            boolean hasRowId = false;
            while (m.find()) hasRowId |= !m.group(1).equals("orgId") && !m.group(1).equals("kind") && !m.group(1).equals("alertKey") && !m.group(1).equals("itemKey") && !m.group(1).equals("category"); // kind, alertKey, itemKey and category are fixed words, not rows
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
        checks.put("OrgAuditEventRepository", new RepoCheck(Set.of("findByOrgId", "findByOrgIdAndAction", "findByOrgIdAndActionIn", "findByOrgIdAndTargetTypeAndTargetId", "countByOrgId", "countByOrgIdAndActorLogin"), () -> {
            assertThat(audit.findByOrgIdAndActionIn(B, List.of("ROLE_CREATE", "ROLE_UPDATE", "ROLE_ASSIGN", "ROLE_DELETE", "ROLE_RESYNC"), PageRequest.of(0, 100)).getContent()).extracting(OrgAuditEvent::getOrgId).doesNotContain(A);
            assertThat(audit.findByOrgIdAndTargetTypeAndTargetId(B, "ROLE", String.valueOf(a.roleId), PageRequest.of(0, 100)).getContent()).as("A role id in B has no rows").isEmpty();
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
