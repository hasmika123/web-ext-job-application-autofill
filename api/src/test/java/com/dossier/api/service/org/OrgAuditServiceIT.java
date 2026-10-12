package com.dossier.api.service.org;

import static org.assertj.core.api.Assertions.assertThat;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.User;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgType;
import com.dossier.api.domain.org.OrgAuditEvent;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.org.OrgAuditEventRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.transaction.annotation.Transactional;

/** O1.4: the audit writer against MySQL: a row lands in the caller's transaction, scoped to its org, newest first. */
@IntegrationTest
@Transactional
@WithMockUser(username = "user")
class OrgAuditServiceIT {

    @Autowired
    private OrgAuditService service;

    @Autowired
    private OrgAuditEventRepository repository;

    @Autowired
    private OrganizationRepository orgs;

    @Autowired
    private UserRepository users;

    private Organization newOrg(String slug) {
        User creator = users.findOneByLogin("user").orElseThrow();
        Organization o = new Organization();
        o.setSlug(slug);
        o.setName(slug);
        o.setType(OrgType.COMPANY);
        o.setCreatedByUserId(creator.getId());
        return orgs.saveAndFlush(o);
    }

    @Test
    void recordWritesOneScopedRow() {
        Organization a = newOrg("audit-a-" + System.nanoTime());
        Organization b = newOrg("audit-b-" + System.nanoTime());
        long beforeA = repository.countByOrgId(a.getId());

        service.record(a.getId(), OrgRole.OWNER, OrgAuditService.ORG_CREATE, OrgAuditService.TARGET_ORG, null, a.getId().toString(), "created");

        OrgAuditEvent row = OrgAuditAsserts.assertOneNewRow(repository, a.getId(), beforeA, OrgAuditService.ORG_CREATE);
        assertThat(row.getActorLogin()).isEqualTo("user");
        assertThat(row.getActorRole()).isEqualTo("OWNER");
        assertThat(row.getCreatedAt()).isNotNull();
        OrgAuditAsserts.assertNoNewRow(repository, b.getId(), 0);
        assertThat(repository.countByOrgIdAndActorLogin(b.getId(), "user")).isZero();
    }

    @Test
    void findPageIsNewestFirstAndFilterable() {
        Organization a = newOrg("audit-c-" + System.nanoTime());
        service.record(a.getId(), OrgRole.OWNER, OrgAuditService.ORG_CREATE, OrgAuditService.TARGET_ORG, null, null, null);
        service.record(a.getId(), OrgRole.OWNER, OrgAuditService.MEMBER_INVITE, OrgAuditService.TARGET_MEMBER, null, "1", null);
        PageRequest newest = PageRequest.of(0, 10, Sort.by(Sort.Direction.DESC, "id"));
        assertThat(service.findPage(a.getId(), null, newest).getContent()).extracting(OrgAuditEvent::getAction).containsExactly("MEMBER_INVITE", "ORG_CREATE");
        assertThat(service.findPage(a.getId(), "ORG_CREATE", newest).getContent()).hasSize(1);
    }
}
