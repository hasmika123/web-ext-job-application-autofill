package com.dossier.api.service.privacy;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.privacy.DataExportJob;
import com.dossier.api.repository.privacy.DataExportJobRepository;
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.settings.AdminSettingKeys;
import com.dossier.api.service.storage.FileStorage;
import java.io.ByteArrayInputStream;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.SimpleTransactionStatus;
import org.springframework.web.server.ResponseStatusException;

/** The request rules and the signed link of the data export, without a database. */
class DataExportServiceTest {

    private final DataExportJobRepository jobs = mock(DataExportJobRepository.class);
    private final FileStorage storage = mock(FileStorage.class);
    private final ResumeBuilderSettings settings = mock(ResumeBuilderSettings.class);
    private DataExportService service;
    private final Instant now = Instant.parse("2026-10-16T12:00:00Z");

    @BeforeEach
    void setUp() {
        PlatformTransactionManager tm = mock(PlatformTransactionManager.class);
        when(tm.getTransaction(any())).thenReturn(new SimpleTransactionStatus());
        when(settings.getInt(AdminSettingKeys.PRIVACY_EXPORT_MAX_PER_DAY)).thenReturn(3);
        when(jobs.save(any(DataExportJob.class))).thenAnswer(i -> {
            DataExportJob j = i.getArgument(0);
            if (j.getId() == null) j.setId(11L);
            return j;
        });
        service = new DataExportService(jobs, storage, settings, tm, "unit-test-secret");
    }

    private DataExportJob ready(Long id, Long userId) {
        DataExportJob j = new DataExportJob();
        j.setId(id);
        j.setUserId(userId);
        j.setStatus(DataExportJob.READY);
        j.setRequestedAt(now.minusSeconds(600));
        j.setFinishedAt(now.minusSeconds(300));
        j.setExpiresAt(now.plusSeconds(3600));
        j.setStorageKey("data-exports/" + userId + "/" + id + "-x-kiwiply-data.zip");
        j.setSizeBytes(5L);
        return j;
    }

    @Test
    void aRequestQueuesAJobAndASecondOneWhileItIsActiveReturnsTheSameJob() {
        when(jobs.findByUserIdOrderByIdDesc(anyLong(), any())).thenReturn(List.of());
        DataExportService.View v = service.request(7L, now);
        assertThat(v.status()).isEqualTo("QUEUED");
        assertThat(v.downloadPath()).isNull();

        DataExportJob active = new DataExportJob();
        active.setId(11L);
        active.setUserId(7L);
        active.setStatus(DataExportJob.RUNNING);
        active.setRequestedAt(now);
        when(jobs.findByUserIdOrderByIdDesc(anyLong(), any())).thenReturn(List.of(active));
        assertThat(service.request(7L, now).id()).isEqualTo(11L);
    }

    @Test
    void theDailyLimitIsThe429() {
        when(jobs.findByUserIdOrderByIdDesc(anyLong(), any())).thenReturn(List.of());
        when(jobs.countByUserIdAndRequestedAtAfter(anyLong(), any())).thenReturn(3L);
        assertThatThrownBy(() -> service.request(7L, now)).isInstanceOf(ResponseStatusException.class).hasMessageContaining("429");
    }

    @Test
    void aReadyJobCarriesASignedPathThatDownloadsOnlyForItsOwner() {
        DataExportJob j = ready(5L, 7L);
        when(jobs.findByIdAndUserId(5L, 7L)).thenReturn(Optional.of(j));
        when(jobs.findByIdAndUserId(5L, 8L)).thenReturn(Optional.empty()); // the repository answers "no such job" for another account
        when(storage.open(j.getStorageKey())).thenAnswer(i -> new ByteArrayInputStream(new byte[] { 1, 2, 3, 4, 5 }));

        String path = service.get(7L, 5L, now).downloadPath();
        assertThat(path).startsWith("/api/account/exports/5/file?exp=").contains("&sig=");
        long exp = Long.parseLong(path.replaceAll(".*exp=(\\d+)&.*", "$1"));
        String sig = path.substring(path.indexOf("sig=") + 4);

        assertThat(service.download(7L, 5L, exp, sig, now).length()).isEqualTo(5);
        assertThatThrownBy(() -> service.download(8L, 5L, exp, sig, now)).hasMessageContaining("404"); // another account
        assertThatThrownBy(() -> service.get(8L, 5L, now)).hasMessageContaining("404");
    }

    @Test
    void aTamperedOrExpiredLinkLooksLikeNoLink() {
        DataExportJob j = ready(5L, 7L);
        when(jobs.findByIdAndUserId(5L, 7L)).thenReturn(Optional.of(j));
        long exp = j.getExpiresAt().getEpochSecond();
        String sig = service.sign(5L, 7L, exp);
        assertThatThrownBy(() -> service.download(7L, 5L, exp, sig + "x", now)).hasMessageContaining("404");
        assertThatThrownBy(() -> service.download(7L, 5L, exp + 1, sig, now)).hasMessageContaining("404"); // a later expiry needs its own signature
        assertThatThrownBy(() -> service.download(7L, 5L, exp, null, now)).hasMessageContaining("404");
        assertThatThrownBy(() -> service.download(7L, 5L, exp, sig, j.getExpiresAt().plusSeconds(1))).hasMessageContaining("404"); // past its expiry
        // and a signature made for another job or account never verifies here
        assertThat(service.sign(6L, 7L, exp)).isNotEqualTo(sig);
        assertThat(service.sign(5L, 8L, exp)).isNotEqualTo(sig);
    }

    @Test
    void anExpiredOrFailedJobGivesNoPathAndGone() {
        DataExportJob j = ready(5L, 7L);
        j.setStatus(DataExportJob.EXPIRED);
        j.setStorageKey(null);
        when(jobs.findByIdAndUserId(5L, 7L)).thenReturn(Optional.of(j));
        assertThat(service.get(7L, 5L, now).downloadPath()).isNull();
        long exp = now.getEpochSecond() + 100;
        assertThatThrownBy(() -> service.download(7L, 5L, exp, service.sign(5L, 7L, exp), now)).hasMessageContaining("410");
    }
}
