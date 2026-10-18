package com.dossier.api.service.dto;

import java.util.List;

/**
 * Wire shapes of the separate-accounts admin tools (decision O4, docs/enterprise-v2/19 phase S10). Counts and organization ids only: no address, login,
 * name, password or token ever appears here.
 */
public final class AdminAccountDTOs {

    private AdminAccountDTOs() {}

    /** The pre-flip check of one organization: how many live seats still point at personal accounts. {@code readyForSeparate} is true when none do. */
    public record AccountModeCheck(Long orgId, String accountMode, long seatsOnPersonalAccounts, long seatsOnEnterpriseAccounts, boolean readyForSeparate) {}

    /** The migration request. {@code apply} false (the default) is a dry run that writes nothing; applying needs a reason of at least 10 characters. */
    public record MigrationRequest(Boolean apply, String reason) {}

    /**
     * What a migration did (or would do) in one organization. {@code wouldCreate} / {@code wouldReuse} describe a dry run; {@code created} / {@code reused}
     * / {@code repointed} what an apply did. {@code skippedNoEmail} seats have a personal account without an address and are left alone; {@code conflicts}
     * are seats whose address already has an enterprise account that holds another live seat.
     */
    public record OrgMigration(
        Long orgId,
        String slug,
        String accountMode,
        long seatsOnPersonalAccounts,
        long wouldCreate,
        long wouldReuse,
        long skippedNoEmail,
        long conflicts,
        long created,
        long reused,
        long repointed
    ) {}

    /** One run: {@code dryRun} says whether anything was written, {@code orgs} has one entry per organization considered. */
    public record MigrationReport(boolean dryRun, int organizations, long seatsConsidered, long accountsCreated, long seatsRepointed, long personalAccountsChanged, List<OrgMigration> orgs) {}

    /** One invariant of the model and how many rows break it ({@code 0} = healthy). */
    public record Invariant(String key, String description, long violations) {}

    /** The health query: every invariant with its violation count, and whether all hold. */
    public record AccountHealth(boolean healthy, long totalViolations, List<Invariant> invariants) {}
}
