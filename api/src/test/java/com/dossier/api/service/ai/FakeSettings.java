package com.dossier.api.service.ai;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.AppSetting;
import com.dossier.api.repository.AppSettingRepository;
import com.dossier.api.service.ResumeBuilderSettings;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

/** An in-memory {@code app_setting} table behind a real {@link ResumeBuilderSettings}, for fast unit tests. */
public final class FakeSettings {

    public final ObjectMapper mapper = new ObjectMapper();
    public final List<AppSetting> rows = new ArrayList<>();
    public final AppSettingRepository repository = mock(AppSettingRepository.class);
    public final ResumeBuilderSettings settings;

    public FakeSettings() {
        when(repository.findAll()).thenAnswer(i -> new ArrayList<>(rows));
        when(repository.findById(anyString())).thenAnswer(i -> rows.stream().filter(r -> r.getKey().equals(i.getArgument(0))).findFirst());
        when(repository.save(any(AppSetting.class))).thenAnswer(i -> {
            AppSetting s = i.getArgument(0);
            rows.removeIf(r -> r.getKey().equals(s.getKey()));
            rows.add(s);
            return s;
        });
        doAnswer(i -> {
            rows.removeIf(r -> r.getKey().equals(i.getArgument(0)));
            return null;
        })
            .when(repository)
            .deleteById(anyString());
        settings = new ResumeBuilderSettings(repository, mapper);
    }

    /** Store a row and drop the cache, as an admin write would. */
    public FakeSettings put(String key, String value) {
        rows.removeIf(r -> r.getKey().equals(key));
        rows.add(new AppSetting(key, value, "test", java.time.Instant.now()));
        settings.invalidate();
        return this;
    }

    public Optional<String> row(String key) {
        return rows.stream().filter(r -> r.getKey().equals(key)).map(AppSetting::getValue).findFirst();
    }

    public AiRuntimeSettings runtime(AiEnv env, AiPolicy policy) {
        return new AiRuntimeSettings(settings, env, policy, new AiPricing(), mapper);
    }
}
