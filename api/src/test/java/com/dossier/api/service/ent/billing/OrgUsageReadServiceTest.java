package com.dossier.api.service.ent.billing;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.User;
import com.dossier.api.domain.ent.billing.UsageCounter;
import com.dossier.api.domain.ent.consultantws.CwsMatchView;
import com.dossier.api.domain.ent.consultantws.CwsPrepSession;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.ent.talent.TalentApplication;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.catalog.FeatureDefinitionRepository;
import com.dossier.api.repository.ent.billing.UsageCounterRepository;
import com.dossier.api.repository.ent.consultantws.CwsMatchViewRepository;
import com.dossier.api.repository.ent.consultantws.CwsPrepSessionRepository;
import com.dossier.api.repository.ent.talent.ConsultantProfileRepository;
import com.dossier.api.repository.ent.talent.TalentApplicationRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.service.AiBudgetService;
import com.dossier.api.service.ent.licenses.OrgLicenseGate;
import com.dossier.api.service.ent.licenses.OrgLicenseService;
import com.dossier.api.service.ent.licenses.OrgLicenseService.Row;
import com.dossier.api.service.ent.licenses.OrgLicenseService.Status;
import com.dossier.api.service.org.OrgMembership;
import java.time.Clock;
import java.time.Instant;
import java.time.YearMonth;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** ORG-BILLING-BUILD.md step 1a: Feature Usage counts what consultants really did, shows AI as a percent, and only for this month. */
class OrgUsageReadServiceTest {

    static final Long ORG = 7L;
    static final Instant NOW = Instant.parse("2026-11-11T10:00:00Z");

    OrgBillingReadService billing = mock(OrgBillingReadService.class);
    OrgLicenseService licenseRows = mock(OrgLicenseService.class);
    OrgLicenseGate gate = mock(OrgLicenseGate.class);
    ConsultantProfileRepository consultants = mock(ConsultantProfileRepository.class);
    OrgMemberRepository members = mock(OrgMemberRepository.class);
    UserRepository users = mock(UserRepository.class);
    CwsMatchViewRepository views = mock(CwsMatchViewRepository.class);
    CwsPrepSessionRepository prep = mock(CwsPrepSessionRepository.class);
    TalentApplicationRepository apps = mock(TalentApplicationRepository.class);
    UsageCounterRepository counters = mock(UsageCounterRepository.class);
    FeatureDefinitionRepository definitions = mock(FeatureDefinitionRepository.class);
    AiBudgetService ai = mock(AiBudgetService.class);
    OrgUsageReadService service = new OrgUsageReadService(billing, licenseRows, gate, consultants, members, users, views, prep, apps, counters, definitions, ai);
    OrgMembership me = new OrgMembership(ORG, 5L, 2L, "felix", OrgRole.ADMIN, OrgMemberStatus.ACTIVE, OrgStatus.ACTIVE);

    @BeforeEach
    void world() {
        service.setClock(Clock.fixed(NOW, ZoneOffset.UTC));
        when(licenseRows.rowsFor(ORG)).thenReturn(List.of(
            new Row(1L, "Ana", "ana@x.test", true, Status.ACTIVE, List.of("ai.resume_tailoring"), null, false, NOW, null, null, List.of()),
            new Row(2L, "Ben", "ben@x.test", true, Status.NONE, List.of(), null, false, null, null, null, List.of())
        ));
        when(views.findByOrgIdAndConsultantId(ORG, 1L)).thenReturn(List.of(view("2026-11-02T09:00:00Z"), view("2026-11-10T09:00:00Z"), view("2026-10-20T09:00:00Z")));
        when(prep.findByOrgIdAndConsultantIdOrderByOccurredAtDesc(ORG, 1L)).thenReturn(List.of(session("2026-10-05T09:00:00Z")));
        when(apps.findByOrgIdAndConsultantId(ORG, 1L)).thenReturn(List.of(app("2026-11-03T09:00:00Z")));
        when(counters.findByOrgIdAndConsultantIdAndPeriodKey(eq(ORG), eq(1L), anyString())).thenReturn(List.of());
        when(definitions.findByFeatureKey(anyString())).thenReturn(Optional.empty());
        when(gate.aiBudgetCents(ORG, 1L)).thenReturn(300L);
        ConsultantProfile cp = new ConsultantProfile();
        cp.setMemberId(55L);
        when(consultants.findByOrgIdAndId(ORG, 1L)).thenReturn(Optional.of(cp));
        OrgMember seat = new OrgMember();
        seat.setUserId(77L);
        when(members.findByOrgIdAndId(ORG, 55L)).thenReturn(Optional.of(seat));
        User u = new User();
        u.setLogin("ent#7#ana");
        when(users.findById(77L)).thenReturn(Optional.of(u));
        when(ai.usage("ent#7#ana")).thenReturn(new AiBudgetService.Usage("budget", 42, 100, NOW, false));
    }

    @Test
    void thisMonthCountsEachLicensedConsultantsRealActivityAndTheirAiBudgetInPercent() {
        OrgUsageReadService.Usage u = service.usage(me, null);
        assertThat(u.period()).isEqualTo("2026-11");
        assertThat(u.current()).isTrue();
        assertThat(u.consultants()).hasSize(1); // Ben has no licence
        OrgUsageReadService.ConsultantUsage ana = u.consultants().get(0);
        assertThat(ana.matchViews()).isEqualTo(2);
        assertThat(ana.prepSessions()).isZero();
        assertThat(ana.applications()).isEqualTo(1);
        assertThat(ana.aiBudgetPercent()).isEqualTo(42);
        assertThat(u.features()).extracting(OrgUsageReadService.FeatureTotal::key, OrgUsageReadService.FeatureTotal::used).startsWith(
            org.assertj.core.groups.Tuple.tuple(OrgUsageReadService.MATCH_VIEWS, 2L),
            org.assertj.core.groups.Tuple.tuple(OrgUsageReadService.PREP_SESSIONS, 0L),
            org.assertj.core.groups.Tuple.tuple(OrgUsageReadService.APPLICATIONS, 1L)
        );
    }

    @Test
    void anEarlierMonthHasItsOwnCountsAndNoAiPercent() {
        OrgUsageReadService.Usage u = service.usage(me, "2026-10");
        assertThat(u.current()).isFalse();
        assertThat(u.consultants().get(0).matchViews()).isEqualTo(1);
        assertThat(u.consultants().get(0).prepSessions()).isEqualTo(1);
        assertThat(u.consultants().get(0).aiBudgetPercent()).isNull();
        verify(ai, never()).usage(anyString());
    }

    @Test
    void aLicenceWithoutAiShowsNoPercent() {
        when(gate.aiBudgetCents(ORG, 1L)).thenReturn(0L);
        assertThat(service.usage(me, null).consultants().get(0).aiBudgetPercent()).isNull();
    }

    @Test
    void demoCountersAreListedWithTheirAllowance() {
        UsageCounter c = new UsageCounter();
        c.setFeatureKey("ai.resume_tailoring");
        c.setUsed(12L);
        c.setAllowance(40L);
        when(counters.findByOrgIdAndConsultantIdAndPeriodKey(ORG, 1L, "2026-11")).thenReturn(List.of(c));
        OrgUsageReadService.Usage u = service.usage(me, "2026-11");
        assertThat(u.consultants().get(0).counters()).extracting(OrgUsageReadService.Counter::used, OrgUsageReadService.Counter::allowance).containsExactly(org.assertj.core.groups.Tuple.tuple(12L, 40L));
        assertThat(u.features()).anySatisfy(f -> {
            assertThat(f.key()).isEqualTo("ai.resume_tailoring");
            assertThat(f.allowance()).isEqualTo(40L);
        });
    }

    @Test
    void periodsOutsideTheLastTwelveMonthsOrMalformedMeanThisMonth() {
        YearMonth now = YearMonth.of(2026, 11);
        assertThat(OrgUsageReadService.month("2027-01", now)).isEqualTo(now);
        assertThat(OrgUsageReadService.month("2025-11", now)).isEqualTo(now);
        assertThat(OrgUsageReadService.month("2025-12", now)).isEqualTo(YearMonth.of(2025, 12));
        assertThat(OrgUsageReadService.month("nope", now)).isEqualTo(now);
    }

    @Test
    void historyBucketsEachMonthOldestFirst() {
        when(counters.trend(eq(ORG), anyString(), anyString())).thenReturn(List.<Object[]>of(new Object[] { "2026-10", 5L }));
        OrgUsageReadService.History h = service.history(me, 2);
        assertThat(h.months()).extracting(OrgUsageReadService.Month::period).containsExactly("2026-10", "2026-11");
        assertThat(h.months().get(0)).isEqualTo(new OrgUsageReadService.Month("2026-10", 1, 1, 0, 5L));
        assertThat(h.months().get(1)).isEqualTo(new OrgUsageReadService.Month("2026-11", 2, 0, 1, 0L));
        verify(gate, never()).aiBudgetCents(anyLong(), anyLong());
    }

    private static CwsMatchView view(String at) {
        CwsMatchView v = new CwsMatchView();
        v.setViewedAt(Instant.parse(at));
        return v;
    }

    private static CwsPrepSession session(String at) {
        CwsPrepSession s = new CwsPrepSession();
        s.setOccurredAt(Instant.parse(at));
        return s;
    }

    private static TalentApplication app(String at) {
        TalentApplication a = new TalentApplication();
        a.setCreatedAt(Instant.parse(at));
        return a;
    }
}
