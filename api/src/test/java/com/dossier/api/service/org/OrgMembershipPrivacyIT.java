package com.dossier.api.service.org;

import static org.assertj.core.api.Assertions.assertThat;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.domain.org.OrgAuditEvent;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.org.OrgAuditEventRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.AccountDeletionService;
import com.dossier.api.service.AccountExportService;
import com.dossier.api.service.billing.StripeGateway;
import com.dossier.api.web.rest.org.OrgFixtures;
import jakarta.persistence.EntityManager;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.annotation.Transactional;

/**
 * O1.3 / tenant-model.md section 6: account erasure anonymises every org seat of the person (any state, both erase
 * paths), writes {@code MEMBER_ERASED} keyed by the login, suspends an org whose last owner left, and never blocks the
 * user delete; the data export lists the person's memberships.
 */
@IntegrationTest
@Transactional
class OrgMembershipPrivacyIT {

    @Autowired
    private AccountDeletionService deletion;

    @Autowired
    private AccountExportService export;

    @Autowired
    private UserRepository users;

    @Autowired
    private OrganizationRepository orgs;

    @Autowired
    private OrgMemberRepository members;

    @Autowired
    private OrgAuditEventRepository audit;

    @Autowired
    private EntityManager em;

    @MockitoBean
    private StripeGateway stripeGateway;

    private OrgFixtures fx;
    private Long userId;

    @BeforeEach
    void seed() {
        fx = new OrgFixtures(users, orgs, members);
        userId = users.findOneByLogin("user").orElseThrow().getId();
    }

    private OrgMember reload(OrgMember m) {
        em.flush();
        em.clear();
        return members.findByOrgIdAndId(m.getOrgId(), m.getId()).orElseThrow();
    }

    @Test
    @WithMockUser(username = "user")
    void deletingAMemberAnonymisesTheSeatAndKeepsTheOrgActive() {
        Organization org = fx.org("acme", OrgStatus.ACTIVE);
        fx.active(org, "boss", OrgRole.OWNER);
        OrgMember seat = fx.active(org, "user", OrgRole.MEMBER);
        seat.setDisplayLabel("Cohort 2026-B");
        seat.setInviteEmail("user@example.com");
        members.saveAndFlush(seat);
        OrgMember staff = fx.active(org, "coach1", OrgRole.STAFF);
        seat.setSupportOwnerMemberId(staff.getId());
        members.saveAndFlush(seat);

        deletion.deleteCurrentUserAccount();

        OrgMember after = reload(seat);
        assertThat(after.getStatus()).isEqualTo(OrgMemberStatus.ERASED);
        assertThat(after.getUserId()).isNull();
        assertThat(after.getInviteEmail()).isNull();
        assertThat(after.getInviteTokenHash()).isNull();
        assertThat(after.getDisplayLabel()).isNull();
        assertThat(after.getSupportOwnerMemberId()).isNull();
        assertThat(after.getActiveKey()).isNull();
        assertThat(after.getActiveUserKey()).isNull();
        assertThat(after.getRole()).isEqualTo(OrgRole.MEMBER); // the seat itself stays, so org counts and history are intact
        assertThat(users.findOneByLogin("user")).isEmpty();
        assertThat(orgs.findByOrgId(org.getId()).orElseThrow().getStatus()).isEqualTo(OrgStatus.ACTIVE);

        List<OrgAuditEvent> rows = OrgAuditAsserts.rows(audit, org.getId());
        assertThat(rows).singleElement().satisfies(e -> {
            assertThat(e.getAction()).isEqualTo(OrgAuditService.MEMBER_ERASED);
            assertThat(e.getTargetLogin()).isEqualTo("user"); // a string: it survives the account
            assertThat(e.getActorLogin()).isEqualTo("user");
            assertThat(e.getTargetId()).isEqualTo(String.valueOf(seat.getId()));
            assertThat(e.getDetails()).isEqualTo("was ACTIVE");
        });
    }

    @Test
    @WithMockUser(username = "user")
    void everyStateOfTheUsersSeatsIsErasedAcrossOrgs() {
        Organization a = fx.org("acme", OrgStatus.ACTIVE);
        Organization b = fx.org("globex", OrgStatus.ACTIVE);
        Organization c = fx.org("initech", OrgStatus.CLOSED);
        fx.active(a, "boss", OrgRole.OWNER);
        fx.active(b, "boss", OrgRole.OWNER);
        fx.active(c, "boss", OrgRole.OWNER);
        OrgMember left = fx.seat(a, "user", OrgRole.MEMBER, OrgMemberStatus.LEFT);
        OrgMember suspended = fx.seat(b, "user", OrgRole.STAFF, OrgMemberStatus.SUSPENDED);
        OrgMember inClosed = fx.seat(c, "user", OrgRole.MEMBER, OrgMemberStatus.ACTIVE);

        deletion.deleteCurrentUserAccount();

        for (OrgMember m : new OrgMember[] { left, suspended, inClosed }) {
            OrgMember after = reload(m);
            assertThat(after.getStatus()).isEqualTo(OrgMemberStatus.ERASED);
            assertThat(after.getUserId()).isNull();
        }
        assertThat(members.findMine(userId)).isEmpty();
        assertThat(orgs.findByOrgId(c.getId()).orElseThrow().getStatus()).isEqualTo(OrgStatus.CLOSED);
        assertThat(audit.countByOrgId(a.getId())).isEqualTo(1);
        assertThat(audit.countByOrgId(b.getId())).isEqualTo(1);
        assertThat(audit.countByOrgId(c.getId())).isEqualTo(1);
    }

    @Test
    @WithMockUser(username = "user")
    void theLastActiveOwnerLeavingSuspendsTheOrgAndAuditsIt() {
        Organization org = fx.org("solo", OrgStatus.ACTIVE);
        OrgMember owner = fx.active(org, "user", OrgRole.OWNER);
        fx.active(org, "someone", OrgRole.MEMBER);

        deletion.deleteCurrentUserAccount();

        assertThat(reload(owner).getStatus()).isEqualTo(OrgMemberStatus.ERASED);
        assertThat(orgs.findByOrgId(org.getId()).orElseThrow().getStatus()).isEqualTo(OrgStatus.SUSPENDED);
        assertThat(OrgAuditAsserts.rows(audit, org.getId())).extracting(OrgAuditEvent::getAction).containsExactlyInAnyOrder(OrgAuditService.MEMBER_ERASED, OrgAuditService.ORG_SETTINGS);
        assertThat(OrgAuditAsserts.rows(audit, org.getId())).anySatisfy(e -> {
            assertThat(e.getAction()).isEqualTo(OrgAuditService.ORG_SETTINGS);
            assertThat(e.getActorLogin()).isEqualTo(OrgAuditService.SYSTEM_ACTOR);
            assertThat(e.getDetails()).isEqualTo("no owner left: status ACTIVE -> SUSPENDED");
        });
    }

    @Test
    @WithMockUser(username = "user")
    void anOrgWithAnotherOwnerStaysActive() {
        Organization org = fx.org("duo", OrgStatus.ACTIVE);
        fx.active(org, "user", OrgRole.OWNER);
        fx.active(org, "second-owner", OrgRole.OWNER);

        deletion.deleteCurrentUserAccount();

        assertThat(orgs.findByOrgId(org.getId()).orElseThrow().getStatus()).isEqualTo(OrgStatus.ACTIVE);
        assertThat(OrgAuditAsserts.rows(audit, org.getId())).singleElement().satisfies(e -> assertThat(e.getAction()).isEqualTo(OrgAuditService.MEMBER_ERASED));
    }

    @Test
    @WithMockUser(username = "user")
    void aDraftOrgCreatedByTheErasedUserSurvivesWithoutACreator() {
        Organization org = fx.org("draft-co", OrgStatus.DRAFT);
        org.setCreatedByUserId(userId);
        orgs.saveAndFlush(org);
        fx.active(org, "user", OrgRole.OWNER);

        deletion.deleteCurrentUserAccount();

        em.flush();
        em.clear();
        Organization after = orgs.findByOrgId(org.getId()).orElseThrow();
        assertThat(after.getCreatedByUserId()).isNull(); // ON DELETE SET NULL
        assertThat(after.getStatus()).isEqualTo(OrgStatus.SUSPENDED);
    }

    @Test
    @WithMockUser(username = "admin")
    void theAdminErasePathAnonymisesToo() {
        Organization org = fx.org("acme", OrgStatus.ACTIVE);
        fx.active(org, "boss", OrgRole.OWNER);
        OrgMember seat = fx.active(org, "user", OrgRole.MEMBER);

        deletion.deleteUserAccountByLogin("user");

        assertThat(reload(seat).getStatus()).isEqualTo(OrgMemberStatus.ERASED);
        assertThat(users.findOneByLogin("user")).isEmpty();
        assertThat(OrgAuditAsserts.rows(audit, org.getId())).singleElement().satisfies(e -> {
            assertThat(e.getAction()).isEqualTo(OrgAuditService.MEMBER_ERASED);
            assertThat(e.getTargetLogin()).isEqualTo("user");
        });
    }

    @Test
    @WithMockUser(username = "user")
    void theExportListsTheUsersMembershipsAndNothingElse() {
        Organization a = fx.org("acme", OrgStatus.ACTIVE);
        Organization b = fx.org("globex", OrgStatus.ACTIVE);
        fx.active(a, "boss", OrgRole.OWNER);
        fx.active(b, "boss", OrgRole.OWNER);
        OrgMember seat = fx.active(a, "user", OrgRole.MEMBER);
        seat.setDisplayLabel("Cohort 2026-B");
        members.saveAndFlush(seat);
        fx.seat(b, "user", OrgRole.STAFF, OrgMemberStatus.LEFT);

        Map<String, Object> out = export.exportCurrentUser();

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> rows = (List<Map<String, Object>>) out.get("organizations");
        assertThat(rows).hasSize(2);
        assertThat(rows.get(0)).containsEntry("orgSlug", "acme").containsEntry("role", OrgRole.MEMBER).containsEntry("status", OrgMemberStatus.ACTIVE).containsEntry("displayLabel", "Cohort 2026-B");
        assertThat(rows.get(1)).containsEntry("orgSlug", "globex").containsEntry("status", OrgMemberStatus.LEFT);
        assertThat(rows.toString()).doesNotContain("boss"); // other people's seats are not the user's data
    }

    @Test
    @WithMockUser(username = "user")
    void aUserWithNoOrgsExportsAnEmptyList() {
        assertThat(export.exportCurrentUser()).containsEntry("organizations", List.of());
    }
}
