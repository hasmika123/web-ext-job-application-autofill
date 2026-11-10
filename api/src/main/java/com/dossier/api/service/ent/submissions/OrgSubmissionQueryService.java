package com.dossier.api.service.ent.submissions;

import com.dossier.api.service.ent.applications.ApplicationNames;
import com.dossier.api.service.org.OrgException;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import jakarta.persistence.EntityManager;
import jakarta.persistence.TypedQuery;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The Accounts workspace Submissions page: the organization's submissions as RECORDS (who, which requirement and client, where it stands). There is no
 * submit control and no write here: the consultant submits and the marketer records the fact (E1), on the Marketing workspace. Reading needs
 * {@code submissions.record}; everything starts from {@code s.orgId = :orgId}; a caller without the key and a foreign tenant get the same generic 404.
 */
@Service("entOrgSubmissionQueryService")
@Transactional(readOnly = true)
public class OrgSubmissionQueryService {

    public static final String KEY = "submissions.record";
    public static final List<String> STATUSES = List.of("DRAFT", "SUBMITTED", "CLIENT_REVIEW", "INTERVIEW_REQUESTED", "REJECTED");
    static final int MAX_SIZE = 100;
    static final int DEFAULT_SIZE = 10;

    public record Person(Long id, String name, String initials) {}

    public record Row(
        Long id,
        String code,
        Person consultant,
        Long clientId,
        String clientName,
        Long requirementId,
        String requirementTitle,
        String status,
        String approvalState,
        Instant submittedOn,
        String preparedBy,
        String note,
        Instant createdAt
    ) {}

    public record Page(List<Row> items, int page, int size, long total, boolean hasNext) {}

    /** Counts per recorded status plus the total and how many are waiting on the consultant's approval. */
    public record Counts(long total, Map<String, Long> byStatus, long awaitingApproval) {}

    private static final String FROM =
        " from MktSubmission s, ConsultantProfile c, ClientAccount a, ClientRequirement r where s.orgId = :orgId and s.archivedAt is null and c.orgId = :orgId and c.id = s.consultantId" +
        " and a.orgId = :orgId and a.id = s.clientId and r.orgId = :orgId and r.id = s.requirementId";

    private final EntityManager em;
    private final ApplicationNames names;

    public OrgSubmissionQueryService(EntityManager em, ApplicationNames names) {
        this.em = em;
        this.names = names;
    }

    private void require(OrgMembership me) {
        if (!me.canKey(KEY)) throw new OrgNotFoundException();
    }

    public Page list(OrgMembership me, String status, String q, Long clientId, Integer pageNo, Integer sizeNo) {
        require(me);
        String st = status == null || status.isBlank() ? "" : status.strip().toUpperCase(Locale.ROOT);
        if (!st.isEmpty() && !STATUSES.contains(st)) throw OrgException.invalid("status", "is not a submission status");
        String text = q == null ? "" : q.strip().toLowerCase(Locale.ROOT).replace("%", "").replace("_", "");
        if (!text.isEmpty() && (text.length() < 2 || text.length() > 80)) throw OrgException.invalid("q", "must be 2 to 80 characters");
        int page = pageNo == null ? 0 : pageNo;
        int size = sizeNo == null ? DEFAULT_SIZE : sizeNo;
        if (page < 0) throw OrgException.invalid("page", "must be 0 or more");
        if (size < 1 || size > MAX_SIZE) throw OrgException.invalid("size", "must be between 1 and " + MAX_SIZE);
        StringBuilder where = new StringBuilder();
        if (!st.isEmpty()) where.append(" and s.status = :status");
        if (clientId != null) where.append(" and s.clientId = :clientId");
        if (!text.isEmpty()) where.append(" and (lower(c.displayName) like :q or lower(a.name) like :q or lower(r.title) like :q or lower(s.code) like :q)");

        TypedQuery<Long> count = em.createQuery("select count(s)" + FROM + where, Long.class);
        bind(count, me, st, clientId, text);
        long total = count.getSingleResult();
        TypedQuery<Object[]> rowsQ = em.createQuery("select s, c, a, r" + FROM + where + " order by s.createdAt desc, s.id desc", Object[].class);
        bind(rowsQ, me, st, clientId, text);
        List<Object[]> rows = rowsQ.setFirstResult(page * size).setMaxResults(size).getResultList();
        Set<Long> memberIds = new HashSet<>();
        for (Object[] r : rows) {
            Long by = ((com.dossier.api.domain.ent.mkt.MktSubmission) r[0]).getPreparedByMemberId();
            if (by != null) memberIds.add(by);
        }
        Map<Long, String> who = names.memberNames(me.orgId(), memberIds);
        List<Row> items = new ArrayList<>();
        for (Object[] r : rows) {
            var s = (com.dossier.api.domain.ent.mkt.MktSubmission) r[0];
            var c = (com.dossier.api.domain.ent.talent.ConsultantProfile) r[1];
            var a = (com.dossier.api.domain.ent.talent.ClientAccount) r[2];
            var req = (com.dossier.api.domain.ent.talent.ClientRequirement) r[3];
            items.add(new Row(
                s.getId(), s.getCode(), new Person(c.getId(), c.getDisplayName(), ApplicationNames.initials(c.getDisplayName())), a.getId(), a.getName(), req.getId(), req.getTitle(),
                s.getStatus(), s.getApprovalState(), s.getSubmittedOn(), s.getPreparedByMemberId() == null ? null : who.getOrDefault(s.getPreparedByMemberId(), "A member"), s.getNote(), s.getCreatedAt()
            ));
        }
        return new Page(items, page, size, total, (long) (page + 1) * size < total);
    }

    private static void bind(TypedQuery<?> q, OrgMembership me, String status, Long clientId, String text) {
        q.setParameter("orgId", me.orgId());
        if (!status.isEmpty()) q.setParameter("status", status);
        if (clientId != null) q.setParameter("clientId", clientId);
        if (!text.isEmpty()) q.setParameter("q", "%" + text + "%");
    }

    public Counts counts(OrgMembership me) {
        require(me);
        List<Object[]> rows = em
            .createQuery("select s.status, count(s)" + FROM + " group by s.status", Object[].class)
            .setParameter("orgId", me.orgId())
            .getResultList();
        Map<String, Long> by = new LinkedHashMap<>();
        for (String s : STATUSES) by.put(s, 0L);
        long total = 0;
        for (Object[] r : rows) {
            by.merge((String) r[0], (Long) r[1], Long::sum);
            total += (Long) r[1];
        }
        long awaiting = em
            .createQuery("select count(s)" + FROM + " and s.approvalState = 'AWAITING_APPROVAL'", Long.class)
            .setParameter("orgId", me.orgId())
            .getSingleResult();
        return new Counts(total, by, awaiting);
    }
}
