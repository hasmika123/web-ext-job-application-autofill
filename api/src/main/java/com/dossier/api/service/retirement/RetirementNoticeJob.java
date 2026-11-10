package com.dossier.api.service.retirement;

import com.dossier.api.domain.catalog.PlanRetirement;
import com.dossier.api.domain.catalog.PlanRetirementItem;
import com.dossier.api.repository.sub.PlanRetirementItemRepository;
import com.dossier.api.repository.sub.PlanRetirementRepository;
import java.time.Instant;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * The retirement notice run (docs/subscriptions/11 section 4.1; story K10.3). Hourly, so the first notice of a retirement goes out soon after it starts and a missed run
 * costs an hour, not a day: for every undecided subscriber of a live retirement it makes sure a suggestion exists (so the notice can name the closest match), then sends the
 * notice that is due. {@link RetirementNoticeService} dedupes on {@code RET:{retirementId}:{subscriptionId}:{days}}, so running it twice, or on two nodes, sends once.
 * A subscriber who has chosen is not PENDING any more and gets nothing further. Subscribers who joined the plan after the retirement started get an item here too.
 */
@Component
public class RetirementNoticeJob {

    private static final Logger LOG = LoggerFactory.getLogger(RetirementNoticeJob.class);

    private final PlanRetirementRepository retirements;
    private final PlanRetirementItemRepository itemRepo;
    private final RetirementService retirementService;
    private final RetirementSuggestionService suggestions;
    private final RetirementNoticeService notices;

    public RetirementNoticeJob(
        PlanRetirementRepository retirements,
        PlanRetirementItemRepository itemRepo,
        RetirementService retirementService,
        RetirementSuggestionService suggestions,
        RetirementNoticeService notices
    ) {
        this.retirements = retirements;
        this.itemRepo = itemRepo;
        this.retirementService = retirementService;
        this.suggestions = suggestions;
        this.notices = notices;
    }

    @Scheduled(fixedDelay = 3_600_000L, initialDelay = 600_000L)
    public void scheduled() {
        try {
            int sent = run(Instant.now());
            if (sent > 0) LOG.info("retirement notices: {} sent", sent);
        } catch (RuntimeException e) {
            LOG.warn("retirement notice run failed: {}", e.toString());
        }
    }

    /** One pass at {@code now}; returns how many notices were sent. Never throws for one subscriber's failure. */
    public int run(Instant now) {
        int sent = 0;
        for (PlanRetirement r : retirements.findByStatusInOrderByIdAsc(List.of(PlanRetirement.NOTICING, PlanRetirement.COMPLETING))) {
            if (PlanRetirement.MODE_KEEP_INDEFINITELY.equals(r.getMode())) continue;
            try {
                retirementService.addLateItems(r.getId());
            } catch (RuntimeException e) {
                LOG.warn("retirement {}: late subscribers could not be added: {}", r.getId(), e.toString());
            }
            for (PlanRetirementItem i : itemRepo.findPending(r.getId())) {
                try {
                    if (i.getSuggestionJson() == null) ensureSuggestion(r, i, now);
                    PlanRetirementItem fresh = itemRepo.findById(i.getId()).orElse(i);
                    if (notices.sendDue(r, fresh, now)) sent++;
                } catch (RuntimeException e) {
                    LOG.warn("retirement {} item {}: notice failed: {}", r.getId(), i.getId(), e.toString());
                }
            }
        }
        return sent;
    }

    private void ensureSuggestion(PlanRetirement r, PlanRetirementItem i, Instant now) {
        try {
            suggestions.refresh(r, i, now);
        } catch (RuntimeException e) {
            LOG.debug("retirement {} item {}: no suggestion yet ({}); the notice goes without one", r.getId(), i.getId(), e.toString());
        }
    }
}
