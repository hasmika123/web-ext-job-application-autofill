package com.dossier.api.config;

import com.dossier.api.service.ai.AiProvider;
import com.dossier.api.service.ai.AiProviderException;
import com.dossier.api.service.ai.GeminiAiProvider;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Picks the {@link AiProvider} implementation from {@code dossier.ai.provider}. Adding
 * a provider = one more branch here; nothing else changes (the seam pattern used by
 * storage/tracking). An unknown/blank provider yields a disabled stub so the proxy
 * reports "AI off" cleanly instead of failing startup.
 */
@Configuration
@EnableConfigurationProperties(AiProperties.class)
public class AiConfiguration {

    private static final Logger LOG = LoggerFactory.getLogger(AiConfiguration.class);

    @Bean
    public AiProvider aiProvider(AiProperties props) {
        String provider = props.getProvider() == null ? "" : props.getProvider().trim().toLowerCase();
        if ("gemini".equals(provider)) {
            return new GeminiAiProvider(
                props.getBaseUrl(),
                props.getModel(),
                props.getApiKey(),
                props.getMaxOutputTokens(),
                props.getParseMaxOutputTokens()
            );
        }
        LOG.info("No AI provider configured (dossier.ai.provider='{}') — server-side drafting is off.", provider);
        return new DisabledAiProvider();
    }

    /** Stand-in when no provider is configured: always reports unconfigured. */
    static class DisabledAiProvider implements AiProvider {

        @Override
        public boolean isConfigured() {
            return false;
        }

        @Override
        public String draft(String question, String context) {
            throw new AiProviderException("No AI provider configured");
        }

        @Override
        public String parseResume(String text, String fileBase64, String fileMimeType) {
            throw new AiProviderException("No AI provider configured");
        }
    }
}
