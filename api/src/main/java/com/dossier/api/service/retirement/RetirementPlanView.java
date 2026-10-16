package com.dossier.api.service.retirement;

import com.dossier.api.domain.catalog.PlanRetirement;
import com.dossier.api.domain.catalog.PlanRetirementItem;
import com.dossier.api.repository.sub.PlanRetirementRepository;
import com.dossier.api.repository.sub.PlanRetirementSuccessorRepository;
import com.dossier.api.repository.sub.PlanRetirementItemRepository;
import com.dossier.api.service.dto.PlanDTO;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.Optional;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * The additive block of {@code GET /api/billing/me} that a retirement adds (docs/subscriptions/11 section 12; story K10.4): {@code sunset}, only while the subscriber's plan is
 * being retired and their date is ahead (the web banner reads {@code sunset.successorPlanKey}). A subscriber outside a retirement gets nothing extra, so their body is byte for
 * byte what it was. Read-only.
 */
@Component
public class RetirementPlanView {

    private final PlanRetirementItemRepository itemRepo;
    private final PlanRetirementRepository retirements;
    private final PlanRetirementSuccessorRepository successors;
    private final ObjectMapper json;

    public RetirementPlanView(
        PlanRetirementItemRepository itemRepo,
        PlanRetirementRepository retirements,
        PlanRetirementSuccessorRepository successors,
        ObjectMapper json
    ) {
        this.itemRepo = itemRepo;
        this.retirements = retirements;
        this.successors = successors;
        this.json = json;
    }

    /** The banner block for a plan retirement that is running for this user and whose date has not come; null otherwise (add-on retirements show on the add-on, not as a sunset). */
    @Transactional(readOnly = true)
    public PlanDTO.Sunset sunset(Long userId) {
        for (PlanRetirementItem i : itemRepo.findOpenByUserId(userId)) {
            if (PlanRetirementItem.EXCLUDED.equals(i.getStatus()) || i.getAppliedAt() != null) continue;
            Optional<PlanRetirement> r = retirements.findById(i.getRetirementId());
            if (r.isEmpty() || !PlanRetirement.KIND_PLAN.equals(r.get().getKind())) continue;
            return new PlanDTO.Sunset(successorKey(r.get(), i), r.get().getId(), i.getRetireEffectiveAt(), r.get().getDefaultOutcome(), i.getStatus());
        }
        return null;
    }

    private String successorKey(PlanRetirement r, PlanRetirementItem item) {
        if (item.getSuggestionJson() != null) {
            try {
                JsonNode n = json.readTree(item.getSuggestionJson());
                if (n.hasNonNull("successorKey") && !"FREE".equals(n.path("kind").asText(""))) return n.get("successorKey").asText();
            } catch (JsonProcessingException e) {
                // fall through to the admin's ranking
            }
        }
        return successors.findByRetirementIdOrderByRankNoAsc(r.getId()).stream().map(s -> s.getSuccessorPlanKey()).filter(java.util.Objects::nonNull).findFirst().orElse(null);
    }
}
