package com.dossier.api.service.retirement;

import static org.assertj.core.api.Assertions.assertThat;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.Subscription;
import com.dossier.api.domain.catalog.PlanRetirementItem;
import com.dossier.api.security.AuthoritiesConstants;
import com.dossier.api.service.billing.personal.SubFixtures;
import com.dossier.api.service.retirement.dto.RetirementDTOs.RetirementDTO;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.transaction.annotation.Transactional;

/**
 * K10.11 / docs/subscriptions/11 section 13 {@code DowngradeNeverDeletesIT}: the Free fallback locks, it never deletes. For every table that holds a row per account (found from
 * the schema, not listed by hand) the number of rows an account owns is the same or higher after the fallback; only the subscription lifecycle's own tables grow. A user with more
 * resumes than Free allows keeps every one.
 */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
@WithMockUser(username = "boss", authorities = AuthoritiesConstants.ADMIN)
@Import({ SubFixtures.CatalogPortConfig.class, RecordingStripeGateway.Config.class })
class DowngradeNeverDeletesIT extends RetirementItSupport {

    private Map<String, Long> counts(Long userId) {
        List<String> tables = db().queryForList("select distinct table_name from information_schema.columns where table_schema = database() and column_name = 'user_id' order by table_name", String.class);
        Map<String, Long> out = new LinkedHashMap<>();
        for (String t : tables) {
            Long n = jdbc.queryForObject("select count(*) from `" + t + "` where user_id = ?", Long.class, userId);
            out.put(t, n == null ? 0L : n);
        }
        return out;
    }

    @Test
    void noRowOfAnAccountIsEverRemovedByTheFallback() {
        Subscription s = monthly(40);
        Long userId = s.getUser().getId();
        RetirementFixtures.resumes(jdbc, userId, 12);
        RetirementFixtures.aiCall(jdbc, s.getUser().getLogin(), "ai.resume_tailoring");
        RetirementFixtures.addon(jdbc, s, "ai.credits_extra", "FEAT_AI_CREDITS", SubFixtures.AI_MONTH, 2);
        RetirementDTO r = startRetirement("FREE");
        PlanRetirementItem item = item(r, s);
        Map<String, Long> before = counts(userId);
        assertThat(before).containsEntry("resume", 12L).containsEntry("subscription", 1L).containsEntry("subscription_addon", 1L);

        job.run(after(item, 1));
        assertThat(item(r, s).getStatus()).isEqualTo("FELL_BACK");

        Map<String, Long> afterCounts = counts(userId);
        assertThat(afterCounts.keySet()).containsAll(before.keySet());
        before.forEach((table, n) -> assertThat(afterCounts.get(table)).as("rows of %s", table).isGreaterThanOrEqualTo(n));
        assertThat(afterCounts).containsEntry("resume", 12L).containsEntry("subscription", 1L).containsEntry("subscription_addon", 1L);
        assertThat(db().queryForObject("select count(*) from jhi_user where id = ?", Integer.class, userId)).isEqualTo(1);
        // the lifecycle's own tables are the only ones that grew
        afterCounts.forEach((table, n) -> {
            if (n > before.get(table)) assertThat(table).as("only the lifecycle writes").isIn("personal_subscription_change", "service_lock", "billing_notice", "notification", "subscription_quote", "plan_retirement_item");
        });
        assertThat(db().queryForObject("select count(*) from resume where user_id = ? and (archived is null or archived = false)", Integer.class, userId)).as("nothing archived either").isEqualTo(12);
    }
}
