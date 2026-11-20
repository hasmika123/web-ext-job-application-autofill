package com.dossier.api.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.FillQualityDaily;
import com.dossier.api.domain.enumeration.NotificationKind;
import com.dossier.api.repository.FillEventRepository;
import com.dossier.api.repository.FillQualityDailyRepository;
import com.dossier.api.repository.FillQualityWindowRow;
import com.dossier.api.repository.UserRepository;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

class FillQualityWatchTest {

    private static FillQualityWatch.QualityWindow window(long fills, long found, long filled) {
        return new FillQualityWatch.QualityWindow(fills, found, filled, 0);
    }

    @Test
    void detectsOnlyARealDropWithTheSampleFloor() {
        var alerts = FillQualityWatch.detect(
            Map.of("lever", window(30, 300, 224)), // 74.67%
            Map.of("lever", window(100, 1_000, 900)) // 90%; drop > 15 points
        );
        assertThat(alerts).singleElement().satisfies(a -> {
            assertThat(a.ats()).isEqualTo("lever");
            assertThat(a.rate7Bp()).isEqualTo(7_467);
            assertThat(a.baseline28Bp()).isEqualTo(9_000);
            assertThat(a.dropBp()).isGreaterThan(FillQualityWatch.DROP_THRESHOLD_BP);
            assertThat(a.fixturePath()).isEqualTo("test/fixtures/job-capture/lever-rover-apply.html");
        });

        assertThat(FillQualityWatch.detect(Map.of("lever", window(29, 290, 190)), Map.of("lever", window(100, 1_000, 900)))).isEmpty();
        assertThat(FillQualityWatch.detect(Map.of("lever", window(30, 300, 225)), Map.of("lever", window(100, 1_000, 900)))).isEmpty(); // exactly 15 points
    }

    @Test
    void runRollsUpThePreviousDayAndPublishesAnIdempotentSafeAdminNotice() {
        FillEventRepository fills = mock(FillEventRepository.class);
        FillQualityDailyRepository daily = mock(FillQualityDailyRepository.class);
        UserRepository users = mock(UserRepository.class);
        NotificationService notifications = mock(NotificationService.class);
        Instant now = Instant.parse("2026-11-20T04:00:00Z");

        FillQualityWindowRow yesterday = new FillQualityWindowRow("lever", "lever", "0.75.1", 2L, 20L, 18L, 0L);
        FillQualityWindowRow recent = new FillQualityWindowRow("lever", "lever", "0.75.1", 30L, 300L, 210L, 2L);
        FillQualityWindowRow baseline = new FillQualityWindowRow("lever", "lever", "0.75.0", 100L, 1_000L, 900L, 1L);
        when(fills.qualityWindow(any(), any())).thenReturn(List.of(yesterday), List.of(recent), List.of(baseline));
        when(daily.findOneByDayAndAtsAndAdapterAndExtVersion(LocalDate.of(2026, 11, 19), "lever", "lever", "0.75.1"))
            .thenReturn(Optional.empty());
        when(users.findPersonalUserIdsByAuthority("ROLE_ADMIN")).thenReturn(List.of(7L));

        FillQualityWatch.RunResult result = new FillQualityWatch(fills, daily, users, notifications).run(now);

        assertThat(result.rolledUpDay()).isEqualTo(LocalDate.of(2026, 11, 19));
        assertThat(result.alerts()).hasSize(1);
        ArgumentCaptor<FillQualityDaily> rollup = ArgumentCaptor.forClass(FillQualityDaily.class);
        verify(daily).save(rollup.capture());
        assertThat(rollup.getValue().getFillRateBp()).isEqualTo(9_000);
        ArgumentCaptor<NotificationService.Payload> notice = ArgumentCaptor.forClass(NotificationService.Payload.class);
        verify(notifications).publish(eq(NotificationKind.SYSTEM), eq(7L), notice.capture(), eq(now));
        assertThat(notice.getValue().title()).isEqualTo("ADAPTER_ROT: Autofill quality dropped: lever");
        assertThat(notice.getValue().groupKey()).isEqualTo("ADAPTER_ROT:lever");
        assertThat(notice.getValue().dedupeKey()).isEqualTo("autofill-quality:2026-11-20:lever");
        assertThat(notice.getValue().body()).contains("test/fixtures/job-capture/lever-rover-apply.html").doesNotContain("answer").doesNotContain("@");
    }
}
