package com.dossier.api.service.ent.pipeline;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.ent.talent.ClientAccount;
import com.dossier.api.domain.ent.talent.ClientRequirement;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.repository.ent.PipelineGuardRepository;
import com.dossier.api.repository.ent.PipelineGuardRepository.Prior;
import com.dossier.api.repository.ent.talent.ClientAccountRepository;
import com.dossier.api.service.org.OrgAuditService;
import com.dossier.api.service.org.OrgException;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.privacy.SensitiveContentException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** Every rule of the duplicate-submission guard and the open cap, with a positive and a negative case each, without a database (Sprint 2 / B1, X8.4 and X8.8). */
class DuplicateGuardTest {

    static final Long ORG = 7L;
    static final Long CON = 10L;
    static final Instant NOW = Instant.parse("2026-10-16T12:00:00Z");

    PipelineGuardRepository repo = mock(PipelineGuardRepository.class);
    ClientAccountRepository clients = mock(ClientAccountRepository.class);
    PipelineGuardSettings settings = mock(PipelineGuardSettings.class);
    OrgAuditService audit = mock(OrgAuditService.class);
    DuplicateGuard guard;
    OrgMembership me = new OrgMembership(ORG, 70L, 700L, "marketer", OrgRole.MARKETER, OrgMemberStatus.ACTIVE, OrgStatus.ACTIVE);

    @BeforeEach
    void wire() {
        guard = new DuplicateGuard(repo, clients, settings, audit, Clock.fixed(NOW, ZoneOffset.UTC));
        when(settings.duplicatePolicy(ORG)).thenReturn("WARN");
        when(settings.sameClientWindowDays(ORG)).thenReturn(90);
        when(settings.maxPerRequirement(ORG)).thenReturn(0);
        when(settings.openMatchesMax(ORG)).thenReturn(0);
        client(1L, "Globex Corporation");
        client(2L, "TekVendor LLC");
        client(3L, "Prime Staffing Inc");
    }

    void client(Long id, String name) {
        ClientAccount c = new ClientAccount();
        c.setId(id);
        c.setName(name);
        when(clients.findByOrgIdAndId(ORG, id)).thenReturn(Optional.of(c));
    }

    ClientRequirement job(Long id, Long clientId, String title, String location, String urlKey) {
        ClientRequirement r = new ClientRequirement();
        r.setId(id);
        r.setOrgId(ORG);
        r.setClientId(clientId);
        r.setTitle(title);
        r.setLocation(location);
        r.setUrlKey(urlKey);
        return r;
    }

    Prior held(String source, Long reqId, Long clientId, String clientName, String title, String location, String urlKey, Duration age) {
        return new Prior(source, reqId, title, location, clientId, clientName, urlKey, null, null, NOW.minus(age));
    }

    void has(Prior... priors) {
        when(repo.liveAssignments(ORG, CON)).thenReturn(List.of(priors));
        when(repo.applications(ORG, CON)).thenReturn(List.of());
        when(repo.submissions(ORG, CON)).thenReturn(List.of());
    }

    // ---- findings ---------------------------------------------------------------------------------------------------------------

    @Test
    void nothingHeldMeansNoFinding() {
        has();
        assertThat(guard.findings(ORG, CON, job(100L, 1L, "Java Developer", "Austin, TX", "k1"))).isEmpty();
    }

    @Test
    void theSamePostingUnderAnotherRowIsFoundWhateverItsAge() {
        has(held("ASSIGNED", 55L, 2L, "TekVendor LLC", "Java Dev (copy)", "Dallas", "same-link", Duration.ofDays(400)));
        List<DuplicateGuard.Finding> f = guard.findings(ORG, CON, job(100L, 1L, "Java Developer", "Austin, TX", "same-link"));
        assertThat(f).extracting(DuplicateGuard.Finding::rule).containsExactly(DuplicateGuard.SAME_POSTING);
        assertThat(f.get(0).otherRequirementId()).isEqualTo(55L);
    }

    @Test
    void theSameBoardAndJobIdIsTheSamePosting() {
        Prior p = new Prior("APPLICATION", 55L, "Whatever", null, 2L, "TekVendor LLC", null, "greenhouse", "4021", NOW.minus(Duration.ofDays(3)));
        has(p);
        ClientRequirement j = job(100L, 1L, "Java Developer", null, null);
        j.setAtsPlatform("Greenhouse");
        j.setExternalJobId("4021");
        assertThat(guard.findings(ORG, CON, j)).extracting(DuplicateGuard.Finding::rule).containsExactly(DuplicateGuard.SAME_POSTING);
    }

    @Test
    void theSameRoleAtTheSameEmployerWithinTheWindowIsTheSameJob() {
        has(held("ASSIGNED", 55L, 1L, "Globex, Inc.", "Sr. Java Developer (Remote)", "Austin, TX", "other", Duration.ofDays(10)));
        assertThat(guard.findings(ORG, CON, job(100L, 1L, "Senior Java Developer", "Austin, Texas", "k"))).extracting(DuplicateGuard.Finding::rule).containsExactly(DuplicateGuard.SAME_JOB);
    }

    @Test
    void theSameRoleThroughAnotherVendorIsTheVendorChain() {
        has(held("APPLICATION", 55L, 2L, "TekVendor LLC", "Java Developer", "Austin, TX", "a", Duration.ofDays(30)));
        List<DuplicateGuard.Finding> f = guard.findings(ORG, CON, job(100L, 3L, "Java Developer", "Austin, TX", "b"));
        assertThat(f).extracting(DuplicateGuard.Finding::rule).containsExactly(DuplicateGuard.VENDOR_CHAIN);
        assertThat(f.get(0).message()).contains("another vendor").contains("TekVendor LLC");
    }

    @Test
    void aSubmissionRecordCountsToo() {
        has();
        when(repo.submissions(ORG, CON)).thenReturn(List.of(held("SUBMISSION", 55L, 2L, "TekVendor LLC", "Java Developer", "Austin, TX", "a", Duration.ofDays(2))));
        assertThat(guard.findings(ORG, CON, job(100L, 3L, "Java Developer", "Austin, TX", "b"))).hasSize(1);
    }

    @Test
    void anOldHoldingOutsideTheWindowIsNotADuplicateOfTheRoleRules() {
        has(held("ASSIGNED", 55L, 2L, "TekVendor LLC", "Java Developer", "Austin, TX", "a", Duration.ofDays(120)));
        assertThat(guard.findings(ORG, CON, job(100L, 3L, "Java Developer", "Austin, TX", "b"))).isEmpty();
    }

    @Test
    void theWindowComesFromTheSetting() {
        when(settings.sameClientWindowDays(ORG)).thenReturn(200);
        has(held("ASSIGNED", 55L, 2L, "TekVendor LLC", "Java Developer", "Austin, TX", "a", Duration.ofDays(120)));
        assertThat(guard.findings(ORG, CON, job(100L, 3L, "Java Developer", "Austin, TX", "b"))).hasSize(1);
    }

    @Test
    void aDifferentRoleOrAFarAwayPlaceIsNotADuplicate() {
        has(held("ASSIGNED", 55L, 2L, "TekVendor LLC", "Java Developer", "Austin, TX", "a", Duration.ofDays(5)));
        assertThat(guard.findings(ORG, CON, job(100L, 3L, "Data Engineer", "Austin, TX", "b"))).isEmpty();
        assertThat(guard.findings(ORG, CON, job(100L, 3L, "Java Developer", "Seattle, WA", "b"))).isEmpty();
    }

    @Test
    void theVeryJobItselfIsNeverAFinding() {
        has(held("ASSIGNED", 100L, 1L, "Globex Corporation", "Java Developer", "Austin, TX", "k1", Duration.ofDays(1)));
        assertThat(guard.findings(ORG, CON, job(100L, 1L, "Java Developer", "Austin, TX", "k1"))).isEmpty();
    }

    @Test
    void otherConsultantsHoldingThePostingAreCountedOnlyWhenTheLimitIsOn() {
        has();
        when(repo.countOtherConsultantsHolding(eq(ORG), anyCollection(), eq(CON))).thenReturn(3L);
        assertThat(guard.findings(ORG, CON, job(100L, 1L, "Java Developer", "Austin, TX", "k1"))).isEmpty(); // off by default
        when(settings.maxPerRequirement(ORG)).thenReturn(3);
        List<DuplicateGuard.Finding> f = guard.findings(ORG, CON, job(100L, 1L, "Java Developer", "Austin, TX", "k1"));
        assertThat(f).extracting(DuplicateGuard.Finding::rule).containsExactly(DuplicateGuard.TOO_MANY_CONSULTANTS);
        assertThat(f.get(0).otherConsultants()).isEqualTo(3L);
        when(repo.countOtherConsultantsHolding(eq(ORG), anyCollection(), eq(CON))).thenReturn(2L);
        assertThat(guard.findings(ORG, CON, job(100L, 1L, "Java Developer", "Austin, TX", "k1"))).isEmpty();
    }

    // ---- policy -----------------------------------------------------------------------------------------------------------------

    void aDuplicate() {
        has(held("APPLICATION", 55L, 2L, "TekVendor LLC", "Java Developer", "Austin, TX", "a", Duration.ofDays(30)));
    }

    ClientRequirement theNewJob() {
        return job(100L, 3L, "Java Developer", "Austin, TX", "b");
    }

    @Test
    void noFindingMeansNoQuestion() {
        has();
        assertThat(guard.enforce(me, CON, theNewJob(), DuplicateGuard.Confirm.NONE)).isEmpty();
        verify(audit, never()).record(any(OrgMembership.class), anyString(), anyString(), any(), any(), any());
    }

    @Test
    void warnAsksFirstWithTheFindingsInTheAnswer() {
        aDuplicate();
        assertThatThrownBy(() -> guard.enforce(me, CON, theNewJob(), DuplicateGuard.Confirm.NONE)).isInstanceOfSatisfying(OrgException.class, e -> {
            assertThat(e.getStatus()).isEqualTo(409);
            assertThat(e.getCode()).isEqualTo("DUPLICATE_WARNING");
            assertThat(e.getMessage()).contains("another vendor");
            assertThat(e.getExtra()).containsKey("findings");
        });
        verify(audit, never()).record(any(OrgMembership.class), anyString(), anyString(), any(), any(), any());
    }

    @Test
    void warnWithAConfirmationNeedsAReasonThenGoesAheadAndIsAudited() {
        aDuplicate();
        assertThatThrownBy(() -> guard.enforce(me, CON, theNewJob(), new DuplicateGuard.Confirm(true, "  "))).isInstanceOfSatisfying(OrgException.class, e -> assertThat(e.getStatus()).isEqualTo(400));
        assertThatThrownBy(() -> guard.enforce(me, CON, theNewJob(), new DuplicateGuard.Confirm(true, "x".repeat(201)))).isInstanceOf(OrgException.class);
        assertThat(guard.enforce(me, CON, theNewJob(), new DuplicateGuard.Confirm(true, "Client asked for two vendors"))).hasSize(1);
        verify(audit).record(eq(me), eq("PIPELINE_DUPLICATE_OVERRIDE"), eq("CONSULTANT"), any(), eq("10"), org.mockito.ArgumentMatchers.contains("Client asked for two vendors"));
    }

    @Test
    void theReasonIsScannedForSensitiveData() {
        aDuplicate();
        assertThatThrownBy(() -> guard.enforce(me, CON, theNewJob(), new DuplicateGuard.Confirm(true, "ssn 123-45-6789"))).isInstanceOf(SensitiveContentException.class);
        verify(audit, never()).record(any(OrgMembership.class), anyString(), anyString(), any(), any(), any());
    }

    @Test
    void blockRefusesEvenWithAConfirmation() {
        aDuplicate();
        when(settings.duplicatePolicy(ORG)).thenReturn("BLOCK");
        assertThatThrownBy(() -> guard.enforce(me, CON, theNewJob(), new DuplicateGuard.Confirm(true, "I really mean it"))).isInstanceOfSatisfying(OrgException.class, e -> {
            assertThat(e.getStatus()).isEqualTo(409);
            assertThat(e.getCode()).isEqualTo("DUPLICATE_BLOCKED");
        });
        verify(audit, never()).record(any(OrgMembership.class), anyString(), anyString(), any(), any(), any());
    }

    // ---- the cap ----------------------------------------------------------------------------------------------------------------

    @Test
    void theOpenCapIsOffByDefaultAndNeverReadsTheDatabaseThen() {
        guard.assertOpenCap(ORG, CON);
        verify(repo, never()).countOpenMatches(anyLong(), anyLong());
    }

    @Test
    void theCapRefusesAtTheLimitWithTheFiguresAndAllowsBelowIt() {
        when(settings.openMatchesMax(ORG)).thenReturn(5);
        when(repo.countOpenMatches(ORG, CON)).thenReturn(4L);
        guard.assertOpenCap(ORG, CON);
        when(repo.countOpenMatches(ORG, CON)).thenReturn(5L);
        assertThatThrownBy(() -> guard.assertOpenCap(ORG, CON)).isInstanceOfSatisfying(OrgException.class, e -> {
            assertThat(e.getStatus()).isEqualTo(409);
            assertThat(e.getCode()).isEqualTo("ASSIGNMENT_CAP");
            assertThat(e.getExtra()).containsEntry("open", 5L).containsEntry("cap", 5);
        });
    }
}
