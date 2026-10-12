package com.dossier.api.web.rest.org;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.AppSetting;
import com.dossier.api.domain.User;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.domain.enumeration.ShareScope;
import com.dossier.api.domain.org.OrgJoinCode;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.AppSettingRepository;
import com.dossier.api.repository.NotificationRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.org.DataShareEventRepository;
import com.dossier.api.repository.org.DataShareRepository;
import com.dossier.api.repository.org.OrgAuditEventRepository;
import com.dossier.api.repository.org.OrgInviteBatchRepository;
import com.dossier.api.repository.org.OrgJoinCodeRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.MailService;
import com.dossier.api.service.ResumeBuilderSettingKeys;
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.org.OrgAuditService;
import com.dossier.api.service.org.OrgJoinCodeService;
import com.dossier.api.service.org.OrgMembership;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

/**
 * O2.2: email invites and joining (docs/design/org/onboarding-invites.md sections 3 and 4). NOT transactional on purpose:
 * the invite emails go out after the transaction commits, so the test has to commit to see them. Every test names its own
 * org and people with a random suffix, so nothing collides.
 *
 * <p>Covers: the invite call (valid / invalid / already-member, role rules, seat state, caps), the public preview, accepting
 * (consent recorded with the seat, single use, double-accept, expiry, the inviter's notice), re-sending (rotation, weekly
 * limit), and the shared join code (place limit, revoke, expiry, MEMBER only), plus rate limiting of misses.
 */
@IntegrationTest
@AutoConfigureMockMvc
class JoinResourceIT {

    private static final String CONSENT = "org-share/v1";

    @Autowired private MockMvc mockMvc;
    @Autowired private UserRepository users;
    @Autowired private OrganizationRepository orgs;
    @Autowired private OrgMemberRepository members;
    @Autowired private OrgInviteBatchRepository batches;
    @Autowired private OrgJoinCodeRepository codes;
    @Autowired private OrgAuditEventRepository audit;
    @Autowired private DataShareRepository shares;
    @Autowired private DataShareEventRepository shareEvents;
    @Autowired private NotificationRepository notifications;
    @Autowired private AppSettingRepository appSettings;
    @Autowired private ResumeBuilderSettings settings;
    @Autowired private OrgJoinCodeService codeService;
    @MockitoBean private MailService mail;

    private OrgFixtures fx;
    private String sfx;
    private Organization acme;
    private String owner;
    private OrgMember ownerSeat;

    @BeforeEach
    void seed() {
        fx = new OrgFixtures(users, orgs, members);
        sfx = UUID.randomUUID().toString().substring(0, 8);
        owner = "own-" + sfx;
        acme = fx.org("acme-" + sfx, OrgStatus.ACTIVE);
        ownerSeat = fx.active(acme, owner, OrgRole.OWNER);
        User o = users.findOneByLogin(owner).orElseThrow();
        o.setFirstName("Priya");
        o.setLastName("Nair");
        users.saveAndFlush(o);
        store(ResumeBuilderSettingKeys.ORG_JOIN_MISS_PER_MIN, "100"); // every test shares one visitor address; the rate-limit test narrows it
    }

    @AfterEach
    void forgetSettings() {
        for (String key : List.of(ResumeBuilderSettingKeys.ORG_INVITE_DAILY_CAP, ResumeBuilderSettingKeys.ORG_INVITE_MAX_PER_BATCH, ResumeBuilderSettingKeys.ORG_JOIN_MISS_PER_MIN, ResumeBuilderSettingKeys.ORG_INVITE_RESENDS_PER_WEEK)) {
            appSettings.findById(key).ifPresent(appSettings::delete);
        }
        settings.invalidate();
    }

    private void store(String key, String value) {
        appSettings.saveAndFlush(new AppSetting(key, value, "test", Instant.now()));
        settings.invalidate();
    }

    // ---- helpers -------------------------------------------------------------------------------------------------

    private ResultActions invite(String login, Organization target, String json) throws Exception {
        return mockMvc.perform(post("/api/orgs/" + target.getId() + "/members/invite").with(user(login)).contentType(MediaType.APPLICATION_JSON).content(json));
    }

    private ResultActions invite(String emailsJson) throws Exception {
        return invite(owner, acme, "{\"emails\":" + emailsJson + ",\"role\":\"MEMBER\"}");
    }

    /** The token in the most recent invite email, read from the link that was handed to the mail service. */
    private String lastToken() {
        ArgumentCaptor<String> link = ArgumentCaptor.forClass(String.class);
        verify(mail, atLeastOnce()).sendOrgInviteEmail(any(), any(), any(), any(), any(), any(), link.capture(), any());
        String last = link.getAllValues().get(link.getAllValues().size() - 1);
        return last.substring(last.indexOf("/join/t/") + "/join/t/".length());
    }

    private String inviteOne(String email) throws Exception {
        clearInvocations(mail);
        invite("[\"" + email + "\"]").andExpect(status().isOk()).andExpect(jsonPath("$.invited.length()").value(1));
        return lastToken();
    }

    private ResultActions accept(String login, String token, String scope) throws Exception {
        return mockMvc.perform(
            post("/api/join/" + token + "/accept").with(user(login)).contentType(MediaType.APPLICATION_JSON).content("{\"shareScope\":\"" + scope + "\",\"consentVersion\":\"" + CONSENT + "\"}")
        );
    }

    private ResultActions acceptCode(String login, String code, String scope) throws Exception {
        return mockMvc.perform(
            post("/api/join/code/" + code).with(user(login)).contentType(MediaType.APPLICATION_JSON).content("{\"shareScope\":\"" + scope + "\",\"consentVersion\":\"" + CONSENT + "\"}")
        );
    }

    private OrgMembership ownerMe() {
        return new OrgMembership(acme.getId(), ownerSeat.getId(), ownerSeat.getUserId(), owner, OrgRole.OWNER, OrgMemberStatus.ACTIVE, acme.getStatus());
    }

    private OrgMember seatOf(String login) {
        Long userId = users.findOneByLogin(login).orElseThrow().getId();
        return members.findByOrgIdAndUserIdAndStatusIn(acme.getId(), userId, OrgMemberStatus.LIVE).get(0);
    }

    // ---- the invite call -----------------------------------------------------------------------------------------

    @Test
    void inviteCreatesPendingSeatsEmailsAfterCommitAndAuditsOnce() throws Exception {
        long auditBefore = audit.countByOrgId(acme.getId());
        clearInvocations(mail);

        invite("[\"New.Person@Example.org\", \"Aarav Mehta <aarav@example.org>\", \"not-an-email\", \"new.person@example.org\"]")
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.invited.length()").value(2))
            .andExpect(jsonPath("$.invited[0].email").value("new.person@example.org"))
            .andExpect(jsonPath("$.invited[1].name").value("Aarav Mehta"))
            .andExpect(jsonPath("$.invalid.length()").value(2))
            .andExpect(jsonPath("$.invalid[0].reason").value("malformed"))
            .andExpect(jsonPath("$.invalid[1].reason").value("duplicate"))
            .andExpect(jsonPath("$.alreadyMember.length()").value(0))
            .andExpect(jsonPath("$.invited[0].token").doesNotExist());

        OrgMember seat = members.findByOrgIdAndInviteEmailAndStatusIn(acme.getId(), "new.person@example.org", List.of(OrgMemberStatus.INVITED)).get(0);
        assertThat(seat.getRole()).isEqualTo(OrgRole.MEMBER);
        assertThat(seat.getInviteTokenHash()).hasSize(64);
        assertThat(seat.getInviteExpiresAt()).isBetween(Instant.now().plus(Duration.ofDays(13)), Instant.now().plus(Duration.ofDays(15)));
        assertThat(seat.getInvitedByMemberId()).isEqualTo(ownerSeat.getId());
        assertThat(seat.getInviteBatchId()).isNotNull();
        assertThat(batches.findByOrgIdAndId(acme.getId(), seat.getInviteBatchId()).orElseThrow().getRowCount()).isEqualTo(4);

        assertThat(audit.countByOrgId(acme.getId()) - auditBefore).as("one audit row for the whole call").isEqualTo(1);
        assertThat(com.dossier.api.service.org.OrgAuditAsserts.rows(audit, acme.getId()).get(0).getAction()).isEqualTo(OrgAuditService.MEMBER_INVITE);
        assertThat(com.dossier.api.service.org.OrgAuditAsserts.rows(audit, acme.getId()).get(0).getDetails()).doesNotContain("@");

        ArgumentCaptor<String> link = ArgumentCaptor.forClass(String.class);
        verify(mail, org.mockito.Mockito.times(2)).sendOrgInviteEmail(any(), any(), eq(acme.getName()), eq("Priya Nair"), eq("a member"), any(), link.capture(), any());
        assertThat(link.getAllValues()).allSatisfy(l -> assertThat(l).contains("/join/t/").matches(".*/join/t/[A-Za-z0-9]{32}$"));
    }

    @Test
    void anAddressThatAlreadyHoldsASeatIsReportedNotInvitedTwice() throws Exception {
        inviteOne("twice@example.org");
        clearInvocations(mail);
        invite("[\"twice@example.org\"]")
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.invited.length()").value(0))
            .andExpect(jsonPath("$.alreadyMember[0]").value("twice@example.org"));
        verify(mail, never()).sendOrgInviteEmail(any(), any(), any(), any(), any(), any(), any(), any());
    }

    @Test
    void aNameThatLooksLikeASensitiveNumberIsRefusedPerEntry() throws Exception {
        invite("[\"123-45-6789 <ok@example.org>\"]")
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.invited.length()").value(0))
            .andExpect(jsonPath("$.invalid[0].reason").value("sensitive_name"));
    }

    @Test
    void rolesFollowThePermissionMatrix() throws Exception {
        OrgMember staff = fx.active(acme, "stf-" + sfx, OrgRole.STAFF);
        fx.active(acme, "adm-" + sfx, OrgRole.ADMIN);
        fx.active(acme, "mem-" + sfx, OrgRole.MEMBER);

        // STAFF invite MEMBERs only, and become the new person's support owner
        invite("stf-" + sfx, acme, "{\"emails\":[\"s1@example.org\"],\"role\":\"ADMIN\"}").andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.field").value("role"));
        invite("stf-" + sfx, acme, "{\"emails\":[\"s1@example.org\"]}").andExpect(status().isOk());
        assertThat(members.findByOrgIdAndInviteEmailAndStatusIn(acme.getId(), "s1@example.org", List.of(OrgMemberStatus.INVITED)).get(0).getSupportOwnerMemberId()).isEqualTo(staff.getId());

        // ADMIN cannot invite another ADMIN; an OWNER can; nobody invites an OWNER or the reserved COACH
        invite("adm-" + sfx, acme, "{\"emails\":[\"a1@example.org\"],\"role\":\"ADMIN\"}").andExpect(status().isUnprocessableEntity());
        invite(owner, acme, "{\"emails\":[\"a1@example.org\"],\"role\":\"ADMIN\"}").andExpect(status().isOk());
        invite(owner, acme, "{\"emails\":[\"o1@example.org\"],\"role\":\"OWNER\"}").andExpect(status().isUnprocessableEntity());
        invite(owner, acme, "{\"emails\":[\"c1@example.org\"],\"role\":\"COACH\"}").andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("RESERVED_VALUE"));

        // a plain MEMBER has no members.invite at all: the same 404 as a stranger
        invite("mem-" + sfx, acme, "{\"emails\":[\"m1@example.org\"]}").andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("NOT_FOUND"));
    }

    @Test
    void aGroupOrSupportOwnerOfAnotherOrgIsA404() throws Exception {
        Organization other = fx.org("other-" + sfx, OrgStatus.ACTIVE);
        fx.active(other, "otherown-" + sfx, OrgRole.OWNER);
        OrgMember foreignStaff = fx.active(other, "otherstf-" + sfx, OrgRole.STAFF);
        invite(owner, acme, "{\"emails\":[\"x@example.org\"],\"groupId\":999999999}").andExpect(status().isNotFound());
        invite(owner, acme, "{\"emails\":[\"x@example.org\"],\"supportOwnerMemberId\":" + foreignStaff.getId() + "}").andExpect(status().isNotFound());
    }

    @Test
    void anOrgThatIsNotActiveTakesAdminInvitesOnlyAndOnlyThree() throws Exception {
        Organization draft = fx.org("draft-" + sfx, OrgStatus.DRAFT);
        fx.active(draft, "dr-" + sfx, OrgRole.OWNER);
        String dr = "dr-" + sfx;

        invite(dr, draft, "{\"emails\":[\"m@example.org\"],\"role\":\"MEMBER\"}")
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.code").value("SEAT_STATE"))
            .andExpect(jsonPath("$.orgStatus").value("DRAFT"));
        invite(dr, draft, "{\"emails\":[\"a1@example.org\",\"a2@example.org\",\"a3@example.org\"],\"role\":\"ADMIN\"}").andExpect(status().isOk()).andExpect(jsonPath("$.invited.length()").value(3));
        invite(dr, draft, "{\"emails\":[\"a4@example.org\"],\"role\":\"ADMIN\"}")
            .andExpect(status().isUnprocessableEntity())
            .andExpect(jsonPath("$.code").value("ORG_LIMIT_REACHED"))
            .andExpect(jsonPath("$.limit").value("draftAdmins"))
            .andExpect(jsonPath("$.max").value(3));

        Organization suspended = fx.org("sus-" + sfx, OrgStatus.SUSPENDED);
        fx.active(suspended, "su-" + sfx, OrgRole.OWNER);
        invite("su-" + sfx, suspended, "{\"emails\":[\"m@example.org\"]}").andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("SEAT_STATE"));
    }

    @Test
    void theBatchAndDailyCapsComeFromTheSettingsSeam() throws Exception {
        store(ResumeBuilderSettingKeys.ORG_INVITE_MAX_PER_BATCH, "2");
        invite("[\"a@example.org\",\"b@example.org\",\"c@example.org\"]")
            .andExpect(status().isUnprocessableEntity())
            .andExpect(jsonPath("$.code").value("ORG_LIMIT_REACHED"))
            .andExpect(jsonPath("$.limit").value("inviteBatch"))
            .andExpect(jsonPath("$.max").value(2));
        assertThat(members.countByOrgIdAndStatus(acme.getId(), OrgMemberStatus.INVITED)).as("nothing was written").isZero();

        store(ResumeBuilderSettingKeys.ORG_INVITE_DAILY_CAP, "10");
        invite("[\"a@example.org\",\"b@example.org\"]").andExpect(status().isOk());
        store(ResumeBuilderSettingKeys.ORG_INVITE_MAX_PER_BATCH, "200");
        invite("[\"1@example.org\",\"2@example.org\",\"3@example.org\",\"4@example.org\",\"5@example.org\",\"6@example.org\",\"7@example.org\",\"8@example.org\",\"9@example.org\"]")
            .andExpect(status().isUnprocessableEntity())
            .andExpect(jsonPath("$.limit").value("inviteDaily"))
            .andExpect(jsonPath("$.max").value(10));
        assertThat(members.countByOrgIdAndStatus(acme.getId(), OrgMemberStatus.INVITED)).isEqualTo(2);
    }

    @Test
    void nothingToInviteIsAnEmptyResultNotAnError() throws Exception {
        invite("[]").andExpect(status().isUnprocessableEntity());
        invite("[\"junk\"]").andExpect(status().isOk()).andExpect(jsonPath("$.batchId").doesNotExist()).andExpect(jsonPath("$.invalid.length()").value(1));
    }

    // ---- preview + accept ------------------------------------------------------------------------------------------

    @Test
    void thePreviewIsPublicShowsTheOrgAndTheConsentAndIsNeverCached() throws Exception {
        String token = inviteOne("preview@example.org");
        mockMvc
            .perform(get("/api/join/" + token))
            .andExpect(status().isOk())
            .andExpect(header().string("Cache-Control", org.hamcrest.Matchers.containsString("no-store")))
            .andExpect(header().string("X-Robots-Tag", "noindex, nofollow"))
            .andExpect(jsonPath("$.source").value("EMAIL"))
            .andExpect(jsonPath("$.orgName").value(acme.getName()))
            .andExpect(jsonPath("$.orgSlug").value(acme.getSlug()))
            .andExpect(jsonPath("$.role").value("MEMBER"))
            .andExpect(jsonPath("$.inviterName").value("Priya Nair"))
            .andExpect(jsonPath("$.open").value(true))
            .andExpect(jsonPath("$.consent.version").value(CONSENT))
            .andExpect(jsonPath("$.consent.defaultScope").value("SUMMARY"))
            .andExpect(jsonPath("$.consent.options[0]").value("SUMMARY"))
            .andExpect(jsonPath("$.consent.options[1]").value("NONE"))
            .andExpect(jsonPath("$.consent.matrix.length()").value(13))
            .andExpect(jsonPath("$.consent.text").isNotEmpty())
            .andExpect(jsonPath("$.email").doesNotExist());
    }

    @Test
    void anyMissIsTheSameGeneric404() throws Exception {
        for (String bad : List.of("short", "x".repeat(32), "!".repeat(32), "A".repeat(64))) {
            mockMvc.perform(get("/api/join/" + bad)).andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("NOT_FOUND"));
        }
        mockMvc.perform(get("/api/join/code/NOPE1234")).andExpect(status().isNotFound());
        mockMvc.perform(post("/api/join/" + "y".repeat(32) + "/accept").with(user(owner)).contentType(MediaType.APPLICATION_JSON).content("{\"shareScope\":\"SUMMARY\",\"consentVersion\":\"" + CONSENT + "\"}")).andExpect(status().isNotFound());
    }

    @Test
    void acceptingNeedsAnAccount() throws Exception {
        String token = inviteOne("anon@example.org");
        mockMvc.perform(post("/api/join/" + token + "/accept").contentType(MediaType.APPLICATION_JSON).content("{\"shareScope\":\"SUMMARY\",\"consentVersion\":\"" + CONSENT + "\"}")).andExpect(status().isUnauthorized());
        assertThat(members.countByOrgIdAndStatus(acme.getId(), OrgMemberStatus.INVITED)).isEqualTo(1);
    }

    @Test
    void acceptingMakesTheSeatActiveRecordsTheConsentAndTellsTheInviter() throws Exception {
        String token = inviteOne("sam@example.org");
        String sam = "sam-" + sfx; // a different address on Kiwiply than the invited one: allowed, the invite binds to whoever accepts
        fx.user(sam);
        long auditBefore = audit.countByOrgId(acme.getId());

        accept(sam, token, "SUMMARY")
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.orgName").value(acme.getName()))
            .andExpect(jsonPath("$.role").value("MEMBER"))
            .andExpect(jsonPath("$.shareScope").value("SUMMARY"));

        OrgMember seat = seatOf(sam);
        assertThat(seat.getStatus()).isEqualTo(OrgMemberStatus.ACTIVE);
        assertThat(seat.getJoinedAt()).isNotNull();
        assertThat(seat.getInviteEmail()).isEqualTo("sam@example.org");
        assertThat(shares.findByOrgIdAndMemberId(acme.getId(), seat.getId()).orElseThrow().getScope()).isEqualTo(ShareScope.SUMMARY);
        var events = shareEvents.findByOrgIdAndMemberLoginOrderByIdAsc(acme.getId(), sam);
        assertThat(events).hasSize(1);
        assertThat(events.get(0).getReason()).isEqualTo("JOIN");
        assertThat(events.get(0).getConsentVersion()).isEqualTo(CONSENT);
        assertThat(events.get(0).getIpHash()).as("a hash of the address, never the address").hasSize(64);
        assertThat(batches.findByOrgIdAndId(acme.getId(), seat.getInviteBatchId()).orElseThrow().getAcceptedCount()).isEqualTo(1);
        assertThat(audit.findByOrgIdAndAction(acme.getId(), OrgAuditService.MEMBER_JOIN, org.springframework.data.domain.PageRequest.of(0, 5)).getContent()).hasSize(1);
        assertThat(audit.countByOrgId(acme.getId()) - auditBefore).as("a join writes MEMBER_JOIN and SHARE_SCOPE_CHANGED").isEqualTo(2);

        Long ownerUserId = ownerSeat.getUserId();
        assertThat(notifications.findByUserIdOrderByCreatedAtDesc(ownerUserId)).anySatisfy(n -> {
            assertThat(n.getKind()).isEqualTo("ORG_INVITE_ACCEPTED");
            assertThat(n.getTitle()).contains(acme.getName());
        });

        // the link is single use: a stranger holding it gets the same 404, the same person gets "already a member"
        fx.user("late-" + sfx);
        accept("late-" + sfx, token, "SUMMARY").andExpect(status().isNotFound());
        accept(sam, token, "SUMMARY").andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("ALREADY_MEMBER"));
        mockMvc.perform(get("/api/join/" + token)).andExpect(status().isNotFound());
    }

    @Test
    void choosingNoneStillRecordsAChoiceAndFullIsNeverTakenHere() throws Exception {
        String token = inviteOne("none@example.org");
        String pat = "pat-" + sfx;
        fx.user(pat);
        accept(pat, token, "FULL").andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.field").value("shareScope"));
        mockMvc
            .perform(post("/api/join/" + token + "/accept").with(user(pat)).contentType(MediaType.APPLICATION_JSON).content("{\"shareScope\":\"NONE\",\"consentVersion\":\"org-share/v99\"}"))
            .andExpect(status().isUnprocessableEntity())
            .andExpect(jsonPath("$.field").value("consentVersion"));
        assertThat(members.countByOrgIdAndStatus(acme.getId(), OrgMemberStatus.INVITED)).as("a refused accept changed nothing").isEqualTo(1);

        accept(pat, token, "NONE").andExpect(status().isOk()).andExpect(jsonPath("$.shareScope").value("NONE"));
        assertThat(shares.findByOrgIdAndMemberId(acme.getId(), seatOf(pat).getId()).orElseThrow().getScope()).isEqualTo(ShareScope.NONE);
    }

    @Test
    void anExpiredInviteIs409WithTheOrgNameForThePage() throws Exception {
        String token = inviteOne("late@example.org");
        OrgMember seat = members.findByOrgIdAndInviteEmailAndStatusIn(acme.getId(), "late@example.org", List.of(OrgMemberStatus.INVITED)).get(0);
        seat.setInviteExpiresAt(Instant.now().minus(Duration.ofMinutes(1)));
        members.saveAndFlush(seat);
        fx.user("lt-" + sfx);

        mockMvc.perform(get("/api/join/" + token)).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("INVITE_EXPIRED")).andExpect(jsonPath("$.orgName").value(acme.getName()));
        accept("lt-" + sfx, token, "SUMMARY").andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("INVITE_EXPIRED"));
        assertThat(members.findByOrgIdAndUserIdAndStatusIn(acme.getId(), users.findOneByLogin("lt-" + sfx).orElseThrow().getId(), OrgMemberStatus.LIVE)).isEmpty();
    }

    @Test
    void someoneWhoAlreadyHoldsASeatCannotTakeAnother() throws Exception {
        String token = inviteOne("dup@example.org");
        accept(owner, token, "SUMMARY").andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("ALREADY_MEMBER"));
        assertThat(members.findByOrgIdAndInviteEmailAndStatusIn(acme.getId(), "dup@example.org", List.of(OrgMemberStatus.INVITED))).hasSize(1);
    }

    @Test
    void anAdminInviteCanBeAcceptedBeforeActivationButAMemberInviteCannotYet() throws Exception {
        Organization draft = fx.org("draft2-" + sfx, OrgStatus.DRAFT);
        OrgMember draftOwner = fx.active(draft, "d2-" + sfx, OrgRole.OWNER);
        clearInvocations(mail);
        invite("d2-" + sfx, draft, "{\"emails\":[\"colleague@example.org\"],\"role\":\"ADMIN\"}").andExpect(status().isOk());
        String token = lastToken();
        mockMvc.perform(get("/api/join/" + token)).andExpect(status().isOk()).andExpect(jsonPath("$.role").value("ADMIN")).andExpect(jsonPath("$.open").value(true));
        fx.user("col-" + sfx);
        accept("col-" + sfx, token, "NONE").andExpect(status().isOk()).andExpect(jsonPath("$.role").value("ADMIN"));

        // a MEMBER invite made while the acme was active, then the acme drops out of ACTIVE: 409 SEAT_STATE, nothing written
        String t2 = inviteOne("slow@example.org");
        acme.setStatus(OrgStatus.SUSPENDED);
        orgs.saveAndFlush(acme);
        fx.user("sl-" + sfx);
        mockMvc.perform(get("/api/join/" + t2)).andExpect(status().isOk()).andExpect(jsonPath("$.open").value(false));
        accept("sl-" + sfx, t2, "SUMMARY").andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("SEAT_STATE"));
        assertThat(draftOwner.getRole()).isEqualTo(OrgRole.OWNER);
    }

    @Test
    void aClosedOrgHasNoJoinPage() throws Exception {
        String token = inviteOne("closed@example.org");
        acme.setStatus(OrgStatus.CLOSED);
        orgs.saveAndFlush(acme);
        mockMvc.perform(get("/api/join/" + token)).andExpect(status().isNotFound());
    }

    // ---- re-send ---------------------------------------------------------------------------------------------------

    @Test
    void resendRotatesTheTokenAndIsLimitedPerWeek() throws Exception {
        store(ResumeBuilderSettingKeys.ORG_INVITE_RESENDS_PER_WEEK, "2");
        String first = inviteOne("again@example.org");
        OrgMember seat = members.findByOrgIdAndInviteEmailAndStatusIn(acme.getId(), "again@example.org", List.of(OrgMemberStatus.INVITED)).get(0);
        String oldHash = seat.getInviteTokenHash();

        clearInvocations(mail);
        mockMvc.perform(post("/api/orgs/" + acme.getId() + "/members/" + seat.getId() + "/resend").with(user(owner))).andExpect(status().isOk()).andExpect(jsonPath("$.email").value("again@example.org"));
        String second = lastToken();
        assertThat(second).isNotEqualTo(first);
        assertThat(members.findByOrgIdAndId(acme.getId(), seat.getId()).orElseThrow().getInviteTokenHash()).isNotEqualTo(oldHash);
        mockMvc.perform(get("/api/join/" + first)).andExpect(status().isNotFound());
        mockMvc.perform(get("/api/join/" + second)).andExpect(status().isOk());

        mockMvc.perform(post("/api/orgs/" + acme.getId() + "/members/" + seat.getId() + "/resend").with(user(owner))).andExpect(status().isOk());
        mockMvc
            .perform(post("/api/orgs/" + acme.getId() + "/members/" + seat.getId() + "/resend").with(user(owner)))
            .andExpect(status().isUnprocessableEntity())
            .andExpect(jsonPath("$.code").value("ORG_LIMIT_REACHED"))
            .andExpect(jsonPath("$.limit").value("inviteResends"))
            .andExpect(jsonPath("$.max").value(2));
    }

    @Test
    void onlyAPendingInviteCanBeResent() throws Exception {
        String token = inviteOne("done@example.org");
        fx.user("dn-" + sfx);
        accept("dn-" + sfx, token, "SUMMARY").andExpect(status().isOk());
        Long joined = seatOf("dn-" + sfx).getId();
        mockMvc.perform(post("/api/orgs/" + acme.getId() + "/members/" + joined + "/resend").with(user(owner))).andExpect(status().isNotFound());
        mockMvc.perform(post("/api/orgs/" + acme.getId() + "/members/" + ownerSeat.getId() + "/resend").with(user(owner))).andExpect(status().isNotFound());
    }

    // ---- shared join codes -----------------------------------------------------------------------------------------

    @Test
    void aJoinCodeMintsMemberSeatsUpToItsLimitAndTheLastPlaceCannotBeTakenTwice() throws Exception {
        OrgJoinCode code = codeService.create(ownerMe(), null, 1, null);
        assertThat(code.getRole()).isEqualTo(OrgRole.MEMBER);
        assertThat(code.getCode()).hasSize(8).matches("[0-9A-HJKMNP-TV-Z]{8}");
        assertThat(code.getExpiresAt()).isAfter(Instant.now().plus(Duration.ofDays(29)));

        mockMvc
            .perform(get("/api/join/code/" + code.getCode().toLowerCase()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.source").value("CODE"))
            .andExpect(jsonPath("$.orgSlug").value(acme.getSlug()))
            .andExpect(jsonPath("$.role").value("MEMBER"));

        fx.user("c1-" + sfx);
        fx.user("c2-" + sfx);
        acceptCode("c1-" + sfx, code.getCode(), "SUMMARY").andExpect(status().isOk()).andExpect(jsonPath("$.role").value("MEMBER"));
        OrgMember seat = seatOf("c1-" + sfx);
        assertThat(seat.getStatus()).isEqualTo(OrgMemberStatus.ACTIVE);
        assertThat(seat.getInviteEmail()).isNull();
        assertThat(shares.findByOrgIdAndMemberId(acme.getId(), seat.getId()).orElseThrow().getScope()).isEqualTo(ShareScope.SUMMARY);

        acceptCode("c1-" + sfx, code.getCode(), "SUMMARY").andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("ALREADY_MEMBER"));
        acceptCode("c2-" + sfx, code.getCode(), "SUMMARY").andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("INVITE_EXPIRED")).andExpect(jsonPath("$.reason").value("full"));
        mockMvc.perform(get("/api/join/code/" + code.getCode())).andExpect(status().isConflict()).andExpect(jsonPath("$.reason").value("full"));
        assertThat(codes.findByCode(code.getCode()).orElseThrow().getUses()).isEqualTo(1);
    }

    @Test
    void aRevokedOrExpiredCodeDoesNotWorkAndACodeFromAnotherOrgIsNotMine() throws Exception {
        OrgJoinCode revoked = codeService.create(ownerMe(), null, null, null);
        revoked.setRevokedAt(Instant.now());
        codes.save(revoked);
        mockMvc.perform(get("/api/join/code/" + revoked.getCode())).andExpect(status().isNotFound());

        OrgJoinCode old = codeService.create(ownerMe(), null, null, null);
        old.setExpiresAt(Instant.now().minus(Duration.ofDays(1)));
        codes.save(old);
        fx.user("ex-" + sfx);
        mockMvc.perform(get("/api/join/code/" + old.getCode())).andExpect(status().isConflict()).andExpect(jsonPath("$.reason").value("expired"));
        acceptCode("ex-" + sfx, old.getCode(), "SUMMARY").andExpect(status().isConflict());

        assertThat(codeService.create(ownerMe(), null, null, 5).getExpiresAt()).isBefore(Instant.now().plus(Duration.ofDays(6)));
        Organization other = fx.org("o2-" + sfx, OrgStatus.ACTIVE);
        OrgMember otherOwner = fx.active(other, "o2own-" + sfx, OrgRole.OWNER);
        OrgMembership otherMe = new OrgMembership(other.getId(), otherOwner.getId(), otherOwner.getUserId(), "o2own-" + sfx, OrgRole.OWNER, OrgMemberStatus.ACTIVE, other.getStatus());
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> codeService.create(otherMe, 999999999L, null, null)).isInstanceOf(com.dossier.api.service.org.OrgNotFoundException.class);
    }

    @Test
    void walkingTheCodeSpaceIsRateLimited() throws Exception {
        store(ResumeBuilderSettingKeys.ORG_JOIN_MISS_PER_MIN, "3");
        String visitor = "203.0.113." + (50 + (sfx.hashCode() & 0x3f)); // its own address, so the other tests' misses do not count
        int tooMany = 0;
        for (int i = 0; i < 6; i++) {
            int s = mockMvc.perform(get("/api/join/code/ABCD123" + i).header("X-Forwarded-For", visitor)).andReturn().getResponse().getStatus();
            if (s == 429) tooMany++;
        }
        assertThat(tooMany).as("misses beyond the per-minute budget are throttled").isGreaterThanOrEqualTo(2);
    }
}
