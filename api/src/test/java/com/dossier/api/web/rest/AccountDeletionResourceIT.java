package com.dossier.api.web.rest;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.mockito.ArgumentMatchers.any;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.AiAnswer;
import com.dossier.api.domain.Application;
import com.dossier.api.domain.Bio;
import com.dossier.api.domain.FieldCache;
import com.dossier.api.domain.ProfileSuggestion;
import com.dossier.api.domain.RefreshToken;
import com.dossier.api.domain.Resume;
import com.dossier.api.domain.User;
import com.dossier.api.domain.enumeration.ApplicationStatus;
import com.dossier.api.domain.enumeration.ResumeStatus;
import com.dossier.api.repository.AiAnswerRepository;
import com.dossier.api.repository.ApplicationRepository;
import com.dossier.api.repository.BioRepository;
import com.dossier.api.repository.FieldCacheRepository;
import com.dossier.api.repository.ProfileSuggestionRepository;
import com.dossier.api.repository.RefreshTokenRepository;
import com.dossier.api.repository.ResumeRepository;
import com.dossier.api.repository.SubscriptionRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.domain.Subscription;
import com.dossier.api.service.billing.StripeGateway;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import java.time.Instant;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

/**
 * Integration test for {@link AccountDeletionResource} — GDPR/CCPA "delete my account and
 * all my data". Seeds one row of every user-owned entity for the seeded "user", then
 * deletes the account and asserts every row AND the user are gone. The whole test runs in
 * one rolled-back transaction, so the seeded "user" is restored afterwards.
 */
@IntegrationTest
@AutoConfigureMockMvc
class AccountDeletionResourceIT {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private BioRepository bioRepository;

    @Autowired
    private ResumeRepository resumeRepository;

    @Autowired
    private ApplicationRepository applicationRepository;

    @Autowired
    private AiAnswerRepository aiAnswerRepository;

    @Autowired
    private FieldCacheRepository fieldCacheRepository;

    @Autowired
    private RefreshTokenRepository refreshTokenRepository;

    @Autowired
    private ProfileSuggestionRepository profileSuggestionRepository;

    @Autowired
    private SubscriptionRepository subscriptionRepository;

    /** Stubbed: the test is about OUR ordering and cleanup, not Stripe's API. */
    @MockitoBean
    private StripeGateway stripeGateway;

    @Test
    @Transactional
    @WithMockUser(username = "user")
    void deletesAllOwnedDataAndTheAccount() throws Exception {
        User user = userRepository.findOneByLogin("user").orElseThrow();
        Instant now = Instant.ofEpochMilli(0);

        RefreshToken refreshToken = new RefreshToken();
        refreshToken.setJti("jti-del-test");
        refreshToken.setFamilyId("fam-del-test");
        refreshToken.setUserId(user.getId());
        refreshToken.setExpiresAt(now.plusSeconds(86400));
        refreshToken.setCreatedAt(now);
        refreshTokenRepository.saveAndFlush(refreshToken);

        Bio bio = new Bio().payload("{}").updatedAt(now);
        bio.setUser(user);
        bio = bioRepository.saveAndFlush(bio);

        // Empty object key => no object-storage call needed for this DB-focused test.
        Resume resume = new Resume().label("R").r2ObjectKey("").status(ResumeStatus.NEEDS_REVIEW).createdAt(now);
        resume.setUser(user);
        resume = resumeRepository.saveAndFlush(resume);

        Application app = new Application()
            .company("Acme")
            .roleTitle("Engineer")
            .status(ApplicationStatus.DRAFT)
            .createdAt(now)
            .updatedAt(now);
        app.setUser(user);
        app = applicationRepository.saveAndFlush(app);

        AiAnswer ai = new AiAnswer().questionHash("qh").answer("a").createdAt(now);
        ai.setUser(user);
        ai = aiAnswerRepository.saveAndFlush(ai);

        FieldCache fc = new FieldCache().fieldKey("k").contextHash("ch").value("v").hitCount(1).updatedAt(now);
        fc.setUser(user);
        fc = fieldCacheRepository.saveAndFlush(fc);

        // Phase 10.3c: a learned-answer suggestion (FK user_id, no cascade) must go too.
        ProfileSuggestion suggestion = new ProfileSuggestion();
        suggestion.setUser(user);
        suggestion.setFieldKey("city");
        suggestion.setValue("Atlanta");
        suggestion = profileSuggestionRepository.saveAndFlush(suggestion);

        mockMvc.perform(delete("/api/account")).andExpect(status().isNoContent());

        assertThat(userRepository.findOneByLogin("user")).isEmpty();
        assertThat(bioRepository.findById(bio.getId())).isEmpty();
        assertThat(resumeRepository.findById(resume.getId())).isEmpty();
        assertThat(applicationRepository.findById(app.getId())).isEmpty();
        assertThat(aiAnswerRepository.findById(ai.getId())).isEmpty();
        assertThat(fieldCacheRepository.findById(fc.getId())).isEmpty();
        assertThat(profileSuggestionRepository.findById(suggestion.getId())).isEmpty();
        assertThat(refreshTokenRepository.findByJti("jti-del-test")).isEmpty();
    }

    // ---- billing (pre-launch review, 2026-09-22) ---------------------------------------------

    /**
     * A paying user can delete their account, and stops being charged when they do.
     *
     * <p>Two failures this pins, both found in review. {@code subscription.user_id} is a foreign
     * key with no cascade, so with the row left behind the user delete itself threw and the GDPR
     * erasure path 500'd for exactly the users who pay. And even with the row gone, the Stripe
     * subscription would have kept renewing an account with no login left to cancel from.
     */
    @Test
    @Transactional
    @WithMockUser(username = "user")
    void aSubscribedUserCanDeleteTheirAccountAndStopsBeingBilled() throws Exception {
        User user = userRepository.findOneByLogin("user").orElseThrow();
        Subscription sub = new Subscription();
        sub.setUser(user);
        sub.setStripeCustomerId("cus_del_1");
        sub.setStripeSubscriptionId("sub_del_1");
        sub.setPlan(Subscription.PLAN_PRO);
        sub.setStatus("active");
        subscriptionRepository.saveAndFlush(sub);
        when(stripeGateway.isEnabled()).thenReturn(true);

        mockMvc.perform(delete("/api/account")).andExpect(status().isNoContent());

        verify(stripeGateway).cancelSubscription("sub_del_1");
        assertThat(subscriptionRepository.findOneByUserLogin("user")).isEmpty();
        assertThat(userRepository.findOneByLogin("user")).isEmpty();
    }

    /** A keyless server (develop, CI) must still be able to delete an account that has a row. */
    @Test
    @Transactional
    @WithMockUser(username = "user")
    void deletionWorksWithBillingOffAndNoStripeCall() throws Exception {
        User user = userRepository.findOneByLogin("user").orElseThrow();
        Subscription sub = new Subscription();
        sub.setUser(user);
        sub.setStripeCustomerId("cus_del_2");
        subscriptionRepository.saveAndFlush(sub);
        when(stripeGateway.isEnabled()).thenReturn(false);

        mockMvc.perform(delete("/api/account")).andExpect(status().isNoContent());

        verify(stripeGateway, never()).cancelSubscription(any());
        assertThat(subscriptionRepository.findOneByUserLogin("user")).isEmpty();
        assertThat(userRepository.findOneByLogin("user")).isEmpty();
    }
}
