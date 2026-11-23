package com.dossier.api.service.ent;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.OrgTrustedDevice;
import com.dossier.api.domain.OrgTwoStepChallenge;
import com.dossier.api.domain.User;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.OrgTrustedDeviceRepository;
import com.dossier.api.repository.OrgTwoStepChallengeRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.MailService;
import com.dossier.api.service.ent.settings.OrgSecurityPolicy;
import com.dossier.api.service.org.OrgAuditService;
import com.dossier.api.service.org.OrgException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

/** Gap D-2: the organization's two-step sign-in (emailed code, bound to its host, remembered browsers ended by a password change). */
class OrgTwoStepServiceTest {

    static final Long ORG = 7L;
    static final Long HOST = 70L;
    static final Long USER = 42L;
    static final Instant NOW = Instant.parse("2026-11-19T10:00:00Z");

    OrgTwoStepChallengeRepository challenges = mock(OrgTwoStepChallengeRepository.class);
    OrgTrustedDeviceRepository devices = mock(OrgTrustedDeviceRepository.class);
    UserRepository users = mock(UserRepository.class);
    OrganizationRepository orgs = mock(OrganizationRepository.class);
    MailService mail = mock(MailService.class);
    OrgSecurityPolicy policy = mock(OrgSecurityPolicy.class);
    OrgAuditService audit = mock(OrgAuditService.class);
    BCryptPasswordEncoder encoder = new BCryptPasswordEncoder(4);
    OrgTwoStepService service;
    User user;
    Map<String, OrgTwoStepChallenge> byToken = new HashMap<>();
    AtomicReference<OrgTrustedDevice> savedDevice = new AtomicReference<>();

    @BeforeEach
    void world() {
        service = new OrgTwoStepService(challenges, devices, users, orgs, encoder, mail, policy, audit);
        service.setClock(Clock.fixed(NOW, ZoneOffset.UTC));
        user = new User();
        user.setId(USER);
        user.setLogin("ana");
        user.setEmail("ana@acme.test");
        user.setPassword("$2a$10$hashOfTheCurrentPassword................................");
        when(users.findById(USER)).thenReturn(Optional.of(user));
        Organization o = new Organization();
        o.setName("Acme Staffing");
        when(orgs.findByOrgId(ORG)).thenReturn(Optional.of(o));
        when(policy.twoStepCodeMinutes()).thenReturn(10);
        when(policy.twoStepCodesPerHour()).thenReturn(5);
        when(policy.twoStepRememberDays()).thenReturn(30);
        when(challenges.save(any(OrgTwoStepChallenge.class))).thenAnswer(i -> {
            OrgTwoStepChallenge c = i.getArgument(0);
            byToken.put(c.getChallengeToken(), c);
            return c;
        });
        when(challenges.findByChallengeToken(anyString())).thenAnswer(i -> Optional.ofNullable(byToken.get((String) i.getArgument(0))));
        when(devices.save(any(OrgTrustedDevice.class))).thenAnswer(i -> {
            savedDevice.set(i.getArgument(0));
            return i.getArgument(0);
        });
        when(devices.findByTokenHash(anyString())).thenAnswer(i -> Optional.ofNullable(savedDevice.get()).filter(d -> d.getTokenHash().equals(i.getArgument(0))));
    }

    /** The emailed code (captured from the mail) and the challenge handle. */
    private String[] sendCode() {
        OrgTwoStepService.Challenge ch = service.start(ORG, HOST, USER, "ana", "ROLE_USER");
        ArgumentCaptor<String> html = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<String> subject = ArgumentCaptor.forClass(String.class);
        verify(mail, org.mockito.Mockito.atLeastOnce()).sendEmail(eq("ana@acme.test"), subject.capture(), html.capture(), anyBoolean(), anyBoolean());
        java.util.regex.Matcher m = java.util.regex.Pattern.compile(">(\\d{6})<").matcher(html.getValue());
        assertThat(m.find()).isTrue();
        assertThat(subject.getValue()).isEqualTo("Your sign-in code for Acme Staffing");
        assertThat(html.getValue() + subject.getValue()).doesNotContainIgnoringCase("kiwiply");
        return new String[] { ch.token(), m.group(1) };
    }

    @Test
    void theRightCodeOnTheSameHostSignsInOnceAndIsAudited() {
        String[] c = sendCode();
        verify(audit).recordHostEvent(ORG, HOST, "ana", OrgAuditService.LOGIN_TWO_STEP_CHALLENGED, "LOW", "a sign-in code was emailed");
        Optional<OrgTwoStepService.Verified> v = service.verify(c[0], c[1], ORG, HOST);
        assertThat(v).isPresent();
        assertThat(v.get().userId()).isEqualTo(USER);
        verify(challenges).delete(any(OrgTwoStepChallenge.class));
    }

    @Test
    void aCodePresentedOnAnotherAddressOrOrganizationIsRefused() {
        String[] c = sendCode();
        assertThat(service.verify(c[0], c[1], ORG, 71L)).as("another hostname of the same organization").isEmpty();
        assertThat(service.verify(c[0], c[1], 8L, HOST)).as("another organization").isEmpty();
        assertThat(service.verify(c[0], c[1], null, null)).as("the platform host").isEmpty();
        verify(audit, org.mockito.Mockito.atLeastOnce()).recordHostEvent(eq(ORG), eq(HOST), eq("ana"), eq(OrgAuditService.LOGIN_TWO_STEP_FAILED), anyString(), eq("the code was presented on another address"));
    }

    @Test
    void fiveWrongCodesBurnTheChallengeAndAnExpiredOneNeverWorks() {
        String[] c = sendCode();
        for (int i = 0; i < OrgTwoStepService.MAX_ATTEMPTS; i++) assertThat(service.verify(c[0], "000000".equals(c[1]) ? "111111" : "000000", ORG, HOST)).isEmpty();
        verify(challenges).delete(byToken.get(c[0]));

        String[] late = sendCode();
        byToken.get(late[0]).setExpiresAt(NOW.minusSeconds(1));
        assertThat(service.verify(late[0], late[1], ORG, HOST)).isEmpty();
    }

    @Test
    void noEmailIsRefusedNeverLetThrough() {
        user.setEmail(null);
        assertThatThrownBy(() -> service.start(ORG, HOST, USER, "ana", "ROLE_USER")).isInstanceOfSatisfying(OrgException.class, e -> {
            assertThat(e.getStatus()).isEqualTo(403);
            assertThat(e.getCode()).isEqualTo(OrgTwoStepService.CODE_NO_EMAIL);
        });
        verify(mail, never()).sendEmail(anyString(), anyString(), anyString(), anyBoolean(), anyBoolean());
    }

    @Test
    void theHourlyLimitStopsNewCodes() {
        when(challenges.countByUserIdSince(eq(USER), any())).thenReturn(5L);
        assertThatThrownBy(() -> service.start(ORG, HOST, USER, "ana", "ROLE_USER")).isInstanceOfSatisfying(OrgException.class, e -> {
            assertThat(e.getStatus()).isEqualTo(429);
            assertThat(e.getCode()).isEqualTo(OrgTwoStepService.CODE_TOO_MANY);
        });
        verify(challenges).countByUserIdSince(USER, NOW.minus(Duration.ofHours(1)));
    }

    @Test
    void aRememberedBrowserCountsUntilItExpiresOrThePasswordChanges() {
        String[] c = sendCode();
        OrgTwoStepService.Verified v = service.verify(c[0], c[1], ORG, HOST).orElseThrow();
        OrgTwoStepService.Device d = service.passed(v, true).orElseThrow();
        assertThat(d.expiresAt()).isEqualTo(NOW.plus(Duration.ofDays(30)));
        assertThat(savedDevice.get().getTokenHash()).as("only a hash is stored").isNotEqualTo(d.token()).hasSize(64);

        assertThat(service.trusted(ORG, USER, d.token())).isTrue();
        assertThat(service.trusted(8L, USER, d.token())).as("another organization").isFalse();
        assertThat(service.trusted(ORG, 43L, d.token())).as("another person").isFalse();
        assertThat(service.trusted(ORG, USER, "made-up")).isFalse();

        user.setPassword("$2a$10$aNewPasswordHash.........................................");
        assertThat(service.trusted(ORG, USER, d.token())).as("a password change ends it").isFalse();
    }

    @Test
    void rememberingIsOffWhenThePlatformSetsZeroDays() {
        when(policy.twoStepRememberDays()).thenReturn(0);
        String[] c = sendCode();
        OrgTwoStepService.Verified v = service.verify(c[0], c[1], ORG, HOST).orElseThrow();
        assertThat(service.passed(v, true)).isEmpty();
        verify(devices, never()).save(any());
        verify(audit).recordHostEvent(ORG, HOST, "ana", OrgAuditService.LOGIN_TWO_STEP_PASSED, "LOW", "the code was right");
    }
}
