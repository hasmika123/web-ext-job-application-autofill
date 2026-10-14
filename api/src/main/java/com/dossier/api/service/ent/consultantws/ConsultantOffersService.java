package com.dossier.api.service.ent.consultantws;

import com.dossier.api.domain.ent.consultantws.CwsOffer;
import com.dossier.api.domain.ent.consultantws.CwsOfferEvent;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.repository.ent.consultantws.CwsOfferEventRepository;
import com.dossier.api.repository.ent.consultantws.CwsOfferRepository;
import com.dossier.api.service.TrackerException;
import com.dossier.api.service.ent.authz.AuthorizationService;
import com.dossier.api.service.ent.authz.AuthzOperation;
import com.dossier.api.service.ent.authz.AuthzRequest;
import com.dossier.api.service.ent.authz.Beneficiary;
import com.dossier.api.service.ent.consultantws.ConsultantOffersDTO.Activity;
import com.dossier.api.service.ent.consultantws.ConsultantOffersDTO.Decision;
import com.dossier.api.service.ent.consultantws.ConsultantOffersDTO.Detail;
import com.dossier.api.service.ent.consultantws.ConsultantOffersDTO.Event;
import com.dossier.api.service.ent.consultantws.ConsultantOffersDTO.OfferPage;
import com.dossier.api.service.ent.consultantws.ConsultantOffersDTO.Response;
import com.dossier.api.service.ent.consultantws.ConsultantOffersDTO.Row;
import com.dossier.api.service.ent.consultantws.ConsultantOffersDTO.Tile;
import com.dossier.api.service.ent.consultantws.ConsultantOffersDTO.Tiles;
import com.dossier.api.service.org.OrgException;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import com.dossier.api.service.privacy.SensitiveContent;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The Consultant workspace Offers page (docs/enterprise-v2/page-consultant-offers.md). The gate is {@link ConsultantHomeService#requireSelf}
 * (Consultant role, own consultant_profile, else the generic 404); accepting, declining and negotiating also need {@code offers.respond}.
 * Every query is organization id first plus the caller's own consultant id, so another consultant's offer (or another tenant's) is the same 404.
 * Money is a record in minor units; nothing here moves money, signs anything or tells a client anything, and accepting does NOT create a
 * placement (that hand-off belongs to the employer / ops side).
 */
@Service
public class ConsultantOffersService {

    public static final String RESPOND_PERMISSION = "offers.respond";
    public static final String CODE_NOT_OPEN = "OFFER_NOT_OPEN";
    public static final String CODE_EXPIRED = "OFFER_EXPIRED";
    static final int MIN_NOTE = 3;
    static final int MAX_NOTE = 300;
    static final int MAX_QUERY = 80;
    static final int DEFAULT_PAGE_SIZE = 10;
    static final int MAX_PAGE_SIZE = 50;
    static final int ACTIVITY_LIMIT = 8;
    static final int WEEKS = 6;

    static final Set<String> STATUSES = new LinkedHashSet<>(
        List.of(CwsOffer.PENDING_REVIEW, CwsOffer.NEGOTIATION, CwsOffer.ACCEPTED, CwsOffer.DECLINED, CwsOffer.EXPIRED)
    );
    static final Set<String> WORK_MODES = Set.of("REMOTE", "HYBRID", "ONSITE");
    static final Set<String> SORTS = Set.of("recent", "deadline", "company", "start");
    private static final List<String> OPEN = List.of(CwsOffer.PENDING_REVIEW, CwsOffer.NEGOTIATION);

    private final ConsultantHomeService gate;
    private final AuthorizationService authorization;
    private final CwsOfferRepository offers;
    private final CwsOfferEventRepository events;
    private final Clock clock;

    @Autowired
    public ConsultantOffersService(ConsultantHomeService gate, AuthorizationService authorization, CwsOfferRepository offers, CwsOfferEventRepository events) {
        this(gate, authorization, offers, events, Clock.systemUTC());
    }

    ConsultantOffersService(ConsultantHomeService gate, AuthorizationService authorization, CwsOfferRepository offers, CwsOfferEventRepository events, Clock clock) {
        this.gate = gate;
        this.authorization = authorization;
        this.offers = offers;
        this.events = events;
        this.clock = clock;
    }

    // ---- the page -------------------------------------------------------------------------------------------------

    @Transactional(readOnly = true)
    public Response page(OrgMembership me, String status, String company, String workMode, String q, String sort, Integer page, Integer size) {
        ConsultantProfile c = gate.requireSelf(me);
        Long org = c.getOrgId();
        Instant now = Instant.now(clock);
        LocalDate today = today();

        List<CwsOffer> all = offers.findByOrgIdAndConsultantId(org, c.getId());
        List<CwsOffer> newestFirst = all.stream().sorted(Comparator.comparing(CwsOffer::getCreatedAt).reversed().thenComparing(CwsOffer::getId, Comparator.reverseOrder())).toList();
        List<Row> compare = newestFirst.stream().limit(MAX_PAGE_SIZE).map(o -> row(o, today)).toList();
        List<String> companies = all.stream().map(CwsOffer::getClientName).distinct().sorted(String.CASE_INSENSITIVE_ORDER).toList();
        return new Response(org, now, c.getDisplayName(), tiles(all, today, now), search(c, status, company, workMode, q, sort, page, size), compare, activity(c), companies);
    }

    /** The offers table only (the filters, the search box and the pager call this). */
    @Transactional(readOnly = true)
    public OfferPage list(OrgMembership me, String status, String company, String workMode, String q, String sort, Integer page, Integer size) {
        return search(gate.requireSelf(me), status, company, workMode, q, sort, page, size);
    }

    private OfferPage search(ConsultantProfile c, String status, String company, String workMode, String q, String sort, Integer page, Integer size) {
        String st = status == null || status.isBlank() ? "" : status.strip().toUpperCase(Locale.ROOT);
        if (!st.isEmpty() && !STATUSES.contains(st)) throw TrackerException.invalid("status", "is not an offer status");
        String wm = workMode == null || workMode.isBlank() ? "" : workMode.strip().toUpperCase(Locale.ROOT);
        if (!wm.isEmpty() && !WORK_MODES.contains(wm)) throw TrackerException.invalid("workMode", "must be REMOTE, HYBRID or ONSITE");
        String co = company == null ? "" : company.strip();
        if (co.length() > 160) throw TrackerException.invalid("company", "is too long");
        String text = q == null ? "" : q.strip().toLowerCase(Locale.ROOT).replace("%", "").replace("_", "");
        if (text.length() > MAX_QUERY) throw TrackerException.invalid("q", "must be " + MAX_QUERY + " characters or fewer");
        String so = sort == null || sort.isBlank() ? "recent" : sort.strip().toLowerCase(Locale.ROOT);
        if (!SORTS.contains(so)) throw TrackerException.invalid("sort", "must be recent, deadline, company or start");
        int p = page == null ? 0 : page;
        int s = size == null ? DEFAULT_PAGE_SIZE : size;
        if (p < 0) throw TrackerException.invalid("page", "must be 0 or more");
        if (s < 1 || s > MAX_PAGE_SIZE) throw TrackerException.invalid("size", "must be between 1 and " + MAX_PAGE_SIZE);

        Sort order = switch (so) {
            case "deadline" -> Sort.by(Sort.Order.asc("offerDeadline").nullsLast(), Sort.Order.asc("id"));
            case "company" -> Sort.by(Sort.Order.asc("clientName"), Sort.Order.asc("id"));
            case "start" -> Sort.by(Sort.Order.asc("startDate").nullsLast(), Sort.Order.asc("id"));
            default -> Sort.by(Sort.Order.desc("createdAt"), Sort.Order.desc("id"));
        };
        LocalDate today = today();
        Page<CwsOffer> found = offers.search(c.getOrgId(), c.getId(), st, co, wm, text.isEmpty() ? "" : "%" + text + "%", today, PageRequest.of(p, s, order));
        return new OfferPage(found.getContent().stream().map(o -> row(o, today)).toList(), found.getNumber(), found.getSize(), found.getTotalElements(), found.getTotalPages());
    }

    private List<Activity> activity(ConsultantProfile c) {
        List<CwsOfferEvent> list =events.findByOrgIdAndConsultantIdOrderByOccurredAtDescIdDesc(c.getOrgId(), c.getId(), PageRequest.of(0, ACTIVITY_LIMIT));
        if (list.isEmpty()) return List.of();
        Map<Long, CwsOffer> byId = new java.util.HashMap<>();
        for (CwsOffer o : offers.findByOrgIdAndConsultantId(c.getOrgId(), c.getId())) byId.put(o.getId(), o);
        List<Activity> out = new ArrayList<>();
        for (CwsOfferEvent e : list) {
            CwsOffer o = byId.get(e.getOfferId());
            if (o != null) out.add(new Activity(o.getId(), e.getKind(), e.getLabel(), o.getClientName(), o.getRoleTitle(), e.getOccurredAt()));
        }
        return out;
    }

    // ---- the tiles ------------------------------------------------------------------------------------------------

    /**
     * Total, Pending Review, Accepted, Negotiation and Declined, all by EFFECTIVE status (an open offer past its deadline is Expired and counted
     * in none of the four status tiles). Each delta compares the value now with how many of those same offers already existed (were created)
     * more than 30 days ago; there is no delta when that earlier count is zero.
     */
    static Tiles tiles(List<CwsOffer> all, LocalDate today, Instant now) {
        return new Tiles(
            tile(all, o -> true, now),
            tile(all, o -> CwsOffer.PENDING_REVIEW.equals(effective(o, today)), now),
            tile(all, o -> CwsOffer.ACCEPTED.equals(effective(o, today)), now),
            tile(all, o -> CwsOffer.NEGOTIATION.equals(effective(o, today)), now),
            tile(all, o -> CwsOffer.DECLINED.equals(effective(o, today)), now)
        );
    }

    private static Tile tile(List<CwsOffer> all, java.util.function.Predicate<CwsOffer> in, Instant now) {
        List<Instant> stamps = all.stream().filter(in).map(CwsOffer::getCreatedAt).toList();
        long value = stamps.size();
        Instant before = now.minus(Duration.ofDays(30));
        long previous = stamps.stream().filter(t -> t.isBefore(before)).count();
        Double delta = previous == 0 ? null : Math.round(((value - previous) * 1000.0) / previous) / 10.0;
        List<Long> spark = new ArrayList<>();
        for (int w = WEEKS - 1; w >= 0; w--) {
            Instant at = now.minus(Duration.ofDays(7L * w));
            spark.add(stamps.stream().filter(t -> !t.isAfter(at)).count());
        }
        return new Tile(value, previous, delta, spark, "month");
    }

    /** The status the consultant sees: an open offer whose deadline day has passed is EXPIRED. */
    static String effective(CwsOffer o, LocalDate today) {
        return isOpen(o.getStatus()) && o.getOfferDeadline() != null && o.getOfferDeadline().isBefore(today) ? CwsOffer.EXPIRED : o.getStatus();
    }

    private static boolean isOpen(String status) {
        return OPEN.contains(status);
    }

    // ---- one offer ------------------------------------------------------------------------------------------------

    @Transactional(readOnly = true)
    public Detail detail(OrgMembership me, long id) {
        ConsultantProfile c = gate.requireSelf(me);
        LocalDate today = today();
        CwsOffer o = own(c.getOrgId(), c.getId(), id);
        List<Event> timeline = events.findByOrgIdAndConsultantIdAndOfferIdOrderByOccurredAtDescIdDesc(c.getOrgId(), c.getId(), o.getId()).stream()
            .map(e -> new Event(e.getKind(), e.getLabel(), e.getOccurredAt()))
            .toList();
        String eff = effective(o, today);
        return new Detail(row(o, today), o.getBenefitsSummary(), o.getResponseNote(), timeline, isOpen(eff), CwsOffer.PENDING_REVIEW.equals(eff));
    }

    // ---- the three responses --------------------------------------------------------------------------------------

    /** Accepts an open offer (pending review or negotiation) that is still before its deadline. Records the consultant's answer only. */
    @Transactional
    public Decision accept(OrgMembership me, long id) {
        ConsultantProfile c = requireResponder(me);
        return respond(c, id, OPEN, CwsOffer.ACCEPTED, null, CwsOfferEvent.ACCEPTED, "Offer accepted");
    }

    /** Declines an open offer; the reason is optional (0 to 300 characters, scanned for sensitive data). */
    @Transactional
    public Decision decline(OrgMembership me, long id, String reason) {
        ConsultantProfile c = requireResponder(me);
        String clean = cleanNote("reason", reason, 0);
        return respond(c, id, OPEN, CwsOffer.DECLINED, clean, CwsOfferEvent.DECLINED, "Offer declined");
    }

    /** Asks to negotiate an offer still pending review; the note (3 to 300 characters, scanned) says what the consultant wants to discuss. */
    @Transactional
    public Decision negotiate(OrgMembership me, long id, String note) {
        ConsultantProfile c = requireResponder(me);
        String clean = cleanNote("note", note, MIN_NOTE);
        return respond(c, id, List.of(CwsOffer.PENDING_REVIEW), CwsOffer.NEGOTIATION, clean, CwsOfferEvent.NEGOTIATING, "Negotiation requested");
    }

    private Decision respond(ConsultantProfile c, long id, List<String> from, String to, String note, String kind, String label) {
        Long org = c.getOrgId();
        LocalDate today = today();
        CwsOffer current = own(org, c.getId(), id);
        refuseIfClosed(current, from, today);
        Instant now = Instant.now(clock);
        String stored = note != null ? note : current.getResponseNote();
        int moved = offers.transition(org, c.getId(), id, from, to, now, stored, today);
        if (moved == 0) {
            refuseIfClosed(own(org, c.getId(), id), from, today);
            throw OrgException.coded(409, CODE_NOT_OPEN, "This offer can no longer be changed.", Map.of());
        }
        events.save(CwsOfferEvent.of(current, kind, label, now));
        return new Decision(id, to, now);
    }

    /** Throws the 409 for an offer that cannot take this response: past its deadline, or not in a state the response starts from. */
    private static void refuseIfClosed(CwsOffer o, List<String> from, LocalDate today) {
        String eff = effective(o, today);
        if (CwsOffer.EXPIRED.equals(eff)) {
            throw OrgException.coded(409, CODE_EXPIRED, "This offer's deadline has passed, so it can no longer be answered here. Ask your marketer.", Map.of("status", CwsOffer.EXPIRED));
        }
        if (!from.contains(o.getStatus())) {
            throw OrgException.coded(409, CODE_NOT_OPEN, notOpenMessage(o.getStatus()), Map.of("status", o.getStatus()));
        }
    }

    static String notOpenMessage(String status) {
        return switch (status) {
            case CwsOffer.ACCEPTED -> "You already accepted this offer.";
            case CwsOffer.DECLINED -> "You already declined this offer.";
            case CwsOffer.NEGOTIATION -> "You already asked to negotiate this offer.";
            default -> "This offer is no longer open for a response.";
        };
    }

    /** A trimmed, screened free-text answer; blank is allowed (null) only when {@code min} is 0. */
    static String cleanNote(String field, String raw, int min) {
        String v = raw == null ? "" : raw.strip();
        if (v.isEmpty() && min == 0) return null;
        if (v.length() < min || v.length() > MAX_NOTE) throw TrackerException.invalid(field, "must be " + (min == 0 ? "0" : String.valueOf(min)) + " to " + MAX_NOTE + " characters");
        SensitiveContent.check(field, field, v);
        return v;
    }

    // ---- helpers --------------------------------------------------------------------------------------------------

    /** The read gate plus {@code offers.respond}. */
    private ConsultantProfile requireResponder(OrgMembership me) {
        ConsultantProfile c = gate.requireSelf(me);
        authorization.require(AuthzRequest.of(me.orgId(), List.of(RESPOND_PERMISSION), Beneficiary.SELF, null, AuthzOperation.WRITE).withActor(me));
        return c;
    }

    private CwsOffer own(Long org, Long consultantId, long id) {
        return offers.findByOrgIdAndConsultantIdAndId(org, consultantId, id).orElseThrow(OrgNotFoundException::new);
    }

    private LocalDate today() {
        return LocalDate.now(clock.withZone(ZoneOffset.UTC));
    }

    private Row row(CwsOffer o, LocalDate today) {
        String eff = effective(o, today);
        Long daysLeft = isOpen(eff) && o.getOfferDeadline() != null ? ChronoUnit.DAYS.between(today, o.getOfferDeadline()) : null;
        return new Row(
            o.getId(), o.getClientName(), o.getRoleTitle(), o.getPackageSummary(), o.getWorkMode(), o.getStartDate(), o.getOfferDeadline(), daysLeft, eff,
            o.getBaseSalaryMinor(), o.getTotalCompMinor(), o.getCurrency(), o.getRespondedAt(), o.getCreatedAt(), o.isSampleData()
        );
    }
}
