package com.dossier.api.repository.sub;

import com.dossier.api.domain.sub.SubscriptionAddon;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

/** Access to {@code subscription_addon}. Writers: the webhook mirror and the change service only (an architecture test pins that). */
public interface SubscriptionAddonRepository extends Repository<SubscriptionAddon, Long> {
    <S extends SubscriptionAddon> S save(S entity);

    <S extends SubscriptionAddon> S saveAndFlush(S entity);

    long count();

    Optional<SubscriptionAddon> findById(Long id);

    /** The live rows of a subscription (a row scheduled for removal is still live until its end). */
    List<SubscriptionAddon> findBySubscriptionIdAndLiveTrueOrderByIdAsc(Long subscriptionId);

    Optional<SubscriptionAddon> findFirstBySubscriptionIdAndFeatureKeyAndLiveTrue(Long subscriptionId, String featureKey);

    /** Live rows whose scheduled end has passed: the settle step closes them. */
    @Query("select a from SubscriptionAddon a where a.live = true and a.endsAt is not null and a.endsAt <= :now order by a.id")
    List<SubscriptionAddon> findDueForClose(@Param("now") Instant now);

    List<SubscriptionAddon> findByUserIdAndLiveTrueOrderByIdAsc(Long userId);
}
