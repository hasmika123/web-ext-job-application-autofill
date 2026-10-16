package com.dossier.api.service.ent.consultantws;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.ent.consultantws.CwsJobSource;
import com.dossier.api.domain.ent.talent.ClientRequirement;
import com.dossier.api.repository.ent.consultantws.CwsJobSourceRepository;
import com.dossier.api.repository.ent.talent.ClientRequirementRepository;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** The link a consultant page shows for a job: the marketer's source row first, the requirement's own {@code job_url} (an extension capture) when there is none. */
class ConsultantWsJobSourceReaderTest {

    static final Long ORG = 7L;
    CwsJobSourceRepository sources = mock(CwsJobSourceRepository.class);
    ClientRequirementRepository requirements = mock(ClientRequirementRepository.class);
    ConsultantWsJobSourceReader reader;

    @BeforeEach
    void wire() {
        reader = new ConsultantWsJobSourceReader(sources, requirements);
    }

    private static ClientRequirement job(long id, long org, String url) {
        ClientRequirement r = new ClientRequirement();
        r.setId(id);
        r.setOrgId(org);
        r.setJobUrl(url);
        return r;
    }

    private static CwsJobSource row(long requirementId, String url, String name, String info) {
        CwsJobSource s = new CwsJobSource();
        s.setOrgId(ORG);
        s.setRequirementId(requirementId);
        s.setSourceUrl(url);
        s.setSourceName(name);
        s.setQuickInfo(info);
        return s;
    }

    @Test
    void aJobSavedFromTheExtensionHasNoSourceRowSoItsOwnJobUrlIsTheLink() {
        when(sources.findByOrgIdAndRequirementIdIn(eq(ORG), anyCollection())).thenReturn(List.of());
        when(requirements.findByOrgIdAndIdIn(eq(ORG), anyCollection())).thenReturn(List.of(job(1, ORG, "https://jobs.example.com/x/1")));
        Map<Long, ConsultantWsJobSourceReader.Info> out = reader.load(ORG, List.of(1L));
        assertThat(out.get(1L).sourceUrl()).isEqualTo("https://jobs.example.com/x/1");
        assertThat(out.get(1L).sourceName()).isNull();
        assertThat(out.get(1L).sample()).isFalse();
    }

    @Test
    void theMarketersSourceRowWinsAndTheJobsOwnLinkIsNotEvenRead() {
        when(sources.findByOrgIdAndRequirementIdIn(eq(ORG), anyCollection())).thenReturn(List.of(row(1, "https://company.example.com/careers/1", "Company site", "Quick note")));
        Map<Long, ConsultantWsJobSourceReader.Info> out = reader.load(ORG, List.of(1L));
        assertThat(out.get(1L)).isEqualTo(new ConsultantWsJobSourceReader.Info("https://company.example.com/careers/1", "Company site", "Quick note", false));
        verify(requirements, never()).findByOrgIdAndIdIn(anyLong(), anyCollection());
    }

    @Test
    void aRowWithoutAUsableLinkKeepsItsNameAndNoteAndTakesTheJobsLink() {
        when(sources.findByOrgIdAndRequirementIdIn(eq(ORG), anyCollection())).thenReturn(List.of(row(1, "http://insecure.example.com/x", "Dice", "Unsafe link row")));
        when(requirements.findByOrgIdAndIdIn(eq(ORG), anyCollection())).thenReturn(List.of(job(1, ORG, "https://jobs.example.com/x/1")));
        ConsultantWsJobSourceReader.Info i = reader.load(ORG, List.of(1L)).get(1L);
        assertThat(i.sourceUrl()).isEqualTo("https://jobs.example.com/x/1");
        assertThat(i.sourceName()).isEqualTo("Dice");
        assertThat(i.quickInfo()).isEqualTo("Unsafe link row");
    }

    @Test
    void anUnsafeOrMissingJobUrlOrAnotherOrganizationsJobGivesNoLink() {
        when(sources.findByOrgIdAndRequirementIdIn(eq(ORG), anyCollection())).thenReturn(List.of());
        when(requirements.findByOrgIdAndIdIn(eq(ORG), anyCollection())).thenReturn(List.of(
            job(1, ORG, "http://plain-http.example.com/1"), job(2, ORG, null), job(3, ORG, "javascript:alert(1)"), job(4, 99L, "https://other.example.com/4")
        ));
        Map<Long, ConsultantWsJobSourceReader.Info> out = reader.load(ORG, List.of(1L, 2L, 3L, 4L));
        assertThat(out).isEmpty();
        assertThat(ConsultantWsJobSourceReader.orNone(out, 1L).sourceUrl()).isNull();
    }
}
