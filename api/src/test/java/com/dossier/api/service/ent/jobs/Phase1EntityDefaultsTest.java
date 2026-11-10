package com.dossier.api.service.ent.jobs;

import static org.assertj.core.api.Assertions.assertThat;

import com.dossier.api.domain.ent.mkt.MktOpportunity;
import com.dossier.api.domain.ent.mkt.MktPipelineApplicationLink;
import com.dossier.api.domain.ent.talent.ClientRequirement;
import com.dossier.api.domain.ent.talent.OrgResume;
import com.dossier.api.domain.ent.talent.RequirementMatch;
import com.dossier.api.domain.ent.talent.TalentApplication;
import jakarta.persistence.Column;
import jakarta.persistence.Version;
import java.lang.reflect.Field;
import java.util.List;
import org.junit.jupiter.api.Test;

/** The entity side of the Phase 1 migration (doc 60 section 1): the defaults the schema has, optimistic locking on the four rows, a read-only generated key. */
class Phase1EntityDefaultsTest {

    @Test
    void aResumeIsPendingUnlessACreatorSaysOtherwise() {
        assertThat(new OrgResume().getApprovalStatus()).isEqualTo("PENDING");
    }

    @Test
    void newRowsStartWithTheColumnDefaultsOfTheMigration() {
        ClientRequirement job = new ClientRequirement();
        assertThat(job.getCaptureSource()).isEqualTo("MANUAL");
        assertThat(job.getUrlKeyHash()).isNull();
        assertThat(job.getVersion()).isZero();
        MktOpportunity opp = new MktOpportunity();
        assertThat(opp.getState()).isEqualTo("ASSIGNED");
        assertThat(opp.getPriority()).isEqualTo("MEDIUM");
        assertThat(opp.getInterest()).isEqualTo("NO_RESPONSE");
        assertThat(opp.getVersion()).isZero();
        TalentApplication app = new TalentApplication();
        assertThat(app.getEntryPath()).isEqualTo("MARKETER");
        assertThat(app.getStageSource()).isEqualTo("MARKETER");
        assertThat(app.getPersonalApplicationId()).isNull();
        assertThat(new RequirementMatch().getVersion()).isZero();
    }

    @Test
    void theFourRowsAreOptimisticallyLockedOnANonNullVersion() throws Exception {
        for (Class<?> type : List.of(ClientRequirement.class, RequirementMatch.class, MktOpportunity.class, TalentApplication.class)) {
            Field version = type.getDeclaredField("version");
            assertThat(version.getType()).as(type.getSimpleName()).isEqualTo(long.class);
            assertThat(version.isAnnotationPresent(Version.class)).as(type.getSimpleName() + " @Version").isTrue();
            assertThat(version.getAnnotation(Column.class).nullable()).as(type.getSimpleName() + " nullable").isFalse();
        }
    }

    @Test
    void theLinksLiveKeyIsGeneratedByTheDatabaseAndNeverWritten() throws Exception {
        Column c = MktPipelineApplicationLink.class.getDeclaredField("liveKey").getAnnotation(Column.class);
        assertThat(c.name()).isEqualTo("live_key");
        assertThat(c.insertable()).isFalse();
        assertThat(c.updatable()).isFalse();
        assertThat(MktPipelineApplicationLink.class.getMethods()).extracting(m -> m.getName()).doesNotContain("setLiveKey");
    }
}
