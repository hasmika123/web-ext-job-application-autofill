package com.dossier.api.repository.ent;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.ent.pipeline.JobOpportunity;
import com.dossier.api.domain.ent.pipeline.OpportunityMatch;
import com.dossier.api.domain.ent.talent.ClientAccount;
import com.dossier.api.domain.ent.talent.ClientRequirement;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.ent.talent.ClientAccountRepository;
import com.dossier.api.repository.ent.talent.ClientRequirementRepository;
import com.dossier.api.repository.ent.pipeline.JobOpportunityRepository;
import com.dossier.api.repository.ent.pipeline.OpportunityMatchRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.web.rest.org.OrgFixtures;
import java.time.Instant;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataAccessException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.transaction.annotation.Transactional;

/** MySQL-backed contract for the additive canonical organization opportunity/match seam. */
@IntegrationTest
@Transactional
class OpportunitySchemaIT {

    @Autowired private UserRepository users;
    @Autowired private OrganizationRepository organizations;
    @Autowired private OrgMemberRepository members;
    @Autowired private ClientAccountRepository clients;
    @Autowired private ClientRequirementRepository requirements;
    @Autowired private JobOpportunityRepository opportunities;
    @Autowired private OpportunityMatchRepository matches;
    @Autowired private jakarta.persistence.EntityManager entityManager;

    private Organization acme;
    private Organization beta;
    private OrgMember acmeConsultant;
    private OrgMember betaConsultant;
    private ClientRequirement acmeRequirement;

    @BeforeEach
    void seedTenants() {
        String suffix = Long.toString(System.nanoTime(), 36);
        OrgFixtures fixtures = new OrgFixtures(users, organizations, members);
        acme = fixtures.org("opportunity-acme-" + suffix, OrgStatus.ACTIVE);
        beta = fixtures.org("opportunity-beta-" + suffix, OrgStatus.ACTIVE);
        acmeConsultant = fixtures.active(acme, "opportunity-acme-consultant-" + suffix, OrgRole.MEMBER);
        betaConsultant = fixtures.active(beta, "opportunity-beta-consultant-" + suffix, OrgRole.MEMBER);

        ClientAccount client = new ClientAccount();
        client.setOrgId(acme.getId());
        client.setName("Acme Client " + suffix);
        client = clients.saveAndFlush(client);

        acmeRequirement = new ClientRequirement();
        acmeRequirement.setOrgId(acme.getId());
        acmeRequirement.setClientId(client.getId());
        acmeRequirement.setTitle("Acme requirement " + suffix);
        acmeRequirement.setPostedAt(Instant.now());
        acmeRequirement = requirements.saveAndFlush(acmeRequirement);
    }

    @Test
    void aJobOpportunityRoundTripsWithOnePublicPostingSource() {
        JobOpportunity opportunity = publicOpportunity(acme, 7001L, "acme-posting-7001");
        opportunity = opportunities.saveAndFlush(opportunity);
        entityManager.clear();

        JobOpportunity read = opportunities.findByOrgIdAndId(acme.getId(), opportunity.getId()).orElseThrow();
        assertThat(read.getKind()).isEqualTo("JOB_POSTING");
        assertThat(read.getPostingId()).isEqualTo(7001L);
        assertThat(read.getRequirementId()).isNull();
        assertThat(read.getStatus()).isEqualTo("NEW");
        assertThat(read.getPriority()).isEqualTo("NORMAL");
        assertThat(read.getPostingLiveKey()).isEqualTo(7001L);
    }

    @Test
    void aRequirementSourceUsesTheTenantCompositeForeignKey() {
        JobOpportunity opportunity = new JobOpportunity();
        opportunity.setOrgId(acme.getId());
        opportunity.setKind("CLIENT_REQUIREMENT");
        opportunity.setRequirementId(acmeRequirement.getId());
        opportunity.setTitle(acmeRequirement.getTitle());
        opportunity.setCompany("Acme Client");
        opportunity.setSourceLabel("REQUIREMENT");
        opportunity.setDedupeKey("acme-requirement");

        JobOpportunity saved = opportunities.saveAndFlush(opportunity);
        assertThat(opportunities.findByOrgIdAndRequirementId(acme.getId(), acmeRequirement.getId())).contains(saved);
    }

    @Test
    void aJobOpportunityCannotHaveBothOrNeitherSource() {
        // MySQL refuses the row with error 3819 (a CHECK constraint), which Hibernate reports as a JpaSystemException rather than a
        // DataIntegrityViolationException: assert the refusal itself, by the constraint's name.
        JobOpportunity both = publicOpportunity(acme, 7002L, "both-source");
        both.setRequirementId(acmeRequirement.getId());
        assertThatThrownBy(() -> opportunities.saveAndFlush(both)).isInstanceOf(DataAccessException.class).hasMessageContaining("ck_job_opportunity_source_kind");
        entityManager.clear(); // a failed insert leaves the entity in the session without an id: never flush that session again

        JobOpportunity neither = publicOpportunity(acme, 7003L, "neither-source");
        neither.setPostingId(null);
        assertThatThrownBy(() -> opportunities.saveAndFlush(neither)).isInstanceOf(DataAccessException.class).hasMessageContaining("ck_job_opportunity_source_kind");
        entityManager.clear();
    }

    @Test
    void anActivePostingIsUniquePerOrganizationButAClosedPostingCanBeReopened() {
        JobOpportunity first = opportunities.saveAndFlush(publicOpportunity(acme, 7004L, "duplicate-one"));
        JobOpportunity duplicate = publicOpportunity(acme, 7004L, "duplicate-two");
        assertThatThrownBy(() -> opportunities.saveAndFlush(duplicate)).isInstanceOf(DataIntegrityViolationException.class);
        entityManager.clear(); // the refused duplicate stays in the session without an id: start a clean one before the next flush

        first = opportunities.findByOrgIdAndId(acme.getId(), first.getId()).orElseThrow();
        first.setStatus("CLOSED");
        opportunities.saveAndFlush(first);
        JobOpportunity reopened = opportunities.saveAndFlush(publicOpportunity(acme, 7004L, "duplicate-three"));
        assertThat(reopened.getId()).isNotEqualTo(first.getId());
    }

    @Test
    void requirementAndPostingSourceKeysAreTenantScoped() {
        JobOpportunity acmePosting = opportunities.saveAndFlush(publicOpportunity(acme, 7005L, "tenant-a"));
        JobOpportunity betaPosting = opportunities.saveAndFlush(publicOpportunity(beta, 7005L, "tenant-b"));

        assertThat(opportunities.findByOrgIdAndId(beta.getId(), acmePosting.getId())).isEmpty();
        assertThat(opportunities.findByOrgIdAndId(acme.getId(), betaPosting.getId())).isEmpty();

        JobOpportunity foreignRequirement = new JobOpportunity();
        foreignRequirement.setOrgId(beta.getId());
        foreignRequirement.setKind("CLIENT_REQUIREMENT");
        foreignRequirement.setRequirementId(acmeRequirement.getId());
        foreignRequirement.setTitle("Cross tenant requirement");
        foreignRequirement.setSourceLabel("REQUIREMENT");
        foreignRequirement.setDedupeKey("cross-tenant");
        assertThatThrownBy(() -> opportunities.saveAndFlush(foreignRequirement)).isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void aMatchRoundTripsAndTheConsultantPairIsUniquePerOrganization() {
        JobOpportunity opportunity = opportunities.saveAndFlush(publicOpportunity(acme, 7006L, "match-one"));
        OpportunityMatch match = matches.saveAndFlush(match(acme, opportunity, acmeConsultant));
        entityManager.clear();

        OpportunityMatch read = matches.findByOrgIdAndOpportunityIdAndConsultantMemberId(acme.getId(), opportunity.getId(), acmeConsultant.getId()).orElseThrow();
        assertThat(read.getId()).isEqualTo(match.getId());
        assertThat(read.getSource()).isEqualTo("SUGGESTED_RULE");
        assertThat(read.getStatus()).isEqualTo("SUGGESTED");
        assertThat(matches.findByOrgIdAndId(beta.getId(), match.getId())).isEmpty();
        assertThatThrownBy(() -> matches.saveAndFlush(match(acme, opportunity, acmeConsultant))).isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void aMatchCannotCrossTheOpportunityOrConsultantTenantBoundary() {
        JobOpportunity opportunity = opportunities.saveAndFlush(publicOpportunity(acme, 7007L, "match-cross-tenant"));
        OpportunityMatch foreignOpportunity = match(beta, opportunity, betaConsultant);
        assertThatThrownBy(() -> matches.saveAndFlush(foreignOpportunity)).isInstanceOf(DataIntegrityViolationException.class);
    }

    private JobOpportunity publicOpportunity(Organization org, Long postingId, String dedupeKey) {
        JobOpportunity opportunity = new JobOpportunity();
        opportunity.setOrgId(org.getId());
        opportunity.setKind("JOB_POSTING");
        opportunity.setPostingId(postingId);
        opportunity.setTitle("Backend Engineer " + postingId);
        opportunity.setCompany("Example Co");
        opportunity.setLocation("Remote");
        opportunity.setSourceLabel("BOARD_API");
        opportunity.setDedupeKey(dedupeKey);
        return opportunity;
    }

    private OpportunityMatch match(Organization org, JobOpportunity opportunity, OrgMember consultant) {
        OpportunityMatch match = new OpportunityMatch();
        match.setOrgId(org.getId());
        match.setOpportunityId(opportunity.getId());
        match.setConsultantMemberId(consultant.getId());
        match.setScore(82);
        match.setReason("Skills and location match");
        match.setSource("SUGGESTED_RULE");
        match.setStatus("SUGGESTED");
        return match;
    }
}
