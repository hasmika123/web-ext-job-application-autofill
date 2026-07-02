package com.dossier.api.service;

import com.dossier.api.domain.AiUsage;
import com.dossier.api.repository.AiQuotaOverrideRepository;
import com.dossier.api.repository.AiUsageRepository;
import com.dossier.api.security.SecurityUtils;
import com.dossier.api.service.ai.AiProvider;
import com.dossier.api.service.ai.AiProviderException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.YearMonth;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/**
 * Server-side LLM resume parsing on the shared {@link AiProvider} seam (same Gemini
 * model + key as answer drafting). Gating mirrors {@link AiDraftService}: feature
 * enabled + provider configured, explicit user consent (the free-tier provider may use
 * inputs), and the per-user monthly AI quota — one successful parse consumes one AI
 * credit from the same counter as drafts (no schema change; parses are infrequent).
 * No answer cache: resume files/text are effectively unique per upload.
 */
@Service
@Transactional
public class AiResumeParseService {

    private static final Logger LOG = LoggerFactory.getLogger(AiResumeParseService.class);

    public enum Status {
        OK,
        DISABLED,
        CONSENT_REQUIRED,
        QUOTA_EXCEEDED,
        ERROR,
    }

    public record Result(Status status, JsonNode parsed, int used, int quota) {}

    private final AiProvider provider;
    private final AiUsageRepository usageRepository;
    private final AiQuotaOverrideRepository quotaOverrideRepository;
    private final ObjectMapper om = new ObjectMapper();
    private final boolean enabled;
    private final int freeMonthlyQuota;

    public AiResumeParseService(
        AiProvider provider,
        AiUsageRepository usageRepository,
        AiQuotaOverrideRepository quotaOverrideRepository,
        @Value("${dossier.ai.enabled:false}") boolean enabled,
        @Value("${dossier.ai.free-monthly-quota:50}") int freeMonthlyQuota
    ) {
        this.provider = provider;
        this.usageRepository = usageRepository;
        this.quotaOverrideRepository = quotaOverrideRepository;
        this.enabled = enabled;
        this.freeMonthlyQuota = freeMonthlyQuota;
    }

    public Result parse(String text, String fileBase64, String fileMimeType, boolean consent) {
        if (!enabled || !provider.isConfigured()) {
            return new Result(Status.DISABLED, null, 0, 0);
        }
        if (!consent) {
            return new Result(Status.CONSENT_REQUIRED, null, 0, freeMonthlyQuota);
        }

        String login = SecurityUtils.getCurrentUserLogin().orElseThrow(() ->
            new ResponseStatusException(HttpStatus.UNAUTHORIZED, "No authenticated user")
        );
        String period = YearMonth.now().toString(); // YYYY-MM, server clock
        int quota = quotaOverrideRepository
            .findById(login)
            .map(com.dossier.api.domain.AiQuotaOverride::getMonthlyQuota)
            .orElse(freeMonthlyQuota);

        AiUsage usage = usageRepository.findByLoginAndPeriod(login, period).orElseGet(() -> {
            AiUsage u = new AiUsage();
            u.setLogin(login);
            u.setPeriod(period);
            u.setDraftCount(0);
            return u;
        });

        if (usage.getDraftCount() >= quota) {
            return new Result(Status.QUOTA_EXCEEDED, null, usage.getDraftCount(), quota);
        }

        JsonNode parsed;
        try {
            parsed = om.readTree(provider.parseResume(text, fileBase64, fileMimeType));
        } catch (AiProviderException e) {
            // Provider/transport failure — don't charge quota; report a generic error.
            LOG.warn("AI resume parse failed for user: {}", e.getMessage());
            return new Result(Status.ERROR, null, usage.getDraftCount(), quota);
        } catch (Exception e) {
            LOG.warn("AI resume parse returned unusable JSON: {}", e.getMessage());
            return new Result(Status.ERROR, null, usage.getDraftCount(), quota);
        }

        usage.setDraftCount(usage.getDraftCount() + 1); // one parse = one AI credit
        usageRepository.save(usage);
        return new Result(Status.OK, parsed, usage.getDraftCount(), quota);
    }
}
