package com.dossier.api.service;

import com.dossier.api.repository.AiQuotaOverrideRepository;
import com.dossier.api.security.SecurityUtils;
import com.dossier.api.service.ai.AiProvider;
import com.dossier.api.service.ai.AiProviderException;
import com.dossier.api.service.ai.AiResult;
import com.dossier.api.service.ai.AiTask;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
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
 *
 * <p><b>The quota is the plan's (fixed 13.1a).</b> It used to be the Free quota for everyone, on
 * the counter drafts share — so a Pro user who had drafted 50 answers that month could no longer
 * parse a resume. Parsing stays ungated (it is the free exception), but a Pro user now gets the
 * Pro quota here, and an admin override still outranks both.
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
    private final AiMeteringService metering;
    private final AiQuotaOverrideRepository quotaOverrideRepository;
    private final EntitlementService entitlementService;
    private final ObjectMapper om = new ObjectMapper();
    private final boolean enabled;
    private final int freeMonthlyQuota;
    private final int proMonthlyQuota;

    public AiResumeParseService(
        AiProvider provider,
        AiMeteringService metering,
        AiQuotaOverrideRepository quotaOverrideRepository,
        EntitlementService entitlementService,
        @Value("${dossier.ai.enabled:false}") boolean enabled,
        @Value("${dossier.ai.free-monthly-quota:50}") int freeMonthlyQuota,
        @Value("${dossier.ai.pro-monthly-quota:2000}") int proMonthlyQuota
    ) {
        this.provider = provider;
        this.metering = metering;
        this.quotaOverrideRepository = quotaOverrideRepository;
        this.entitlementService = entitlementService;
        this.enabled = enabled;
        this.freeMonthlyQuota = freeMonthlyQuota;
        this.proMonthlyQuota = proMonthlyQuota;
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
        int quota = quotaOverrideRepository
            .findById(login)
            .map(com.dossier.api.domain.AiQuotaOverride::getMonthlyQuota)
            .orElseGet(() -> entitlementService.isPro(login) ? proMonthlyQuota : freeMonthlyQuota);

        int used = metering.usedThisMonth(login);
        if (used >= quota) {
            return new Result(Status.QUOTA_EXCEEDED, null, used, quota);
        }

        AiResult result;
        JsonNode parsed;
        try {
            result = provider.parseResume(text, fileBase64, fileMimeType);
            parsed = om.readTree(result.text());
        } catch (AiProviderException e) {
            // Provider/transport failure — don't charge quota; report a generic error.
            LOG.warn("AI resume parse failed for user: {}", e.getMessage());
            return new Result(Status.ERROR, null, used, quota);
        } catch (Exception e) {
            LOG.warn("AI resume parse returned unusable JSON: {}", e.getMessage());
            return new Result(Status.ERROR, null, used, quota);
        }

        used = metering.record(login, AiTask.PARSE, result); // one parse = one AI credit
        return new Result(Status.OK, parsed, used, quota);
    }
}
