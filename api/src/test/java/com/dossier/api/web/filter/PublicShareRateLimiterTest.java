package com.dossier.api.web.filter;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.dossier.api.service.ResumeBuilderSettingKeys;
import com.dossier.api.service.ResumeBuilderSettings;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;

/** The public share routes' two buckets (R3.11): visitor + token, and visitor + misses. */
class PublicShareRateLimiterTest {

    private static final String TOKEN = "A".repeat(32);

    private PublicShareRateLimiter limiter;

    @BeforeEach
    void setUp() {
        ResumeBuilderSettings settings = mock(ResumeBuilderSettings.class);
        when(settings.getInt(ResumeBuilderSettingKeys.RATE_PUBLIC_PER_MIN)).thenReturn(3);
        limiter = new PublicShareRateLimiter(settings);
    }

    private static MockHttpServletRequest from(String ip) {
        MockHttpServletRequest r = new MockHttpServletRequest();
        r.addHeader("X-Forwarded-For", ip);
        return r;
    }

    @Test
    void allowsTheConfiguredNumberThenAsksToWait() {
        MockHttpServletRequest r = from("203.0.113.1");
        for (int i = 0; i < 3; i++) assertThat(limiter.hit(r, TOKEN)).isZero();
        assertThat(limiter.hit(r, TOKEN)).isPositive();
    }

    @Test
    void anotherVisitorOrAnotherTokenHasItsOwnBudget() {
        MockHttpServletRequest r = from("203.0.113.2");
        for (int i = 0; i < 4; i++) limiter.hit(r, TOKEN);
        assertThat(limiter.hit(from("203.0.113.3"), TOKEN)).isZero();
        assertThat(limiter.hit(r, "B".repeat(32))).isZero();
    }

    @Test
    void missesAcrossDifferentTokensAddUpPerVisitor() {
        MockHttpServletRequest r = from("203.0.113.4");
        for (int i = 0; i < 3; i++) assertThat(limiter.miss(r)).isZero();
        assertThat(limiter.miss(r)).isPositive();
        assertThat(limiter.miss(from("203.0.113.5"))).isZero();
    }

    @Test
    void aTokenOfTheWrongLengthDoesNotMintNewKeys() {
        MockHttpServletRequest r = from("203.0.113.6");
        // every junk token shares one bucket: they cannot be used to dodge the limit
        for (int i = 0; i < 3; i++) assertThat(limiter.hit(r, "junk" + i)).isZero();
        assertThat(limiter.hit(r, "junk99")).isPositive();
    }
}
