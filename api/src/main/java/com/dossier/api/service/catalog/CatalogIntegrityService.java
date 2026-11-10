package com.dossier.api.service.catalog;

import com.dossier.api.domain.catalog.BillingDrift;
import com.dossier.api.domain.catalog.PlanVersion;
import com.dossier.api.repository.sub.BillingDriftRepository;
import com.dossier.api.repository.sub.PlanRepository;
import com.dossier.api.repository.sub.PlanVersionRepository;
import com.dossier.api.service.catalog.plan.PlanSnapshot;
import java.time.Instant;
import java.util.HashSet;
import java.util.Set;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Invariant 3 of docs/subscriptions/02 section 7: a published plan version is byte-immutable. This re-hashes the stored snapshot of every published version
 * and records a {@code billing_drift kind=CATALOG code=SNAPSHOT_HASH} row when it no longer matches the hash stored at publish. It never repairs anything; a
 * match resolves its own earlier row.
 */
@Service
public class CatalogIntegrityService {

    public static final String CODE = "SNAPSHOT_HASH";

    private final PlanVersionRepository versions;
    private final PlanRepository plans;
    private final BillingDriftRepository drifts;
    private final PlanSnapshot snapshots;

    public CatalogIntegrityService(PlanVersionRepository versions, PlanRepository plans, BillingDriftRepository drifts, PlanSnapshot snapshots) {
        this.versions = versions;
        this.plans = plans;
        this.drifts = drifts;
        this.snapshots = snapshots;
    }

    public record Result(int checked, int mismatched, int resolved) {}

    @Transactional
    public Result run() {
        int checked = 0;
        int bad = 0;
        Set<String> current = new HashSet<>();
        for (PlanVersion v : versions.findHashed()) {
            if (v.getPublishKey() == null) continue; // a seeded snapshot was hashed over its raw text before MySQL normalised it: only versions published through PlanService are checked (P-16)
            checked++;
            String subject = "plan:" + plans.findById(v.getPlanId()).map(p -> p.getPlanKey()).orElse(String.valueOf(v.getPlanId())) + ":v" + v.getVersion();
            String actual;
            try {
                actual = v.getSnapshotJson() == null ? "" : snapshots.hash(v.getSnapshotJson());
            } catch (IllegalArgumentException e) {
                actual = "unreadable";
            }
            if (actual.equals(v.getSnapshotHash())) continue;
            bad++;
            current.add(subject);
            if (drifts.findOpenOne(CatalogReconciler.KIND, CODE, subject).isEmpty()) {
                BillingDrift d = new BillingDrift();
                d.setKind(CatalogReconciler.KIND);
                d.setCode(CODE);
                d.setSubject(subject);
                d.setExpectedJson("{\"snapshotHash\":\"" + v.getSnapshotHash() + "\"}");
                d.setActualJson("{\"snapshotHash\":\"" + actual + "\"}");
                d.setDetectedAt(Instant.now());
                drifts.save(d);
            }
        }
        int resolved = 0;
        for (BillingDrift d : drifts.findOpen(CatalogReconciler.KIND)) {
            if (CODE.equals(d.getCode()) && !current.contains(d.getSubject())) {
                d.setResolvedAt(Instant.now());
                d.setResolvedBy("system");
                d.setNote("The snapshot matches its hash again.");
                drifts.save(d);
                resolved++;
            }
        }
        return new Result(checked, bad, resolved);
    }
}
