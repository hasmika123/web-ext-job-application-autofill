package com.dossier.api.web.rest.org;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.verify;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.AppSetting;
import com.dossier.api.domain.ent.OrgMemberRole;
import com.dossier.api.domain.enumeration.OrgGroupKind;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.domain.enumeration.OrgType;
import com.dossier.api.domain.org.OrgGroup;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.AppSettingRepository;
import com.dossier.api.repository.NotificationRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.ent.OrgMemberRoleRepository;
import com.dossier.api.repository.ent.OrgRoleRepository;
import com.dossier.api.repository.org.OrgAuditEventRepository;
import com.dossier.api.repository.org.OrgGroupRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.MailService;
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.ent.OrgRoleService;
import com.dossier.api.service.ent.RoleTemplateSeeder;
import com.dossier.api.service.ent.TenantResolver;
import com.dossier.api.service.org.OrgAuditAsserts;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.ResultActions;

/**
 * Shared setup for the invitation integration tests (X1.15). NOT transactional on purpose: invite emails go out after commit, and
 * accepting commits. Every test names its organization and people with a random suffix, so nothing collides; the enterprise flags and
 * any setting a test stored are removed after each test. The system role templates are seeded (idempotent) before each test.
 */
@IntegrationTest
@AutoConfigureMockMvc
abstract class AbstractInviteIT {

    static final String CONSENT = "org-share/v1";
    static final String WHO = "invite-it";

    @Autowired protected MockMvc mockMvc;
    @Autowired protected ObjectMapper mapper;
    @Autowired protected UserRepository users;
    @Autowired protected OrganizationRepository orgs;
    @Autowired protected OrgMemberRepository members;
    @Autowired protected OrgMemberRoleRepository memberRoles;
    @Autowired protected OrgRoleRepository roles;
    @Autowired protected OrgGroupRepository groups;
    @Autowired protected OrgAuditEventRepository audit;
    @Autowired protected NotificationRepository notifications;
    @Autowired protected AppSettingRepository appSettings;
    @Autowired protected ResumeBuilderSettings settings;
    @Autowired protected RoleTemplateSeeder seeder;
    @Autowired protected OrgRoleService roleService;
    @Autowired protected TenantResolver resolver;
    @MockitoBean protected MailService mail;

    protected OrgFixtures fx;
    protected String sfx;
    protected Organization acme;
    protected String owner;
    protected OrgMember ownerSeat;

    @BeforeEach
    void baseSeed() {
        fx = new OrgFixtures(users, orgs, members);
        sfx = UUID.randomUUID().toString().substring(0, 8);
        seeder.seed();
        store("flag.enterprise", "{\"on\":true}");
        store("flag.enterprise.roles", "{\"on\":true}");
        store("org.join.missPerMin", "100"); // every test shares one visitor address
        acme = fx.org("inv-acme-" + sfx, OrgStatus.ACTIVE);
        owner = "own-" + sfx;
        ownerSeat = fx.active(acme, owner, OrgRole.OWNER);
        roleService.syncFromLegacy(ownerSeat);
    }

    @AfterEach
    void baseForget() {
        for (AppSetting s : appSettings.findAll()) if (WHO.equals(s.getUpdatedBy())) appSettings.delete(s);
        settings.invalidate();
        resolver.invalidate();
    }

    protected void store(String key, String value) {
        appSettings.saveAndFlush(new AppSetting(key, value, WHO, Instant.now()));
        settings.invalidate();
        resolver.invalidate();
    }

    protected void unstore(String key) {
        appSettings.findById(key).ifPresent(appSettings::delete);
        settings.invalidate();
    }

    // ---- people and roles -------------------------------------------------------------------------------------------------

    protected Long roleId(String templateKey) {
        return roles.findSystemByRoleKey(templateKey).orElseThrow().getId();
    }

    /** An ACTIVE seat whose legacy enum is {@code mirror} and whose live role rows are exactly {@code templateKeys} (first = primary). */
    protected OrgMember seatWithRoles(Organization org, String login, OrgRole mirror, String... templateKeys) {
        OrgMember seat = fx.active(org, login, mirror);
        for (int i = 0; i < templateKeys.length; i++) {
            OrgMemberRole r = new OrgMemberRole();
            r.setOrgId(org.getId());
            r.setMemberId(seat.getId());
            r.setRoleId(roleId(templateKeys[i]));
            r.setPrimary(i == 0);
            memberRoles.saveAndFlush(r);
        }
        seat.setPrimaryRoleId(roleId(templateKeys[0]));
        return members.saveAndFlush(seat);
    }

    protected OrgGroup group(Organization org, String name, OrgGroupKind kind) {
        OrgGroup g = new OrgGroup();
        g.setOrgId(org.getId());
        g.setName(name);
        g.setKind(kind);
        return groups.saveAndFlush(g);
    }

    protected Organization consultancy(String slug) {
        Organization o = fx.org(slug, OrgStatus.ACTIVE);
        o.setType(OrgType.CONSULTANCY);
        return orgs.saveAndFlush(o);
    }

    // ---- calls ------------------------------------------------------------------------------------------------------------

    protected ResultActions postAs(String login, String uri, String json) throws Exception {
        var req = post(uri).with(user(login)).contentType(MediaType.APPLICATION_JSON);
        return mockMvc.perform(json == null ? req : req.content(json));
    }

    protected ResultActions getAs(String login, String uri) throws Exception {
        return mockMvc.perform(get(uri).with(user(login)));
    }

    protected ResultActions invite(String login, Organization org, String json) throws Exception {
        return postAs(login, "/api/orgs/" + org.getId() + "/invitations", json);
    }

    protected JsonNode json(ResultActions r) throws Exception {
        return mapper.readTree(r.andReturn().getResponse().getContentAsString());
    }

    /** The token in the most recent invite email (read from the link handed to the mail service). */
    protected String lastToken() {
        ArgumentCaptor<String> link = ArgumentCaptor.forClass(String.class);
        verify(mail, atLeastOnce()).sendOrgInviteEmail(any(), any(), any(), any(), any(), any(), link.capture(), any(), any(), any());
        String last = link.getAllValues().get(link.getAllValues().size() - 1);
        return last.substring(last.indexOf("/join/t/") + "/join/t/".length());
    }

    /** Invites one address as {@code login} with {@code extra} JSON fields (no braces) and returns the emailed token. */
    protected String inviteOne(String login, Organization org, String email, String extra) throws Exception {
        clearInvocations(mail);
        invite(login, org, "{\"emails\":[\"" + email + "\"]" + (extra == null || extra.isBlank() ? "" : "," + extra) + "}").andReturn();
        return lastToken();
    }

    protected ResultActions accept(String login, String token, String scope) throws Exception {
        return postAs(login, "/api/join/" + token + "/accept", "{\"shareScope\":\"" + scope + "\",\"consentVersion\":\"" + CONSENT + "\"}");
    }

    protected ResultActions preview(String token) throws Exception {
        return mockMvc.perform(get("/api/join/" + token));
    }

    protected OrgMember seatOfInvite(Long orgId, String email) {
        return members.findByOrgIdAndInviteEmailAndStatusIn(orgId, email, List.of(OrgMemberStatus.INVITED, OrgMemberStatus.ACTIVE, OrgMemberStatus.SUSPENDED)).get(0);
    }

    protected long auditCount(Long orgId, String action) {
        return OrgAuditAsserts.rows(audit, orgId).stream().filter(e -> action.equals(e.getAction())).count();
    }

    /** The details text of the newest audit row with this action in {@code orgId}. */
    protected String auditDetails(Long orgId, String action) {
        return OrgAuditAsserts.rows(audit, orgId).stream().filter(e -> action.equals(e.getAction())).findFirst().orElseThrow().getDetails();
    }

    protected String auditActor(Long orgId, String action) {
        return OrgAuditAsserts.rows(audit, orgId).stream().filter(e -> action.equals(e.getAction())).findFirst().orElseThrow().getActorLogin();
    }

    protected List<OrgMemberRole> liveRoles(Long orgId, Long memberId) {
        return memberRoles.findLiveByOrgIdAndMemberId(orgId, memberId);
    }

    protected int statusOf(MvcResult r) {
        return r.getResponse().getStatus();
    }

    protected void assertNoToken(ResultActions result, String token) throws Exception {
        assertThat(result.andReturn().getResponse().getContentAsString()).as("a response never carries the token").doesNotContain(token);
    }
}
