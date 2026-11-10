package com.dossier.api.repository.ent.resumes;

import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.ent.talent.OrgResume;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import jakarta.persistence.TypedQuery;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import org.springframework.stereotype.Repository;

/**
 * The Resumes board's one read model: {@code org_resume} joined to {@code consultant_profile}, filtered, sorted and paged in the database. Every
 * query starts with {@code r.orgId = :orgId} (and the consultant is joined on the same org), and the caller's reach ({@link Scope}) is part of the
 * WHERE clause, so a row outside it can never be loaded, counted or listed.
 */
@Repository
public class ResumeBoardSearchRepository {

    /**
     * Which resumes the caller reaches: every one (ORG scope), or those of consultants whose marketer or backup is in {@code marketerIds}
     * (or who are one of those seats themselves).
     */
    public record Scope(boolean all, Collection<Long> marketerIds) {
        public static Scope everything() {
            return new Scope(true, List.of());
        }

        public static Scope of(Collection<Long> ids) {
            return new Scope(false, ids == null ? List.of() : ids);
        }
    }

    /** The board's filters; a null field is "no filter". */
    public record Filter(
        boolean pendingOnly,
        String q,
        Long departmentId,
        String visibility,
        String approval,
        Boolean primary,
        Long ownerId,
        Long consultantId,
        Instant updatedSince
    ) {
        public static Filter none() {
            return new Filter(false, null, null, null, null, null, null, null, null);
        }
    }

    public record Hit(OrgResume resume, ConsultantProfile consultant) {}

    public record PageResult(List<Hit> hits, long total) {}

    /** The sort keys the board accepts (the order-by expression of each). */
    public static final Map<String, String> SORTS = Map.of(
        "consultant", "lower(c.displayName)",
        "name", "lower(r.name)",
        "role", "lower(r.targetRole)",
        "version", "r.versionNo",
        "modified", "r.updatedAt",
        "created", "r.createdAt",
        "status", "r.approvalStatus",
        "size", "r.fileSizeKb"
    );

    @PersistenceContext
    private EntityManager em;

    private static final String FROM = " from OrgResume r, ConsultantProfile c where r.orgId = :orgId and c.orgId = r.orgId and c.id = r.consultantId";

    private static final String SCOPE_OF_CONSULTANT =
        " and (c.memberId in :mids or exists (select 1 from MarketerAssignment a where a.orgId = c.orgId and a.consultantId = c.id" +
        " and (a.marketerMemberId in :mids or a.backupMemberId in :mids)))";

    private static String like(String raw) {
        return "%" + raw.trim().toLowerCase(Locale.ROOT).replaceAll("[%_\\\\]", " ") + "%";
    }

    /** The scope predicate; appended to a query whose resume alias is {@code r} and consultant alias is {@code c}. */
    private static void scope(StringBuilder jpql, Map<String, Object> p, Scope scope) {
        if (scope.all()) return;
        if (scope.marketerIds().isEmpty()) {
            jpql.append(" and 1 = 0");
            return;
        }
        jpql.append(SCOPE_OF_CONSULTANT);
        p.put("mids", scope.marketerIds());
    }

    private static String where(Filter f, Scope scope, Map<String, Object> p) {
        StringBuilder w = new StringBuilder(FROM);
        scope(w, p, scope);
        if (f.pendingOnly()) w.append(" and r.approvalStatus = 'PENDING'");
        if (f.q() != null && !f.q().isBlank()) {
            w.append(" and (lower(r.name) like :q or lower(r.fileName) like :q or lower(r.targetRole) like :q or lower(r.headline) like :q or lower(c.displayName) like :q")
                .append(" or lower(c.email) like :q or exists (select 1 from ConsultantSkill s where s.orgId = r.orgId and s.consultantId = r.consultantId and lower(s.skill) like :q))");
            p.put("q", like(f.q()));
        }
        if (f.departmentId() != null) {
            w.append(" and c.departmentGroupId = :dept");
            p.put("dept", f.departmentId());
        }
        if (f.visibility() != null) {
            w.append(" and r.visibility = :vis");
            p.put("vis", f.visibility());
        }
        if (f.approval() != null) {
            w.append(" and r.approvalStatus = :appr");
            p.put("appr", f.approval());
        }
        if (f.primary() != null) w.append(f.primary() ? " and r.primaryForOrg = true" : " and r.primaryForOrg = false");
        if (f.ownerId() != null) {
            w.append(" and r.ownerMemberId = :owner");
            p.put("owner", f.ownerId());
        }
        if (f.consultantId() != null) {
            w.append(" and r.consultantId = :cons");
            p.put("cons", f.consultantId());
        }
        if (f.updatedSince() != null) {
            w.append(" and r.updatedAt >= :since");
            p.put("since", f.updatedSince());
        }
        return w.toString();
    }

    private static void bind(TypedQuery<?> q, Long orgId, Map<String, Object> p) {
        q.setParameter("orgId", orgId);
        for (Map.Entry<String, Object> e : p.entrySet()) q.setParameter(e.getKey(), e.getValue());
    }

    public PageResult search(Long orgId, Filter f, Scope scope, String sortKey, boolean asc, int page, int size) {
        String order = SORTS.get(sortKey);
        if (order == null) throw new IllegalArgumentException("sort");
        Map<String, Object> p = new HashMap<>();
        String where = where(f, scope, p);
        TypedQuery<Long> count = em.createQuery("select count(r)" + where, Long.class);
        bind(count, orgId, p);
        long total = count.getSingleResult();
        TypedQuery<Object[]> list = em.createQuery("select r, c" + where + " order by " + order + (asc ? " asc" : " desc") + ", r.id desc", Object[].class);
        bind(list, orgId, p);
        list.setFirstResult(page * size);
        list.setMaxResults(size);
        List<Hit> hits = new ArrayList<>();
        for (Object[] row : list.getResultList()) hits.add(new Hit((OrgResume) row[0], (ConsultantProfile) row[1]));
        return new PageResult(hits, total);
    }

    /** One resume inside the caller's reach; empty for a missing id, another organization's id and a row out of scope alike. */
    public Optional<Hit> findOne(Long orgId, Long resumeId, Scope scope) {
        List<Hit> hits = findMany(orgId, List.of(resumeId), scope);
        return hits.isEmpty() ? Optional.empty() : Optional.of(hits.get(0));
    }

    /** Several resumes inside the caller's reach, by id. */
    public List<Hit> findMany(Long orgId, Collection<Long> ids, Scope scope) {
        if (ids.isEmpty()) return List.of();
        Map<String, Object> p = new HashMap<>();
        StringBuilder w = new StringBuilder(FROM).append(" and r.id in :rids");
        p.put("rids", ids);
        scope(w, p, scope);
        TypedQuery<Object[]> q = em.createQuery("select r, c" + w, Object[].class);
        bind(q, orgId, p);
        List<Hit> hits = new ArrayList<>();
        for (Object[] row : q.getResultList()) hits.add(new Hit((OrgResume) row[0], (ConsultantProfile) row[1]));
        return hits;
    }

    /** The timestamps and flags of every resume in scope, for the KPI tiles: {createdAt, updatedAt, approvalStatus, approvedAt, primaryForOrg}. */
    public List<Object[]> tileFacts(Long orgId, Scope scope) {
        Map<String, Object> p = new HashMap<>();
        StringBuilder w = new StringBuilder(FROM);
        scope(w, p, scope);
        TypedQuery<Object[]> q = em.createQuery("select r.createdAt, r.updatedAt, r.approvalStatus, r.approvedAt, r.primaryForOrg" + w, Object[].class);
        bind(q, orgId, p);
        return q.getResultList();
    }

    /** The consultant, when it exists in this organization and is inside the caller's reach. */
    public Optional<ConsultantProfile> consultantInScope(Long orgId, Long consultantId, Scope scope) {
        Map<String, Object> p = new HashMap<>();
        StringBuilder w = new StringBuilder(" from ConsultantProfile c where c.orgId = :orgId and c.id = :cid");
        p.put("cid", consultantId);
        if (!scope.all()) {
            if (scope.marketerIds().isEmpty()) return Optional.empty();
            w.append(SCOPE_OF_CONSULTANT);
            p.put("mids", scope.marketerIds());
        }
        TypedQuery<ConsultantProfile> q = em.createQuery("select c" + w, ConsultantProfile.class);
        bind(q, orgId, p);
        q.setMaxResults(1);
        List<ConsultantProfile> rows = q.getResultList();
        return rows.isEmpty() ? Optional.empty() : Optional.of(rows.get(0));
    }

    /** The active consultants a caller may add a resume for, name order, matching an optional search; at most {@code limit}. */
    public List<ConsultantProfile> consultantsInScope(Long orgId, Scope scope, String q, int limit) {
        Map<String, Object> p = new HashMap<>();
        StringBuilder w = new StringBuilder(" from ConsultantProfile c where c.orgId = :orgId and c.status = 'ACTIVE'");
        if (!scope.all()) {
            if (scope.marketerIds().isEmpty()) return List.of();
            w.append(SCOPE_OF_CONSULTANT);
            p.put("mids", scope.marketerIds());
        }
        if (q != null && !q.isBlank()) {
            w.append(" and (lower(c.displayName) like :q or lower(c.email) like :q)");
            p.put("q", like(q));
        }
        TypedQuery<ConsultantProfile> query = em.createQuery("select c" + w + " order by lower(c.displayName), c.id", ConsultantProfile.class);
        bind(query, orgId, p);
        query.setMaxResults(limit);
        return query.getResultList();
    }

    /** Departments (id, name) that hold at least one in-scope consultant with a resume. */
    public List<Object[]> departmentsInScope(Long orgId, Scope scope) {
        Map<String, Object> p = new HashMap<>();
        StringBuilder w = new StringBuilder(" from OrgResume r, ConsultantProfile c, OrgGroup g where r.orgId = :orgId and c.orgId = r.orgId and c.id = r.consultantId")
            .append(" and g.orgId = c.orgId and g.id = c.departmentGroupId");
        scope(w, p, scope);
        TypedQuery<Object[]> q = em.createQuery("select distinct g.id, g.name" + w + " order by g.name", Object[].class);
        bind(q, orgId, p);
        return q.getResultList();
    }

    /** Distinct owner seat ids of the in-scope resumes. */
    public List<Long> ownersInScope(Long orgId, Scope scope) {
        Map<String, Object> p = new HashMap<>();
        StringBuilder w = new StringBuilder(FROM).append(" and r.ownerMemberId is not null");
        scope(w, p, scope);
        TypedQuery<Long> q = em.createQuery("select distinct r.ownerMemberId" + w, Long.class);
        bind(q, orgId, p);
        return q.getResultList();
    }
}
