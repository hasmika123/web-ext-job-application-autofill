package com.dossier.api.web.rest;

import com.dossier.api.security.AuthoritiesConstants;
import com.dossier.api.service.dto.AdminAccountDTOs.AccountHealth;
import com.dossier.api.service.dto.AdminAccountDTOs.AccountModeCheck;
import com.dossier.api.service.dto.AdminAccountDTOs.MigrationReport;
import com.dossier.api.service.dto.AdminAccountDTOs.MigrationRequest;
import com.dossier.api.service.ent.EnterpriseAccountInvariants;
import com.dossier.api.service.ent.EnterpriseAccountMigrationJob;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Platform admin tools for the separate-accounts model (decision O4, docs/enterprise-v2/19 phase S10): the pre-flip check, the migration report and run, and the
 * invariant health query. {@code ROLE_ADMIN} only, counts only. These are platform routes, not organization-scoped ones, so they are not in
 * {@code OrgIsolationIT}'s coverage. Nothing here flips a flag or changes an organization's account mode.
 */
@RestController
@RequestMapping("/api/admin")
@PreAuthorize("hasAuthority(\"" + AuthoritiesConstants.ADMIN + "\")")
public class AdminAccountModeResource {

    private final EnterpriseAccountMigrationJob migration;
    private final EnterpriseAccountInvariants invariants;

    public AdminAccountModeResource(EnterpriseAccountMigrationJob migration, EnterpriseAccountInvariants invariants) {
        this.migration = migration;
        this.invariants = invariants;
    }

    /** How many live seats of the organization still point at personal accounts (zero = safe to make it SEPARATE). */
    @GetMapping("/orgs/{id}/account-mode-check")
    public AccountModeCheck check(@PathVariable("id") Long id) {
        return migration.check(id);
    }

    /** A dry run over every SHARED organization that holds seats on personal accounts. Writes nothing. */
    @GetMapping("/orgs/account-migration/report")
    public MigrationReport report() {
        return migration.dryRunAll();
    }

    /** Dry run (default) or apply for one organization; applying needs a reason and is audited (HIGH). */
    @PostMapping("/orgs/{id}/account-migration")
    public MigrationReport migrate(@PathVariable("id") Long id, @RequestBody(required = false) MigrationRequest req) {
        boolean apply = req != null && Boolean.TRUE.equals(req.apply());
        return migration.run(id, apply, req == null ? null : req.reason());
    }

    /** Every invariant of the model with its violation count. */
    @GetMapping("/enterprise-accounts/health")
    public AccountHealth health() {
        return invariants.check();
    }
}
