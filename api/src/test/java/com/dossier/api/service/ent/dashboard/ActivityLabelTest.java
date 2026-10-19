package com.dossier.api.service.ent.dashboard;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * The audit action map behind the dashboard's Recent activity and the Audit Log (UI refresh Phase 1): every key reads as a sentence after the
 * actor's name, and no key is ever shown raw ("Priya Sharma marketing bulk" was the bug).
 */
class ActivityLabelTest {

    @Test
    void theKeysTheDemoEmitsReadAsSentences() {
        assertThat(ActivityRecentProvider.label("MARKETING_BULK")).isEqualTo("reassigned consultants");
        assertThat(ActivityRecentProvider.label("MARKETING_REASSIGN")).isEqualTo("reassigned a consultant");
        assertThat(ActivityRecentProvider.label("MARKETING_HANDOVER")).isEqualTo("handed a consultant over");
        assertThat(ActivityRecentProvider.label("MARKETER_JOB_CAPTURE")).isEqualTo("saved a job for a consultant");
        assertThat(ActivityRecentProvider.label("BILLING_PLAN_VIEW")).isEqualTo("viewed the plan");
        assertThat(ActivityRecentProvider.label("HISTORY_PURGED")).isEqualTo("purged old history");
        assertThat(ActivityRecentProvider.label("SHARE_SCOPE_CHANGED")).isEqualTo("changed what they share with the organization");
    }

    @Test
    void anUnmappedKeyIsWordedFromItsPartsNeverShownRaw() {
        assertThat(ActivityRecentProvider.label("MARKETER_OPPORTUNITY_ASSIGN")).isEqualTo("assigned an opportunity");
        assertThat(ActivityRecentProvider.label("MKT_SAVED_SEARCH_CREATE")).isEqualTo("created a saved search");
        assertThat(ActivityRecentProvider.label("PLACEMENT_EXTENSION_REQUEST")).isEqualTo("requested a placement extension");
        for (String key : List.of("MARKETER_STREAM_PAUSE", "OFFER_WITHDRAW", "SOMETHING_NEW", "X")) {
            String label = ActivityRecentProvider.label(key);
            assertThat(label).as(key).isNotBlank().doesNotContain("_").isEqualTo(label.toLowerCase(java.util.Locale.ROOT));
        }
        assertThat(ActivityRecentProvider.label((String) null)).isEqualTo("made a change");
    }
}
