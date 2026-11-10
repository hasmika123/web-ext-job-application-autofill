package com.dossier.api.service.ent.offers;

import com.dossier.api.domain.ent.consultantws.CwsNotification;
import com.dossier.api.domain.ent.consultantws.CwsOffer;
import com.dossier.api.domain.ent.consultantws.CwsOfferEvent;
import com.dossier.api.domain.ent.mkt.MktSubmission;
import com.dossier.api.domain.ent.talent.ClientAccount;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.ent.talent.TalentApplication;
import com.dossier.api.repository.ent.consultantws.CwsOfferEventRepository;
import com.dossier.api.repository.ent.consultantws.CwsOfferRepository;
import com.dossier.api.repository.ent.talent.ConsultantProfileRepository;
import com.dossier.api.service.ent.consultantws.ConsultantNotificationGenerator;
import com.dossier.api.service.ent.placements.PlacementHireService;
import com.dossier.api.service.ent.placements.PlacementRules;
import com.dossier.api.service.org.OrgAuditService;
import com.dossier.api.service.org.OrgException;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import com.dossier.api.service.privacy.SensitiveContent;
import jakarta.persistence.EntityManager;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Pattern;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Recording an offer (X9.8). The Account Manager (or anyone holding {@code offers.manage}) RECORDS what the client extended; the CONSULTANT is the only one
 * who can accept, decline or negotiate it (consent), through {@code ConsultantOffersService}. Nothing here signs a document, sends anything to a client or
 * moves money: the rate and the salary are plain numbers with a currency and a period. Every change writes an offer event (who: MEMBER / CONSULTANT / SYSTEM)
 * and exactly one organization audit row. Free text is scanned for sensitive data and every lookup is organization id first.
 */
@Service
public class OfferCommandService {

    public static final String TARGET = "OFFER";
    public static final String AUDIT_CREATE = "OFFER_CREATE";
    public static final String AUDIT_UPDATE = "OFFER_UPDATE";
    public static final String AUDIT_EXTEND = "OFFER_EXTEND";
    public static final String AUDIT_WITHDRAW = "OFFER_WITHDRAW";
    public static final String AUDIT_EXPIRE = "OFFER_EXPIRE";
    public static final String AUDIT_PLACEMENT = "OFFER_PLACEMENT";

    static final int ROLE_MAX = 200;
    static final int TEXT_MAX = 500;
    static final long RATE_MAX_MINOR = 100_000_000L;
    static final long PACKAGE_MAX_MINOR = 100_000_000_000L;
    static final int MAX_TERM_MONTHS = 120;
    static final int MAX_YEARS = 10;
    private static final Pattern CURRENCY = Pattern.compile("^[A-Z]{3}$");

    private final EntityManager em;
    private final OfferAccess access;
    private final CwsOfferRepository offers;
    private final CwsOfferEventRepository events;
    private final ConsultantProfileRepository consultants;
    private final OfferSettings settings;
    private final PlacementHireService hire;
    private final ConsultantNotificationGenerator notifications;
    private final OfferQueryService query;
    private final OrgAuditService audit;
    private final Clock clock;

    @Autowired
    public OfferCommandService(
        EntityManager em,
        OfferAccess access,
        CwsOfferRepository offers,
        CwsOfferEventRepository events,
        ConsultantProfileRepository consultants,
        OfferSettings settings,
        PlacementHireService hire,
        ConsultantNotificationGenerator notifications,
        OfferQueryService query,
        OrgAuditService audit
    ) {
        this(em, access, offers, events, consultants, settings, hire, notifications, query, audit, Clock.systemUTC());
    }

    OfferCommandService(
        EntityManager em,
        OfferAccess access,
        CwsOfferRepository offers,
        CwsOfferEventRepository events,
        ConsultantProfileRepository consultants,
        OfferSettings settings,
        PlacementHireService hire,
        ConsultantNotificationGenerator notifications,
        OfferQueryService query,
        OrgAuditService audit,
        Clock clock
    ) {
        this.em = em;
        this.access = access;
        this.offers = offers;
        this.events = events;
        this.consultants = consultants;
        this.settings = settings;
        this.hire = hire;
        this.notifications = notifications;
        this.query = query;
        this.audit = audit;
        this.clock = clock;
    }

    private LocalDate today() {
        return LocalDate.now(clock.withZone(ZoneOffset.UTC));
    }

    // ---- record / revise --------------------------------------------------------------------------------------------------------

    @Transactional
    public OfferDTO.Detail create(OrgMembership me, OfferDTO.WriteRequest req) {
        access.requireWrite(me);
        if (req == null) throw OrgException.invalid("body", "is required");
        Long orgId = me.orgId();
        if (req.consultantId() == null) throw OrgException.invalid("consultantId", "is required");
        ConsultantProfile consultant = consultants.findByOrgIdAndId(orgId, req.consultantId()).orElseThrow(OrgNotFoundException::new);
        Instant now = Instant.now(clock);
        CwsOffer o = new CwsOffer();
        o.setOrgId(orgId);
        o.setConsultantId(consultant.getId());
        o.setStatus(CwsOffer.DRAFT);
        o.setCreatedAt(now);
        o.setCreatedByMemberId(me.memberId());
        apply(o, req, orgId, today(), true);
        o.setUpdatedAt(now);
        o.setUpdatedByMemberId(me.memberId());
        o.setUpdatedByKind(CwsOfferEvent.BY_MEMBER);
        o.setSampleData(false);
        o = offers.saveAndFlush(o);
        event(o, CwsOfferEvent.DRAFTED, "Offer drafted", me, null, now);
        boolean extendNow = Boolean.TRUE.equals(req.extend());
        if (extendNow) doExtend(o, me, now);
        audit.record(me, AUDIT_CREATE, TARGET, null, String.valueOf(o.getId()), json(Map.of("consultantId", consultant.getId(), "status", o.getStatus())));
        return query.detail(me, o.getId());
    }

    @Transactional
    public OfferDTO.Detail update(OrgMembership me, Long id, OfferDTO.WriteRequest req) {
        access.requireWrite(me);
        if (req == null) throw OrgException.invalid("body", "is required");
        CwsOffer o = offers.findByOrgIdAndId(me.orgId(), id).orElseThrow(OrgNotFoundException::new);
        LocalDate today = today();
        String state = OfferRules.state(o.getStatus(), o.getOfferDeadline(), today);
        if (!OfferRules.canEdit(state)) throw OrgException.coded(409, "OFFER_NOT_EDITABLE", "This offer can no longer be edited.", Map.of("state", state));
        if (req.consultantId() != null && !req.consultantId().equals(o.getConsultantId())) throw OrgException.invalid("consultantId", "cannot be changed; withdraw this offer and record a new one");
        Instant now = Instant.now(clock);
        apply(o, req, me.orgId(), today, false);
        boolean revisedWhileNegotiating = CwsOffer.NEGOTIATION.equals(o.getStatus());
        if (revisedWhileNegotiating) {
            o.setStatus(CwsOffer.PENDING_REVIEW); // the consultant asked to talk; the revised terms go back to them to answer
            o.setRespondedAt(null);
        }
        o.setUpdatedAt(now);
        o.setUpdatedByMemberId(me.memberId());
        o.setUpdatedByKind(CwsOfferEvent.BY_MEMBER);
        offers.saveAndFlush(o);
        if (!CwsOffer.DRAFT.equals(o.getStatus())) {
            event(o, CwsOfferEvent.UPDATED, revisedWhileNegotiating ? "Terms updated after negotiation" : "Offer updated", me, null, now);
            notify(o, "Offer updated", o.getRoleTitle() + " at " + o.getClientName() + " was updated. Please review the new terms.", "offer-updated:" + o.getId() + ":" + now.toEpochMilli());
        } else {
            event(o, CwsOfferEvent.EDITED, "Draft edited", me, null, now);
        }
        audit.record(me, AUDIT_UPDATE, TARGET, null, String.valueOf(o.getId()), json(Map.of("status", o.getStatus())));
        return query.detail(me, o.getId());
    }

    /** Records that the client extended this offer: from now on the consultant sees it and may answer. */
    @Transactional
    public OfferDTO.Detail extend(OrgMembership me, Long id) {
        access.requireWrite(me);
        CwsOffer o = offers.findByOrgIdAndId(me.orgId(), id).orElseThrow(OrgNotFoundException::new);
        if (!CwsOffer.DRAFT.equals(o.getStatus())) throw OrgException.coded(409, "OFFER_NOT_DRAFT", "Only a draft can be recorded as extended.", Map.of("state", OfferRules.state(o.getStatus(), o.getOfferDeadline(), today())));
        doExtend(o, me, Instant.now(clock));
        audit.record(me, AUDIT_EXTEND, TARGET, null, String.valueOf(o.getId()), json(Map.of("status", o.getStatus(), "deadline", String.valueOf(o.getOfferDeadline()))));
        return query.detail(me, o.getId());
    }

    private void doExtend(CwsOffer o, OrgMembership me, Instant now) {
        LocalDate today = today();
        if (o.getStartDate() == null) throw OrgException.invalid("startDate", "is required before an offer can be recorded as extended");
        if (o.getOfferDeadline() == null) o.setOfferDeadline(today.plusDays(settings.expiryDays(o.getOrgId())));
        if (o.getOfferDeadline().isBefore(today)) throw OrgException.invalid("deadline", "cannot be in the past");
        o.setStatus(CwsOffer.PENDING_REVIEW);
        o.setExtendedAt(now);
        o.setUpdatedAt(now);
        o.setUpdatedByMemberId(me.memberId());
        o.setUpdatedByKind(CwsOfferEvent.BY_MEMBER);
        offers.saveAndFlush(o);
        event(o, CwsOfferEvent.EXTENDED, "Offer extended", me, "Recorded as received from " + o.getClientName() + ". Nothing was signed or sent by Kiwiply.", now);
        notify(o, "New offer received", o.getRoleTitle() + " at " + o.getClientName() + ": answer by " + o.getOfferDeadline() + ".", "offer-new:" + o.getId());
    }

    @Transactional
    public OfferDTO.Detail withdraw(OrgMembership me, Long id, OfferDTO.WithdrawRequest req) {
        access.requireWrite(me);
        CwsOffer o = offers.findByOrgIdAndId(me.orgId(), id).orElseThrow(OrgNotFoundException::new);
        LocalDate today = today();
        String state = OfferRules.state(o.getStatus(), o.getOfferDeadline(), today);
        if (!OfferRules.canWithdraw(state)) throw OrgException.coded(409, "OFFER_NOT_OPEN", "This offer can no longer be withdrawn.", Map.of("state", state));
        String reason = text("reason", req == null ? null : req.reason(), 300);
        Instant now = Instant.now(clock);
        boolean wasOpen = !CwsOffer.DRAFT.equals(o.getStatus());
        o.setStatus(CwsOffer.WITHDRAWN);
        o.setUpdatedAt(now);
        o.setUpdatedByMemberId(me.memberId());
        o.setUpdatedByKind(CwsOfferEvent.BY_MEMBER);
        offers.saveAndFlush(o);
        event(o, CwsOfferEvent.WITHDRAWN, "Offer withdrawn", me, reason, now);
        if (wasOpen) notify(o, "Offer withdrawn", o.getRoleTitle() + " at " + o.getClientName() + " was withdrawn.", "offer-withdrawn:" + o.getId());
        audit.record(me, AUDIT_WITHDRAW, TARGET, null, String.valueOf(o.getId()), json(Map.of("wasOpen", wasOpen)));
        return query.detail(me, o.getId());
    }

    /** Retry the hire for an accepted offer whose placement could not be made (no client, or an open placement that has since ended). */
    @Transactional
    public OfferDTO.Detail createPlacement(OrgMembership me, Long id) {
        access.requireWrite(me);
        CwsOffer o = offers.findByOrgIdAndId(me.orgId(), id).orElseThrow(OrgNotFoundException::new);
        if (!CwsOffer.ACCEPTED.equals(o.getStatus())) throw OrgException.coded(409, "OFFER_NOT_ACCEPTED", "A placement can only be created from an offer the consultant accepted.", Map.of());
        if (o.getPlacementId() != null) throw OrgException.coded(409, "PLACEMENT_EXISTS", "This offer already has a placement.", Map.of());
        PlacementHireService.Outcome out = hire.hire(o);
        if (!out.created()) throw OrgException.coded(422, "PLACEMENT_NOT_CREATED", out.problem(), Map.of());
        Instant now = Instant.now(clock);
        o.setUpdatedAt(now);
        o.setUpdatedByMemberId(me.memberId());
        o.setUpdatedByKind(CwsOfferEvent.BY_MEMBER);
        offers.saveAndFlush(o);
        event(o, CwsOfferEvent.HIRED, "Placement created", me, null, now);
        audit.record(me, AUDIT_PLACEMENT, TARGET, null, String.valueOf(o.getId()), json(Map.of("placementId", out.placementId())));
        return query.detail(me, o.getId());
    }

    // ---- the nightly expiry -----------------------------------------------------------------------------------------------------

    /** Closes the organization's open offers whose deadline day has passed (EXPIRED, an event by SYSTEM, one audit row per offer). Returns how many. */
    @Transactional
    public int expireDue(Long orgId) {
        LocalDate today = today();
        List<CwsOffer> due = em
            .createQuery("select o from CwsOffer o where o.orgId = :o and o.status in :open and o.offerDeadline is not null and o.offerDeadline < :today", CwsOffer.class)
            .setParameter("o", orgId)
            .setParameter("open", OfferRules.OPEN_STORED)
            .setParameter("today", today)
            .getResultList();
        Instant now = Instant.now(clock);
        for (CwsOffer o : due) {
            o.setStatus(CwsOffer.EXPIRED);
            o.setUpdatedAt(now);
            o.setUpdatedByMemberId(null);
            o.setUpdatedByKind(CwsOfferEvent.BY_SYSTEM);
            offers.saveAndFlush(o);
            events.save(CwsOfferEvent.of(o, CwsOfferEvent.EXPIRED, "Offer expired", now).by(CwsOfferEvent.BY_SYSTEM, null, "The deadline passed without an answer."));
            audit.record(orgId, null, AUDIT_EXPIRE, TARGET, null, String.valueOf(o.getId()), json(Map.of("deadline", String.valueOf(o.getOfferDeadline()))));
        }
        return due.size();
    }

    // ---- validation -------------------------------------------------------------------------------------------------------------

    /** Copies the business fields of {@code r} onto {@code o}, checking each one. On an update a null field keeps the stored value. */
    private void apply(CwsOffer o, OfferDTO.WriteRequest r, Long orgId, LocalDate today, boolean creating) {
        if (creating && r.clientId() == null) throw OrgException.invalid("clientId", "is required");
        if (r.clientId() != null) {
            ClientAccount client = em
                .createQuery("select c from ClientAccount c where c.orgId = :o and c.id = :id", ClientAccount.class)
                .setParameter("o", orgId)
                .setParameter("id", r.clientId())
                .getResultStream()
                .findFirst()
                .orElseThrow(OrgNotFoundException::new);
            o.setClientId(client.getId());
            o.setClientName(client.getName().length() > 160 ? client.getName().substring(0, 160) : client.getName());
        }
        String role = text("roleTitle", r.roleTitle(), ROLE_MAX);
        if (role != null) o.setRoleTitle(role);
        if (o.getRoleTitle() == null) throw OrgException.invalid("roleTitle", "is required");
        if (r.submissionId() != null) {
            MktSubmission s = em
                .createQuery("select s from MktSubmission s where s.orgId = :o and s.id = :id", MktSubmission.class)
                .setParameter("o", orgId)
                .setParameter("id", r.submissionId())
                .getResultStream()
                .findFirst()
                .orElseThrow(OrgNotFoundException::new);
            if (!s.getConsultantId().equals(o.getConsultantId())) throw OrgException.coded(422, "INVALID_SUBMISSION", "That submission belongs to another consultant", Map.of());
            o.setSubmissionId(s.getId());
            o.setRequirementId(s.getRequirementId());
        }
        if (r.applicationId() != null) {
            TalentApplication a = em
                .createQuery("select a from TalentApplication a where a.orgId = :o and a.id = :id", TalentApplication.class)
                .setParameter("o", orgId)
                .setParameter("id", r.applicationId())
                .getResultStream()
                .findFirst()
                .orElseThrow(OrgNotFoundException::new);
            if (!a.getConsultantId().equals(o.getConsultantId())) throw OrgException.coded(422, "INVALID_APPLICATION", "That application belongs to another consultant", Map.of());
            o.setApplicationId(a.getId());
            if (o.getRequirementId() == null) o.setRequirementId(a.getRequirementId());
        }
        if (r.placementType() != null && !r.placementType().isBlank()) {
            String type = r.placementType().strip().toUpperCase(Locale.ROOT);
            if (!PlacementRules.TYPES.contains(type)) throw OrgException.invalid("placementType", "must be CONTRACT, FTE or C2C");
            o.setPlacementType(type);
        } else if (creating) {
            o.setPlacementType("CONTRACT");
        }
        if (r.workMode() != null && !r.workMode().isBlank()) {
            String wm = r.workMode().strip().toUpperCase(Locale.ROOT);
            if (!OfferRules.WORK_MODES.contains(wm)) throw OrgException.invalid("workMode", "must be REMOTE, HYBRID or ONSITE");
            o.setWorkMode(wm);
        }
        if (r.currency() != null && !r.currency().isBlank()) {
            String cur = r.currency().strip().toUpperCase(Locale.ROOT);
            if (!CURRENCY.matcher(cur).matches()) throw OrgException.invalid("currency", "must be a three-letter code such as USD");
            o.setCurrency(cur);
        }
        if (r.rateMinor() != null) {
            if (r.rateMinor() < 0 || r.rateMinor() > RATE_MAX_MINOR) throw OrgException.invalid("rateMinor", "must be a plausible rate");
            String period = r.ratePeriod() == null || r.ratePeriod().isBlank() ? "HOUR" : r.ratePeriod().strip().toUpperCase(Locale.ROOT);
            if (!OfferRules.RATE_PERIODS.contains(period)) throw OrgException.invalid("ratePeriod", "must be HOUR, DAY, MONTH or YEAR");
            o.setRateMinor(r.rateMinor());
            o.setRatePeriod(period);
        } else if (r.ratePeriod() != null && !r.ratePeriod().isBlank()) {
            throw OrgException.invalid("ratePeriod", "needs a rate");
        }
        o.setBaseSalaryMinor(money("baseSalaryMinor", r.baseSalaryMinor(), o.getBaseSalaryMinor()));
        o.setTotalCompMinor(money("totalCompMinor", r.totalCompMinor(), o.getTotalCompMinor()));
        if (r.startDate() != null) {
            if (r.startDate().isAfter(today.plusYears(2))) throw OrgException.invalid("startDate", "is too far ahead");
            if (r.startDate().isBefore(today.minusYears(1))) throw OrgException.invalid("startDate", "is too far back");
            o.setStartDate(r.startDate());
        }
        if (r.endDate() != null) o.setEndDate(r.endDate());
        if (r.termMonths() != null) {
            if (r.termMonths() < 1 || r.termMonths() > MAX_TERM_MONTHS) throw OrgException.invalid("termMonths", "must be between 1 and " + MAX_TERM_MONTHS);
            o.setTermMonths(r.termMonths());
        }
        if (o.getEndDate() != null && o.getStartDate() != null) {
            if (o.getEndDate().isBefore(o.getStartDate())) throw OrgException.invalid("endDate", "cannot be before the start date");
            if (o.getEndDate().isAfter(o.getStartDate().plusYears(MAX_YEARS))) throw OrgException.invalid("endDate", "is too far after the start date");
        }
        if (r.deadline() != null) o.setOfferDeadline(r.deadline());
        String benefits = text("benefits", r.benefits(), TEXT_MAX);
        if (benefits != null) o.setBenefitsSummary(benefits);
        String notes = text("notes", r.notes(), TEXT_MAX);
        if (notes != null) o.setNotes(notes);
        if (o.getPackageSummary() == null || r.rateMinor() != null || r.baseSalaryMinor() != null) o.setPackageSummary(summary(o));
    }

    private static Long money(String field, Long value, Long current) {
        if (value == null) return current;
        if (value < 0 || value > PACKAGE_MAX_MINOR) throw OrgException.invalid(field, "must be a plausible amount");
        return value;
    }

    /** A one-line description of the package built from the numbers (shown in lists); never free text from outside. */
    static String summary(CwsOffer o) {
        StringBuilder sb = new StringBuilder();
        String cur = o.getCurrency() == null ? "USD" : o.getCurrency();
        if (o.getRateMinor() != null) sb.append(cur).append(' ').append(plain(o.getRateMinor())).append(" per ").append(period(o.getRatePeriod()));
        else if (o.getBaseSalaryMinor() != null) sb.append(cur).append(' ').append(plain(o.getBaseSalaryMinor())).append(" per year");
        String type = o.getPlacementType() == null ? "" : PlacementRules.typeLabel(o.getPlacementType());
        if (!type.isEmpty()) sb.append(sb.length() > 0 ? ", " : "").append(type);
        return sb.length() == 0 ? null : sb.toString();
    }

    private static String plain(long minor) {
        return minor % 100 == 0 ? String.valueOf(minor / 100) : String.format(Locale.ROOT, "%d.%02d", minor / 100, minor % 100);
    }

    private static String period(String p) {
        return p == null ? "hour" : p.toLowerCase(Locale.ROOT);
    }

    /** A trimmed, screened free-text field; blank is null. No markup, no control characters, no sensitive data. */
    static String text(String field, String raw, int max) {
        if (raw == null) return null;
        String t = raw.strip();
        if (t.isEmpty()) return null;
        if (t.length() > max) throw OrgException.invalid(field, "at most " + max + " characters");
        if (t.chars().anyMatch(Character::isISOControl) || t.indexOf('<') >= 0 || t.indexOf('>') >= 0) throw OrgException.invalid(field, "contains characters that are not allowed");
        SensitiveContent.check(field, field, t);
        return t;
    }

    // ---- helpers ----------------------------------------------------------------------------------------------------------------

    private void event(CwsOffer o, String kind, String label, OrgMembership me, String detail, Instant at) {
        events.save(CwsOfferEvent.of(o, kind, label, at).by(CwsOfferEvent.BY_MEMBER, me.memberId(), detail));
    }

    /** Tells the consultant in their own notifications (the existing OFFER category); idempotent by key and honoring their preferences. */
    private void notify(CwsOffer o, String title, String body, String key) {
        notifications.push(o.getOrgId(), o.getConsultantId(), key, CwsNotification.OFFER, title, body, CwsNotification.HIGH, "View", ConsultantNotificationGenerator.PATH_OFFERS, "OFFER", o.getId());
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
            else if (v instanceof Number || v instanceof Boolean) sb.append(v);
            else sb.append('"').append(v.toString().replace("\\", "\\\\").replace("\"", "\\\"")).append('"');
        }
        return sb.append('}').toString();
    }
}
