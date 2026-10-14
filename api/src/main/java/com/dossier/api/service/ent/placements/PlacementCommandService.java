package com.dossier.api.service.ent.placements;

import com.dossier.api.domain.ent.talent.ClientAccount;
import com.dossier.api.domain.ent.talent.ClientContact;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.ent.talent.PlacementEvent;
import com.dossier.api.domain.ent.talent.PlacementExtension;
import com.dossier.api.domain.ent.talent.PlacementNote;
import com.dossier.api.domain.ent.talent.TalentPlacement;
import com.dossier.api.domain.enumeration.PermissionScope;
import com.dossier.api.repository.ent.talent.ClientContactRepository;
import com.dossier.api.repository.ent.talent.ConsultantProfileRepository;
import com.dossier.api.repository.ent.talent.MarketerAssignmentRepository;
import com.dossier.api.repository.ent.talent.PlacementEventRepository;
import com.dossier.api.repository.ent.talent.PlacementExtensionRepository;
import com.dossier.api.repository.ent.talent.PlacementNoteRepository;
import com.dossier.api.repository.ent.talent.TalentPlacementRepository;
import com.dossier.api.service.dto.ent.PlacementDTO;
import com.dossier.api.service.ent.applications.ApplicationNames;
import com.dossier.api.service.org.OrgAuditService;
import com.dossier.api.service.org.OrgException;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import com.dossier.api.service.privacy.SensitiveContent;
import jakarta.persistence.EntityManager;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The write side of the Placements board. Every change is a RECORD of what happened: an extension request, an extension, a completion and a
 * redeployment are rows with an audit event, and nothing here moves money (the bill rate is a number on the record). Each mutation appends one event to the
 * placement's timeline (the {@code prev_*} columns snapshot what an Undo restores) and writes one organization audit row. Everything is checked against
 * the caller's key and scope first; whatever fails is the same generic 404 as another tenant's row.
 */
@Service("entPlacementCommandService")
public class PlacementCommandService {

    public static final String TARGET = "PLACEMENT";
    public static final String AUDIT_CREATE = "PLACEMENT_CREATE";
    public static final String AUDIT_EXTEND = "PLACEMENT_EXTEND";
    public static final String AUDIT_EXTENSION_REQUEST = "PLACEMENT_EXTENSION_REQUEST";
    public static final String AUDIT_EXTENSION_DECIDE = "PLACEMENT_EXTENSION_DECIDE";
    public static final String AUDIT_COMPLETE = "PLACEMENT_COMPLETE";
    public static final String AUDIT_REDEPLOY = "PLACEMENT_REDEPLOY";
    public static final String AUDIT_REDEPLOY_CANCEL = "PLACEMENT_REDEPLOY_CANCEL";
    public static final String AUDIT_NOTE = "PLACEMENT_NOTE";
    public static final String AUDIT_UNDO = "PLACEMENT_UNDO";

    /** The events a person may take back within ten minutes. */
    public static final Set<String> UNDOABLE = Set.of("EXTENDED", "EXTENSION_REQUESTED", "EXTENSION_APPROVED", "EXTENSION_DECLINED", "COMPLETED", "REDEPLOY_STARTED");

    static final int ROLE_MAX = 120;
    static final int NOTE_MAX = 1000;
    static final int EXT_NOTE_MAX = 500;
    static final long RATE_MAX_MINOR = 100_000_000L;
    static final int MAX_YEARS = 10;

    private final EntityManager em;
    private final PlacementAccess access;
    private final ApplicationNames names;
    private final PlacementQueryService query;
    private final OrgAuditService audit;
    private final TalentPlacementRepository placements;
    private final PlacementExtensionRepository extensions;
    private final PlacementNoteRepository notes;
    private final PlacementEventRepository events;
    private final ConsultantProfileRepository consultants;
    private final ClientContactRepository contacts;
    private final MarketerAssignmentRepository assignments;
    private final Clock clock;

    @Autowired
    public PlacementCommandService(
        EntityManager em,
        PlacementAccess access,
        ApplicationNames names,
        PlacementQueryService query,
        OrgAuditService audit,
        TalentPlacementRepository placements,
        PlacementExtensionRepository extensions,
        PlacementNoteRepository notes,
        PlacementEventRepository events,
        ConsultantProfileRepository consultants,
        ClientContactRepository contacts,
        MarketerAssignmentRepository assignments
    ) {
        this(em, access, names, query, audit, placements, extensions, notes, events, consultants, contacts, assignments, Clock.systemUTC());
    }

    PlacementCommandService(
        EntityManager em,
        PlacementAccess access,
        ApplicationNames names,
        PlacementQueryService query,
        OrgAuditService audit,
        TalentPlacementRepository placements,
        PlacementExtensionRepository extensions,
        PlacementNoteRepository notes,
        PlacementEventRepository events,
        ConsultantProfileRepository consultants,
        ClientContactRepository contacts,
        MarketerAssignmentRepository assignments,
        Clock clock
    ) {
        this.em = em;
        this.access = access;
        this.names = names;
        this.query = query;
        this.audit = audit;
        this.placements = placements;
        this.extensions = extensions;
        this.notes = notes;
        this.events = events;
        this.consultants = consultants;
        this.contacts = contacts;
        this.assignments = assignments;
        this.clock = clock;
    }

    private LocalDate today() {
        return LocalDate.now(clock);
    }

    // ---- create ----------------------------------------------------------------------------------------------------------------

    @Transactional
    public PlacementDTO.Detail create(OrgMembership me, PlacementDTO.CreateRequest req) {
        PermissionScope scope = access.writeScope(me).orElseThrow(OrgNotFoundException::new);
        Long orgId = me.orgId();
        if (req == null) throw OrgException.invalid("body", "is required");
        if (req.consultantId() == null) throw OrgException.invalid("consultantId", "is required");
        if (req.clientId() == null) throw OrgException.invalid("clientId", "is required");
        ConsultantProfile consultant = consultants.findByOrgIdAndId(orgId, req.consultantId()).orElseThrow(OrgNotFoundException::new);
        ClientAccount client = em.createQuery("select c from ClientAccount c where c.orgId = :o and c.id = :id", ClientAccount.class).setParameter("o", orgId).setParameter("id", req.clientId()).getResultStream().findFirst().orElseThrow(OrgNotFoundException::new);
        String role = text("roleTitle", req.roleTitle(), ROLE_MAX);
        if (role == null) throw OrgException.invalid("roleTitle", "is required");
        String type = req.placementType() == null || req.placementType().isBlank() ? "CONTRACT" : req.placementType().strip().toUpperCase(Locale.ROOT);
        if (!PlacementRules.TYPES.contains(type)) throw OrgException.invalid("placementType", "must be CONTRACT, FTE or C2C");
        LocalDate today = today();
        if (req.startDate() == null) throw OrgException.invalid("startDate", "is required");
        if (req.startDate().isAfter(today.plusYears(2))) throw OrgException.invalid("startDate", "is too far ahead");
        if (req.startDate().isBefore(today.minusYears(MAX_YEARS))) throw OrgException.invalid("startDate", "is too far back");
        if (req.endDate() != null) {
            if (req.endDate().isBefore(req.startDate())) throw OrgException.invalid("endDate", "cannot be before the start date");
            if (req.endDate().isAfter(req.startDate().plusYears(MAX_YEARS))) throw OrgException.invalid("endDate", "is too far after the start date");
        }
        Long rate = req.billRateMinor();
        String unit = null;
        if (rate != null) {
            if (rate < 0 || rate > RATE_MAX_MINOR) throw OrgException.invalid("billRateMinor", "must be a plausible rate");
            unit = req.rateUnit() == null || req.rateUnit().isBlank() ? "HOUR" : req.rateUnit().strip().toUpperCase(Locale.ROOT);
            if (!PlacementRules.RATE_UNITS.contains(unit)) throw OrgException.invalid("rateUnit", "must be HOUR, DAY, MONTH or YEAR");
        } else if (req.rateUnit() != null && !req.rateUnit().isBlank()) {
            throw OrgException.invalid("rateUnit", "needs a bill rate");
        }
        Long manager = req.accountManagerMemberId() != null ? req.accountManagerMemberId() : assignments.findByOrgIdAndConsultantId(orgId, consultant.getId()).map(a -> a.getMarketerMemberId()).orElse(null);
        if (manager != null && !names.memberNames(orgId, java.util.List.of(manager)).containsKey(manager)) {
            if (req.accountManagerMemberId() != null) throw OrgException.coded(422, "INVALID_MANAGER", "That person is not a member of this organization", Map.of());
            manager = null;
        }
        if (scope != PermissionScope.ORG && !access.covers(me, scope, manager)) throw new OrgNotFoundException();
        Long contactId = null;
        if (req.clientContactId() != null) {
            ClientContact cc = contacts.findByOrgIdAndId(orgId, req.clientContactId()).filter(x -> x.getClientId().equals(client.getId())).orElseThrow(() -> OrgException.coded(422, "INVALID_CONTACT", "That contact does not belong to this client", Map.of()));
            contactId = cc.getId();
        }
        String note = text("note", req.note(), NOTE_MAX);
        long open = ((Number) em.createQuery("select count(p) from TalentPlacement p where p.orgId = :o and p.consultantId = :c and p.status <> 'ENDED'").setParameter("o", orgId).setParameter("c", consultant.getId()).getSingleResult()).longValue();
        if (open > 0) throw OrgException.coded(409, "ALREADY_PLACED", "This consultant already has a placement that has not ended", Map.of());

        Instant now = Instant.now(clock);
        TalentPlacement p = new TalentPlacement();
        p.setOrgId(orgId);
        p.setConsultantId(consultant.getId());
        p.setClientId(client.getId());
        p.setRoleTitle(role);
        p.setPlacementType(type);
        p.setStatus(req.startDate().isAfter(today) ? PlacementRules.STORED_PENDING : PlacementRules.STORED_ACTIVE);
        p.setStartDate(req.startDate());
        p.setEndDate(req.endDate());
        p.setBillRateMinor(rate);
        p.setRateUnit(unit);
        p.setCurrency("USD");
        p.setAccountManagerMemberId(manager);
        p.setClientContactId(contactId);
        p.setCreatedAt(now);
        p.setUpdatedAt(now);
        placements.saveAndFlush(p);
        record(p, "CREATED", me, note == null ? "Placement recorded" : "Placement recorded: " + note, null, null, now);
        audit.record(me, AUDIT_CREATE, TARGET, null, String.valueOf(p.getId()), json(Map.of("consultantId", consultant.getId(), "clientId", client.getId(), "status", p.getStatus())));
        return query.detailOf(me, p);
    }

    // ---- extensions ------------------------------------------------------------------------------------------------------------

    /** Record that the end date moved (the client agreed). Appears in the Extensions tab as APPROVED. */
    @Transactional
    public PlacementDTO.Detail extend(OrgMembership me, Long id, PlacementDTO.ExtendRequest req) {
        TalentPlacement p = writable(me, id);
        requireOpen(p);
        if (req == null || req.endDate() == null) throw OrgException.invalid("endDate", "is required");
        checkNewEnd(p, req.endDate());
        String note = text("note", req.note(), EXT_NOTE_MAX);
        Instant now = Instant.now(clock);
        PlacementEvent snap = snapshot(p);
        PlacementExtension x = new PlacementExtension();
        x.setOrgId(p.getOrgId());
        x.setPlacementId(p.getId());
        x.setStatus(PlacementRules.EXT_APPROVED);
        x.setFromEndDate(p.getEndDate());
        x.setRequestedEndDate(req.endDate());
        x.setNote(note);
        x.setRequestedByMemberId(me.memberId());
        x.setDecidedByMemberId(me.memberId());
        x.setCreatedAt(now);
        x.setDecidedAt(now);
        extensions.saveAndFlush(x);
        p.setEndDate(req.endDate());
        placements.saveAndFlush(p);
        record(p, "EXTENDED", me, "Extended " + (snap.getPrevEndDate() == null ? "to " : "from " + snap.getPrevEndDate() + " to ") + req.endDate() + (note == null ? "" : ": " + note), x.getId(), snap, now);
        audit.record(me, AUDIT_EXTEND, TARGET, null, String.valueOf(p.getId()), json(Map.of("from", String.valueOf(snap.getPrevEndDate()), "to", req.endDate().toString())));
        return query.detailOf(me, p);
    }

    @Transactional
    public PlacementDTO.Detail requestExtension(OrgMembership me, Long id, PlacementDTO.RequestExtensionRequest req) {
        TalentPlacement p = writable(me, id);
        requireOpen(p);
        if (req == null || req.requestedEndDate() == null) throw OrgException.invalid("requestedEndDate", "is required");
        checkNewEnd(p, req.requestedEndDate());
        String note = text("note", req.note(), EXT_NOTE_MAX);
        long pending = extensions.findByOrgIdAndPlacementIdOrderByCreatedAtDescIdDesc(p.getOrgId(), p.getId()).stream().filter(e -> PlacementRules.EXT_REQUESTED.equals(e.getStatus())).count();
        if (pending > 0) throw OrgException.coded(409, "EXTENSION_ALREADY_REQUESTED", "An extension is already waiting for a decision", Map.of());
        Instant now = Instant.now(clock);
        PlacementExtension x = new PlacementExtension();
        x.setOrgId(p.getOrgId());
        x.setPlacementId(p.getId());
        x.setStatus(PlacementRules.EXT_REQUESTED);
        x.setFromEndDate(p.getEndDate());
        x.setRequestedEndDate(req.requestedEndDate());
        x.setNote(note);
        x.setRequestedByMemberId(me.memberId());
        x.setCreatedAt(now);
        extensions.saveAndFlush(x);
        record(p, "EXTENSION_REQUESTED", me, "Extension requested to " + req.requestedEndDate() + (note == null ? "" : ": " + note), x.getId(), null, now);
        audit.record(me, AUDIT_EXTENSION_REQUEST, TARGET, null, String.valueOf(p.getId()), json(Map.of("requestedEndDate", req.requestedEndDate().toString())));
        return query.detailOf(me, p);
    }

    @Transactional
    public PlacementDTO.Detail decide(OrgMembership me, Long id, Long extensionId, PlacementDTO.DecideRequest req) {
        TalentPlacement p = writable(me, id);
        requireOpen(p);
        String decision = req == null || req.decision() == null ? "" : req.decision().strip().toUpperCase(Locale.ROOT);
        if (!decision.equals("APPROVE") && !decision.equals("DECLINE")) throw OrgException.invalid("decision", "must be APPROVE or DECLINE");
        PlacementExtension x = extensions.findByOrgIdAndId(p.getOrgId(), extensionId).filter(e -> e.getPlacementId().equals(p.getId())).orElseThrow(OrgNotFoundException::new);
        if (!PlacementRules.EXT_REQUESTED.equals(x.getStatus())) throw OrgException.coded(409, "EXTENSION_NOT_PENDING", "That extension has already been decided", Map.of());
        Instant now = Instant.now(clock);
        PlacementEvent snap = snapshot(p);
        x.setDecidedByMemberId(me.memberId());
        x.setDecidedAt(now);
        if (decision.equals("APPROVE")) {
            x.setStatus(PlacementRules.EXT_APPROVED);
            if (p.getEndDate() == null || x.getRequestedEndDate().isAfter(p.getEndDate())) {
                p.setEndDate(x.getRequestedEndDate());
                placements.saveAndFlush(p);
            }
            extensions.saveAndFlush(x);
            record(p, "EXTENSION_APPROVED", me, "Extension approved: ends " + p.getEndDate(), x.getId(), snap, now);
        } else {
            x.setStatus(PlacementRules.EXT_DECLINED);
            extensions.saveAndFlush(x);
            record(p, "EXTENSION_DECLINED", me, "Extension declined", x.getId(), snap, now);
        }
        audit.record(me, AUDIT_EXTENSION_DECIDE, TARGET, null, String.valueOf(p.getId()), json(Map.of("extensionId", x.getId(), "decision", decision)));
        return query.detailOf(me, p);
    }

    // ---- complete / redeploy ---------------------------------------------------------------------------------------------------

    @Transactional
    public PlacementDTO.Detail complete(OrgMembership me, Long id, PlacementDTO.CompleteRequest req) {
        TalentPlacement p = writable(me, id);
        requireOpen(p);
        LocalDate today = today();
        if (p.getStartDate().isAfter(today)) throw OrgException.coded(422, "PLACEMENT_NOT_STARTED", "A placement that has not started cannot be completed", Map.of());
        String note = text("note", req == null ? null : req.note(), EXT_NOTE_MAX);
        Instant now = Instant.now(clock);
        PlacementEvent snap = snapshot(p);
        p.setStatus(PlacementRules.STORED_ENDED);
        p.setCompletedAt(now);
        if (p.getEndDate() == null || p.getEndDate().isAfter(today)) p.setEndDate(today);
        placements.saveAndFlush(p);
        record(p, "COMPLETED", me, "Marked complete" + (note == null ? "" : ": " + note), null, snap, now);
        audit.record(me, AUDIT_COMPLETE, TARGET, null, String.valueOf(p.getId()), json(Map.of("endDate", p.getEndDate().toString())));
        return query.detailOf(me, p);
    }

    @Transactional
    public PlacementDTO.Detail redeploy(OrgMembership me, Long id, PlacementDTO.RedeployRequest req) {
        TalentPlacement p = writable(me, id);
        if (p.isRedeploymentPool()) throw OrgException.coded(409, "ALREADY_IN_POOL", "This consultant is already in the redeployment pool", Map.of());
        LocalDate today = today();
        LocalDate from = req == null ? null : req.availableFrom();
        if (from == null) from = p.getEndDate() != null && p.getEndDate().isAfter(today) ? p.getEndDate().plusDays(1) : today;
        if (from.isBefore(today)) throw OrgException.invalid("availableFrom", "cannot be in the past");
        if (from.isAfter(today.plusYears(2))) throw OrgException.invalid("availableFrom", "is too far ahead");
        Instant now = Instant.now(clock);
        PlacementEvent snap = snapshot(p);
        p.setRedeploymentPool(true);
        p.setRedeploymentDate(from);
        placements.saveAndFlush(p);
        record(p, "REDEPLOY_STARTED", me, "Redeployment started: available from " + from, null, snap, now);
        audit.record(me, AUDIT_REDEPLOY, TARGET, null, String.valueOf(p.getId()), json(Map.of("availableFrom", from.toString())));
        return query.detailOf(me, p);
    }

    @Transactional
    public PlacementDTO.Detail cancelRedeployment(OrgMembership me, Long id) {
        TalentPlacement p = writable(me, id);
        if (!p.isRedeploymentPool()) throw OrgException.coded(409, "NOT_IN_POOL", "This consultant is not in the redeployment pool", Map.of());
        Instant now = Instant.now(clock);
        PlacementEvent snap = snapshot(p);
        p.setRedeploymentPool(false);
        p.setRedeploymentDate(null);
        placements.saveAndFlush(p);
        record(p, "REDEPLOY_CANCELLED", me, "Removed from the redeployment pool", null, snap, now);
        audit.record(me, AUDIT_REDEPLOY_CANCEL, TARGET, null, String.valueOf(p.getId()), "{}");
        return query.detailOf(me, p);
    }

    // ---- notes -----------------------------------------------------------------------------------------------------------------

    @Transactional
    public PlacementDTO.Detail addNote(OrgMembership me, Long id, PlacementDTO.NoteRequest req) {
        TalentPlacement p = writable(me, id);
        String body = req == null || req.body() == null ? "" : req.body().strip();
        if (body.isEmpty()) throw OrgException.invalid("body", "write something first");
        if (body.length() > NOTE_MAX) throw OrgException.invalid("body", "at most " + NOTE_MAX + " characters");
        if (body.indexOf('<') >= 0 || body.indexOf('>') >= 0) throw OrgException.invalid("body", "contains characters that are not allowed");
        SensitiveContent.check("body", "body", body);
        Instant now = Instant.now(clock);
        PlacementNote n = new PlacementNote();
        n.setOrgId(p.getOrgId());
        n.setPlacementId(p.getId());
        n.setAuthorMemberId(me.memberId());
        n.setBody(body);
        n.setCreatedAt(now);
        notes.saveAndFlush(n);
        record(p, "NOTE", me, body.length() > 300 ? body.substring(0, 300) : body, n.getId(), null, now);
        audit.record(me, AUDIT_NOTE, TARGET, null, String.valueOf(p.getId()), "{\"noteId\":" + n.getId() + "}");
        return query.detailOf(me, p);
    }

    // ---- undo ------------------------------------------------------------------------------------------------------------------

    /** Takes back the caller's own latest change (ten minutes, nothing recorded after it). The timeline keeps both events. */
    @Transactional
    public PlacementDTO.Detail undo(OrgMembership me, Long id, PlacementDTO.UndoRequest req) {
        TalentPlacement p = writable(me, id);
        if (req == null || req.eventId() == null) throw OrgException.invalid("eventId", "is required");
        PlacementEvent last = events.findFirstByOrgIdAndPlacementIdOrderByOccurredAtDescIdDesc(p.getOrgId(), p.getId()).orElse(null);
        Instant now = Instant.now(clock);
        if (last == null || !last.getId().equals(req.eventId()) || !UNDOABLE.contains(last.getEventType()) || !me.memberId().equals(last.getActorMemberId())
            || last.getOccurredAt().plus(PlacementQueryService.UNDO_WINDOW).isBefore(now)) {
            throw OrgException.coded(422, "UNDO_NOT_AVAILABLE", "That change can no longer be undone", Map.of());
        }
        String type = last.getEventType();
        PlacementExtension x = last.getRefId() == null ? null : extensions.findByOrgIdAndId(p.getOrgId(), last.getRefId()).orElse(null);
        switch (type) {
            case "EXTENDED" -> {
                p.setEndDate(last.getPrevEndDate());
                if (x != null) cancel(x);
            }
            case "EXTENSION_REQUESTED" -> {
                if (x != null) cancel(x);
            }
            case "EXTENSION_APPROVED" -> {
                p.setEndDate(last.getPrevEndDate());
                if (x != null) reopen(x);
            }
            case "EXTENSION_DECLINED" -> {
                if (x != null) reopen(x);
            }
            case "COMPLETED" -> {
                p.setStatus(last.getPrevStatus() == null ? PlacementRules.STORED_ACTIVE : last.getPrevStatus());
                p.setEndDate(last.getPrevEndDate());
                p.setCompletedAt(null);
            }
            case "REDEPLOY_STARTED" -> {
                p.setRedeploymentPool(Boolean.TRUE.equals(last.getPrevPool()));
                p.setRedeploymentDate(last.getPrevPoolDate());
            }
            default -> throw OrgException.coded(422, "UNDO_NOT_AVAILABLE", "That change can no longer be undone", Map.of());
        }
        placements.saveAndFlush(p);
        record(p, type.equals("REDEPLOY_STARTED") ? "REDEPLOY_CANCELLED" : "UNDO", me, "Undone: " + last.getDetail(), last.getRefId(), null, now);
        audit.record(me, AUDIT_UNDO, TARGET, null, String.valueOf(p.getId()), json(Map.of("undid", type)));
        return query.detailOf(me, p);
    }

    private void cancel(PlacementExtension x) {
        x.setStatus(PlacementRules.EXT_CANCELLED);
        x.setDecidedAt(null);
        x.setDecidedByMemberId(null);
        extensions.saveAndFlush(x);
    }

    private void reopen(PlacementExtension x) {
        x.setStatus(PlacementRules.EXT_REQUESTED);
        x.setDecidedAt(null);
        x.setDecidedByMemberId(null);
        extensions.saveAndFlush(x);
    }

    // ---- helpers ---------------------------------------------------------------------------------------------------------------

    /** The placement, only when the caller may read it AND write it; otherwise the generic 404. */
    TalentPlacement writable(OrgMembership me, Long id) {
        TalentPlacement p = query.visible(me, id);
        access.requireWrite(me, p);
        return p;
    }

    private static void requireOpen(TalentPlacement p) {
        if (PlacementRules.STORED_ENDED.equals(p.getStatus())) throw OrgException.coded(422, "PLACEMENT_ENDED", "This placement is already complete", Map.of());
    }

    private void checkNewEnd(TalentPlacement p, LocalDate next) {
        LocalDate floor = p.getEndDate() != null ? p.getEndDate() : p.getStartDate();
        if (!next.isAfter(floor)) throw OrgException.invalid(p.getEndDate() != null ? "endDate" : "endDate", p.getEndDate() != null ? "must be after the current end date" : "must be after the start date");
        if (next.isAfter(p.getStartDate().plusYears(MAX_YEARS))) throw OrgException.invalid("endDate", "is too far after the start date");
    }

    private PlacementEvent snapshot(TalentPlacement p) {
        PlacementEvent e = new PlacementEvent();
        e.setPrevStatus(p.getStatus());
        e.setPrevEndDate(p.getEndDate());
        e.setPrevPool(p.isRedeploymentPool());
        e.setPrevPoolDate(p.getRedeploymentDate());
        return e;
    }

    private void record(TalentPlacement p, String type, OrgMembership actor, String detail, Long refId, PlacementEvent snap, Instant at) {
        PlacementEvent e = new PlacementEvent();
        e.setOrgId(p.getOrgId());
        e.setPlacementId(p.getId());
        e.setEventType(type);
        e.setActorMemberId(actor.memberId());
        e.setDetail(detail == null ? null : detail.length() > 300 ? detail.substring(0, 300) : detail);
        e.setRefId(refId);
        if (snap != null) {
            e.setPrevStatus(snap.getPrevStatus());
            e.setPrevEndDate(snap.getPrevEndDate());
            e.setPrevPool(snap.getPrevPool());
            e.setPrevPoolDate(snap.getPrevPoolDate());
        }
        e.setOccurredAt(at);
        events.saveAndFlush(e);
    }

    private static String text(String field, String raw, int max) {
        if (raw == null) return null;
        String t = raw.strip();
        if (t.isEmpty()) return null;
        if (t.length() > max) throw OrgException.invalid(field, "at most " + max + " characters");
        if (t.chars().anyMatch(Character::isISOControl) || t.indexOf('<') >= 0 || t.indexOf('>') >= 0) throw OrgException.invalid(field, "contains characters that are not allowed");
        SensitiveContent.check(field, field, t);
        return t;
    }

    private static String json(Map<String, ?> m) {
        StringBuilder sb = new StringBuilder("{");
        boolean first = true;
        for (Map.Entry<String, ?> e : m.entrySet()) {
            if (!first) sb.append(',');
            first = false;
            sb.append('"').append(e.getKey()).append("\":");
            Object v = e.getValue();
            if (v == null) sb.append("null");
            else if (v instanceof Number) sb.append(v);
            else sb.append('"').append(v.toString().replace("\\", "\\\\").replace("\"", "\\\"")).append('"');
        }
        return sb.append('}').toString();
    }
}
