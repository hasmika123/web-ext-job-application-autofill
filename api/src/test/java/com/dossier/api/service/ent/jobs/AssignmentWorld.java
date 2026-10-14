package com.dossier.api.service.ent.jobs;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;

import com.dossier.api.domain.ent.mkt.MktOpportunity;
import com.dossier.api.domain.ent.mkt.MktOpportunityEvent;
import com.dossier.api.domain.ent.talent.ClientRequirement;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.ent.talent.RequirementMatch;
import com.dossier.api.repository.ent.mkt.MktOpportunityEventRepository;
import com.dossier.api.repository.ent.mkt.MktOpportunityRepository;
import com.dossier.api.repository.ent.talent.ClientRequirementRepository;
import com.dossier.api.repository.ent.talent.ConsultantProfileRepository;
import com.dossier.api.repository.ent.talent.OrgResumeRepository;
import com.dossier.api.repository.ent.talent.RequirementMatchRepository;
import com.dossier.api.service.org.OrgAuditService;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;
import org.springframework.dao.DataIntegrityViolationException;

/**
 * An in-memory world for the unit tests of everything that assigns jobs: the repositories behind {@link OpportunityAssignmentService} are Mockito
 * mocks answering from maps, so a test registers jobs, consultants, matches and overlays and reads back what the service wrote. {@code raceOnMatch()} /
 * {@code raceOnOpportunity()} make the NEXT plain pair lookup miss (a snapshot older than the winner's commit), the next insert lose on the unique key and
 * the re-read find the winner's row, which is exactly the path of a concurrent request.
 */
public class AssignmentWorld {

    public final Long orgId;
    public final Clock clock;
    public final RequirementMatchRepository matches = mock(RequirementMatchRepository.class);
    public final MktOpportunityRepository opportunities = mock(MktOpportunityRepository.class);
    public final MktOpportunityEventRepository events = mock(MktOpportunityEventRepository.class);
    public final ClientRequirementRepository requirements = mock(ClientRequirementRepository.class);
    public final ConsultantProfileRepository consultants = mock(ConsultantProfileRepository.class);
    public final OrgResumeRepository resumes = mock(OrgResumeRepository.class);
    public final JobIdentityTx tx = mock(JobIdentityTx.class);
    public final OrgAuditService audit = mock(OrgAuditService.class);

    public final Map<Long, ClientRequirement> jobs = new LinkedHashMap<>();
    public final Map<Long, ConsultantProfile> people = new LinkedHashMap<>();
    public final Map<Long, RequirementMatch> matchStore = new LinkedHashMap<>();
    public final Map<Long, MktOpportunity> oppStore = new LinkedHashMap<>();
    public final Set<Long> approved = new HashSet<>();
    /** Jobs committed by a nested transaction after the caller's snapshot: a plain read in the caller misses them, only a fresh-snapshot read ({@code tx.readRequirement}) finds them. */
    public final Set<Long> invisibleToSnapshot = new HashSet<>();
    public final List<MktOpportunityEvent> eventLog = new ArrayList<>();

    private final AtomicLong ids = new AtomicLong(5000);
    private final AtomicBoolean raceMatch = new AtomicBoolean();
    private final AtomicBoolean raceOpp = new AtomicBoolean();
    private RequirementMatch matchWinner;
    private MktOpportunity oppWinner;

    public AssignmentWorld(Long orgId, Clock clock) {
        this.orgId = orgId;
        this.clock = clock;
        wire();
    }

    public OpportunityAssignmentService service() {
        return new OpportunityAssignmentService(matches, opportunities, events, requirements, consultants, resumes, tx, audit, clock);
    }

    /** The service writing its audit rows to {@code sharedAudit} (a test that already verifies one audit mock). */
    public OpportunityAssignmentService service(OrgAuditService sharedAudit) {
        return new OpportunityAssignmentService(matches, opportunities, events, requirements, consultants, resumes, tx, sharedAudit, clock);
    }

    // ---- the data ------------------------------------------------------------------------------------------------------------

    public ClientRequirement job(long id, String status, String captureSource) {
        ClientRequirement j = new ClientRequirement();
        j.setId(id);
        j.setOrgId(orgId);
        j.setStatus(status);
        j.setCaptureSource(captureSource);
        jobs.put(id, j);
        return j;
    }

    public ConsultantProfile consultant(long id, String status, String marketingStatus) {
        ConsultantProfile c = new ConsultantProfile();
        c.setId(id);
        c.setOrgId(orgId);
        c.setDisplayName("Consultant " + id);
        c.setStatus(status);
        c.setMarketingStatus(marketingStatus);
        people.put(id, c);
        return c;
    }

    public void approve(long consultantId) {
        approved.add(consultantId);
    }

    public RequirementMatch match(long id, long jobId, long consultantId, String status) {
        RequirementMatch m = new RequirementMatch();
        m.setId(id);
        m.setOrgId(orgId);
        m.setRequirementId(jobId);
        m.setConsultantId(consultantId);
        m.setScore(80);
        m.setStatus(status);
        return addMatch(m);
    }

    public RequirementMatch addMatch(RequirementMatch m) {
        matchStore.put(m.getId(), m);
        return m;
    }

    public MktOpportunity opportunity(long matchId, String state) {
        MktOpportunity o = new MktOpportunity();
        o.setId(ids.incrementAndGet());
        o.setOrgId(orgId);
        o.setMatchId(matchId);
        o.setState(state);
        oppStore.put(o.getId(), o);
        return o;
    }

    public void raceOnMatch(String statusOfWinner) {
        RequirementMatch w = new RequirementMatch();
        w.setId(ids.incrementAndGet());
        w.setOrgId(orgId);
        w.setScore(50);
        w.setStatus(statusOfWinner);
        matchWinner = w;
        raceMatch.set(true);
    }

    public void raceOnOpportunity(String stateOfWinner) {
        MktOpportunity w = new MktOpportunity();
        w.setId(ids.incrementAndGet());
        w.setOrgId(orgId);
        w.setState(stateOfWinner);
        oppWinner = w;
        raceOpp.set(true);
    }

    public List<String> eventKinds() {
        return eventLog.stream().map(MktOpportunityEvent::getKind).toList();
    }

    // ---- the mocks -------------------------------------------------------------------------------------------------------------

    private void wire() {
        lenient().when(requirements.findByOrgIdAndId(eq(orgId), anyLong())).thenAnswer(i -> {
            Long id = i.getArgument(1);
            return invisibleToSnapshot.contains(id) ? Optional.empty() : Optional.ofNullable(jobs.get(id));
        });
        lenient().when(tx.readRequirement(eq(orgId), anyLong())).thenAnswer(i -> Optional.ofNullable(jobs.get(i.<Long>getArgument(1))));
        lenient().when(consultants.findByOrgIdAndId(eq(orgId), anyLong())).thenAnswer(i -> Optional.ofNullable(people.get(i.<Long>getArgument(1))));
        lenient().when(resumes.existsByOrgIdAndConsultantIdAndApprovalStatus(eq(orgId), anyLong(), eq("APPROVED"))).thenAnswer(i -> approved.contains(i.<Long>getArgument(1)));

        lenient().when(matches.findByOrgIdAndRequirementIdAndConsultantId(eq(orgId), anyLong(), anyLong())).thenAnswer(i -> {
            if (raceMatch.get()) return Optional.empty(); // a snapshot older than the winner's commit
            return matchStore.values().stream().filter(m -> m.getRequirementId().equals(i.getArgument(1)) && m.getConsultantId().equals(i.getArgument(2))).findFirst();
        });
        lenient().when(matches.findByOrgIdAndId(eq(orgId), anyLong())).thenAnswer(i -> Optional.ofNullable(matchStore.get(i.<Long>getArgument(1))));
        lenient().when(matches.lockByOrgIdAndId(eq(orgId), anyLong())).thenAnswer(i -> Optional.ofNullable(matchStore.get(i.<Long>getArgument(1))));
        lenient().when(matches.save(any(RequirementMatch.class))).thenAnswer(i -> {
            RequirementMatch m = i.getArgument(0);
            if (m.getId() == null) m.setId(ids.incrementAndGet());
            matchStore.put(m.getId(), m);
            return m;
        });
        lenient().when(tx.insertMatch(any(RequirementMatch.class))).thenAnswer(i -> {
            RequirementMatch m = i.getArgument(0);
            if (raceMatch.getAndSet(false)) {
                matchWinner.setRequirementId(m.getRequirementId());
                matchWinner.setConsultantId(m.getConsultantId());
                matchStore.put(matchWinner.getId(), matchWinner);
                throw new DataIntegrityViolationException("uk_requirement_match_pair");
            }
            m.setId(ids.incrementAndGet());
            matchStore.put(m.getId(), m);
            return m.getId();
        });
        lenient().when(tx.readMatchId(eq(orgId), anyLong(), anyLong())).thenAnswer(i ->
            matchStore.values().stream().filter(m -> m.getRequirementId().equals(i.getArgument(1)) && m.getConsultantId().equals(i.getArgument(2))).findFirst().map(RequirementMatch::getId));

        lenient().when(opportunities.findByOrgIdAndMatchId(eq(orgId), anyLong())).thenAnswer(i -> {
            if (raceOpp.get()) return Optional.empty();
            return oppStore.values().stream().filter(o -> o.getMatchId().equals(i.getArgument(1))).findFirst();
        });
        lenient().when(opportunities.lockByOrgIdAndId(eq(orgId), anyLong())).thenAnswer(i -> Optional.ofNullable(oppStore.get(i.<Long>getArgument(1))));
        lenient().when(opportunities.save(any(MktOpportunity.class))).thenAnswer(i -> {
            MktOpportunity o = i.getArgument(0);
            if (o.getId() == null) o.setId(ids.incrementAndGet());
            oppStore.put(o.getId(), o);
            return o;
        });
        lenient().when(tx.insertOpportunity(any(MktOpportunity.class))).thenAnswer(i -> {
            MktOpportunity o = i.getArgument(0);
            if (raceOpp.getAndSet(false)) {
                oppWinner.setMatchId(o.getMatchId());
                oppStore.put(oppWinner.getId(), oppWinner);
                throw new DataIntegrityViolationException("uk_mkt_opportunity_match");
            }
            o.setId(ids.incrementAndGet());
            oppStore.put(o.getId(), o);
            return o.getId();
        });
        lenient().when(tx.readOpportunityId(eq(orgId), anyLong())).thenAnswer(i ->
            oppStore.values().stream().filter(o -> o.getMatchId().equals(i.getArgument(1))).findFirst().map(MktOpportunity::getId));

        lenient().when(events.save(any(MktOpportunityEvent.class))).thenAnswer(i -> {
            MktOpportunityEvent e = i.getArgument(0);
            eventLog.add(e);
            return e;
        });
    }

    public Instant now() {
        return clock.instant();
    }
}
