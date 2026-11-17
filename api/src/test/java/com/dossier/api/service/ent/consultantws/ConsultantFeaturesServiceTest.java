package com.dossier.api.service.ent.consultantws;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.repository.AiCallRepository;
import com.dossier.api.repository.ent.consultantws.CwsMatchViewRepository;
import com.dossier.api.repository.ent.consultantws.CwsPrepSessionRepository;
import com.dossier.api.repository.ent.talent.TalentApplicationRepository;
import com.dossier.api.service.AiBudgetService;
import com.dossier.api.service.ent.authz.AuthorizationService;
import com.dossier.api.service.ent.licenses.OrgLicenseGate;
import com.dossier.api.service.entitlement.FeatureKeys;
import com.dossier.api.service.org.OrgMembership;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** Gap D7: My Features shows real AI counts and the organization-paid AI budget, never a made-up allowance. */
class ConsultantFeaturesServiceTest {

    static final Long ORG = 2L;
    static final Instant NOW = Instant.parse("2026-11-17T10:00:00Z");
    static final Instant NOV = Instant.parse("2026-11-01T00:00:00Z");
    static final Instant OCT = Instant.parse("2026-10-01T00:00:00Z");
    static final String ANA = "ent#2#ana@acme.test";

    ConsultantHomeService gate = mock(ConsultantHomeService.class);
    AuthorizationService authorization = mock(AuthorizationService.class);
    CwsMatchViewRepository views = mock(CwsMatchViewRepository.class);
    CwsPrepSessionRepository prep = mock(CwsPrepSessionRepository.class);
    TalentApplicationRepository apps = mock(TalentApplicationRepository.class);
    OrgLicenseGate licenses = mock(OrgLicenseGate.class);
    AiCallRepository calls = mock(AiCallRepository.class);
    AiBudgetService budget = mock(AiBudgetService.class);
    ConsultantFeaturesService service = new ConsultantFeaturesService(gate, authorization, views, prep, apps, Clock.fixed(NOW, ZoneOffset.UTC));

    static OrgMembership me(String login) {
        return new OrgMembership(ORG, 9L, 70L, login, OrgRole.MEMBER, OrgMemberStatus.ACTIVE, OrgStatus.ACTIVE);
    }

    @BeforeEach
    void world() {
        service.setLicenses(licenses);
        service.setAiCalls(calls);
        service.setAiBudget(budget);
        ConsultantProfile c = new ConsultantProfile();
        c.setId(5L);
        c.setOrgId(ORG);
        c.setDisplayName("Ana Silva");
        when(gate.requireSelf(any())).thenReturn(c);
        when(views.findByOrgIdAndConsultantId(ORG, 5L)).thenReturn(List.of());
        when(prep.findByOrgIdAndConsultantIdOrderByOccurredAtDesc(ORG, 5L)).thenReturn(List.of());
        when(apps.findByOrgIdAndConsultantId(ORG, 5L)).thenReturn(List.of());
        when(licenses.liveFeatures(eq(ORG), eq(5L), any())).thenReturn(Map.of(FeatureKeys.AI_RESUME_TAILORING, 1, FeatureKeys.RESUME_OPTIMIZATION, 1));
        // tailoring: 7 since October 1, 4 of them in November; optimization (fit, rewrite, ...): 2 in November, none before
        when(calls.countByLoginAndTaskInAndCreatedAtGreaterThanEqual(ANA, ConsultantFeaturesService.TAILOR_TASKS, OCT)).thenReturn(7L);
        when(calls.countByLoginAndTaskInAndCreatedAtGreaterThanEqual(ANA, ConsultantFeaturesService.TAILOR_TASKS, NOV)).thenReturn(4L);
        when(calls.countByLoginAndTaskInAndCreatedAtGreaterThanEqual(ANA, ConsultantFeaturesService.OPTIMIZE_TASKS, OCT)).thenReturn(2L);
        when(calls.countByLoginAndTaskInAndCreatedAtGreaterThanEqual(ANA, ConsultantFeaturesService.OPTIMIZE_TASKS, NOV)).thenReturn(2L);
        when(budget.usage(ANA)).thenReturn(new AiBudgetService.Usage("budget", 40, 100, Instant.parse("2026-12-01T00:00:00Z"), false));
    }

    private ConsultantFeaturesDTO.Feature feature(ConsultantFeaturesDTO.Response r, String key) {
        return r.features().stream().filter(f -> f.key().equals(key)).findFirst().orElseThrow();
    }

    @Test
    void theAiFeaturesCountRealCallsAndNothingHasAMadeUpAllowance() {
        ConsultantFeaturesDTO.Response r = service.page(me(ANA));
        assertThat(r.features()).allSatisfy(f -> assertThat(f.allowance()).as(f.key()).isNull());
        assertThat(feature(r, "resume-tailoring").used()).isEqualTo(4);
        assertThat(feature(r, "resume-tailoring").usedLastMonth()).isEqualTo(3);
        assertThat(feature(r, "resume-optimization").used()).isEqualTo(2);
        assertThat(feature(r, "resume-optimization").usedLastMonth()).isZero();
        assertThat(feature(r, "resume-tailoring").status()).isEqualTo("ENABLED");
        assertThat(feature(r, "job-matching").status()).isEqualTo("NOT_AVAILABLE");
        assertThat(r.features()).noneMatch(ConsultantFeaturesDTO.Feature::sample);
        assertThat(r.entitlementsSample()).isFalse();
        assertThat(r.tiles().creditsLeft()).isNull();
    }

    @Test
    void anEnterpriseAccountSeesItsOrganizationPaidAiBudget() {
        ConsultantFeaturesDTO.AiBudget ai = service.page(me(ANA)).ai();
        assertThat(ai).isNotNull();
        assertThat(ai.percentUsed()).isEqualTo(40);
        assertThat(ai.resetsAt()).isEqualTo(Instant.parse("2026-12-01T00:00:00Z"));
    }

    @Test
    void aPersonalLoginOrAnAccountWithNoBudgetSeesNoBudget() {
        assertThat(service.page(me("ana")).ai()).as("a personal login's AI is not the organization's").isNull();
        verify(budget, never()).usage("ana");
        when(budget.usage(ANA)).thenReturn(new AiBudgetService.Usage("count", 3, 50, NOW, false));
        assertThat(service.page(me(ANA)).ai()).as("no AI on the licence").isNull();
    }

    @Test
    void withoutTheLedgerTheAiCountsAreUnknownNotZero() {
        ConsultantFeaturesService bare = new ConsultantFeaturesService(gate, authorization, views, prep, apps, Clock.fixed(NOW, ZoneOffset.UTC));
        bare.setLicenses(licenses);
        ConsultantFeaturesDTO.Response r = bare.page(me(ANA));
        assertThat(feature(r, "resume-tailoring").used()).isNull();
        assertThat(r.ai()).isNull();
        verify(calls, never()).countByLoginAndTaskInAndCreatedAtGreaterThanEqual(anyString(), any(), any());
    }
}
