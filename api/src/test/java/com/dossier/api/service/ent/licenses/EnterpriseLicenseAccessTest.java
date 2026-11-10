package com.dossier.api.service.ent.licenses;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.User;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.ent.talent.ConsultantProfileRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.entitlement.FeatureKeys;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** From an enterprise login to its licence (LICENCES-BUILD.md L2): the organization comes from the login, and every way a seat can stop being live closes it. */
class EnterpriseLicenseAccessTest {

    static final String LOGIN = "ent#7#anika.rao";
    static final Long ORG = 7L;
    static final Long USER = 70L;
    static final Long SEAT = 71L;
    static final Long CONSULTANT = 72L;

    UserRepository users = mock(UserRepository.class);
    OrgMemberRepository members = mock(OrgMemberRepository.class);
    OrganizationRepository orgs = mock(OrganizationRepository.class);
    ConsultantProfileRepository consultants = mock(ConsultantProfileRepository.class);
    OrgLicenseGate gate = mock(OrgLicenseGate.class);
    EnterpriseLicenseAccess access = new EnterpriseLicenseAccess(users, members, orgs, consultants, gate);

    OrgMember seat = new OrgMember();
    Organization org = new Organization();
    ConsultantProfile profile = new ConsultantProfile();

    @BeforeEach
    void ready() {
        User u = new User();
        u.setId(USER);
        when(users.findOneByLogin(LOGIN)).thenReturn(Optional.of(u));
        seat.setId(SEAT);
        seat.setOrgId(ORG);
        seat.setStatus(OrgMemberStatus.ACTIVE);
        when(members.findMine(USER)).thenReturn(List.of(seat));
        org.setStatus(OrgStatus.ACTIVE);
        when(orgs.findByOrgId(ORG)).thenReturn(Optional.of(org));
        profile.setId(CONSULTANT);
        profile.setStatus("ACTIVE");
        when(consultants.findByOrgIdAndMemberId(ORG, SEAT)).thenReturn(Optional.of(profile));
        when(gate.has(ORG, CONSULTANT, FeatureKeys.INBOX_MONITORING)).thenReturn(true);
        when(gate.aiBudgetCents(ORG, CONSULTANT)).thenReturn(185L);
        when(gate.hasAny(ORG, CONSULTANT, Set.of(FeatureKeys.AI_RESUME_TAILORING))).thenReturn(true);
    }

    @Test
    void theOrganizationIsReadFromTheLoginOnly() {
        assertThat(EnterpriseLicenseAccess.orgOf(LOGIN)).contains(ORG);
        assertThat(EnterpriseLicenseAccess.orgOf("anika")).isEmpty();
        assertThat(EnterpriseLicenseAccess.orgOf(null)).isEmpty();
    }

    @Test
    void aLiveConsultantSeatReadsItsLicence() {
        assertThat(access.seatOf(LOGIN)).contains(new EnterpriseLicenseAccess.Seat(ORG, SEAT, CONSULTANT));
        assertThat(access.has(LOGIN, FeatureKeys.INBOX_MONITORING)).isTrue();
        assertThat(access.has(LOGIN, FeatureKeys.AI_JOB_MATCHING)).isFalse();
        assertThat(access.hasAny(LOGIN, Set.of(FeatureKeys.AI_RESUME_TAILORING))).isTrue();
        assertThat(access.aiBudgetCents(LOGIN)).isEqualTo(185L);
    }

    @Test
    void aPersonalLoginIsNeverGrantedAndNothingIsRead() {
        assertThat(access.aiBudgetCents("anika")).isZero();
        assertThat(access.has("anika", FeatureKeys.INBOX_MONITORING)).isFalse();
        verifyNoInteractions(users, members, gate);
    }

    @Test
    void aSeatThatIsNotLiveGrantsNothing() {
        seat.setStatus(OrgMemberStatus.SUSPENDED);
        assertThat(access.aiBudgetCents(LOGIN)).isZero();
        seat.setStatus(OrgMemberStatus.ACTIVE);
        org.setStatus(OrgStatus.SUSPENDED);
        assertThat(access.seatOf(LOGIN)).isEmpty();
        org.setStatus(OrgStatus.PAST_DUE); // still works until it is suspended
        assertThat(access.seatOf(LOGIN)).isPresent();
        profile.setStatus("PAUSED");
        assertThat(access.seatOf(LOGIN)).isEmpty();
    }

    @Test
    void aSeatInAnotherOrganizationDoesNotCount() {
        seat.setOrgId(8L);
        assertThat(access.seatOf(LOGIN)).isEmpty();
    }
}
