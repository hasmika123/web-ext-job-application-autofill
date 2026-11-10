package com.dossier.api.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.service.ent.EnterpriseFeatureFlag;
import com.dossier.api.service.ent.TenantContext;
import com.dossier.api.service.ent.TenantContextHolder;
import com.dossier.api.service.ent.TenantResolver;
import com.dossier.api.service.org.OrgAccessService;
import com.dossier.api.service.org.OrgFeatureFlag;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.web.rest.org.OrgPermissionRequired;
import java.util.Map;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.servlet.HandlerMapping;

/** X1.10: every line a request logs carries tenant, host and member; with enterprise off none of it appears (log capture). */
class TenantLogCaptureTest {

    static class Controller {

        @OrgPermissionRequired
        public void anyMember() {}
    }

    private final Logger logger = (Logger) LoggerFactory.getLogger("test.capture");
    private ListAppender<ILoggingEvent> appender;
    private final TenantResolver resolver = mock(TenantResolver.class);
    private final EnterpriseFeatureFlag flag = mock(EnterpriseFeatureFlag.class);
    private final TenantResolverFilter filter = new TenantResolverFilter(resolver, flag, new TenantHostTrust("", false));

    @BeforeEach
    void setUp() {
        appender = new ListAppender<>();
        appender.start();
        logger.addAppender(appender);
        when(flag.isEnabled()).thenReturn(true);
        when(resolver.resolve(any(), any())).thenReturn(TenantContext.tenant(7L, 9L, "acme.localhost"));
    }

    @AfterEach
    void tearDown() {
        logger.detachAppender(appender);
        TenantContextHolder.clear();
        MDC.clear();
    }

    private void servedRequest() throws Exception {
        OrgAccessService access = mock(OrgAccessService.class);
        OrgFeatureFlag orgFlag = mock(OrgFeatureFlag.class);
        when(orgFlag.isEnabled()).thenReturn(true);
        when(access.requireMember(eq(7L))).thenReturn(new OrgMembership(7L, 12L, 2L, "carol", OrgRole.ADMIN, OrgMemberStatus.ACTIVE, OrgStatus.ACTIVE));
        OrgPermissionInterceptor interceptor = new OrgPermissionInterceptor(access, orgFlag, flag);
        MockHttpServletRequest req = new MockHttpServletRequest("GET", "/api/orgs/7");
        req.setRequestURI("/api/orgs/7");
        req.setAttribute(HandlerMapping.URI_TEMPLATE_VARIABLES_ATTRIBUTE, Map.of("orgId", "7"));
        MockHttpServletResponse res = new MockHttpServletResponse();
        HandlerMethod handler = new HandlerMethod(new Controller(), Controller.class.getMethod("anyMember"));
        filter.doFilter(
            req,
            res,
            (rq, rs) -> {
                logger.info("before handler");
                interceptor.preHandle(req, res, handler);
                logger.info("in handler");
                logger.error("handler failed");
                interceptor.afterCompletion(req, res, handler, null);
            }
        );
    }

    @Test
    void everyLineOfARequestOnTheTenantHostCarriesTenantHostAndMember() throws Exception {
        servedRequest();
        assertThat(appender.list).hasSize(3);
        assertThat(appender.list.get(0).getMDCPropertyMap()).containsEntry("tenant", "7").containsEntry("host", "acme.localhost").doesNotContainKey("member");
        for (ILoggingEvent e : appender.list.subList(1, 3)) {
            assertThat(e.getMDCPropertyMap()).containsEntry("tenant", "7").containsEntry("host", "acme.localhost").containsEntry("member", "12");
            assertThat(new TenantLogConverter().convert(e)).isEqualTo("[tenant=7 host=acme.localhost member=12] ");
        }
    }

    @Test
    void nothingSurvivesTheRequestOnThePooledThread() throws Exception {
        servedRequest();
        logger.info("next request on the same thread");
        ILoggingEvent last = appender.list.get(appender.list.size() - 1);
        assertThat(last.getMDCPropertyMap()).doesNotContainKeys("tenant", "host", "member");
        assertThat(new TenantLogConverter().convert(last)).isEmpty();
    }

    @Test
    void withEnterpriseOffNoTenantKeysAreEverLogged() throws Exception {
        when(flag.isEnabled()).thenReturn(false);
        servedRequest();
        assertThat(appender.list).allSatisfy(e -> assertThat(e.getMDCPropertyMap()).doesNotContainKeys("tenant", "host", "member"));
    }

    @Test
    void theConverterNeutralisesForgedValues() {
        MDC.put("tenant", "7");
        MDC.put("host", "a b\r\nINJECTED");
        logger.info("x");
        assertThat(new TenantLogConverter().convert(appender.list.get(0))).isEqualTo("[tenant=7 host=a_b__INJECTED] ");
    }
}
