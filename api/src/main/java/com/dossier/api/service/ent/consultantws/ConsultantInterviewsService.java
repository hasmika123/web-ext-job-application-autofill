package com.dossier.api.service.ent.consultantws;

import com.dossier.api.domain.ent.consultantws.CwsInterviewDetail;
import com.dossier.api.domain.ent.consultantws.CwsInterviewFeedback;
import com.dossier.api.domain.ent.talent.ClientAccount;
import com.dossier.api.domain.ent.talent.ClientRequirement;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.ent.talent.TalentApplication;
import com.dossier.api.domain.ent.talent.TalentInterview;
import com.dossier.api.repository.ent.consultantws.CwsInterviewDetailRepository;
import com.dossier.api.repository.ent.consultantws.CwsInterviewFeedbackRepository;
import com.dossier.api.repository.ent.consultantws.CwsInterviewRepository;
import com.dossier.api.repository.ent.talent.ClientAccountRepository;
import com.dossier.api.repository.ent.talent.ClientRequirementRepository;
import com.dossier.api.repository.ent.talent.TalentApplicationRepository;
import com.dossier.api.service.TrackerException;
import com.dossier.api.service.ent.authz.AuthorizationService;
import com.dossier.api.service.ent.authz.AuthzOperation;
import com.dossier.api.service.ent.authz.AuthzRequest;
import com.dossier.api.service.ent.authz.Beneficiary;
import com.dossier.api.service.ent.consultantws.ConsultantInterviewsDTO.CalendarEntry;
import com.dossier.api.service.ent.consultantws.ConsultantInterviewsDTO.Detail;
import com.dossier.api.service.ent.consultantws.ConsultantInterviewsDTO.DetailRequest;
import com.dossier.api.service.ent.consultantws.ConsultantInterviewsDTO.FeedbackRequest;
import com.dossier.api.service.ent.consultantws.ConsultantInterviewsDTO.FeedbackRow;
import com.dossier.api.service.ent.consultantws.ConsultantInterviewsDTO.InterviewRow;
import com.dossier.api.service.ent.consultantws.ConsultantInterviewsDTO.PendingFeedback;
import com.dossier.api.service.ent.consultantws.ConsultantInterviewsDTO.Response;
import com.dossier.api.service.ent.consultantws.ConsultantInterviewsDTO.Tile;
import com.dossier.api.service.ent.consultantws.ConsultantInterviewsDTO.Tiles;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import com.dossier.api.service.privacy.SensitiveContent;
import java.net.URI;
import java.net.URISyntaxException;
import java.time.Clock;
import java.time.DayOfWeek;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.function.Predicate;
import java.util.stream.Collectors;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The Consultant workspace Interviews page (docs/enterprise-v2/page-consultant-interviews.md). The gate is {@link ConsultantHomeService#requireSelf}
 * (Consultant role, own consultant_profile, else the generic 404); a write also needs {@code interviews.manage}. Every query is organization id first
 * plus the caller's own consultant id, and an interview id that is not one of the caller's own is the same 404, never a 403. Interviews themselves are
 * never created, moved or cancelled here: the consultant only adds how they join (mode, link, interviewer title, prep note) and what they heard after.
 */
@Service
public class ConsultantInterviewsService {

    public static final String WRITE_PERMISSION = "interviews.manage";
    static final int MAX_URL = 500;
    static final int MAX_TITLE = 120;
    static final int MAX_NOTE = 2000;
    static final int MAX_SUMMARY = 1000;
    static final Set<String> MODES = Set.of("VIDEO", "ONSITE", "PHONE");
    static final Set<String> OUTCOMES = Set.of("POSITIVE", "NEUTRAL", "NEGATIVE");
    private static final int WEEKS = 6;
    private static final int RECENT_FEEDBACK = 5;
    private static final int PENDING_LIMIT = 5;
    private static final int MAX_CALENDAR = 600;

    private final ConsultantHomeService gate;
    private final AuthorizationService authorization;
    private final CwsInterviewRepository interviews;
    private final CwsInterviewDetailRepository details;
    private final CwsInterviewFeedbackRepository feedback;
    private final TalentApplicationRepository applications;
    private final ClientRequirementRepository requirements;
    private final ClientAccountRepository clients;
    private final Clock clock;

    @Autowired
    public ConsultantInterviewsService(
        ConsultantHomeService gate,
        AuthorizationService authorization,
        CwsInterviewRepository interviews,
        CwsInterviewDetailRepository details,
        CwsInterviewFeedbackRepository feedback,
        TalentApplicationRepository applications,
        ClientRequirementRepository requirements,
        ClientAccountRepository clients
    ) {
        this(gate, authorization, interviews, details, feedback, applications, requirements, clients, Clock.systemUTC());
    }

    ConsultantInterviewsService(
        ConsultantHomeService gate,
        AuthorizationService authorization,
        CwsInterviewRepository interviews,
        CwsInterviewDetailRepository details,
        CwsInterviewFeedbackRepository feedback,
        TalentApplicationRepository applications,
        ClientRequirementRepository requirements,
        ClientAccountRepository clients,
        Clock clock
    ) {
        this.gate = gate;
        this.authorization = authorization;
        this.interviews = interviews;
        this.details = details;
        this.feedback = feedback;
        this.applications = applications;
        this.requirements = requirements;
        this.clients = clients;
        this.clock = clock;
    }

    // ---- the page -------------------------------------------------------------------------------------------------

    @Transactional(readOnly = true)
    public Response page(OrgMembership me) {
        ConsultantProfile c = gate.requireSelf(me);
        Ctx x = load(c);
        Instant now = x.now;

        List<InterviewRow> upcoming = x.mine.stream().filter(i -> isUpcoming(i, now)).map(i -> row(x, i)).toList();

        List<CalendarEntry> calendar = x.mine.stream()
            .filter(i -> !"CANCELLED".equals(i.getStatus()))
            .sorted(Comparator.comparing(TalentInterview::getScheduledAt).reversed())
            .limit(MAX_CALENDAR)
            .sorted(Comparator.comparing(TalentInterview::getScheduledAt))
            .map(i -> new CalendarEntry(i.getId(), i.getScheduledAt(), calendarState(i, now), x.title(i), x.company(i)))
            .toList();

        List<FeedbackRow> recent = x.mine.stream()
            .filter(i -> x.feedback.containsKey(i.getId()))
            .sorted(Comparator.comparing(TalentInterview::getScheduledAt).reversed())
            .limit(RECENT_FEEDBACK)
            .map(i -> feedbackRow(x, i, x.feedback.get(i.getId())))
            .toList();

        List<PendingFeedback> pending = x.mine.stream()
            .filter(i -> "COMPLETED".equals(i.getStatus()) && !x.feedback.containsKey(i.getId()))
            .sorted(Comparator.comparing(TalentInterview::getScheduledAt).reversed())
            .limit(PENDING_LIMIT)
            .map(i -> new PendingFeedback(i.getId(), x.title(i), x.company(i), i.getScheduledAt()))
            .toList();

        return new Response(c.getOrgId(), now, c.getDisplayName(), tiles(x), upcoming, calendar, recent, pending);
    }

    @Transactional(readOnly = true)
    public Detail detail(OrgMembership me, long interviewId) {
        ConsultantProfile c = gate.requireSelf(me);
        Ctx x = load(c);
        return detailOf(x, own(x, interviewId));
    }

    // ---- writes ---------------------------------------------------------------------------------------------------

    /** Replaces mode, meeting link, interviewer title and prep note of one of the caller's own SCHEDULED interviews. */
    @Transactional
    public Detail saveDetail(OrgMembership me, long interviewId, DetailRequest req) {
        ConsultantProfile c = requireWriter(me);
        Ctx x = load(c);
        TalentInterview iv = own(x, interviewId);
        if (!"SCHEDULED".equals(iv.getStatus())) throw TrackerException.invalid("interview", "can only be changed while it is scheduled");
        DetailRequest r = req == null ? new DetailRequest(null, null, null, null) : req;
        String mode = cleanMode(r.mode());
        String url = cleanUrl(r.meetingUrl());
        String title = cleanText("interviewerTitle", r.interviewerTitle(), MAX_TITLE);
        String note = cleanText("prepNote", r.prepNote(), MAX_NOTE);

        CwsInterviewDetail row = x.details.get(iv.getId());
        if (row == null) {
            if (mode == null && url == null && title == null && note == null) return detailOf(x, iv); // nothing to clear, nothing to store
            row = new CwsInterviewDetail();
            row.setOrgId(c.getOrgId());
            row.setInterviewId(iv.getId());
            row.setConsultantId(c.getId());
            row.setCreatedAt(Instant.now(clock));
        }
        row.setMode(mode);
        row.setMeetingUrl(url);
        row.setInterviewerTitle(title);
        row.setPrepNote(note);
        row.setUpdatedAt(Instant.now(clock));
        row = details.saveAndFlush(row);
        x.details.put(iv.getId(), row);
        return detailOf(x, iv);
    }

    /** Records what the consultant heard after one of their own COMPLETED interviews (once; edit it afterwards). */
    @Transactional
    public Detail addFeedback(OrgMembership me, long interviewId, FeedbackRequest req) {
        ConsultantProfile c = requireWriter(me);
        Ctx x = load(c);
        TalentInterview iv = own(x, interviewId);
        requireCompleted(iv);
        FeedbackRequest r = req == null ? new FeedbackRequest(null, null) : req;
        String outcome = cleanOutcome(r.outcome());
        String summary = cleanSummary(r.summary());
        if (x.feedback.containsKey(iv.getId())) throw TrackerException.invalid("feedback", "is already recorded for this interview; edit it instead");
        CwsInterviewFeedback row = new CwsInterviewFeedback();
        row.setOrgId(c.getOrgId());
        row.setInterviewId(iv.getId());
        row.setConsultantId(c.getId());
        row.setOutcome(outcome);
        row.setSummary(summary);
        row.setCreatedAt(Instant.now(clock));
        row.setUpdatedAt(row.getCreatedAt());
        x.feedback.put(iv.getId(), feedback.saveAndFlush(row));
        return detailOf(x, iv);
    }

    @Transactional
    public Detail editFeedback(OrgMembership me, long interviewId, FeedbackRequest req) {
        ConsultantProfile c = requireWriter(me);
        Ctx x = load(c);
        TalentInterview iv = own(x, interviewId);
        requireCompleted(iv);
        FeedbackRequest r = req == null ? new FeedbackRequest(null, null) : req;
        String outcome = cleanOutcome(r.outcome());
        String summary = cleanSummary(r.summary());
        CwsInterviewFeedback row = x.feedback.get(iv.getId());
        if (row == null) throw TrackerException.invalid("feedback", "has not been recorded for this interview yet");
        row.setOutcome(outcome);
        row.setSummary(summary);
        row.setUpdatedAt(Instant.now(clock));
        x.feedback.put(iv.getId(), feedback.saveAndFlush(row));
        return detailOf(x, iv);
    }

    private ConsultantProfile requireWriter(OrgMembership me) {
        ConsultantProfile c = gate.requireSelf(me);
        authorization.require(AuthzRequest.of(me.orgId(), List.of(WRITE_PERMISSION), Beneficiary.SELF, null, AuthzOperation.WRITE).withActor(me));
        return c;
    }

    private static void requireCompleted(TalentInterview iv) {
        if (!"COMPLETED".equals(iv.getStatus())) throw TrackerException.invalid("interview", "feedback can only be recorded for a completed interview");
    }

    // ---- validation -----------------------------------------------------------------------------------------------

    static String cleanMode(String raw) {
        if (raw == null || raw.isBlank()) return null;
        String v = raw.trim().toUpperCase(Locale.ROOT);
        if (!MODES.contains(v)) throw TrackerException.invalid("mode", "must be VIDEO, ONSITE or PHONE");
        return v;
    }

    /** An https link only, no credentials in it, at most 500 characters; blank clears it. */
    static String cleanUrl(String raw) {
        if (raw == null || raw.isBlank()) return null;
        String v = raw.trim();
        if (v.length() > MAX_URL) throw TrackerException.invalid("meetingUrl", "is longer than " + MAX_URL + " characters");
        if (v.chars().anyMatch(ch -> Character.isWhitespace(ch) || Character.isISOControl(ch))) throw TrackerException.invalid("meetingUrl", "must be a single link without spaces");
        URI u;
        try {
            u = new URI(v);
        } catch (URISyntaxException e) {
            throw TrackerException.invalid("meetingUrl", "is not a valid link");
        }
        if (u.getScheme() == null || !"https".equalsIgnoreCase(u.getScheme())) throw TrackerException.invalid("meetingUrl", "must start with https://");
        if (u.getHost() == null || u.getHost().isBlank() || !u.getHost().contains(".")) throw TrackerException.invalid("meetingUrl", "is not a valid link");
        if (u.getUserInfo() != null) throw TrackerException.invalid("meetingUrl", "must not contain a user name or password");
        SensitiveContent.check("meetingUrl", "meetingUrl", v);
        return v;
    }

    private static String cleanText(String field, String raw, int max) {
        if (raw == null) return null;
        String v = raw.trim();
        if (v.isEmpty()) return null;
        if (v.length() > max) throw TrackerException.invalid(field, "is longer than " + max + " characters");
        SensitiveContent.check(field, field, v);
        return v;
    }

    private static String cleanOutcome(String raw) {
        String v = raw == null ? "" : raw.trim().toUpperCase(Locale.ROOT);
        if (!OUTCOMES.contains(v)) throw TrackerException.invalid("outcome", "must be POSITIVE, NEUTRAL or NEGATIVE");
        return v;
    }

    private static String cleanSummary(String raw) {
        String v = raw == null ? "" : raw.trim();
        if (v.isEmpty()) throw TrackerException.invalid("summary", "is required");
        if (v.length() > MAX_SUMMARY) throw TrackerException.invalid("summary", "is longer than " + MAX_SUMMARY + " characters");
        SensitiveContent.check("summary", "summary", v);
        return v;
    }

    // ---- tiles ----------------------------------------------------------------------------------------------------

    private Tiles tiles(Ctx x) {
        Instant now = x.now;
        long upcomingNow = x.mine.stream().filter(i -> isUpcoming(i, now)).count();
        Tile upcoming = tile(upcomingNow, now.minus(Duration.ofDays(30)), "last month", asOf -> x.count(i -> !"CANCELLED".equals(i.getStatus()) && !i.getCreatedAt().isAfter(asOf) && end(i).isAfter(asOf)), now);

        Tile thisWeek = tile(
            x.count(i -> !"CANCELLED".equals(i.getStatus()) && sameWeek(i.getScheduledAt(), now)),
            now.minus(Duration.ofDays(7)),
            "last week",
            asOf -> x.count(i -> !"CANCELLED".equals(i.getStatus()) && sameWeek(i.getScheduledAt(), asOf)),
            now
        );
        // the "now" reading of this-week uses the same weekly rule; the previous reading is the week before
        Tile completed = tile(x.count(i -> "COMPLETED".equals(i.getStatus())), now.minus(Duration.ofDays(7)), "last week", asOf -> x.count(i -> "COMPLETED".equals(i.getStatus()) && !i.getScheduledAt().isAfter(asOf)), now);
        Tile pending = tile(
            x.count(i -> "COMPLETED".equals(i.getStatus()) && !x.feedback.containsKey(i.getId())),
            now.minus(Duration.ofDays(7)),
            "last week",
            asOf -> x.count(i -> "COMPLETED".equals(i.getStatus()) && !i.getScheduledAt().isAfter(asOf) && (!x.feedback.containsKey(i.getId()) || x.feedback.get(i.getId()).getCreatedAt().isAfter(asOf))),
            now
        );
        return new Tiles(upcoming, thisWeek, completed, pending);
    }

    /** {@code value} now, {@code previous} = the metric at {@code compareAt}, and six weekly readings (oldest first) of the same metric. */
    private static Tile tile(long value, Instant compareAt, String vs, Function<Instant, Long> metric, Instant now) {
        long previous = metric.apply(compareAt);
        Double delta = previous == 0 ? null : Math.round(((value - previous) * 1000.0) / previous) / 10.0;
        List<Long> spark = new ArrayList<>();
        for (int w = WEEKS - 1; w >= 0; w--) spark.add(metric.apply(now.minus(Duration.ofDays(7L * w))));
        return new Tile(value, previous, delta, spark, vs);
    }

    /** Sunday to Saturday in UTC, the week the calendar draws. */
    static Instant weekStart(Instant t) {
        LocalDate d = t.atZone(ZoneOffset.UTC).toLocalDate();
        LocalDate sunday = d.getDayOfWeek() == DayOfWeek.SUNDAY ? d : d.minusDays(d.getDayOfWeek().getValue());
        return sunday.atStartOfDay().toInstant(ZoneOffset.UTC);
    }

    static boolean sameWeek(Instant a, Instant b) {
        return weekStart(a).equals(weekStart(b));
    }

    // ---- rows -----------------------------------------------------------------------------------------------------

    private static Instant end(TalentInterview i) {
        return i.getScheduledAt().plus(Duration.ofMinutes(i.getDurationMinutes() == null ? 45 : i.getDurationMinutes()));
    }

    /** SCHEDULED and not over yet (a meeting in progress is still joinable). */
    private static boolean isUpcoming(TalentInterview i, Instant now) {
        return "SCHEDULED".equals(i.getStatus()) && end(i).isAfter(now);
    }

    private static String calendarState(TalentInterview i, Instant now) {
        if ("COMPLETED".equals(i.getStatus())) return "COMPLETED";
        if (!isUpcoming(i, now)) return "PAST";
        return i.getScheduledAt().isBefore(now.plus(Duration.ofDays(7))) ? "UPCOMING" : "SCHEDULED";
    }

    private InterviewRow row(Ctx x, TalentInterview i) {
        ClientRequirement r = x.requirement(i);
        CwsInterviewDetail d = x.details.get(i.getId());
        String chip = isUpcoming(i, x.now) ? (i.getScheduledAt().isBefore(x.now.plus(Duration.ofDays(7))) ? "UPCOMING" : "SCHEDULED") : null;
        return new InterviewRow(
            i.getId(), x.title(i), x.company(i), r == null ? null : r.getLocation(), r == null ? null : r.getWorkMode(), i.getRoundLabel(), i.getInterviewerName(),
            d == null ? null : d.getInterviewerTitle(), i.getScheduledAt(), i.getDurationMinutes() == null ? 45 : i.getDurationMinutes(), i.getStatus(), chip,
            d == null ? null : d.getMode(), d == null ? null : d.getMeetingUrl(), d == null ? null : d.getPrepNote(), x.feedback.containsKey(i.getId())
        );
    }

    private FeedbackRow feedbackRow(Ctx x, TalentInterview i, CwsInterviewFeedback f) {
        return new FeedbackRow(i.getId(), x.title(i), x.company(i), i.getScheduledAt(), f.getOutcome(), f.getSummary(), f.getUpdatedAt());
    }

    private Detail detailOf(Ctx x, TalentInterview i) {
        TalentApplication app = i.getApplicationId() == null ? null : x.apps.get(i.getApplicationId());
        CwsInterviewFeedback f = x.feedback.get(i.getId());
        return new Detail(
            row(x, i), app == null ? null : app.getCode(), f == null ? null : feedbackRow(x, i, f), "SCHEDULED".equals(i.getStatus()), "COMPLETED".equals(i.getStatus())
        );
    }

    private TalentInterview own(Ctx x, long interviewId) {
        return x.mine.stream().filter(i -> i.getId() != null && i.getId() == interviewId).findFirst().orElseThrow(OrgNotFoundException::new);
    }

    // ---- loading --------------------------------------------------------------------------------------------------

    private Ctx load(ConsultantProfile c) {
        Long org = c.getOrgId();
        Instant now = Instant.now(clock);
        List<TalentInterview> mine = interviews.findByOrgIdAndConsultantIdOrderByScheduledAtAsc(org, c.getId());
        Map<Long, CwsInterviewDetail> d = details.findByOrgIdAndConsultantId(org, c.getId()).stream().collect(Collectors.toMap(CwsInterviewDetail::getInterviewId, Function.identity(), (a, b) -> a, HashMap::new));
        Map<Long, CwsInterviewFeedback> f = feedback.findByOrgIdAndConsultantId(org, c.getId()).stream().collect(Collectors.toMap(CwsInterviewFeedback::getInterviewId, Function.identity(), (a, b) -> a, HashMap::new));
        Map<Long, TalentApplication> apps = applications.findByOrgIdAndConsultantId(org, c.getId()).stream().collect(Collectors.toMap(TalentApplication::getId, Function.identity()));
        List<Long> reqIds = apps.values().stream().map(TalentApplication::getRequirementId).distinct().toList();
        Map<Long, ClientRequirement> reqs = requirements.findByOrgIdAndIdIn(org, reqIds).stream().filter(r -> org.equals(r.getOrgId())).collect(Collectors.toMap(ClientRequirement::getId, Function.identity()));
        List<Long> clientIds = mine.stream().map(TalentInterview::getClientId).distinct().toList();
        Map<Long, ClientAccount> accounts = clients.findByOrgIdAndIdIn(org, clientIds).stream().filter(a -> org.equals(a.getOrgId())).collect(Collectors.toMap(ClientAccount::getId, Function.identity()));
        return new Ctx(now, mine, d, f, apps, reqs, accounts);
    }

    private record Ctx(
        Instant now,
        List<TalentInterview> mine,
        Map<Long, CwsInterviewDetail> details,
        Map<Long, CwsInterviewFeedback> feedback,
        Map<Long, TalentApplication> apps,
        Map<Long, ClientRequirement> reqs,
        Map<Long, ClientAccount> accounts
    ) {
        long count(Predicate<TalentInterview> p) {
            return mine.stream().filter(p).count();
        }

        ClientRequirement requirement(TalentInterview i) {
            TalentApplication a = i.getApplicationId() == null ? null : apps.get(i.getApplicationId());
            return a == null ? null : reqs.get(a.getRequirementId());
        }

        String title(TalentInterview i) {
            ClientRequirement r = requirement(i);
            return r == null ? "Interview" : r.getTitle();
        }

        String company(TalentInterview i) {
            ClientAccount a = accounts.get(i.getClientId());
            return a == null ? null : a.getName();
        }
    }
}
