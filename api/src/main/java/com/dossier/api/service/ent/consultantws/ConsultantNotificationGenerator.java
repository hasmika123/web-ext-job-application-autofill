package com.dossier.api.service.ent.consultantws;

import com.dossier.api.domain.ent.consultantws.CwsNotification;
import com.dossier.api.domain.ent.consultantws.CwsNotificationPref;
import com.dossier.api.domain.ent.consultantws.CwsOffer;
import com.dossier.api.domain.ent.consultantws.CwsOpportunityResponse;
import com.dossier.api.domain.ent.consultantws.CwsSubmission;
import com.dossier.api.domain.ent.consultantws.CwsTask;
import com.dossier.api.domain.ent.talent.ClientAccount;
import com.dossier.api.domain.ent.talent.ClientRequirement;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.ent.talent.RequirementMatch;
import com.dossier.api.domain.ent.talent.TalentInterview;
import com.dossier.api.repository.ent.consultantws.CwsInterviewRepository;
import com.dossier.api.repository.ent.consultantws.CwsNotificationPrefRepository;
import com.dossier.api.repository.ent.consultantws.CwsNotificationRepository;
import com.dossier.api.repository.ent.consultantws.CwsOfferRepository;
import com.dossier.api.repository.ent.consultantws.CwsOpportunityResponseRepository;
import com.dossier.api.repository.ent.mkt.MktOpportunityRepository;
import com.dossier.api.domain.ent.mkt.MktOpportunity;
import com.dossier.api.repository.ent.consultantws.CwsSubmissionRepository;
import com.dossier.api.repository.ent.consultantws.CwsTaskRepository;
import com.dossier.api.repository.ent.talent.ClientAccountRepository;
import com.dossier.api.repository.ent.talent.ClientRequirementRepository;
import com.dossier.api.repository.ent.talent.RequirementMatchRepository;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Turns the consultant's OWN rows into notifications and persists them (the feed is derived-and-persisted: in the finished product other roles and
 * modules produce notifications; until then this is the producer). {@link #generateFor} is idempotent: every source event has a key (for example
 * {@code match:12}) and a consultant has at most one row per key, deleted rows included, so a deleted or resolved notification never comes back.
 * Sources: new matches (last 7 days), assigned opportunities awaiting the consultant's response, submissions waiting for approval, interviews
 * within 48 hours, open offers within 7 days of their deadline, open tasks due today or overdue, and an incomplete profile. A category the
 * consultant switched off (or whose in-app channel is off) creates nothing new. A notification whose source no longer applies (the submission was
 * decided, the task is done ...) is resolved automatically. Nothing is ever emailed, texted or pushed.
 */
@Service
public class ConsultantNotificationGenerator {

    static final int MATCH_DAYS = 7;
    static final int INTERVIEW_HOURS = 48;
    static final int OFFER_DAYS = 7;
    static final int PER_SOURCE_CAP = 10;
    static final String PATH_MATCHES = "/w/consultant/matches";
    static final String PATH_OPPORTUNITIES = "/w/consultant/opportunities";
    static final String PATH_SUBMISSIONS = "/w/consultant/submissions";
    static final String PATH_INTERVIEWS = "/w/consultant/interviews";
    static final String PATH_OFFERS = "/w/consultant/offers";
    static final String PATH_TASKS = "/w/consultant/tasks";
    static final String PATH_PROFILE = "/w/consultant/profile";
    /** Source key prefixes whose notification closes itself when the source no longer applies (matches age out and stay). */
    private static final List<String> SELF_CLOSING = List.of("opp:", "submission:", "interview:", "offer:", "task:", "profile:");
    private static final DateTimeFormatter WHEN = DateTimeFormatter.ofPattern("EEE d MMM, HH:mm", Locale.ENGLISH).withZone(ZoneOffset.UTC);
    private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("EEE d MMM", Locale.ENGLISH);

    private final CwsNotificationRepository notifications;
    private final CwsNotificationPrefRepository prefs;
    private final RequirementMatchRepository matches;
    private final ClientRequirementRepository requirements;
    private final ClientAccountRepository clients;
    private final CwsOpportunityResponseRepository responses;
    private final CwsSubmissionRepository submissions;
    private final CwsInterviewRepository interviews;
    private final CwsOfferRepository offers;
    private final CwsTaskRepository tasks;
    private final MktOpportunityRepository opportunities;
    private final Clock clock;

    @Autowired
    public ConsultantNotificationGenerator(
        CwsNotificationRepository notifications,
        CwsNotificationPrefRepository prefs,
        RequirementMatchRepository matches,
        ClientRequirementRepository requirements,
        ClientAccountRepository clients,
        CwsOpportunityResponseRepository responses,
        CwsSubmissionRepository submissions,
        CwsInterviewRepository interviews,
        CwsOfferRepository offers,
        CwsTaskRepository tasks,
        MktOpportunityRepository opportunities
    ) {
        this(notifications, prefs, matches, requirements, clients, responses, submissions, interviews, offers, tasks, opportunities, Clock.systemUTC());
    }

    ConsultantNotificationGenerator(
        CwsNotificationRepository notifications,
        CwsNotificationPrefRepository prefs,
        RequirementMatchRepository matches,
        ClientRequirementRepository requirements,
        ClientAccountRepository clients,
        CwsOpportunityResponseRepository responses,
        CwsSubmissionRepository submissions,
        CwsInterviewRepository interviews,
        CwsOfferRepository offers,
        CwsTaskRepository tasks,
        MktOpportunityRepository opportunities,
        Clock clock
    ) {
        this.notifications = notifications;
        this.prefs = prefs;
        this.matches = matches;
        this.requirements = requirements;
        this.clients = clients;
        this.responses = responses;
        this.submissions = submissions;
        this.interviews = interviews;
        this.offers = offers;
        this.tasks = tasks;
        this.opportunities = opportunities;
        this.clock = clock;
    }

    /** One notification a source event wants to exist. */
    record Candidate(String key, String category, String title, String body, String priority, String label, String href, String relatedType, Long relatedId, Instant at) {}

    /** Creates the missing notifications for this consultant and closes the ones whose source is gone; returns how many were created. */
    @Transactional
    public int generateFor(ConsultantProfile c) {
        Long org = c.getOrgId();
        Instant now = Instant.now(clock);
        List<Candidate> wanted = candidates(c, now);

        Map<String, CwsNotification> existing = notifications.findByOrgIdAndConsultantId(org, c.getId()).stream().collect(Collectors.toMap(CwsNotification::getSourceKey, Function.identity(), (a, b) -> a));
        Map<String, CwsNotificationPref> pref = prefs.findByOrgIdAndConsultantId(org, c.getId()).stream().collect(Collectors.toMap(CwsNotificationPref::getCategory, Function.identity(), (a, b) -> a));

        int made = 0;
        List<CwsNotification> fresh = new ArrayList<>();
        for (Candidate w : wanted) {
            if (existing.containsKey(w.key()) || !delivers(pref.get(w.category()))) continue;
            fresh.add(build(c, w, now));
            made++;
        }
        if (!fresh.isEmpty()) notifications.saveAll(fresh);

        Set<String> stillTrue = wanted.stream().map(Candidate::key).collect(Collectors.toSet());
        for (CwsNotification n : existing.values()) {
            if (n.getDeletedAt() != null || n.getResolvedAt() != null) continue;
            if (SELF_CLOSING.stream().anyMatch(p -> n.getSourceKey().startsWith(p)) && !stillTrue.contains(n.getSourceKey())) n.setResolvedAt(now);
        }
        return made;
    }

    /**
     * One notification pushed by an event that is not derivable from the consultant's own data (a marketer withdrew an opportunity). Same category
     * and preference rules as the derived ones (the existing JOB_MATCH kind), idempotent by {@code sourceKey}; the key must not start with one of the
     * self-closing prefixes. Returns whether a row was created. Joins the caller's transaction.
     */
    @Transactional
    public boolean push(Long orgId, Long consultantId, String sourceKey, String category, String title, String body, String priority, String label, String href, String relatedType, Long relatedId) {
        if (SELF_CLOSING.stream().anyMatch(sourceKey::startsWith)) throw new IllegalArgumentException("a pushed notification must not use a self-closing key");
        if (notifications.findByOrgIdAndConsultantId(orgId, consultantId).stream().anyMatch(n -> sourceKey.equals(n.getSourceKey()))) return false;
        CwsNotificationPref pref = prefs.findByOrgIdAndConsultantId(orgId, consultantId).stream().filter(p -> category.equals(p.getCategory())).findFirst().orElse(null);
        if (!delivers(pref)) return false;
        ConsultantProfile c = new ConsultantProfile();
        c.setOrgId(orgId);
        c.setId(consultantId);
        notifications.save(build(c, new Candidate(sourceKey, category, title, body, priority, label, href, relatedType, relatedId, Instant.now(clock)), Instant.now(clock)));
        return true;
    }

    /** A category creates new notifications unless it is switched off or its in-app channel is off; no row yet means the defaults (on). */
    static boolean delivers(CwsNotificationPref p) {
        return p == null || (p.isEnabled() && p.isInApp());
    }

    private static CwsNotification build(ConsultantProfile c, Candidate w, Instant now) {
        if (w.href() != null && !CwsNotification.validHref(w.href())) throw new IllegalStateException("notification link must be an internal consultant path");
        CwsNotification n = new CwsNotification();
        n.setOrgId(c.getOrgId());
        n.setConsultantId(c.getId());
        n.setCategory(w.category());
        n.setTitle(cut(w.title(), 160));
        n.setBody(cut(w.body(), 300));
        n.setPriority(w.priority());
        n.setActionLabel(w.label());
        n.setActionHref(w.href());
        n.setRelatedType(w.relatedType());
        n.setRelatedId(w.relatedId());
        n.setSourceKey(w.key());
        n.setCreatedAt(w.at() == null || w.at().isAfter(now) ? now : w.at());
        return n;
    }

    // ---- the sources ----------------------------------------------------------------------------------------------

    List<Candidate> candidates(ConsultantProfile c, Instant now) {
        Long org = c.getOrgId();
        LocalDate today = now.atZone(ZoneOffset.UTC).toLocalDate();
        List<Candidate> out = new ArrayList<>();

        List<RequirementMatch> mine = matches.findByOrgIdAndConsultantIdOrderByScoreDesc(org, c.getId());
        List<CwsSubmission> pending = submissions.findByOrgIdAndConsultantIdAndStatusOrderByDueAtAscIdAsc(org, c.getId(), CwsSubmission.PENDING);
        List<TalentInterview> upcoming = interviews.findByOrgIdAndConsultantIdOrderByScheduledAtAsc(org, c.getId()).stream()
            .filter(i -> "SCHEDULED".equals(i.getStatus()) && i.getScheduledAt() != null && i.getScheduledAt().isAfter(now) && !i.getScheduledAt().isAfter(now.plus(Duration.ofHours(INTERVIEW_HOURS))))
            .limit(PER_SOURCE_CAP)
            .toList();

        Set<Long> reqIds = new HashSet<>();
        mine.forEach(m -> reqIds.add(m.getRequirementId()));
        pending.forEach(s -> reqIds.add(s.getRequirementId()));
        reqIds.remove(null);
        Map<Long, ClientRequirement> reqs = reqIds.isEmpty() ? Map.of() : requirements.findByOrgIdAndIdIn(org, reqIds).stream().filter(r -> org.equals(r.getOrgId())).collect(Collectors.toMap(ClientRequirement::getId, Function.identity()));
        Map<Long, String> clientName = clients.findByOrgId(org).stream().collect(Collectors.toMap(ClientAccount::getId, ClientAccount::getName, (a, b) -> a));

        // new matches (last 7 days, not dismissed, not yet assigned: assigned ones are opportunities)
        mine.stream()
            .filter(m -> !"DISMISSED".equals(m.getStatus()) && !"ASSIGNED".equals(m.getStatus()))
            .filter(m -> m.getCreatedAt() != null && m.getCreatedAt().isAfter(now.minus(Duration.ofDays(MATCH_DAYS))))
            .limit(PER_SOURCE_CAP)
            .forEach(m -> {
                ClientRequirement r = reqs.get(m.getRequirementId());
                String job = jobText(r, clientName);
                out.add(new Candidate("match:" + m.getId(), CwsNotification.JOB_MATCH, "New Job Match Available", (job.isEmpty() ? "A new role" : job) + " matches your skills and preferences.",
                    m.getScore() != null && m.getScore() >= 85 ? CwsNotification.HIGH : CwsNotification.MEDIUM, "View", PATH_MATCHES, "MATCH", m.getId(), m.getCreatedAt()));
            });

        // assigned opportunities that still wait for the consultant's answer
        Map<Long, CwsOpportunityResponse> answered = responses.findByOrgIdAndConsultantId(org, c.getId()).stream().collect(Collectors.toMap(CwsOpportunityResponse::getRequirementId, Function.identity(), (a, b) -> a));
        List<RequirementMatch> assigned = mine.stream().filter(m -> "ASSIGNED".equals(m.getStatus())).limit(PER_SOURCE_CAP).toList();
        Set<Long> assignedReqIds = assigned.stream().map(RequirementMatch::getRequirementId).filter(Objects::nonNull).collect(Collectors.toSet());
        assignedReqIds.removeAll(reqs.keySet());
        Map<Long, ClientRequirement> more = assignedReqIds.isEmpty() ? Map.of() : requirements.findByOrgIdAndIdIn(org, assignedReqIds).stream().filter(r -> org.equals(r.getOrgId())).collect(Collectors.toMap(ClientRequirement::getId, Function.identity()));
        // the consultant's answer is the shared mkt_opportunity record: anything past ASSIGNED / VIEWED has been answered
        Map<Long, MktOpportunity> shared = assigned.isEmpty() ? Map.of() : opportunities.findByOrgIdAndMatchIdIn(org, assigned.stream().map(RequirementMatch::getId).toList()).stream().collect(Collectors.toMap(MktOpportunity::getMatchId, Function.identity(), (a, b) -> a));
        for (RequirementMatch m : assigned) {
            CwsOpportunityResponse resp = answered.get(m.getRequirementId());
            if (resp != null && !CwsOpportunityResponse.NEW.equals(resp.getStatus())) continue;
            MktOpportunity answer = shared.get(m.getId());
            if (answer != null && !"ASSIGNED".equals(answer.getState()) && !"VIEWED".equals(answer.getState())) continue;
            ClientRequirement r = reqs.containsKey(m.getRequirementId()) ? reqs.get(m.getRequirementId()) : more.get(m.getRequirementId());
            String job = jobText(r, clientName);
            boolean soon = resp != null && resp.getDueOn() != null && !resp.getDueOn().isAfter(today.plusDays(2));
            out.add(new Candidate("opp:" + m.getId(), CwsNotification.JOB_MATCH, "Opportunity Awaiting Your Response", (job.isEmpty() ? "An opportunity" : job) + " was assigned to you. Let your marketer know if you are interested.",
                soon ? CwsNotification.HIGH : CwsNotification.MEDIUM, "Respond", PATH_OPPORTUNITIES, "OPPORTUNITY", m.getId(), m.getAssignedAt() != null ? m.getAssignedAt() : m.getCreatedAt()));
        }

        // submissions waiting for the consultant's approval
        pending.stream().limit(PER_SOURCE_CAP).forEach(s -> {
            String job = jobText(reqs.get(s.getRequirementId()), clientName);
            boolean soon = s.getDueAt() != null && !s.getDueAt().isAfter(now.plus(Duration.ofHours(48)));
            out.add(new Candidate("submission:" + s.getId(), CwsNotification.APPROVAL, "Submission Approval Requested", (job.isEmpty() ? "A submission" : "A submission for " + job) + " is waiting for your approval.",
                soon ? CwsNotification.HIGH : CwsNotification.MEDIUM, "View", PATH_SUBMISSIONS, "SUBMISSION", s.getId(), s.getCreatedAt()));
        });

        // interviews in the next 48 hours
        for (TalentInterview i : upcoming) {
            String who = i.getClientId() == null ? null : clientName.get(i.getClientId());
            out.add(new Candidate("interview:" + i.getId(), CwsNotification.INTERVIEW, "Interview Reminder",
                "You have an interview" + (who == null ? "" : " with " + who) + " on " + WHEN.format(i.getScheduledAt()) + " UTC.", CwsNotification.HIGH, "View", PATH_INTERVIEWS, "INTERVIEW", i.getId(), now));
        }

        // open offers near their deadline
        offers.findByOrgIdAndConsultantId(org, c.getId()).stream()
            .filter(o -> (CwsOffer.PENDING_REVIEW.equals(o.getStatus()) || CwsOffer.NEGOTIATION.equals(o.getStatus())) && o.getOfferDeadline() != null)
            .filter(o -> !o.getOfferDeadline().isBefore(today) && !o.getOfferDeadline().isAfter(today.plusDays(OFFER_DAYS)))
            .sorted((a, b) -> a.getOfferDeadline().compareTo(b.getOfferDeadline()))
            .limit(PER_SOURCE_CAP)
            .forEach(o -> out.add(new Candidate("offer:" + o.getId(), CwsNotification.OFFER, "Offer Deadline Approaching", o.getRoleTitle() + " at " + o.getClientName() + ": answer by " + DAY.format(o.getOfferDeadline()) + ".",
                !o.getOfferDeadline().isAfter(today.plusDays(3)) ? CwsNotification.HIGH : CwsNotification.MEDIUM, "View", PATH_OFFERS, "OFFER", o.getId(), now)));

        // open tasks due today or overdue
        tasks.findByOrgIdAndConsultantIdAndStatusNotOrderByDueOnAsc(org, c.getId(), "DONE").stream()
            .filter(t -> t.getDueOn() != null && !t.getDueOn().isAfter(today))
            .limit(PER_SOURCE_CAP)
            .forEach(t -> out.add(taskCandidate(t, today, now)));

        // an incomplete profile
        Integer done = c.getProfileCompleteness();
        if (done != null && done < 100) {
            out.add(new Candidate("profile:incomplete", CwsNotification.REMINDER, "Complete Your Profile", "Your profile is " + Math.max(0, done) + "% complete. Finish it to get better job matches.",
                CwsNotification.LOW, "Update", PATH_PROFILE, "PROFILE", c.getId(), now));
        }
        return out;
    }

    private static Candidate taskCandidate(CwsTask t, LocalDate today, Instant now) {
        boolean overdue = t.getDueOn().isBefore(today);
        String priority = overdue || "HIGH".equals(t.getPriority()) ? CwsNotification.HIGH : "LOW".equals(t.getPriority()) ? CwsNotification.LOW : CwsNotification.MEDIUM;
        return new Candidate("task:" + t.getId() + ":" + t.getDueOn(), CwsNotification.REMINDER, overdue ? "Follow-up Overdue" : "Follow-up Due Today",
            t.getTitle() + (overdue ? " was due " + DAY.format(t.getDueOn()) + "." : " is due today."), priority, "Snooze", PATH_TASKS, "TASK", t.getId(), now);
    }

    private static String jobText(ClientRequirement r, Map<Long, String> clientName) {
        if (r == null || r.getTitle() == null) return "";
        String who = r.getClientId() == null ? null : clientName.get(r.getClientId());
        return who == null ? r.getTitle() : r.getTitle() + " at " + who;
    }

    static String cut(String v, int max) {
        if (v == null) return null;
        return v.length() <= max ? v : v.substring(0, max - 1) + "…";
    }

    /** For tests and the seeder: the candidates only, nothing written. */
    List<Candidate> preview(ConsultantProfile c) {
        return candidates(c, Instant.now(clock));
    }
}
