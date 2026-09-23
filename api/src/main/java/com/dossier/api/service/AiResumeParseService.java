package com.dossier.api.service;

import com.dossier.api.security.SecurityUtils;
import com.dossier.api.service.ai.AiProvider;
import com.dossier.api.service.ai.AiProviderException;
import com.dossier.api.service.ai.AiResult;
import com.dossier.api.service.ai.AiTask;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/**
 * Server-side LLM resume parsing on the shared {@link AiProvider} seam. Gating mirrors
 * {@link AiDraftService} — feature enabled + provider configured, explicit user consent (the
 * free-tier provider may use inputs), then the {@link AiBudgetService} decision — except that
 * parsing is <b>never Pro-gated</b>: it is how a profile builds itself, the one free server-AI
 * exception. A Free user gets {@code dossier.ai.free-monthly-quota} parses a month; a Pro user's
 * parses come out of the same monthly budget as everything else (13.1b), which also fixes the old
 * bug where Pro users were held to the Free count here (13.1a).
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

    public record Result(Status status, JsonNode parsed, int used, int quota, Instant resetsAt) {}

    private final AiProvider provider;
    private final AiMeteringService metering;
    private final AiBudgetService budget;
    private final ObjectMapper om = new ObjectMapper();
    private final boolean enabled;

    public AiResumeParseService(
        AiProvider provider,
        AiMeteringService metering,
        AiBudgetService budget,
        @Value("${dossier.ai.enabled:false}") boolean enabled
    ) {
        this.provider = provider;
        this.metering = metering;
        this.budget = budget;
        this.enabled = enabled;
    }

    public Result parse(String text, String fileBase64, String fileMimeType, boolean consent) {
        if (!enabled || !provider.isConfigured()) {
            return new Result(Status.DISABLED, null, 0, 0, null);
        }

        String login = SecurityUtils.getCurrentUserLogin().orElseThrow(() ->
            new ResponseStatusException(HttpStatus.UNAUTHORIZED, "No authenticated user")
        );
        AiBudgetService.Decision d = budget.decide(login, AiTask.PARSE);
        if (d.verdict() == AiBudgetService.Verdict.TASK_DISABLED) {
            return new Result(Status.DISABLED, null, 0, 0, null);
        }
        if (!consent) {
            return new Result(Status.CONSENT_REQUIRED, null, 0, d.limit(), d.resetsAt());
        }
        if (d.verdict() == AiBudgetService.Verdict.EXHAUSTED) {
            return new Result(Status.QUOTA_EXCEEDED, null, d.used(), d.limit(), d.resetsAt());
        }

        AiResult result;
        JsonNode parsed;
        try {
            result = provider.parseResume(d.model(), text, fileBase64, fileMimeType);
            parsed = om.readTree(result.text());
        } catch (AiProviderException e) {
            // Provider/transport failure — nothing is charged; report a generic error.
            LOG.warn("AI resume parse failed for user: {}", e.getMessage());
            return new Result(Status.ERROR, null, d.used(), d.limit(), d.resetsAt());
        } catch (Exception e) {
            LOG.warn("AI resume parse returned unusable JSON: {}", e.getMessage());
            return new Result(Status.ERROR, null, d.used(), d.limit(), d.resetsAt());
        }

        metering.record(login, AiTask.PARSE, result);
        AiBudgetService.Decision after = budget.decide(login, AiTask.PARSE);
        return new Result(Status.OK, parsed, after.used(), after.limit(), after.resetsAt());
    }
}
