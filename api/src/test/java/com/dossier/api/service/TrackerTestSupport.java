package com.dossier.api.service;

import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/** Shared helpers for the tracker's unit tests. */
final class TrackerTestSupport {

    private TrackerTestSupport() {}

    /** Settings that answer every int key with its declared default, optionally overridden. */
    static ResumeBuilderSettings settings(String... overrides) {
        ResumeBuilderSettings s = mock(ResumeBuilderSettings.class);
        when(s.getInt(anyString())).thenAnswer(inv -> {
            String key = inv.getArgument(0);
            for (int i = 0; i + 1 < overrides.length; i += 2) {
                if (overrides[i].equals(key)) return Integer.parseInt(overrides[i + 1]);
            }
            return Integer.parseInt(ResumeBuilderSettingKeys.require(key).defaultValue());
        });
        return s;
    }
}
