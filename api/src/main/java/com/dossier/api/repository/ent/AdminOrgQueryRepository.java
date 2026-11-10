package com.dossier.api.repository.ent;

import com.dossier.api.domain.enumeration.OrgHostnameStatus;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.domain.enumeration.OrgType;
import com.dossier.api.domain.org.OrgAuditEvent;
import com.dossier.api.domain.org.Organization;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import jakarta.persistence.TypedQuery;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.springframework.stereotype.Repository;

/**
 * The platform admin's cross-organization reads (X1.11): the Organizations list and its counts. This is the ONE place that
 * deliberately looks across tenants, so it is not a Spring Data interface (the tenant contract tests scan those) and it is only
 * ever called from {@code AdminOrgService}, behind {@code ROLE_ADMIN}. It returns counts and organization columns, never a
 * member row.
 */
@Repository
public class AdminOrgQueryRepository {

    @PersistenceContext
    private EntityManager em;

    /** The list filters; null / blank means "not filtered". */
    public record Filter(String search, OrgStatus status, OrgType type) {}

    public List<Organization> find(Filter f) {
        StringBuilder jpql = new StringBuilder("select o from Organization o where 1 = 1");
        List<Object[]> params = new ArrayList<>();
        where(jpql, params, f);
        jpql.append(" order by o.createdAt desc, o.id desc");
        TypedQuery<Organization> q = em.createQuery(jpql.toString(), Organization.class);
        for (Object[] p : params) q.setParameter((String) p[0], p[1]);
        return q.getResultList();
    }

    private static void where(StringBuilder jpql, List<Object[]> params, Filter f) {
        if (f == null) return;
        if (f.search() != null && !f.search().isBlank()) {
            jpql.append(" and (lower(o.name) like :q escape '!' or lower(o.slug) like :q escape '!' or lower(o.subdomain) like :q escape '!')");
            params.add(new Object[] { "q", "%" + escapeLike(f.search().strip().toLowerCase(Locale.ROOT)) + "%" });
        }
        if (f.status() != null) {
            jpql.append(" and o.status = :status");
            params.add(new Object[] { "status", f.status() });
        }
        if (f.type() != null) {
            jpql.append(" and o.type = :type");
            params.add(new Object[] { "type", f.type() });
        }
    }

    /** Active seats per organization, for the given organizations (a count, never the people). */
    public Map<Long, Long> activeMemberCounts(List<Long> orgIds) {
        return counts("select m.orgId, count(m) from OrgMember m where m.orgId in :ids and m.status = :s group by m.orgId", orgIds, OrgMemberStatus.ACTIVE);
    }

    public Map<Long, Long> activeHostnameCounts(List<Long> orgIds) {
        return counts("select h.orgId, count(h) from OrgHostname h where h.orgId in :ids and h.status = :s group by h.orgId", orgIds, OrgHostnameStatus.ACTIVE);
    }

    public long countActiveHostnames() {
        return em.createQuery("select count(h) from OrgHostname h where h.status = :s", Long.class).setParameter("s", OrgHostnameStatus.ACTIVE).getSingleResult();
    }

    public long countOrganizations() {
        return em.createQuery("select count(o) from Organization o", Long.class).getSingleResult();
    }

    /** Organizations that can still be served but have no hostname yet: not CLOSED, no subdomain switched on. */
    public long countAwaitingHostname() {
        return em
            .createQuery("select count(o) from Organization o where o.status <> :closed and (o.subdomain is null or o.subdomainEnabled = false)", Long.class)
            .setParameter("closed", OrgStatus.CLOSED)
            .getSingleResult();
    }

    public List<Long> allIds() {
        return em.createQuery("select o.id from Organization o", Long.class).getResultList();
    }

    public long countPendingInvites(Long orgId) {
        return countSeats(orgId, OrgMemberStatus.INVITED);
    }

    public long countActiveMembers(Long orgId) {
        return countSeats(orgId, OrgMemberStatus.ACTIVE);
    }

    private long countSeats(Long orgId, OrgMemberStatus status) {
        return em
            .createQuery("select count(m) from OrgMember m where m.orgId = :orgId and m.status = :s", Long.class)
            .setParameter("orgId", orgId)
            .setParameter("s", status)
            .getSingleResult();
    }

    /** The user id of the organization's active OWNER seat, or null. */
    public Long activeOwnerUserId(Long orgId) {
        List<Long> ids = em
            .createQuery("select m.userId from OrgMember m where m.orgId = :orgId and m.role = :r and m.status = :s and m.userId is not null order by m.id", Long.class)
            .setParameter("orgId", orgId)
            .setParameter("r", com.dossier.api.domain.enumeration.OrgRole.OWNER)
            .setParameter("s", OrgMemberStatus.ACTIVE)
            .setMaxResults(1)
            .getResultList();
        return ids.isEmpty() ? null : ids.get(0);
    }

    /** The newest platform-admin rows of the organization's own trail (ADMIN_*, creation, subdomain), newest first. */
    public List<OrgAuditEvent> adminAuditTail(Long orgId, int limit) {
        return em
            .createQuery(
                "select e from OrgAuditEvent e where e.orgId = :orgId and (e.action like 'ADMIN!_%' escape '!' or e.action in ('ORG_CREATE', 'ORG_SUBDOMAIN_SET')) order by e.createdAt desc, e.id desc",
                OrgAuditEvent.class
            )
            .setParameter("orgId", orgId)
            .setMaxResults(Math.max(1, Math.min(limit, 100)))
            .getResultList();
    }

    private Map<Long, Long> counts(String jpql, List<Long> ids, Object status) {
        Map<Long, Long> out = new HashMap<>();
        if (ids.isEmpty()) return out;
        List<Object[]> rows = em.createQuery(jpql, Object[].class).setParameter("ids", ids).setParameter("s", status).getResultList();
        for (Object[] r : rows) out.put((Long) r[0], (Long) r[1]);
        return out;
    }

    static String escapeLike(String s) {
        return s.replace("!", "!!").replace("%", "!%").replace("_", "!_");
    }
}
