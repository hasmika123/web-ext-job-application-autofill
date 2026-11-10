package com.dossier.api.repository.sub;

import com.dossier.api.domain.catalog.PlanRetirementItem;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/** Platform access to {@code plan_retirement_item}. */
public interface PlanRetirementItemRepository extends JpaRepository<PlanRetirementItem, Long> {
    List<PlanRetirementItem> findByRetirementIdOrderByIdAsc(Long retirementId);

    long countByRetirementId(Long retirementId);

    long countByRetirementIdAndStatus(Long retirementId, String status);

    Optional<PlanRetirementItem> findByRetirementIdAndSubscriptionId(Long retirementId, Long subscriptionId);

    @Query(
        "select i from PlanRetirementItem i where i.retirementId = :rid and (:status is null or i.status = :status) and (:iv is null or i.billingInterval = :iv) order by i.id"
    )
    Page<PlanRetirementItem> search(@Param("rid") Long retirementId, @Param("status") String status, @Param("iv") String interval, Pageable page);

    /** Items of a user in a retirement that is still being noticed or completed, newest retirement first. */
    @Query(
        "select i from PlanRetirementItem i where i.userId = :userId and i.retirementId in (select r.id from PlanRetirement r where r.status in ('NOTICING','COMPLETING')) order by i.id desc"
    )
    List<PlanRetirementItem> findOpenByUserId(@Param("userId") Long userId);

    /** Every item of a user, newest first (the fallback block shows the most recent FELL_BACK one). */
    List<PlanRetirementItem> findByUserIdOrderByIdDesc(Long userId);

    /** Items whose date has arrived and that have not been applied: the effective-date pass of the retirement job. */
    @Query(
        "select i from PlanRetirementItem i where i.appliedAt is null and i.status in ('PENDING','CANCELLED','SWITCH_SCHEDULED') and i.retireEffectiveAt <= :now "
            + "and i.retirementId in (select r.id from PlanRetirement r where r.status in ('NOTICING','COMPLETING')) order by i.id"
    )
    List<PlanRetirementItem> findDue(@Param("now") Instant now);

    /** Undecided items about to reach their date whose Stripe subscription has not been told yet: the D-1 pass. */
    @Query(
        "select i from PlanRetirementItem i where i.appliedAt is null and i.status = 'PENDING' and i.cancelSetAt is null and i.retireEffectiveAt > :now and i.retireEffectiveAt <= :horizon "
            + "and i.retirementId in (select r.id from PlanRetirement r where r.status in ('NOTICING','COMPLETING') and r.defaultOutcome in ('FREE','CANCEL')) order by i.id"
    )
    List<PlanRetirementItem> findForCancelLead(@Param("now") Instant now, @Param("horizon") Instant horizon);

    /** Items still undecided (the notice job's cohort). */
    @Query(
        "select i from PlanRetirementItem i where i.retirementId = :rid and i.status = 'PENDING' and i.appliedAt is null order by i.id"
    )
    List<PlanRetirementItem> findPending(@Param("rid") Long retirementId);

    /** Items that still need the job: not applied and not excluded. */
    @Query(
        "select count(i) from PlanRetirementItem i where i.retirementId = :rid and i.appliedAt is null and i.status in :statuses"
    )
    long countUnapplied(@Param("rid") Long retirementId, @Param("statuses") Collection<String> statuses);

    List<PlanRetirementItem> findBySuggestedQuoteId(Long quoteId);
}
