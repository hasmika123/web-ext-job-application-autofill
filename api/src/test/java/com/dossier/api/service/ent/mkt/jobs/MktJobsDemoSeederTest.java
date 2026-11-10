package com.dossier.api.service.ent.mkt.jobs;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.ent.mkt.MktJobMeta;
import com.dossier.api.domain.ent.mkt.MktSavedSearch;
import com.dossier.api.domain.ent.talent.ClientRequirement;
import com.dossier.api.domain.ent.talent.MarketerCapacity;
import com.dossier.api.repository.ent.mkt.MktJobMetaRepository;
import com.dossier.api.repository.ent.mkt.MktSavedSearchRepository;
import com.dossier.api.repository.ent.talent.ClientRequirementRepository;
import com.dossier.api.repository.ent.talent.MarketerCapacityRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.ent.EnterpriseDemoSeeder;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.boot.DefaultApplicationArguments;

/** The Job Discovery demo seeder: every job gets meta, every marketer gets five searches, and a second run adds nothing. */
class MktJobsDemoSeederTest {

    private static final Instant NOW = Instant.parse("2026-10-13T12:00:00Z");
    private final EnterpriseDemoSeeder gate = mock(EnterpriseDemoSeeder.class);
    private final OrganizationRepository orgs = mock(OrganizationRepository.class);
    private final ClientRequirementRepository requirements = mock(ClientRequirementRepository.class);
    private final MarketerCapacityRepository marketers = mock(MarketerCapacityRepository.class);
    private final MktJobMetaRepository metas = mock(MktJobMetaRepository.class);
    private final MktSavedSearchRepository searches = mock(MktSavedSearchRepository.class);
    private final MktJobsDemoSeeder seeder = new MktJobsDemoSeeder(gate, orgs, requirements, marketers, metas, searches, new ObjectMapper(), true);

    private static ClientRequirement job(long id) {
        ClientRequirement r = new ClientRequirement();
        r.setId(id);
        return r;
    }

    private static MarketerCapacity marketer(long member) {
        MarketerCapacity c = new MarketerCapacity();
        c.setMemberId(member);
        return c;
    }

    @Test
    void everyJobWithoutMetaGetsASourcePriorityAndVisa() {
        MktJobMeta existing = new MktJobMeta();
        existing.setRequirementId(2L);
        when(metas.findByOrgId(1L)).thenReturn(List.of(existing));
        when(requirements.findByOrgId(1L)).thenReturn(List.of(job(1), job(2), job(3), job(4), job(5), job(6)));
        assertThat(seeder.seedMeta(1L, NOW)).isEqualTo(5);
        ArgumentCaptor<MktJobMeta> saved = ArgumentCaptor.forClass(MktJobMeta.class);
        verify(metas, times(5)).save(saved.capture());
        assertThat(saved.getAllValues()).extracting(MktJobMeta::getRequirementId).doesNotContain(2L);
        assertThat(saved.getAllValues()).allSatisfy(m -> {
            assertThat(m.getOrgId()).isEqualTo(1L);
            assertThat(List.of(MktJobsDemoSeeder.SOURCES)).contains(m.getSourceLabel());
            assertThat(List.of("HIGH", "MEDIUM", "LOW")).contains(m.getPriority());
            assertThat(List.of(MktJobsDemoSeeder.VISAS)).contains(m.getVisaLabel());
        });
        Set<String> sources = saved.getAllValues().stream().map(MktJobMeta::getSourceLabel).collect(Collectors.toSet());
        assertThat(sources.size()).as("the five sources are spread over the jobs").isGreaterThan(2);
    }

    @Test
    void everyMarketerGetsFiveSearchesOwnedByThem() {
        when(searches.countByOrgId(1L)).thenReturn(0L);
        when(marketers.findByOrgId(1L)).thenReturn(List.of(marketer(10), marketer(11)));
        assertThat(seeder.seedSearches(1L, NOW)).isEqualTo(10);
        ArgumentCaptor<MktSavedSearch> saved = ArgumentCaptor.forClass(MktSavedSearch.class);
        verify(searches, times(10)).save(saved.capture());
        List<MktSavedSearch> all = new ArrayList<>(saved.getAllValues());
        assertThat(all.stream().filter(s -> s.getOwnerMemberId() == 10L)).hasSize(5);
        assertThat(all.stream().filter(s -> s.getOwnerMemberId() == 11L)).hasSize(5);
        assertThat(all).allSatisfy(s -> {
            assertThat(s.getCriteria()).startsWith("{").contains("skills");
            assertThat(s.getLastSeenAt()).isAfter(s.getCreatedAt());
            assertThat(s.getName()).isNotBlank();
        });
    }

    @Test
    void anOrganizationThatAlreadyHasSearchesGetsNoMore() {
        when(searches.countByOrgId(1L)).thenReturn(3L);
        when(marketers.findByOrgId(1L)).thenReturn(List.of(marketer(10)));
        assertThat(seeder.seedSearches(1L, NOW)).isZero();
        verify(searches, never()).save(any());
    }

    @Test
    void nothingRunsWhenTheDemoGateRefuses() {
        when(gate.refusal()).thenReturn("the demo is off (DEMO_ENABLED)");
        seeder.run(new DefaultApplicationArguments());
        verify(orgs, never()).findBySlug(any());
    }
}
