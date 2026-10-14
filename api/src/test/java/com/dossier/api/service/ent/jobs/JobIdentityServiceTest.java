package com.dossier.api.service.ent.jobs;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.ent.talent.ClientAccount;
import com.dossier.api.domain.ent.talent.ClientRequirement;
import com.dossier.api.repository.ent.talent.ClientAccountRepository;
import com.dossier.api.repository.ent.talent.ClientRequirementRepository;
import com.dossier.api.service.ent.mkt.MktScope;
import com.dossier.api.service.org.OrgException;
import java.util.Optional;
import java.util.Set;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;

/** Find-or-create of the client and the job: look up, else insert in its own transaction, and on a lost race use the winner's row. */
class JobIdentityServiceTest {

    static final Long ORG = 7L;

    ClientAccountRepository accounts = mock(ClientAccountRepository.class);
    ClientRequirementRepository requirements = mock(ClientRequirementRepository.class);
    JobIdentityTx tx = mock(JobIdentityTx.class);
    JobIdentityService service = new JobIdentityService(accounts, requirements, tx);
    AssignmentScope scope = new MktScope.View(ORG, 70L, true, Set.of());

    static ClientAccount account(long id, String name) {
        ClientAccount a = new ClientAccount();
        a.setId(id);
        a.setOrgId(ORG);
        a.setName(name);
        return a;
    }

    static ClientRequirement job(long id) {
        ClientRequirement r = new ClientRequirement();
        r.setId(id);
        r.setOrgId(ORG);
        return r;
    }

    // ---- client ----------------------------------------------------------------------------------------------------------------

    @Test
    void theNameKeyIsTheLowerCasedTrimmedName() {
        assertThat(JobIdentityService.nameKey("  Acme Corp ")).isEqualTo("acme corp");
        assertThat(JobIdentityService.nameKey("ÅNGSTRÖM")).isEqualTo("ångström");
        assertThat(JobIdentityService.nameKey(null)).isEmpty();
    }

    @Test
    void anExistingClientIsFoundCaseInsensitivelyAndNothingIsInserted() {
        when(accounts.findByOrgIdAndNameKey(ORG, "acme corp")).thenReturn(Optional.of(account(5, "Acme Corp")));
        JobIdentityService.Found<ClientAccount> f = service.findOrCreateClient(scope, "  ACME corp ", () -> account(0, "x"));
        assertThat(f.existing()).isTrue();
        assertThat(f.value().getId()).isEqualTo(5L);
        verify(tx, never()).insertClient(any());
    }

    @Test
    void aNewClientIsInsertedInItsOwnTransactionWithTheOrgAndTheTrimmedName() {
        when(accounts.findByOrgIdAndNameKey(ORG, "newco")).thenReturn(Optional.empty());
        doAnswer(i -> {
            ClientAccount a = i.getArgument(0);
            a.setId(9L);
            return 9L;
        }).when(tx).insertClient(any());
        ClientAccount template = new ClientAccount();
        template.setOrgId(999L); // a template can never move the row to another tenant
        JobIdentityService.Found<ClientAccount> f = service.findOrCreateClient(scope, " NewCo ", () -> template);
        assertThat(f.existing()).isFalse();
        assertThat(f.value().getId()).isEqualTo(9L);
        assertThat(f.value().getOrgId()).isEqualTo(ORG);
        assertThat(f.value().getName()).isEqualTo("NewCo");
    }

    @Test
    void aLostRaceOnTheClientNameUsesTheWinnersRow() {
        when(accounts.findByOrgIdAndNameKey(ORG, "newco")).thenReturn(Optional.empty());
        doThrow(new DataIntegrityViolationException("uk_client_account_name")).when(tx).insertClient(any());
        when(tx.readClient(ORG, "newco")).thenReturn(Optional.of(account(3, "NEWCO")));
        JobIdentityService.Found<ClientAccount> f = service.findOrCreateClient(scope, "NewCo", ClientAccount::new);
        assertThat(f.existing()).isTrue();
        assertThat(f.value().getId()).isEqualTo(3L);
    }

    @Test
    void aConflictWithNoWinnerIsRethrownAndABadNameIsA400() {
        when(accounts.findByOrgIdAndNameKey(ORG, "newco")).thenReturn(Optional.empty());
        doThrow(new DataIntegrityViolationException("something else")).when(tx).insertClient(any());
        when(tx.readClient(ORG, "newco")).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.findOrCreateClient(scope, "NewCo", ClientAccount::new)).isInstanceOf(DataIntegrityViolationException.class);
        for (String bad : new String[] { null, "", "   ", "x".repeat(201) }) {
            assertThatThrownBy(() -> service.findOrCreateClient(scope, bad, ClientAccount::new)).isInstanceOfSatisfying(OrgException.class, e -> assertThat(e.getCode()).isEqualTo("VALIDATION"));
        }
    }

    // ---- job -------------------------------------------------------------------------------------------------------------------

    @Test
    void anExistingJobIsFoundByUrlKeyFirstThenByAtsAndExternalId() {
        when(requirements.findByOrgIdAndUrlKeyHash(ORG, "hash")).thenReturn(Optional.of(job(1)));
        assertThat(service.findOrCreateRequirement(scope, "hash", "linkedin", "123", () -> job(0)).value().getId()).isEqualTo(1L);
        verify(requirements, never()).findByOrgIdAndAtsPlatformAndExternalJobId(any(), any(), any());

        when(requirements.findByOrgIdAndUrlKeyHash(ORG, "other")).thenReturn(Optional.empty());
        when(requirements.findByOrgIdAndAtsPlatformAndExternalJobId(ORG, "linkedin", "123")).thenReturn(Optional.of(job(2)));
        JobIdentityService.Found<ClientRequirement> f = service.findOrCreateRequirement(scope, "other", "linkedin", "123", () -> job(0));
        assertThat(f.existing()).isTrue();
        assertThat(f.value().getId()).isEqualTo(2L);
        verify(tx, never()).insertRequirement(any());
    }

    @Test
    void aNewJobIsInsertedWithTheOrg() {
        when(requirements.findByOrgIdAndUrlKeyHash(ORG, "hash")).thenReturn(Optional.empty());
        when(requirements.findByOrgIdAndAtsPlatformAndExternalJobId(ORG, "greenhouse", "9")).thenReturn(Optional.empty());
        doAnswer(i -> {
            ClientRequirement r = i.getArgument(0);
            r.setId(11L);
            return 11L;
        }).when(tx).insertRequirement(any());
        ClientRequirement template = new ClientRequirement();
        template.setOrgId(999L);
        JobIdentityService.Found<ClientRequirement> f = service.findOrCreateRequirement(scope, "hash", "greenhouse", "9", () -> template);
        assertThat(f.existing()).isFalse();
        assertThat(f.value().getId()).isEqualTo(11L);
        assertThat(f.value().getOrgId()).isEqualTo(ORG);
    }

    @Test
    void blankPartsOfTheIdentityAreSkippedNotQueried() {
        doAnswer(i -> 1L).when(tx).insertRequirement(any());
        assertThat(service.findOrCreateRequirement(scope, null, " ", null, ClientRequirement::new).existing()).isFalse();
        assertThat(service.findOrCreateRequirement(scope, "", "linkedin", "", ClientRequirement::new).existing()).isFalse();
        verify(requirements, never()).findByOrgIdAndUrlKeyHash(any(), any());
        verify(requirements, never()).findByOrgIdAndAtsPlatformAndExternalJobId(any(), any(), any());
    }

    @Test
    void aLostRaceOnTheJobReadsTheWinnerByUrlKeyThenByExternalId() {
        when(requirements.findByOrgIdAndUrlKeyHash(ORG, "hash")).thenReturn(Optional.empty());
        when(requirements.findByOrgIdAndAtsPlatformAndExternalJobId(ORG, "lever", "x1")).thenReturn(Optional.empty());
        doThrow(new DataIntegrityViolationException("uk_req_url")).when(tx).insertRequirement(any());
        when(tx.readRequirementByUrlKey(ORG, "hash")).thenReturn(Optional.of(job(21)));
        JobIdentityService.Found<ClientRequirement> byUrl = service.findOrCreateRequirement(scope, "hash", "lever", "x1", ClientRequirement::new);
        assertThat(byUrl.existing()).isTrue();
        assertThat(byUrl.value().getId()).isEqualTo(21L);

        when(tx.readRequirementByUrlKey(ORG, "hash")).thenReturn(Optional.empty());
        when(tx.readRequirementByExternalId(ORG, "lever", "x1")).thenReturn(Optional.of(job(22)));
        assertThat(service.findOrCreateRequirement(scope, "hash", "lever", "x1", ClientRequirement::new).value().getId()).isEqualTo(22L);

        when(tx.readRequirementByExternalId(ORG, "lever", "x1")).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.findOrCreateRequirement(scope, "hash", "lever", "x1", ClientRequirement::new)).isInstanceOf(DataIntegrityViolationException.class);
    }
}
