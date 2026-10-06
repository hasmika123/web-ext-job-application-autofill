package com.dossier.api.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.FillEvent;
import com.dossier.api.repository.FillEventRepository;
import com.dossier.api.repository.FillQualityRow;
import com.dossier.api.service.dto.FillTelemetryDTO;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

/**
 * Fill telemetry without a database (Phase 10.1): the privacy normalisation and the rate math,
 * which are the parts most worth pinning. The HTTP + persistence path is FillTelemetryResourceIT.
 */
class FillTelemetryServiceTest {

    private FillEventRepository repo;
    private FillTelemetryService service;

    @BeforeEach
    void setUp() {
        repo = mock(FillEventRepository.class);
        service = new FillTelemetryService(repo);
    }

    private FillEvent saved(FillTelemetryDTO dto) {
        service.record(dto);
        ArgumentCaptor<FillEvent> c = ArgumentCaptor.forClass(FillEvent.class);
        verify(repo).saveAndFlush(c.capture());
        return c.getValue();
    }

    private static String id() {
        return UUID.randomUUID().toString();
    }

    @Test
    void aKnownFamilyAndAdapterAreKept() {
        FillEvent e = saved(new FillTelemetryDTO(id(), " Workday ", "WORKDAY", 20, 17, 2, 1, "0.56.0"));
        assertThat(e.getAts()).isEqualTo("workday");
        assertThat(e.getAdapter()).isEqualTo("workday");
        assertThat(e.getExtVersion()).isEqualTo("0.56.0");
    }

    /** A hostname would reveal where the user applied. It must never be stored. */
    @Test
    void aHostnameIsNeverStored() {
        FillEvent e = saved(new FillTelemetryDTO(id(), "careers.acme-corp.com", "careers.acme-corp.com", 5, 5, 0, 0, null));
        assertThat(e.getAts()).isEqualTo("other");
        assertThat(e.getAdapter()).isEqualTo("other");
    }

    @Test
    void countsAreClampedAndConsistent() {
        FillEvent e = saved(new FillTelemetryDTO(id(), "icims", "generic", 9_999, 9_999, -3, null, "not a version"));
        assertThat(e.getFieldsFound()).isEqualTo(500);
        assertThat(e.getFieldsFilled()).isEqualTo(500);
        assertThat(e.getFieldsFailed()).isZero();
        assertThat(e.getRequiredLeftEmpty()).isZero();
        assertThat(e.getExtVersion()).isNull();
    }

    @Test
    void filledIsCappedAtFound() {
        FillEvent e = saved(new FillTelemetryDTO(id(), "icims", "generic", 3, 10, 7, 0, null));
        assertThat(e.getFieldsFilled()).isEqualTo(3);
        assertThat(e.getFieldsFailed()).isEqualTo(3);
    }

    @Test
    void aRepeatedIdIsNotWrittenAgain() {
        when(repo.existsById(anyString())).thenReturn(true);
        assertThat(service.record(new FillTelemetryDTO(id(), "lever", "lever", 1, 1, 0, 0, null))).isFalse();
        verify(repo, never()).saveAndFlush(any());
    }

    @Test
    void aMalformedIdIsRefused() {
        assertThatThrownBy(() -> service.record(new FillTelemetryDTO("nope", "lever", "lever", 1, 1, 0, 0, null))).isInstanceOf(
            IllegalArgumentException.class
        );
        verify(repo, never()).saveAndFlush(any());
    }

    @Test
    void aMalformedCorrectionIdTouchesNothing() {
        service.recordCorrection("../../etc");
        verify(repo, never()).incrementCorrection(anyString(), any());
    }

    // ---- the admin rates ---------------------------------------------------------------------

    @Test
    void ratesAreComputedFromSums() {
        var q = AdminAnalyticsService.toFillQuality(new FillQualityRow("icims", 4L, 40L, 20L, 3L, 2L, 3L, 4L));
        assertThat(q.fillRatePct()).isEqualTo(50); // 20 of 40 found
        assertThat(q.gapRatePct()).isEqualTo(75); // 3 of 4 fills left a required field empty
        assertThat(q.correctionRatePct()).isEqualTo(10); // 2 of 20 filled were changed
        assertThat(q.genericPct()).isEqualTo(100); // all 4 on the generic scanner
        assertThat(q.fieldsFailed()).isEqualTo(3);
    }

    @Test
    void emptySumsAreZeroNotADivideByZero() {
        var q = AdminAnalyticsService.toFillQuality(new FillQualityRow("lever", 0L, 0L, 0L, 0L, 0L, 0L, 0L));
        assertThat(q.fillRatePct()).isZero();
        assertThat(q.gapRatePct()).isZero();
        assertThat(q.correctionRatePct()).isZero();
    }
}
