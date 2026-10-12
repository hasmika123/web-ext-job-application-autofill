package com.dossier.api.config;

import com.dossier.api.service.AiMeteringService;
import com.dossier.api.service.ai.AiEnv;
import com.dossier.api.service.ai.AiKeyScrubber;
import com.dossier.api.service.ai.AiPricing;
import com.dossier.api.service.ai.AiProvider;
import com.dossier.api.service.ai.AiProviderRegistry;
import com.dossier.api.service.ai.AiRouter;
import com.dossier.api.service.ai.AiRuntimeSettings;
import com.dossier.api.service.ai.GeminiAiProvider;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.net.http.HttpClient;
import java.time.Duration;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Wires server AI (AI-ADMIN-CONFIG-DESIGN 4.1): exactly ONE {@link AiProvider} bean, the {@link AiRouter}, which
 * picks the adapter and model per call from runtime settings. The adapters live in the
 * {@link AiProviderRegistry} and are not beans, so the services that inject {@link AiProvider} (and every test
 * that mocks it) never learn there is more than one provider. Provider keys are read here, from env, once; they
 * go to the adapter and the {@link AiKeyScrubber} and nowhere else.
 */
@Configuration
@EnableConfigurationProperties(AiProperties.class)
public class AiConfiguration {

    private static final Logger LOG = LoggerFactory.getLogger(AiConfiguration.class);

    /** The env variable that holds the Gemini key - the only thing the admin page may say about it. */
    public static final String GEMINI_KEY_ENV_VAR = "DOSSIER_AI_API_KEY";

    /** The deployment-level AI values the service layer may read (never the key). A blank provider means AI is off, as before. */
    @Bean
    public AiEnv aiEnv(AiProperties props) {
        String provider = props.getProvider() == null ? "" : props.getProvider().trim();
        return new AiEnv(
            props.isEnabled() && !provider.isEmpty(),
            provider,
            props.getBaseUrl(),
            props.getModel(),
            props.getMaxOutputTokens(),
            props.getParseMaxOutputTokens()
        );
    }

    /** The adapters, built from env once; base URL and timeout are read live from {@link AiRuntimeSettings}. */
    @Bean
    public AiProviderRegistry aiProviderRegistry(AiProperties props, AiRuntimeSettings runtime) {
        String key = props.getApiKey() == null ? "" : props.getApiKey().trim();
        AiKeyScrubber scrubber = new AiKeyScrubber(List.of(key));
        GeminiAiProvider gemini = new GeminiAiProvider(
            () -> runtime.providerBaseUrl("gemini"),
            props.getModel(),
            key,
            () -> runtime.providerTimeoutMs("gemini"),
            props.getMaxOutputTokens(),
            props.getParseMaxOutputTokens(),
            HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build(),
            scrubber
        );
        AiProviderRegistry registry = new AiProviderRegistry(
            List.of(
                new AiProviderRegistry.Entry("gemini", "Google Gemini", "cloud", GEMINI_KEY_ENV_VAR, true, !key.isEmpty(), List.of("STRUCTURED_OUTPUT", "FILES"), gemini)
            ),
            scrubber
        );
        // Presence only - never the key, its length or a prefix.
        LOG.info("AI providers: gemini ({}), master switch {}", key.isEmpty() ? "key missing" : "key present", props.isEnabled() ? "on" : "off");
        return registry;
    }

    @Bean
    public AiProvider aiProvider(
        AiProviderRegistry registry,
        AiRuntimeSettings runtime,
        AiMeteringService metering,
        AiPricing pricing,
        ObjectProvider<MeterRegistry> meters,
        AiProperties props
    ) {
        return new AiRouter(registry, runtime, metering, pricing, meters.getIfAvailable(SimpleMeterRegistry::new), props.getModel());
    }
}
