package com.dossier.api.web.rest.org;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.not;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.domain.org.OrgAuditEvent;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.org.OrgAuditEventRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.org.OrgAuditAsserts;
import com.dossier.api.service.org.OrgAuditService;
import com.dossier.api.service.org.OrgService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.context.event.ApplicationEvents;
import org.springframework.test.context.event.RecordApplicationEvents;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.transaction.annotation.Transactional;

/**
 * O1.3: create, mine, get, patch and close against MySQL, through the real security chain and the org access
 * interceptor. Every mutating call is asserted to write exactly one {@code org_audit_event} row, and every refused call
 * to write none and to answer the same generic 404.
 */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
@RecordApplicationEvents
class OrgResourceIT {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper om;

    @Autowired
    private UserRepository users;

    @Autowired
    private OrganizationRepository orgs;

    @Autowired
    private OrgMemberRepository members;

    @Autowired
    private OrgAuditEventRepository audit;

    @Autowired
    private ApplicationEvents events;

    private OrgFixtures fx;

    @BeforeEach
    void fixtures() {
        fx = new OrgFixtures(users, orgs, members);
    }

    // ---- helpers ------------------------------------------------------------------------------------------------

    private ResultActions call(String login, org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder req) throws Exception {
        fx.user(login);
        return mockMvc.perform(req.with(user(login)).contentType(MediaType.APPLICATION_JSON));
    }

    private JsonNode body(ResultActions r) throws Exception {
        return om.readTree(r.andReturn().getResponse().getContentAsString());
    }

    private long create(String login, String json) throws Exception {
        return body(call(login, post("/api/orgs").content(json)).andExpect(status().isCreated())).path("org").path("id").asLong();
    }

    private Organization createdOrg(String login, String name) throws Exception {
        long id = create(login, "{\"name\":\"" + name + "\",\"type\":\"BOOTCAMP\"}");
        return orgs.findByOrgId(id).orElseThrow();
    }

    private void assertGeneric404(ResultActions r) throws Exception {
        r.andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("NOT_FOUND"));
        String text = r.andReturn().getResponse().getContentAsString().toLowerCase();
        assertThat(text).doesNotContain("forbidden").doesNotContain("permission").doesNotContain("not a member").doesNotContain("role");
    }

    // ---- POST /api/orgs -----------------------------------------------------------------------------------------

    @Test
    void createMakesADraftOrgWithTheCallerAsOwnerAndOneAuditRow() throws Exception {
        ResultActions r = call("alice", post("/api/orgs").content("{\"name\":\"Acme Bootcamp\",\"type\":\"BOOTCAMP\",\"sizeBand\":\"51_200\",\"country\":\"us\"}"))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.org.slug").value("acme-bootcamp"))
            .andExpect(jsonPath("$.org.name").value("Acme Bootcamp"))
            .andExpect(jsonPath("$.org.type").value("BOOTCAMP"))
            .andExpect(jsonPath("$.org.status").value("DRAFT"))
            .andExpect(jsonPath("$.status").value("DRAFT"))
            .andExpect(jsonPath("$.org.country").value("US"))
            .andExpect(jsonPath("$.org.sizeBand").value("51_200"))
            .andExpect(jsonPath("$.org.timezone").value("UTC"))
            .andExpect(jsonPath("$.org.settings.defaultShareScope").value("SUMMARY"))
            .andExpect(jsonPath("$.me.role").value("OWNER"))
            .andExpect(jsonPath("$.me.permissions", hasItem("org.close")))
            .andExpect(jsonPath("$.memberCount").value(1))
            .andExpect(jsonPath("$.org.stripeCustomerId").doesNotExist());
        long id = body(r).path("org").path("id").asLong();
        r.andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.header().string("Location", "/api/orgs/" + id));

        Organization org = orgs.findByOrgId(id).orElseThrow();
        assertThat(org.getStatus()).isEqualTo(OrgStatus.DRAFT);
        assertThat(org.getCreatedByUserId()).isEqualTo(fx.user("alice").getId());
        List<OrgMember> seats = members.findMine(fx.user("alice").getId());
        assertThat(seats).singleElement().satisfies(m -> {
            assertThat(m.getOrgId()).isEqualTo(id);
            assertThat(m.getRole()).isEqualTo(OrgRole.OWNER);
            assertThat(m.getStatus()).isEqualTo(OrgMemberStatus.ACTIVE);
            assertThat(m.getJoinedAt()).isNotNull();
        });
        assertThat(OrgAuditAsserts.rows(audit, id)).singleElement().satisfies(e -> {
            assertThat(e.getAction()).isEqualTo(OrgAuditService.ORG_CREATE);
            assertThat(e.getActorLogin()).isEqualTo("alice");
            assertThat(e.getActorRole()).isEqualTo("OWNER");
            assertThat(e.getTargetType()).isEqualTo("ORG");
        });
    }

    @Test
    void createAcceptsAnExplicitSlugAndNormalisesIt() throws Exception {
        call("alice", post("/api/orgs").content("{\"name\":\"Whatever\",\"type\":\"SCHOOL\",\"slug\":\" My-School \"}"))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.org.slug").value("my-school"));
    }

    @Test
    void aSlugCollisionIs409WithASuggestionAndWritesNothing() throws Exception {
        createdOrg("alice", "Acme");
        long before = orgs.findBySlug("acme-2").isPresent() ? 1 : 0;
        call("bob", post("/api/orgs").content("{\"name\":\"Acme\",\"type\":\"COMPANY\"}"))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.code").value("SLUG_TAKEN"))
            .andExpect(jsonPath("$.slug").value("acme"))
            .andExpect(jsonPath("$.suggestion").value("acme-2"));
        assertThat(orgs.findBySlug("acme-2")).isEmpty();
        assertThat(before).isZero();
        assertThat(members.findMine(fx.user("bob").getId())).isEmpty();
        // taking the suggestion works, and the next collision suggests the next free one
        call("bob", post("/api/orgs").content("{\"name\":\"x\",\"type\":\"COMPANY\",\"slug\":\"acme-2\"}")).andExpect(status().isCreated());
        call("carol", post("/api/orgs").content("{\"name\":\"Acme\",\"type\":\"COMPANY\"}"))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.suggestion").value("acme-3"));
    }

    @Test
    void aReservedSlugIsTreatedLikeATakenOne() throws Exception {
        call("alice", post("/api/orgs").content("{\"name\":\"Admin\",\"type\":\"COMPANY\"}"))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.code").value("SLUG_TAKEN"))
            .andExpect(jsonPath("$.suggestion").value("admin-2"));
    }

    @Test
    void createValidatesItsInput() throws Exception {
        call("alice", post("/api/orgs").content("{\"name\":\"Coachco\",\"type\":\"COACH\"}"))
            .andExpect(status().isUnprocessableEntity())
            .andExpect(jsonPath("$.code").value("RESERVED_VALUE"));
        call("alice", post("/api/orgs").content("{\"name\":\"  \",\"type\":\"COMPANY\"}"))
            .andExpect(status().isUnprocessableEntity())
            .andExpect(jsonPath("$.code").value("ORG_INVALID"))
            .andExpect(jsonPath("$.field").value("name"));
        call("alice", post("/api/orgs").content("{\"name\":\"Fine\"}"))
            .andExpect(status().isUnprocessableEntity())
            .andExpect(jsonPath("$.field").value("type"));
        call("alice", post("/api/orgs").content("{\"name\":\"Fine\",\"type\":\"COMPANY\",\"sizeBand\":\"huge\"}"))
            .andExpect(status().isUnprocessableEntity())
            .andExpect(jsonPath("$.field").value("sizeBand"));
        call("alice", post("/api/orgs").content("{\"name\":\"Fine\",\"type\":\"COMPANY\",\"country\":\"ZZ\"}"))
            .andExpect(status().isUnprocessableEntity())
            .andExpect(jsonPath("$.field").value("country"));
        call("alice", post("/api/orgs").content("{\"name\":\"Fine\",\"type\":\"COMPANY\",\"slug\":\"a b\"}"))
            .andExpect(status().isUnprocessableEntity())
            .andExpect(jsonPath("$.field").value("slug"));
        call("alice", post("/api/orgs").content("{\"name\":\"Fine\",\"type\":\"NOT_A_TYPE\"}")).andExpect(status().isBadRequest());
        call("alice", post("/api/orgs").content("{\"name\":\"" + "x".repeat(121) + "\",\"type\":\"COMPANY\"}")).andExpect(status().isUnprocessableEntity());
        assertThat(members.findMine(fx.user("alice").getId())).isEmpty();
    }

    @Test
    void anOrgNameThatContainsAnSsnIsRefused() throws Exception {
        call("alice", post("/api/orgs").content("{\"name\":\"Acme 123-45-6789\",\"type\":\"COMPANY\"}"))
            .andExpect(status().isUnprocessableEntity())
            .andExpect(jsonPath("$.code").value("SENSITIVE_CONTENT"));
        assertThat(members.findMine(fx.user("alice").getId())).isEmpty();
    }

    @Test
    void theSharedDemoAccountsCannotCreateAnOrg() throws Exception {
        call("demo-org", post("/api/orgs").content("{\"name\":\"Acme\",\"type\":\"COMPANY\"}"))
            .andExpect(status().isForbidden())
            .andExpect(jsonPath("$.code").value("DEMO_READ_ONLY"));
    }

    @Test
    void createNeedsASignedInCaller() throws Exception {
        mockMvc.perform(post("/api/orgs").contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"A\",\"type\":\"COMPANY\"}")).andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/orgs/mine")).andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/orgs/1")).andExpect(status().isUnauthorized());
    }

    // ---- GET /api/orgs/mine -------------------------------------------------------------------------------------

    @Test
    void mineIsEmptyForSomeoneWithNoOrgs() throws Exception {
        call("nobody", get("/api/orgs/mine")).andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    void mineListsOnlyActiveMembershipsWithRoleStatusAndCountSortedByName() throws Exception {
        Organization zeta = createdOrg("alice", "Zeta School"); // alice owns it
        Organization beta = fx.org("beta-co", OrgStatus.ACTIVE);
        fx.active(beta, "alice", OrgRole.STAFF);
        fx.active(beta, "bob", OrgRole.MEMBER);
        fx.active(beta, "carol", OrgRole.MEMBER);
        fx.seat(beta, "dave", OrgRole.MEMBER, OrgMemberStatus.SUSPENDED); // not counted
        Organization invitedOnly = fx.org("invited-co", OrgStatus.ACTIVE);
        fx.seat(invitedOnly, "alice", OrgRole.MEMBER, OrgMemberStatus.INVITED); // a pending invite is not a membership
        Organization left = fx.org("left-co", OrgStatus.ACTIVE);
        fx.seat(left, "alice", OrgRole.ADMIN, OrgMemberStatus.LEFT);
        Organization strangers = fx.org("strangers-co", OrgStatus.ACTIVE);
        fx.active(strangers, "bob", OrgRole.OWNER);

        call("alice", get("/api/orgs/mine"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.length()").value(2))
            .andExpect(jsonPath("$[0].orgId").value(beta.getId()))
            .andExpect(jsonPath("$[0].slug").value("beta-co"))
            .andExpect(jsonPath("$[0].role").value("STAFF"))
            .andExpect(jsonPath("$[0].status").value("ACTIVE"))
            .andExpect(jsonPath("$[0].memberCount").value(3))
            .andExpect(jsonPath("$[1].orgId").value(zeta.getId()))
            .andExpect(jsonPath("$[1].role").value("OWNER"))
            .andExpect(jsonPath("$[1].status").value("DRAFT"))
            .andExpect(jsonPath("$[1].memberCount").value(1));
    }

    // ---- GET /api/orgs/{orgId} ----------------------------------------------------------------------------------

    @Test
    void getGivesAnOwnerTheSettingsAndTheirPermissionKeys() throws Exception {
        Organization org = createdOrg("alice", "Acme");
        call("alice", get("/api/orgs/" + org.getId()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.org.name").value("Acme"))
            .andExpect(jsonPath("$.org.settings.allowSelfLeave").value(true))
            .andExpect(jsonPath("$.me.role").value("OWNER"))
            .andExpect(jsonPath("$.me.memberId").exists())
            .andExpect(jsonPath("$.me.permissions", hasItem("org.settings.manage")))
            .andExpect(jsonPath("$.me.permissions", hasItem("self.leave")));
    }

    @Test
    void aPlainMemberSeesTheOrgButNotItsSettingsOrBillingEmail() throws Exception {
        Organization org = fx.org("acme", OrgStatus.ACTIVE);
        org.setBillingEmail("billing@acme.test");
        orgs.saveAndFlush(org);
        fx.active(org, "mia", OrgRole.MEMBER);
        call("mia", get("/api/orgs/" + org.getId()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.org.name").value("Org acme"))
            .andExpect(jsonPath("$.org.settings").doesNotExist())
            .andExpect(jsonPath("$.org.billingEmail").doesNotExist())
            .andExpect(jsonPath("$.me.role").value("MEMBER"))
            .andExpect(jsonPath("$.me.permissions", not(hasItem("org.settings.manage"))))
            .andExpect(jsonPath("$.me.permissions", not(hasItem("billing.view"))));
    }

    @Test
    void financeSeesTheBillingEmailButNotTheSettings() throws Exception {
        Organization org = fx.org("acme", OrgStatus.ACTIVE);
        org.setBillingEmail("billing@acme.test");
        orgs.saveAndFlush(org);
        fx.active(org, "fin", OrgRole.FINANCE);
        call("fin", get("/api/orgs/" + org.getId()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.org.billingEmail").value("billing@acme.test"))
            .andExpect(jsonPath("$.org.settings").doesNotExist());
    }

    @Test
    void aStrangerAMissingOrgAndABadIdAllGetTheSameGeneric404() throws Exception {
        Organization org = createdOrg("alice", "Acme");
        long auditBefore = audit.countByOrgId(org.getId());
        assertGeneric404(call("mallory", get("/api/orgs/" + org.getId())));
        assertGeneric404(call("mallory", get("/api/orgs/99999999")));
        assertGeneric404(call("mallory", get("/api/orgs/not-a-number")));
        OrgAuditAsserts.assertNoNewRow(audit, org.getId(), auditBefore);
        assertThat(audit.countByOrgIdAndActorLogin(org.getId(), "mallory")).isZero();
    }

    @Test
    void everyNonActiveSeatIsA404() throws Exception {
        Organization org = fx.org("acme", OrgStatus.ACTIVE);
        int i = 0;
        for (OrgMemberStatus s : new OrgMemberStatus[] {
            OrgMemberStatus.INVITED, OrgMemberStatus.SUSPENDED, OrgMemberStatus.LEFT, OrgMemberStatus.REMOVED, OrgMemberStatus.ERASED,
        }) {
            String login = "person" + i++;
            fx.seat(org, login, OrgRole.OWNER, s);
            assertGeneric404(call(login, get("/api/orgs/" + org.getId())));
        }
    }

    @Test
    void aPlatformAdminAuthorityGrantsNoAccessToAnOrg() throws Exception {
        Organization org = createdOrg("alice", "Acme");
        fx.user("root");
        assertGeneric404(
            mockMvc.perform(get("/api/orgs/" + org.getId()).with(user("root").authorities(new SimpleGrantedAuthority("ROLE_ADMIN"), new SimpleGrantedAuthority("ROLE_USER"))))
        );
        assertGeneric404(
            mockMvc.perform(
                patch("/api/orgs/" + org.getId())
                    .with(user("root").authorities(new SimpleGrantedAuthority("ROLE_ADMIN")))
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("{\"name\":\"Hijacked\"}")
            )
        );
        assertThat(orgs.findByOrgId(org.getId()).orElseThrow().getName()).isEqualTo("Acme");
    }

    // ---- PATCH /api/orgs/{orgId} --------------------------------------------------------------------------------

    @Test
    void anOwnerPatchesTheProfileAndASingleAuditRowNamesTheFields() throws Exception {
        Organization org = createdOrg("alice", "Acme");
        long before = audit.countByOrgId(org.getId());
        call(
            "alice",
            patch("/api/orgs/" + org.getId())
                .content("{\"name\":\"Acme Academy\",\"website\":\"https://acme.test\",\"timezone\":\"America/New_York\",\"country\":\"ca\",\"sizeBand\":\"1001_PLUS\",\"billingEmail\":\"Billing@Acme.test\"}")
        )
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.org.name").value("Acme Academy"))
            .andExpect(jsonPath("$.org.website").value("https://acme.test"))
            .andExpect(jsonPath("$.org.timezone").value("America/New_York"))
            .andExpect(jsonPath("$.org.country").value("CA"))
            .andExpect(jsonPath("$.org.billingEmail").value("billing@acme.test"))
            .andExpect(jsonPath("$.org.slug").value("acme")); // the slug is never patched
        OrgAuditEvent row = OrgAuditAsserts.assertOneNewRow(audit, org.getId(), before, OrgAuditService.ORG_SETTINGS);
        assertThat(row.getActorLogin()).isEqualTo("alice");
        assertThat(row.getDetails()).isEqualTo("fields=name,website,sizeBand,country,timezone,billingEmail");
        assertThat(row.getDetails()).doesNotContain("acme.test").doesNotContain("Academy"); // fields, never values
    }

    @Test
    void settingsAreMergedAndValidatedThroughTheTypedRecord() throws Exception {
        Organization org = createdOrg("alice", "Acme");
        long before = audit.countByOrgId(org.getId());
        call("alice", patch("/api/orgs/" + org.getId()).content("{\"settings\":{\"defaultShareScope\":\"NONE\",\"digestDay\":\"MON\",\"quietHours\":{\"start\":\"22:00\"}}}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.org.settings.defaultShareScope").value("NONE"))
            .andExpect(jsonPath("$.org.settings.digestDay").value("MON"))
            .andExpect(jsonPath("$.org.settings.quietHours.start").value("22:00"))
            .andExpect(jsonPath("$.org.settings.quietHours.end").value("08:00")) // untouched
            .andExpect(jsonPath("$.org.settings.allowSelfLeave").value(true)); // untouched
        OrgAuditAsserts.assertOneNewRow(audit, org.getId(), before, OrgAuditService.ORG_SETTINGS);
        // and it persisted: a second patch builds on it
        call("alice", patch("/api/orgs/" + org.getId()).content("{\"settings\":{\"allowSelfLeave\":false}}"))
            .andExpect(jsonPath("$.org.settings.defaultShareScope").value("NONE"))
            .andExpect(jsonPath("$.org.settings.allowSelfLeave").value(false));
    }

    @Test
    void invalidPatchesAre422AndChangeAndAuditNothing() throws Exception {
        Organization org = createdOrg("alice", "Acme");
        long before = audit.countByOrgId(org.getId());
        String url = "/api/orgs/" + org.getId();
        call("alice", patch(url).content("{\"settings\":{\"theme\":\"dark\"}}")).andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.field").value("settings.theme"));
        call("alice", patch(url).content("{\"settings\":{\"defaultRole\":\"ADMIN\"}}")).andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.field").value("settings.defaultRole"));
        call("alice", patch(url).content("{\"settings\":{\"defaultShareScope\":\"FULL\"}}")).andExpect(status().isUnprocessableEntity());
        call("alice", patch(url).content("{\"timezone\":\"Mars/Olympus\"}")).andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.field").value("timezone"));
        call("alice", patch(url).content("{\"website\":\"ftp://acme.test\"}")).andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.field").value("website"));
        call("alice", patch(url).content("{\"billingEmail\":\"not-an-email\"}")).andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.field").value("billingEmail"));
        call("alice", patch(url).content("{\"name\":\"\"}")).andExpect(status().isUnprocessableEntity());
        call("alice", patch(url).content("{\"name\":\"SSN 123-45-6789\"}")).andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("SENSITIVE_CONTENT"));
        OrgAuditAsserts.assertNoNewRow(audit, org.getId(), before);
        assertThat(orgs.findByOrgId(org.getId()).orElseThrow().getName()).isEqualTo("Acme");
    }

    @Test
    void aPatchThatChangesNothingWritesNoAuditRow() throws Exception {
        Organization org = createdOrg("alice", "Acme");
        long before = audit.countByOrgId(org.getId());
        call("alice", patch("/api/orgs/" + org.getId()).content("{\"name\":\"Acme\",\"settings\":{\"allowSelfLeave\":true}}")).andExpect(status().isOk());
        call("alice", patch("/api/orgs/" + org.getId()).content("{}")).andExpect(status().isOk());
        OrgAuditAsserts.assertNoNewRow(audit, org.getId(), before);
    }

    @Test
    void anEmptyStringClearsAnOptionalField() throws Exception {
        Organization org = createdOrg("alice", "Acme");
        call("alice", patch("/api/orgs/" + org.getId()).content("{\"website\":\"https://acme.test\"}")).andExpect(jsonPath("$.org.website").value("https://acme.test"));
        call("alice", patch("/api/orgs/" + org.getId()).content("{\"website\":\"\"}")).andExpect(status().isOk()).andExpect(jsonPath("$.org.website").doesNotExist());
    }

    @Test
    void onlyOwnerAndAdminMayPatchEveryoneElseGetsA404AndNoAuditRow() throws Exception {
        Organization org = fx.org("acme", OrgStatus.ACTIVE);
        fx.active(org, "owner", OrgRole.OWNER);
        fx.active(org, "admin1", OrgRole.ADMIN);
        long before = audit.countByOrgId(org.getId());
        call("admin1", patch("/api/orgs/" + org.getId()).content("{\"name\":\"By Admin\"}")).andExpect(status().isOk());
        OrgAuditAsserts.assertOneNewRow(audit, org.getId(), before + 0, OrgAuditService.ORG_SETTINGS);
        long afterAdmin = audit.countByOrgId(org.getId());
        for (OrgRole role : new OrgRole[] { OrgRole.STAFF, OrgRole.MEMBER, OrgRole.MARKETER, OrgRole.FINANCE }) {
            String login = "u-" + role.name().toLowerCase();
            fx.active(org, login, role);
            assertGeneric404(call(login, patch("/api/orgs/" + org.getId()).content("{\"name\":\"By " + role + "\"}")));
        }
        OrgAuditAsserts.assertNoNewRow(audit, org.getId(), afterAdmin);
        assertThat(orgs.findByOrgId(org.getId()).orElseThrow().getName()).isEqualTo("By Admin");
    }

    @Test
    void aSharedDemoAccountCannotPatch() throws Exception {
        Organization org = fx.org("acme", OrgStatus.ACTIVE);
        fx.active(org, "demo-org", OrgRole.OWNER);
        call("demo-org", patch("/api/orgs/" + org.getId()).content("{\"name\":\"Nope\"}")).andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("DEMO_READ_ONLY"));
        call("demo-org", get("/api/orgs/" + org.getId())).andExpect(status().isOk()); // reading is fine
    }

    // ---- POST /api/orgs/{orgId}/close ---------------------------------------------------------------------------

    @Test
    void anOwnerClosesTheOrgSoftlyWithOneAuditRowAndAnEvent() throws Exception {
        Organization org = createdOrg("alice", "Acme");
        fx.active(org, "bob", OrgRole.MEMBER);
        long before = audit.countByOrgId(org.getId());
        call("alice", post("/api/orgs/" + org.getId() + "/close"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.status").value("CLOSED"))
            .andExpect(jsonPath("$.org.status").value("CLOSED"))
            .andExpect(jsonPath("$.org.closedAt").exists());

        Organization closed = orgs.findByOrgId(org.getId()).orElseThrow();
        assertThat(closed.getStatus()).isEqualTo(OrgStatus.CLOSED);
        assertThat(closed.getClosedAt()).isNotNull();
        OrgAuditEvent row = OrgAuditAsserts.assertOneNewRow(audit, org.getId(), before, OrgAuditService.ORG_CLOSE);
        assertThat(row.getDetails()).isEqualTo("status DRAFT -> CLOSED");
        assertThat(events.stream(OrgService.OrgClosedEvent.class)).singleElement().satisfies(e -> assertThat(e.orgId()).isEqualTo(org.getId()));
        // soft: the row and the people stay, members keep reading it, nobody can edit it any more
        assertThat(members.countByOrgIdAndStatus(org.getId(), OrgMemberStatus.ACTIVE)).isEqualTo(2);
        call("bob", get("/api/orgs/" + org.getId())).andExpect(status().isOk()).andExpect(jsonPath("$.org.status").value("CLOSED"));
        call("alice", patch("/api/orgs/" + org.getId()).content("{\"name\":\"Reopen\"}")).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("ORG_NOT_EDITABLE"));
        call("alice", get("/api/orgs/mine")).andExpect(jsonPath("$[0].status").value("CLOSED"));
    }

    @Test
    void closingTwiceIsIdempotentAndAuditsOnce() throws Exception {
        Organization org = createdOrg("alice", "Acme");
        long before = audit.countByOrgId(org.getId());
        call("alice", post("/api/orgs/" + org.getId() + "/close")).andExpect(status().isOk());
        call("alice", post("/api/orgs/" + org.getId() + "/close")).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("CLOSED"));
        assertThat(audit.countByOrgId(org.getId())).isEqualTo(before + 1);
        assertThat(events.stream(OrgService.OrgClosedEvent.class).count()).isEqualTo(1);
    }

    @Test
    void onlyAnOwnerMayClose() throws Exception {
        Organization org = fx.org("acme", OrgStatus.ACTIVE);
        fx.active(org, "owner", OrgRole.OWNER);
        long before = audit.countByOrgId(org.getId());
        for (OrgRole role : new OrgRole[] { OrgRole.ADMIN, OrgRole.STAFF, OrgRole.MEMBER, OrgRole.MARKETER, OrgRole.FINANCE }) {
            String login = "u-" + role.name().toLowerCase();
            fx.active(org, login, role);
            assertGeneric404(call(login, post("/api/orgs/" + org.getId() + "/close")));
        }
        assertGeneric404(call("mallory", post("/api/orgs/" + org.getId() + "/close")));
        OrgAuditAsserts.assertNoNewRow(audit, org.getId(), before);
        assertThat(orgs.findByOrgId(org.getId()).orElseThrow().getStatus()).isEqualTo(OrgStatus.ACTIVE);
        assertThat(events.stream(OrgService.OrgClosedEvent.class).count()).isZero();
    }

    @Test
    void aMemberWhoIsOwnerOfADifferentOrgCannotCloseThisOne() throws Exception {
        Organization mine = createdOrg("alice", "Alpha Org");
        Organization theirs = createdOrg("bob", "Beta Org");
        long before = audit.countByOrgId(theirs.getId());
        assertGeneric404(call("alice", post("/api/orgs/" + theirs.getId() + "/close")));
        assertGeneric404(call("alice", patch("/api/orgs/" + theirs.getId()).content("{\"name\":\"Taken over\"}")));
        OrgAuditAsserts.assertNoNewRow(audit, theirs.getId(), before);
        assertThat(orgs.findByOrgId(theirs.getId()).orElseThrow().getStatus()).isEqualTo(OrgStatus.DRAFT);
        assertThat(mine.getId()).isNotEqualTo(theirs.getId());
    }

    @Test
    void theNotFoundBodyNeverContainsThePathOrTheWordForbidden() throws Exception {
        ResultActions r = call("mallory", get("/api/orgs/12345"));
        r.andExpect(status().isNotFound()).andExpect(jsonPath("$.title", containsString("Not Found")));
    }
}
