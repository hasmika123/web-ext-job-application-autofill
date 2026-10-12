package com.dossier.api.service.org;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.domain.org.OrgDomain;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.org.OrgDomainRepository;
import com.dossier.api.repository.org.OrgGroupRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.dto.org.OrgOnboardingDTO;
import com.dossier.api.service.dto.org.OrgOnboardingDTO.Item;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;

/** O2.7: the checklist is computed from the data: which rows are done, what the counts say, and when it is complete. */
class OrgOnboardingServiceTest {

    private final OrganizationRepository orgs = mock(OrganizationRepository.class);
    private final OrgMemberRepository members = mock(OrgMemberRepository.class);
    private final OrgGroupRepository groups = mock(OrgGroupRepository.class);
    private final OrgDomainRepository domains = mock(OrgDomainRepository.class);
    private final OrgOnboardingService service = new OrgOnboardingService(orgs, members, groups, domains);

    private static OrgMembership owner() {
        return new OrgMembership(7L, 1L, 2L, "owner", OrgRole.OWNER, OrgMemberStatus.ACTIVE, OrgStatus.ACTIVE);
    }

    private Organization org(OrgStatus status, String website) {
        Organization o = new Organization();
        o.setId(7L);
        o.setStatus(status);
        o.setWebsite(website);
        when(orgs.findByOrgId(7L)).thenReturn(Optional.of(o));
        return o;
    }

    private static Item item(OrgOnboardingDTO dto, String key) {
        return dto.items().stream().filter(i -> i.key().equals(key)).findFirst().orElseThrow();
    }

    @Test
    void aBrandNewDraftWorkspaceHasNothingDone() {
        org(OrgStatus.DRAFT, null);
        OrgOnboardingDTO dto = service.checklist(owner());
        assertThat(dto.items()).extracting(Item::key).containsExactly("activate", "groups", "profile", "admins", "invite", "plans", "owners", "domain");
        assertThat(dto.items()).allSatisfy(i -> assertThat(i.done()).isFalse());
        assertThat(dto.done()).isZero();
        assertThat(dto.total()).as("the domain row is optional").isEqualTo(7);
        assertThat(dto.complete()).isFalse();
    }

    @Test
    void activationAndGroupsAreDoneFromTheData() {
        org(OrgStatus.ACTIVE, null);
        when(groups.countByOrgId(7L)).thenReturn(2L);
        OrgOnboardingDTO dto = service.checklist(owner());
        assertThat(item(dto, "activate").done()).isTrue();
        assertThat(item(dto, "groups").done()).isTrue();
        assertThat(item(dto, "groups").count()).isEqualTo(2);
        assertThat(dto.done()).isEqualTo(2);
    }

    @Test
    void joinedOfInvitedCountsComeFromTheSeats() {
        org(OrgStatus.ACTIVE, "https://example.org");
        when(members.countByOrgIdAndRoleAndStatus(7L, OrgRole.MEMBER, OrgMemberStatus.ACTIVE)).thenReturn(38L);
        when(members.countByOrgIdAndRoleAndStatus(7L, OrgRole.MEMBER, OrgMemberStatus.INVITED)).thenReturn(22L);
        when(members.countByOrgIdAndRoleAndStatus(7L, OrgRole.ADMIN, OrgMemberStatus.ACTIVE)).thenReturn(2L);
        when(members.countByOrgIdAndRoleAndStatus(7L, OrgRole.ADMIN, OrgMemberStatus.INVITED)).thenReturn(1L);
        OrgOnboardingDTO dto = service.checklist(owner());
        assertThat(item(dto, "invite").count()).isEqualTo(38);
        assertThat(item(dto, "invite").total()).as("38 of 60 joined").isEqualTo(60);
        assertThat(item(dto, "admins").count()).isEqualTo(2);
        assertThat(item(dto, "admins").total()).isEqualTo(3);
        assertThat(item(dto, "profile").done()).isTrue();
    }

    @Test
    void aVerifiedDomainIsDoneAnUnverifiedOneIsNot() {
        org(OrgStatus.ACTIVE, null);
        OrgDomain verified = new OrgDomain();
        verified.setVerifiedAt(Instant.now());
        OrgDomain pending = new OrgDomain();
        when(domains.findByOrgIdOrderByDomain(7L)).thenReturn(List.of(verified, pending));
        Item domain = item(service.checklist(owner()), "domain");
        assertThat(domain.done()).isTrue();
        assertThat(domain.count()).isEqualTo(1);
        assertThat(domain.optional()).isTrue();
    }

    @Test
    void onlyTheRowsWhoseActionExistsAreAvailable() {
        org(OrgStatus.ACTIVE, null);
        OrgOnboardingDTO dto = service.checklist(owner());
        assertThat(dto.items().stream().filter(Item::available).map(Item::key)).containsExactlyInAnyOrder("activate", "groups");
    }

    @Test
    void anOrgThatDoesNotExistIsTheGenericNotFound() {
        when(orgs.findByOrgId(7L)).thenReturn(Optional.empty());
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> service.checklist(owner())).isInstanceOf(OrgNotFoundException.class);
    }
}
