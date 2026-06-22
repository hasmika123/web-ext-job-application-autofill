package com.dossier.api.web.rest;

import com.dossier.api.config.OpenApiConfiguration;
import com.dossier.api.service.AccountDeletionService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * {@code DELETE /api/account} — self-service account + data erasure (GDPR/CCPA, 1.11).
 *
 * Separate from the generated {@link AccountResource} (which owns GET/POST /api/account)
 * so the deletion path stays hand-maintained. Authentication alone is required: a user
 * can only ever delete their own account (the service operates on the current principal).
 */
@RestController
@RequestMapping("/api/account")
@Tag(name = "account-deletion", description = "Self-service GDPR/CCPA account and data deletion.")
@SecurityRequirement(name = OpenApiConfiguration.BEARER_JWT_SCHEME)
public class AccountDeletionResource {

    private static final Logger LOG = LoggerFactory.getLogger(AccountDeletionResource.class);

    private final AccountDeletionService accountDeletionService;

    public AccountDeletionResource(AccountDeletionService accountDeletionService) {
        this.accountDeletionService = accountDeletionService;
    }

    @Operation(
        summary = "Delete my account and all my data",
        description = "Permanently erases the current user's resumes (files + rows), bio, applications, AI answers, field cache, and the user account."
    )
    @DeleteMapping("")
    public ResponseEntity<Void> deleteMyAccount() {
        LOG.debug("REST request to delete the current user's account and all data");
        accountDeletionService.deleteCurrentUserAccount();
        return ResponseEntity.noContent().build();
    }
}
