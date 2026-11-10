package com.dossier.api.service.ent.consultantws;

import com.dossier.api.domain.ent.consultantws.CwsAvailabilityBlock;
import com.dossier.api.domain.ent.consultantws.CwsAvailabilityHistory;
import com.dossier.api.domain.ent.consultantws.CwsProfileDetail;
import com.dossier.api.domain.ent.consultantws.CwsProfilePref;
import com.dossier.api.domain.ent.consultantws.CwsWorkPreference;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.ent.talent.RequirementMatch;
import com.dossier.api.repository.ent.consultantws.CwsAvailabilityBlockRepository;
import com.dossier.api.repository.ent.consultantws.CwsAvailabilityHistoryRepository;
import com.dossier.api.repository.ent.consultantws.CwsProfileDetailRepository;
import com.dossier.api.repository.ent.consultantws.CwsProfilePrefRepository;
import com.dossier.api.repository.ent.consultantws.CwsWorkPreferenceRepository;
import com.dossier.api.repository.ent.talent.ConsultantProfileRepository;
import com.dossier.api.repository.ent.talent.RequirementMatchRepository;
import com.dossier.api.service.ent.consultantws.ConsultantAvailabilityDTO.Availability;
import com.dossier.api.service.ent.consultantws.ConsultantAvailabilityDTO.AvailableFromTile;
import com.dossier.api.service.ent.consultantws.ConsultantAvailabilityDTO.Block;
import com.dossier.api.service.ent.consultantws.ConsultantAvailabilityDTO.BlockRequest;
import com.dossier.api.service.ent.consultantws.ConsultantAvailabilityDTO.CountTile;
import com.dossier.api.service.ent.consultantws.ConsultantAvailabilityDTO.HistoryRow;
import com.dossier.api.service.ent.consultantws.ConsultantAvailabilityDTO.NoticeTile;
import com.dossier.api.service.ent.consultantws.ConsultantAvailabilityDTO.PreferenceRequest;
import com.dossier.api.service.ent.consultantws.ConsultantAvailabilityDTO.Preferences;
import com.dossier.api.service.ent.consultantws.ConsultantAvailabilityDTO.Response;
import com.dossier.api.service.ent.consultantws.ConsultantAvailabilityDTO.StatusRequest;
import com.dossier.api.service.ent.consultantws.ConsultantAvailabilityDTO.Tiles;
import com.dossier.api.service.ent.consultantws.ConsultantAvailabilityDTO.VacationTile;
import com.dossier.api.service.org.OrgException;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.format.DateTimeParseException;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The Consultant workspace Availability page (docs/enterprise-v2/page-consultant-availability.md). The gate is
 * {@link ConsultantHomeService#requireSelf} (Consultant role, own consultant_profile, else the generic 404); no method takes a consultant id
 * from the client and every row is looked up organization-first and then checked to belong to the caller (anything else is the same 404).
 * The status / available-from / since values live on consultant_profile (written like the Profile page writes them); locations, employment
 * types and work authorization are only READ from the Profile tables. Free text goes through the PII scanner. Nothing here is sent to anyone.
 */
@Service
public class ConsultantAvailabilityService {

    public static final List<String> WORK_MODES = List.of("HYBRID", "REMOTE", "ONSITE");
    public static final List<String> KINDS = List.of(CwsAvailabilityBlock.VACATION, CwsAvailabilityBlock.PERSONAL, CwsAvailabilityBlock.HOLIDAY, CwsAvailabilityBlock.AVAILABLE);
    public static final List<String> TRAVEL = List.of("NONE", "OCCASIONAL", "FREQUENT", "FULL");
    public static final String CODE_BLOCK_OVERLAP = "BLOCK_OVERLAP";

    static final int MAX_BLOCKS = 100;
    static final int MAX_SPAN_DAYS = 366;
    static final int MAX_NOTICE_WEEKS = 26;
    static final long MAX_RATE_MINOR = 1_000_000L; // $10,000 an hour; a sanity bound, not a market claim
    static final int REASON_MAX = 200;
    static final int NOTE_MAX = 120;
    static final int HISTORY_LIMIT = 50;
    static final int WEEKS = 6;

    private final ConsultantHomeService gate;
    private final ConsultantProfileRepository consultants;
    private final CwsAvailabilityBlockRepository blocks;
    private final CwsAvailabilityHistoryRepository history;
    private final CwsWorkPreferenceRepository workPrefs;
    private final CwsProfilePrefRepository profilePrefs;
    private final CwsProfileDetailRepository profileDetails;
    private final RequirementMatchRepository matches;
    private final Clock clock;

    @Autowired
    public ConsultantAvailabilityService(
        ConsultantHomeService gate,
        ConsultantProfileRepository consultants,
        CwsAvailabilityBlockRepository blocks,
        CwsAvailabilityHistoryRepository history,
        CwsWorkPreferenceRepository workPrefs,
        CwsProfilePrefRepository profilePrefs,
        CwsProfileDetailRepository profileDetails,
        RequirementMatchRepository matches
    ) {
        this(gate, consultants, blocks, history, workPrefs, profilePrefs, profileDetails, matches, Clock.systemUTC());
    }

    ConsultantAvailabilityService(
        ConsultantHomeService gate,
        ConsultantProfileRepository consultants,
        CwsAvailabilityBlockRepository blocks,
        CwsAvailabilityHistoryRepository history,
        CwsWorkPreferenceRepository workPrefs,
        CwsProfilePrefRepository profilePrefs,
        CwsProfileDetailRepository profileDetails,
        RequirementMatchRepository matches,
        Clock clock
    ) {
        this.gate = gate;
        this.consultants = consultants;
        this.blocks = blocks;
        this.history = history;
        this.workPrefs = workPrefs;
        this.profilePrefs = profilePrefs;
        this.profileDetails = profileDetails;
        this.matches = matches;
        this.clock = clock;
    }

    // ---- read -----------------------------------------------------------------------------------------------------

    @Transactional(readOnly = true)
    public Response page(OrgMembership me) {
        return view(gate.requireSelf(me));
    }

    // ---- writes (each answers with the fresh page) -----------------------------------------------------------------

    /**
     * Sets the availability the way the Profile page does (status, "since" = today) and also the date the consultant becomes available, then
     * appends a history row. Sending what is already current changes nothing in the history (idempotent).
     */
    @Transactional
    public Response setAvailability(OrgMembership me, StatusRequest body) {
        ConsultantProfile c = gate.requireSelf(me);
        LocalDate today = today();
        String status = body == null || body.status() == null ? "" : body.status().trim().toUpperCase(Locale.ROOT);
        if (!ConsultantProfileService.AVAILABILITY.contains(status)) throw OrgException.invalid("status", "must be one of " + String.join(", ", ConsultantProfileService.AVAILABILITY));
        LocalDate from = optionalDate("availableFrom", body.availableFrom());
        if (from != null && (from.isBefore(today) || from.isAfter(today.plusDays(730)))) throw OrgException.invalid("availableFrom", "must be between today and two years from now");

        c.setAvailabilityStatus(status);
        c.setAvailableFrom(from);
        c.setAvailabilitySince(today);
        c.setUpdatedAt(Instant.now(clock));
        consultants.save(c);

        List<CwsAvailabilityHistory> rows = history.findByOrgIdAndConsultantIdOrderByEffectiveDateDescIdDesc(c.getOrgId(), c.getId());
        CwsAvailabilityHistory latest = rows.isEmpty() ? null : rows.get(0);
        boolean same = latest != null && CwsAvailabilityHistory.ACTIVE.equals(latest.getStatus()) && status.equals(latest.getAvailabilityStatus()) && java.util.Objects.equals(from, latest.getAvailableFrom());
        if (!same) {
            for (CwsAvailabilityHistory r : rows) {
                if (CwsAvailabilityHistory.ACTIVE.equals(r.getStatus())) {
                    r.setStatus(CwsAvailabilityHistory.EXPIRED);
                    history.save(r);
                }
            }
            CwsAvailabilityHistory row = new CwsAvailabilityHistory();
            row.setOrgId(c.getOrgId());
            row.setConsultantId(c.getId());
            row.setEffectiveDate(today);
            row.setAvailabilityStatus(status);
            row.setAvailableFrom(from);
            row.setWorkMode(effectiveWorkMode(c, workPrefs.findByOrgIdAndConsultantId(c.getOrgId(), c.getId()).orElse(null)));
            row.setStatus(CwsAvailabilityHistory.ACTIVE);
            history.save(row);
        }
        return view(c);
    }

    @Transactional
    public Response addBlock(OrgMembership me, BlockRequest body) {
        ConsultantProfile c = gate.requireSelf(me);
        Parsed p = parse(body);
        if (blocks.countByOrgIdAndConsultantId(c.getOrgId(), c.getId()) >= MAX_BLOCKS) throw OrgException.invalid("kind", "at most " + MAX_BLOCKS + " calendar entries");
        checkOverlap(c, p, null);
        Instant now = Instant.now(clock);
        CwsAvailabilityBlock row = new CwsAvailabilityBlock();
        row.setOrgId(c.getOrgId());
        row.setConsultantId(c.getId());
        row.setKind(p.kind());
        row.setStartDate(p.start());
        row.setEndDate(p.end());
        row.setReason(p.reason());
        row.setStatus(statusFor(p.kind()));
        row.setCreatedAt(now);
        row.setUpdatedAt(now);
        blocks.save(row);
        return view(c);
    }

    /** A change of kind or dates goes through the approval rule again; a change of the reason alone keeps the status. */
    @Transactional
    public Response updateBlock(OrgMembership me, long id, BlockRequest body) {
        ConsultantProfile c = gate.requireSelf(me);
        CwsAvailabilityBlock row = own(c, id);
        Parsed p = parse(body);
        checkOverlap(c, p, row.getId());
        boolean moved = !p.kind().equals(row.getKind()) || !p.start().equals(row.getStartDate()) || !p.end().equals(row.getEndDate());
        row.setKind(p.kind());
        row.setStartDate(p.start());
        row.setEndDate(p.end());
        row.setReason(p.reason());
        if (moved) {
            row.setStatus(statusFor(p.kind()));
            row.setSampleData(false);
        }
        row.setUpdatedAt(Instant.now(clock));
        blocks.save(row);
        return view(c);
    }

    @Transactional
    public Response deleteBlock(OrgMembership me, long id) {
        ConsultantProfile c = gate.requireSelf(me);
        blocks.delete(own(c, id));
        return view(c);
    }

    /** Replaces the preferences kept here (work mode, notice period, rate range, travel). Null clears a field. */
    @Transactional
    public Response setPreferences(OrgMembership me, PreferenceRequest body) {
        ConsultantProfile c = gate.requireSelf(me);
        PreferenceRequest b = body == null ? new PreferenceRequest(null, null, null, null, null, null, null) : body;
        String mode = null;
        if (b.workMode() != null && !b.workMode().isBlank()) {
            mode = b.workMode().trim().toUpperCase(Locale.ROOT);
            if (!WORK_MODES.contains(mode)) throw OrgException.invalid("workMode", "must be one of " + String.join(", ", WORK_MODES));
        }
        Integer notice = b.noticeWeeks();
        if (notice != null && (notice < 0 || notice > MAX_NOTICE_WEEKS)) throw OrgException.invalid("noticeWeeks", "must be between 0 and " + MAX_NOTICE_WEEKS);
        Long min = b.rateMinMinor();
        Long max = b.rateMaxMinor();
        if (min != null && (min < 0 || min > MAX_RATE_MINOR)) throw OrgException.invalid("rateMinMinor", "must be between 0 and " + MAX_RATE_MINOR);
        if (max != null && (max < 0 || max > MAX_RATE_MINOR)) throw OrgException.invalid("rateMaxMinor", "must be between 0 and " + MAX_RATE_MINOR);
        if (min != null && max != null && min > max) throw OrgException.invalid("rateMinMinor", "must not be more than the maximum");
        String note = ConsultantProfileService.freeText("rateNote", b.rateNote(), NOTE_MAX, true);
        String travel = null;
        if (b.travelLabel() != null && !b.travelLabel().isBlank()) {
            travel = b.travelLabel().trim().toUpperCase(Locale.ROOT);
            if (!TRAVEL.contains(travel)) throw OrgException.invalid("travelLabel", "must be one of " + String.join(", ", TRAVEL));
        }
        Integer pct = b.travelPercent();
        if (pct != null && (pct < 0 || pct > 100)) throw OrgException.invalid("travelPercent", "must be between 0 and 100");
        if (travel == null && pct != null) throw OrgException.invalid("travelPercent", "needs a travel choice");
        if ("NONE".equals(travel)) {
            if (pct != null && pct != 0) throw OrgException.invalid("travelPercent", "must be 0 when you do not travel");
            pct = 0;
        }

        CwsWorkPreference row = workPrefs.findByOrgIdAndConsultantId(c.getOrgId(), c.getId()).orElseGet(() -> {
            CwsWorkPreference r = new CwsWorkPreference();
            r.setOrgId(c.getOrgId());
            r.setConsultantId(c.getId());
            return r;
        });
        row.setPreferredWorkMode(mode);
        row.setNoticeWeeks(notice);
        row.setRateMinMinor(min);
        row.setRateMaxMinor(max);
        row.setRateNote(note);
        row.setTravelLabel(travel);
        row.setTravelPercent(pct);
        row.setUpdatedAt(Instant.now(clock));
        workPrefs.save(row);
        return view(c);
    }

    // ---- helpers --------------------------------------------------------------------------------------------------

    private record Parsed(String kind, LocalDate start, LocalDate end, String reason) {}

    private LocalDate today() {
        return LocalDate.now(clock.withZone(ZoneOffset.UTC));
    }

    /** VACATION waits for the marketer's approval (a step that is not built yet); the other kinds are the consultant's own and stand as approved. */
    static String statusFor(String kind) {
        return CwsAvailabilityBlock.VACATION.equals(kind) ? CwsAvailabilityBlock.PENDING : CwsAvailabilityBlock.APPROVED;
    }

    private static LocalDate optionalDate(String field, String raw) {
        if (raw == null || raw.isBlank()) return null;
        try {
            return LocalDate.parse(raw.trim());
        } catch (DateTimeParseException e) {
            throw OrgException.invalid(field, "must be a date like 2026-11-21");
        }
    }

    private Parsed parse(BlockRequest body) {
        if (body == null) throw OrgException.invalid("kind", "is required");
        String kind = body.kind() == null ? "" : body.kind().trim().toUpperCase(Locale.ROOT);
        if (!KINDS.contains(kind)) throw OrgException.invalid("kind", "must be one of " + String.join(", ", KINDS));
        LocalDate start = optionalDate("startDate", body.startDate());
        if (start == null) throw OrgException.invalid("startDate", "is required");
        LocalDate end = optionalDate("endDate", body.endDate());
        if (end == null) end = start;
        if (end.isBefore(start)) throw OrgException.invalid("endDate", "must not be before the start date");
        LocalDate today = today();
        if (start.isBefore(today.minusDays(MAX_SPAN_DAYS)) || start.isAfter(today.plusDays(731))) throw OrgException.invalid("startDate", "must be within the last year or the next two years");
        if (ChronoUnit.DAYS.between(start, end) + 1 > MAX_SPAN_DAYS) throw OrgException.invalid("endDate", "a calendar entry can span at most " + MAX_SPAN_DAYS + " days");
        String reason = ConsultantProfileService.freeText("reason", body.reason(), REASON_MAX, true);
        return new Parsed(kind, start, end, reason);
    }

    /**
     * Two entries may not cover the same day, except two AVAILABLE ones (they only paint the calendar green). Applies to every kind, so
     * a vacation can never sit on top of a personal day or on top of a stretch marked available.
     */
    private void checkOverlap(ConsultantProfile c, Parsed p, Long ignoreId) {
        for (CwsAvailabilityBlock o : blocks.findByOrgIdAndConsultantIdOrderByStartDateAscIdAsc(c.getOrgId(), c.getId())) {
            if (ignoreId != null && ignoreId.equals(o.getId())) continue;
            if (CwsAvailabilityBlock.AVAILABLE.equals(p.kind()) && CwsAvailabilityBlock.AVAILABLE.equals(o.getKind())) continue;
            if (!p.start().isAfter(o.getEndDate()) && !p.end().isBefore(o.getStartDate())) {
                throw new OrgException(409, CODE_BLOCK_OVERLAP, "These dates overlap another entry on your calendar (" + o.getStartDate() + " to " + o.getEndDate() + ")", Map.of("field", "startDate"));
            }
        }
    }

    private CwsAvailabilityBlock own(ConsultantProfile c, long id) {
        return blocks.findByOrgIdAndId(c.getOrgId(), id).filter(b -> c.getId().equals(b.getConsultantId())).orElseThrow(OrgNotFoundException::new);
    }

    private static String normalizeMode(String raw) {
        if (raw == null) return null;
        String s = raw.trim().toUpperCase(Locale.ROOT).replace("-", "");
        return WORK_MODES.contains(s) ? s : null;
    }

    /** The work mode chosen on this page, else the one on the consultant's profile row (when it is one of the three). */
    private static String effectiveWorkMode(ConsultantProfile c, CwsWorkPreference pref) {
        String own = pref == null ? null : normalizeMode(pref.getPreferredWorkMode());
        return own != null ? own : normalizeMode(c.getWorkMode());
    }

    private static long overlapDays(LocalDate s, LocalDate e, LocalDate from, LocalDate to) {
        LocalDate a = s.isAfter(from) ? s : from;
        LocalDate b = e.isBefore(to) ? e : to;
        return b.isBefore(a) ? 0 : ChronoUnit.DAYS.between(a, b) + 1;
    }

    private Response view(ConsultantProfile c) {
        Long org = c.getOrgId();
        Instant now = Instant.now(clock);
        LocalDate today = today();
        List<CwsAvailabilityBlock> mine = blocks.findByOrgIdAndConsultantIdOrderByStartDateAscIdAsc(org, c.getId());
        CwsWorkPreference pref = workPrefs.findByOrgIdAndConsultantId(org, c.getId()).orElse(null);
        List<CwsProfilePref> prefRows = profilePrefs.findByOrgIdAndConsultantIdOrderByKindAscSortOrderAscIdAsc(org, c.getId());
        Optional<CwsProfileDetail> detail = profileDetails.findByOrgIdAndConsultantId(org, c.getId());

        String mode = effectiveWorkMode(c, pref);
        List<String> locations = prefRows.stream().filter(p -> ConsultantProfileService.LOCATION.equals(p.getKind())).map(CwsProfilePref::getValue).toList();
        List<String> types = prefRows.stream().filter(p -> ConsultantProfileService.EMPLOYMENT_TYPE.equals(p.getKind())).map(CwsProfilePref::getValue).toList();
        String auth = detail.map(CwsProfileDetail::getWorkAuthorization).orElse(null);

        Preferences prefs = new Preferences(
            locations,
            auth,
            mode,
            types,
            pref == null ? null : pref.getRateMinMinor(),
            pref == null ? null : pref.getRateMaxMinor(),
            pref == null ? null : pref.getRateNote(),
            pref == null ? null : pref.getTravelLabel(),
            pref == null ? null : pref.getTravelPercent(),
            pref == null ? null : pref.getNoticeWeeks()
        );

        LocalDate from = c.getAvailableFrom();
        Integer daysFromNow = from == null ? null : (int) Math.max(0, ChronoUnit.DAYS.between(today, from));
        LocalDate noticeOn = from;
        int year = today.getYear();
        LocalDate y0 = LocalDate.of(year, 1, 1);
        LocalDate y1 = LocalDate.of(year, 12, 31);
        LocalDate fromToday = today.isAfter(y0) ? today : y0;
        long approved = 0;
        long scheduled = 0;
        long pending = 0;
        for (CwsAvailabilityBlock b : mine) {
            if (!CwsAvailabilityBlock.VACATION.equals(b.getKind())) continue;
            if (CwsAvailabilityBlock.APPROVED.equals(b.getStatus())) {
                approved += overlapDays(b.getStartDate(), b.getEndDate(), y0, y1);
                scheduled += overlapDays(b.getStartDate(), b.getEndDate(), fromToday, y1);
            } else pending += overlapDays(b.getStartDate(), b.getEndDate(), y0, y1);
        }

        Tiles tiles = new Tiles(
            new AvailableFromTile(c.getAvailabilityStatus(), from, daysFromNow),
            openOpportunities(c, now),
            mode,
            new NoticeTile(pref == null ? null : pref.getNoticeWeeks(), noticeOn),
            new VacationTile(year, approved, scheduled, pending)
        );

        List<Block> blockRows = mine.stream()
            .map(b -> new Block(b.getId(), b.getKind(), b.getStartDate(), b.getEndDate(), ChronoUnit.DAYS.between(b.getStartDate(), b.getEndDate()) + 1, b.getReason(), b.getStatus(), b.isSampleData()))
            .toList();
        List<HistoryRow> historyRows = history.findByOrgIdAndConsultantIdOrderByEffectiveDateDescIdDesc(org, c.getId()).stream()
            .limit(HISTORY_LIMIT)
            .map(h -> new HistoryRow(h.getId(), h.getEffectiveDate(), h.getAvailabilityStatus(), h.getAvailableFrom(), h.getWorkMode(), h.getStatus(), h.isSampleData()))
            .toList();

        return new Response(
            org,
            now,
            today,
            c.getDisplayName(),
            new Availability(c.getAvailabilityStatus(), c.getAvailabilitySince(), from),
            tiles,
            prefs,
            blockRows,
            historyRows
        );
    }

    /** The consultant's own matches that are still open (not dismissed), against the ones that already existed 30 days ago. No delta when there were none. */
    private CountTile openOpportunities(ConsultantProfile c, Instant now) {
        List<Instant> stamps = new ArrayList<>();
        for (RequirementMatch m : matches.findByOrgIdAndConsultantIdOrderByScoreDesc(c.getOrgId(), c.getId())) {
            if (!"DISMISSED".equals(m.getStatus())) stamps.add(m.getCreatedAt());
        }
        Instant monthAgo = now.minus(Duration.ofDays(30));
        long value = stamps.size();
        long previous = stamps.stream().filter(t -> t != null && !t.isAfter(monthAgo)).count();
        Double delta = previous == 0 ? null : Math.round(((value - previous) * 1000.0) / previous) / 10.0;
        List<Long> spark = new ArrayList<>();
        for (int w = WEEKS - 1; w >= 0; w--) {
            Instant at = now.minus(Duration.ofDays(7L * w));
            spark.add(stamps.stream().filter(t -> t != null && !t.isAfter(at)).count());
        }
        return new CountTile(value, previous, delta, spark);
    }
}
