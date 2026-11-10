package com.dossier.api.repository.ent;

import com.dossier.api.domain.enumeration.InviteStatus;
import com.dossier.api.domain.org.OrgMember;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import jakarta.persistence.TypedQuery;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import org.springframework.stereotype.Repository;

/**
 * The Invitations page's reads (X1.15): filtered, paged and counted views over the invitation seats of ONE organization.
 * Dynamic JPQL (only the predicates the caller asked for are added, so no parameter is ever a typed null), and every method
 * names the organization first and always adds {@code m.orgId = :orgId}: there is no way to ask across tenants. Not a Spring Data
 * interface on purpose (the filters are optional); the contract tests that scan repository interfaces do not apply, this class's
 * own test does the same job.
 *
 * <p>An invitation seat is an {@code org_member} row with an invite address and a send time. Its {@link InviteStatus} is derived,
 * so the filters below are the SQL form of {@link InviteStatus#of}.
 */
@Repository
public class OrgInvitationQueryRepository {

    private static final String BASE = "from OrgMember m where m.orgId = :orgId and m.inviteEmail is not null and m.inviteSentAt is not null";
    private static final String INVITED = "com.dossier.api.domain.enumeration.OrgMemberStatus.INVITED";
    private static final String REMOVED = "com.dossier.api.domain.enumeration.OrgMemberStatus.REMOVED";

    @PersistenceContext private EntityManager em;

    /** The filters of the page. Null / blank means "not filtered". {@code invitedByMemberId} narrows a narrowed inviter to their own. */
    public record Filter(InviteStatus status, Long roleId, Long departmentGroupId, Instant from, Instant to, String search, Long invitedByMemberId) {
        public static Filter none() {
            return new Filter(null, null, null, null, null, null, null);
        }

        public Filter withStatus(InviteStatus s) {
            return new Filter(s, roleId, departmentGroupId, from, to, search, invitedByMemberId);
        }

        public Filter withRange(Instant f, Instant t) {
            return new Filter(status, roleId, departmentGroupId, f, t, search, invitedByMemberId);
        }
    }

    public List<OrgMember> findPage(Long orgId, Filter f, Instant now, int page, int size, boolean newestFirst) {
        StringBuilder jpql = new StringBuilder("select m ").append(BASE);
        List<Object[]> params = new ArrayList<>();
        where(jpql, params, f, now);
        jpql.append(" order by m.inviteSentAt ").append(newestFirst ? "desc" : "asc").append(", m.id ").append(newestFirst ? "desc" : "asc");
        TypedQuery<OrgMember> q = em.createQuery(jpql.toString(), OrgMember.class);
        q.setParameter("orgId", orgId);
        bind(q, params);
        q.setFirstResult(page * size);
        q.setMaxResults(size);
        return q.getResultList();
    }

    public long count(Long orgId, Filter f, Instant now) {
        StringBuilder jpql = new StringBuilder("select count(m) ").append(BASE);
        List<Object[]> params = new ArrayList<>();
        where(jpql, params, f, now);
        TypedQuery<Long> q = em.createQuery(jpql.toString(), Long.class);
        q.setParameter("orgId", orgId);
        bind(q, params);
        return q.getSingleResult();
    }

    /** The most recent seats whose {@code field} (a timestamp column of the seat) is set, newest first: the activity feed's raw events. */
    public List<OrgMember> recentBy(Long orgId, EventKind kind, int limit) {
        String jpql = switch (kind) {
            case INVITED -> "select m " + BASE + " order by m.inviteSentAt desc, m.id desc";
            case ACCEPTED -> "select m " + BASE + " and m.joinedAt is not null order by m.joinedAt desc, m.id desc";
            case REVOKED -> "select m " + BASE + " and m.inviteEndedReason = 'REVOKED' and m.inviteEndedAt is not null order by m.inviteEndedAt desc, m.id desc";
            case EXPIRED -> "select m " + BASE + " and m.inviteEndedReason = 'EXPIRED' and m.inviteEndedAt is not null order by m.inviteEndedAt desc, m.id desc";
        };
        return em.createQuery(jpql, OrgMember.class).setParameter("orgId", orgId).setMaxResults(Math.max(1, Math.min(limit, 50))).getResultList();
    }

    public enum EventKind {
        INVITED,
        ACCEPTED,
        REVOKED,
        EXPIRED,
    }

    private static void where(StringBuilder jpql, List<Object[]> params, Filter f, Instant now) {
        if (f == null) return;
        if (f.status() != null) {
            if (f.status() == InviteStatus.PENDING || f.status() == InviteStatus.EXPIRED) params.add(new Object[] { "now", now });
            jpql.append(switch (f.status()) {
                case PENDING -> " and m.status = " + INVITED + " and (m.inviteExpiresAt is null or m.inviteExpiresAt >= :now)";
                case ACCEPTED -> " and m.joinedAt is not null";
                case EXPIRED -> " and m.joinedAt is null and ((m.status = " + INVITED + " and m.inviteExpiresAt is not null and m.inviteExpiresAt < :now) or (m.status = " + REMOVED + " and m.inviteEndedReason = 'EXPIRED'))";
                case REVOKED -> " and m.joinedAt is null and m.status = " + REMOVED + " and (m.inviteEndedReason is null or m.inviteEndedReason = 'REVOKED')";
            });
        }
        if (f.roleId() != null) {
            jpql.append(" and exists (select 1 from OrgMemberRole r where r.orgId = m.orgId and r.memberId = m.id and r.roleId = :roleId and r.endsAt is null)");
            params.add(new Object[] { "roleId", f.roleId() });
        }
        if (f.departmentGroupId() != null) {
            jpql.append(" and m.departmentGroupId = :departmentId");
            params.add(new Object[] { "departmentId", f.departmentGroupId() });
        }
        if (f.from() != null) {
            jpql.append(" and m.inviteSentAt >= :from");
            params.add(new Object[] { "from", f.from() });
        }
        if (f.to() != null) {
            jpql.append(" and m.inviteSentAt < :to");
            params.add(new Object[] { "to", f.to() });
        }
        if (f.invitedByMemberId() != null) {
            jpql.append(" and m.invitedByMemberId = :invitedBy");
            params.add(new Object[] { "invitedBy", f.invitedByMemberId() });
        }
        if (f.search() != null && !f.search().isBlank()) {
            jpql.append(" and (lower(m.inviteEmail) like :q escape '!' or lower(coalesce(m.inviteName, '')) like :q escape '!')");
            params.add(new Object[] { "q", "%" + escapeLike(f.search().strip().toLowerCase(Locale.ROOT)) + "%" });
        }
    }

    private static void bind(TypedQuery<?> q, List<Object[]> params) {
        for (Object[] p : params) q.setParameter((String) p[0], p[1]);
    }

    /** Escapes the LIKE wildcards so a search for "100%" or "a_b" is literal (the escape character is {@code !}). */
    static String escapeLike(String s) {
        return s.replace("!", "!!").replace("%", "!%").replace("_", "!_");
    }
}
