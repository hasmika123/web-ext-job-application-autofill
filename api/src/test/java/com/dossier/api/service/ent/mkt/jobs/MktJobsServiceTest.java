package com.dossier.api.service.ent.mkt.jobs;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.domain.enumeration.PermissionScope;
import com.dossier.api.domain.ent.mkt.MktJobMeta;
import com.dossier.api.domain.ent.mkt.MktSavedSearch;
import com.dossier.api.domain.ent.talent.ClientAccount;
import com.dossier.api.domain.ent.talent.ClientRequirement;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.ent.talent.ConsultantSkill;
import com.dossier.api.domain.ent.talent.RequirementMatch;
import com.dossier.api.domain.ent.talent.RequirementSkill;
import com.dossier.api.repository.ent.mkt.MktJobMatchRepository;
import com.dossier.api.repository.ent.mkt.MktJobMetaRepository;
import com.dossier.api.repository.ent.mkt.MktSavedSearchRepository;
import com.dossier.api.repository.ent.talent.ClientAccountRepository;
import com.dossier.api.repository.ent.talent.ClientRequirementRepository;
import com.dossier.api.repository.ent.talent.ConsultantProfileRepository;
import com.dossier.api.repository.ent.talent.ConsultantSkillRepository;
import com.dossier.api.repository.ent.talent.RequirementSkillRepository;
import com.dossier.api.service.ent.mkt.MktScope;
import com.dossier.api.service.ent.mkt.jobs.MktJobsDTO.*;
import com.dossier.api.service.org.OrgAuditService;
import com.dossier.api.service.org.OrgException;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import com.dossier.api.service.privacy.SensitiveContentException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * {@link MktJobsService} without a database: the scope of every number and list (a consultant outside the caller's set never shows and
 * gets a 404), the KPI math, empty states, paging and filters, Assign (a match record only, idempotent, permission, closed job) and saved searches.
 */
class MktJobsServiceTest {

    private static final Instant NOW = Instant.parse("2026-10-13T12:00:00Z");
    private static final long ORG = 1L;
    private static final long ME = 7L;

    private final MktScope scope = mock(MktScope.class);
    private final ClientRequirementRepository requirements = mock(ClientRequirementRepository.class);
    private final ClientAccountRepository accounts = mock(ClientAccountRepository.class);
    private final RequirementSkillRepository reqSkills = mock(RequirementSkillRepository.class);
    private final ConsultantProfileRepository consultants = mock(ConsultantProfileRepository.class);
    private final ConsultantSkillRepository consSkills = mock(ConsultantSkillRepository.class);
    private final MktJobMetaRepository metas = mock(MktJobMetaRepository.class);
    private final MktSavedSearchRepository searches = mock(MktSavedSearchRepository.class);
    private final MktJobMatchRepository matches = mock(MktJobMatchRepository.class);
    private final OrgAuditService audit = mock(OrgAuditService.class);
    private final MktJobsService service = new MktJobsService(scope, requirements, accounts, reqSkills, consultants, consSkills, metas, searches, matches, audit, new ObjectMapper(), Clock.fixed(NOW, ZoneOffset.UTC));

    private final MktScope.View assigned = new MktScope.View(ORG, ME, false, Set.of(100L));
    private final MktScope.View everyone = new MktScope.View(ORG, ME, true, Set.of());

    private OrgMembership me(String... keys) {
        Map<String, PermissionScope> grants = new LinkedHashMap<>();
        for (String k : keys) grants.put(k, PermissionScope.ASSIGNED);
        return new OrgMembership(ORG, ME, 70L, "marketer", OrgRole.ADMIN, OrgMemberStatus.ACTIVE, OrgStatus.ACTIVE, List.of(new OrgMembership.RoleRef(1L, "MARKETING_SPECIALIST", "Marketer", true)), grants);
    }

    private static ClientRequirement job(long id, long client, String title, String status, Instant posted) {
        ClientRequirement r = new ClientRequirement();
        r.setId(id);
        r.setOrgId(ORG);
        r.setClientId(client);
        r.setTitle(title);
        r.setStatus(status);
        r.setPostedAt(posted);
        r.setLocation("New York, NY");
        r.setWorkMode("HYBRID");
        r.setRateMinMinor(9000L);
        r.setRateMaxMinor(11000L);
        r.setRateUnit("HOUR");
        r.setCurrency("USD");
        return r;
    }

    private static ClientAccount client(long id, String name, String industry) {
        ClientAccount c = new ClientAccount();
        c.setId(id);
        c.setOrgId(ORG);
        c.setName(name);
        c.setIndustry(industry);
        return c;
    }

    private static RequirementSkill skill(long job, String name, int order) {
        RequirementSkill s = new RequirementSkill();
        s.setOrgId(ORG);
        s.setRequirementId(job);
        s.setSkill(name);
        s.setSortOrder(order);
        return s;
    }

    private static RequirementMatch match(long id, long job, long consultant, int score, String status, Instant assignedAt) {
        RequirementMatch m = new RequirementMatch();
        m.setId(id);
        m.setOrgId(ORG);
        m.setRequirementId(job);
        m.setConsultantId(consultant);
        m.setScore(score);
        m.setStatus(status);
        m.setAssignedAt(assignedAt);
        m.setCreatedAt(NOW.minusSeconds(86_400L * 60));
        return m;
    }

    private static ConsultantProfile person(long id, String name, String status) {
        ConsultantProfile c = new ConsultantProfile();
        c.setId(id);
        c.setOrgId(ORG);
        c.setDisplayName(name);
        c.setJobTitle("Java Developer");
        c.setAvailabilityStatus("AVAILABLE");
        c.setStatus(status);
        return c;
    }

    private List<ClientRequirement> jobs;

    @BeforeEach
    void world() {
        jobs = new ArrayList<>(List.of(
            job(10, 1, "Senior Java Developer", "OPEN", NOW.minusSeconds(2 * 3600)),
            job(11, 2, "Data Analyst", "OPEN", NOW.minusSeconds(3 * 3600)),
            job(12, 1, "Old Java Role", "OPEN", NOW.minusSeconds(40 * 86_400L)),
            job(13, 1, "Filled Java Role", "FILLED", NOW.minusSeconds(50 * 86_400L))
        ));
        jobs.get(3).setClosedAt(NOW.minusSeconds(5 * 86_400L));
        when(requirements.findByOrgId(ORG)).thenReturn(jobs);
        for (ClientRequirement r : jobs) when(requirements.findByOrgIdAndId(ORG, r.getId())).thenReturn(Optional.of(r));
        when(accounts.findByOrgId(ORG)).thenReturn(List.of(client(1, "TechCorp", "Technology"), client(2, "Global Bank", null)));
        when(reqSkills.findByOrgId(ORG)).thenReturn(List.of(skill(10, "Java", 0), skill(10, "AWS", 1), skill(11, "SQL", 0), skill(11, "Python", 1), skill(12, "Java", 0), skill(13, "Java", 0)));
        MktJobMeta m10 = new MktJobMeta();
        m10.setOrgId(ORG);
        m10.setRequirementId(10L);
        m10.setSourceLabel("LinkedIn Jobs");
        m10.setPriority("HIGH");
        m10.setVisaLabel("H-1B transfer");
        when(metas.findByOrgId(ORG)).thenReturn(List.of(m10));
        when(consultants.findByOrgId(ORG)).thenReturn(List.of(person(100, "Alex Morgan", "ACTIVE"), person(101, "Priya Sharma", "ACTIVE"), person(102, "Gone Person", "INACTIVE")));
        when(consultants.findByOrgIdAndId(eq(ORG), any())).thenAnswer(i -> consultants.findByOrgId(ORG).stream().filter(c -> c.getId().equals(i.getArgument(1))).findFirst());
        when(searches.findByOrgIdAndOwnerMemberIdOrderByCreatedAtDesc(ORG, ME)).thenReturn(List.of());
        when(matches.findByOrgIdAndScoreGreaterThanEqual(ORG, 90)).thenReturn(List.of(match(1, 10, 100, 95, "SUGGESTED", null), match(2, 11, 101, 96, "SUGGESTED", null)));
        when(matches.findByOrgIdAndStatus(ORG, "ASSIGNED")).thenReturn(List.of(match(3, 12, 100, 80, "ASSIGNED", NOW.minusSeconds(10 * 86_400L)), match(4, 11, 101, 80, "ASSIGNED", NOW.minusSeconds(86_400L))));
        when(scope.resolve(any(), eq("matches.run"))).thenReturn(assigned);
        when(scope.resolve(any(), eq("opportunities.manage"))).thenReturn(assigned);
        org.mockito.Mockito.doAnswer(i -> {
            MktScope.View v = i.getArgument(0);
            if (!v.sees(i.getArgument(1))) throw new OrgNotFoundException();
            return null;
        }).when(scope).require(any(), any());
    }

    private Query all() {
        return new Query(0, 8, null, null, null, null, null, null, null, null, null);
    }

    @Test
    void tilesCountOnlyWhatTheCallerMaySee() {
        Kpis k = service.list(me("matches.run"), all()).kpis();
        assertThat(k.newToday().value()).as("open jobs posted in the last 24 h").isEqualTo(2);
        assertThat(k.newToday().deltaPct()).as("nothing the day before, so no percent").isNull();
        assertThat(k.newToday().sparkline()).hasSize(8);
        assertThat(k.highMatch().value()).as("consultant 101 is outside the caller's set").isEqualTo(1);
        assertThat(k.assigned().value()).as("the assignment of 101 is not counted").isEqualTo(1);
        assertThat(k.assigned().deltaPct()).as("it was already assigned a week ago: 0 %").isEqualTo(0.0);
        assertThat(k.assigned().sparkline()).hasSize(8);
        assertThat(k.savedSearches().value()).isZero();
    }

    @Test
    void anOrgWideCallerSeesEveryConsultantsMatches() {
        when(scope.resolve(any(), eq("matches.run"))).thenReturn(everyone);
        Kpis k = service.list(me("matches.run"), all()).kpis();
        assertThat(k.highMatch().value()).isEqualTo(2);
        assertThat(k.assigned().value()).isEqualTo(2);
    }

    @Test
    void rowsAreOpenJobsNewestFirstWithSourcePriorityRateAndSkills() {
        Response r = service.list(me("matches.run", "opportunities.manage"), all());
        assertThat(r.total()).as("the filled job is not an opening").isEqualTo(3);
        assertThat(r.items()).extracting(Job::title).containsExactly("Senior Java Developer", "Data Analyst", "Old Java Role");
        Job first = r.items().get(0);
        assertThat(first.client().name()).isEqualTo("TechCorp");
        assertThat(first.source()).isEqualTo("LinkedIn Jobs");
        assertThat(first.priority()).isEqualTo("HIGH");
        assertThat(first.visa()).isEqualTo("H-1B transfer");
        assertThat(first.rateLabel()).isEqualTo("$90 - $110/hr");
        assertThat(first.skills()).containsExactly("Java", "AWS");
        Job noMeta = r.items().get(1);
        assertThat(noMeta.source()).as("a job with no meta row is a client-portal job").isEqualTo("Client Portal");
        assertThat(noMeta.priority()).isEqualTo("MEDIUM");
        assertThat(r.canAssign()).isTrue();
        assertThat(service.list(me("matches.run"), all()).canAssign()).isFalse();
    }

    @Test
    void pagingFiltersAndSortApply() {
        Response p = service.list(me("matches.run"), new Query(1, 2, null, null, null, null, null, null, null, null, null));
        assertThat(p.total()).isEqualTo(3);
        assertThat(p.items()).extracting(Job::title).containsExactly("Old Java Role");
        assertThat(service.list(me("matches.run"), new Query(0, 500, null, null, null, null, null, null, null, null, null)).size()).as("size is capped").isEqualTo(100);
        assertThat(service.list(me("matches.run"), new Query(0, 8, null, List.of("sql"), null, null, null, null, null, null, null)).items()).extracting(Job::title).containsExactly("Data Analyst");
        assertThat(service.list(me("matches.run"), new Query(0, 8, null, null, null, null, null, "LinkedIn Jobs", null, null, null)).total()).isEqualTo(1);
        assertThat(service.list(me("matches.run"), new Query(0, 8, "bank", null, null, null, null, null, null, null, null)).items()).extracting(Job::title).containsExactly("Data Analyst");
        assertThat(service.list(me("matches.run"), new Query(0, 8, null, null, null, null, null, null, null, null, "title_asc")).items()).extracting(Job::title).containsExactly("Data Analyst", "Old Java Role", "Senior Java Developer");
        assertThat(service.list(me("matches.run"), new Query(0, 8, null, null, null, "REMOTE", null, null, null, null, null)).total()).isZero();
    }

    @Test
    void cardsAreDerivedFromRealRows() {
        Response r = service.list(me("matches.run"), all());
        assertThat(r.trendingSkills()).extracting(TrendingSkill::skill).first().isEqualTo("Java");
        assertThat(r.trendingSkills().get(0).openings()).isEqualTo(2);
        assertThat(r.trendingSkills().get(0).barPct()).isEqualTo(100);
        assertThat(r.trendingSkills().get(0).rank()).isEqualTo(1);
        assertThat(r.topClients().get(0).name()).isEqualTo("TechCorp");
        assertThat(r.topClients().get(0).openings()).isEqualTo(2);
        assertThat(r.topClients().get(0).topSkills()).contains("Java");
        assertThat(r.streams()).extracting(Stream::name).containsExactly("TechCorp", "Global Bank");
        assertThat(r.streams().get(0).subtitle()).isEqualTo("Technology");
        assertThat(r.streams().get(1).subtitle()).isEqualTo("All Openings");
        assertThat(r.streams().get(0).newThisWeek()).isEqualTo(1);
        assertThat(r.alerts()).extracting(Alert::text).contains("TechCorp posted 1 new role", "Global Bank posted 1 new role");
        assertThat(r.facets().sources()).contains("LinkedIn Jobs", "Client Portal");
        assertThat(r.facets().skills()).contains("Java", "SQL");
    }

    @Test
    void anEmptyOrganizationHasEmptyStatesAndNoInventedNumbers() {
        when(requirements.findByOrgId(ORG)).thenReturn(List.of());
        when(accounts.findByOrgId(ORG)).thenReturn(List.of());
        when(reqSkills.findByOrgId(ORG)).thenReturn(List.of());
        when(metas.findByOrgId(ORG)).thenReturn(List.of());
        when(matches.findByOrgIdAndScoreGreaterThanEqual(ORG, 90)).thenReturn(List.of());
        when(matches.findByOrgIdAndStatus(ORG, "ASSIGNED")).thenReturn(List.of());
        Response r = service.list(me("matches.run"), all());
        assertThat(r.items()).isEmpty();
        assertThat(r.total()).isZero();
        assertThat(r.trendingSkills()).isEmpty();
        assertThat(r.topClients()).isEmpty();
        assertThat(r.alerts()).isEmpty();
        assertThat(r.savedSearches()).isEmpty();
        assertThat(r.streams()).isEmpty();
        assertThat(r.kpis().newToday().value()).isZero();
        assertThat(r.kpis().newToday().deltaPct()).isNull();
        assertThat(r.kpis().highMatch().deltaPct()).isNull();
        assertThat(r.kpis().assigned().deltaPct()).isNull();
        assertThat(r.kpis().savedSearches().deltaPct()).isNull();
    }

    @Test
    void aCallerWithoutThePermissionGetsTheGeneric404BeforeAnyRead() {
        when(scope.resolve(any(), eq("matches.run"))).thenThrow(new OrgNotFoundException());
        assertThatThrownBy(() -> service.list(me(), all())).isInstanceOf(OrgNotFoundException.class);
        assertThatThrownBy(() -> service.detail(me(), 10L)).isInstanceOf(OrgNotFoundException.class);
        verify(requirements, never()).findByOrgId(any());
    }

    @Test
    void savedSearchesCountNewJobsSinceTheyWereLastSeen() {
        MktSavedSearch s = new MktSavedSearch();
        s.setId(5L);
        s.setOrgId(ORG);
        s.setOwnerMemberId(ME);
        s.setName("Java Developers");
        s.setCriteria("{\"skills\":[\"Java\"]}");
        s.setCreatedAt(NOW.minusSeconds(40 * 86_400L));
        s.setLastSeenAt(NOW.minusSeconds(86_400L));
        when(searches.findByOrgIdAndOwnerMemberIdOrderByCreatedAtDesc(ORG, ME)).thenReturn(List.of(s));
        Response r = service.list(me("matches.run"), all());
        assertThat(r.savedSearches()).hasSize(1);
        assertThat(r.savedSearches().get(0).newCount()).as("only job 10 matches and is newer than last seen").isEqualTo(1);
        assertThat(r.savedSearches().get(0).criteria().skills()).containsExactly("Java");
        assertThat(r.kpis().savedSearches().value()).isEqualTo(1);
        assertThat(r.kpis().savedSearches().deltaPct()).as("created 40 days ago, so one a month ago too").isEqualTo(0.0);
        assertThat(r.alerts()).extracting(Alert::text).contains("1 new role matches your saved search \"Java Developers\"");
    }

    @Test
    void savedSearchesOfAnotherMemberAreNeverRead() {
        service.list(me("matches.run"), all());
        verify(searches).findByOrgIdAndOwnerMemberIdOrderByCreatedAtDesc(ORG, ME);
        verify(searches, never()).countByOrgId(any());
    }

    // ---------------------------------------------------------------- detail / candidates

    @Test
    void detailListsOnlyVisibleMatchesAndAnUnknownJobIs404() {
        when(matches.findByOrgIdAndRequirementIdOrderByScoreDesc(ORG, 10L)).thenReturn(List.of(match(1, 10, 101, 99, "SUGGESTED", null), match(2, 10, 100, 95, "SUGGESTED", null)));
        Detail d = service.detail(me("matches.run"), 10L);
        assertThat(d.matches()).extracting(MatchRow::name).containsExactly("Alex Morgan");
        assertThatThrownBy(() -> service.detail(me("matches.run"), 999L)).isInstanceOf(OrgNotFoundException.class);
    }

    @Test
    void candidatesAreTheCallersActiveConsultantsBestMatchFirst() {
        when(scope.resolve(any(), eq("opportunities.manage"))).thenReturn(everyone);
        ConsultantProfile extra = person(103, "Zed Quinn", "ACTIVE");
        when(consultants.findByOrgId(ORG)).thenReturn(List.of(person(100, "Alex Morgan", "ACTIVE"), person(101, "Priya Sharma", "ACTIVE"), person(102, "Gone Person", "INACTIVE"), extra));
        when(matches.findByOrgIdAndRequirementIdOrderByScoreDesc(ORG, 10L)).thenReturn(List.of(match(1, 10, 101, 99, "SUGGESTED", null)));
        assertThat(service.candidates(me("opportunities.manage"), 10L, null)).extracting(Candidate::name).containsExactly("Priya Sharma", "Alex Morgan", "Zed Quinn");
        assertThat(service.candidates(me("opportunities.manage"), 10L, "zed")).extracting(Candidate::name).containsExactly("Zed Quinn");
    }

    @Test
    void candidatesNeverIncludeConsultantsOutsideTheScope() {
        assertThat(service.candidates(me("opportunities.manage"), 10L, null)).extracting(Candidate::consultantId).containsExactly(100L);
    }

    // ---------------------------------------------------------------- assign

    @Test
    void assignCreatesAnAssignedMatchRecordAndNothingElse() {
        when(matches.findByOrgIdAndRequirementIdAndConsultantId(ORG, 10L, 100L)).thenReturn(Optional.empty());
        when(consSkills.findByOrgIdAndConsultantIdIn(eq(ORG), any())).thenReturn(List.of(skillOf("Java")));
        when(matches.save(any())).thenAnswer(i -> {
            RequirementMatch m = i.getArgument(0);
            m.setId(77L);
            return m;
        });
        AssignResult r = service.assign(me("opportunities.manage"), 10L, 100L);
        assertThat(r.created()).isTrue();
        assertThat(r.status()).isEqualTo("ASSIGNED");
        assertThat(r.matchId()).isEqualTo(77L);
        assertThat(r.score()).as("1 of the job's 2 skills (Java, AWS)").isEqualTo(50);
        org.mockito.ArgumentCaptor<RequirementMatch> saved = org.mockito.ArgumentCaptor.forClass(RequirementMatch.class);
        verify(matches).save(saved.capture());
        assertThat(saved.getValue().getAssignedByMemberId()).isEqualTo(ME);
        assertThat(saved.getValue().getAssignedAt()).isEqualTo(NOW);
        assertThat(saved.getValue().getSource()).isEqualTo("MANUAL");
        verify(audit).record(any(OrgMembership.class), eq("MKT_JOB_ASSIGN"), eq("REQUIREMENT"), isNull(), eq("10"), anyString());
    }

    private static ConsultantSkill skillOf(String name) {
        ConsultantSkill s = new ConsultantSkill();
        s.setSkill(name);
        return s;
    }

    @Test
    void assigningAConsultantOutsideTheCallersScopeIs404AndWritesNothing() {
        assertThatThrownBy(() -> service.assign(me("opportunities.manage"), 10L, 101L)).isInstanceOf(OrgNotFoundException.class);
        verify(matches, never()).save(any());
        verify(audit, never()).record(any(OrgMembership.class), anyString(), anyString(), any(), any(), any());
    }

    @Test
    void assignNeedsOpportunitiesManage() {
        when(scope.resolve(any(), eq("opportunities.manage"))).thenThrow(new OrgNotFoundException());
        assertThatThrownBy(() -> service.assign(me("matches.run"), 10L, 100L)).isInstanceOf(OrgNotFoundException.class);
        verify(matches, never()).save(any());
    }

    @Test
    void assignIsIdempotentAndRevivesADismissedMatch() {
        RequirementMatch already = match(5, 10, 100, 90, "ASSIGNED", NOW.minusSeconds(100));
        when(matches.findByOrgIdAndRequirementIdAndConsultantId(ORG, 10L, 100L)).thenReturn(Optional.of(already));
        AssignResult again = service.assign(me("opportunities.manage"), 10L, 100L);
        assertThat(again.created()).isFalse();
        assertThat(again.matchId()).isEqualTo(5L);
        verify(matches, never()).save(any());

        RequirementMatch dismissed = match(6, 11, 100, 70, "DISMISSED", null);
        when(matches.findByOrgIdAndRequirementIdAndConsultantId(ORG, 11L, 100L)).thenReturn(Optional.of(dismissed));
        when(matches.save(any())).thenAnswer(i -> i.getArgument(0));
        AssignResult revived = service.assign(me("opportunities.manage"), 11L, 100L);
        assertThat(revived.created()).isFalse();
        assertThat(revived.status()).isEqualTo("ASSIGNED");
        assertThat(dismissed.getAssignedByMemberId()).isEqualTo(ME);
    }

    @Test
    void assigningToAJobThatIsNotOpenIs409AndAMissingJobOrConsultantIs404() {
        assertThatThrownBy(() -> service.assign(me("opportunities.manage"), 13L, 100L)).isInstanceOfSatisfying(OrgException.class, e -> assertThat(e.getStatus()).isEqualTo(409));
        assertThatThrownBy(() -> service.assign(me("opportunities.manage"), 999L, 100L)).isInstanceOf(OrgNotFoundException.class);
        assertThatThrownBy(() -> service.assign(me("opportunities.manage"), 10L, null)).isInstanceOfSatisfying(OrgException.class, e -> assertThat(e.getStatus()).isEqualTo(422));
        verify(matches, never()).save(any());
    }

    // ---------------------------------------------------------------- saved searches

    private SavedSearchRequest req(String name, Criteria c) {
        return new SavedSearchRequest(name, c);
    }

    private static Criteria skills(String... s) {
        return new Criteria(null, List.of(s), "NY", null, null, null, null, null);
    }

    @Test
    void savingASearchStoresTheCleanedCriteriaForTheCaller() {
        when(searches.save(any())).thenAnswer(i -> {
            MktSavedSearch s = i.getArgument(0);
            s.setId(55L);
            return s;
        });
        SavedSearch s = service.createSavedSearch(me("matches.run"), req("  Java East  ", new Criteria("  ", List.of("Java", " ", "Java", "AWS"), " NY ", "remote", null, null, -5, 99999)));
        assertThat(s.id()).isEqualTo(55L);
        assertThat(s.name()).isEqualTo("Java East");
        assertThat(s.criteria().skills()).containsExactly("Java", "AWS");
        assertThat(s.criteria().location()).isEqualTo("NY");
        assertThat(s.criteria().workType()).isEqualTo("REMOTE");
        assertThat(s.criteria().q()).isNull();
        assertThat(s.criteria().rateMin()).isNull();
        assertThat(s.criteria().rateMax()).isNull();
        org.mockito.ArgumentCaptor<MktSavedSearch> saved = org.mockito.ArgumentCaptor.forClass(MktSavedSearch.class);
        verify(searches).save(saved.capture());
        assertThat(saved.getValue().getOwnerMemberId()).isEqualTo(ME);
        assertThat(saved.getValue().getOrgId()).isEqualTo(ORG);
        assertThat(saved.getValue().getLastSeenAt()).isEqualTo(NOW);
    }

    @Test
    void aSavedSearchIsRefusedWhenItsNameIsBlankTooLongEmptyOrPersonalDataOrOverTheLimit() {
        assertThatThrownBy(() -> service.createSavedSearch(me("matches.run"), req(" ", skills("Java")))).isInstanceOfSatisfying(OrgException.class, e -> assertThat(e.getStatus()).isEqualTo(422));
        assertThatThrownBy(() -> service.createSavedSearch(me("matches.run"), req("x".repeat(81), skills("Java")))).isInstanceOf(OrgException.class);
        assertThatThrownBy(() -> service.createSavedSearch(me("matches.run"), req("Empty", new Criteria(null, List.of(), null, null, null, null, null, null)))).isInstanceOf(OrgException.class);
        assertThatThrownBy(() -> service.createSavedSearch(me("matches.run"), req("SSN 123-45-6789", skills("Java")))).isInstanceOf(SensitiveContentException.class);
        when(searches.countByOrgIdAndOwnerMemberId(ORG, ME)).thenReturn(50L);
        assertThatThrownBy(() -> service.createSavedSearch(me("matches.run"), req("Over", skills("Java")))).isInstanceOfSatisfying(OrgException.class, e -> assertThat(e.getCode()).isEqualTo("ORG_LIMIT_REACHED"));
        verify(searches, never()).save(any());
    }

    @Test
    void markSeenAndDeleteOnlyTouchTheCallersOwnSearch() {
        MktSavedSearch mine = new MktSavedSearch();
        mine.setId(5L);
        when(searches.findByOrgIdAndOwnerMemberIdAndId(ORG, ME, 5L)).thenReturn(Optional.of(mine));
        when(searches.findByOrgIdAndOwnerMemberIdAndId(ORG, ME, 6L)).thenReturn(Optional.empty());
        service.markSeen(me("matches.run"), 5L);
        assertThat(mine.getLastSeenAt()).isEqualTo(NOW);
        assertThatThrownBy(() -> service.markSeen(me("matches.run"), 6L)).isInstanceOf(OrgNotFoundException.class);

        when(searches.deleteByOrgIdAndOwnerMemberIdAndId(ORG, ME, 5L)).thenReturn(1L);
        when(searches.deleteByOrgIdAndOwnerMemberIdAndId(ORG, ME, 6L)).thenReturn(0L);
        service.deleteSavedSearch(me("matches.run"), 5L);
        assertThatThrownBy(() -> service.deleteSavedSearch(me("matches.run"), 6L)).isInstanceOf(OrgNotFoundException.class);
    }
}
