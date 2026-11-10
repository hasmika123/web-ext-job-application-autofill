package com.dossier.api.service;

import com.dossier.api.repository.AiCallRepository;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * A small daily cap on AI calls for the shared demo accounts (demo sandbox). It sits on top of the
 * normal plan and budget checks in {@link AiBudgetService#decide}, so a demo account can never spend
 * more than {@code dossier.demo.ai-calls-per-day} successful calls per UTC day (env
 * {@code DEMO_AI_CALLS_PER_DAY}, default 10; 0 turns demo AI off). Real users are never affected.
 */
@Component
public class DemoAiCap {

    private final AiCallRepository calls;
    private final int perDay;

    public DemoAiCap(AiCallRepository calls, @Value("${dossier.demo.ai-calls-per-day:10}") int perDay) {
        this.calls = calls;
        this.perDay = Math.max(0, perDay);
    }

    /** True when {@code login} is a demo account that has used up today's AI calls. */
    public boolean reached(String login, Instant now) {
        if (login == null || !DemoAccountService.isDemoLogin(login)) {
            return false;
        }
        return perDay == 0 || calls.countSuccessfulSince(login, now.truncatedTo(ChronoUnit.DAYS)) >= perDay;
    }

    /** When the daily count starts again: the next UTC midnight. */
    public Instant resetsAt(Instant now) {
        return now.atZone(ZoneOffset.UTC).toLocalDate().plusDays(1).atStartOfDay(ZoneOffset.UTC).toInstant();
    }
}
