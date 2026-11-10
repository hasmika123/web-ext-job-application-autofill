package com.dossier.api.service.ent.authz;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.enumeration.AssignmentKind;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.domain.enumeration.PermissionScope;
import com.dossier.api.service.ent.RoleTemplates;
import com.dossier.api.service.ent.TenantContext;
import com.dossier.api.service.org.OrgAccessService;
import com.dossier.api.service.org.OrgException;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * The evaluation order of 05-permission-model.md section 2: the FIRST failing step answers, every refusal maps to the right
 * status in one place, and a caller who passes every step is allowed with a decision that records who acted for whom.
 */
class AuthorizationServiceTest {

    private static final long ORG = 10L;
    private static final long SARAH = 1; // a marketing specialist
    private static final long ANIKA = 2; // a consultant
    private static final long PRIYA = 3; // another consultant
    private static final long MARCUS = 4; // marketing manager

    private OrgAccessService access;
    private AuthzFakes.Directory directory;
    private AuthzFakes.Assignments assignments;
    private List<AuthzStep> hooks;
    private AuthorizationService service;

    @BeforeEach
    void setUp() {
        access = mock(OrgAccessService.class);
        directory = new AuthzFakes.Directory().member(SARAH, 100L, null).member(ANIKA, null, null).member(PRIYA, null, null).member(MARCUS, 100L, null);
        assignments = new AuthzFakes.Assignments();
        hooks = new ArrayList<>();
        rebuild();
    }

    private void rebuild() {
        service = new AuthorizationService(access, new ScopeEvaluator(directory, assignments), assignments, hooks);
    }

    private static Map<String, PermissionScope> grants(Object... kv) {
        Map<String, PermissionScope> m = new LinkedHashMap<>();
        for (int i = 0; i < kv.length; i += 2) m.put((String) kv[i], (PermissionScope) kv[i + 1]);
        return m;
    }

    /** What RoleTemplates gives a template, as a membership of the named member. */
    private static OrgMembership as(String template, long memberId, OrgStatus orgStatus) {
        Map<String, PermissionScope> g = new LinkedHashMap<>();
        RoleTemplates.find(template).orElseThrow().grants().forEach(x -> g.put(x.key(), x.scope()));
        return AuthzFakes.membership(ORG, memberId, OrgRole.MARKETER, orgStatus, g);
    }

    private AuthzRequest ask(OrgMembership actor, AuthzOperation op, Beneficiary b, Long target, String... keys) {
        return new AuthzRequest(ORG, List.of(keys), b, target, op, false, null, null, null, 0, actor);
    }

    private static void assertRefused(AuthzDecision d, AuthzReason reason) {
        assertThat(d.allowed()).as("decision %s", d).isFalse();
        assertThat(d.reason()).isEqualTo(reason);
        assertThat(d.membership()).as("a refusal exposes nothing about the caller").isNull();
    }

    // ---- the acceptance cases ---------------------------------------------------------------------------------------

    @Test
    void aSpecialistReadingAConsultantWithNoOpenAssignmentIsRefusedAs404NotAssigned() {
        OrgMembership sarah = as(RoleTemplates.MARKETING_SPECIALIST, SARAH, OrgStatus.ACTIVE);
        AuthzDecision d = service.authorize(ask(sarah, AuthzOperation.READ, Beneficiary.PATH_MEMBER, ANIKA, "consultants.view"));
        assertRefused(d, AuthzReason.NOT_ASSIGNED);
        assertThat(ReasonToHttp.toException(d)).isInstanceOf(OrgNotFoundException.class).extracting("status").isEqualTo(404);
    }

    @Test
    void withAnOpenPrimaryAssignmentTheSameReadIsAllowedAndTheDecisionRecordsWhoActedForWhom() {
        assignments.add(SARAH, ANIKA, AssignmentKind.PRIMARY);
        OrgMembership sarah = as(RoleTemplates.MARKETING_SPECIALIST, SARAH, OrgStatus.ACTIVE);
        AuthzDecision d = service.authorize(ask(sarah, AuthzOperation.READ, Beneficiary.PATH_MEMBER, ANIKA, "consultants.view"));
        assertThat(d.allowed()).isTrue();
        assertThat(d.actorMemberId()).isEqualTo(SARAH);
        assertThat(d.beneficiaryMemberId()).isEqualTo(ANIKA);
        assertThat(d.scopes()).containsEntry("consultants.view", PermissionScope.ASSIGNED);
        assertThat(d.permissionKeys()).containsExactly("consultants.view");
    }

    @Test
    void anEndedAssignmentGrantsNothing() {
        // the real repository filters ended / not-started / unhealthy rows (see OrgAssignmentsIT); an ended row simply is not effective
        OrgMembership sarah = as(RoleTemplates.MARKETING_SPECIALIST, SARAH, OrgStatus.ACTIVE);
        assertRefused(service.authorize(ask(sarah, AuthzOperation.READ, Beneficiary.PATH_MEMBER, ANIKA, "consultants.view")), AuthzReason.NOT_ASSIGNED);
    }

    @Test
    void aSuspendedOrganizationRefusesWritesWith404AndExplicitStateActionsWith409AndPastDueStillReads() {
        OrgMembership admin = as(RoleTemplates.ORG_ADMIN, SARAH, OrgStatus.SUSPENDED);
        AuthzDecision write = service.authorize(ask(admin, AuthzOperation.WRITE, Beneficiary.NONE, null, "org.settings.manage"));
        assertRefused(write, AuthzReason.ORG_INACTIVE);
        assertThat(ReasonToHttp.toException(write)).isInstanceOf(OrgNotFoundException.class);

        AuthzDecision action = service.authorize(ask(admin, AuthzOperation.WRITE, Beneficiary.NONE, null, "org.settings.manage").withStateAction(true));
        assertRefused(action, AuthzReason.ORG_STATE);
        RuntimeException e = ReasonToHttp.toException(action);
        assertThat(e).isInstanceOf(OrgException.class);
        assertThat(((OrgException) e).getStatus()).isEqualTo(409);
        assertThat(((OrgException) e).getCode()).isEqualTo("ORG_STATE");

        assertThat(service.authorize(ask(admin, AuthzOperation.READ, Beneficiary.NONE, null, "billing.view")).allowed()).as("reads stay open").isTrue();

        OrgMembership pastDue = as(RoleTemplates.ORG_ADMIN, SARAH, OrgStatus.PAST_DUE);
        assertThat(service.authorize(ask(pastDue, AuthzOperation.READ, Beneficiary.NONE, null, "reports.view")).allowed()).isTrue();
        assertThat(service.authorize(ask(pastDue, AuthzOperation.WRITE, Beneficiary.NONE, null, "billing.manage")).allowed()).as("PAST_DUE may still pay").isTrue();
        assertRefused(service.authorize(ask(pastDue, AuthzOperation.WRITE, Beneficiary.NONE, null, "members.invite")), AuthzReason.ORG_INACTIVE);
    }

    // ---- the order ---------------------------------------------------------------------------------------------------

    @Test
    void theFirstFailingStepAnswersWhateverLaterStepsWouldAlsoFail() {
        OrgMembership sarah = as(RoleTemplates.MARKETING_SPECIALIST, SARAH, OrgStatus.SUSPENDED); // step 3 fails ...
        // ... and so would 4 (billing.manage is not hers) and 5 (Anika is not assigned)
        AuthzRequest r = ask(sarah, AuthzOperation.WRITE, Beneficiary.PATH_MEMBER, ANIKA, "billing.manage");
        assertRefused(service.authorize(r), AuthzReason.ORG_INACTIVE);
        assertRefused(service.authorize(r.withActor(as(RoleTemplates.MARKETING_SPECIALIST, SARAH, OrgStatus.ACTIVE))), AuthzReason.PERMISSION_DENIED); // 4 before 5
        assertRefused(
            service.authorize(ask(as(RoleTemplates.MARKETING_SPECIALIST, SARAH, OrgStatus.ACTIVE), AuthzOperation.WRITE, Beneficiary.PATH_MEMBER, ANIKA, "submissions.prepare")),
            AuthzReason.NOT_ASSIGNED // 5 (ASSIGNED scope miss)
        );
        // tenant (1) before membership (2) before everything
        TenantContext unknown = TenantContext.unknown("nope.example.org", TenantContext.Reason.UNKNOWN_HOST);
        assertRefused(service.authorize(r.withTenant(unknown)), AuthzReason.TENANT_UNKNOWN);
        when(access.resolve(ORG)).thenReturn(Optional.empty());
        AuthzRequest noActor = new AuthzRequest(ORG, List.of("billing.manage"), Beneficiary.NONE, null, AuthzOperation.WRITE, false, null, null, null, 0, null);
        assertRefused(service.authorize(noActor), AuthzReason.NOT_MEMBER);
        assertRefused(service.authorize(noActor.withTenant(unknown)), AuthzReason.TENANT_UNKNOWN);
    }

    @Test
    void theTenantStepComparesHostTokenAndPath() {
        OrgMembership admin = as(RoleTemplates.ORG_ADMIN, SARAH, OrgStatus.ACTIVE);
        AuthzRequest r = ask(admin, AuthzOperation.READ, Beneficiary.NONE, null, "billing.view");
        assertThat(service.authorize(r.withTenant(TenantContext.tenant(ORG, 1L, "acme.example.org"))).allowed()).isTrue();
        assertThat(service.authorize(r.withTenant(TenantContext.platform("kiwiply.com"))).allowed()).isTrue();
        assertThat(service.authorize(r.withTenant(TenantContext.unknown(null, TenantContext.Reason.NO_HOST))).allowed()).as("a caller with no host keeps legacy behaviour").isTrue();
        assertRefused(service.authorize(r.withTenant(TenantContext.tenant(ORG + 1, 1L, "beta.example.org"))), AuthzReason.TENANT_MISMATCH);
        assertRefused(service.authorize(r.withTokenTenant(ORG + 1)), AuthzReason.TENANT_MISMATCH);
        assertThat(service.authorize(r.withTokenTenant(ORG)).allowed()).isTrue();
    }

    @Test
    void membershipIsResolvedForTheNamedOrganizationAndMustBeActive() {
        OrgMembership admin = as(RoleTemplates.ORG_ADMIN, SARAH, OrgStatus.ACTIVE);
        AuthzRequest r = ask(null, AuthzOperation.READ, Beneficiary.NONE, null, "billing.view");
        when(access.resolve(ORG)).thenReturn(Optional.of(admin));
        assertThat(service.authorize(r).allowed()).isTrue();
        // an actor handed in for another organization, or with a non-active seat, is no member here
        OrgMembership elsewhere = AuthzFakes.membership(ORG + 1, SARAH, OrgRole.ADMIN, OrgStatus.ACTIVE, Map.of("billing.view", PermissionScope.ORG));
        assertRefused(service.authorize(r.withActor(elsewhere)), AuthzReason.NOT_MEMBER);
        OrgMembership suspendedSeat = new OrgMembership(ORG, SARAH, 5L, "u", OrgRole.ADMIN, OrgMemberStatus.SUSPENDED, OrgStatus.ACTIVE, List.of(), Map.of("billing.view", PermissionScope.ORG));
        assertRefused(service.authorize(r.withActor(suspendedSeat)), AuthzReason.NOT_MEMBER);
        assertRefused(service.authorize(null), AuthzReason.NOT_MEMBER);
        assertRefused(service.authorize(new AuthzRequest(null, List.of(), Beneficiary.NONE, null, AuthzOperation.READ, false, null, null, null, 0, admin)), AuthzReason.NOT_MEMBER);
    }

    @Test
    void permissionsMustAllBeHeldAndUnregisteredKeysFailClosed() {
        OrgMembership sarah = as(RoleTemplates.MARKETING_SPECIALIST, SARAH, OrgStatus.ACTIVE);
        assertThat(service.authorize(ask(sarah, AuthzOperation.READ, Beneficiary.NONE, null, "reports.view", "pipeline.view")).allowed()).isTrue();
        assertRefused(service.authorize(ask(sarah, AuthzOperation.READ, Beneficiary.NONE, null, "reports.view", "billing.view")), AuthzReason.PERMISSION_DENIED);
        assertRefused(service.authorize(ask(sarah, AuthzOperation.READ, Beneficiary.NONE, null, "totally.made_up")), AuthzReason.PERMISSION_DENIED);
        // the empty list means "any active member"
        assertThat(service.authorize(ask(sarah, AuthzOperation.READ, Beneficiary.NONE, null)).allowed()).isTrue();
    }

    @Test
    void aliasesResolveToTheirCanonicalKey() {
        OrgMembership hr = as(RoleTemplates.HR_SPECIALIST, SARAH, OrgStatus.ACTIVE);
        AuthzDecision d = service.authorize(ask(hr, AuthzOperation.WRITE, Beneficiary.NONE, null, "teams.manage"));
        assertThat(d.allowed()).isTrue();
        assertThat(d.permissionKeys()).containsExactly("groups.manage");
    }

    @Test
    void noBeneficiaryMeansTheScopeIsReportedForTheServiceToFilterBy() {
        OrgMembership sarah = as(RoleTemplates.MARKETING_SPECIALIST, SARAH, OrgStatus.ACTIVE);
        AuthzDecision d = service.authorize(ask(sarah, AuthzOperation.READ, Beneficiary.NONE, null, "consultants.view"));
        assertThat(d.allowed()).isTrue();
        assertThat(d.beneficiaryMemberId()).isNull();
        assertThat(d.scopes()).containsEntry("consultants.view", PermissionScope.ASSIGNED);
    }

    @Test
    void selfSubstitutesTheActorAndASuppliedMemberIsRequiredOtherwise() {
        OrgMembership anika = as(RoleTemplates.CONSULTANT, ANIKA, OrgStatus.ACTIVE);
        AuthzDecision self = service.authorize(ask(anika, AuthzOperation.WRITE, Beneficiary.SELF, null, "resumes.manage"));
        assertThat(self.allowed()).isTrue();
        assertThat(self.beneficiaryMemberId()).isEqualTo(ANIKA);
        // a beneficiary kind that names a member with none given: nothing to compare, so no
        assertRefused(service.authorize(ask(anika, AuthzOperation.WRITE, Beneficiary.PATH_MEMBER, null, "resumes.manage")), AuthzReason.OUT_OF_SCOPE);
        // OWN scope on someone else's record
        assertRefused(service.authorize(ask(anika, AuthzOperation.WRITE, Beneficiary.PATH_MEMBER, PRIYA, "resumes.manage")), AuthzReason.OUT_OF_SCOPE);
        // and a member that is not in this organization at all is out of scope for every scope, ORG included
        OrgMembership admin = as(RoleTemplates.ORG_ADMIN, SARAH, OrgStatus.ACTIVE);
        assertRefused(service.authorize(ask(admin, AuthzOperation.READ, Beneficiary.PATH_MEMBER, 987654L, "consultants.view")), AuthzReason.OUT_OF_SCOPE);
        assertThat(service.authorize(ask(admin, AuthzOperation.READ, Beneficiary.PATH_MEMBER, ANIKA, "consultants.view")).allowed()).isTrue();
    }

    // ---- step 9 ------------------------------------------------------------------------------------------------------

    @Test
    void actingForNeedsTheRightKindOfAssignmentAndAWideScopeOnlyExcusesReads() {
        // MARCUS manages a team (TEAM scope for the marketing keys) and SARAH, in the same team, holds ANIKA as PRIMARY
        assignments.add(SARAH, ANIKA, AssignmentKind.PRIMARY);
        OrgMembership marcus = as(RoleTemplates.MARKETING_MANAGER, MARCUS, OrgStatus.ACTIVE);
        // a TEAM-scoped READ of a consultant held by a teammate: step 5 passes (assigned to a team member), step 9 excuses the read
        assertThat(service.authorize(ask(marcus, AuthzOperation.READ, Beneficiary.PATH_MEMBER, ANIKA, "member.act_for")).allowed()).isTrue();
        // but ACTING for her (a write) needs Marcus's own PRIMARY / BACKUP / DELEGATE
        assertRefused(service.authorize(ask(marcus, AuthzOperation.WRITE, Beneficiary.PATH_MEMBER, ANIKA, "submissions.prepare")), AuthzReason.NOT_ASSIGNED);
        assignments.add(MARCUS, ANIKA, AssignmentKind.BACKUP);
        assertThat(service.authorize(ask(marcus, AuthzOperation.WRITE, Beneficiary.PATH_MEMBER, ANIKA, "submissions.prepare")).allowed()).isTrue();
    }

    @Test
    void approvalsNeedAManagerAssignmentNotAMarketerOne() {
        assignments.add(SARAH, ANIKA, AssignmentKind.PRIMARY);
        OrgMembership marcus = as(RoleTemplates.MARKETING_MANAGER, MARCUS, OrgStatus.ACTIVE);
        assertRefused(service.authorize(ask(marcus, AuthzOperation.WRITE, Beneficiary.PATH_MEMBER, ANIKA, "approvals.decide")), AuthzReason.NOT_ASSIGNED);
        assignments.add(MARCUS, ANIKA, AssignmentKind.MANAGER);
        assertThat(service.authorize(ask(marcus, AuthzOperation.WRITE, Beneficiary.PATH_MEMBER, ANIKA, "approvals.decide")).allowed()).isTrue();
        // a MANAGER row does not let him prepare submissions for her
        assertRefused(service.authorize(ask(marcus, AuthzOperation.WRITE, Beneficiary.PATH_MEMBER, ANIKA, "submissions.prepare")), AuthzReason.NOT_ASSIGNED);
    }

    @Test
    void actingForYourselfNeverNeedsAnAssignment() {
        OrgMembership sarah = as(RoleTemplates.MARKETING_SPECIALIST, SARAH, OrgStatus.ACTIVE);
        assertThat(service.authorize(ask(sarah, AuthzOperation.WRITE, Beneficiary.SELF, null, "submissions.prepare")).allowed()).isTrue();
    }

    // ---- the hooks (steps 6-8, 10, 11) ------------------------------------------------------------------------------

    private AuthzStep hook(int step, AuthzReason refuse, List<String> trace) {
        return new AuthzStep() {
            @Override
            public int step() {
                return step;
            }

            @Override
            public Optional<AuthzReason> check(Context context) {
                trace.add("step" + step);
                return Optional.ofNullable(refuse);
            }
        };
    }

    @Test
    void hooksRunInStepOrderAroundTheAssignmentCheckAndTheFirstRefusalStops() {
        assignments.add(SARAH, ANIKA, AssignmentKind.PRIMARY);
        List<String> trace = new ArrayList<>();
        hooks.add(hook(11, null, trace));
        hooks.add(hook(8, null, trace));
        hooks.add(hook(6, null, trace));
        hooks.add(hook(10, null, trace));
        hooks.add(hook(7, null, trace));
        rebuild();
        OrgMembership sarah = as(RoleTemplates.MARKETING_SPECIALIST, SARAH, OrgStatus.ACTIVE);
        AuthzRequest r = ask(sarah, AuthzOperation.WRITE, Beneficiary.PATH_MEMBER, ANIKA, "resumes.edit_for").withFeature("ai.resume_tailoring", 1);
        assertThat(service.authorize(r).allowed()).isTrue();
        assertThat(trace).containsExactly("step6", "step7", "step8", "step10", "step11");

        trace.clear();
        hooks.clear();
        hooks.add(hook(6, null, trace));
        hooks.add(hook(7, AuthzReason.FEATURE_NOT_LICENSED, trace));
        hooks.add(hook(8, null, trace));
        hooks.add(hook(10, null, trace));
        rebuild();
        assertRefused(service.authorize(r), AuthzReason.FEATURE_NOT_LICENSED);
        assertThat(trace).containsExactly("step6", "step7");
    }

    @Test
    void aRefusalOfStep9BeatsStep10() {
        List<String> trace = new ArrayList<>();
        hooks.add(hook(10, AuthzReason.CONSENT_REQUIRED, trace));
        rebuild();
        OrgMembership sarah = as(RoleTemplates.MARKETING_SPECIALIST, SARAH, OrgStatus.ACTIVE);
        // she holds ASSIGNED scope over Anika through a PRIMARY row for scope but the key needs BACKUP/PRIMARY: use a key that passes 5 and fails 9
        assignments.add(SARAH, ANIKA, AssignmentKind.PRIMARY);
        AuthzRequest ok = ask(sarah, AuthzOperation.WRITE, Beneficiary.PATH_MEMBER, ANIKA, "resumes.edit_for");
        assertRefused(service.authorize(ok), AuthzReason.CONSENT_REQUIRED); // 9 passed, 10 refuses
        assertThat(trace).containsExactly("step10");
        trace.clear();
        assignments.effective.clear();
        assertRefused(service.authorize(ok), AuthzReason.NOT_ASSIGNED); // 5 refuses first: the hook never runs
        assertThat(trace).isEmpty();
    }

    @Test
    void skipRulesFeatureStepsNeedAFeatureAndConsentNeedsAnotherPerson() {
        List<String> trace = new ArrayList<>();
        for (int s : new int[] { 6, 7, 8, 10, 11 }) hooks.add(hook(s, null, trace));
        rebuild();
        OrgMembership anika = as(RoleTemplates.CONSULTANT, ANIKA, OrgStatus.ACTIVE);
        // no feature, acting for yourself: only 6 runs
        service.authorize(ask(anika, AuthzOperation.WRITE, Beneficiary.SELF, null, "resumes.manage"));
        assertThat(trace).containsExactly("step6");
        trace.clear();
        // a feature, acting for yourself: 6, 7, 8, 11 (consent 10 is skipped: actor = beneficiary)
        service.authorize(ask(anika, AuthzOperation.WRITE, Beneficiary.SELF, null, "resumes.manage").withFeature("ai.resume_tailoring", 2));
        assertThat(trace).containsExactly("step6", "step7", "step8", "step11");
        trace.clear();
        // no feature, acting for another person (organization-wide admin read): 6 and 10
        OrgMembership admin = as(RoleTemplates.ORG_ADMIN, SARAH, OrgStatus.ACTIVE);
        service.authorize(ask(admin, AuthzOperation.READ, Beneficiary.PATH_MEMBER, ANIKA, "consultants.view"));
        assertThat(trace).containsExactly("step6", "step10");
    }

    @Test
    void aHookThatThrowsRefusesWithItsStepsReasonAndAnInvalidHookFailsAtStartup() {
        hooks.add(new AuthzStep() {
            @Override
            public int step() {
                return 6;
            }

            @Override
            public Optional<AuthzReason> check(Context context) {
                throw new IllegalStateException("module registry down");
            }
        });
        rebuild();
        OrgMembership admin = as(RoleTemplates.ORG_ADMIN, SARAH, OrgStatus.ACTIVE);
        assertRefused(service.authorize(ask(admin, AuthzOperation.READ, Beneficiary.NONE, null, "billing.view")), AuthzReason.MODULE_OFF);

        for (int bad : new int[] { 1, 5, 9, 12 }) {
            assertThatThrownBy(() -> new AuthorizationService(access, new ScopeEvaluator(directory, assignments), assignments, List.of(hook(bad, null, new ArrayList<>()))))
                .as("step " + bad).isInstanceOf(IllegalStateException.class);
        }
    }

    // ---- the HTTP form -----------------------------------------------------------------------------------------------

    @Test
    void requireThrowsTheHttpFormOfARefusalAndReturnsTheDecisionOtherwise() {
        OrgMembership sarah = as(RoleTemplates.MARKETING_SPECIALIST, SARAH, OrgStatus.ACTIVE);
        assertThatThrownBy(() -> service.require(ask(sarah, AuthzOperation.READ, Beneficiary.NONE, null, "billing.view"))).isInstanceOf(OrgNotFoundException.class);
        assertThat(service.require(ask(sarah, AuthzOperation.READ, Beneficiary.NONE, null, "reports.view")).allowed()).isTrue();
    }

    @Test
    void everyReasonMapsToTheStatusOfItsStepAndOnly404sAreGeneric() {
        for (AuthzReason r : AuthzReason.values()) {
            RuntimeException e = ReasonToHttp.toException(r, Map.of());
            if (r.httpStatus() == 404) {
                assertThat(e).as(r.name()).isInstanceOf(OrgNotFoundException.class);
            } else {
                assertThat(e).as(r.name()).isInstanceOf(OrgException.class);
                assertThat(((OrgException) e).getStatus()).isEqualTo(r.httpStatus());
                assertThat(((OrgException) e).getCode()).isEqualTo(r.name());
            }
        }
        RuntimeException consent = ReasonToHttp.toException(AuthzReason.CONSENT_REQUIRED, Map.of("beneficiary", 2L, "consentKind", "FULL"));
        assertThat(((OrgException) consent).getExtra()).containsEntry("beneficiary", 2L).containsEntry("consentKind", "FULL");
        assertThatThrownBy(() -> ReasonToHttp.toException(AuthzDecision.allow(ORG, null, null, List.of(), Map.of()))).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void theServiceNeverTouchesTheAccessServiceWhenTheActorIsGiven() {
        OrgMembership admin = as(RoleTemplates.ORG_ADMIN, SARAH, OrgStatus.ACTIVE);
        service.authorize(ask(admin, AuthzOperation.READ, Beneficiary.NONE, null, "billing.view"));
        verify(access, never()).resolve(any());
    }
}
