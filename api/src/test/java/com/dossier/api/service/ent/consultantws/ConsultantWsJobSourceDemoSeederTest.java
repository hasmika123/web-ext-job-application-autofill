package com.dossier.api.service.ent.consultantws;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.ent.consultantws.CwsJobSource;
import com.dossier.api.domain.ent.talent.ClientRequirement;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.ent.consultantws.CwsJobSourceRepository;
import com.dossier.api.repository.ent.talent.ClientAccountRepository;
import com.dossier.api.repository.ent.talent.ClientRequirementRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.ent.EnterpriseDemoSeeder;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

/** The demo job-link rows: sample stand-in links for seeded openings, never for a real posting saved with its own link. */
class ConsultantWsJobSourceDemoSeederTest {

    private final OrganizationRepository orgs = mock(OrganizationRepository.class);
    private final ClientRequirementRepository requirements = mock(ClientRequirementRepository.class);
    private final CwsJobSourceRepository sources = mock(CwsJobSourceRepository.class);
    private final ClientAccountRepository clients = mock(ClientAccountRepository.class);
    private final ConsultantWsJobSourceDemoSeeder seeder = new ConsultantWsJobSourceDemoSeeder(orgs, requirements, sources, clients, "http://jobs.localhost:3399/greenhouse");

    private static ClientRequirement job(long id, String url) {
        ClientRequirement r = new ClientRequirement();
        r.setId(id);
        r.setOrgId(1L);
        r.setTitle("Data Platform Engineer");
        r.setStatus("OPEN");
        r.setJobUrl(url);
        return r;
    }

    private void org(List<ClientRequirement> open, List<CwsJobSource> existing) {
        Organization o = new Organization();
        o.setId(1L);
        when(orgs.findBySlug(anyString())).thenReturn(Optional.empty());
        when(orgs.findBySlug(EnterpriseDemoSeeder.ACME_SLUG)).thenReturn(Optional.of(o));
        when(requirements.findByOrgIdAndStatusOrderByPostedAtDesc(anyLong(), anyString())).thenReturn(open);
        when(sources.findByOrgIdAndRequirementIdIn(anyLong(), anyCollection())).thenReturn(existing);
    }

    @Test
    void aSeededOpeningGetsAStandInLinkButARealPostingDoesNot() {
        org(List.of(job(7, null), job(100, "https://job-boards.greenhouse.io/figma/jobs/6201407004")), List.of());

        assertThat(seeder.seed()).isEqualTo(1);

        ArgumentCaptor<CwsJobSource> saved = ArgumentCaptor.forClass(CwsJobSource.class);
        verify(sources).save(saved.capture());
        assertThat(saved.getValue().getRequirementId()).isEqualTo(7L);
        assertThat(saved.getValue().getSourceUrl()).startsWith("http://jobs.localhost:3399/greenhouse/");
    }

    @Test
    void aStandInLinkGivenEarlierToARealPostingIsRemoved() {
        CwsJobSource stale = new CwsJobSource();
        stale.setRequirementId(100L);
        stale.setSourceUrl("http://jobs.localhost:3399/greenhouse/figma/100?t=x");
        stale.setSampleData(true);
        org(List.of(job(100, "https://job-boards.greenhouse.io/figma/jobs/6201407004")), List.of(stale));

        assertThat(seeder.seed()).isEqualTo(1);

        verify(sources).delete(stale);
        verify(sources, never()).save(any());
    }

    @Test
    void aMarketersOwnLinkRowIsNeverTouched() {
        CwsJobSource real = new CwsJobSource();
        real.setRequirementId(100L);
        real.setSourceUrl("https://jobs.lever.co/rover/abc");
        real.setSampleData(false);
        org(List.of(job(100, "https://jobs.lever.co/rover/abc")), List.of(real));

        assertThat(seeder.seed()).isZero();

        verify(sources, never()).delete(any());
        verify(sources, never()).save(any());
    }
}
