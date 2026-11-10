package com.dossier.api.service.ent.jobs;

import com.dossier.api.domain.ent.talent.ClientAccount;
import com.dossier.api.domain.ent.talent.ClientRequirement;
import com.dossier.api.domain.ent.talent.JobDataEvent;
import com.dossier.api.repository.ent.talent.ClientAccountRepository;
import com.dossier.api.repository.ent.talent.ClientRequirementRepository;
import com.dossier.api.service.org.OrgException;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.function.Consumer;
import java.util.function.Function;
import java.util.function.Supplier;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;

/**
 * Find-or-create for the two rows a captured job hangs on (doc 60 section 2): the client ({@code client_account}, one name per organization,
 * case-insensitive) and the job itself ({@code client_requirement}, one per URL key and one per ATS platform + external id).
 *
 * <p>Race-safe without a lock: look up, else insert in its own transaction ({@link JobIdentityTx}); an insert that loses a race on the unique key
 * throws, and the winner's row is re-read in a fresh transaction. The caller's transaction is never poisoned by the loser. Services call these
 * directly and never rely on the conflict advice alone.
 *
 * <p>The caller has already gated the request (for the marketer: {@code MktScope.resolve}); the scope only supplies the organization, so a
 * template row can never be written into another tenant.
 */
@Service
public class JobIdentityService {

    /** The row, and whether it was already there ({@code existing}) or this call created it. */
    public record Found<T>(T value, boolean existing) {}

    private final ClientAccountRepository accounts;
    private final ClientRequirementRepository requirements;
    private final JobIdentityTx tx;

    public JobIdentityService(ClientAccountRepository accounts, ClientRequirementRepository requirements, JobIdentityTx tx) {
        this.accounts = accounts;
        this.requirements = requirements;
        this.tx = tx;
    }

    /** The key of {@code uk_client_account_name}: lower-cased, trimmed. */
    public static String nameKey(String name) {
        return name == null ? "" : name.trim().toLowerCase(Locale.ROOT);
    }

    /**
     * The client named {@code name} in the scope's organization, created from {@code factory} when there is none. The factory's row gets the
     * organization and the trimmed name stamped on it.
     */
    public Found<ClientAccount> findOrCreateClient(AssignmentScope scope, String name, Supplier<ClientAccount> factory) {
        Long orgId = scope.orgId();
        String trimmed = name == null ? "" : name.trim();
        if (trimmed.isEmpty() || trimmed.length() > 200) throw OrgException.coded(400, "VALIDATION", "company: enter 1 to 200 characters", Map.of("field", "company"));
        String key = nameKey(trimmed);
        Optional<ClientAccount> found = accounts.findByOrgIdAndNameKey(orgId, key);
        if (found.isPresent()) return new Found<>(found.get(), true);
        ClientAccount fresh = factory.get();
        fresh.setOrgId(orgId);
        fresh.setName(trimmed);
        try {
            tx.insertClient(fresh);
            return new Found<>(fresh, false);
        } catch (DataIntegrityViolationException lost) {
            return new Found<>(tx.readClient(orgId, key).orElseThrow(() -> lost), true);
        }
    }

    /**
     * The job already stored for this identity (first by {@code urlKeyHash}, then by {@code atsPlatform} + {@code externalJobId}), else a new one
     * from {@code factory}. A null/blank part of the identity is skipped. The factory's row gets the organization stamped on it.
     */
    public Found<ClientRequirement> findOrCreateRequirement(
        AssignmentScope scope,
        String urlKeyHash,
        String atsPlatform,
        String externalJobId,
        Supplier<ClientRequirement> factory
    ) {
        return findOrCreateRequirement(scope, urlKeyHash, atsPlatform, externalJobId, factory, null);
    }

    /**
     * {@link #findOrCreateRequirement(AssignmentScope, String, String, String, Supplier)} that also appends a ledger row when this call creates the
     * job: {@code ledgerRow} builds it from the saved job and it is written in the job's own insert transaction, so the job and its {@code CAPTURED}
     * event are one commit. A job that already existed (found, or won by another request) gets no row from here.
     */
    public Found<ClientRequirement> findOrCreateRequirement(
        AssignmentScope scope,
        String urlKeyHash,
        String atsPlatform,
        String externalJobId,
        Supplier<ClientRequirement> factory,
        Function<ClientRequirement, JobDataEvent> ledgerRow
    ) {
        return findOrCreateRequirement(scope, urlKeyHash, atsPlatform, externalJobId, factory, ledgerRow, null);
    }

    /** The job already stored for this identity, if any: the same lookup as {@code findOrCreateRequirement} without creating anything. */
    public Optional<ClientRequirement> findRequirement(AssignmentScope scope, String urlKeyHash, String atsPlatform, String externalJobId) {
        Long orgId = scope.orgId();
        boolean byUrl = urlKeyHash != null && !urlKeyHash.isBlank();
        boolean byExt = atsPlatform != null && !atsPlatform.isBlank() && externalJobId != null && !externalJobId.isBlank();
        Optional<ClientRequirement> found = Optional.empty();
        if (byUrl) found = requirements.findByOrgIdAndUrlKeyHash(orgId, urlKeyHash);
        if (found.isEmpty() && byExt) found = requirements.findByOrgIdAndAtsPlatformAndExternalJobId(orgId, atsPlatform, externalJobId);
        return found;
    }

    /**
     * The full form: {@code alsoInThisTransaction} runs with the saved job inside the job's own insert transaction (the job's skills), so the job,
     * its {@code CAPTURED} row and its skills commit together or not at all. Not run for a job that already existed.
     */
    public Found<ClientRequirement> findOrCreateRequirement(
        AssignmentScope scope,
        String urlKeyHash,
        String atsPlatform,
        String externalJobId,
        Supplier<ClientRequirement> factory,
        Function<ClientRequirement, JobDataEvent> ledgerRow,
        Consumer<ClientRequirement> alsoInThisTransaction
    ) {
        Long orgId = scope.orgId();
        boolean byUrl = urlKeyHash != null && !urlKeyHash.isBlank();
        boolean byExt = atsPlatform != null && !atsPlatform.isBlank() && externalJobId != null && !externalJobId.isBlank();
        Optional<ClientRequirement> found = findRequirement(scope, urlKeyHash, atsPlatform, externalJobId);
        if (found.isPresent()) return new Found<>(found.get(), true);
        ClientRequirement fresh = factory.get();
        fresh.setOrgId(orgId);
        try {
            if (ledgerRow == null && alsoInThisTransaction == null) tx.insertRequirement(fresh);
            else if (alsoInThisTransaction == null) tx.insertRequirement(fresh, ledgerRow);
            else tx.insertRequirement(fresh, ledgerRow, alsoInThisTransaction);
            return new Found<>(fresh, false);
        } catch (DataIntegrityViolationException lost) {
            Optional<ClientRequirement> winner = Optional.empty();
            if (byUrl) winner = tx.readRequirementByUrlKey(orgId, urlKeyHash);
            if (winner.isEmpty() && byExt) winner = tx.readRequirementByExternalId(orgId, atsPlatform, externalJobId);
            return new Found<>(winner.orElseThrow(() -> lost), true);
        }
    }
}
