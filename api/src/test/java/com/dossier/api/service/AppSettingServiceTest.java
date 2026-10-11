package com.dossier.api.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.AppSetting;
import com.dossier.api.repository.AppSettingRepository;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** Unit tests for the cached app-setting accessor (phase demo). */
class AppSettingServiceTest {

    private AppSettingRepository repository;
    private AtomicLong now;
    private AppSettingService service;

    @BeforeEach
    void setUp() {
        repository = mock(AppSettingRepository.class);
        now = new AtomicLong(1_000_000);
        service = new AppSettingService(repository, now::get);
        when(repository.save(any(AppSetting.class))).thenAnswer(inv -> inv.getArgument(0));
    }

    @Test
    void returnsTheDefaultWhenThereIsNoRow() {
        when(repository.findById("demo.enabled")).thenReturn(Optional.empty());

        assertThat(service.get("demo.enabled", "x")).isEqualTo("x");
        assertThat(service.getBoolean("demo.enabled", false)).isFalse();
        assertThat(service.find("demo.enabled")).isEmpty();
    }

    @Test
    void readsAreCachedUntilTheTtlPasses() {
        when(repository.findById("demo.enabled")).thenReturn(Optional.of(new AppSetting("demo.enabled", "false", null, null)));

        assertThat(service.getBoolean("demo.enabled", false)).isFalse();
        assertThat(service.getBoolean("demo.enabled", false)).isFalse();
        verify(repository, times(1)).findById("demo.enabled");

        // Someone flips it with SQL: after the TTL the API picks the change up without a restart.
        when(repository.findById("demo.enabled")).thenReturn(Optional.of(new AppSetting("demo.enabled", "true", "sql", null)));
        now.addAndGet(AppSettingService.TTL_MILLIS - 1);
        assertThat(service.getBoolean("demo.enabled", false)).isFalse();
        now.addAndGet(2);
        assertThat(service.getBoolean("demo.enabled", false)).isTrue();
        verify(repository, times(2)).findById("demo.enabled");
    }

    @Test
    void aMissingRowIsCachedToo() {
        when(repository.findById("k")).thenReturn(Optional.empty());

        service.get("k", "d");
        service.get("k", "d");

        verify(repository, times(1)).findById("k");
    }

    @Test
    void setUpsertsStampsWhoAndWhenAndRefreshesTheCache() {
        when(repository.findById("demo.enabled")).thenReturn(Optional.of(new AppSetting("demo.enabled", "false", null, null)));
        assertThat(service.getBoolean("demo.enabled", false)).isFalse();

        AppSetting saved = service.set("demo.enabled", "true", "boss");

        assertThat(saved.getValue()).isEqualTo("true");
        assertThat(saved.getUpdatedBy()).isEqualTo("boss");
        assertThat(saved.getUpdatedDate()).isNotNull();
        // No wait for the TTL: the writer sees its own change immediately.
        assertThat(service.getBoolean("demo.enabled", false)).isTrue();
        assertThat(service.find("demo.enabled")).get().extracting(AppSetting::getUpdatedBy).isEqualTo("boss");
    }

    @Test
    void setCreatesTheRowWhenMissing() {
        when(repository.findById("new.key")).thenReturn(Optional.empty());

        AppSetting saved = service.set("new.key", "v", null);

        assertThat(saved.getKey()).isEqualTo("new.key");
        assertThat(saved.getUpdatedBy()).isNull();
    }

    @Test
    void anythingButTrueIsFalse() {
        when(repository.findById("k")).thenReturn(Optional.of(new AppSetting("k", "yes", null, null)));

        assertThat(service.getBoolean("k", true)).isFalse();
    }
}
