package com.dossier.api.service.ent.mkt.talent;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.CALLS_REAL_METHODS;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.enumeration.PermissionScope;
import com.dossier.api.domain.ent.mkt.MktSavedView;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.ent.talent.ConsultantSkill;
import com.dossier.api.domain.ent.talent.OrgResume;
import com.dossier.api.domain.ent.talent.RequirementMatch;
import com.dossier.api.domain.ent.talent.TalentApplication;
import com.dossier.api.domain.ent.talent.TalentInterview;
import com.dossier.api.repository.ent.mkt.MktSavedViewRepository;
import com.dossier.api.repository.ent.mkt.MktTalentApplicationRepository;
import com.dossier.api.repository.ent.mkt.MktTalentClientRepository;
import com.dossier.api.repository.ent.mkt.MktTalentConsultantRepository;
import com.dossier.api.repository.ent.mkt.MktTalentInterviewRepository;
import com.dossier.api.repository.ent.mkt.MktTalentJobRepository;
import com.dossier.api.repository.ent.mkt.MktTalentMatchRepository;
import com.dossier.api.repository.ent.mkt.MktTalentResumeRepository;
import com.dossier.api.repository.ent.mkt.MktTalentSkillRepository;
import com.dossier.api.service.ent.mkt.MktScope;
import com.dossier.api.service.ent.mkt.talent.MktTalentDtos.*;
import com.dossier.api.service.ent.mkt.talent.MktTalentService.ListQuery;
import com.dossier.api.service.org.OrgException;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import com.dossier.api.service.privacy.SensitiveContentException;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** Plain unit tests of the My Assigned Talent service: scope, KPI math, every filter, saved views. No Spring, no database. */
class MktTalentServiceTest {

    static final Long ORG = 7L;
    static final Long ME = 55L;
    static final Instant NOW = Instant.parse("2026-10-13T12:00:00Z");

    MktScope scope;
    MktTalentConsultantRepository consultants;
    MktTalentSkillRepository skills;
    MktTalentResumeRepository resumes;
    MktTalentApplicationRepository applications;
    MktTalentInterviewRepository interviews;
    MktTalentMatchRepository matches;
    MktTalentJobRepository jobs;
    MktTalentClientRepository clients;
    MktSavedViewRepository savedViews;
    OrgMembership me;
    MktTalentService service;

    /** The first Mockito inline mock of a JVM can take a long time on a busy machine; the @BeforeAll budget is 60 s, a test's is 15 s. */
    @BeforeAll
    static void warmUpMockito() {
        mock(OrgMembership.class);
        mock(MktScope.class, CALLS_REAL_METHODS);
    }

    @BeforeEach
    void setUp() {
        scope = mock(MktScope.class, CALLS_REAL_METHODS);
        consultants = mock(MktTalentConsultantRepository.class);
        skills = mock(MktTalentSkillRepository.class);
        resumes = mock(MktTalentResumeRepository.class);
        applications = mock(MktTalentApplicationRepository.class);
        interviews = mock(MktTalentInterviewRepository.class);
        matches = mock(MktTalentMatchRepository.class);
        jobs = mock(MktTalentJobRepository.class);
        clients = mock(MktTalentClientRepository.class);
        savedViews = mock(MktSavedViewRepository.class);
        me = mock(OrgMembership.class);
        when(me.orgId()).thenReturn(ORG);
        when(me.memberId()).thenReturn(ME);
        when(me.scopeFor("consultants.edit")).thenReturn(Optional.empty());
        service = new MktTalentService(scope, consultants, skills, resumes, applications, interviews, matches, jobs, clients, savedViews);
    }

    private void sees(Long... ids) {
        doReturn(new MktScope.View(ORG, ME, false, Set.of(ids))).when(scope).resolve(me, "consultants.view");
    }

    private ConsultantProfile consultant(long id, String name, String title, int years, String location, String availability, int daysOld) {
        ConsultantProfile c = new ConsultantProfile();
        c.setId(id);
        c.setOrgId(ORG);
        c.setDisplayName(name);
        c.setEmail(name.toLowerCase().replace(' ', '.') + "@example.com");
        c.setJobTitle(title);
        c.setYearsExperience(years);
        c.setLocationLabel(location);
        c.setAvailabilityStatus(availability);
        c.setCreatedAt(NOW.minus(daysOld, ChronoUnit.DAYS));
        return c;
    }

    private ConsultantSkill skill(long consultantId, String name, boolean primary, int order) {
        ConsultantSkill s = new ConsultantSkill();
        s.setOrgId(ORG);
        s.setConsultantId(consultantId);
        s.setSkill(name);
        s.setPrimarySkill(primary);
        s.setSortOrder(order);
        return s;
    }

    private OrgResume resume(long consultantId, String approval, int updatedDaysAgo, int createdDaysAgo) {
        OrgResume r = new OrgResume();
        r.setOrgId(ORG);
        r.setConsultantId(consultantId);
        r.setName("Resume");
        r.setApprovalStatus(approval);
        r.setUpdatedAt(NOW.minus(updatedDaysAgo, ChronoUnit.DAYS));
        r.setCreatedAt(NOW.minus(createdDaysAgo, ChronoUnit.DAYS));
        return r;
    }

    private TalentApplication app(long consultantId, String stage) {
        TalentApplication a = new TalentApplication();
        a.setOrgId(ORG);
        a.setConsultantId(consultantId);
        a.setStage(stage);
        return a;
    }

    private TalentInterview interview(long consultantId, String status, Instant at) {
        TalentInterview i = new TalentInterview();
        i.setOrgId(ORG);
        i.setConsultantId(consultantId);
        i.setStatus(status);
        i.setScheduledAt(at);
        return i;
    }

    private RequirementMatch assigned(long consultantId) {
        RequirementMatch m = new RequirementMatch();
        m.setOrgId(ORG);
        m.setConsultantId(consultantId);
        m.setStatus("ASSIGNED");
        m.setScore(90);
        return m;
    }

    /** Four consultants: Alex (available, fresh resume), Priya (notice 2 weeks, stale resume), Mike (interview), Eve (pending resume, newest). */
    private void fourConsultants() {
        ConsultantProfile alex = consultant(1, "Alex Morgan", "Senior Java Developer", 8, "New York, NY", "AVAILABLE", 200);
        ConsultantProfile priya = consultant(2, "Priya Sharma", "Business Analyst", 4, "Austin, TX", "NOTICE", 100);
        priya.setAvailableFrom(LocalDate.of(2026, 10, 27));
        ConsultantProfile mike = consultant(3, "Michael Park", "AWS Engineer", 7, "Seattle, WA", "ON_PROJECT", 60);
        ConsultantProfile eve = consultant(4, "Eve Adams", "QA Lead", 10, "Remote", "AVAILABLE", 10);
        when(consultants.findActiveByIds(eq(ORG), anyCollection())).thenReturn(List.of(alex, eve, mike, priya));
        when(skills.findForConsultants(eq(ORG), anyCollection())).thenReturn(List.of(
            skill(1, "Java", true, 0), skill(1, "Spring", true, 1), skill(1, "SQL", false, 2),
            skill(2, "Business Analysis", true, 0), skill(3, "AWS", true, 0), skill(4, "Selenium", false, 0)));
        when(resumes.findForConsultants(eq(ORG), anyCollection())).thenReturn(List.of(
            resume(1, "APPROVED", 5, 150), resume(2, "APPROVED", 200, 300), resume(3, "APPROVED", 20, 100), resume(4, "PENDING", 3, 3)));
        when(applications.findOpenForConsultants(eq(ORG), anyCollection())).thenReturn(List.of(app(1, "SUBMITTED"), app(1, "UNDER_REVIEW"), app(3, "INTERVIEWING")));
        when(interviews.findLiveSince(eq(ORG), anyCollection(), any())).thenReturn(List.of(
            interview(3, "SCHEDULED", NOW.plus(2, ChronoUnit.DAYS)), interview(1, "COMPLETED", NOW.minus(25, ChronoUnit.DAYS))));
        when(matches.findAssignedForConsultants(eq(ORG), anyCollection())).thenReturn(List.of(assigned(1), assigned(1), assigned(3)));
    }

    @Test
    void emptyScopeIsAnHonestEmptyBoard() {
        sees();
        Response r = service.list(me, ListQuery.defaults(), NOW);
        assertThat(r.items()).isEmpty();
        assertThat(r.total()).isZero();
        assertThat(r.counts()).isEqualTo(new Counts(0, 0, 0, 0, 0));
        assertThat(r.kpis()).hasSize(5).allSatisfy(k -> {
            assertThat(k.value()).isZero();
            assertThat(k.deltaPct()).isNull();
        });
        assertThat(r.cards().available()).isEmpty();
        assertThat(r.cards().needsUpdate()).isEmpty();
        assertThat(r.cards().inInterview()).isEmpty();
        assertThat(r.canAddConsultant()).isFalse();
        verify(consultants, never()).findActiveByIds(anyLong(), anyCollection());
        verify(consultants, never()).findActiveForOrg(anyLong());
    }

    @Test
    void assignedScopeOnlyAsksForItsConsultants() {
        sees(1L, 2L, 3L, 4L);
        fourConsultants();
        service.list(me, ListQuery.defaults(), NOW);
        verify(consultants).findActiveByIds(ORG, Set.of(1L, 2L, 3L, 4L));
        verify(consultants, never()).findActiveForOrg(anyLong());
    }

    @Test
    void orgScopeSeesEveryConsultant() {
        doReturn(new MktScope.View(ORG, ME, true, Set.of())).when(scope).resolve(me, "consultants.view");
        when(consultants.findActiveForOrg(ORG)).thenReturn(List.of(consultant(1, "Alex Morgan", "Dev", 8, "NY", "AVAILABLE", 100)));
        Response r = service.list(me, ListQuery.defaults(), NOW);
        assertThat(r.counts().all()).isEqualTo(1);
        verify(consultants, never()).findActiveByIds(anyLong(), anyCollection());
    }

    @Test
    void kpisChipsAndRowsAreComputedFromRows() {
        sees(1L, 2L, 3L, 4L);
        fourConsultants();
        Response r = service.list(me, ListQuery.defaults(), NOW);

        assertThat(r.counts()).isEqualTo(new Counts(4, 2, 1, 1, 1)); // all, available (Alex, Eve), in interview (Mike), needs update (Priya), pending (Eve)
        Kpi assignedKpi = r.kpis().get(0);
        assertThat(assignedKpi.key()).isEqualTo("assigned");
        assertThat(assignedKpi.value()).isEqualTo(4);
        assertThat(assignedKpi.deltaPct()).isEqualTo(33.3); // 3 had joined before T-30, now 4
        assertThat(assignedKpi.sparkline()).hasSize(8).last().isEqualTo(4L);
        assertThat(r.kpis().get(1).value()).isEqualTo(2); // availableNow
        assertThat(r.kpis().get(1).deltaPct()).isEqualTo(100.0); // 1 -> 2
        assertThat(r.kpis().get(2).value()).isEqualTo(1); // needUpdates
        assertThat(r.kpis().get(2).deltaPct()).isEqualTo(0.0);
        assertThat(r.kpis().get(3).key()).isEqualTo("activeInterviews");
        assertThat(r.kpis().get(3).value()).isEqualTo(1);
        assertThat(r.kpis().get(3).deltaPct()).isEqualTo(0.0); // Alex's completed interview 25 days ago was inside the T-30..T-16 window
        Kpi pending = r.kpis().get(4);
        assertThat(pending.value()).isEqualTo(1);
        assertThat(pending.deltaPct()).isNull(); // the only pending resume is 3 days old: nothing to compare with

        Row alex = r.items().stream().filter(x -> x.id() == 1).findFirst().orElseThrow();
        assertThat(alex.primarySkill()).isEqualTo("Java / Spring");
        assertThat(alex.activeApps()).isEqualTo(2);
        assertThat(alex.assignedJobs()).isEqualTo(2);
        assertThat(alex.availability().label()).isEqualTo("Available Now");
        assertThat(alex.resume().state()).isEqualTo("UP_TO_DATE");
        Row priya = r.items().stream().filter(x -> x.id() == 2).findFirst().orElseThrow();
        assertThat(priya.availability().label()).isEqualTo("2 weeks");
        assertThat(priya.resume().state()).isEqualTo("NEEDS_UPDATE");
        Row mike = r.items().stream().filter(x -> x.id() == 3).findFirst().orElseThrow();
        assertThat(mike.availability().label()).isEqualTo("In Interview");
        Row eve = r.items().stream().filter(x -> x.id() == 4).findFirst().orElseThrow();
        assertThat(eve.resume().state()).isEqualTo("PENDING_APPROVAL");
        assertThat(eve.primarySkill()).isEqualTo("Selenium"); // no primary skill: the first one

        assertThat(r.cards().available()).extracting(Row::name).containsExactly("Alex Morgan", "Eve Adams");
        assertThat(r.cards().needsUpdate()).extracting(Row::name).containsExactly("Priya Sharma");
        assertThat(r.cards().inInterview()).extracting(Row::name).containsExactly("Michael Park");
        assertThat(r.facets().skills()).contains("AWS", "Java", "Selenium");
        assertThat(r.facets().locations()).containsExactly("Austin, TX", "New York, NY", "Remote", "Seattle, WA");
    }

    @Test
    void everyFilterNarrowsTheTable() {
        sees(1L, 2L, 3L, 4L);
        fourConsultants();
        assertThat(names(new ListQuery(null, "AVAILABLE_NOW", null, null, null, null, null, 0, 10))).containsExactly("Alex Morgan", "Eve Adams");
        assertThat(names(new ListQuery(null, "IN_INTERVIEW", null, null, null, null, null, 0, 10))).containsExactly("Michael Park");
        assertThat(names(new ListQuery(null, "NEEDS_UPDATE", null, null, null, null, null, 0, 10))).containsExactly("Priya Sharma");
        assertThat(names(new ListQuery(null, "PENDING_APPROVAL", null, null, null, null, null, 0, 10))).containsExactly("Eve Adams");
        assertThat(names(new ListQuery(null, null, "aws", null, null, null, null, 0, 10))).containsExactly("Michael Park");
        assertThat(names(new ListQuery(null, null, null, "remote", null, null, null, 0, 10))).containsExactly("Eve Adams");
        assertThat(names(new ListQuery(null, null, null, null, "0-2", null, null, 0, 10))).isEmpty();
        assertThat(names(new ListQuery(null, null, null, null, "3-5", null, null, 0, 10))).containsExactly("Priya Sharma");
        assertThat(names(new ListQuery(null, null, null, null, "6-8", null, null, 0, 10))).containsExactly("Alex Morgan", "Michael Park");
        assertThat(names(new ListQuery(null, null, null, null, "9+", null, null, 0, 10))).containsExactly("Eve Adams");
        assertThat(names(new ListQuery(null, null, null, null, null, "SOON", null, 0, 10))).containsExactly("Priya Sharma");
        assertThat(names(new ListQuery(null, null, null, null, null, "AVAILABLE_NOW", null, 0, 10))).containsExactly("Alex Morgan", "Eve Adams");
        assertThat(names(new ListQuery("seattle", null, null, null, null, null, null, 0, 10))).containsExactly("Michael Park");
        assertThat(names(new ListQuery("selen", null, null, null, null, null, null, 0, 10))).containsExactly("Eve Adams");
        assertThat(names(new ListQuery("analyst", null, null, null, null, null, null, 0, 10))).containsExactly("Priya Sharma");
        assertThat(names(new ListQuery("nobody", null, null, null, null, null, null, 0, 10))).isEmpty();
    }

    @Test
    void sortingAndPaging() {
        sees(1L, 2L, 3L, 4L);
        fourConsultants();
        assertThat(names(new ListQuery(null, null, null, null, null, null, "-experience", 0, 10))).containsExactly("Eve Adams", "Alex Morgan", "Michael Park", "Priya Sharma");
        assertThat(names(new ListQuery(null, null, null, null, null, null, "experience", 0, 10))).containsExactly("Priya Sharma", "Michael Park", "Alex Morgan", "Eve Adams");
        Response page2 = service.list(me, new ListQuery(null, null, null, null, null, null, "name", 1, 3), NOW);
        assertThat(page2.items()).extracting(Row::name).containsExactly("Priya Sharma");
        assertThat(page2.total()).isEqualTo(4);
        assertThat(page2.size()).isEqualTo(3);
        Response huge = service.list(me, new ListQuery(null, null, null, null, null, null, null, 0, 5000), NOW);
        assertThat(huge.size()).isEqualTo(MktTalentService.MAX_SIZE);
    }

    private List<String> names(ListQuery q) {
        return service.list(me, q, NOW).items().stream().map(Row::name).toList();
    }

    @Test
    void addConsultantFollowsTheEditGrant() {
        sees();
        when(me.scopeFor("consultants.edit")).thenReturn(Optional.of(PermissionScope.ORG));
        assertThat(service.list(me, ListQuery.defaults(), NOW).canAddConsultant()).isTrue();
    }

    @Test
    void aConsultantOutsideTheScopeIsAGenericNotFound() {
        sees(1L);
        assertThatThrownBy(() -> service.detail(me, 99L, NOW)).isInstanceOf(OrgNotFoundException.class);
        verify(consultants, never()).findActiveById(anyLong(), anyLong());
    }

    @Test
    void aMissingConsultantInsideTheScopeIsAlsoNotFound() {
        sees(1L);
        when(consultants.findActiveById(ORG, 1L)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.detail(me, 1L, NOW)).isInstanceOf(OrgNotFoundException.class);
    }

    @Test
    void drawerIsASummaryWithoutContactDetails() {
        sees(1L);
        fourConsultants();
        ConsultantProfile alex = consultant(1, "Alex Morgan", "Senior Java Developer", 8, "New York, NY", "AVAILABLE", 200);
        alex.setHeadline("Backend engineer");
        alex.setWorkMode("HYBRID");
        alex.setProfileCompleteness(80);
        when(consultants.findActiveById(ORG, 1L)).thenReturn(Optional.of(alex));
        when(resumes.findForConsultant(ORG, 1L)).thenReturn(List.of(resume(1, "APPROVED", 5, 150)));
        Detail d = service.detail(me, 1L, NOW);
        assertThat(d.name()).isEqualTo("Alex Morgan");
        assertThat(d.consent()).isEqualTo("SUMMARY");
        assertThat(d.skills()).containsExactly("Java", "Spring", "SQL");
        assertThat(d.resumes()).hasSize(1);
        assertThat(d.profileCompleteness()).isEqualTo(80);
        // no e-mail, phone or id numbers exist on the wire type
        assertThat(Detail.class.getRecordComponents()).extracting(c -> c.getName()).noneMatch(n -> n.toLowerCase().contains("email") || n.toLowerCase().contains("phone"));
    }

    // ---- helpers ------------------------------------------------------------------------------------------------------------

    @Test
    void availabilityLabelsFollowTheBoard() {
        LocalDate today = LocalDate.of(2026, 10, 13);
        assertThat(MktTalentService.availability("AVAILABLE", null, true, today).label()).isEqualTo("Available Now");
        assertThat(MktTalentService.availability("ON_PROJECT", null, true, today).code()).isEqualTo("IN_INTERVIEW");
        assertThat(MktTalentService.availability("NOTICE", today.plusDays(7), false, today).label()).isEqualTo("1 week");
        assertThat(MktTalentService.availability("NOTICE", today.plusDays(14), false, today).label()).isEqualTo("2 weeks");
        assertThat(MktTalentService.availability("NOTICE", today.plusDays(30), false, today).label()).isEqualTo("1 month");
        assertThat(MktTalentService.availability("ON_PROJECT", today.plusDays(90), false, today)).isEqualTo(new Availability("LATER", "3 months", "blue"));
        assertThat(MktTalentService.availability("ON_PROJECT", null, false, today).code()).isEqualTo("ON_PROJECT");
        assertThat(MktTalentService.availability("UNAVAILABLE", null, false, today).code()).isEqualTo("UNAVAILABLE");
    }

    @Test
    void deltaIsOmittedWithoutAPreviousValue() {
        assertThat(MktTalentService.delta(5, 0)).isNull();
        assertThat(MktTalentService.delta(28, 25)).isEqualTo(12.0);
        assertThat(MktTalentService.delta(3, 5)).isEqualTo(-40.0);
    }

    // ---- saved views --------------------------------------------------------------------------------------------------------

    @Test
    void savingAViewStoresOnlyFilters() {
        sees();
        when(savedViews.findByOrgIdAndMemberIdAndPageKeyAndName(ORG, ME, "TALENT", "Java people")).thenReturn(Optional.empty());
        when(savedViews.countByOrgIdAndMemberIdAndPageKey(ORG, ME, "TALENT")).thenReturn(2L);
        when(savedViews.save(any(MktSavedView.class))).thenAnswer(i -> {
            MktSavedView v = i.getArgument(0);
            v.setId(9L);
            return v;
        });
        View v = service.saveView(me, new SaveViewRequest("  Java people ", "java", "available_now", "Java", "Remote", "6-8", "soon"));
        assertThat(v.id()).isEqualTo(9L);
        assertThat(v.name()).isEqualTo("Java people");
        assertThat(v.filters()).isEqualTo(new Filters("java", "AVAILABLE_NOW", "Java", "Remote", "6-8", "SOON"));
    }

    @Test
    void savingAnExistingNameOverwritesIt() {
        sees();
        MktSavedView existing = new MktSavedView();
        existing.setId(3L);
        existing.setName("Mine");
        when(savedViews.findByOrgIdAndMemberIdAndPageKeyAndName(ORG, ME, "TALENT", "Mine")).thenReturn(Optional.of(existing));
        when(savedViews.save(any(MktSavedView.class))).thenAnswer(i -> i.getArgument(0));
        View v = service.saveView(me, new SaveViewRequest("Mine", null, "NEEDS_UPDATE", null, null, null, null));
        assertThat(v.id()).isEqualTo(3L);
        assertThat(v.filters().status()).isEqualTo("NEEDS_UPDATE");
        verify(savedViews, never()).countByOrgIdAndMemberIdAndPageKey(anyLong(), anyLong(), any());
    }

    @Test
    void savedViewInputIsValidated() {
        sees();
        assertThatThrownBy(() -> service.saveView(me, new SaveViewRequest("   ", null, null, null, null, null, null))).isInstanceOf(OrgException.class);
        assertThatThrownBy(() -> service.saveView(me, new SaveViewRequest("x".repeat(61), null, null, null, null, null, null))).isInstanceOf(OrgException.class);
        assertThatThrownBy(() -> service.saveView(me, new SaveViewRequest("ok", null, "DROP", null, null, null, null))).isInstanceOf(OrgException.class);
        assertThatThrownBy(() -> service.saveView(me, new SaveViewRequest("ok", null, null, null, null, "12+", null))).isInstanceOf(OrgException.class);
        assertThatThrownBy(() -> service.saveView(me, new SaveViewRequest("ok", null, null, null, null, null, "NEVER"))).isInstanceOf(OrgException.class);
        assertThatThrownBy(() -> service.saveView(me, new SaveViewRequest("ok", "q".repeat(121), null, null, null, null, null))).isInstanceOf(OrgException.class);
        assertThatThrownBy(() -> service.saveView(me, new SaveViewRequest("ssn 123-45-6789", null, null, null, null, null, null))).isInstanceOf(SensitiveContentException.class);
        verify(savedViews, never()).save(any());
    }

    @Test
    void twentyViewsIsTheCap() {
        sees();
        when(savedViews.findByOrgIdAndMemberIdAndPageKeyAndName(any(), any(), any(), any())).thenReturn(Optional.empty());
        when(savedViews.countByOrgIdAndMemberIdAndPageKey(ORG, ME, "TALENT")).thenReturn((long) MktTalentService.MAX_VIEWS);
        assertThatThrownBy(() -> service.saveView(me, new SaveViewRequest("one more", null, null, null, null, null, null)))
            .isInstanceOfSatisfying(OrgException.class, e -> assertThat(e.getStatus()).isEqualTo(422));
    }

    @Test
    void deletingSomeoneElsesViewIsNotFound() {
        sees();
        when(savedViews.findByOrgIdAndMemberIdAndId(ORG, ME, 77L)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.deleteView(me, 77L)).isInstanceOf(OrgNotFoundException.class);
        verify(savedViews, never()).delete(any());
    }

    @Test
    void deletingMyViewRemovesIt() {
        sees();
        MktSavedView mine = new MktSavedView();
        mine.setId(5L);
        when(savedViews.findByOrgIdAndMemberIdAndId(ORG, ME, 5L)).thenReturn(Optional.of(mine));
        service.deleteView(me, 5L);
        verify(savedViews).delete(mine);
    }

    @Test
    void listReturnsMyViewsOnly() {
        sees();
        MktSavedView v = new MktSavedView();
        v.setId(1L);
        v.setName("Mine");
        v.setStatusFilter("AVAILABLE_NOW");
        when(savedViews.findByOrgIdAndMemberIdAndPageKeyOrderByNameAsc(ORG, ME, "TALENT")).thenReturn(new ArrayList<>(List.of(v)));
        Response r = service.list(me, ListQuery.defaults(), NOW);
        assertThat(r.views()).extracting(View::name).containsExactly("Mine");
    }
}
