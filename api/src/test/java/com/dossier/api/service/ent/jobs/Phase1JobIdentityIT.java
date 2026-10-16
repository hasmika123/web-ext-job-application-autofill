package com.dossier.api.service.ent.jobs;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.ent.mkt.MktPipelineApplicationLink;
import com.dossier.api.domain.ent.talent.ClientRequirement;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.ent.mkt.MktPipelineApplicationLinkRepository;
import com.dossier.api.repository.ent.talent.ClientRequirementRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.ent.EnterpriseDemoSeeder;
import com.dossier.api.service.ent.TalentDemoSeeder;
import jakarta.persistence.EntityManager;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.TestPropertySource;
import org.springframework.transaction.annotation.Transactional;

/**
 * Release 1, Phase 1 on MySQL (changelog {@code 20261105010000_phase1_job_identity}): the migration applied with the contract's columns and keys,
 * the backfill is correct and repeatable, a job URL / ATS id exists once per organization, an opportunity has at most one LIVE link, and the composite
 * tenant keys refuse a link that points at another tenant's rows. Written against the demo tenants like {@code TalentSchemaIT}; needs Docker.
 */
@IntegrationTest
@Transactional
@TestPropertySource(properties = { "dossier.demo.enabled=true", "dossier.demo.enterprise-seed=true", "dossier.demo.create-accounts=false" })
@org.junit.jupiter.api.Timeout(180)
class Phase1JobIdentityIT {

    @Autowired private EnterpriseDemoSeeder baseSeeder;
    @Autowired private TalentDemoSeeder talentSeeder;
    @Autowired private OrganizationRepository orgs;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private EntityManager em;
    @Autowired private ResumeBuilderSettings settings;
    @Autowired private ClientRequirementRepository requirements;
    @Autowired private MktPipelineApplicationLinkRepository links;

    private Long acme;
    private Long beta;

    @BeforeEach
    @org.junit.jupiter.api.Timeout(240) // the first class to run on an empty database seeds the whole demo world: more than the 15 s default of lifecycle methods
    void seed() {
        assertThat(baseSeeder.seed().ran()).isTrue();
        assertThat(talentSeeder.seed().ran()).isTrue();
        acme = orgs.findBySlug(EnterpriseDemoSeeder.ACME_SLUG).map(Organization::getId).orElseThrow();
        beta = orgs.findBySlug(EnterpriseDemoSeeder.BETA_SLUG).map(Organization::getId).orElseThrow();
    }

    @AfterEach
    void forget() {
        settings.invalidate();
    }

    // ---- migration -------------------------------------------------------------------------------------------------------------

    private Map<String, Object> column(String table, String column) {
        List<Map<String, Object>> rows = jdbc.queryForList(
            "select is_nullable, column_default, column_type, extra, generation_expression from information_schema.columns "
                + "where table_schema = database() and table_name = ? and column_name = ?", table, column);
        assertThat(rows).as(table + "." + column).hasSize(1);
        return rows.get(0);
    }

    @Test
    void everyChangeSetOfTheFileRan() {
        Long ran = jdbc.queryForObject("select count(*) from DATABASECHANGELOG where id like 'phase1-job-identity-%'", Long.class);
        assertThat(ran).isEqualTo(19L); // 11 original sets + 8 guarded repair sets (12 to 19) for the pieces of the link table
    }

    @Test
    void theJobIdentityColumnsExistWithTheContractsTypesAndDefaults() {
        assertThat(column("client_requirement", "job_url").get("COLUMN_TYPE")).isEqualTo("varchar(1000)");
        assertThat(column("client_requirement", "url_key").get("COLUMN_TYPE")).isEqualTo("varchar(1000)");
        assertThat(column("client_requirement", "url_key_hash").get("COLUMN_TYPE")).isEqualTo("char(64)");
        assertThat(column("client_requirement", "external_job_id").get("COLUMN_TYPE")).isEqualTo("varchar(200)");
        assertThat(column("client_requirement", "ats_platform").get("COLUMN_TYPE")).isEqualTo("varchar(40)");
        assertThat(column("client_requirement", "posted_on").get("COLUMN_TYPE")).isEqualTo("date");
        assertThat(column("client_requirement", "pay_label").get("COLUMN_TYPE")).isEqualTo("varchar(80)");
        Map<String, Object> capture = column("client_requirement", "capture_source");
        assertThat(capture.get("IS_NULLABLE")).isEqualTo("NO");
        assertThat(String.valueOf(capture.get("COLUMN_DEFAULT"))).isEqualTo("MANUAL");
        for (String t : List.of("client_requirement", "requirement_match", "mkt_opportunity", "talent_application")) {
            Map<String, Object> v = column(t, "version");
            assertThat(v.get("IS_NULLABLE")).as(t + ".version NOT NULL").isEqualTo("NO");
            assertThat(String.valueOf(v.get("COLUMN_DEFAULT"))).as(t + ".version default").isEqualTo("0");
        }
        Map<String, Object> state = column("mkt_opportunity", "state");
        assertThat(state.get("IS_NULLABLE")).isEqualTo("NO");
        assertThat(String.valueOf(state.get("COLUMN_DEFAULT"))).isEqualTo("ASSIGNED");
        assertThat(String.valueOf(column("mkt_opportunity", "priority").get("COLUMN_DEFAULT"))).isEqualTo("MEDIUM");
        for (String c : List.of("viewed_at", "posting_opened_at", "applied_at", "closed_at")) assertThat(column("mkt_opportunity", c).get("IS_NULLABLE")).as(c).isEqualTo("YES");
        assertThat(column("mkt_opportunity", "info_answer").get("COLUMN_TYPE")).isEqualTo("varchar(1000)");
        assertThat(column("talent_application", "personal_application_id").get("COLUMN_TYPE")).isEqualTo("bigint");
        assertThat(String.valueOf(column("talent_application", "entry_path").get("COLUMN_DEFAULT"))).isEqualTo("MARKETER");
        assertThat(String.valueOf(column("talent_application", "stage_source").get("COLUMN_DEFAULT"))).isEqualTo("MARKETER");
    }

    @Test
    void theLinkTableHasAStoredGeneratedLiveKeyAndTenantKeys() {
        Map<String, Object> live = column("pipeline_application_link", "live_key");
        assertThat(String.valueOf(live.get("EXTRA")).toUpperCase()).contains("STORED GENERATED");
        assertThat(String.valueOf(live.get("GENERATION_EXPRESSION")).toLowerCase()).contains("unlinked_at").contains("opportunity_id");
        Long uniqueLive = jdbc.queryForObject(
            "select count(*) from information_schema.statistics where table_schema = database() and table_name = 'pipeline_application_link' and index_name = 'uk_pal_live' and non_unique = 0", Long.class);
        assertThat(uniqueLive).as("uk_pal_live (org_id, live_key)").isEqualTo(2L);
        for (String fk : List.of("fk_pal_org", "fk_pal_opportunity", "fk_pal_consultant", "fk_pal_talent_application")) {
            Long n = jdbc.queryForObject("select count(*) from information_schema.table_constraints where table_schema = database() and table_name = 'pipeline_application_link' and constraint_name = ? and constraint_type = 'FOREIGN KEY'", Long.class, fk);
            assertThat(n).as(fk).isEqualTo(1L);
        }
        // the composite tenant FKs start with org_id
        List<Map<String, Object>> firsts = jdbc.queryForList(
            "select constraint_name c, column_name col from information_schema.key_column_usage where table_schema = database() and table_name = 'pipeline_application_link' "
                + "and referenced_table_name is not null and ordinal_position = 1");
        assertThat(firsts).hasSize(4);
        for (Map<String, Object> row : firsts) assertThat(row.get("col")).as(String.valueOf(row.get("c"))).isEqualTo("org_id");
    }

    @Test
    void everyNewIndexStartsWithOrgId() {
        List<Map<String, Object>> idx = jdbc.queryForList(
            "select table_name t, index_name i, column_name col from information_schema.statistics where table_schema = database() and seq_in_index = 1 and index_name in "
                + "('uk_req_url','uk_req_ext','ix_mkt_opportunity_state','ix_talent_application_personal','uk_pal_live','ix_pal_personal','ix_pal_consultant')");
        assertThat(idx).extracting(r -> String.valueOf(r.get("i"))).containsExactlyInAnyOrder(
            "uk_req_url", "uk_req_ext", "ix_mkt_opportunity_state", "ix_talent_application_personal", "uk_pal_live", "ix_pal_personal", "ix_pal_consultant");
        for (Map<String, Object> r : idx) assertThat(r.get("col")).as(String.valueOf(r.get("i"))).isEqualTo("org_id");
    }

    // ---- backfill --------------------------------------------------------------------------------------------------------------

    private Long someAssignedMatch(Long orgId) {
        return jdbc.queryForObject("select id from requirement_match where org_id = ? and status = 'ASSIGNED' order by id limit 1", Long.class, orgId);
    }

    private Long ensureOpportunity(Long orgId, Long matchId, String interest) {
        jdbc.update("delete from mkt_opportunity_event where org_id = ? and opportunity_id in (select id from mkt_opportunity where org_id = ? and match_id = ?)", orgId, orgId, matchId);
        jdbc.update("delete from mkt_opportunity where org_id = ? and match_id = ?", orgId, matchId);
        jdbc.update("insert into mkt_opportunity (org_id, match_id, interest, created_at, updated_at) values (?, ?, ?, now(6), now(6))", orgId, matchId, interest);
        return jdbc.queryForObject("select id from mkt_opportunity where org_id = ? and match_id = ?", Long.class, orgId, matchId);
    }

    @Test
    void theStateBackfillFollowsTheLegacyInterestAndIsRepeatable() {
        List<Long> matchIds = jdbc.queryForList("select id from requirement_match where org_id = ? and status = 'ASSIGNED' order by id limit 4", Long.class, acme);
        assertThat(matchIds).hasSize(4);
        Long interested = ensureOpportunity(acme, matchIds.get(0), "INTERESTED");
        Long very = ensureOpportunity(acme, matchIds.get(1), "VERY_INTERESTED");
        Long notInterested = ensureOpportunity(acme, matchIds.get(2), "NOT_INTERESTED");
        Long silent = ensureOpportunity(acme, matchIds.get(3), "NO_RESPONSE");
        for (int run = 0; run < 2; run++) {
            jdbc.update("UPDATE mkt_opportunity SET state = 'INTERESTED' WHERE state = 'ASSIGNED' AND interest IN ('INTERESTED', 'VERY_INTERESTED')");
            jdbc.update("UPDATE mkt_opportunity SET state = 'DECLINED' WHERE state = 'ASSIGNED' AND interest = 'NOT_INTERESTED'");
        }
        assertThat(stateOf(interested)).isEqualTo("INTERESTED");
        assertThat(stateOf(very)).isEqualTo("INTERESTED");
        assertThat(stateOf(notInterested)).isEqualTo("DECLINED");
        assertThat(stateOf(silent)).isEqualTo("ASSIGNED");
    }

    private String stateOf(Long opportunityId) {
        return jdbc.queryForObject("select state from mkt_opportunity where id = ?", String.class, opportunityId);
    }

    // ---- the job identity keys --------------------------------------------------------------------------------------------------

    private Long someClient(Long orgId) {
        return jdbc.queryForObject("select id from client_account where org_id = ? order by id limit 1", Long.class, orgId);
    }

    private void insertJob(Long orgId, String urlKeyHash, String ats, String externalId) {
        jdbc.update(
            "insert into client_requirement (org_id, client_id, title, posted_at, created_at, updated_at, url_key, url_key_hash, ats_platform, external_job_id) values (?, ?, 'Job', now(6), now(6), now(6), ?, ?, ?, ?)",
            orgId, someClient(orgId), urlKeyHash == null ? null : "https://example.com/" + urlKeyHash, urlKeyHash, ats, externalId);
    }

    @Test
    void aJobUrlExistsOncePerOrganizationButManyJobsMayHaveNone() {
        String hash = UrlKeys.hash(UrlKeys.normalize("https://boards.greenhouse.io/acme/jobs/1"));
        insertJob(acme, hash, null, null);
        assertThatThrownBy(() -> insertJob(acme, hash, null, null)).isInstanceOf(DataIntegrityViolationException.class);
        insertJob(beta, hash, null, null); // another tenant may hold the same posting
        // jobs without a URL key (the manually entered ones) never collide
        insertJob(acme, null, null, null);
        insertJob(acme, null, null, null);
        assertThat(jdbc.queryForObject("select count(*) from client_requirement where org_id = ? and url_key_hash is null", Long.class, acme)).isGreaterThanOrEqualTo(2L);
    }

    @Test
    void anAtsPlatformAndExternalIdExistOncePerOrganization() {
        insertJob(acme, UrlKeys.hash("https://linkedin.com/jobs/view/111"), "linkedin", "111");
        assertThatThrownBy(() -> insertJob(acme, UrlKeys.hash("https://linkedin.com/jobs/collections/x?currentJobId=111"), "linkedin", "111")).isInstanceOf(DataIntegrityViolationException.class);
        insertJob(acme, UrlKeys.hash("https://indeed.com/viewjob?jk=111"), "indeed", "111"); // same id on another platform
        insertJob(beta, UrlKeys.hash("https://linkedin.com/jobs/view/111"), "linkedin", "111");
    }

    // ---- the link ---------------------------------------------------------------------------------------------------------------

    private record Pair(Long opportunityId, Long consultantId) {}

    private Pair opportunityOf(Long orgId, int nth) {
        Long matchId = jdbc.queryForList("select id from requirement_match where org_id = ? and status = 'ASSIGNED' order by id limit 1 offset ?", Long.class, orgId, nth).get(0);
        Long opp = ensureOpportunity(orgId, matchId, "NO_RESPONSE");
        Long consultant = jdbc.queryForObject("select consultant_id from requirement_match where id = ?", Long.class, matchId);
        return new Pair(opp, consultant);
    }

    private void insertLink(Long orgId, Long opportunityId, Long consultantId, long personalApplicationId, Instant unlinkedAt) {
        jdbc.update(
            "insert into pipeline_application_link (org_id, opportunity_id, consultant_id, personal_application_id, source, linked_at, unlinked_at) values (?, ?, ?, ?, 'CONSULTANT', now(6), ?)",
            orgId, opportunityId, consultantId, personalApplicationId, unlinkedAt == null ? null : Timestamp.from(unlinkedAt));
    }

    @Test
    void anOpportunityHasAtMostOneLiveLinkAndUnlinkingFreesTheSlot() {
        Pair p = opportunityOf(acme, 0);
        insertLink(acme, p.opportunityId(), p.consultantId(), 9001L, null);
        assertThatThrownBy(() -> insertLink(acme, p.opportunityId(), p.consultantId(), 9002L, null)).isInstanceOf(DataIntegrityViolationException.class);
        // history: any number of unlinked rows
        insertLink(acme, p.opportunityId(), p.consultantId(), 9003L, Instant.parse("2026-10-01T00:00:00Z"));
        insertLink(acme, p.opportunityId(), p.consultantId(), 9004L, Instant.parse("2026-10-02T00:00:00Z"));
        // unlink the live one, then a new live link is fine
        jdbc.update("update pipeline_application_link set unlinked_at = now(6) where org_id = ? and opportunity_id = ? and personal_application_id = 9001", acme, p.opportunityId());
        insertLink(acme, p.opportunityId(), p.consultantId(), 9005L, null);
        assertThat(jdbc.queryForObject("select count(*) from pipeline_application_link where org_id = ? and opportunity_id = ? and live_key is not null", Long.class, acme, p.opportunityId())).isEqualTo(1L);
        // a second opportunity is independent
        Pair q = opportunityOf(acme, 1);
        insertLink(acme, q.opportunityId(), q.consultantId(), 9001L, null);
    }

    @Test
    void aLinkCannotPointAtAnotherTenantsRows() {
        Pair mine = opportunityOf(acme, 0);
        Pair theirs = opportunityOf(beta, 0);
        // Beta's link to Acme's opportunity, Acme's link to Beta's consultant, a talent application of another tenant
        assertThatThrownBy(() -> insertLink(beta, mine.opportunityId(), theirs.consultantId(), 1L, null)).isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> insertLink(acme, mine.opportunityId(), theirs.consultantId(), 1L, null)).isInstanceOf(DataIntegrityViolationException.class);
        Long betaApplication = jdbc.queryForList("select id from talent_application where org_id = ? order by id limit 1", Long.class, beta).get(0);
        assertThatThrownBy(() -> jdbc.update(
            "insert into pipeline_application_link (org_id, opportunity_id, consultant_id, personal_application_id, talent_application_id, source, linked_at) values (?, ?, ?, 1, ?, 'LINKER', now(6))",
            acme, mine.opportunityId(), mine.consultantId(), betaApplication)).isInstanceOf(DataIntegrityViolationException.class);
        // and a link to an organization that does not exist
        assertThatThrownBy(() -> insertLink(-1L, mine.opportunityId(), mine.consultantId(), 1L, null)).isInstanceOf(DataIntegrityViolationException.class);
    }

    // ---- the entities against the real schema ------------------------------------------------------------------------------------

    @Test
    void theLinkEntityRoundTripsAndReadsTheGeneratedLiveKey() {
        Pair p = opportunityOf(acme, 0);
        MktPipelineApplicationLink l = new MktPipelineApplicationLink();
        l.setOrgId(acme);
        l.setOpportunityId(p.opportunityId());
        l.setConsultantId(p.consultantId());
        l.setPersonalApplicationId(4242L);
        l.setSource(MktPipelineApplicationLink.SOURCE_LINKER);
        l.setLinkedAt(Instant.parse("2026-10-14T10:00:00Z"));
        l = links.saveAndFlush(l);
        em.clear();
        MktPipelineApplicationLink read = links.findByOrgIdAndOpportunityIdAndUnlinkedAtIsNull(acme, p.opportunityId()).orElseThrow();
        assertThat(read.getId()).isEqualTo(l.getId());
        assertThat(read.getLiveKey()).isEqualTo(p.opportunityId());
        assertThat(links.findByOrgIdAndPersonalApplicationIdAndUnlinkedAtIsNull(acme, 4242L)).hasSize(1);
        assertThat(links.findByOrgIdAndPersonalApplicationIdAndUnlinkedAtIsNull(beta, 4242L)).isEmpty();
        assertThat(links.findByOrgIdAndConsultantIdOrderByLinkedAtDesc(acme, p.consultantId())).extracting(MktPipelineApplicationLink::getId).contains(l.getId());
    }

    @Test
    void theVersionColumnIsBumpedByEveryUpdate() {
        ClientRequirement r = requirements.findByOrgId(acme).get(0);
        long before = r.getVersion();
        r.setTitle(r.getTitle() + " (edited)");
        requirements.saveAndFlush(r);
        em.clear();
        assertThat(requirements.findByOrgIdAndId(acme, r.getId()).orElseThrow().getVersion()).isEqualTo(before + 1);
    }

    @Test
    void aJobRoundTripsItsIdentityAndTheRepositoryFindsItByEitherKey() {
        ClientRequirement r = new ClientRequirement();
        r.setOrgId(acme);
        r.setClientId(someClient(acme));
        r.setTitle("Captured");
        r.setJobUrl("https://www.linkedin.com/jobs/view/3912345678/?trackingId=x");
        UrlKeys.Key key = UrlKeys.of(r.getJobUrl(), "3912345678");
        r.setUrlKey(key.key());
        r.setUrlKeyHash(key.hash());
        r.setAtsPlatform("linkedin");
        r.setExternalJobId("3912345678");
        r.setCaptureSource("EXTENSION");
        r.setPayLabel("$90-100/hr");
        r = requirements.saveAndFlush(r);
        em.clear();
        assertThat(requirements.findByOrgIdAndUrlKeyHash(acme, key.hash()).orElseThrow().getId()).isEqualTo(r.getId());
        assertThat(requirements.findByOrgIdAndAtsPlatformAndExternalJobId(acme, "linkedin", "3912345678").orElseThrow().getCaptureSource()).isEqualTo("EXTENSION");
        assertThat(requirements.findByOrgIdAndUrlKeyHash(beta, key.hash())).as("never across tenants").isEmpty();
    }
}
