package com.dossier.api.service.ent.jobs;

import com.dossier.api.domain.ent.mkt.MktOpportunity;
import com.dossier.api.domain.ent.talent.ClientAccount;
import com.dossier.api.domain.ent.talent.ClientRequirement;
import com.dossier.api.domain.ent.talent.JobDataEvent;
import com.dossier.api.domain.ent.talent.RequirementMatch;
import com.dossier.api.repository.ent.mkt.MktOpportunityRow;
import com.dossier.api.repository.ent.mkt.MktOpportunityRepository;
import com.dossier.api.repository.ent.talent.ClientAccountRepository;
import com.dossier.api.repository.ent.talent.ClientRequirementRepository;
import com.dossier.api.repository.ent.talent.JobDataEventRepository;
import com.dossier.api.repository.ent.talent.RequirementMatchRepository;
import java.util.Optional;
import java.util.function.Consumer;
import java.util.function.Function;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * The single-statement writes and the fresh reads of the find-or-create helpers, each in its OWN transaction ({@code REQUIRES_NEW}).
 *
 * <p>Why: an insert that loses a race on a unique key ({@code uk_client_account_name}, {@code uk_req_url}, {@code uk_req_ext},
 * {@code uk_requirement_match_pair}, {@code uk_mkt_opportunity_match}) aborts only this small transaction, never the caller's. And the caller, whose
 * MySQL snapshot predates the winner's commit, cannot see the winner's row with a plain read, so the re-read after a conflict also runs here, in a
 * fresh transaction.
 *
 * <p>This is a separate bean because Spring applies {@code @Transactional} through the proxy: a self-call would join the caller's transaction.
 * Never call these while the outer transaction holds a lock on a row the insert references by foreign key (it would wait on itself): the callers
 * in this package insert before they touch any parent row.
 */
@Component
public class JobIdentityTx {

    private final ClientAccountRepository accounts;
    private final ClientRequirementRepository requirements;
    private final RequirementMatchRepository matches;
    private final MktOpportunityRepository opportunities;
    private final JobDataEventRepository ledger;

    public JobIdentityTx(
        ClientAccountRepository accounts,
        ClientRequirementRepository requirements,
        RequirementMatchRepository matches,
        MktOpportunityRepository opportunities,
        JobDataEventRepository ledger
    ) {
        this.accounts = accounts;
        this.requirements = requirements;
        this.matches = matches;
        this.opportunities = opportunities;
        this.ledger = ledger;
    }

    // ---- inserts: throw DataIntegrityViolationException on a lost race --------------------------------------------------------------

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public Long insertClient(ClientAccount account) {
        return accounts.saveAndFlush(account).getId();
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public Long insertRequirement(ClientRequirement requirement) {
        return requirements.saveAndFlush(requirement).getId();
    }

    /**
     * {@link #insertRequirement(ClientRequirement)} plus its ledger row in the SAME transaction: the job and the {@code CAPTURED} event commit
     * together or not at all (the job insert is a transaction of its own, so a ledger row written by the caller could be lost while the job stays).
     * {@code ledgerRow} builds the event from the saved job (it needs the new id).
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public Long insertRequirement(ClientRequirement requirement, Function<ClientRequirement, JobDataEvent> ledgerRow) {
        ClientRequirement saved = requirements.saveAndFlush(requirement);
        ledger.save(ledgerRow.apply(saved));
        return saved.getId();
    }

    /**
     * {@link #insertRequirement(ClientRequirement, Function)} that also runs {@code alsoInThisTransaction} with the saved job (the skills): whatever
     * it writes commits or rolls back with the job. May be null.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public Long insertRequirement(
        ClientRequirement requirement,
        Function<ClientRequirement, JobDataEvent> ledgerRow,
        Consumer<ClientRequirement> alsoInThisTransaction
    ) {
        ClientRequirement saved = requirements.saveAndFlush(requirement);
        if (ledgerRow != null) ledger.save(ledgerRow.apply(saved));
        if (alsoInThisTransaction != null) alsoInThisTransaction.accept(saved);
        return saved.getId();
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public Long insertMatch(RequirementMatch match) {
        return matches.saveAndFlush(match).getId();
    }

    /** {@link #insertMatch(RequirementMatch)} that also runs {@code alsoInThisTransaction} (the ASSIGNED ledger row) in the same transaction. May be null. */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public Long insertMatch(RequirementMatch match, Consumer<RequirementMatch> alsoInThisTransaction) {
        RequirementMatch saved = matches.saveAndFlush(match);
        if (alsoInThisTransaction != null) alsoInThisTransaction.accept(saved);
        return saved.getId();
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public Long insertOpportunity(MktOpportunity opportunity) {
        return opportunities.save(opportunity).getId();
    }

    /** {@link #insertOpportunity(MktOpportunity)} that also runs {@code alsoInThisTransaction} (the ASSIGNED event) in the same transaction. May be null. */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public Long insertOpportunity(MktOpportunity opportunity, Consumer<MktOpportunity> alsoInThisTransaction) {
        MktOpportunity saved = opportunities.save(opportunity);
        if (alsoInThisTransaction != null) alsoInThisTransaction.accept(saved);
        return saved.getId();
    }

    // ---- fresh reads (a new snapshot, so a row committed a moment ago is visible) -------------------------------------------------

    @Transactional(propagation = Propagation.REQUIRES_NEW, readOnly = true)
    public Optional<ClientAccount> readClient(Long orgId, String nameKey) {
        return accounts.findByOrgIdAndNameKey(orgId, nameKey);
    }

    /** A job by id in a fresh snapshot: one another transaction committed after the caller's snapshot is visible here. */
    @Transactional(propagation = Propagation.REQUIRES_NEW, readOnly = true)
    public Optional<ClientRequirement> readRequirement(Long orgId, Long id) {
        return requirements.findByOrgIdAndId(orgId, id);
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW, readOnly = true)
    public Optional<ClientRequirement> readRequirementByUrlKey(Long orgId, String urlKeyHash) {
        return requirements.findByOrgIdAndUrlKeyHash(orgId, urlKeyHash);
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW, readOnly = true)
    public Optional<ClientRequirement> readRequirementByExternalId(Long orgId, String atsPlatform, String externalJobId) {
        return requirements.findByOrgIdAndAtsPlatformAndExternalJobId(orgId, atsPlatform, externalJobId);
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW, readOnly = true)
    public Optional<Long> readMatchId(Long orgId, Long requirementId, Long consultantId) {
        return matches.findByOrgIdAndRequirementIdAndConsultantId(orgId, requirementId, consultantId).map(RequirementMatch::getId);
    }

    /** A match by id in a fresh snapshot: the one a nested transaction inserted a moment ago (the caller's own snapshot does not see it). */
    @Transactional(propagation = Propagation.REQUIRES_NEW, readOnly = true)
    public Optional<RequirementMatch> readMatch(Long orgId, Long matchId) {
        return matches.findByOrgIdAndId(orgId, matchId);
    }

    /** A board row in a fresh snapshot: a match another transaction committed after the caller's snapshot began (the one just inserted here) is visible. */
    @Transactional(propagation = Propagation.REQUIRES_NEW, readOnly = true)
    public Optional<MktOpportunityRow> readOpportunityRow(Long orgId, Long matchId) {
        return opportunities.findRow(orgId, matchId);
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW, readOnly = true)
    public Optional<Long> readOpportunityId(Long orgId, Long matchId) {
        return opportunities.findByOrgIdAndMatchId(orgId, matchId).map(MktOpportunity::getId);
    }
}
