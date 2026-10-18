package com.dossier.api.domain.org;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.User;
import com.dossier.api.domain.enumeration.OrgGroupKind;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.domain.enumeration.OrgType;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.org.OrgAuditEventRepository;
import com.dossier.api.repository.org.OrgDomainRepository;
import com.dossier.api.repository.org.OrgGroupRepository;
import com.dossier.api.repository.org.OrgInviteBatchRepository;
import com.dossier.api.repository.org.OrgJoinCodeRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import jakarta.persistence.EntityManager;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.PageRequest;
import org.springframework.transaction.annotation.Transactional;

/**
 * O1.1: the organization schema boots under Liquibase and every entity round-trips; the two generated columns
 * make "one live row per email per org" and "one live membership per user per org" database facts, while a row
 * that has left frees its slot (so a re-invite works).
 */
@IntegrationTest
@Transactional
class OrgSchemaIT {

    @Autowired
    private OrganizationRepository orgs;

    @Autowired
    private OrgMemberRepository members;

    @Autowired
    private OrgGroupRepository groups;

    @Autowired
    private OrgInviteBatchRepository batches;

    @Autowired
    private OrgJoinCodeRepository joinCodes;

    @Autowired
    private OrgDomainRepository domains;

    @Autowired
    private OrgAuditEventRepository audit;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private EntityManager em;

    private User user;
    private User other;
    private Organization org;

    @BeforeEach
    void seed() {
        user = userRepository.findOneByLogin("user").orElseThrow();
        other = userRepository.findOneByLogin("admin").orElseThrow();
        org = newOrg("acme-" + System.nanoTime());
    }

    private Organization newOrg(String slug) {
        Organization o = new Organization();
        o.setSlug(slug);
        o.setName("Acme Bootcamp");
        o.setType(OrgType.BOOTCAMP);
        o.setCreatedByUserId(user.getId());
        return orgs.saveAndFlush(o);
    }

    private OrgMember invited(Organization o, String email) {
        OrgMember m = new OrgMember();
        m.setOrgId(o.getId());
        m.setRole(OrgRole.MEMBER);
        m.setStatus(OrgMemberStatus.INVITED);
        m.setInviteEmail(email);
        return members.saveAndFlush(m);
    }

    private OrgMember joined(Organization o, User u, OrgMemberStatus status) {
        OrgMember m = new OrgMember();
        m.setOrgId(o.getId());
        m.setUserId(u.getId());
        m.setRole(OrgRole.MEMBER);
        m.setStatus(status);
        m.setJoinedAt(Instant.now());
        return members.saveAndFlush(m);
    }

    private void clearContext() {
        em.flush();
        em.clear();
    }

    @Test
    void organizationRoundTripsWithItsDefaults() {
        clearContext();
        Organization back = orgs.findByOrgId(org.getId()).orElseThrow();
        assertThat(back.getStatus()).isEqualTo(OrgStatus.DRAFT);
        assertThat(back.getType()).isEqualTo(OrgType.BOOTCAMP);
        assertThat(back.getTimezone()).isEqualTo("UTC");
        assertThat(back.getCreatedByUserId()).isEqualTo(user.getId());
        assertThat(back.getCreatedAt()).isNotNull();
        assertThat(orgs.existsBySlug(back.getSlug())).isTrue();
        assertThat(orgs.findBySlug("no-such-slug")).isEmpty();
    }

    @Test
    void settingsJsonAndOptionalColumnsRoundTrip() {
        org.setSettingsJson("{\"defaultRole\":\"MEMBER\",\"allowSelfLeave\":true}");
        org.setCountry("US");
        org.setSizeBand("51_200");
        orgs.saveAndFlush(org);
        clearContext();
        Organization back = orgs.findByOrgId(org.getId()).orElseThrow();
        assertThat(back.getSettingsJson()).contains("allowSelfLeave");
        assertThat(back.getCountry()).isEqualTo("US");
        assertThat(back.getSizeBand()).isEqualTo("51_200");
    }

    @Test
    void duplicateSlugIsRejected() {
        assertThatThrownBy(() -> newOrg(org.getSlug())).isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void memberGeneratedKeysAreComputedByTheDatabase() {
        OrgMember inv = invited(org, "ada@example.com");
        OrgMember act = joined(org, user, OrgMemberStatus.ACTIVE);
        clearContext();
        OrgMember a = members.findByOrgIdAndId(org.getId(), inv.getId()).orElseThrow();
        assertThat(a.getActiveKey()).isEqualTo(org.getId() + ":ada@example.com");
        assertThat(a.getActiveUserKey()).isNull(); // INVITED: no user yet
        OrgMember b = members.findByOrgIdAndId(org.getId(), act.getId()).orElseThrow();
        assertThat(b.getActiveUserKey()).isEqualTo(org.getId() + ":" + user.getId());
        assertThat(b.getActiveKey()).isNull(); // no invite email, nothing to collide on
    }

    @Test
    void twoLiveRowsForTheSameEmailInAnOrgFail() {
        invited(org, "dup@example.com");
        assertThatThrownBy(() -> invited(org, "dup@example.com")).isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void theSameEmailMayBeInvitedByTwoDifferentOrgs() {
        Organization second = newOrg("globex-" + System.nanoTime());
        invited(org, "shared@example.com");
        invited(second, "shared@example.com");
        assertThat(members.findByOrgIdAndInviteEmailAndStatusIn(second.getId(), "shared@example.com", OrgMemberStatus.LIVE)).hasSize(1);
    }

    @Test
    void invitedThenLeftThenReinvitedSucceeds() {
        OrgMember first = invited(org, "again@example.com");
        first.setStatus(OrgMemberStatus.LEFT);
        first.setLeftAt(Instant.now());
        members.saveAndFlush(first);
        clearContext();
        assertThat(members.findByOrgIdAndId(org.getId(), first.getId()).orElseThrow().getActiveKey()).isNull();

        OrgMember second = invited(org, "again@example.com"); // the slot was freed by LEFT
        assertThat(second.getId()).isNotEqualTo(first.getId());
        assertThat(members.findByOrgIdAndInviteEmailAndStatusIn(org.getId(), "again@example.com", OrgMemberStatus.LIVE)).hasSize(1);
    }

    @Test
    void oneLiveMembershipPerUserPerOrg() {
        joined(org, user, OrgMemberStatus.ACTIVE);
        assertThatThrownBy(() -> joined(org, user, OrgMemberStatus.SUSPENDED)).isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void aUserMayBelongToSeveralOrgsAndFindMineSeesAll() {
        Organization second = newOrg("globex-" + System.nanoTime());
        joined(org, user, OrgMemberStatus.ACTIVE);
        joined(second, user, OrgMemberStatus.ACTIVE);
        joined(second, other, OrgMemberStatus.ACTIVE);
        assertThat(members.findMine(user.getId())).extracting(OrgMember::getOrgId).containsExactlyInAnyOrder(org.getId(), second.getId());
        assertThat(orgs.findAllByOrgIdIn(List.of(org.getId(), second.getId()))).hasSize(2);
    }

    @Test
    void aMemberWhoLeftCanJoinAgain() {
        OrgMember m = joined(org, user, OrgMemberStatus.ACTIVE);
        m.setStatus(OrgMemberStatus.LEFT);
        members.saveAndFlush(m);
        joined(org, user, OrgMemberStatus.ACTIVE);
        assertThat(members.countByOrgIdAndStatus(org.getId(), OrgMemberStatus.ACTIVE)).isEqualTo(1);
        assertThat(members.countByOrgIdAndStatus(org.getId(), OrgMemberStatus.LEFT)).isEqualTo(1);
    }

    @Test
    void groupsAreUniquePerOrgAndFreeAcrossOrgs() {
        Organization second = newOrg("globex-" + System.nanoTime());
        group(org, "Cohort 26-A");
        group(second, "Cohort 26-A"); // another org may reuse the name
        assertThatThrownBy(() -> group(org, "Cohort 26-A")).isInstanceOf(DataIntegrityViolationException.class);
    }

    private OrgGroup group(Organization o, String name) {
        OrgGroup g = new OrgGroup();
        g.setOrgId(o.getId());
        g.setName(name);
        g.setKind(OrgGroupKind.COHORT);
        return groups.saveAndFlush(g);
    }

    @Test
    void deletingAGroupDetachesItsMembers() {
        OrgGroup g = group(org, "Eng");
        OrgMember m = joined(org, user, OrgMemberStatus.ACTIVE);
        m.setGroupId(g.getId());
        members.saveAndFlush(m);
        assertThat(groups.deleteByOrgIdAndId(org.getId(), g.getId())).isEqualTo(1);
        clearContext();
        assertThat(members.findByOrgIdAndId(org.getId(), m.getId()).orElseThrow().getGroupId()).isNull();
    }

    @Test
    void supportOwnerAndInviterLinkToOtherMembers() {
        OrgMember staff = joined(org, user, OrgMemberStatus.ACTIVE);
        OrgMember m = invited(org, "student@example.com");
        m.setSupportOwnerMemberId(staff.getId());
        m.setInvitedByMemberId(staff.getId());
        m.setInviteTokenHash("a".repeat(64));
        m.setInviteExpiresAt(Instant.now().plusSeconds(3600));
        members.saveAndFlush(m);
        clearContext();
        OrgMember back = members.findByOrgIdAndId(org.getId(), m.getId()).orElseThrow();
        assertThat(back.getSupportOwnerMemberId()).isEqualTo(staff.getId());
        assertThat(back.getInviteTokenHash()).hasSize(64);
    }

    @Test
    void inviteBatchJoinCodeAndDomainRoundTrip() {
        OrgInviteBatch b = new OrgInviteBatch();
        b.setOrgId(org.getId());
        b.setSource(OrgInviteBatch.SOURCE_CSV);
        b.setFileName("cohort.csv");
        b.setRowCount(60);
        b.setInvalidCount(2);
        batches.save(b);

        OrgJoinCode c = new OrgJoinCode();
        c.setOrgId(org.getId());
        c.setCode("KIWI7F3A");
        c.setMaxUses(40);
        joinCodes.save(c);

        OrgDomain d = new OrgDomain();
        d.setOrgId(org.getId());
        d.setDomain("acme.edu");
        d.setVerificationToken("0123456789abcdef0123456789abcdef");
        domains.save(d);
        clearContext();

        assertThat(batches.findByOrgIdOrderByCreatedAtDesc(org.getId())).singleElement().satisfies(x -> assertThat(x.getRowCount()).isEqualTo(60));
        assertThat(joinCodes.findByOrgIdOrderByCreatedAtDesc(org.getId())).singleElement().satisfies(x -> {
            assertThat(x.getCode()).isEqualTo("KIWI7F3A");
            assertThat(x.getRole()).isEqualTo(OrgRole.MEMBER);
        });
        assertThat(domains.findByOrgIdOrderByDomain(org.getId())).singleElement().satisfies(x -> assertThat(x.isAutoJoin()).isFalse());
    }

    @Test
    void auditEventRoundTripsAndIsScopedToItsOrg() {
        Organization second = newOrg("globex-" + System.nanoTime());
        audit.save(event(org, "ORG_CREATE", "alice"));
        audit.save(event(second, "ORG_CREATE", "bob"));
        clearContext();
        assertThat(audit.findByOrgId(org.getId(), PageRequest.of(0, 10)).getContent()).singleElement().satisfies(e -> {
            assertThat(e.getActorLogin()).isEqualTo("alice");
            assertThat(e.getCreatedAt()).isNotNull();
        });
        assertThat(audit.countByOrgIdAndActorLogin(org.getId(), "bob")).isZero();
    }

    private OrgAuditEvent event(Organization o, String action, String actor) {
        OrgAuditEvent e = new OrgAuditEvent();
        e.setOrgId(o.getId());
        e.setActorLogin(actor);
        e.setAction(action);
        e.setTargetType("ORG");
        return e;
    }
}
