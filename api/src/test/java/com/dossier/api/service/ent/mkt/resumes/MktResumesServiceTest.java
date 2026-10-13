package com.dossier.api.service.ent.mkt.resumes;

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

import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.domain.enumeration.PermissionScope;
import com.dossier.api.domain.ent.mkt.MktResumeEvent;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.ent.talent.ConsultantSkill;
import com.dossier.api.domain.ent.talent.MarketerAssignment;
import com.dossier.api.domain.ent.talent.OrgResume;
import com.dossier.api.repository.ent.mkt.MktResumeEventRepository;
import com.dossier.api.repository.ent.mkt.MktResumeRepository;
import com.dossier.api.repository.ent.talent.MarketerAssignmentRepository;
import com.dossier.api.service.ent.OrgRoleService;
import com.dossier.api.service.ent.TenantModule;
import com.dossier.api.service.ent.TenantModules;
import com.dossier.api.service.ent.authz.AuthorizationService;
import com.dossier.api.service.ent.authz.AuthzRequest;
import com.dossier.api.service.ent.mkt.MktScope;
import com.dossier.api.service.org.OrgAuditService;
import com.dossier.api.service.org.OrgException;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

/** Scope, KPI math, filters and the write rules of the Marketing Resumes page, on in-memory fakes of the repositories (no Docker). */
class MktResumesServiceTest {

    static final Long ORG = 7L;
    static final Instant NOW = Instant.parse("2026-10-13T12:00:00Z");
    static final Long SARAH = 50L; // marketer: assigned to Alex (1) and Priya (2)
    static final Long OMAR = 51L; // marketer: backup for Priya only
    static final Long ADMIN = 60L;

    final List<OrgResume> resumeRows = new ArrayList<>();
    final List<ConsultantProfile> consultants = new ArrayList<>();
    final List<ConsultantSkill> skillRows = new ArrayList<>();
    final List<MktResumeEvent> eventRows = new ArrayList<>();
    final List<MarketerAssignment> assignmentRows = new ArrayList<>();
    final OrgAuditService audit = mock(OrgAuditService.class);
    final AuthorizationService authorization = mock(AuthorizationService.class);
    MktResumesService service;
    long nextEventId = 1000;

    @BeforeEach
    void setUp() {
        OrgRoleService roles = mock(OrgRoleService.class);
        when(roles.rolesFromData(anyLong())).thenReturn(true);
        TenantModules modules = mock(TenantModules.class);
        when(modules.isOn(any(TenantModule.class), anyLong())).thenReturn(true);
        MarketerAssignmentRepository assignments = mock(MarketerAssignmentRepository.class);
        when(assignments.findByOrgIdAndMarketerMemberId(anyLong(), anyLong())).thenAnswer(i -> assignmentRows.stream().filter(a -> a.getOrgId().equals(i.getArgument(0)) && i.getArgument(1).equals(a.getMarketerMemberId())).toList());
        when(assignments.findByOrgIdAndBackupMemberId(anyLong(), anyLong())).thenAnswer(i -> assignmentRows.stream().filter(a -> a.getOrgId().equals(i.getArgument(0)) && i.getArgument(1).equals(a.getBackupMemberId())).toList());
        MktScope scope = new MktScope(roles, modules, authorization, assignments);

        MktResumeRepository repo = mock(MktResumeRepository.class);
        when(repo.byId(anyLong(), anyLong())).thenAnswer(i -> resumeRows.stream().filter(r -> r.getOrgId().equals(i.getArgument(0)) && r.getId().equals(i.getArgument(1))).findFirst());
        when(repo.all(anyLong())).thenAnswer(i -> resumeRows.stream().filter(r -> r.getOrgId().equals(i.getArgument(0))).toList());
        when(repo.forConsultants(anyLong(), anyCollection())).thenAnswer(i -> resumeRows.stream().filter(r -> r.getOrgId().equals(i.getArgument(0)) && ((Collection<?>) i.getArgument(1)).contains(r.getConsultantId())).toList());
        when(repo.consultants(anyLong(), anyCollection())).thenAnswer(i -> consultants.stream().filter(c -> c.getOrgId().equals(i.getArgument(0)) && ((Collection<?>) i.getArgument(1)).contains(c.getId())).toList());
        when(repo.allConsultants(anyLong())).thenAnswer(i -> consultants.stream().filter(c -> c.getOrgId().equals(i.getArgument(0))).toList());
        when(repo.skills(anyLong(), anyCollection())).thenAnswer(i -> skillRows.stream().filter(s -> s.getOrgId().equals(i.getArgument(0)) && ((Collection<?>) i.getArgument(1)).contains(s.getConsultantId())).toList());
        when(repo.allSkills(anyLong())).thenAnswer(i -> skillRows.stream().filter(s -> s.getOrgId().equals(i.getArgument(0))).toList());
        when(repo.experience(anyLong(), anyLong())).thenReturn(List.of());
        when(repo.saveAndFlush(any(OrgResume.class))).thenAnswer(i -> i.getArgument(0));

        MktResumeEventRepository events = mock(MktResumeEventRepository.class);
        when(events.forResumes(anyLong(), anyCollection())).thenAnswer(i -> eventRows.stream().filter(e -> e.getOrgId().equals(i.getArgument(0)) && ((Collection<?>) i.getArgument(1)).contains(e.getResumeId())).toList());
        when(events.saveAndFlush(any(MktResumeEvent.class))).thenAnswer(i -> {
            MktResumeEvent e = i.getArgument(0);
            e.setId(nextEventId++);
            eventRows.add(e);
            return e;
        });
        service = new MktResumesService(scope, repo, events, audit, authorization, Clock.fixed(NOW, ZoneOffset.UTC));

        consultant(1L, "Alex Morgan", "Java Developer", "AVAILABLE", 92, "Java", "Spring");
        consultant(2L, "Priya Sharma", "Business Analyst", "ON_PROJECT", 88, "Agile", "SQL");
        consultant(3L, "Michael Park", "AWS Engineer", "AVAILABLE", 85, "AWS");
        assign(1L, SARAH, null);
        assign(2L, SARAH, OMAR);
        // 10: Alex, v3, approved, primary, updated 2d ago, created 100d ago
        resume(10L, 1L, "Alex Morgan - Consulting Resume", 3, "APPROVED", true, 100, 2);
        // 11: Priya, v2, pending
        resume(11L, 2L, "Priya Sharma - BA Resume", 2, "PENDING", true, 20, 4);
        // 12: Michael is NOT assigned to Sarah
        resume(12L, 3L, "Michael Park - AWS Resume", 4, "APPROVED", true, 60, 7);
        // 13: Alex's second resume, approved but flagged for update, updated 40d ago, created 50d ago
        resume(13L, 1L, "Alex Morgan - Backend Resume", 1, "APPROVED", false, 50, 40);
        event(13L, 1L, MktResumeEvent.CREATED, 50);
        event(13L, 1L, MktResumeEvent.MARKED_FOR_UPDATE, 40);
        event(10L, 1L, MktResumeEvent.CREATED, 100);
        event(10L, 1L, MktResumeEvent.UPDATED, 2);
        event(11L, 2L, MktResumeEvent.APPROVAL_REQUESTED, 4);
    }

    // ---- helpers ----

    void consultant(Long id, String name, String title, String availability, int completeness, String... skills) {
        ConsultantProfile c = new ConsultantProfile();
        c.setId(id);
        c.setOrgId(ORG);
        c.setDisplayName(name);
        c.setJobTitle(title);
        c.setAvailabilityStatus(availability);
        c.setProfileCompleteness(completeness);
        consultants.add(c);
        int n = 0;
        for (String s : skills) {
            ConsultantSkill k = new ConsultantSkill();
            k.setId(id * 100 + n);
            k.setOrgId(ORG);
            k.setConsultantId(id);
            k.setSkill(s);
            k.setPrimarySkill(n == 0);
            k.setSortOrder(n++);
            skillRows.add(k);
        }
    }

    void assign(Long consultantId, Long marketer, Long backup) {
        MarketerAssignment a = new MarketerAssignment();
        a.setOrgId(ORG);
        a.setConsultantId(consultantId);
        a.setMarketerMemberId(marketer);
        a.setBackupMemberId(backup);
        assignmentRows.add(a);
    }

    void resume(Long id, Long consultantId, String name, int version, String approval, boolean primary, int createdDaysAgo, int updatedDaysAgo) {
        OrgResume r = new OrgResume();
        r.setId(id);
        r.setOrgId(ORG);
        r.setConsultantId(consultantId);
        r.setName(name);
        r.setVersionNo(version);
        r.setApprovalStatus(approval);
        r.setPrimaryForOrg(primary);
        r.setCreatedAt(NOW.minus(Duration.ofDays(createdDaysAgo)));
        r.setUpdatedAt(NOW.minus(Duration.ofDays(updatedDaysAgo)));
        resumeRows.add(r);
    }

    void event(Long resumeId, Long consultantId, String kind, int daysAgo) {
        MktResumeEvent e = new MktResumeEvent();
        e.setId(nextEventId++);
        e.setOrgId(ORG);
        e.setResumeId(resumeId);
        e.setConsultantId(consultantId);
        e.setKind(kind);
        e.setVersionNo(1);
        e.setOccurredAt(NOW.minus(Duration.ofDays(daysAgo)));
        eventRows.add(e);
    }

    static OrgMembership marketer(Long memberId) {
        return new OrgMembership(ORG, memberId, memberId + 1000, "m" + memberId, OrgRole.MARKETER, OrgMemberStatus.ACTIVE, OrgStatus.ACTIVE, List.of(),
            Map.of("resumes.view_for", PermissionScope.ASSIGNED, "resumes.edit_for", PermissionScope.ASSIGNED));
    }

    static OrgMembership admin() {
        return new OrgMembership(ORG, ADMIN, ADMIN + 1000, "admin", OrgRole.ADMIN, OrgMemberStatus.ACTIVE, OrgStatus.ACTIVE, List.of(),
            Map.of("resumes.view_for", PermissionScope.ORG, "resumes.edit_for", PermissionScope.ORG, "resumes.approve_request", PermissionScope.ORG));
    }

    static MktResumesDto.Query all() {
        return new MktResumesDto.Query(null, null, null, null, null, null, 0, 10);
    }

    static MktResumesDto.Query withQ(String q, String skill, String status, String updated, String availability, String sort, int page, int size) {
        return new MktResumesDto.Query(q, skill, status, updated, availability, sort, page, size);
    }

    static List<Long> ids(MktResumesDto.Page p) {
        return p.items().stream().map(MktResumesDto.Row::id).toList();
    }

    MktResumesDto.Kpi kpi(MktResumesDto.Page p, String key) {
        return p.kpis().stream().filter(k -> k.key().equals(key)).findFirst().orElseThrow();
    }

    // ---- scope ----

    @Test
    void marketerSeesOnlyAssignedConsultantsResumes() {
        MktResumesDto.Page p = service.list(marketer(SARAH), all());
        assertThat(ids(p)).containsExactlyInAnyOrder(10L, 11L, 13L).doesNotContain(12L);
        assertThat(p.total()).isEqualTo(3);
        assertThat(p.items()).allMatch(r -> r.canEdit() && !r.hasFile());
        assertThat(p.canApprove()).isFalse();
    }

    @Test
    void backupMarketerSeesTheConsultantTheyBackUp() {
        assertThat(ids(service.list(marketer(OMAR), all()))).containsExactly(11L);
    }

    @Test
    void orgScopeSeesEverything() {
        MktResumesDto.Page p = service.list(admin(), all());
        assertThat(ids(p)).containsExactlyInAnyOrder(10L, 11L, 12L, 13L);
        assertThat(p.canApprove()).isTrue();
    }

    @Test
    void anUnassignedConsultantsResumeIsA404ForEveryRead() {
        OrgMembership me = marketer(SARAH);
        assertThatThrownBy(() -> service.detail(me, 12L)).isInstanceOf(OrgNotFoundException.class);
        assertThatThrownBy(() -> service.download(me, 12L)).isInstanceOf(OrgNotFoundException.class);
        assertThatThrownBy(() -> service.detail(me, 999L)).isInstanceOf(OrgNotFoundException.class);
    }

    @Test
    void aMemberWithoutThePermissionGetsTheGenericNotFound() {
        OrgMembership none = new OrgMembership(ORG, 70L, 1L, "x", OrgRole.MARKETER, OrgMemberStatus.ACTIVE, OrgStatus.ACTIVE, List.of(), Map.of());
        assertThatThrownBy(() -> service.list(none, all())).isInstanceOf(OrgNotFoundException.class);
    }

    @Test
    void anotherTenantsResumeIsNotFound() {
        resumeRows.get(0).setOrgId(99L);
        assertThatThrownBy(() -> service.detail(marketer(SARAH), 10L)).isInstanceOf(OrgNotFoundException.class);
    }

    @Test
    void emptyOrgGivesEmptyStatesAndNoDeltas() {
        resumeRows.clear();
        eventRows.clear();
        MktResumesDto.Page p = service.list(admin(), all());
        assertThat(p.items()).isEmpty();
        assertThat(p.total()).isZero();
        assertThat(p.kpis()).hasSize(4).allMatch(k -> k.value() == 0 && k.deltaPct() == null && k.sparkline().size() == 8);
        assertThat(p.activity()).isEmpty();
        assertThat(p.skills()).isEmpty();
    }

    @Test
    void marketerWithNoAssignmentsSeesNothing() {
        assertThat(service.list(marketer(88L), all()).items()).isEmpty();
    }

    // ---- KPIs ----

    @Test
    void kpisAreCountedFromRowsInScope() {
        MktResumesDto.Page p = service.list(marketer(SARAH), all());
        assertThat(kpi(p, "total").value()).isEqualTo(3);
        assertThat(kpi(p, "profilesReady").value()).isEqualTo(1); // 10 only: approved and not flagged
        assertThat(kpi(p, "needUpdates").value()).isEqualTo(1); // 13 is flagged
        assertThat(kpi(p, "approvalsPending").value()).isEqualTo(1); // 11
    }

    @Test
    void deltaComparesWithRowsThatExistedThirtyDaysAgo() {
        // visible: 10 (created 100d), 11 (20d), 13 (50d): two existed before the cut, so 3 vs 2 = +50 %
        MktResumesDto.Kpi total = kpi(service.list(marketer(SARAH), all()), "total");
        assertThat(total.deltaPct()).isEqualTo(50.0);
        // pending set = {11}, created 20 days ago: nothing existed a month ago, so no delta (never a made-up one)
        assertThat(kpi(service.list(marketer(SARAH), all()), "approvalsPending").deltaPct()).isNull();
    }

    @Test
    void sparklineIsEightWeeklyBucketsEndingAtTheCurrentCount() {
        MktResumesDto.Kpi total = kpi(service.list(marketer(SARAH), all()), "total");
        assertThat(total.sparkline()).hasSize(8);
        assertThat(total.sparkline().get(7)).isEqualTo(3L);
        assertThat(total.sparkline().get(0)).isEqualTo(2L); // 49 days ago: Alex 10 (100d) and 13 (50d) existed, Priya 11 (20d) did not
    }

    // ---- filters, sort, paging ----

    @Test
    void searchMatchesConsultantOrResumeTitle() {
        assertThat(ids(service.list(admin(), withQ("priya", null, null, null, null, null, 0, 10)))).containsExactly(11L);
        assertThat(ids(service.list(admin(), withQ("aws resume", null, null, null, null, null, 0, 10)))).containsExactly(12L);
        assertThat(ids(service.list(admin(), withQ("zzz", null, null, null, null, null, 0, 10)))).isEmpty();
    }

    @Test
    void skillFilter() {
        assertThat(ids(service.list(admin(), withQ(null, "aws", null, null, null, null, 0, 10)))).containsExactly(12L);
        assertThat(ids(service.list(admin(), withQ(null, "Java", null, null, null, "title,asc", 0, 10)))).containsExactly(13L, 10L);
    }

    @Test
    void statusFilterUsesTheDerivedChip() {
        assertThat(ids(service.list(admin(), withQ(null, null, "NEEDS_UPDATE", null, null, null, 0, 10)))).containsExactly(13L);
        assertThat(ids(service.list(admin(), withQ(null, null, "PENDING", null, null, null, 0, 10)))).containsExactly(11L);
        assertThat(ids(service.list(admin(), withQ(null, null, "approved", null, null, "modified,desc", 0, 10)))).containsExactly(10L, 12L);
        assertThatThrownBy(() -> service.list(admin(), withQ(null, null, "bogus", null, null, null, 0, 10))).isInstanceOf(OrgException.class);
    }

    @Test
    void dateUpdatedFilter() {
        assertThat(ids(service.list(admin(), withQ(null, null, null, "7d", null, null, 0, 10)))).containsExactlyInAnyOrder(10L, 11L, 12L);
        assertThat(ids(service.list(admin(), withQ(null, null, null, "30d", null, null, 0, 10)))).doesNotContain(13L);
        assertThat(ids(service.list(admin(), withQ(null, null, null, "3m", null, null, 0, 10)))).hasSize(4);
        assertThat(ids(service.list(admin(), withQ(null, null, null, "all", null, null, 0, 10)))).hasSize(4);
        assertThatThrownBy(() -> service.list(admin(), withQ(null, null, null, "1y", null, null, 0, 10))).isInstanceOf(OrgException.class);
    }

    @Test
    void availabilityFilter() {
        assertThat(ids(service.list(admin(), withQ(null, null, null, null, "ON_PROJECT", null, 0, 10)))).containsExactly(11L);
        assertThat(ids(service.list(admin(), withQ(null, null, null, null, "On Project", null, 0, 10)))).containsExactly(11L);
    }

    @Test
    void defaultSortIsLastModifiedNewestFirstAndPagingSlices() {
        assertThat(ids(service.list(admin(), all()))).containsExactly(10L, 11L, 12L, 13L);
        MktResumesDto.Page second = service.list(admin(), withQ(null, null, null, null, null, null, 1, 3));
        assertThat(ids(second)).containsExactly(13L);
        assertThat(second.total()).isEqualTo(4);
        assertThat(second.page()).isEqualTo(1);
        assertThat(second.size()).isEqualTo(3);
        assertThat(service.list(admin(), withQ(null, null, null, null, null, null, 0, 5000)).size()).isEqualTo(100); // capped
        assertThat(service.list(admin(), withQ(null, null, null, null, null, null, 9, 10)).items()).isEmpty();
    }

    @Test
    void sortByCompletenessAscending() {
        assertThat(ids(service.list(admin(), withQ(null, null, null, null, null, "completeness,asc", 0, 10)))).startsWith(12L);
    }

    @Test
    void skillOptionsAreTheScopesDistinctSkills() {
        assertThat(service.list(marketer(SARAH), all()).skills()).containsExactly("Agile", "Java", "Spring", "SQL");
    }

    @Test
    void recentActivityIsNewestFirstAndInScope() {
        MktResumesDto.Page p = service.list(marketer(SARAH), all());
        assertThat(p.activity()).isNotEmpty().allMatch(a -> !a.consultantName().equals("Michael Park"));
        assertThat(p.activity().get(0).text()).isEqualTo("updated resume to v1");
        assertThat(p.activity().get(0).consultantName()).isEqualTo("Alex Morgan");
    }

    @Test
    void detailIsAReadOnlyPreviewWithPrimarySkillFirst() {
        MktResumesDto.Detail d = service.detail(marketer(SARAH), 10L);
        assertThat(d.skills().get(0)).isEqualTo(new MktResumesDto.Skill("Java", true));
        assertThat(d.row().approval()).isEqualTo("APPROVED");
        assertThat(d.row().hasFile()).isFalse();
    }

    @Test
    void downloadIsAnHonest404WithAMessage() {
        assertThatThrownBy(() -> service.download(marketer(SARAH), 10L))
            .isInstanceOfSatisfying(OrgException.class, e -> {
                assertThat(e.getStatus()).isEqualTo(404);
                assertThat(e.getCode()).isEqualTo("NO_FILE_STORED");
                assertThat(e.getMessage()).contains("No file is stored");
            });
    }

    // ---- writes ----

    @Test
    void editMakesANewVersionGoesBackToPendingAndWritesEventAndAudit() {
        MktResumesDto.Detail d = service.edit(marketer(SARAH), 10L, Map.of("headline", "Senior Java engineer", "title", "Alex Morgan - Java Resume"));
        assertThat(d.row().version()).isEqualTo(4);
        assertThat(d.row().title()).isEqualTo("Alex Morgan - Java Resume");
        assertThat(d.headline()).isEqualTo("Senior Java engineer");
        assertThat(d.row().approval()).isEqualTo("PENDING"); // a marketer's edit is never approved by the marketer
        assertThat(resumeRows.get(0).getApprovedAt()).isNull();
        assertThat(eventRows).anyMatch(e -> e.getKind().equals("UPDATED") && e.getResumeId().equals(10L) && SARAH.equals(e.getActorMemberId()) && e.getVersionNo() == 4);
        verify(audit).record(any(OrgMembership.class), eq("MARKETER_RESUME_EDIT"), eq(OrgAuditService.TARGET_RESUME), any(), eq("10"), anyString());
        ArgumentCaptor<AuthzRequest> auth = ArgumentCaptor.forClass(AuthzRequest.class);
        verify(authorization, org.mockito.Mockito.atLeastOnce()).require(auth.capture());
        assertThat(auth.getAllValues()).anyMatch(a -> a.operation() == com.dossier.api.service.ent.authz.AuthzOperation.WRITE);
    }

    @Test
    void editThatChangesNothingWritesNothing() {
        int before = eventRows.size();
        MktResumesDto.Detail d = service.edit(marketer(SARAH), 10L, Map.of("title", "Alex Morgan - Consulting Resume"));
        assertThat(d.row().version()).isEqualTo(3);
        assertThat(eventRows).hasSize(before);
        verify(audit, never()).record(any(OrgMembership.class), anyString(), anyString(), any(), any(), any());
    }

    @Test
    void editOfAnUnassignedConsultantsResumeIs404AndWritesNothing() {
        int before = eventRows.size();
        assertThatThrownBy(() -> service.edit(marketer(SARAH), 12L, Map.of("headline", "x"))).isInstanceOf(OrgNotFoundException.class);
        assertThat(resumeRows.get(2).getVersionNo()).isEqualTo(4);
        assertThat(eventRows).hasSize(before);
    }

    @Test
    void editValidation() {
        OrgMembership me = marketer(SARAH);
        assertThatThrownBy(() -> service.edit(me, 10L, Map.of())).isInstanceOf(OrgException.class);
        assertThatThrownBy(() -> service.edit(me, 10L, Map.of("approvalStatus", "APPROVED"))).isInstanceOf(OrgException.class); // can't self-approve through PATCH
        assertThatThrownBy(() -> service.edit(me, 10L, Map.of("title", "  "))).isInstanceOf(OrgException.class);
        assertThatThrownBy(() -> service.edit(me, 10L, Map.of("headline", "x".repeat(121)))).isInstanceOf(OrgException.class);
        assertThatThrownBy(() -> service.edit(me, 10L, Map.of("summary", "<script>"))).isInstanceOf(OrgException.class);
        assertThat(resumeRows.get(0).getVersionNo()).isEqualTo(3);
    }

    @Test
    void aNullHeadlineClearsItButATitleCannotBeNull() {
        resumeRows.get(0).setHeadline("old");
        java.util.HashMap<String, Object> clear = new java.util.HashMap<>();
        clear.put("headline", null);
        assertThat(service.edit(marketer(SARAH), 10L, clear).headline()).isNull();
        java.util.HashMap<String, Object> bad = new java.util.HashMap<>();
        bad.put("title", null);
        assertThatThrownBy(() -> service.edit(marketer(SARAH), 10L, bad)).isInstanceOf(OrgException.class);
    }

    @Test
    void requestApprovalSetsPendingAndNeverApproves() {
        MktResumesDto.Detail d = service.requestApproval(marketer(SARAH), 10L);
        assertThat(d.row().approval()).isEqualTo("PENDING");
        assertThat(resumeRows.get(0).getApprovedByMemberId()).isNull();
        assertThat(eventRows).anyMatch(e -> e.getKind().equals("APPROVAL_REQUESTED") && e.getResumeId().equals(10L));
        verify(audit).record(any(OrgMembership.class), eq("MARKETER_APPROVAL_REQUEST"), anyString(), any(), eq("10"), anyString());
        // asking again changes nothing
        int events = eventRows.size();
        service.requestApproval(marketer(SARAH), 10L);
        assertThat(eventRows).hasSize(events);
    }

    @Test
    void markNeedsUpdateAndTheNextEditClearsIt() {
        assertThat(service.markNeedsUpdate(marketer(SARAH), 10L, "refresh the skills section").row().approval()).isEqualTo("NEEDS_UPDATE");
        assertThat(service.edit(marketer(SARAH), 10L, Map.of("summary", "Refreshed summary")).row().approval()).isEqualTo("PENDING");
    }

    @Test
    void aMarketerCannotApproveEvenWithTheRowInScope() {
        assertThatThrownBy(() -> service.approve(marketer(SARAH), 11L)).isInstanceOf(OrgNotFoundException.class);
        assertThat(resumeRows.get(1).getApprovalStatus()).isEqualTo("PENDING");
    }

    @Test
    void theAdminApprovesAPendingRequest() {
        MktResumesDto.Detail d = service.approve(admin(), 11L);
        assertThat(d.row().approval()).isEqualTo("APPROVED");
        assertThat(resumeRows.get(1).getApprovedByMemberId()).isEqualTo(ADMIN);
        assertThat(eventRows).anyMatch(e -> e.getKind().equals("APPROVED") && e.getResumeId().equals(11L));
        ArgumentCaptor<String> action = ArgumentCaptor.forClass(String.class);
        verify(audit).record(any(OrgMembership.class), action.capture(), anyString(), any(), eq("11"), anyString());
        assertThat(action.getValue()).isEqualTo("RESUME_APPROVE");
    }

    @Test
    void nobodyApprovesTheirOwnRequestOrEdit() {
        eventRows.stream().filter(e -> e.getResumeId().equals(11L)).forEach(e -> e.setActorMemberId(ADMIN));
        assertThatThrownBy(() -> service.approve(admin(), 11L)).isInstanceOfSatisfying(OrgException.class, e -> {
            assertThat(e.getStatus()).isEqualTo(409);
            assertThat(e.getCode()).isEqualTo("SELF_APPROVAL");
        });
        assertThat(resumeRows.get(1).getApprovalStatus()).isEqualTo("PENDING");
    }

    @Test
    void approvingSomethingNotPendingIsAConflict() {
        assertThatThrownBy(() -> service.approve(admin(), 10L)).isInstanceOfSatisfying(OrgException.class, e -> assertThat(e.getCode()).isEqualTo("NOT_PENDING"));
    }

}
