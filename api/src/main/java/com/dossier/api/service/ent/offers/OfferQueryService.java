package com.dossier.api.service.ent.offers;

import com.dossier.api.domain.ent.consultantws.CwsOffer;
import com.dossier.api.domain.ent.consultantws.CwsOfferEvent;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.ent.talent.TalentPlacement;
import com.dossier.api.service.ent.applications.ApplicationNames;
import com.dossier.api.service.org.OrgException;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import jakarta.persistence.EntityManager;
import jakarta.persistence.TypedQuery;
import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Reads for the Accounts workspace Offers page. Everything starts from {@code o.orgId = :orgId}; a caller without {@code offers.manage}, a foreign
 * tenant and a missing id are the same generic 404. The tabs and tiles come from the offer table itself (the same rows the consultant's Offers page reads).
 */
@Service("entOfferQueryService")
@Transactional(readOnly = true)
public class OfferQueryService {

    public static final Set<String> TABS = Set.of("all", "draft", "open", "accepted", "closed");
    static final int MAX_SIZE = 100;
    static final int DEFAULT_SIZE = 10;
    static final int CLOSING_SOON_DAYS = 3;
    private static final Set<String> SORTS = Set.of("recent", "deadline", "start", "consultant", "client");

    private static final String FROM = " from CwsOffer o, ConsultantProfile c where o.orgId = :orgId and c.orgId = :orgId and c.id = o.consultantId";
    private static final String OPEN = "o.status in ('PENDING_REVIEW','NEGOTIATION')";
    private static final String LIVE_OPEN = "(" + OPEN + " and (o.offerDeadline is null or o.offerDeadline >= :today))";
    private static final String CLOSED =
        "(o.status in ('DECLINED','WITHDRAWN','EXPIRED') or (" + OPEN + " and o.offerDeadline is not null and o.offerDeadline < :today))";

    private final EntityManager em;
    private final OfferAccess access;
    private final ApplicationNames names;
    private final Clock clock;

    @Autowired
    public OfferQueryService(EntityManager em, OfferAccess access, ApplicationNames names) {
        this(em, access, names, Clock.systemUTC());
    }

    OfferQueryService(EntityManager em, OfferAccess access, ApplicationNames names, Clock clock) {
        this.em = em;
        this.access = access;
        this.names = names;
        this.clock = clock;
    }

    private LocalDate today() {
        return LocalDate.now(clock.withZone(ZoneOffset.UTC));
    }

    public record ListQuery(String tab, String q, Long clientId, Long consultantId, String sort, Integer page, Integer size) {}

    public OfferDTO.Page list(OrgMembership me, ListQuery f) {
        access.requireRead(me);
        String tab = f.tab() == null || f.tab().isBlank() ? "open" : f.tab().strip().toLowerCase(Locale.ROOT);
        if (!TABS.contains(tab)) throw OrgException.invalid("tab", "must be all, draft, open, accepted or closed");
        String sort = f.sort() == null || f.sort().isBlank() ? "recent" : f.sort().strip().toLowerCase(Locale.ROOT);
        if (!SORTS.contains(sort)) throw OrgException.coded(400, "SORT_INVALID", "sort must be recent, deadline, start, consultant or client", Map.of());
        int page = f.page() == null ? 0 : f.page();
        int size = f.size() == null ? DEFAULT_SIZE : f.size();
        if (page < 0) throw OrgException.invalid("page", "must be 0 or more");
        if (size < 1 || size > MAX_SIZE) throw OrgException.invalid("size", "must be between 1 and " + MAX_SIZE);
        String q = f.q() == null ? "" : f.q().strip().toLowerCase(Locale.ROOT).replace("%", "").replace("_", "");
        if (!q.isEmpty() && (q.length() < 2 || q.length() > 80)) throw OrgException.invalid("q", "must be 2 to 80 characters");

        StringBuilder where = new StringBuilder();
        where.append(switch (tab) {
            case "draft" -> " and o.status = 'DRAFT'";
            case "open" -> " and " + LIVE_OPEN;
            case "accepted" -> " and o.status = 'ACCEPTED'";
            case "closed" -> " and " + CLOSED;
            default -> "";
        });
        if (f.clientId() != null) where.append(" and o.clientId = :clientId");
        if (f.consultantId() != null) where.append(" and o.consultantId = :consultantId");
        if (!q.isEmpty()) where.append(" and (lower(c.displayName) like :q or lower(o.clientName) like :q or lower(o.roleTitle) like :q)");
        String order = switch (sort) {
            case "deadline" -> " order by case when o.offerDeadline is null then 1 else 0 end, o.offerDeadline asc, o.id desc";
            case "start" -> " order by case when o.startDate is null then 1 else 0 end, o.startDate asc, o.id desc";
            case "consultant" -> " order by c.displayName asc, o.id desc";
            case "client" -> " order by o.clientName asc, o.id desc";
            default -> " order by o.createdAt desc, o.id desc";
        };
        LocalDate today = today();
        long total = ((Number) bind(em.createQuery("select count(o)" + FROM + where, Long.class), me, f, q, today).getSingleResult()).longValue();
        @SuppressWarnings("unchecked")
        List<Object[]> rows = bind(em.createQuery("select o, c" + FROM + where + order, Object[].class), me, f, q, today).setFirstResult(page * size).setMaxResults(size).getResultList();
        List<OfferDTO.Row> items = new ArrayList<>();
        for (Object[] r : rows) items.add(row((CwsOffer) r[0], (ConsultantProfile) r[1], today));
        return new OfferDTO.Page(items, page, size, total, (long) (page + 1) * size < total);
    }

    private <T> TypedQuery<T> bind(TypedQuery<T> query, OrgMembership me, ListQuery f, String q, LocalDate today) {
        query.setParameter("orgId", me.orgId());
        if (query.getParameters().stream().anyMatch(p -> "today".equals(p.getName()))) query.setParameter("today", today);
        if (f.clientId() != null) query.setParameter("clientId", f.clientId());
        if (f.consultantId() != null) query.setParameter("consultantId", f.consultantId());
        if (!q.isEmpty()) query.setParameter("q", "%" + q + "%");
        return query;
    }

    public OfferDTO.Counts counts(OrgMembership me) {
        access.requireRead(me);
        LocalDate today = today();
        long all = count(me, "", today);
        long draft = count(me, " and o.status = 'DRAFT'", today);
        long open = count(me, " and " + LIVE_OPEN, today);
        long accepted = count(me, " and o.status = 'ACCEPTED'", today);
        long closed = count(me, " and " + CLOSED, today);
        long soon = count(me, " and " + LIVE_OPEN + " and o.offerDeadline is not null and o.offerDeadline <= :soon", today);
        long placed = count(me, " and o.placementId is not null", today);
        return new OfferDTO.Counts(all, draft, open, accepted, closed, soon, placed, CLOSING_SOON_DAYS);
    }

    private long count(OrgMembership me, String extra, LocalDate today) {
        TypedQuery<Long> q = em.createQuery("select count(o)" + FROM + extra, Long.class);
        q.setParameter("orgId", me.orgId());
        if (q.getParameters().stream().anyMatch(p -> "today".equals(p.getName()))) q.setParameter("today", today);
        if (q.getParameters().stream().anyMatch(p -> "soon".equals(p.getName()))) q.setParameter("soon", today.plusDays(CLOSING_SOON_DAYS));
        return q.getSingleResult();
    }

    public OfferDTO.Detail detail(OrgMembership me, Long id) {
        access.requireRead(me);
        @SuppressWarnings("unchecked")
        List<Object[]> found = em
            .createQuery("select o, c" + FROM + " and o.id = :id", Object[].class)
            .setParameter("orgId", me.orgId())
            .setParameter("id", id)
            .getResultList();
        if (found.isEmpty()) throw new OrgNotFoundException();
        CwsOffer o = (CwsOffer) found.get(0)[0];
        ConsultantProfile c = (ConsultantProfile) found.get(0)[1];
        LocalDate today = today();
        OfferDTO.Row row = row(o, c, today);

        List<CwsOfferEvent> evs = em
            .createQuery("select e from CwsOfferEvent e where e.orgId = :o and e.offerId = :id order by e.occurredAt desc, e.id desc", CwsOfferEvent.class)
            .setParameter("o", me.orgId())
            .setParameter("id", o.getId())
            .getResultList();
        Set<Long> memberIds = new HashSet<>();
        for (CwsOfferEvent e : evs) if (e.getActorMemberId() != null) memberIds.add(e.getActorMemberId());
        Map<Long, String> who = names.memberNames(me.orgId(), memberIds);
        List<OfferDTO.Event> timeline = new ArrayList<>();
        for (CwsOfferEvent e : evs) {
            String actor = CwsOfferEvent.BY_CONSULTANT.equals(e.getActorKind()) ? c.getDisplayName() : CwsOfferEvent.BY_MEMBER.equals(e.getActorKind()) ? who.getOrDefault(e.getActorMemberId(), "A member") : "System";
            timeline.add(new OfferDTO.Event(e.getId(), e.getKind(), e.getLabel(), e.getActorKind(), actor, e.getDetail(), e.getOccurredAt()));
        }

        OfferDTO.PlacementRef placement = null;
        String placementNote = null;
        if (o.getPlacementId() != null) {
            TalentPlacement p = em
                .createQuery("select p from TalentPlacement p where p.orgId = :o and p.id = :id", TalentPlacement.class)
                .setParameter("o", me.orgId())
                .setParameter("id", o.getPlacementId())
                .getResultStream()
                .findFirst()
                .orElse(null);
            if (p != null) placement = new OfferDTO.PlacementRef(p.getId(), p.getStatus(), p.getStartDate());
        } else if (CwsOffer.ACCEPTED.equals(o.getStatus())) {
            placementNote = o.getClientId() == null ? "Link a client to this offer, then create the placement." : "No placement yet: the consultant may already have one that has not ended.";
        }
        boolean w = access.canWrite(me);
        String state = row.state();
        OfferDTO.Actions actions = new OfferDTO.Actions(w && OfferRules.canEdit(state), w && OfferRules.canExtend(state), w && OfferRules.canWithdraw(state), w && CwsOffer.ACCEPTED.equals(o.getStatus()) && o.getPlacementId() == null);
        return new OfferDTO.Detail(row, o.getBenefitsSummary(), o.getNotes(), o.getResponseNote(), placementNote, placement, timeline, actions);
    }

    /** Candidates for the Record-an-offer dialog: consultants, clients, or that consultant's submissions. Up to 20, narrowed by q. */
    public OfferDTO.Pickers pickers(OrgMembership me, String kind, String q, Long consultantId) {
        access.requireRead(me);
        String k = kind == null ? "consultant" : kind.strip().toLowerCase(Locale.ROOT);
        String like = q == null || q.isBlank() ? "%" : "%" + q.strip().toLowerCase(Locale.ROOT).replace("%", "").replace("_", "") + "%";
        List<OfferDTO.PickerItem> items = new ArrayList<>();
        switch (k) {
            case "consultant" -> {
                List<Object[]> rows = em
                    .createQuery("select c.id, c.displayName, c.jobTitle from ConsultantProfile c where c.orgId = :o and lower(c.displayName) like :q order by c.displayName", Object[].class)
                    .setParameter("o", me.orgId())
                    .setParameter("q", like)
                    .setMaxResults(20)
                    .getResultList();
                for (Object[] r : rows) items.add(new OfferDTO.PickerItem((Long) r[0], (String) r[1], (String) r[2]));
            }
            case "client" -> {
                List<Object[]> rows = em
                    .createQuery("select a.id, a.name, a.industry from ClientAccount a where a.orgId = :o and lower(a.name) like :q order by a.name", Object[].class)
                    .setParameter("o", me.orgId())
                    .setParameter("q", like)
                    .setMaxResults(20)
                    .getResultList();
                for (Object[] r : rows) items.add(new OfferDTO.PickerItem((Long) r[0], (String) r[1], (String) r[2]));
            }
            case "submission" -> {
                if (consultantId == null) throw OrgException.invalid("consultantId", "is required");
                List<Object[]> rows = em
                    .createQuery(
                        "select s.id, s.code, r.title, a.name from MktSubmission s, ClientRequirement r, ClientAccount a where s.orgId = :o and s.consultantId = :c and r.orgId = :o and r.id = s.requirementId " +
                        "and a.orgId = :o and a.id = s.clientId and s.archivedAt is null order by s.createdAt desc",
                        Object[].class
                    )
                    .setParameter("o", me.orgId())
                    .setParameter("c", consultantId)
                    .setMaxResults(20)
                    .getResultList();
                for (Object[] r : rows) items.add(new OfferDTO.PickerItem((Long) r[0], r[1] + " - " + r[2], (String) r[3]));
            }
            default -> throw OrgException.invalid("kind", "must be consultant, client or submission");
        }
        return new OfferDTO.Pickers(k, items);
    }

    private OfferDTO.Row row(CwsOffer o, ConsultantProfile c, LocalDate today) {
        String state = OfferRules.state(o.getStatus(), o.getOfferDeadline(), today);
        Long daysLeft = OfferRules.isOpen(state) && o.getOfferDeadline() != null ? ChronoUnit.DAYS.between(today, o.getOfferDeadline()) : null;
        String name = c.getDisplayName();
        return new OfferDTO.Row(
            o.getId(), new OfferDTO.Person(c.getId(), name, ApplicationNames.initials(name)), o.getClientId(), o.getClientName(), o.getRoleTitle(), state, OfferRules.label(state), o.getPlacementType(),
            o.getRateMinor(), o.getRatePeriod(), o.getCurrency(), o.getBaseSalaryMinor(), o.getTotalCompMinor(), o.getWorkMode(), o.getStartDate(), o.getEndDate(), o.getTermMonths(), o.getOfferDeadline(), daysLeft,
            o.getPlacementId(), o.getCreatedAt(), o.getExtendedAt(), o.getRespondedAt(), o.isSampleData()
        );
    }
}
