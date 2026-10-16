package com.dossier.api.service.ent.mkt.matches;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.ent.talent.ClientAccount;
import com.dossier.api.domain.ent.talent.ClientRequirement;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.ent.talent.ConsultantSkill;
import com.dossier.api.domain.ent.talent.OrgResume;
import com.dossier.api.domain.ent.talent.RequirementMatch;
import com.dossier.api.domain.ent.talent.RequirementSkill;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.repository.ent.mkt.MktMatchApplicationRepository;
import com.dossier.api.repository.ent.mkt.MktMatchClientRepository;
import com.dossier.api.repository.ent.mkt.MktMatchConsultantRepository;
import com.dossier.api.repository.ent.mkt.MktMatchRepository;
import com.dossier.api.repository.ent.mkt.MktMatchRequirementRepository;
import com.dossier.api.repository.ent.mkt.MktMatchResumeRepository;
import com.dossier.api.repository.ent.talent.ConsultantSkillRepository;
import com.dossier.api.repository.ent.talent.RequirementSkillRepository;
import com.dossier.api.service.ent.jobs.AssignmentWorld;
import com.dossier.api.service.ent.mkt.MktScope;
import com.dossier.api.service.ent.mkt.MktScope.View;
import com.dossier.api.service.ent.mkt.matches.MktMatchesDto.Response;
import com.dossier.api.service.ent.mkt.matches.MktMatchesDto.Row;
import com.dossier.api.service.org.OrgAuditService;
import com.dossier.api.service.org.OrgException;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** Scope filtering, KPI math, every filter, the page, Assign/Dismiss (records only) and the empty org of {@link MktMatchesService}. */
class MktMatchesServiceTest {

    private static final Instant NOW = Instant.parse("2026-10-13T10:00:00Z");
    private static final LocalDate TODAY = LocalDate.of(2026, 10, 13);

    private final MktMatchRepository matches = mock(MktMatchRepository.class);
    private final MktMatchConsultantRepository consultants = mock(MktMatchConsultantRepository.class);
    private final MktMatchRequirementRepository requirements = mock(MktMatchRequirementRepository.class);
    private final MktMatchClientRepository clients = mock(MktMatchClientRepository.class);
    private final MktMatchResumeRepository resumes = mock(MktMatchResumeRepository.class);
    private final MktMatchApplicationRepository applications = mock(MktMatchApplicationRepository.class);
    private final ConsultantSkillRepository consultantSkills = mock(ConsultantSkillRepository.class);
    private final RequirementSkillRepository requirementSkills = mock(RequirementSkillRepository.class);
    private final OrgAuditService audit = mock(OrgAuditService.class);
    private final AssignmentWorld world = new AssignmentWorld(1L, Clock.fixed(NOW, ZoneOffset.UTC));

    private Set<Long> pageIds = Set.of(10L, 11L);
    private Set<Long> assignIds = Set.of(10L, 11L);
    private boolean assignDenied = false;

    private final MktScope scope = new MktScope(null, null, null, null) {
        @Override
        public View resolve(OrgMembership me, String permissionKey) {
            if (MktMatchesService.ASSIGN_KEY.equals(permissionKey)) {
                if (assignDenied) throw new OrgNotFoundException();
                return new View(1L, 7L, false, assignIds);
            }
            return new View(1L, 7L, false, pageIds);
        }
    };

    private final OrgMembership me = new OrgMembership(1L, 7L, 70L, "sarah", OrgRole.MEMBER, OrgMemberStatus.ACTIVE, OrgStatus.ACTIVE);
    private MktMatchesService service;
    private final List<RequirementMatch> live = new ArrayList<>();

    private static RequirementMatch match(long id, long consultant, long req, int score, String status, int daysOld) {
        RequirementMatch m = new RequirementMatch();
        m.setId(id);
        m.setOrgId(1L);
        m.setConsultantId(consultant);
        m.setRequirementId(req);
        m.setScore(score);
        m.setStatus(status);
        m.setCreatedAt(NOW.minus(daysOld, ChronoUnit.DAYS));
        m.setReason("rule");
        return m;
    }

    private static ConsultantProfile consultant(long id, String name, String title, String availability, LocalDate from, int years, String location) {
        ConsultantProfile c = new ConsultantProfile();
        c.setId(id);
        c.setOrgId(1L);
        c.setDisplayName(name);
        c.setJobTitle(title);
        c.setAvailabilityStatus(availability);
        c.setAvailableFrom(from);
        c.setYearsExperience(years);
        c.setLocationLabel(location);
        c.setWorkMode("HYBRID");
        return c;
    }

    private static ClientRequirement requirement(long id, long client, String title, String location, String level, String status) {
        ClientRequirement r = new ClientRequirement();
        r.setId(id);
        r.setOrgId(1L);
        r.setClientId(client);
        r.setTitle(title);
        r.setLocation(location);
        r.setWorkMode("HYBRID");
        r.setExperienceLevel(level);
        r.setStatus(status);
        return r;
    }

    private static ClientAccount client(long id, String name) {
        ClientAccount c = new ClientAccount();
        c.setId(id);
        c.setName(name);
        return c;
    }

    private static ConsultantSkill cskill(long consultant, String skill, boolean primary, int order) {
        ConsultantSkill s = new ConsultantSkill();
        s.setConsultantId(consultant);
        s.setSkill(skill);
        s.setPrimarySkill(primary);
        s.setSortOrder(order);
        return s;
    }

    private static RequirementSkill rskill(long req, String skill, int order) {
        RequirementSkill s = new RequirementSkill();
        s.setRequirementId(req);
        s.setSkill(skill);
        s.setSortOrder(order);
        return s;
    }

    @BeforeEach
    void world() {
        for (long consultantId : new long[] { 10, 11, 12 }) {
            world.consultant(consultantId, "ACTIVE", "ACTIVE");
            world.approve(consultantId);
        }
        world.job(100, "OPEN", "MANUAL");
        world.job(101, "CLOSED", "MANUAL");
        service = new MktMatchesService(scope, world.service(audit), matches, consultants, requirements, clients, resumes, applications, consultantSkills, requirementSkills, audit, Clock.fixed(NOW, ZoneOffset.UTC));
        // 10 Alex: available, Java; 11 Priya: on notice for 3 weeks, Business Analysis; 12 Zed: NOT assigned to the caller
        live.add(match(1, 10, 100, 96, "SUGGESTED", 2));
        live.add(match(2, 11, 101, 78, "SUGGESTED", 10));
        live.add(match(3, 10, 101, 60, "ASSIGNED", 40));
        live.add(match(4, 12, 100, 99, "SUGGESTED", 3));
        when(matches.findLive(eq(1L), anyCollection())).thenReturn(live);
        for (RequirementMatch m : live) {
            when(matches.findByOrgIdAndId(1L, m.getId())).thenReturn(Optional.of(m));
            world.addMatch(m); // the assignment service works on the same rows
        }
        when(consultants.findByOrgIdAndIdIn(eq(1L), anyCollection())).thenAnswer(i -> {
            Set<Long> want = Set.copyOf(i.<java.util.Collection<Long>>getArgument(1));
            return List.of(
                consultant(10, "Alex Morgan", "Java Developer", "AVAILABLE", null, 8, "New York, NY"),
                consultant(11, "Priya Sharma", "Business Analyst", "NOTICE", TODAY.plusDays(21), 4, "Chicago, IL"),
                consultant(12, "Zed Outsider", "Go Developer", "AVAILABLE", null, 5, "Austin, TX")
            ).stream().filter(c -> want.contains(c.getId())).toList();
        });
        when(requirements.findByOrgIdAndIdIn(eq(1L), anyCollection())).thenReturn(List.of(
            requirement(100, 500, "Senior Java Developer", "New York, NY", "SENIOR", "OPEN"),
            requirement(101, 501, "Business Analyst", "Boston, MA", "MID", "OPEN")
        ));
        when(requirements.findByOrgIdAndId(1L, 100L)).thenReturn(Optional.of(requirement(100, 500, "Senior Java Developer", "New York, NY", "SENIOR", "OPEN")));
        when(requirements.findByOrgIdAndId(1L, 101L)).thenReturn(Optional.of(requirement(101, 501, "Business Analyst", "Boston, MA", "MID", "CLOSED")));
        when(clients.findByOrgIdAndIdIn(eq(1L), anyCollection())).thenReturn(List.of(client(500, "TechCorp"), client(501, "Global Bank")));
        when(consultantSkills.findByOrgIdAndConsultantIdIn(eq(1L), anyCollection())).thenReturn(List.of(
            cskill(10, "Java", true, 0), cskill(10, "AWS", false, 1), cskill(11, "Business Analysis", true, 0), cskill(12, "Go", true, 0)
        ));
        when(requirementSkills.findByOrgIdAndRequirementIdIn(eq(1L), anyCollection())).thenReturn(List.of(
            rskill(100, "Java", 0), rskill(100, "AWS", 1), rskill(100, "REST APIs", 2), rskill(101, "Business Analysis", 0)
        ));
        OrgResume r = new OrgResume();
        r.setConsultantId(10L);
        r.setPrimaryForOrg(true);
        r.setUpdatedAt(NOW.minus(5, ChronoUnit.DAYS));
        r.setHeadline("Java and AWS developer");
        when(resumes.findByOrgIdAndConsultantIdIn(eq(1L), anyCollection())).thenReturn(List.of(r));
        when(applications.findByOrgIdAndConsultantIdIn(eq(1L), anyCollection())).thenReturn(List.of());
    }

    private Response list(String q, Long consultantId, String skill, Long clientId, String score, String sort, int page, int size) {
        return service.list(me, new MktMatchesService.Query(page, size, q, consultantId, skill, clientId, score, sort, null));
    }

    private static List<Long> ids(Response r) {
        return r.items().stream().map(Row::id).collect(Collectors.toList());
    }

    @Test
    void aConsultantOutsideTheCallersViewNeverAppearsAnywhere() {
        Response r = list(null, null, null, null, null, null, 0, 10);
        assertThat(ids(r)).containsExactly(1L, 2L, 3L);
        assertThat(r.total()).isEqualTo(3);
        assertThat(r.topToday()).extracting(Row::id).containsExactly(1L, 2L);
        assertThat(r.filters().consultants()).extracting(MktMatchesDto.Option::label).containsExactly("Alex Morgan", "Priya Sharma");
        assertThat(r.kpis().get(0).value()).isEqualTo(3);
    }

    @Test
    void anUnseenMatchIsNotFoundForDetailCompareAssignAndDismiss() {
        assertThatThrownBy(() -> service.detail(me, 4L)).isInstanceOf(OrgNotFoundException.class);
        assertThatThrownBy(() -> service.compare(me, 1L, 4L)).isInstanceOf(OrgNotFoundException.class);
        assertThatThrownBy(() -> service.assign(me, 4L)).isInstanceOf(OrgNotFoundException.class);
        assertThatThrownBy(() -> service.dismiss(me, 4L)).isInstanceOf(OrgNotFoundException.class);
        assertThatThrownBy(() -> service.detail(me, 999L)).isInstanceOf(OrgNotFoundException.class);
        verify(matches, never()).save(any());
    }

    @Test
    void kpisAreComputedFromTheRows() {
        Response r = list(null, null, null, null, null, null, 0, 10);
        // matched 3; high confidence (>= 85) = match 1; stale = SUGGESTED older than 7 days = match 2; ready = Alex's SUGGESTED (available, resume covers Java+AWS)
        assertThat(r.kpis()).extracting(MktMatchesDto.Kpi::key).containsExactly("matched", "highConfidence", "ready", "stale");
        assertThat(r.kpis().get(1).value()).isEqualTo(1);
        assertThat(r.kpis().get(2).value()).isEqualTo(1);
        assertThat(r.kpis().get(3).value()).isEqualTo(1);
        assertThat(r.kpis().get(0).sparkline()).hasSize(8);
        // previous month: only match 3 (40 days old) existed -> matched 3 vs 1 = +200 %; high-confidence had none before = no delta
        assertThat(r.kpis().get(0).deltaPct()).isEqualTo(200.0);
        assertThat(r.kpis().get(1).deltaPct()).isNull();
        assertThat(r.highConfidenceMin()).isEqualTo(85);
        assertThat(r.staleDays()).isEqualTo(7);
    }

    @Test
    void rowsCarryAvailabilityResumeUpdateAndStale() {
        Response r = list(null, null, null, null, null, null, 0, 10);
        Row alex = r.items().get(0);
        assertThat(alex.availability().label()).isEqualTo("Excellent");
        assertThat(alex.resumeUpdate().needed()).isFalse();
        assertThat(alex.primarySkill()).isEqualTo("Java");
        assertThat(alex.highConfidence()).isTrue();
        Row priya = r.items().get(1);
        assertThat(priya.availability().label()).isEqualTo("Fair");
        assertThat(priya.resumeUpdate().needed()).isTrue();
        assertThat(priya.resumeUpdate().reasons()).containsExactly("No resume on file");
        assertThat(priya.stale()).isTrue();
    }

    @Test
    void everyFilterNarrowsTheList() {
        assertThat(ids(list(null, 11L, null, null, null, null, 0, 10))).containsExactly(2L);
        assertThat(ids(list(null, null, "java", null, null, null, 0, 10))).containsExactly(1L, 3L);
        assertThat(ids(list(null, null, null, 501L, null, null, 0, 10))).containsExactly(2L, 3L);
        assertThat(ids(list(null, null, null, null, "high", null, 0, 10))).containsExactly(1L);
        assertThat(ids(list(null, null, null, null, "mid", null, 0, 10))).containsExactly(2L);
        assertThat(ids(list(null, null, null, null, "low", null, 0, 10))).containsExactly(3L);
        assertThat(ids(list("global", null, null, null, null, null, 0, 10))).containsExactly(2L, 3L);
        assertThat(ids(list("nobody", null, null, null, null, null, 0, 10))).isEmpty();
    }

    @Test
    void sortAndPaging() {
        assertThat(ids(list(null, null, null, null, null, "score", 0, 10))).containsExactly(3L, 2L, 1L);
        assertThat(ids(list(null, null, null, null, null, "-consultant", 0, 10))).containsExactly(2L, 1L, 3L);
        Response second = list(null, null, null, null, null, null, 1, 2);
        assertThat(ids(second)).containsExactly(3L);
        assertThat(second.total()).isEqualTo(3);
        assertThat(list(null, null, null, null, null, null, 0, 1000).size()).isEqualTo(100);
    }

    @Test
    void theExplanationComesFromRealComparisons() {
        Response r = list(null, null, null, null, null, null, 0, 10);
        MktMatchesDto.Detail d = r.explanation();
        assertThat(d.row().id()).isEqualTo(1L);
        assertThat(d.ticks()).extracting(MktMatchesDto.Tick::text).contains("2 of 3 required skills match", "5+ years of relevant experience", "Available to start now", "Work location matches (New York, NY)");
        assertThat(d.ticks()).extracting(MktMatchesDto.Tick::key).doesNotContain("client"); // no earlier application with the client
        assertThat(d.insights()).extracting(MktMatchesDto.Insight::label).containsExactly("Skills Match", "Experience Level", "Availability Fit", "Client History", "Location Fit");
        assertThat(d.insights().get(0).pct()).isEqualTo(67);
        assertThat(d.insights().get(3).pct()).isNull();
        assertThat(d.missingSkills()).containsExactly("REST APIs");
        assertThat(d.consultant().skills()).containsExactly("Java", "AWS");
        // selecting another row explains that one
        Response other = service.list(me, new MktMatchesService.Query(0, 10, null, null, null, null, null, null, 2L));
        assertThat(other.explanation().row().id()).isEqualTo(2L);
    }

    @Test
    void compareReturnsBothSides() {
        MktMatchesDto.Compare c = service.compare(me, 1L, 3L);
        assertThat(c.a().row().id()).isEqualTo(1L);
        assertThat(c.b().row().id()).isEqualTo(3L);
        assertThatThrownBy(() -> service.compare(me, 1L, 1L)).isInstanceOf(OrgException.class);
    }

    @Test
    void assignRecordsTheMatchAndNothingElse() {
        Row row = service.assign(me, 1L);
        assertThat(row.status()).isEqualTo("ASSIGNED");
        RequirementMatch m = live.get(0);
        assertThat(m.getStatus()).isEqualTo("ASSIGNED");
        assertThat(m.getAssignedByMemberId()).isEqualTo(7L);
        assertThat(m.getAssignedAt()).isEqualTo(NOW);
        verify(world.matches).save(m);
        assertThat(world.eventKinds()).containsExactly("ASSIGNED");
        assertThat(world.oppStore.values()).extracting(o -> o.getMatchId()).as("the opportunity overlay exists now").containsExactly(1L);
        verify(audit).record(eq(me), eq("MKT_MATCH_ASSIGN"), eq("MATCH"), eq(null), eq("1"), any());
        // idempotent: a second call changes nothing and writes no second audit row
        service.assign(me, 1L);
        verify(world.matches).save(any());
        verify(audit).record(any(OrgMembership.class), any(), any(), any(), any(), any());
    }

    @Test
    void assignNeedsTheWriteKeyAndABackedConsultant() {
        assignDenied = true;
        assertThatThrownBy(() -> service.assign(me, 1L)).isInstanceOf(OrgNotFoundException.class);
        assignDenied = false;
        assignIds = Set.of(11L); // write scope does not reach consultant 10
        assertThatThrownBy(() -> service.assign(me, 1L)).isInstanceOf(OrgNotFoundException.class);
        verify(matches, never()).save(any());
    }

    @Test
    void assignRefusesAClosedJobAndADismissedMatch() {
        assertThatThrownBy(() -> service.assign(me, 2L)).isInstanceOfSatisfying(OrgException.class, e -> assertThat(e.getCode()).isEqualTo("REQUIREMENT_CLOSED"));
        live.get(1).setStatus("DISMISSED");
        assertThatThrownBy(() -> service.assign(me, 2L)).isInstanceOfSatisfying(OrgException.class, e -> assertThat(e.getCode()).isEqualTo("MATCH_STATE"));
        verify(matches, never()).save(any());
    }

    @Test
    void assignKeepsTheResumeGateTheActiveConsultantGateAndReopensADeclinedOpportunity() {
        world.approved.clear();
        assertThatThrownBy(() -> service.assign(me, 1L)).isInstanceOfSatisfying(OrgException.class, e -> {
            assertThat(e.getStatus()).isEqualTo(409);
            assertThat(e.getCode()).isEqualTo("RESUME_NOT_APPROVED");
        });
        assertThat(live.get(0).getStatus()).isEqualTo("SUGGESTED");

        world.approve(10);
        world.people.get(10L).setMarketingStatus("PAUSED");
        assertThatThrownBy(() -> service.assign(me, 1L)).isInstanceOfSatisfying(OrgException.class, e -> assertThat(e.getCode()).isEqualTo("CONSULTANT_PAUSED"));
        assertThat(live.get(0).getStatus()).isEqualTo("SUGGESTED");

        // an ASSIGNED match whose consultant declined is put back in front of them (same rows, a REASSIGNED event)
        world.people.get(10L).setMarketingStatus("ACTIVE");
        world.jobs.get(101L).setStatus("OPEN");
        com.dossier.api.domain.ent.mkt.MktOpportunity declined = world.opportunity(3L, "DECLINED");
        service.assign(me, 3L);
        assertThat(declined.getState()).isEqualTo("ASSIGNED");
        assertThat(world.eventKinds()).containsExactly("REASSIGNED");
    }

    @Test
    void dismissOnlyTouchesASuggestedMatch() {
        assertThat(service.dismiss(me, 2L).status()).isEqualTo("DISMISSED");
        verify(audit).record(eq(me), eq("MKT_MATCH_DISMISS"), eq("MATCH"), eq(null), eq("2"), any());
        assertThatThrownBy(() -> service.dismiss(me, 3L)).isInstanceOfSatisfying(OrgException.class, e -> assertThat(e.getCode()).isEqualTo("MATCH_STATE"));
    }

    @Test
    void anOrgWithoutMatchesGetsEmptyStatesNotNumbers() {
        live.clear();
        Response r = list(null, null, null, null, null, null, 0, 10);
        assertThat(r.items()).isEmpty();
        assertThat(r.total()).isZero();
        assertThat(r.topToday()).isEmpty();
        assertThat(r.explanation()).isNull();
        assertThat(r.kpis()).allSatisfy(k -> {
            assertThat(k.value()).isZero();
            assertThat(k.deltaPct()).isNull();
        });
        verify(consultants, never()).findByOrgIdAndIdIn(anyLong(), anyCollection());
    }
}
