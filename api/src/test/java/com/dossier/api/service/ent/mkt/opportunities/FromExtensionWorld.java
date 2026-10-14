package com.dossier.api.service.ent.mkt.opportunities;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;

import com.dossier.api.domain.ent.IdempotencyRecord;
import com.dossier.api.domain.ent.talent.ClientAccount;
import com.dossier.api.domain.ent.talent.ClientRequirement;
import com.dossier.api.domain.ent.talent.JobDataEvent;
import com.dossier.api.domain.ent.talent.RequirementSkill;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.repository.ent.IdempotencyRecordRepository;
import com.dossier.api.repository.ent.talent.ClientAccountRepository;
import com.dossier.api.repository.ent.talent.JobDataEventRepository;
import com.dossier.api.repository.ent.talent.RequirementSkillRepository;
import com.dossier.api.service.ent.IdempotencyService;
import com.dossier.api.service.ent.jobs.AssignmentWorld;
import com.dossier.api.service.ent.jobs.IdempotentCreate;
import com.dossier.api.service.ent.jobs.JobDataLedger;
import com.dossier.api.service.ent.jobs.JobIdentityService;
import com.dossier.api.service.ent.jobs.OpportunityAssignmentService;
import com.dossier.api.service.ent.mkt.MktScope;
import com.dossier.api.service.org.OrgMembership;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.Consumer;
import java.util.function.Function;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.TransactionStatus;
import org.springframework.transaction.support.SimpleTransactionStatus;

/**
 * An in-memory world for {@link MktFromExtensionService} on top of {@link AssignmentWorld}: the REAL {@code JobIdentityService},
 * {@code OpportunityAssignmentService}, {@code JobDataLedger} and {@code IdempotencyService} run over mocked repositories, with a transaction
 * manager that knows two things: rows saved to the ledger through {@code JobDataEventRepository.save} sit in {@link #pending} until the transaction
 * commits (then they move to {@link #committed}) and are dropped when it rolls back. The job insert is a transaction of its own in production
 * ({@code JobIdentityTx}, REQUIRES_NEW), so its {@code CAPTURED} row goes straight to {@link #committed}, with the job.
 */
public class FromExtensionWorld {

    public static final Long ORG = 7L;
    public static final Long ME = 70L;
    public static final Instant NOW = Instant.parse("2026-10-14T12:00:00Z");

    public final AssignmentWorld world = new AssignmentWorld(ORG, Clock.fixed(NOW, ZoneOffset.UTC));
    public final MktScope scope = mock(MktScope.class);
    public final ClientAccountRepository clients = mock(ClientAccountRepository.class);
    public final RequirementSkillRepository skills = mock(RequirementSkillRepository.class);
    public final JobDataEventRepository ledgerRepo = mock(JobDataEventRepository.class);
    public final IdempotencyRecordRepository idempotencyRecords = mock(IdempotencyRecordRepository.class);

    public final Map<Long, ClientAccount> clientStore = new LinkedHashMap<>();
    public final List<RequirementSkill> skillRows = new ArrayList<>();
    public final List<JobDataEvent> pending = new ArrayList<>();
    public final List<JobDataEvent> committed = new ArrayList<>();
    public final Map<String, IdempotencyRecord> records = new HashMap<>();
    public int commits;
    public int rollbacks;

    public final OrgMembership me = new OrgMembership(ORG, ME, 700L, "marketer", OrgRole.MARKETER, OrgMemberStatus.ACTIVE, OrgStatus.ACTIVE);
    public MktScope.View view = new MktScope.View(ORG, ME, true, Set.of());

    public final JobDataLedger ledger = new JobDataLedger(ledgerRepo, Clock.fixed(NOW, ZoneOffset.UTC));
    public final PlatformTransactionManager txManager = new PlatformTransactionManager() {
        @Override
        public TransactionStatus getTransaction(TransactionDefinition definition) {
            return new SimpleTransactionStatus(true);
        }

        @Override
        public void commit(TransactionStatus status) {
            commits++;
            committed.addAll(pending);
            pending.clear();
        }

        @Override
        public void rollback(TransactionStatus status) {
            rollbacks++;
            pending.clear();
        }
    };
    public final IdempotencyService idempotencyService = new IdempotencyService(idempotencyRecords, new ObjectMapper().registerModule(new com.fasterxml.jackson.datatype.jsr310.JavaTimeModule()), txManager);
    public final JobIdentityService identity = new JobIdentityService(clients, world.requirements, world.tx);
    public final OpportunityAssignmentService assignment = new OpportunityAssignmentService(
        world.matches, world.opportunities, world.events, world.requirements, world.consultants, world.resumes, world.tx, world.audit, world.clock, ledger
    );
    public final MktFromExtensionService service = new MktFromExtensionService(
        scope, identity, assignment, skills, ledger, new IdempotentCreate(idempotencyService), world.audit, world.clock
    );

    private final AtomicLong ids = new AtomicLong(900);

    public FromExtensionWorld() {
        lenient().when(scope.resolve(any(), eq("opportunities.manage"))).thenAnswer(i -> view);
        lenient().when(ledgerRepo.save(any(JobDataEvent.class))).thenAnswer(i -> {
            JobDataEvent e = i.getArgument(0);
            if (e.getId() == null) e.setId(ids.incrementAndGet());
            // a row saved while the match insert runs is committed with the match (its own transaction), not with the idempotency transaction
            if (world.inNewTransaction) committed.add(e);
            else pending.add(e);
            return e;
        });
        lenient().when(skills.save(any(RequirementSkill.class))).thenAnswer(i -> {
            RequirementSkill s = i.getArgument(0);
            skillRows.add(s);
            return s;
        });
        // client_account
        lenient().when(clients.findByOrgIdAndNameKey(eq(ORG), anyString())).thenAnswer(i ->
            clientStore.values().stream().filter(c -> JobIdentityService.nameKey(c.getName()).equals(i.getArgument(1))).findFirst());
        lenient().when(world.tx.insertClient(any(ClientAccount.class))).thenAnswer(i -> {
            ClientAccount a = i.getArgument(0);
            a.setId(ids.incrementAndGet());
            clientStore.put(a.getId(), a);
            return a.getId();
        });
        // client_requirement (the job): found by link hash, then by platform + external id
        lenient().when(world.requirements.findByOrgIdAndUrlKeyHash(eq(ORG), anyString())).thenAnswer(i ->
            world.jobs.values().stream().filter(j -> i.getArgument(1).equals(j.getUrlKeyHash())).findFirst());
        lenient().when(world.requirements.findByOrgIdAndAtsPlatformAndExternalJobId(eq(ORG), anyString(), anyString())).thenAnswer(i ->
            world.jobs.values().stream().filter(j -> i.getArgument(1).equals(j.getAtsPlatform()) && i.getArgument(2).equals(j.getExternalJobId())).findFirst());
        lenient().when(world.tx.insertRequirement(any(ClientRequirement.class))).thenAnswer(i -> store(i.getArgument(0)));
        lenient().when(world.tx.insertRequirement(any(ClientRequirement.class), any())).thenAnswer(i -> {
            ClientRequirement j = i.getArgument(0);
            Function<ClientRequirement, JobDataEvent> row = i.getArgument(1);
            Long id = store(j);
            JobDataEvent e = row.apply(j);
            e.setId(ids.incrementAndGet());
            committed.add(e); // the job insert is its own transaction: the job and its CAPTURED row commit together
            return id;
        });
        // the same with a callback (the job's skills): they run in the job's own transaction and so commit with the job
        lenient().when(world.tx.insertRequirement(any(ClientRequirement.class), any(), any())).thenAnswer(i -> {
            ClientRequirement j = i.getArgument(0);
            Function<ClientRequirement, JobDataEvent> row = i.getArgument(1);
            Consumer<ClientRequirement> also = i.getArgument(2);
            Long id = store(j);
            if (row != null) {
                JobDataEvent e = row.apply(j);
                e.setId(ids.incrementAndGet());
                committed.add(e);
            }
            if (also != null) also.accept(j);
            return id;
        });
        wireIdempotency();
    }

    private Long store(ClientRequirement j) {
        j.setId(ids.incrementAndGet());
        world.jobs.put(j.getId(), j);
        world.invisibleToSnapshot.add(j.getId()); // created by a REQUIRES_NEW insert: the outer transaction's snapshot predates it
        return j.getId();
    }

    /** An ACTIVE consultant (and an approved resume, so a non-extension job is assignable too). */
    public void consultant(long id) {
        world.consultant(id, "ACTIVE", "ACTIVE");
        world.approve(id);
    }

    /** The ledger rows of the given type, committed so far. */
    public List<JobDataEvent> committed(String type) {
        return committed.stream().filter(e -> e.getEventType().equals(type)).toList();
    }

    /** A request body that is valid; tests override single fields. */
    public static MktFromExtensionDTO.Request request(List<Long> consultantIds) {
        return new MktFromExtensionDTO.Request(
            "https://boards.greenhouse.io/acme/jobs/4012345", "Senior Java Engineer", "Acme Corp", "Austin, TX", "HYBRID", "Contract", "$70-80/hr", 70, 80, "HOUR",
            "4012345", "greenhouse", java.time.LocalDate.parse("2026-10-10"), List.of("Java", "Spring", "AWS"), "Strong fit: lead with the payments work. Client wants a start by Nov 1.",
            "HIGH", java.time.LocalDate.parse("2026-10-20"), consultantIds, "1.4.2"
        );
    }

    /** Copy of {@code r} with the given single change applied through {@code f}. */
    public static MktFromExtensionDTO.Request with(MktFromExtensionDTO.Request r, Function<Builder, Builder> f) {
        return f.apply(new Builder(r)).build();
    }

    /** A tiny builder: the request is a record, so tests copy it field by field. */
    public static final class Builder {
        public String jobUrl, title, company, location, workMode, employmentType, payLabel, payPeriod, externalJobId, atsPlatform, keyInfo, priority, extensionVersion;
        public Integer payMin, payMax;
        public java.time.LocalDate postedOn, dueOn;
        public List<String> skills;
        public List<Long> consultantIds;

        Builder(MktFromExtensionDTO.Request r) {
            jobUrl = r.jobUrl();
            title = r.title();
            company = r.company();
            location = r.location();
            workMode = r.workMode();
            employmentType = r.employmentType();
            payLabel = r.payLabel();
            payMin = r.payMin();
            payMax = r.payMax();
            payPeriod = r.payPeriod();
            externalJobId = r.externalJobId();
            atsPlatform = r.atsPlatform();
            postedOn = r.postedOn();
            skills = r.skills();
            keyInfo = r.keyInfo();
            priority = r.priority();
            dueOn = r.dueOn();
            consultantIds = r.consultantIds();
            extensionVersion = r.extensionVersion();
        }

        MktFromExtensionDTO.Request build() {
            return new MktFromExtensionDTO.Request(
                jobUrl, title, company, location, workMode, employmentType, payLabel, payMin, payMax, payPeriod, externalJobId, atsPlatform, postedOn, skills, keyInfo,
                priority, dueOn, consultantIds, extensionVersion
            );
        }
    }

    // ---- the idempotency ledger, in memory ---------------------------------------------------------------------------------------

    public void wireIdempotency() {
        lenient().when(idempotencyRecords.findByOrgIdAndActorLoginAndKeyHash(anyLong(), anyString(), anyString())).thenAnswer(i -> Optional.ofNullable(records.get(i.getArgument(2))));
        lenient().when(idempotencyRecords.saveAndFlush(any(IdempotencyRecord.class))).thenAnswer(i -> {
            IdempotencyRecord r = i.getArgument(0);
            records.put(r.getKeyHash(), r);
            return r;
        });
    }
}
