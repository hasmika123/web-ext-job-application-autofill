package com.dossier.api.service.ent.mkt.submissions;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.mock;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.ent.mkt.MktSubmissionEventRepository;
import com.dossier.api.repository.ent.mkt.MktSubmissionRepository;
import com.dossier.api.repository.ent.mkt.MktSubmissionViewRepository;
import com.dossier.api.repository.ent.talent.TalentApplicationRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.ent.EnterpriseDemoSeeder;
import com.dossier.api.service.ent.TalentDemoSeeder;
import com.dossier.api.service.ent.authz.AuthorizationService;
import com.dossier.api.service.ent.mkt.MktScope;
import com.dossier.api.service.ent.mkt.submissions.MktSubmissionsDto.BoardResponse;
import com.dossier.api.service.ent.mkt.submissions.MktSubmissionsDto.CreateRequest;
import com.dossier.api.service.ent.mkt.submissions.MktSubmissionsDto.Options;
import com.dossier.api.service.ent.mkt.submissions.MktSubmissionsDto.Query;
import com.dossier.api.service.ent.mkt.submissions.MktSubmissionsDto.Row;
import com.dossier.api.service.org.OrgAuditService;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.TestPropertySource;
import org.springframework.transaction.annotation.Transactional;

/**
 * The Submissions page on the real stack (MySQL via Testcontainers): the migration applies with the tenant keys, the demo seeder is consistent with
 * the talent applications and idempotent, Beta never mixes with Acme (and an Acme record is a 404 for Beta's caller), the draft / approval / record flow
 * writes rows, events and an audit row, and the composite tenant foreign key refuses a row that points at another tenant's consultant.
 *
 * <p>NOT RUN on the machine that wrote it (no Docker); compiled with {@code ./gradlew compileTestJava}.
 */
@IntegrationTest
@Transactional
@TestPropertySource(properties = { "dossier.demo.enabled=true", "dossier.demo.enterprise-seed=true", "dossier.demo.create-accounts=false" })
@org.junit.jupiter.api.Timeout(240)
class MktSubmissionsIT {

    @Autowired private EnterpriseDemoSeeder baseSeeder;
    @Autowired private TalentDemoSeeder talentSeeder;
    @Autowired private MktSubmissionsDemoSeeder seeder;
    @Autowired private OrganizationRepository orgs;
    @Autowired private TalentApplicationRepository applications;
    @Autowired private MktSubmissionRepository submissions;
    @Autowired private MktSubmissionEventRepository events;
    @Autowired private MktSubmissionViewRepository views;
    @Autowired private OrgAuditService audit;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private ResumeBuilderSettings settings;

    private Long acme;
    private Long beta;

    @BeforeEach
    void seed() {
        assertThat(baseSeeder.seed().ran()).isTrue();
        talentSeeder.seed();
        seeder.seed();
        acme = orgs.findBySlug(EnterpriseDemoSeeder.ACME_SLUG).map(Organization::getId).orElseThrow();
        beta = orgs.findBySlug(EnterpriseDemoSeeder.BETA_SLUG).map(Organization::getId).orElseThrow();
    }

    @AfterEach
    void forget() {
        settings.invalidate();
    }

    private MktSubmissionsService service(Long orgId) {
        MktScope scope = mock(MktScope.class, org.mockito.Mockito.CALLS_REAL_METHODS);
        doReturn(new MktScope.View(orgId, memberOf(orgId), true, Set.of())).when(scope).resolve(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.eq("submissions.record"));
        return new MktSubmissionsService(scope, mock(AuthorizationService.class), submissions, events, views, audit, new com.dossier.api.service.ent.applications.EntChangeActors(org.mockito.Mockito.mock(com.dossier.api.repository.ent.EntChangeActorRepository.class), org.mockito.Mockito.mock(com.dossier.api.repository.UserRepository.class)));
    }

    private Long memberOf(Long orgId) {
        return jdbc.queryForObject("select min(id) from org_member where org_id = ?", Long.class, orgId);
    }

    private OrgMembership me(Long orgId) {
        return new OrgMembership(orgId, memberOf(orgId), 1L, "demo-ent-it", OrgRole.MEMBER, OrgMemberStatus.ACTIVE, OrgStatus.ACTIVE);
    }

    private static Query all() {
        return new Query(null, null, null, null, null, "all", "all", null, null, 0, 100);
    }

    @Test
    void theMigrationAppliesWithTheTenantKeys() {
        for (String table : List.of("mkt_submission", "mkt_submission_event", "mkt_submission_view")) {
            String nullable = jdbc.queryForObject(
                "select is_nullable from information_schema.columns where table_schema = database() and table_name = ? and column_name = 'org_id'", String.class, table
            );
            assertThat(nullable).as(table + ".org_id").isEqualTo("NO");
        }
        Integer fks = jdbc.queryForObject(
            "select count(*) from information_schema.referential_constraints where constraint_schema = database() and constraint_name in ('fk_mkt_submission_consultant', 'fk_mkt_submission_requirement', 'fk_mkt_submission_client')",
            Integer.class
        );
        assertThat(fks).isEqualTo(3);
    }

    @Test
    void theSeedFollowsTheApplicationsAndASecondRunAddsNothing() {
        long apps = applications.countByOrgId(acme);
        assertThat(submissions.countByOrgId(acme)).as("one record per application").isEqualTo(apps);
        assertThat(submissions.countByOrgId(beta)).isEqualTo(applications.countByOrgId(beta));
        long before = submissions.countByOrgId(acme);
        long events0 = events.countByOrgId(acme);
        assertThat(seeder.seed()).isZero();
        assertThat(submissions.countByOrgId(acme)).isEqualTo(before);
        assertThat(events.countByOrgId(acme)).isEqualTo(events0);
        Integer bad = jdbc.queryForObject(
            "select count(*) from mkt_submission s join talent_application a on a.org_id = s.org_id and a.consultant_id = s.consultant_id and a.requirement_id = s.requirement_id "
                + "where s.org_id = ? and a.stage <> 'ASSIGNED' and s.status = 'DRAFT'", Integer.class, acme
        );
        assertThat(bad).as("a submitted application never seeds a draft").isZero();
    }

    @Test
    void theBoardIsOrgScopedAndAnotherTenantsRecordIsA404() {
        BoardResponse a = service(acme).board(me(acme), all());
        BoardResponse b = service(beta).board(me(beta), all());
        assertThat(a.total()).isEqualTo(submissions.countByOrgId(acme));
        assertThat(b.total()).isEqualTo(submissions.countByOrgId(beta));
        assertThat(a.items()).extracting(Row::id).doesNotContainAnyElementsOf(b.items().stream().map(Row::id).toList());
        Long acmeId = a.items().get(0).id();
        assertThatThrownBy(() -> service(beta).detail(me(beta), acmeId)).isInstanceOf(OrgNotFoundException.class);
        assertThat(a.breakdown().total()).isEqualTo(a.total());
        assertThat(a.kpis().pendingApprovals().sparkline()).hasSize(8);
    }

    @Test
    void theDraftApprovalAndRecordFlowWritesRowsEventsAndAnAuditRow() {
        MktSubmissionsService svc = service(acme);
        OrgMembership who = me(acme);
        Options options = svc.options(who);
        assertThat(options.consultants()).isNotEmpty();
        assertThat(options.jobs()).isNotEmpty();
        long auditBefore = jdbc.queryForObject("select count(*) from org_audit_event where org_id = ?", Long.class, acme);
        Row created = null;
        outer:
        for (var c : options.consultants()) {
            for (var j : options.jobs()) {
                if (!submissions.existsByOrgIdAndConsultantIdAndRequirementIdAndArchivedAtIsNull(acme, c.id(), j.id())) {
                    created = svc.create(who, new CreateRequest(c.id(), j.id(), null, "Strong fit"));
                    break outer;
                }
            }
        }
        assertThat(created).isNotNull();
        assertThat(created.status()).isEqualTo("DRAFT");
        Row asked = svc.requestApproval(who, created.id());
        assertThat(asked.approvalState()).isEqualTo("AWAITING_APPROVAL");
        Row approved = svc.recordApproval(who, created.id(), new MktSubmissionsDto.ApprovalRequest("APPROVED", null));
        assertThat(approved.approvalState()).isEqualTo("APPROVED");
        Row submitted = svc.recordStatus(who, created.id(), new MktSubmissionsDto.StatusRequest("SUBMITTED", null));
        assertThat(submitted.status()).isEqualTo("SUBMITTED");
        assertThat(events.findByOrgIdAndSubmissionIdOrderByOccurredAtAsc(acme, created.id())).hasSize(4);
        assertThat(jdbc.queryForObject("select count(*) from org_audit_event where org_id = ?", Long.class, acme)).isEqualTo(auditBefore + 4);
    }

    @Test
    void aRowCannotPointAtAnotherTenantsConsultant() {
        Long betaConsultant = jdbc.queryForObject("select min(id) from consultant_profile where org_id = ?", Long.class, beta);
        Long acmeJob = jdbc.queryForObject("select min(id) from client_requirement where org_id = ?", Long.class, acme);
        Long acmeClient = jdbc.queryForObject("select min(client_id) from client_requirement where org_id = ?", Long.class, acme);
        assertThatThrownBy(() ->
            jdbc.update(
                "insert into mkt_submission (org_id, code, consultant_id, requirement_id, client_id, approval_state, status, created_at, updated_at) values (?, 'SUB-X-1', ?, ?, ?, 'DRAFT', 'DRAFT', now(6), now(6))",
                acme, betaConsultant, acmeJob, acmeClient
            )
        ).isInstanceOf(DataIntegrityViolationException.class);
    }
}
