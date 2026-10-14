package com.dossier.api.service.ent.consultantws;

import com.dossier.api.domain.ent.consultantws.CwsOffer;
import com.dossier.api.domain.ent.consultantws.CwsSubmission;
import com.dossier.api.domain.ent.talent.ClientAccount;
import com.dossier.api.domain.ent.talent.ClientRequirement;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.ent.talent.OrgResume;
import com.dossier.api.domain.ent.talent.RequirementMatch;
import com.dossier.api.domain.ent.talent.TalentApplication;
import com.dossier.api.domain.ent.talent.TalentInterview;
import com.dossier.api.domain.ent.talent.TalentPlacement;
import com.dossier.api.repository.ent.consultantws.CwsApplicationEventRepository;
import com.dossier.api.repository.ent.consultantws.CwsAvailabilityHistoryRepository;
import com.dossier.api.repository.ent.consultantws.CwsCertificationRepository;
import com.dossier.api.repository.ent.consultantws.CwsInterviewFeedbackRepository;
import com.dossier.api.repository.ent.consultantws.CwsInterviewRepository;
import com.dossier.api.repository.ent.consultantws.CwsOfferEventRepository;
import com.dossier.api.repository.ent.consultantws.CwsOfferRepository;
import com.dossier.api.repository.ent.consultantws.CwsOpportunityResponseRepository;
import com.dossier.api.repository.ent.consultantws.CwsPlacementActivityRepository;
import com.dossier.api.repository.ent.consultantws.CwsProfilePrefRepository;
import com.dossier.api.repository.ent.consultantws.CwsResumeActivityRepository;
import com.dossier.api.repository.ent.consultantws.CwsSubmissionRepository;
import com.dossier.api.repository.ent.talent.ClientAccountRepository;
import com.dossier.api.repository.ent.talent.ClientRequirementRepository;
import com.dossier.api.repository.ent.talent.OrgResumeRepository;
import com.dossier.api.repository.ent.talent.RequirementMatchRepository;
import com.dossier.api.repository.ent.talent.TalentApplicationRepository;
import com.dossier.api.repository.ent.talent.TalentPlacementRepository;
import com.dossier.api.service.TrackerException;
import com.dossier.api.service.ent.consultantws.ActivityTimelineDTO.Chip;
import com.dossier.api.service.ent.consultantws.ActivityTimelineDTO.Event;
import com.dossier.api.service.ent.consultantws.ActivityTimelineDTO.Milestone;
import com.dossier.api.service.ent.consultantws.ActivityTimelineDTO.Response;
import com.dossier.api.service.ent.consultantws.ActivityTimelineDTO.Tile;
import com.dossier.api.service.ent.consultantws.ActivityTimelineDTO.Tiles;
import com.dossier.api.service.org.OrgMembership;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.TreeMap;
import java.util.function.Function;
import java.util.function.Predicate;
import java.util.stream.Collectors;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The Consultant workspace Activity Timeline (docs/enterprise-v2/page-consultant-activity-timeline.md): a READ-ONLY, derived feed. There is no
 * table of its own: every event is computed from rows the other consultant pages already write, always organization id first plus the caller's
 * own consultant id (the gate is {@link ConsultantHomeService#requireSelf}). Application NOTE events are never read (they are not
 * consultant-visible: only CREATED and STAGE_CHANGE are). The merge sorts by time (newest first) with the event key as a stable tiebreak; the
 * cursor is the (time, key) of the last row returned, so a page boundary never repeats or skips a row even when several events share a time.
 */
@Service
public class ActivityTimelineService {

    static final int DEFAULT_SIZE = 20;
    static final int MAX_SIZE = 50;
    static final int DEFAULT_DAYS = 30;
    static final Set<Integer> PERIODS = Set.of(7, 30, 90);
    static final int WEEKS = 6;
    static final Set<String> GROUPS = Set.of("RESUME", "JOB", "APPLICATION", "SUBMISSION", "INTERVIEW", "FEEDBACK", "OFFER", "AVAILABILITY", "PROFILE", "PLACEMENT");
    private static final int CHILD_ROWS = 500;
    private static final long PROFILE_BUCKET_SECONDS = 3600;

    private static final Comparator<Event> NEWEST_FIRST = Comparator.comparing(Event::at).reversed().thenComparing(Event::key, Comparator.reverseOrder());

    private final ConsultantHomeService gate;
    private final OrgResumeRepository resumes;
    private final CwsResumeActivityRepository resumeActivity;
    private final RequirementMatchRepository matches;
    private final CwsOpportunityResponseRepository responses;
    private final TalentApplicationRepository applications;
    private final CwsApplicationEventRepository applicationEvents;
    private final CwsSubmissionRepository submissions;
    private final CwsInterviewRepository interviews;
    private final CwsInterviewFeedbackRepository feedback;
    private final CwsOfferRepository offers;
    private final CwsOfferEventRepository offerEvents;
    private final CwsAvailabilityHistoryRepository availability;
    private final CwsCertificationRepository certifications;
    private final CwsProfilePrefRepository prefs;
    private final TalentPlacementRepository placements;
    private final CwsPlacementActivityRepository placementActivity;
    private final ClientRequirementRepository requirements;
    private final ClientAccountRepository clients;
    private final Clock clock;

    @Autowired
    public ActivityTimelineService(
        ConsultantHomeService gate,
        OrgResumeRepository resumes,
        CwsResumeActivityRepository resumeActivity,
        RequirementMatchRepository matches,
        CwsOpportunityResponseRepository responses,
        TalentApplicationRepository applications,
        CwsApplicationEventRepository applicationEvents,
        CwsSubmissionRepository submissions,
        CwsInterviewRepository interviews,
        CwsInterviewFeedbackRepository feedback,
        CwsOfferRepository offers,
        CwsOfferEventRepository offerEvents,
        CwsAvailabilityHistoryRepository availability,
        CwsCertificationRepository certifications,
        CwsProfilePrefRepository prefs,
        TalentPlacementRepository placements,
        CwsPlacementActivityRepository placementActivity,
        ClientRequirementRepository requirements,
        ClientAccountRepository clients
    ) {
        this.gate = gate;
        this.resumes = resumes;
        this.resumeActivity = resumeActivity;
        this.matches = matches;
        this.responses = responses;
        this.applications = applications;
        this.applicationEvents = applicationEvents;
        this.submissions = submissions;
        this.interviews = interviews;
        this.feedback = feedback;
        this.offers = offers;
        this.offerEvents = offerEvents;
        this.availability = availability;
        this.certifications = certifications;
        this.prefs = prefs;
        this.placements = placements;
        this.placementActivity = placementActivity;
        this.requirements = requirements;
        this.clients = clients;
        this.clock = Clock.systemUTC();
    }

    @Transactional(readOnly = true)
    public Response timeline(OrgMembership me, String type, Integer days, String cursor, Integer size) {
        ConsultantProfile c = gate.requireSelf(me);
        String group = type == null || type.isBlank() ? "" : type.strip().toUpperCase(Locale.ROOT);
        if (!group.isEmpty() && !"ALL".equals(group) && !GROUPS.contains(group)) throw TrackerException.invalid("type", "is not an activity type");
        if ("ALL".equals(group)) group = "";
        int period = days == null ? DEFAULT_DAYS : days;
        if (!PERIODS.contains(period)) throw TrackerException.invalid("days", "must be 7, 30 or 90");
        int limit = size == null ? DEFAULT_SIZE : size;
        if (limit < 1 || limit > MAX_SIZE) throw TrackerException.invalid("size", "must be between 1 and " + MAX_SIZE);
        Cursor after = decode(cursor);

        Instant now = Instant.now(clock);
        LocalDate today = now.atZone(ZoneOffset.UTC).toLocalDate();
        List<Event> all = collect(c, now);

        Instant since = now.minus(Duration.ofDays(period));
        String g = group;
        List<Event> matching = all.stream().filter(e -> !e.at().isBefore(since) && (g.isEmpty() || g.equals(e.group()))).sorted(NEWEST_FIRST).toList();
        List<Event> rest = after == null ? matching : matching.stream().filter(e -> isAfter(e, after)).toList();
        List<Event> page = rest.stream().limit(limit).toList();
        String next = rest.size() > page.size() && !page.isEmpty() ? encode(page.get(page.size() - 1)) : null;

        return new Response(c.getOrgId(), now, c.getDisplayName(), tiles(all, now), g.isEmpty() ? "ALL" : g, period, matching.size(), page, next, milestones(all, c, today));
    }

    // ---- the merge ------------------------------------------------------------------------------------------------

    private List<Event> collect(ConsultantProfile c, Instant now) {
        Long org = c.getOrgId();
        Long me = c.getId();
        List<Event> out = new ArrayList<>();

        List<RequirementMatch> myMatches = matches.findByOrgIdAndConsultantIdOrderByScoreDesc(org, me);
        List<TalentApplication> myApps = applications.findByOrgIdAndConsultantId(org, me);
        List<CwsSubmission> mySubs = submissions.findByOrgIdAndConsultantId(org, me);
        List<TalentInterview> myInterviews = interviews.findByOrgIdAndConsultantIdOrderByScheduledAtAsc(org, me);
        List<CwsOffer> myOffers = offers.findByOrgIdAndConsultantId(org, me);
        List<TalentPlacement> myPlacements = placements.findByOrgIdAndConsultantId(org, me);
        var myResponses = responses.findByOrgIdAndConsultantId(org, me);

        List<Long> reqIds = new ArrayList<>();
        myMatches.forEach(m -> reqIds.add(m.getRequirementId()));
        myApps.forEach(a -> reqIds.add(a.getRequirementId()));
        mySubs.forEach(s -> reqIds.add(s.getRequirementId()));
        myResponses.forEach(r -> reqIds.add(r.getRequirementId()));
        Map<Long, ClientRequirement> reqs = requirements
            .findAllById(reqIds.stream().filter(Objects::nonNull).distinct().toList())
            .stream()
            .filter(r -> org.equals(r.getOrgId()))
            .collect(Collectors.toMap(ClientRequirement::getId, Function.identity()));
        Map<Long, ClientAccount> clientById = clients.findByOrgId(org).stream().collect(Collectors.toMap(ClientAccount::getId, Function.identity()));

        // resumes
        Map<Long, OrgResume> resumeById = new HashMap<>();
        for (OrgResume r : resumes.findByOrgIdAndConsultantId(org, me)) {
            resumeById.put(r.getId(), r);
            boolean updated = r.getUpdatedAt().isAfter(r.getCreatedAt().plusSeconds(60));
            String file = fileLabel(r);
            out.add(
                ev(
                    "resume:" + r.getId(),
                    updated ? "RESUME_UPDATED" : "RESUME_ADDED",
                    "RESUME",
                    "PROFILE",
                    updated ? r.getUpdatedAt() : r.getCreatedAt(),
                    updated ? "Resume Updated" : "Resume Added",
                    (updated ? "You updated your resume \"" : "You added the resume \"") + file + "\".",
                    new Chip("FILE", file, null, null, null, null),
                    "View Resume",
                    "resumes",
                    false
                )
            );
        }
        for (var a : resumeActivity.findByOrgIdAndConsultantIdOrderByOccurredAtDesc(org, me)) {
            boolean shared = "SHARED".equals(a.getKind());
            if (!shared && !"DOWNLOADED".equals(a.getKind())) continue; // views are noise, not activity
            OrgResume r = resumeById.get(a.getResumeId());
            String file = r == null ? "your resume" : fileLabel(r);
            out.add(
                ev(
                    "resume-act:" + a.getId(),
                    shared ? "RESUME_SHARED" : "RESUME_DOWNLOADED",
                    "RESUME",
                    null,
                    a.getOccurredAt(),
                    shared ? "Resume Shared" : "Resume Downloaded",
                    "You " + (shared ? "shared " : "downloaded ") + (r == null ? file : "\"" + file + "\"") + ".",
                    r == null ? null : new Chip("FILE", file, null, null, null, null),
                    "View Resume",
                    "resumes",
                    false
                )
            );
        }

        // jobs assigned / answered
        for (RequirementMatch m : myMatches) {
            if (!"ASSIGNED".equals(m.getStatus()) || m.getAssignedAt() == null) continue;
            ClientRequirement r = reqs.get(m.getRequirementId());
            String company = company(r, clientById);
            out.add(
                ev(
                    "match:" + m.getId(),
                    "JOB_ASSIGNED",
                    "JOB",
                    null,
                    m.getAssignedAt(),
                    "Job Assigned",
                    "Your marketer assigned you a new opportunity" + (company == null ? "." : " at " + company + "."),
                    jobChip(r, company),
                    "View Job",
                    "opportunities",
                    false
                )
            );
        }
        for (var r : myResponses) {
            if (r.getRespondedAt() == null) continue;
            ClientRequirement req = reqs.get(r.getRequirementId());
            String company = company(req, clientById);
            boolean declined = "DECLINED".equals(r.getStatus());
            String where = company == null ? "." : " at " + company + ".";
            out.add(
                ev(
                    "response:" + r.getId(),
                    "JOB_RESPONDED",
                    "JOB",
                    null,
                    r.getRespondedAt(),
                    declined ? "Opportunity Declined" : "Opportunity Response Sent",
                    declined ? "You declined an assigned opportunity" + where : "You responded to an assigned opportunity" + where,
                    jobChip(req, company),
                    "View Job",
                    "opportunities",
                    false
                )
            );
        }

        // applications: CREATED and STAGE_CHANGE only (NOTE events are never consultant-visible)
        Map<Long, TalentApplication> appById = myApps.stream().collect(Collectors.toMap(TalentApplication::getId, Function.identity()));
        if (!appById.isEmpty()) {
            for (var e : applicationEvents.findByOrgIdAndApplicationIdInOrderByOccurredAtAsc(org, appById.keySet())) {
                boolean created = "CREATED".equals(e.getEventType());
                if (!created && !"STAGE_CHANGE".equals(e.getEventType())) continue;
                TalentApplication a = appById.get(e.getApplicationId());
                if (a == null) continue;
                ClientRequirement req = reqs.get(a.getRequirementId());
                String company = company(req, clientById);
                String role = req == null ? "your application" : req.getTitle();
                String to = e.getToStage() == null ? "" : e.getToStage();
                String t;
                String title;
                String desc;
                if (created) {
                    t = "APPLICATION_CREATED";
                    title = "Application Created";
                    desc = "An application was opened for " + role + ".";
                } else if ("SUBMITTED".equals(to)) {
                    t = "APPLICATION_SUBMITTED";
                    title = "Application Submitted";
                    desc = "You submitted your application for " + role + ".";
                } else {
                    t = "APPLICATION_UPDATED";
                    title = "Application Updated";
                    desc = "Your application for " + role + (to.isEmpty() ? " changed." : " moved to " + to.toLowerCase(Locale.ROOT).replace('_', ' ') + ".");
                }
                out.add(ev("app-event:" + e.getId(), t, "APPLICATION", "APPLICATION", e.getOccurredAt(), title, desc, jobChip(req, company), "View Application", "applications", false));
            }
        }

        // submissions
        for (CwsSubmission s : mySubs) {
            ClientRequirement req = reqs.get(s.getRequirementId());
            String company = company(req, clientById);
            String role = req == null ? "a role" : req.getTitle();
            Chip chip = jobChip(req, company);
            if (s.getDecidedAt() != null) {
                boolean declined = CwsSubmission.DECLINED.equals(s.getStatus());
                out.add(
                    ev(
                        "sub-decision:" + s.getId(),
                        declined ? "SUBMISSION_DECLINED" : "SUBMISSION_APPROVED",
                        "SUBMISSION",
                        "APPLICATION",
                        s.getDecidedAt(),
                        declined ? "Submission Declined" : "Submission Approved",
                        declined ? "You declined the submission for " + role + "." : "You approved the submission for " + role + ".",
                        chip,
                        "View Details",
                        "submissions",
                        s.isSampleData()
                    )
                );
            }
            if (s.getSubmittedOn() != null) {
                out.add(
                    ev("sub-sent:" + s.getId(), "SUBMISSION_SENT", "SUBMISSION", "APPLICATION", s.getSubmittedOn(), "Submitted to Client", "Your submission for " + role + " was sent to the client.", chip, "View Details", "submissions", s.isSampleData())
                );
            }
            if (s.getMarketerNote() != null && !s.getMarketerNote().isBlank()) {
                out.add(
                    ev("sub-note:" + s.getId(), "MARKETER_NOTE", "SUBMISSION", null, s.getCreatedAt(), "Marketer Note", "Your marketer added a note to your submission for " + role + ".", chip, "View Details", "submissions", s.isSampleData())
                );
            }
        }

        // interviews and feedback
        Map<Long, TalentInterview> interviewById = myInterviews.stream().collect(Collectors.toMap(TalentInterview::getId, Function.identity()));
        for (TalentInterview i : myInterviews) {
            TalentApplication a = appById.get(i.getApplicationId());
            ClientRequirement req = a == null ? null : reqs.get(a.getRequirementId());
            String round = i.getRoundLabel() == null || i.getRoundLabel().isBlank() ? "An" : i.getRoundLabel().strip();
            Instant end = i.getScheduledAt().plus(Duration.ofMinutes(i.getDurationMinutes() == null ? 45 : i.getDurationMinutes()));
            Chip when = new Chip("DATES", null, null, null, i.getScheduledAt(), end);
            if (!"CANCELLED".equals(i.getStatus())) {
                out.add(
                    ev(
                        "interview:" + i.getId(),
                        "INTERVIEW_SCHEDULED",
                        "INTERVIEW",
                        "INTERVIEW",
                        i.getCreatedAt(),
                        "Interview Scheduled",
                        round + " interview has been scheduled" + (req == null ? "." : " for " + req.getTitle() + "."),
                        when,
                        "View Interview",
                        "interviews",
                        false
                    )
                );
            }
            if ("COMPLETED".equals(i.getStatus()) && !end.isAfter(now)) {
                out.add(
                    ev(
                        "interview-done:" + i.getId(),
                        "INTERVIEW_COMPLETED",
                        "INTERVIEW",
                        "INTERVIEW",
                        end,
                        "Interview Completed",
                        round + " interview" + (req == null ? "" : " for " + req.getTitle()) + " was completed.",
                        when,
                        "View Interview",
                        "interviews",
                        false
                    )
                );
            }
        }
        for (var f : feedback.findByOrgIdAndConsultantId(org, me)) {
            TalentInterview i = interviewById.get(f.getInterviewId());
            if (i == null) continue;
            TalentApplication a = appById.get(i.getApplicationId());
            ClientRequirement req = a == null ? null : reqs.get(a.getRequirementId());
            String outcome = f.getOutcome() == null ? "" : f.getOutcome().toLowerCase(Locale.ROOT) + " ";
            out.add(
                ev(
                    "feedback:" + f.getId(),
                    "FEEDBACK_RECEIVED",
                    "FEEDBACK",
                    "INTERVIEW",
                    f.getCreatedAt(),
                    "Feedback Received",
                    "You recorded " + outcome + "feedback after your interview" + (req == null ? "." : " for " + req.getTitle() + "."),
                    jobChip(req, company(req, clientById)),
                    "View Feedback",
                    "interviews",
                    false
                )
            );
        }

        // offers
        Map<Long, CwsOffer> offerById = myOffers.stream().collect(Collectors.toMap(CwsOffer::getId, Function.identity()));
        for (var e : offerEvents.findByOrgIdAndConsultantIdOrderByOccurredAtDescIdDesc(org, me, PageRequest.of(0, CHILD_ROWS))) {
            CwsOffer o = offerById.get(e.getOfferId());
            if (o == null) continue;
            String kind = e.getKind() == null ? "" : e.getKind();
            String from = o.getClientName() == null ? "." : " from " + o.getClientName() + ".";
            String[] text = switch (kind) {
                case "RECEIVED" -> new String[] { "OFFER_RECEIVED", "Offer Received", "You received a formal offer" + from };
                case "NEGOTIATING" -> new String[] { "OFFER_NEGOTIATING", "Negotiation Started", "You asked to negotiate your offer" + from };
                case "ACCEPTED" -> new String[] { "OFFER_ACCEPTED", "Offer Accepted", "You accepted your offer" + from };
                case "DECLINED" -> new String[] { "OFFER_DECLINED", "Offer Declined", "You declined your offer" + from };
                default -> new String[] { "OFFER_UPDATED", "Offer Updated", "Your offer" + (o.getClientName() == null ? "" : " from " + o.getClientName()) + " was updated." };
            };
            out.add(
                ev(
                    "offer-event:" + e.getId(),
                    text[0],
                    "OFFER",
                    null,
                    e.getOccurredAt(),
                    text[1],
                    text[2],
                    new Chip("JOB", o.getRoleTitle(), o.getClientName(), o.getClientName(), null, null),
                    "View Offer",
                    "offers",
                    o.isSampleData()
                )
            );
        }

        // availability
        for (var h : availability.findByOrgIdAndConsultantIdOrderByEffectiveDateDescIdDesc(org, me)) {
            String status = h.getAvailabilityStatus() == null ? "Updated" : humanize(h.getAvailabilityStatus());
            out.add(
                ev(
                    "availability:" + h.getId(),
                    "AVAILABILITY_UPDATED",
                    "AVAILABILITY",
                    "PROFILE",
                    h.getCreatedAt(),
                    "Availability Updated",
                    "You updated your availability" + (h.getAvailableFrom() == null ? "." : " to start from " + h.getAvailableFrom() + "."),
                    new Chip("AVAILABILITY", status, h.getAvailableFrom() == null ? null : h.getAvailableFrom().toString(), null, null, null),
                    "View Availability",
                    "availability",
                    h.isSampleData()
                )
            );
        }

        // profile: certifications and preferences, folded per hour so a bulk save is one event
        TreeMap<Long, long[]> profile = new TreeMap<>(); // bucket -> {certs, prefs, latest epoch milli}
        for (var cert : certifications.findByOrgIdAndConsultantIdOrderByIssuedOnDescIdDesc(org, me)) {
            long[] b = profile.computeIfAbsent(cert.getCreatedAt().getEpochSecond() / PROFILE_BUCKET_SECONDS, k -> new long[3]);
            b[0]++;
            b[2] = Math.max(b[2], cert.getCreatedAt().toEpochMilli());
        }
        for (var pref : prefs.findByOrgIdAndConsultantIdOrderByKindAscSortOrderAscIdAsc(org, me)) {
            long[] b = profile.computeIfAbsent(pref.getCreatedAt().getEpochSecond() / PROFILE_BUCKET_SECONDS, k -> new long[3]);
            b[1]++;
            b[2] = Math.max(b[2], pref.getCreatedAt().toEpochMilli());
        }
        profile.forEach((bucket, v) -> {
            List<String> parts = new ArrayList<>();
            if (v[0] > 0) parts.add(v[0] + (v[0] == 1 ? " certification" : " certifications"));
            if (v[1] > 0) parts.add(v[1] + (v[1] == 1 ? " preference" : " preferences"));
            String added = "Added " + String.join(" and ", parts);
            out.add(
                ev(
                    "profile:" + bucket,
                    "PROFILE_UPDATED",
                    "PROFILE",
                    "PROFILE",
                    Instant.ofEpochMilli(v[2]),
                    "Profile Updated",
                    "You updated your certifications and preferences.",
                    new Chip("TEXT", added, null, null, null, null),
                    "View Profile",
                    "profile",
                    false
                )
            );
        });

        // placements
        for (TalentPlacement p : myPlacements) {
            String company = p.getClientId() == null || !clientById.containsKey(p.getClientId()) ? null : clientById.get(p.getClientId()).getName();
            for (var a : placementActivity.findByOrgIdAndPlacementIdOrderByOccurredAtDescIdDesc(org, p.getId(), PageRequest.of(0, CHILD_ROWS))) {
                out.add(
                    ev(
                        "placement-act:" + a.getId(),
                        "PLACEMENT_MILESTONE",
                        "PLACEMENT",
                        null,
                        a.getOccurredAt(),
                        "Placement Update",
                        a.getDescription() == null || a.getDescription().isBlank() ? "A placement milestone was recorded." : a.getDescription(),
                        new Chip("JOB", p.getRoleTitle(), company, company, null, null),
                        "View Placement",
                        "placements",
                        a.isSampleData()
                    )
                );
            }
        }

        // nothing from the future, nothing without a time
        return out.stream().filter(e -> e.at() != null && !e.at().isAfter(now)).toList();
    }

    // ---- tiles and milestones -------------------------------------------------------------------------------------

    private static Tiles tiles(List<Event> all, Instant now) {
        return new Tiles(
            tile(all, e -> true, 30, "month", now),
            tile(all, e -> true, 7, "week", now),
            tile(all, e -> "APPLICATION".equals(e.category()), 30, "month", now),
            tile(all, e -> "INTERVIEW".equals(e.category()), 30, "month", now),
            tile(all, e -> "PROFILE".equals(e.category()), 30, "month", now)
        );
    }

    /** Events in the last {@code window} days against the {@code window} days before that; the change is null (no delta) when the earlier count is 0. */
    private static Tile tile(List<Event> all, Predicate<Event> in, int window, String vs, Instant now) {
        List<Instant> stamps = all.stream().filter(in).map(Event::at).toList();
        Instant from = now.minus(Duration.ofDays(window));
        Instant earlier = now.minus(Duration.ofDays(2L * window));
        long value = stamps.stream().filter(t -> t.isAfter(from)).count();
        long previous = stamps.stream().filter(t -> t.isAfter(earlier) && !t.isAfter(from)).count();
        Double delta = previous == 0 ? null : Math.round(((value - previous) * 1000.0) / previous) / 10.0;
        List<Long> spark = new ArrayList<>();
        for (int w = WEEKS - 1; w >= 0; w--) {
            Instant hi = now.minus(Duration.ofDays(7L * w));
            Instant lo = hi.minus(Duration.ofDays(7));
            spark.add(stamps.stream().filter(t -> t.isAfter(lo) && !t.isAfter(hi)).count());
        }
        return new Tile(value, previous, delta, spark, vs);
    }

    private List<Milestone> milestones(List<Event> all, ConsultantProfile c, LocalDate today) {
        List<Milestone> out = new ArrayList<>();
        out.add(first(all, "app-submitted", "Application Submitted", "APPLICATION_SUBMITTED"));
        out.add(first(all, "submission-approved", "Submission Approved", "SUBMISSION_APPROVED"));
        out.add(first(all, "interview-completed", "Interview Completed", "INTERVIEW_COMPLETED"));
        out.add(first(all, "offer-received", "Offer Received", "OFFER_RECEIVED"));
        out.add(first(all, "offer-accepted", "Offer Accepted", "OFFER_ACCEPTED"));
        Optional<LocalDate> start = placements
            .findByOrgIdAndConsultantId(c.getOrgId(), c.getId())
            .stream()
            .map(TalentPlacement::getStartDate)
            .filter(Objects::nonNull)
            .max(Comparator.naturalOrder());
        out.add(new Milestone("project-start", "Project Start Date", start.isPresent() && !start.get().isAfter(today), start.map(LocalDate::toString).orElse(null)));
        return out;
    }

    private static Milestone first(List<Event> all, String key, String label, String type) {
        return all
            .stream()
            .filter(e -> type.equals(e.type()))
            .min(Comparator.comparing(Event::at))
            .map(e -> new Milestone(key, label, true, e.at().toString()))
            .orElse(new Milestone(key, label, false, null));
    }

    // ---- cursor ---------------------------------------------------------------------------------------------------

    private record Cursor(long at, String key) {}

    static String encode(Event last) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString((last.at().toEpochMilli() + "|" + last.key()).getBytes(StandardCharsets.UTF_8));
    }

    private static Cursor decode(String cursor) {
        if (cursor == null || cursor.isBlank()) return null;
        try {
            String raw = new String(Base64.getUrlDecoder().decode(cursor.strip()), StandardCharsets.UTF_8);
            int bar = raw.indexOf('|');
            if (bar < 1 || bar == raw.length() - 1) throw new IllegalArgumentException();
            return new Cursor(Long.parseLong(raw.substring(0, bar)), raw.substring(bar + 1));
        } catch (IllegalArgumentException e) {
            throw TrackerException.invalid("cursor", "is not a valid cursor");
        }
    }

    /** Strictly after the cursor row in newest-first order: an older time, or the same time and a smaller key. */
    private static boolean isAfter(Event e, Cursor c) {
        long t = e.at().toEpochMilli();
        return t < c.at() || (t == c.at() && e.key().compareTo(c.key()) < 0);
    }

    // ---- small helpers --------------------------------------------------------------------------------------------

    private static Event ev(String key, String type, String group, String category, Instant at, String title, String description, Chip chip, String actionLabel, String target, boolean sample) {
        // milli precision so the cursor (epoch milli) can never disagree with the sort
        return new Event(key, type, group, category, at == null ? null : at.truncatedTo(ChronoUnit.MILLIS), title, description, chip, actionLabel, target, sample);
    }

    private static String fileLabel(OrgResume r) {
        return r.getFileName() != null && !r.getFileName().isBlank() ? r.getFileName() : r.getName() == null ? "Resume" : r.getName();
    }

    private static String company(ClientRequirement r, Map<Long, ClientAccount> clients) {
        if (r == null || r.getClientId() == null) return null;
        ClientAccount a = clients.get(r.getClientId());
        return a == null ? null : a.getName();
    }

    private static Chip jobChip(ClientRequirement r, String company) {
        return r == null ? null : new Chip("JOB", r.getTitle(), company, company, null, null);
    }

    private static String humanize(String s) {
        String t = s.toLowerCase(Locale.ROOT).replace('_', ' ');
        return t.isEmpty() ? t : Character.toUpperCase(t.charAt(0)) + t.substring(1);
    }
}
