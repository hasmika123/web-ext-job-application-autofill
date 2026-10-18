package com.dossier.api.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.dossier.api.service.ai.AiProviderRegistry;
import com.dossier.api.service.ai.StubAiProvider;
import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;

/** The stub provider is a dev/CI tool: only the ai-stub profile selects it, and never next to prod (I1.14). */
class AiStubProfileTest {

    private final AiConfiguration config = new AiConfiguration();

    private static AiProperties props() {
        AiProperties p = new AiProperties();
        p.setApiKey("AIzaSyD-this-is-a-fake-test-key-0123456789");
        return p;
    }

    private static MockEnvironment env(String... profiles) {
        MockEnvironment e = new MockEnvironment();
        e.setActiveProfiles(profiles);
        return e;
    }

    @Test
    void theStubProfileServesGeminiFromTheStubAndSaysSo() {
        AiProviderRegistry registry = config.aiProviderRegistry(props(), null, env("dev", "ai-stub"));
        assertThat(registry.get("gemini")).isInstanceOf(StubAiProvider.class);
        assertThat(registry.label("gemini")).contains("stub");
        assertThat(registry.keyPresent("gemini")).isTrue();
    }

    @Test
    void theStubProfileRefusesToStartWithProd() {
        assertThatThrownBy(() -> config.aiProviderRegistry(props(), null, env("prod", "ai-stub")))
            .isInstanceOf(IllegalStateException.class)
            .hasMessageContaining("prod");
    }

    @Test
    void withoutTheStubProfileTheRealAdapterIsBuilt() {
        // runtime settings are only read lazily by the adapter, so a null here is fine for building it
        AiProviderRegistry registry = config.aiProviderRegistry(props(), null, env("dev"));
        assertThat(registry.get("gemini")).isNotInstanceOf(StubAiProvider.class);
        assertThat(registry.label("gemini")).isEqualTo("Google Gemini");
    }
}
