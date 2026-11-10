package com.dossier.api.service.catalog;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.dossier.api.IntegrationTest;
import com.dossier.api.security.AuthoritiesConstants;
import com.dossier.api.service.billing.margin.MarginBelowFloorException;
import com.dossier.api.service.catalog.dto.CatalogPriceDTOs.PriceDTO;
import com.dossier.api.service.catalog.dto.PlanDTOs.ComponentRequest;
import com.dossier.api.service.catalog.dto.PlanDTOs.CreatePlanRequest;
import com.dossier.api.service.catalog.dto.PlanDTOs.DiscardRequest;
import com.dossier.api.service.catalog.dto.PlanDTOs.NewVersionRequest;
import com.dossier.api.service.catalog.dto.PlanDTOs.PlanVersionDTO;
import com.dossier.api.service.catalog.dto.PlanDTOs.PublishPlanRequest;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.transaction.annotation.Transactional;

/**
 * K2.2 and K9.1 on MySQL: the plan builder publishes the seeded PRO draft with monthly, quarterly and derived yearly rows under the margin guard, one catalog
 * version, a snapshot and its hash; refuses what is incoherent (missing price, missing dependency, a margin below the floor, a Free plan that charges); and a
 * published version never changes. (PlanServiceTest, PlanValidatorTest, PlanPublishIT, AnnualDerivationTest and CatalogIntegrityJobTest of the stories.)
 */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
@WithMockUser(username = "boss", authorities = AuthoritiesConstants.ADMIN)
class PlanPublishIT extends PlanItSupport {

    @Autowired private com.dossier.api.service.settings.SettingsService settings;
    @Autowired private CatalogIntegrityService integrity;
    @jakarta.persistence.PersistenceContext private jakarta.persistence.EntityManager em;

    /** PRO v1 as the locked launch prices: 1999 a month, 4999 a quarter (800 cents of AI), no optional add-ons, the three intervals. */
    private void priceProV1(boolean withYear) {
        draft("PRO", "INDIVIDUAL", "MONTH", 1999);
        draft("PRO", "INDIVIDUAL", "QUARTER", 4999);
        withoutOptionals("PRO", 1);
        patch("PRO", 1, withYear ? "{\"intervals\":[\"MONTH\",\"QUARTER\",\"YEAR\"]}" : "{\"intervals\":[\"MONTH\",\"QUARTER\"]}");
    }

    private static void assertCode(Runnable r, int status, String code) {
        assertThatThrownBy(r::run).isInstanceOfSatisfying(CatalogException.class, e -> {
            assertThat(e.getStatus()).isEqualTo(status);
            assertThat(e.getCode()).isEqualTo(code);
        });
    }

    @Test
    void publishesProWithMonthlyQuarterlyAndDerivedYearlyRowsUnderOneCatalogVersion() {
        priceProV1(true);
        int before = catalog.currentVersion();
        PlanVersionDTO v = publish("PRO", 1);

        assertThat(v.status()).isEqualTo("PUBLISHED");
        assertThat(v.catalogVersion()).isEqualTo(before + 1);
        assertThat(catalog.currentVersion()).isEqualTo(before + 1);
        assertThat(v.snapshotHash()).hasSize(64);
        assertThat(v.baseProduct().prices()).extracting(p -> p.interval() + ":" + p.amountMinor()).containsExactly("MONTH:1999", "QUARTER:4999", "YEAR:21589");
        assertThat(v.baseProduct().prices()).filteredOn(p -> p.interval().equals("YEAR")).allMatch(p -> p.derived());
        Map<String, Object> year = jdbc.queryForMap(
            "select annual_source, derived_discount_bp, derived_from_price_id, catalog_version, pp.active from product_price pp join product p on p.id = pp.product_id where p.code = 'PRO' and pp.billing_interval = 'YEAR'"
        );
        assertThat(year.get("annual_source")).isEqualTo("DERIVED");
        assertThat(((Number) year.get("derived_discount_bp")).intValue()).isEqualTo(1000);
        assertThat(((Number) year.get("catalog_version")).intValue()).isEqualTo(before + 1);
        Map<String, Object> publishRow = jdbc.queryForMap("select price_ids_json, plan_version_ids_json from catalog_publish where id = ?", before + 1);
        assertThat(publishRow.get("price_ids_json").toString()).contains(",");
        assertThat(publishRow.get("plan_version_ids_json").toString()).contains(String.valueOf(jdbc.queryForObject("select id from plan_version where id = (select v.id from plan_version v join plan p on p.id = v.plan_id where p.plan_key = 'PRO' and v.version = 1)", Long.class)));
        assertThat(jdbc.queryForObject("select status from plan where plan_key = 'PRO'", String.class)).isEqualTo("PUBLISHED");
        assertThat(jdbc.queryForObject("select count(*) from admin_audit_event where action = 'PLAN_PUBLISHED' and target_id = 'plan:PRO:v1'", Integer.class)).isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from catalog_change where entity = 'plan_version' and entity_id = 'PRO:1'", Integer.class)).isGreaterThanOrEqualTo(1);
    }

    @Test
    void aReplayWithTheSameIdempotencyKeyAnswersTheSameVersionAndNeverPublishesTwice() {
        priceProV1(false);
        String k = key();
        PlanVersionDTO first = plans.publish("PRO", 1, publishRequest(1, null), k);
        int after = catalog.currentVersion();
        long publishes = jdbc.queryForObject("select count(*) from catalog_publish", Long.class);
        PlanVersionDTO again = plans.publish("PRO", 1, publishRequest(1, null), k);
        assertThat(again.catalogVersion()).isEqualTo(first.catalogVersion());
        assertThat(again.snapshotHash()).isEqualTo(first.snapshotHash());
        assertThat(catalog.currentVersion()).isEqualTo(after);
        assertThat(jdbc.queryForObject("select count(*) from catalog_publish", Long.class)).isEqualTo(publishes);
        assertCode(() -> plans.publish("PRO", 1, publishRequest(1, null), key()), 409, "NOT_DRAFT");
    }

    @Test
    void thePublishNeedsAnIdempotencyKeyTheTypedVersionAndAReason() {
        priceProV1(false);
        assertCode(() -> plans.publish("PRO", 1, publishRequest(1, null), null), 400, "IDEMPOTENCY_KEY_REQUIRED");
        assertCode(() -> plans.publish("PRO", 1, new PublishPlanRequest(null, null, 2, REASON), key()), 412, "CONFIRM_MISMATCH");
        assertCode(() -> plans.publish("PRO", 1, new PublishPlanRequest(null, null, null, REASON), key()), 412, "CONFIRM_MISMATCH");
        assertCode(() -> plans.publish("PRO", 1, new PublishPlanRequest(null, null, 1, "short"), key()), 422, "REASON_REQUIRED");
        assertThat(plans.getVersion("PRO", 1).status()).isEqualTo("DRAFT");
    }

    @Test
    void anOptionalComponentWithoutAMonthPriceBlocksThePublish() {
        draft("PRO", "INDIVIDUAL", "MONTH", 1999);
        draft("PRO", "INDIVIDUAL", "QUARTER", 4999);
        // the seeded PRO draft still lists the unpriced optional add-ons
        assertThatThrownBy(() -> publish("PRO", 1)).isInstanceOfSatisfying(CatalogException.class, e -> {
            assertThat(e.getStatus()).isEqualTo(422);
            assertThat(e.getCode()).isEqualTo("PLAN_PRICE_MISSING");
            assertThat(e.getExtra()).containsEntry("interval", "MONTH").containsEntry("currency", "USD");
            assertThat(e.getExtra().get("featureKey")).isIn("ai.credits_extra", "resume.extra_pack", "support.priority");
        });
        assertThat(plans.getVersion("PRO", 1).status()).isEqualTo("DRAFT");
    }

    @Test
    void anOptionalAddonMayLackAQuarterlyPriceButNotAMonthlyOne() {
        priceProV1(false);
        List<ComponentRequest> list = new java.util.ArrayList<>(componentsOf(plans.getVersion("PRO", 1)));
        list.add(optional("ai.credits_extra", "FEAT_AI_CREDITS", 4));
        withComponents("PRO", 1, list);
        live("FEAT_AI_CREDITS", "INDIVIDUAL", "MONTH", 499);
        PlanVersionDTO v = publish("PRO", 1);
        assertThat(v.status()).isEqualTo("PUBLISHED");
        assertThat(v.components()).filteredOn(c -> c.featureKey().equals("ai.credits_extra")).first().satisfies(c -> assertThat(c.prices()).extracting(p -> p.interval()).containsExactly("MONTH"));
    }

    @Test
    void aMarginBelowTheFloorBlocksThePublishWithLeversUnlessAnAuditedReasonOverridesIt() {
        draft("PRO", "INDIVIDUAL", "MONTH", 1499);
        draft("PRO", "INDIVIDUAL", "QUARTER", 4999);
        withoutOptionals("PRO", 1);
        assertThatThrownBy(() -> publish("PRO", 1)).isInstanceOfSatisfying(MarginBelowFloorException.class, e -> {
            assertThat(e.first().interval().name()).isEqualTo("MONTH");
            assertThat(e.first().marginBp()).isLessThan(8000);
            assertThat(e.first().levers().minPriceMinor()).isGreaterThan(1499);
            assertThat(e.overrideAllowed()).isTrue();
            assertThat(e.reasonMissing()).isTrue();
        });
        assertThatThrownBy(() -> plans.publish("PRO", 1, publishRequest(1, "too short"), key())).isInstanceOf(MarginBelowFloorException.class);
        assertThat(plans.getVersion("PRO", 1).status()).isEqualTo("DRAFT");

        PlanVersionDTO v = plans.publish("PRO", 1, publishRequest(1, "Founding price agreed for the launch cohort"), key());
        assertThat(v.status()).isEqualTo("PUBLISHED");
        assertThat(jdbc.queryForObject("select count(*) from admin_audit_event where action = 'CATALOG_MARGIN_OVERRIDE' and target_id = 'plan:PRO:v1'", Integer.class)).isEqualTo(1);
        assertThat(jdbc.queryForObject("select details from admin_audit_event where action = 'CATALOG_MARGIN_OVERRIDE' and target_id = 'plan:PRO:v1'", String.class)).contains("risk=HIGH").contains("PRO/MONTH");
    }

    @Test
    void aDerivedYearlyRowThatFailsIsRefusedEvenWithAnOverrideReason() {
        priceProV1(true);
        patch("PRO", 1, "{\"annualDiscountBp\":1500}"); // the doc's refused case: 7929 bp
        assertThatThrownBy(() -> plans.publish("PRO", 1, publishRequest(1, "A long reason that would pass for a normal row"), key())).isInstanceOfSatisfying(MarginBelowFloorException.class, e -> {
            assertThat(e.overrideAllowed()).isFalse();
            assertThat(e.first().interval().name()).isEqualTo("YEAR");
            assertThat(e.first().marginBp()).isEqualTo(7929);
            assertThat(e.first().levers().maxDiscountBp()).isNotNull().isLessThan(1500);
        });
        patch("PRO", 1, "{\"annualDiscountBp\":1000}");
        assertThat(publish("PRO", 1).status()).isEqualTo("PUBLISHED");
    }

    @Test
    void anExplicitYearlyDraftOutranksTheDerivationAndStillGoesThroughTheGuard() {
        priceProV1(true);
        PriceDTO year = catalog.createDraft(new com.dossier.api.service.catalog.dto.CatalogPriceDTOs.PriceRequest(product("PRO").getId(), "INDIVIDUAL", "YEAR", 22000L, "USD", null, null, false, null, "EXPLICIT", null, null, null, REASON));
        PlanVersionDTO v = publish("PRO", 1);
        assertThat(v.baseProduct().prices()).filteredOn(p -> p.interval().equals("YEAR")).singleElement().satisfies(p -> {
            assertThat(p.amountMinor()).isEqualTo(22000);
            assertThat(p.derived()).isFalse();
            assertThat(p.priceId()).isEqualTo(year.id());
        });
    }

    @Test
    void withAnnualBillingSwitchedOffYearIsRefusedAndNoDerivedRowIsCreated() {
        priceProV1(false);
        settings.set(com.dossier.api.service.settings.BillingSettingKeys.ANNUAL_ENABLED, com.fasterxml.jackson.databind.node.BooleanNode.FALSE, "Switch yearly billing off for the test");
        assertCode(() -> patch("PRO", 1, "{\"intervals\":[\"MONTH\",\"QUARTER\",\"YEAR\"]}"), 422, "INTERVAL_NOT_ENABLED");
        PlanVersionDTO v = publish("PRO", 1);
        assertThat(v.baseProduct().prices()).extracting(p -> p.interval()).doesNotContain("YEAR");
        assertThat(jdbc.queryForObject("select count(*) from product_price where billing_interval = 'YEAR' and annual_source = 'DERIVED'", Integer.class)).isZero();
    }

    @Test
    void autopilotWithoutAiJobMatchingIsIncoherentAndRefused() {
        List<ComponentRequest> noMatching = componentsOf(plans.getVersion("AUTOPILOT", 1)).stream().filter(c -> !c.featureKey().equals("ai.job_matching")).toList();
        withComponents("AUTOPILOT", 1, noMatching);
        assertThatThrownBy(() -> publish("AUTOPILOT", 1)).isInstanceOfSatisfying(CatalogException.class, e -> {
            assertThat(e.getCode()).isEqualTo("PLAN_DEPENDENCY_MISSING");
            assertThat(e.getExtra()).containsEntry("featureKey", "automation.approved_apply").containsEntry("requires", "ai.job_matching");
        });
    }

    @Test
    void aTechnicalDependencyForAnotherAudienceDoesNotApplyToAnIndividualPlan() {
        // ai.job_matching technically requires base.consultant, which is an ORG service: an individual plan never needs it (B-03)
        priceProV1(false);
        assertThat(publish("PRO", 1).status()).isEqualTo("PUBLISHED");
    }

    @Test
    void aFreeVersionWithAPricedOptionalComponentIsRefused() {
        PlanVersionDTO v2 = plans.newVersion("FREE", new NewVersionRequest(null, REASON));
        List<ComponentRequest> list = new java.util.ArrayList<>(componentsOf(v2));
        list.add(optional("ai.credits_extra", "FEAT_AI_CREDITS", 4));
        withComponents("FREE", v2.version(), list);
        assertCode(() -> publish("FREE", v2.version()), 422, "FREE_PLAN_PRICED");
    }

    @Test
    void aNewVersionSupersedesTheLiveOneWhichStaysServableAndOnlyOneIsEverLive() {
        PlanVersionDTO v2 = plans.newVersion("FREE", new NewVersionRequest(null, REASON));
        assertThat(v2.version()).isEqualTo(2);
        assertThat(v2.components()).hasSameSizeAs(plans.getVersion("FREE", 1).components());
        assertCode(() -> plans.newVersion("FREE", new NewVersionRequest(null, REASON)), 409, "DRAFT_EXISTS");
        PlanVersionDTO live = publish("FREE", 2);
        assertThat(live.status()).isEqualTo("PUBLISHED");
        PlanVersionDTO old = plans.getVersion("FREE", 1);
        assertThat(old.status()).isEqualTo("SUPERSEDED");
        assertThat(old.effectiveUntil()).isNotNull();
        assertThat(old.components()).isNotEmpty();
        assertThat(jdbc.queryForObject("select count(*) from plan_version v join plan p on p.id = v.plan_id where p.plan_key = 'FREE' and v.status = 'PUBLISHED'", Integer.class)).isEqualTo(1);
    }

    @Test
    void aPublishedVersionIsImmutableAndItsHashNeverChanges() {
        priceProV1(false);
        PlanVersionDTO v = publish("PRO", 1);
        String hash = v.snapshotHash();
        assertCode(() -> patch("PRO", 1, "{\"summary\":\"tamper\"}"), 409, "NOT_DRAFT");
        assertCode(() -> withComponents("PRO", 1, List.of()), 409, "NOT_DRAFT");
        assertCode(() -> plans.discard("PRO", 1, new DiscardRequest(null)), 409, "NOT_DRAFT");
        assertThat(plans.getVersion("PRO", 1).snapshotHash()).isEqualTo(hash);
        // a later version with other prices leaves the first one's snapshot, prices and hash alone
        PlanVersionDTO v2 = plans.newVersion("PRO", new NewVersionRequest(null, REASON));
        draft("PRO", "INDIVIDUAL", "MONTH", 2199);
        publish("PRO", v2.version());
        PlanVersionDTO first = plans.getVersion("PRO", 1);
        assertThat(first.status()).isEqualTo("SUPERSEDED");
        assertThat(first.snapshotHash()).isEqualTo(hash);
        assertThat(first.baseProduct().prices()).extracting(p -> p.interval() + ":" + p.amountMinor()).containsExactly("MONTH:1999", "QUARTER:4999");
        assertThat(plans.getVersion("PRO", 2).baseProduct().prices()).extracting(p -> p.interval() + ":" + p.amountMinor()).contains("MONTH:2199", "QUARTER:4999");
    }

    @Test
    void theIntegrityJobFlagsATamperedSnapshotAndResolvesItWhenRestored() {
        priceProV1(false);
        publish("PRO", 1);
        assertThat(integrity.run().mismatched()).isZero();
        em.flush();
        String original = jdbc.queryForObject("select snapshot_json from plan_version v join plan p on p.id = v.plan_id where p.plan_key = 'PRO' and v.version = 1", String.class);
        jdbc.update("update plan_version v join plan p on p.id = v.plan_id set v.snapshot_json = json_set(v.snapshot_json, '$.aiBudgetCapCents', 99999) where p.plan_key = 'PRO' and v.version = 1");
        em.clear();
        CatalogIntegrityService.Result r = integrity.run();
        assertThat(r.mismatched()).isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from billing_drift where kind = 'CATALOG' and code = 'SNAPSHOT_HASH' and subject = 'plan:PRO:v1' and resolved_at is null", Integer.class)).isEqualTo(1);
        assertThat(integrity.run().mismatched()).isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from billing_drift where code = 'SNAPSHOT_HASH' and subject = 'plan:PRO:v1'", Integer.class)).as("no duplicate row").isEqualTo(1);
        jdbc.update("update plan_version v join plan p on p.id = v.plan_id set v.snapshot_json = ? where p.plan_key = 'PRO' and v.version = 1", original);
        em.clear();
        assertThat(integrity.run().resolved()).isEqualTo(1);
        em.flush();
        assertThat(jdbc.queryForObject("select count(*) from billing_drift where code = 'SNAPSHOT_HASH' and resolved_at is null", Integer.class)).isZero();
    }

    // ---- the invariants of the component list -------------------------------------------------------------------------------

    @Test
    void rolesMustFitTheAudienceAndAServiceAppearsOnce() {
        List<ComponentRequest> seat = List.of(new ComponentRequest("base.consultant", "SEAT_BASE", product("ORG_BASE_LICENSE").getId(), null, null, null, null, null, null, null));
        assertThatThrownBy(() -> withComponents("PRO", 1, seat)).isInstanceOfSatisfying(CatalogException.class, e -> assertThat(e.getCode()).isEqualTo("ROLE_INVALID_FOR_AUDIENCE"));
        assertThatThrownBy(() -> withComponents("PRO", 1, List.of(included("resume.library"), included("resume.library")))).isInstanceOfSatisfying(CatalogException.class, e -> assertThat(e.getCode()).isEqualTo("DUPLICATE_COMPONENT"));
        // an OPTIONAL duplicating an INCLUDED one is the same rule
        assertThatThrownBy(() -> withComponents("PRO", 1, List.of(included("ai.credits_extra"), optional("ai.credits_extra", "FEAT_AI_CREDITS", 4)))).isInstanceOfSatisfying(CatalogException.class, e -> assertThat(e.getCode()).isEqualTo("DUPLICATE_COMPONENT"));
        // an ORG-only service in an individual plan
        assertThatThrownBy(() -> withComponents("PRO", 1, List.of(included("resume.advanced_versions")))).isInstanceOfSatisfying(CatalogException.class, e -> assertThat(e.getCode()).isEqualTo("ROLE_INVALID_FOR_AUDIENCE"));
    }

    @Test
    void anAllowanceMustExistAndAPricedRoleNeedsAProductSoldToTheAudience() {
        List<ComponentRequest> zero = List.of(new ComponentRequest("resume.library", "INCLUDED", null, 0L, null, null, null, null, null, null));
        assertThatThrownBy(() -> withComponents("PRO", 1, zero)).isInstanceOfSatisfying(CatalogException.class, e -> assertThat(e.getCode()).isEqualTo("ALLOWANCE_REQUIRED"));
        assertThatThrownBy(() -> withComponents("PRO", 1, List.of(new ComponentRequest("ai.credits_extra", "OPTIONAL", null, null, null, null, 4, null, null, null)))).isInstanceOfSatisfying(CatalogException.class, e -> assertThat(e.getCode()).isEqualTo("PRODUCT_REQUIRED"));
        assertThatThrownBy(() -> withComponents("PRO", 1, List.of(new ComponentRequest("ai.credits_extra", "OPTIONAL", product("FEAT_RESUME_ADV_VERSIONS").getId(), null, null, null, 4, null, null, null))))
            .isInstanceOfSatisfying(CatalogException.class, e -> assertThat(e.getCode()).isIn("PRODUCT_AUDIENCE_MISMATCH", "PRODUCT_FEATURE_MISMATCH"));
        assertThatThrownBy(() -> withComponents("PRO", 1, List.of(new ComponentRequest("ai.credits_extra", "OPTIONAL", product("FEAT_AI_CREDITS").getId(), null, null, null, 9, null, null, null)))).isInstanceOfSatisfying(CatalogException.class, e -> assertThat(e.getCode()).isEqualTo("QUANTITY_LIMIT"));
    }

    @Test
    void intervalsAreCheckedAgainstTheAudienceAndTheSettings() {
        PlanVersionDTO org = plans.getVersion("ORG_STANDARD", 1);
        assertCode(() -> patch("ORG_STANDARD", org.version(), "{\"intervals\":[\"MONTH\",\"QUARTER\"]}"), 422, "ORG_QUARTER_REFUSED");
        assertCode(() -> patch("PRO", 1, "{\"intervals\":[\"WEEK\"]}"), 422, "INVALID_VALUE");
        assertCode(() -> patch("PRO", 1, "{\"annualDiscountBp\":20000}"), 422, "INVALID_VALUE");
    }

    @Test
    void anOrganizationPlanNeedsExactlyOneSeatBase() {
        PlanVersionDTO org = plans.getVersion("ORG_STANDARD", 1);
        List<ComponentRequest> noBase = componentsOf(org).stream().filter(c -> !c.role().equals("SEAT_BASE")).toList();
        withComponents("ORG_STANDARD", 1, noBase);
        assertCode(() -> publish("ORG_STANDARD", 1), 422, "BASE_PRODUCT_REQUIRED");
    }

    @Test
    void anIndividualPlanOtherThanFreeNeedsABaseProduct() {
        PlanVersionDTO created = plans.create(new CreatePlanRequest("IT_PLAN", "IT plan", "INDIVIDUAL", null, null, false, 500, null, REASON)).versions().get(0);
        assertThat(created.status()).isEqualTo("DRAFT");
        assertThat(created.intervals()).containsExactly("MONTH", "QUARTER", "YEAR");
        assertCode(() -> publish("IT_PLAN", 1), 422, "BASE_PRODUCT_REQUIRED");
        assertCode(() -> plans.create(new CreatePlanRequest("IT_PLAN", "Again", "INDIVIDUAL", null, null, null, null, null, REASON)), 409, "PLAN_KEY_EXISTS");
        assertCode(() -> plans.create(new CreatePlanRequest("bad key!", "Bad", "INDIVIDUAL", null, null, null, null, null, REASON)), 422, "KEY_FORMAT");
    }

    @Test
    void discardingTheOnlyVersionOfAnUnpublishedPlanRemovesThePlan() {
        plans.create(new CreatePlanRequest("IT_GONE", "Gone", "INDIVIDUAL", null, null, null, null, null, REASON));
        plans.discard("IT_GONE", 1, new DiscardRequest("never mind"));
        assertThat(jdbc.queryForObject("select count(*) from plan where plan_key = 'IT_GONE'", Integer.class)).isZero();
    }

    @Test
    void aStaleDraftWriteIsAConflict() {
        PlanVersionDTO v = plans.getVersion("PRO", 1);
        patch("PRO", 1, "{\"summary\":\"first\"}");
        assertCode(() -> patch("PRO", 1, "{\"summary\":\"second\",\"expectedUpdatedAt\":\"" + v.updatedAt() + "\"}"), 409, "VERSION_CONFLICT");
        PlanVersionDTO now = plans.getVersion("PRO", 1);
        assertThat(patch("PRO", 1, "{\"summary\":\"second\",\"expectedUpdatedAt\":\"" + now.updatedAt() + "\"}").summary()).isEqualTo("second");
    }

    @Test
    void changingTheFeeModelListsThePublishedRowsThatFallBelowTheFloor() {
        priceProV1(false);
        publish("PRO", 1);
        com.dossier.api.service.catalog.MarginAdminService.FeeModelResult r = marginAdmin.setFeeModel(new MarginAdminService.FeeModelRequest("SCHEDULE", null,"Compare both fee models after the first publish"));
        assertThat(r.feeModel().model()).isEqualTo("SCHEDULE");
        assertThat(r.reevaluation()).isNotEmpty();
        assertThat(r.reevaluation()).anySatisfy(row -> {
            assertThat(row.planKey()).isEqualTo("PRO");
            assertThat(row.interval().name()).isEqualTo("MONTH");
            assertThat(row.passedBefore()).isTrue();
            assertThat(row.marginBp()).isLessThan(8000);
        });
    }

    @Autowired private MarginAdminService marginAdmin;
}
