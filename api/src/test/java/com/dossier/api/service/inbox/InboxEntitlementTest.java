package com.dossier.api.service.inbox;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.ent.billing.ConsultantLicense;
import com.dossier.api.domain.ent.billing.LicenseFeature;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.ent.billing.ConsultantLicenseRepository;
import com.dossier.api.repository.ent.billing.LicenseFeatureRepository;
import com.dossier.api.repository.ent.talent.ConsultantProfileRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.EntitlementService;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * Who may have an inbox (ent-inbox): the personal plan OR a live organization license that grants {@code inbox.monitoring}. The organization ground
 * is closed by every way a seat, an organization or a license can stop being live, and never opens on another feature.
 */
class InboxEntitlementTest {

    static final Long USER = 7L;
    static final Long ORG = 1L;
    static final Long SEAT = 11L;
    static final Long CONSULTANT = 21L;
    static final Long LICENSE = 31L;

    EntitlementService personal = mock(EntitlementService.class);
    OrgMemberRepository members = mock(OrgMemberRepository.class);
    OrganizationRepository orgs = mock(OrganizationRepository.class);
    ConsultantProfileRepository consultants = mock(ConsultantProfileRepository.class);
    ConsultantLicenseRepository licenses = mock(ConsultantLicenseRepository.class);
    LicenseFeatureRepository features = mock(LicenseFeatureRepository.class);
    InboxEntitlement entitlement = new InboxEntitlement(personal, members, orgs, consultants, licenses, features);

    OrgMember seat = seat(OrgMemberStatus.ACTIVE);
    Organization org = new Organization();
    ConsultantProfile profile = new ConsultantProfile();
    ConsultantLicense license = license("ACTIVE");
    LicenseFeature feature = feature(InboxEntitlement.FEATURE);

    static OrgMember seat(OrgMemberStatus status) {
        OrgMember m = new OrgMember();
        m.setId(SEAT);
        m.setOrgId(ORG);
        m.setStatus(status);
        return m;
    }

    static ConsultantLicense license(String status) {
        ConsultantLicense l = new ConsultantLicense();
        l.setId(LICENSE);
        l.setOrgId(ORG);
        l.setConsultantId(CONSULTANT);
        l.setStatus(status);
        l.setStartsAt(Instant.now().minus(Duration.ofDays(30)));
        return l;
    }

    static LicenseFeature feature(String key) {
        LicenseFeature f = new LicenseFeature();
        f.setOrgId(ORG);
        f.setLicenseId(LICENSE);
        f.setFeatureKey(key);
        f.setLive(true);
        f.setStartsAt(Instant.now().minus(Duration.ofDays(30)));
        return f;
    }

    @BeforeEach
    void setUp() {
        org.setStatus(OrgStatus.ACTIVE);
        profile.setId(CONSULTANT);
        profile.setStatus("ACTIVE");
        when(members.findMine(USER)).thenAnswer(inv -> List.of(seat));
        when(orgs.findByOrgId(ORG)).thenAnswer(inv -> Optional.of(org));
        when(consultants.findByOrgIdAndMemberId(ORG, SEAT)).thenAnswer(inv -> Optional.of(profile));
        when(licenses.findByOrgIdAndConsultantIdOrderByStartsAtDesc(ORG, CONSULTANT)).thenAnswer(inv -> List.of(license));
        when(features.findByOrgIdAndLicenseIdOrderByIdAsc(ORG, LICENSE)).thenAnswer(inv -> List.of(feature));
    }

    @Test
    void aLiveLicenseThatGrantsTheFeatureOpensTheOrganizationGround() {
        var d = entitlement.decide(USER, "anika");
        assertThat(d.ground()).isEqualTo(InboxEntitlement.Ground.ORGANIZATION);
        assertThat(d.orgId()).isEqualTo(ORG);
        assertThat(entitlement.orgGrants(ORG, USER)).isTrue();
    }

    @Test
    void thePersonalPlanStillWinsAndIsUnchanged() {
        when(personal.isPro("anika")).thenReturn(true);
        assertThat(entitlement.decide(USER, "anika").ground()).isEqualTo(InboxEntitlement.Ground.PERSONAL);
        feature.setLive(false);
        assertThat(entitlement.decide(USER, "anika").ground()).as("pro alone is enough").isEqualTo(InboxEntitlement.Ground.PERSONAL);
    }

    @Test
    void nothingGrantsItWhenNeitherGroundHolds() {
        feature.setFeatureKey("ai_assistant");
        assertThat(entitlement.decide(USER, "anika").allowed()).as("another add-on is not this one").isFalse();
        assertThat(entitlement.orgGrants(ORG, USER)).isFalse();
    }

    @Test
    void theAddOnSwitchedOffOrEndedStopsIt() {
        feature.setLive(false);
        assertThat(entitlement.orgGrants(ORG, USER)).as("add-on removed").isFalse();
        feature.setLive(true);
        feature.setEndsAt(Instant.now().minus(Duration.ofMinutes(1)));
        assertThat(entitlement.orgGrants(ORG, USER)).as("add-on ended").isFalse();
        feature.setEndsAt(null);
        feature.setStartsAt(Instant.now().plus(Duration.ofDays(1)));
        assertThat(entitlement.orgGrants(ORG, USER)).as("add-on not started").isFalse();
    }

    @Test
    void aLicenseThatIsNotLiveGrantsNothing() {
        for (String status : List.of("SUSPENDED", "ENDED", "PENDING")) {
            license.setStatus(status);
            assertThat(entitlement.orgGrants(ORG, USER)).as(status).isFalse();
        }
        license.setStatus("CANCEL_AT_PERIOD_END");
        assertThat(entitlement.orgGrants(ORG, USER)).as("a license that is ending keeps its features until it ends").isTrue();
    }

    @Test
    void aSeatThatIsNotActiveGrantsNothing() {
        for (OrgMemberStatus s : List.of(OrgMemberStatus.SUSPENDED, OrgMemberStatus.LEFT, OrgMemberStatus.REMOVED, OrgMemberStatus.ERASED, OrgMemberStatus.INVITED)) {
            seat.setStatus(s);
            assertThat(entitlement.orgGrants(ORG, USER)).as(s.name()).isFalse();
            assertThat(entitlement.decide(USER, "anika").allowed()).as(s.name()).isFalse();
        }
    }

    @Test
    void anOrganizationThatIsNotActiveGrantsNothing() {
        for (OrgStatus s : List.of(OrgStatus.SUSPENDED, OrgStatus.CLOSED, OrgStatus.DRAFT)) {
            org.setStatus(s);
            assertThat(entitlement.orgGrants(ORG, USER)).as(s.name()).isFalse();
        }
        org.setStatus(OrgStatus.PAST_DUE);
        assertThat(entitlement.orgGrants(ORG, USER)).as("past due keeps working through its grace").isTrue();
    }

    @Test
    void aMemberWhoIsNotAnActiveConsultantGrantsNothing() {
        profile.setStatus("UNAVAILABLE");
        assertThat(entitlement.orgGrants(ORG, USER)).isFalse();
        when(consultants.findByOrgIdAndMemberId(ORG, SEAT)).thenReturn(Optional.empty());
        assertThat(entitlement.orgGrants(ORG, USER)).isFalse();
    }

    @Test
    void theOrganizationIsAlwaysTheOneAskedAboutNeverAnotherSeat() {
        assertThat(entitlement.orgGrants(2L, USER)).as("a license in org 1 says nothing about org 2").isFalse();
        assertThat(entitlement.orgGrants(null, USER)).isFalse();
        assertThat(entitlement.orgGrants(ORG, null)).isFalse();
        assertThat(entitlement.decide(null, null).allowed()).isFalse();
    }
}
