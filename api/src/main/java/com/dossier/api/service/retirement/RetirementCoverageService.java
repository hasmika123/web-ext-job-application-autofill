package com.dossier.api.service.retirement;

import com.dossier.api.domain.Subscription;
import com.dossier.api.domain.catalog.PlanRetirement;
import com.dossier.api.domain.catalog.PlanRetirementItem;
import com.dossier.api.domain.catalog.PlanRetirementSuccessor;
import com.dossier.api.domain.ent.billing.FeatureDefinition;
import com.dossier.api.repository.SubscriptionRepository;
import com.dossier.api.repository.catalog.FeatureDefinitionRepository;
import com.dossier.api.repository.sub.PlanRetirementItemRepository;
import com.dossier.api.repository.sub.PlanRetirementRepository;
import com.dossier.api.repository.sub.PlanRetirementSuccessorRepository;
import com.dossier.api.repository.sub.PlanRepository;
import com.dossier.api.service.BillingException;
import com.dossier.api.service.catalog.CatalogException;
import com.dossier.api.service.retirement.SuccessorAdvisor.Evaluation;
import com.dossier.api.service.retirement.SuccessorAdvisor.Scored;
import com.dossier.api.service.retirement.dto.CoverageDTO;
import com.dossier.api.service.retirement.dto.CoverageDTO.GapFeature;
import com.dossier.api.service.retirement.dto.CoverageDTO.SuccessorCoverage;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The coverage preview of a retirement (story K10.2): every affected subscriber is evaluated against every ranked successor, so the admin sees how many would be
 * fully covered, how many keep gaps, and how many would pay more (the answer that decides whether {@code MIGRATE_AT_RENEWAL} is allowed). Works on a DRAFT (the
 * subscribers are computed now, nothing is written) and on a started retirement (its items). Read-only; no login leaves this class.
 */
@Service
public class RetirementCoverageService {

    private static final Logger LOG = LoggerFactory.getLogger(RetirementCoverageService.class);

    private final PlanRetirementRepository retirements;
    private final PlanRetirementItemRepository itemRepo;
    private final PlanRetirementSuccessorRepository successors;
    private final PlanRepository plans;
    private final SubscriptionRepository subscriptions;
    private final FeatureDefinitionRepository features;
    private final SuccessorAdvisor advisor;
    private final RetirementService retirementService;

    public RetirementCoverageService(
        PlanRetirementRepository retirements,
        PlanRetirementItemRepository itemRepo,
        PlanRetirementSuccessorRepository successors,
        PlanRepository plans,
        SubscriptionRepository subscriptions,
        FeatureDefinitionRepository features,
        SuccessorAdvisor advisor,
        RetirementService retirementService
    ) {
        this.retirements = retirements;
        this.itemRepo = itemRepo;
        this.successors = successors;
        this.plans = plans;
        this.subscriptions = subscriptions;
        this.features = features;
        this.advisor = advisor;
        this.retirementService = retirementService;
    }

    @Transactional(readOnly = true)
    public CoverageDTO coverage(long id) {
        PlanRetirement r = retirements.findById(id).orElseThrow(() -> CatalogException.notFound("retirement", String.valueOf(id)));
        Instant now = Instant.now();
        List<PlanRetirementItem> items = PlanRetirement.DRAFT.equals(r.getStatus()) ? retirementService.buildItems(r, now) : itemRepo.findByRetirementIdOrderByIdAsc(r.getId());
        List<PlanRetirementSuccessor> ranked = successors.findByRetirementIdOrderByRankNoAsc(r.getId());

        Map<String, int[]> perSuccessor = new LinkedHashMap<>(); // key -> {fully, gaps, more, notSold}
        for (PlanRetirementSuccessor s : ranked) perSuccessor.put(keyOf(s), new int[4]);
        Map<String, Integer> gapCounts = new LinkedHashMap<>();
        int subscribers = 0;
        int fully = 0;
        int gapped = 0;
        int more = 0;
        int unavailable = 0;
        for (PlanRetirementItem i : items) {
            if (PlanRetirementItem.EXCLUDED.equals(i.getStatus())) continue;
            Subscription sub = i.getSubscriptionId() == null ? null : subscriptions.findById(i.getSubscriptionId()).orElse(null);
            if (sub == null) continue;
            subscribers++;
            Evaluation ev;
            try {
                ev = advisor.evaluate(r, sub, now);
            } catch (BillingException e) {
                LOG.debug("coverage: prices unavailable ({})", e.getCode());
                unavailable++;
                continue;
            }
            Map<String, Scored> byKey = new LinkedHashMap<>();
            for (Scored s : ev.ranked()) byKey.put(s.suggestion().successorKey(), s);
            for (PlanRetirementSuccessor s : ranked) {
                int[] row = perSuccessor.get(keyOf(s));
                Scored sc = byKey.get(keyOf(s));
                if (sc == null) {
                    row[3]++;
                    continue;
                }
                if (sc.suggestion().gaps().isEmpty()) row[0]++;
                else row[1]++;
                if (sc.suggestion().deltaMinor() > 0) row[2]++;
            }
            Scored best = ev.best();
            if (best == null) {
                unavailable++;
                continue;
            }
            if (best.suggestion().gaps().isEmpty()) fully++;
            else {
                gapped++;
                for (String g : best.suggestion().gaps()) gapCounts.merge(g, 1, Integer::sum);
            }
            if (best.suggestion().deltaMinor() > 0) more++;
        }

        Map<String, String> names = new LinkedHashMap<>();
        for (FeatureDefinition d : features.findAllByOrderBySortOrderAsc()) names.put(d.getFeatureKey(), d.getName());
        List<SuccessorCoverage> bySuccessor = new ArrayList<>();
        for (PlanRetirementSuccessor s : ranked) {
            int[] row = perSuccessor.get(keyOf(s));
            String name = s.getSuccessorPlanKey() != null ? plans.findByPlanKey(s.getSuccessorPlanKey()).map(p -> p.getName()).orElse(s.getSuccessorPlanKey()) : names.getOrDefault(s.getSuccessorFeatureKey(), s.getSuccessorFeatureKey());
            bySuccessor.add(new SuccessorCoverage(s.getSuccessorPlanKey(), s.getSuccessorFeatureKey(), name, s.getRankNo(), row[0], row[1], row[2], row[3]));
        }
        List<GapFeature> gapFeatures = new ArrayList<>();
        gapCounts.entrySet().stream().sorted((a, b) -> b.getValue().compareTo(a.getValue())).forEach(e -> gapFeatures.add(new GapFeature(e.getKey(), names.getOrDefault(e.getKey(), e.getKey()), e.getValue())));
        boolean migrateAllowed = !ranked.isEmpty() && unavailable == 0 && perSuccessor.get(keyOf(ranked.get(0)))[3] == 0 && perSuccessor.get(keyOf(ranked.get(0)))[2] == 0;
        return new CoverageDTO(subscribers, fully, gapped, more, unavailable, List.copyOf(bySuccessor), List.copyOf(gapFeatures), migrateAllowed);
    }

    private static String keyOf(PlanRetirementSuccessor s) {
        return s.getSuccessorPlanKey() != null ? s.getSuccessorPlanKey() : s.getSuccessorFeatureKey();
    }
}
