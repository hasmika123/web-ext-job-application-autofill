package com.dossier.api.service.ent.consultant;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;

import com.dossier.api.domain.Application;
import com.dossier.api.domain.ent.mkt.MktOpportunity;
import com.dossier.api.domain.ent.mkt.MktOpportunityEvent;
import com.dossier.api.domain.ent.mkt.MktPipelineApplicationLink;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.domain.enumeration.PermissionScope;
import com.dossier.api.domain.enumeration.ShareScope;
import com.dossier.api.repository.ApplicationRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.ent.consultant.ConOpportunityRepository;
import com.dossier.api.repository.ent.consultant.ConOpportunityRow;
import com.dossier.api.repository.ent.mkt.MktOpportunityEventRepository;
import com.dossier.api.repository.ent.mkt.MktOpportunityRepository;
import com.dossier.api.repository.ent.mkt.MktPipelineApplicationLinkRepository;
import com.dossier.api.repository.ent.talent.RequirementSkillRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.service.org.DataShareService;
import com.dossier.api.service.org.OrgAuditService;
import com.dossier.api.service.org.OrgMembership;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.springframework.data.domain.Pageable;

/**
 * An in-memory world for the consultant tests: Mockito mocks answering from maps, so a test registers opportunities and applications, calls the real
 * {@link ConOpportunityService} and reads back what it wrote (rows, events, links, audit rows). {@code save} bumps the version like the database would.
 */
class ConWorld {

    static final Long ORG = 1L;
    static final Long MEMBER = 70L;
    static final Long USER = 700L;
    static final Long CONSULTANT = 10L;
    static final Long OTHER_CONSULTANT = 11L;
    static final Long MARKETER = 5L;
    static final Instant NOW = Instant.parse("2026-10-13T12:00:00Z");

    /** One opportunity with its job and its owner. */
    static final class Opp {
        MktOpportunity o = new MktOpportunity();
        Long consultantId = CONSULTANT;
        Long jobId;
        String jobStatus = "OPEN";
        String detailLevel = "MINIMAL";
        String urlKeyHash;
    }

    final OrgMembership me = new OrgMembership(ORG, MEMBER, USER, "ana", OrgRole.MEMBER, OrgMemberStatus.ACTIVE, OrgStatus.ACTIVE, List.of(), Map.of("opportunities.respond", PermissionScope.OWN));
    final ConScope scope = mock(ConScope.class);
    final ConOpportunityRepository repo = mock(ConOpportunityRepository.class);
    final MktOpportunityRepository opportunities = mock(MktOpportunityRepository.class);
    final MktOpportunityEventRepository events = mock(MktOpportunityEventRepository.class);
    final MktPipelineApplicationLinkRepository links = mock(MktPipelineApplicationLinkRepository.class);
    final RequirementSkillRepository skills = mock(RequirementSkillRepository.class);
    final OrgMemberRepository members = mock(OrgMemberRepository.class);
    final UserRepository users = mock(UserRepository.class);
    final ApplicationRepository applications = mock(ApplicationRepository.class);
    final DataShareService shares = mock(DataShareService.class);
    final LinkedApplicationProjection projection = mock(LinkedApplicationProjection.class);
    final OrgAuditService audit = mock(OrgAuditService.class);
    final Clock clock = Clock.fixed(NOW, ZoneOffset.UTC);

    final Map<Long, Opp> opps = new LinkedHashMap<>();
    final List<MktOpportunityEvent> eventLog = new ArrayList<>();
    final List<MktPipelineApplicationLink> linkStore = new ArrayList<>();
    final Map<Long, Application> apps = new LinkedHashMap<>();
    ShareScope consent = ShareScope.FULL;
    List<com.dossier.api.domain.ent.talent.RequirementSkill> skillRows = new ArrayList<>();
    final ConJobDtoFactory jobs = new ConJobDtoFactory();
    final com.dossier.api.service.ent.jobs.JobDetailCap detailCap = mock(com.dossier.api.service.ent.jobs.JobDetailCap.class);

    ConWorld() {
        wire();
    }

    ConOpportunityService service() {
        return new ConOpportunityService(scope, repo, opportunities, events, links, skills, members, users, applications, shares, projection, jobs, detailCap, audit, clock);
    }

    Opp opp(long id, String state) {
        Opp x = new Opp();
        x.jobId = 100 + id;
        x.o.setId(id);
        x.o.setOrgId(ORG);
        x.o.setMatchId(1000 + id);
        x.o.setState(state);
        x.o.setMarketerNote("Strong fit for Anika");
        x.o.setOwnerMemberId(MARKETER);
        x.urlKeyHash = "hash-" + id;
        opps.put(id, x);
        return x;
    }

    Application application(long id, long userId) {
        Application a = new Application();
        a.setId(id);
        com.dossier.api.domain.User u = new com.dossier.api.domain.User();
        u.setId(userId);
        a.setUser(u);
        apps.put(id, a);
        return a;
    }

    MktPipelineApplicationLink liveLink(long oppId, long applicationId) {
        MktPipelineApplicationLink l = new MktPipelineApplicationLink();
        l.setId(900 + oppId);
        l.setOrgId(ORG);
        l.setOpportunityId(oppId);
        l.setConsultantId(CONSULTANT);
        l.setPersonalApplicationId(applicationId);
        l.setSource("CONSULTANT");
        linkStore.add(l);
        return l;
    }

    List<String> eventKinds() {
        return eventLog.stream().map(MktOpportunityEvent::getKind).toList();
    }

    ConOpportunityRow row(Opp x) {
        MktOpportunity o = x.o;
        return new ConOpportunityRow(
            o.getId(), o.getMatchId(), x.consultantId, x.jobId, o.getState(), o.getMarketerNote(), o.getPriority(), o.getDueOn(), o.getInfoRequest(), o.getInfoAnswer(),
            o.getAppliedAt(), o.getVersion(), NOW.minusSeconds(3600), MARKETER, "Java Developer", "Acme Corp", "Austin, TX", "REMOTE", "CONTRACT", "$70-80/hr",
            "https://boards.greenhouse.io/acme/jobs/" + x.jobId, "greenhouse", String.valueOf(x.jobId), null, x.jobStatus, x.detailLevel
        );
    }

    private void wire() {
        lenient().when(scope.read(any())).thenReturn(new ConScope.View(ORG, MEMBER, USER, CONSULTANT));
        lenient().when(scope.write(any())).thenReturn(new ConScope.View(ORG, MEMBER, USER, CONSULTANT));
        lenient().when(repo.findOwned(eq(ORG), anyLong(), anyLong())).thenAnswer(i -> {
            Opp x = opps.get(i.<Long>getArgument(2));
            return x != null && x.consultantId.equals(i.<Long>getArgument(1)) ? Optional.of(x.o) : Optional.empty();
        });
        lenient().when(repo.findRow(eq(ORG), anyLong(), anyLong())).thenAnswer(i -> {
            Opp x = opps.get(i.<Long>getArgument(2));
            return x != null && x.consultantId.equals(i.<Long>getArgument(1)) ? Optional.of(row(x)) : Optional.empty();
        });
        lenient().when(repo.findRows(eq(ORG), anyLong(), anyCollection(), any(Pageable.class))).thenAnswer(i -> {
            Long cid = i.getArgument(1);
            java.util.Collection<String> states = i.getArgument(2);
            Pageable p = i.getArgument(3);
            List<ConOpportunityRow> all = opps.values().stream().filter(x -> x.consultantId.equals(cid) && states.contains(x.o.getState()))
                .sorted(Comparator.comparing((Opp x) -> x.o.getId()).reversed()).map(this::row).toList();
            int from = (int) Math.min(p.getOffset(), all.size());
            return all.subList(from, Math.min(all.size(), from + p.getPageSize()));
        });
        lenient().when(repo.countRows(eq(ORG), anyLong(), anyCollection())).thenAnswer(i -> {
            Long cid = i.getArgument(1);
            java.util.Collection<String> states = i.getArgument(2);
            return opps.values().stream().filter(x -> x.consultantId.equals(cid) && states.contains(x.o.getState())).count();
        });
        lenient().when(repo.findByUrlKeyHash(eq(ORG), anyLong(), anyString())).thenAnswer(i ->
            opps.values().stream().filter(x -> x.consultantId.equals(i.<Long>getArgument(1)) && i.<String>getArgument(2).equals(x.urlKeyHash)).map(this::row).toList()
        );
        lenient().when(repo.findByAtsAndExternalId(eq(ORG), anyLong(), anyString(), anyString())).thenAnswer(i ->
            opps.values().stream().filter(x -> x.consultantId.equals(i.<Long>getArgument(1)) && "greenhouse".equals(i.<String>getArgument(2)) && String.valueOf(x.jobId).equals(i.<String>getArgument(3))).map(this::row).toList()
        );
        lenient().when(repo.findNotIn(eq(ORG), anyLong(), anyCollection())).thenAnswer(i -> {
            Long cid = i.getArgument(1);
            java.util.Collection<String> excluded = i.getArgument(2);
            return opps.values().stream().filter(x -> x.consultantId.equals(cid) && !excluded.contains(x.o.getState())).map(this::row).toList();
        });
        lenient().when(links.findByOrgIdAndPersonalApplicationIdAndUnlinkedAtIsNull(eq(ORG), anyLong())).thenAnswer(i ->
            linkStore.stream().filter(l -> l.getUnlinkedAt() == null && l.getPersonalApplicationId().equals(i.<Long>getArgument(1))).toList()
        );
        lenient().when(events.findByOrgIdAndOpportunityIdOrderByOccurredAtDesc(eq(ORG), anyLong())).thenAnswer(i ->
            eventLog.stream().filter(e -> e.getOpportunityId().equals(i.<Long>getArgument(1))).toList()
        );
        lenient().when(repo.findLiveLinks(eq(ORG), anyLong(), anyCollection())).thenAnswer(i -> {
            java.util.Collection<Long> ids = i.getArgument(2);
            return linkStore.stream().filter(l -> l.getUnlinkedAt() == null && ids.contains(l.getOpportunityId())).toList();
        });
        lenient().when(opportunities.save(any(MktOpportunity.class))).thenAnswer(i -> {
            MktOpportunity o = i.getArgument(0);
            o.setVersion(o.getVersion() + 1);
            return o;
        });
        lenient().when(events.save(any(MktOpportunityEvent.class))).thenAnswer(i -> {
            eventLog.add(i.getArgument(0));
            return i.getArgument(0);
        });
        lenient().when(links.findByOrgIdAndOpportunityIdAndUnlinkedAtIsNull(eq(ORG), anyLong())).thenAnswer(i ->
            linkStore.stream().filter(l -> l.getUnlinkedAt() == null && l.getOpportunityId().equals(i.<Long>getArgument(1))).findFirst()
        );
        lenient().when(links.save(any(MktPipelineApplicationLink.class))).thenAnswer(i -> {
            MktPipelineApplicationLink l = i.getArgument(0);
            if (!linkStore.contains(l)) linkStore.add(l);
            return l;
        });
        lenient().when(skills.findByOrgIdAndRequirementIdIn(eq(ORG), anyCollection())).thenAnswer(i -> skillRows);
        lenient().when(applications.findOneByIdAndUserId(anyLong(), anyLong())).thenAnswer(i -> {
            Application a = apps.get(i.<Long>getArgument(0));
            return a != null && a.getUser().getId().equals(i.<Long>getArgument(1)) ? Optional.of(a) : Optional.empty();
        });
        lenient().when(shares.scopeOf(eq(ORG), eq(MEMBER))).thenAnswer(i -> consent);
        lenient().when(projection.upsert(eq(ORG), anyLong(), anyLong(), anyLong(), any(), anyLong(), any())).thenReturn(900L);
    }
}
