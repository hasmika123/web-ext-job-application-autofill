package com.dossier.api.service.privacy;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.privacy.TermsAcceptance;
import com.dossier.api.repository.privacy.TermsAcceptanceRepository;
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.settings.AdminSettingKeys;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

class TermsAcceptanceServiceTest {

    private final TermsAcceptanceRepository rows = mock(TermsAcceptanceRepository.class);
    private final ResumeBuilderSettings settings = mock(ResumeBuilderSettings.class);
    private final List<TermsAcceptance> saved = new ArrayList<>();
    private TermsAcceptanceService service;
    private final Instant t0 = Instant.parse("2026-10-16T10:00:00Z");

    @BeforeEach
    void setUp() {
        when(settings.getString(AdminSettingKeys.LEGAL_TERMS_VERSION)).thenReturn("2026-10");
        when(settings.getString(AdminSettingKeys.LEGAL_PRIVACY_VERSION)).thenReturn("2026-10");
        when(rows.findByUserIdOrderByAcceptedAtDescIdDesc(7L)).thenAnswer(i -> new ArrayList<>(saved));
        when(rows.save(any(TermsAcceptance.class))).thenAnswer(i -> {
            TermsAcceptance a = i.getArgument(0);
            saved.add(0, a);
            return a;
        });
        service = new TermsAcceptanceService(rows, settings);
    }

    @Test
    void recordsTheVersionAndTheMomentOnce() {
        TermsAcceptance a = service.accept(7L, "terms", "2026-10", "signup", t0);
        assertThat(a.getDocument()).isEqualTo("TERMS");
        assertThat(a.getVersion()).isEqualTo("2026-10");
        assertThat(a.getSource()).isEqualTo("SIGNUP");
        assertThat(a.getAcceptedAt()).isEqualTo(t0);
        TermsAcceptance again = service.accept(7L, "TERMS", "2026-10", null, t0.plusSeconds(60));
        assertThat(again.getAcceptedAt()).as("the first timestamp stays").isEqualTo(t0);
        verify(rows).save(any(TermsAcceptance.class)); // exactly one row
    }

    @Test
    void anOldOrUnknownVersionProvesNothingAndIsRefused() {
        assertThatThrownBy(() -> service.accept(7L, "TERMS", "2025-01", null, t0)).isInstanceOf(ResponseStatusException.class).hasMessageContaining("400");
        assertThatThrownBy(() -> service.accept(7L, "COOKIES", "2026-10", null, t0)).isInstanceOf(ResponseStatusException.class);
        assertThatThrownBy(() -> service.accept(7L, "TERMS", "2026-10", "carrier-pigeon", t0)).isInstanceOf(ResponseStatusException.class);
        verify(rows, never()).save(any());
    }

    @Test
    @SuppressWarnings("unchecked")
    void statusSaysWhichDocumentsAreStillOwed() {
        assertThat(service.status(7L).get("upToDate")).isEqualTo(false);
        service.accept(7L, "TERMS", "2026-10", null, t0);
        assertThat(service.status(7L).get("upToDate")).isEqualTo(false);
        service.accept(7L, "PRIVACY", "2026-10", null, t0);
        Map<String, Object> s = service.status(7L);
        assertThat(s.get("upToDate")).isEqualTo(true);
        assertThat(((Map<String, Object>) s.get("terms")).get("lastAcceptedVersion")).isEqualTo("2026-10");
        // an admin publishes a new version: the old acceptance no longer counts
        when(settings.getString(AdminSettingKeys.LEGAL_TERMS_VERSION)).thenReturn("2027-02");
        Map<String, Object> after = service.status(7L);
        assertThat(after.get("upToDate")).isEqualTo(false);
        assertThat(((Map<String, Object>) after.get("terms")).get("accepted")).isEqualTo(false);
        assertThat(((Map<String, Object>) after.get("terms")).get("lastAcceptedVersion")).isEqualTo("2026-10");
    }
}
