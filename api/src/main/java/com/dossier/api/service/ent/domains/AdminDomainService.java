package com.dossier.api.service.ent.domains;

import com.dossier.api.service.AdminAuditService;
import com.dossier.api.service.org.OrgException;
import com.dossier.api.service.org.OrgNotFoundException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * The platform admin's view of every organization's addresses (docs/enterprise-v2/10-domain-routing.md s7; CUSTOM-DOMAINS-BUILD.md A4b). For each address:
 * its organization, kind, status, certificate state, last DNS check, last ask and when it started failing. Domains that need attention come first:
 * suspended, failing, or a certificate that failed. One action is offered here: <b>Re-check</b> runs the DNS check and the certificate probe now
 * (admin-audited). Suspending and resuming stay on the organization's own admin page. No member data: only hostnames and organization names.
 */
@Service
public class AdminDomainService {

    public static final Set<String> STATUSES = Set.of("PENDING", "VERIFYING", "VERIFIED", "ACTIVE", "SUSPENDED", "REMOVED");
    static final int PAGE_SIZE = 50;

    public record Row(
        Long id,
        Long orgId,
        String orgName,
        String hostname,
        String kind,
        String status,
        boolean primary,
        String certState,
        String lastCheckResult,
        Instant lastCheckAt,
        Instant lastAskAt,
        Instant failingSince,
        boolean attention
    ) {}

    public record Page(List<Row> rows, long total, long attention) {}

    public record Rechecked(Row row, String dns, String certificate) {}

    private final JdbcTemplate jdbc;
    private final OrgDomainService domains;
    private final HostnameCertService certs;
    private final AdminAuditService audit;

    public AdminDomainService(JdbcTemplate jdbc, OrgDomainService domains, HostnameCertService certs, AdminAuditService audit) {
        this.jdbc = jdbc;
        this.domains = domains;
        this.certs = certs;
        this.audit = audit;
    }

    /** {@code status}: one status or null for every non-removed address; {@code q}: part of the hostname or the organization name. */
    public Page list(String status, String q, int page) {
        if (status != null && !status.isBlank() && !STATUSES.contains(status.trim().toUpperCase(Locale.ROOT))) throw OrgException.invalid("status", "is not a hostname status");
        StringBuilder where = new StringBuilder(" from org_hostname h join organization o on o.id = h.org_id where 1 = 1");
        List<Object> args = new ArrayList<>();
        if (status == null || status.isBlank()) where.append(" and h.status <> 'REMOVED'");
        else {
            where.append(" and h.status = ?");
            args.add(status.trim().toUpperCase(Locale.ROOT));
        }
        if (q != null && !q.isBlank()) {
            where.append(" and (h.hostname like ? or lower(o.name) like ?)");
            String like = "%" + q.trim().toLowerCase(Locale.ROOT).replace("%", "").replace("_", "") + "%";
            args.add(like);
            args.add(like);
        }
        String attention = "(h.status = 'SUSPENDED' or h.failing_since is not null or h.cert_state = 'FAILED')";
        long total = jdbc.queryForObject("select count(*)" + where, Long.class, args.toArray());
        long needs = jdbc.queryForObject("select count(*)" + where + " and " + attention, Long.class, args.toArray());
        int p = Math.max(0, page);
        List<Object> pageArgs = new ArrayList<>(args);
        List<Row> rows = jdbc.query(
            "select h.id, h.org_id, o.name org_name, h.hostname, h.kind, h.status, h.is_primary, h.cert_state, h.last_check_result, h.last_check_at, h.last_ask_at, h.failing_since, " +
            "case when " + attention + " then 1 else 0 end attention" + where + " order by attention desc, o.name, h.hostname limit " + PAGE_SIZE + " offset " + (p * PAGE_SIZE),
            (rs, i) -> new Row(
                rs.getLong("id"),
                rs.getLong("org_id"),
                rs.getString("org_name"),
                rs.getString("hostname"),
                rs.getString("kind"),
                rs.getString("status"),
                rs.getBoolean("is_primary"),
                rs.getString("cert_state"),
                rs.getString("last_check_result"),
                instant(rs.getTimestamp("last_check_at")),
                instant(rs.getTimestamp("last_ask_at")),
                instant(rs.getTimestamp("failing_since")),
                rs.getInt("attention") == 1
            ),
            pageArgs.toArray()
        );
        return new Page(rows, total, needs);
    }

    /** Run the DNS check and the certificate probe for one address now. Audit {@code DOMAIN_RECHECK}. */
    public Rechecked recheck(Long id) {
        List<Map<String, Object>> found = jdbc.queryForList("select org_id from org_hostname where id = ?", id);
        if (found.isEmpty()) throw new OrgNotFoundException();
        Long orgId = ((Number) found.get(0).get("org_id")).longValue();
        Instant now = Instant.now();
        String dns = domains.recheck(orgId, id, now);
        String cert = certs.probe(orgId, id, now);
        audit.record(AdminAuditService.DOMAIN_RECHECK, AdminAuditService.TARGET_ORG, String.valueOf(orgId), null, "hostname=" + id + " dns=" + dns + " cert=" + cert);
        Row row = list(null, null, 0).rows().stream().filter(r -> r.id().equals(id)).findFirst().orElse(null);
        return new Rechecked(row, dns, cert);
    }

    private static Instant instant(Timestamp t) {
        return t == null ? null : t.toInstant();
    }
}
