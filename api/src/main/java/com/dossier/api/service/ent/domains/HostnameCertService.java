package com.dossier.api.service.ent.domains;

import com.dossier.api.domain.ent.HostNames;
import com.dossier.api.domain.ent.OrgHostname;
import com.dossier.api.domain.enumeration.HostnameCertState;
import com.dossier.api.domain.enumeration.OrgHostnameKind;
import com.dossier.api.domain.enumeration.OrgHostnameStatus;
import com.dossier.api.repository.ent.OrgHostnameRepository;
import com.dossier.api.service.org.OrgAuditService;
import java.time.Duration;
import java.time.Instant;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The certificate of a custom domain (docs/enterprise-v2/10-domain-routing.md s5.4; CUSTOM-DOMAINS-BUILD.md A4b):
 * <ol>
 *   <li>The edge asks whether it may issue one ({@link #recordAsk}). For a live custom domain the answer is yes, and its {@code cert_state} goes
 *       NONE / FAILED → REQUESTED with {@code last_ask_at}.</li>
 *   <li>The probe job tries HTTPS ({@link #probe}). An answer makes it ISSUED ({@code cert_issued_at}). No answer 30 minutes after the ask makes it
 *       FAILED with {@code CERT_FAILED:{hint}}, and a later success still flips it to ISSUED.</li>
 * </ol>
 * Only an ISSUED custom domain can become the organization's main address, and only then do mail links use it ({@code TenantUrls}).
 */
@Service
@Transactional
public class HostnameCertService {

    static final Duration GIVE_UP_AFTER = Duration.ofMinutes(30);

    private final OrgHostnameRepository hostnames;
    private final HostnameProbe probe;
    private final OrgAuditService audit;

    public HostnameCertService(OrgHostnameRepository hostnames, HostnameProbe probe, OrgAuditService audit) {
        this.hostnames = hostnames;
        this.probe = probe;
        this.audit = audit;
    }

    /** The edge asked (and was allowed) to issue a certificate for {@code rawHost}. Never throws: the ask must answer whatever happens here. */
    public void recordAsk(String rawHost, Instant now) {
        try {
            String host = HostNames.normalise(rawHost);
            if (host == null) return;
            hostnames.findActiveByHostname(host).ifPresent(h -> {
                h.setLastAskAt(now);
                if (h.getKind() == OrgHostnameKind.CUSTOM && (h.getCertState() == null || h.getCertState() == HostnameCertState.NONE || h.getCertState() == HostnameCertState.FAILED)) {
                    h.setCertState(HostnameCertState.REQUESTED);
                }
                hostnames.saveAndFlush(h);
            });
        } catch (RuntimeException ignored) {
            // the certificate gate answers from the resolver; recording is a bonus
        }
    }

    /** One probe of a live custom domain. Returns its certificate state afterwards (null when the row is gone or not live). */
    public String probe(Long orgId, Long id, Instant now) {
        OrgHostname h = hostnames.findByOrgIdAndId(orgId, id).orElse(null);
        if (h == null || h.getKind() != OrgHostnameKind.CUSTOM || h.getStatus() != OrgHostnameStatus.ACTIVE) return null;
        HostnameProbe.Result r = probe.probe(h.getHostname());
        h.setCertCheckedAt(now);
        if (r.live()) {
            boolean first = h.getCertState() != HostnameCertState.ISSUED;
            h.setCertState(HostnameCertState.ISSUED);
            if (h.getCertIssuedAt() == null) h.setCertIssuedAt(now);
            hostnames.saveAndFlush(h);
            if (first) audit.record(orgId, OrgAuditService.SYSTEM_ACTOR, null, OrgAuditService.DOMAIN_CERT_ISSUED, OrgAuditService.TARGET_HOSTNAME, null, String.valueOf(h.getId()), "certificate live for " + h.getHostname(), null);
            return h.getCertState().name();
        }
        Instant asked = h.getLastAskAt() != null ? h.getLastAskAt() : h.getActivatedAt();
        if (h.getCertState() == HostnameCertState.REQUESTED && asked != null && !asked.plus(GIVE_UP_AFTER).isAfter(now)) {
            h.setCertState(HostnameCertState.FAILED);
            h.setLastCheckResult(("CERT_FAILED:" + ("TLS".equals(r.error()) ? "TLS" : "UNREACHABLE")));
        }
        hostnames.saveAndFlush(h);
        return h.getCertState().name();
    }
}
