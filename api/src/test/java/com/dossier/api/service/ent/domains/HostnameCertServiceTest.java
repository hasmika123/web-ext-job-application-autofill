package com.dossier.api.service.ent.domains;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.ent.OrgHostname;
import com.dossier.api.domain.enumeration.HostnameCertState;
import com.dossier.api.domain.enumeration.OrgHostnameKind;
import com.dossier.api.domain.enumeration.OrgHostnameStatus;
import com.dossier.api.repository.ent.OrgHostnameRepository;
import com.dossier.api.service.org.OrgAuditService;
import java.time.Duration;
import java.time.Instant;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** CUSTOM-DOMAINS-BUILD.md (A4b): a custom domain's certificate goes NONE → REQUESTED (the edge asked) → ISSUED (HTTPS answers) or FAILED after 30 minutes. */
class HostnameCertServiceTest {

    static final Long ORG = 7L;
    static final Instant ASKED = Instant.parse("2026-11-14T10:00:00Z");

    OrgHostnameRepository hostnames = mock(OrgHostnameRepository.class);
    HostnameProbe probe = mock(HostnameProbe.class);
    OrgAuditService audit = mock(OrgAuditService.class);
    HostnameCertService certs = new HostnameCertService(hostnames, probe, audit);
    OrgHostname h = new OrgHostname();

    @BeforeEach
    void ready() {
        h.setId(5L);
        h.setOrgId(ORG);
        h.setHostname("careers.acme.com");
        h.setKind(OrgHostnameKind.CUSTOM);
        h.setStatus(OrgHostnameStatus.ACTIVE);
        h.setCertState(HostnameCertState.NONE);
        when(hostnames.findActiveByHostname("careers.acme.com")).thenReturn(Optional.of(h));
        when(hostnames.findByOrgIdAndId(ORG, 5L)).thenReturn(Optional.of(h));
        when(hostnames.saveAndFlush(any())).thenAnswer(inv -> inv.getArgument(0));
    }

    @Test
    void theEdgesAskMakesTheCertificateRequested() {
        certs.recordAsk("Careers.Acme.com", ASKED);
        assertThat(h.getCertState()).isEqualTo(HostnameCertState.REQUESTED);
        assertThat(h.getLastAskAt()).isEqualTo(ASKED);
    }

    @Test
    void aLiveHttpsAnswerIsIssuedOnceAndAuditedOnce() {
        certs.recordAsk("careers.acme.com", ASKED);
        when(probe.probe("careers.acme.com")).thenReturn(new HostnameProbe.Result(true, 200, null));
        assertThat(certs.probe(ORG, 5L, ASKED.plusSeconds(60))).isEqualTo("ISSUED");
        assertThat(h.getCertIssuedAt()).isEqualTo(ASKED.plusSeconds(60));
        certs.probe(ORG, 5L, ASKED.plusSeconds(600));
        verify(audit, times(1)).record(eq(ORG), anyString(), isNull(), eq(OrgAuditService.DOMAIN_CERT_ISSUED), anyString(), isNull(), eq("5"), anyString(), isNull());
    }

    @Test
    void noAnswerStaysRequestedFor30MinutesThenFailsAndALaterAnswerStillIssuesIt() {
        certs.recordAsk("careers.acme.com", ASKED);
        when(probe.probe("careers.acme.com")).thenReturn(new HostnameProbe.Result(false, null, "UNREACHABLE"));
        assertThat(certs.probe(ORG, 5L, ASKED.plus(Duration.ofMinutes(10)))).isEqualTo("REQUESTED");
        assertThat(certs.probe(ORG, 5L, ASKED.plus(Duration.ofMinutes(31)))).isEqualTo("FAILED");
        assertThat(h.getLastCheckResult()).isEqualTo("CERT_FAILED:UNREACHABLE");
        when(probe.probe("careers.acme.com")).thenReturn(new HostnameProbe.Result(true, 200, null));
        assertThat(certs.probe(ORG, 5L, ASKED.plus(Duration.ofHours(2)))).isEqualTo("ISSUED");
    }

    @Test
    void aSuspendedDomainIsNotProbedAndASubdomainIsNotTracked() {
        h.setStatus(OrgHostnameStatus.SUSPENDED);
        assertThat(certs.probe(ORG, 5L, ASKED)).isNull();
        h.setStatus(OrgHostnameStatus.ACTIVE);
        h.setKind(OrgHostnameKind.SUBDOMAIN);
        certs.recordAsk("careers.acme.com", ASKED);
        assertThat(h.getCertState()).isEqualTo(HostnameCertState.NONE);
        assertThat(h.getLastAskAt()).isEqualTo(ASKED);
    }
}
