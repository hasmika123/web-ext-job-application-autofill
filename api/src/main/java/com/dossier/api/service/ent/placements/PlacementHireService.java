package com.dossier.api.service.ent.placements;

import com.dossier.api.domain.ent.consultantws.CwsOffer;
import com.dossier.api.domain.ent.talent.ClientAccount;
import com.dossier.api.domain.ent.talent.PlacementEvent;
import com.dossier.api.domain.ent.talent.TalentPlacement;
import com.dossier.api.repository.ent.talent.MarketerAssignmentRepository;
import com.dossier.api.repository.ent.talent.PlacementEventRepository;
import com.dossier.api.repository.ent.talent.TalentPlacementRepository;
import com.dossier.api.service.org.OrgAuditService;
import jakarta.persistence.EntityManager;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Hire: an offer the CONSULTANT accepted becomes a placement record (X10.4). It is created PENDING_START when the start day is ahead and ACTIVE when it is
 * today or past; {@link PlacementStartJob} flips PENDING_START to ACTIVE on the day. Nothing is signed, sent or paid here: it records that the person
 * said yes. When the placement cannot be made (no client linked, the consultant already has an open placement) the offer stays accepted and says why,
 * so the Account Manager can fix it and press Create placement. Joins the caller's transaction.
 */
@Service
public class PlacementHireService {

    public static final String AUDIT_HIRE = "PLACEMENT_HIRE";
    public static final String AUDIT_START = "PLACEMENT_START";

    /** What happened: the placement id, or why none was made. */
    public record Outcome(Long placementId, String problem) {
        public boolean created() {
            return placementId != null;
        }
    }

    private final EntityManager em;
    private final TalentPlacementRepository placements;
    private final PlacementEventRepository events;
    private final MarketerAssignmentRepository assignments;
    private final PlacementAvailabilitySync availability;
    private final OrgAuditService audit;
    private final Clock clock;

    @Autowired
    public PlacementHireService(
        EntityManager em,
        TalentPlacementRepository placements,
        PlacementEventRepository events,
        MarketerAssignmentRepository assignments,
        PlacementAvailabilitySync availability,
        OrgAuditService audit
    ) {
        this(em, placements, events, assignments, availability, audit, Clock.systemUTC());
    }

    PlacementHireService(
        EntityManager em,
        TalentPlacementRepository placements,
        PlacementEventRepository events,
        MarketerAssignmentRepository assignments,
        PlacementAvailabilitySync availability,
        OrgAuditService audit,
        Clock clock
    ) {
        this.em = em;
        this.placements = placements;
        this.events = events;
        this.assignments = assignments;
        this.availability = availability;
        this.audit = audit;
        this.clock = clock;
    }

    private LocalDate today() {
        return LocalDate.now(clock.withZone(ZoneOffset.UTC));
    }

    /** Creates the placement for an accepted offer, once. Sets {@code offer.placementId} on success; the caller saves the offer. */
    @Transactional
    public Outcome hire(CwsOffer o) {
        if (o.getPlacementId() != null) return new Outcome(o.getPlacementId(), null);
        Long orgId = o.getOrgId();
        Long clientId = o.getClientId();
        if (clientId == null) clientId = clientByName(orgId, o.getClientName()).map(ClientAccount::getId).orElse(null);
        if (clientId == null) return new Outcome(null, "Link a client to this offer to create the placement.");
        long open = ((Number) em
            .createQuery("select count(p) from TalentPlacement p where p.orgId = :o and p.consultantId = :c and p.status <> 'ENDED'")
            .setParameter("o", orgId)
            .setParameter("c", o.getConsultantId())
            .getSingleResult()).longValue();
        if (open > 0) return new Outcome(null, "This consultant already has a placement that has not ended.");

        LocalDate today = today();
        LocalDate start = o.getStartDate() == null ? today : o.getStartDate();
        LocalDate end = o.getEndDate() != null ? o.getEndDate() : o.getTermMonths() != null ? start.plusMonths(o.getTermMonths()) : null;
        if (end != null && end.isBefore(start)) end = null;
        Instant now = Instant.now(clock);
        Long manager = o.getCreatedByMemberId() != null
            ? o.getCreatedByMemberId()
            : assignments.findByOrgIdAndConsultantId(orgId, o.getConsultantId()).map(a -> a.getMarketerMemberId()).orElse(null);

        TalentPlacement p = new TalentPlacement();
        p.setOrgId(orgId);
        p.setConsultantId(o.getConsultantId());
        p.setClientId(clientId);
        p.setRequirementId(o.getRequirementId());
        p.setRoleTitle(o.getRoleTitle().length() > 120 ? o.getRoleTitle().substring(0, 120) : o.getRoleTitle());
        p.setPlacementType(o.getPlacementType() == null ? "CONTRACT" : o.getPlacementType());
        p.setStatus(start.isAfter(today) ? PlacementRules.STORED_PENDING : PlacementRules.STORED_ACTIVE);
        p.setStartDate(start);
        p.setEndDate(end);
        if (o.getRateMinor() != null) {
            p.setBillRateMinor(o.getRateMinor());
            p.setRateUnit(o.getRatePeriod() == null ? "HOUR" : o.getRatePeriod());
        }
        p.setCurrency(o.getCurrency() == null ? "USD" : o.getCurrency().toUpperCase(Locale.ROOT));
        p.setAccountManagerMemberId(manager);
        p.setOfferId(o.getId());
        p.setCreatedAt(now);
        p.setUpdatedAt(now);
        placements.saveAndFlush(p);
        record(p, "CREATED", "Hired: the consultant accepted the offer", now);
        if (PlacementRules.STORED_ACTIVE.equals(p.getStatus())) availability.onStarted(orgId, p.getConsultantId(), today);
        audit.record(orgId, null, AUDIT_HIRE, "PLACEMENT", null, String.valueOf(p.getId()), "{\"offerId\":" + o.getId() + ",\"status\":\"" + p.getStatus() + "\"}");
        o.setPlacementId(p.getId());
        return new Outcome(p.getId(), null);
    }

    /** The daily job's unit of work: every PENDING_START placement of the org whose start day has come becomes ACTIVE. Returns how many. */
    @Transactional
    public int startDue(Long orgId) {
        LocalDate today = today();
        List<TalentPlacement> due = em
            .createQuery("select p from TalentPlacement p where p.orgId = :o and p.status = 'PENDING_START' and p.startDate <= :today", TalentPlacement.class)
            .setParameter("o", orgId)
            .setParameter("today", today)
            .getResultList();
        Instant now = Instant.now(clock);
        for (TalentPlacement p : due) {
            p.setStatus(PlacementRules.STORED_ACTIVE);
            p.setUpdatedAt(now);
            placements.saveAndFlush(p);
            record(p, "STARTED", "Started on the planned start date", now);
            availability.onStarted(orgId, p.getConsultantId(), today);
            audit.record(orgId, null, AUDIT_START, "PLACEMENT", null, String.valueOf(p.getId()), "{\"startDate\":\"" + p.getStartDate() + "\"}");
        }
        return due.size();
    }

    private Optional<ClientAccount> clientByName(Long orgId, String name) {
        if (name == null || name.isBlank()) return Optional.empty();
        return em
            .createQuery("select c from ClientAccount c where c.orgId = :o and lower(c.name) = :n order by c.id", ClientAccount.class)
            .setParameter("o", orgId)
            .setParameter("n", name.strip().toLowerCase(Locale.ROOT))
            .setMaxResults(1)
            .getResultStream()
            .findFirst();
    }

    private void record(TalentPlacement p, String type, String detail, Instant at) {
        PlacementEvent e = new PlacementEvent();
        e.setOrgId(p.getOrgId());
        e.setPlacementId(p.getId());
        e.setEventType(type);
        e.setActorMemberId(null);
        e.setDetail(detail);
        e.setOccurredAt(at);
        events.saveAndFlush(e);
    }
}
