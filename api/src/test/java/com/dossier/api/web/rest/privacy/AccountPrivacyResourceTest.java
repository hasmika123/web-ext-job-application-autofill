package com.dossier.api.web.rest.privacy;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.User;
import com.dossier.api.service.AccountDeletionService;
import com.dossier.api.service.DemoGuard;
import com.dossier.api.service.TrackerUsers;
import com.dossier.api.service.privacy.AccountDeletionRequestService;
import com.dossier.api.service.privacy.DataExportService;
import com.dossier.api.service.privacy.TermsAcceptanceService;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

/** An enterprise account is employer-managed (decision O4, S8): the self-service deletion request is the generic 404 for it, never a way to erase it. */
class AccountPrivacyResourceTest {

    private final TrackerUsers current = mock(TrackerUsers.class);
    private final AccountDeletionRequestService requests = mock(AccountDeletionRequestService.class);
    private final AccountDeletionService deletion = mock(AccountDeletionService.class);
    private final AccountPrivacyResource resource = new AccountPrivacyResource(current, mock(DemoGuard.class), requests, deletion, mock(DataExportService.class), mock(TermsAcceptanceService.class));

    private void signedInAsEnterpriseAccount() {
        User enterprise = new User();
        enterprise.setId(42L);
        enterprise.setOrgId(7L);
        when(current.current()).thenReturn(enterprise);
    }

    @Test
    void anEnterpriseAccountCannotRequestStatusOrCancelItsOwnDeletion() {
        signedInAsEnterpriseAccount();
        assertThatThrownBy(resource::requestDeletion).isInstanceOf(ResponseStatusException.class).hasMessageContaining("404");
        assertThatThrownBy(resource::deletionStatus).isInstanceOf(ResponseStatusException.class).hasMessageContaining("404");
        assertThatThrownBy(resource::cancelDeletion).isInstanceOf(ResponseStatusException.class).hasMessageContaining("404");
        verifyNoInteractions(requests, deletion);
    }
}
