package com.dossier.api.service.ent.consultantws;

import com.dossier.api.domain.ent.consultantws.CwsMatchView;
import com.dossier.api.domain.ent.consultantws.CwsPrepSession;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.ent.talent.TalentApplication;
import com.dossier.api.repository.ent.consultantws.CwsMatchViewRepository;
import com.dossier.api.repository.ent.consultantws.CwsPrepSessionRepository;
import com.dossier.api.repository.ent.talent.TalentApplicationRepository;
import com.dossier.api.service.ent.authz.AuthorizationService;
import com.dossier.api.service.ent.authz.AuthzOperation;
import com.dossier.api.service.ent.authz.AuthzRequest;
import com.dossier.api.service.ent.authz.Beneficiary;
import com.dossier.api.service.ent.consultantws.ConsultantFeaturesDTO.Feature;
import com.dossier.api.service.ent.consultantws.ConsultantFeaturesDTO.Response;
import com.dossier.api.service.ent.consultantws.ConsultantFeaturesDTO.Tiles;
import com.dossier.api.service.org.OrgMembership;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.ZoneOffset;
import java.util.List;
import java.util.function.Function;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The Consultant workspace My Features page (docs/enterprise-v2/page-consultant-features.md). Gate: {@link ConsultantHomeService#requireSelf}
 * plus {@code features.view}. READ ONLY.
 *
 * <p>Whether a feature is on comes from the consultant's own licence ({@link #setLicenses}). Nothing has a made-up allowance (gap D7): the AI
 * features share one monthly AI budget paid by the organization (decision 2026-11-15), shown as {@code ai} (percent used and when it starts
 * again), and the rest are not capped. Usage is real: Job Matching = the consultant's own match views this month, Interview Prep = their own
 * prep sessions, Email Application Tracking = their own applications, AI Resume Tailoring = their tailoring calls in the AI ledger, Resume
 * Optimization = their job-fit and resume-improvement calls. Every query is organization id first plus the caller's own consultant id (the AI
 * ledger by the caller's own login).
 */
@Service
public class ConsultantFeaturesService {

    public static final String VIEW_PERMISSION = "features.view";

    private final ConsultantHomeService gate;
    private final AuthorizationService authorization;
    private final CwsMatchViewRepository matchViews;
    private final CwsPrepSessionRepository prepSessions;
    private final TalentApplicationRepository applications;
    private final Clock clock;

    @Autowired
    public ConsultantFeaturesService(
        ConsultantHomeService gate,
        AuthorizationService authorization,
        CwsMatchViewRepository matchViews,
        CwsPrepSessionRepository prepSessions,
        TalentApplicationRepository applications
    ) {
        this(gate, authorization, matchViews, prepSessions, applications, Clock.systemUTC());
    }

    ConsultantFeaturesService(
        ConsultantHomeService gate,
        AuthorizationService authorization,
        CwsMatchViewRepository matchViews,
        CwsPrepSessionRepository prepSessions,
        TalentApplicationRepository applications,
        Clock clock
    ) {
        this.gate = gate;
        this.authorization = authorization;
        this.matchViews = matchViews;
        this.prepSessions = prepSessions;
        this.applications = applications;
        this.clock = clock;
    }

    private com.dossier.api.service.ent.licenses.OrgLicenseGate licenses;
    private com.dossier.api.repository.AiCallRepository aiCalls;
    private com.dossier.api.service.AiBudgetService aiBudget;

    /** Optional (gap D7): the AI ledger, for the tailoring and optimization counts. */
    @Autowired(required = false)
    public void setAiCalls(com.dossier.api.repository.AiCallRepository aiCalls) {
        this.aiCalls = aiCalls;
    }

    /** Optional (gap D7): the AI budget meter. */
    @Autowired(required = false)
    public void setAiBudget(com.dossier.api.service.AiBudgetService aiBudget) {
        this.aiBudget = aiBudget;
    }

    /** The AI tasks counted on each AI card (their wire names in {@code ai_call.task}). */
    static final List<String> TAILOR_TASKS = List.of(com.dossier.api.service.ai.AiTask.TAILOR.wire());
    static final List<String> OPTIMIZE_TASKS = List.of(
        com.dossier.api.service.ai.AiTask.FIT.wire(),
        com.dossier.api.service.ai.AiTask.REWRITE.wire(),
        com.dossier.api.service.ai.AiTask.SUMMARY.wire(),
        com.dossier.api.service.ai.AiTask.SUGGEST.wire()
    );

    /** Optional (LICENCES-BUILD.md L5): the licence reader. With it, whether a feature is on comes from the consultant's own licence. */
    @Autowired(required = false)
    public void setLicenses(com.dossier.api.service.ent.licenses.OrgLicenseGate licenses) {
        this.licenses = licenses;
    }

    /** The licence add-on behind each card of the page. */
    static final java.util.Map<String, String> LICENSE_KEY = java.util.Map.of(
        "job-matching", com.dossier.api.service.entitlement.FeatureKeys.AI_JOB_MATCHING,
        "resume-tailoring", com.dossier.api.service.entitlement.FeatureKeys.AI_RESUME_TAILORING,
        "interview-prep", com.dossier.api.service.entitlement.FeatureKeys.INTERVIEW_AI_PREP,
        "application-tracking", com.dossier.api.service.entitlement.FeatureKeys.INBOX_MONITORING,
        "resume-optimization", com.dossier.api.service.entitlement.FeatureKeys.RESUME_OPTIMIZATION
    );

    /** One static catalog entry (the admin catalog stand-in). */
    record Def(String key, String title, String description, String tone, String icon, boolean premium, Integer allowance, String unit, String usedNote, String href, String actionLabel, boolean overview) {}

    static List<Def> catalog() {
        return List.of(
            new Def("job-matching", "Job Matching", "Job matches ranked by your skills, location and experience.", "accent", "search", false, null, "matches", "viewed this month", "/w/consultant/matches", "View", false),
            new Def("resume-tailoring", "AI Resume Tailoring", "Generate tailored resumes for specific job opportunities.", "violet", "file", true, null, "tailorings", "this month, from your AI budget", "/w/consultant/resumes", "Use", true),
            new Def("interview-prep", "Interview Prep", "Practice common interview questions and score your own answers.", "green", "video", true, null, "sessions", "this month", "/w/consultant/interview-prep", "Use", true),
            new Def("application-tracking", "Email Application Tracking", "Track your job applications and get status updates automatically.", "amber", "mail", false, null, "applications", "tracked", "/w/consultant/applications", "View", true),
            new Def("resume-optimization", "Resume Optimization", "Get AI recommendations to improve your resume and skills.", "coral", "sparkles", true, null, "AI checks", "this month, from your AI budget", "/w/consultant/resumes", "Use", true)
        );
    }

    @Transactional(readOnly = true)
    public Response page(OrgMembership me) {
        ConsultantProfile c = gate.requireSelf(me);
        authorization.require(AuthzRequest.of(me.orgId(), List.of(VIEW_PERMISSION), Beneficiary.SELF, null, AuthzOperation.READ).withActor(me));
        Long org = c.getOrgId();
        Instant now = Instant.now(clock);
        LocalDate today = now.atZone(ZoneOffset.UTC).toLocalDate();
        YearMonth month = YearMonth.from(today);
        Instant monthStart = month.atDay(1).atStartOfDay().toInstant(ZoneOffset.UTC);
        Instant prevStart = month.minusMonths(1).atDay(1).atStartOfDay().toInstant(ZoneOffset.UTC);
        LocalDate resetsOn = month.plusMonths(1).atDay(1);
        LocalDate renewsOn = month.atEndOfMonth();

        List<CwsMatchView> views = matchViews.findByOrgIdAndConsultantId(org, c.getId());
        List<CwsPrepSession> sessions = prepSessions.findByOrgIdAndConsultantIdOrderByOccurredAtDesc(org, c.getId());
        List<TalentApplication> apps = applications.findByOrgIdAndConsultantId(org, c.getId());

        int viewsNow = count(views, CwsMatchView::getViewedAt, monthStart, null);
        int viewsPrev = count(views, CwsMatchView::getViewedAt, prevStart, monthStart);
        int prepNow = count(sessions, CwsPrepSession::getOccurredAt, monthStart, null);
        int prepPrev = count(sessions, CwsPrepSession::getOccurredAt, prevStart, monthStart);
        int appsNow = count(apps, TalentApplication::getCreatedAt, monthStart, null);
        int appsPrev = count(apps, TalentApplication::getCreatedAt, prevStart, monthStart);

        String login = me.login();
        Integer tailorNow = aiCount(login, TAILOR_TASKS, monthStart, null);
        Integer tailorPrev = aiCount(login, TAILOR_TASKS, prevStart, monthStart);
        Integer optimizeNow = aiCount(login, OPTIMIZE_TASKS, monthStart, null);
        Integer optimizePrev = aiCount(login, OPTIMIZE_TASKS, prevStart, monthStart);

        // With the licence reader, "on" is the consultant's own licence.
        java.util.Map<String, Integer> licensed = licenses == null ? null : licenses.liveFeatures(org, c.getId(), now);
        List<Feature> features = catalog().stream().map(d -> {
            Integer used = null;
            Integer last = null;
            switch (d.key()) {
                case "job-matching" -> { used = viewsNow; last = viewsPrev; }
                case "interview-prep" -> { used = prepNow; last = prepPrev; }
                case "application-tracking" -> { used = apps.size(); last = appsPrev; }
                case "resume-tailoring" -> { used = tailorNow; last = tailorPrev; }
                case "resume-optimization" -> { used = optimizeNow; last = optimizePrev; }
                default -> { }
            }
            String status = licensed == null || licensed.containsKey(LICENSE_KEY.get(d.key())) ? "ENABLED" : "NOT_AVAILABLE";
            boolean sample = licensed == null || d.allowance() != null;
            return new Feature(d.key(), d.title(), d.description(), d.tone(), d.icon(), status, d.premium(), d.allowance(), used, last, d.unit(), d.usedNote(), d.allowance() == null ? null : resetsOn, d.href(), d.actionLabel(), d.overview(), sample);
        }).toList();

        long active = features.stream().filter(f -> "ENABLED".equals(f.status())).count();
        long premium = features.stream().filter(f -> f.premium() && "ENABLED".equals(f.status())).count();
        long usedThisMonth = (long) viewsNow + prepNow + appsNow;
        long prevTotal = (long) viewsPrev + prepPrev + appsPrev;
        Double delta = prevTotal == 0 ? null : Math.round((usedThisMonth - prevTotal) * 1000.0 / prevTotal) / 10.0;

        Feature credits = features.stream().filter(f -> "resume-tailoring".equals(f.key())).findFirst().orElse(null);
        Long creditsLeft = credits == null || credits.allowance() == null ? null : (long) Math.max(0, credits.allowance() - (credits.used() == null ? 0 : credits.used()));
        // with a real licence, never show credits that are not counted (tailoring has no metered action yet) or that the licence does not carry
        if (licensed != null && (credits == null || credits.used() == null || !"ENABLED".equals(credits.status()))) creditsLeft = null;
        long expiring = !renewsOn.isAfter(today.plusDays(30)) ? 1 : 0;

        boolean real = licensed != null;
        Tiles tiles = new Tiles(active, !real, creditsLeft, creditsLeft == null && real ? null : credits == null ? null : credits.allowance(), true, usedThisMonth, delta, premium, !real, expiring, renewsOn, true);
        return new Response(org, now, c.getDisplayName(), !real, tiles, features, aiBudgetOf(login));
    }

    /** Successful AI calls of {@code tasks} by {@code login} in [from, before); null without the ledger (never a made-up number). */
    private Integer aiCount(String login, List<String> tasks, Instant from, Instant before) {
        if (aiCalls == null || login == null) return null;
        long since = aiCalls.countByLoginAndTaskInAndCreatedAtGreaterThanEqual(login, tasks, from);
        long after = before == null ? 0 : aiCalls.countByLoginAndTaskInAndCreatedAtGreaterThanEqual(login, tasks, before);
        return (int) Math.max(0, since - after);
    }

    /** The organization-paid AI budget of an enterprise account, or null (a personal login's AI is not the organization's; decision 2026-11-15). */
    private com.dossier.api.service.ent.consultantws.ConsultantFeaturesDTO.AiBudget aiBudgetOf(String login) {
        if (aiBudget == null || !com.dossier.api.config.Constants.isEnterpriseLogin(login)) return null;
        com.dossier.api.service.AiBudgetService.Usage u = aiBudget.usage(login);
        if (!"budget".equals(u.metered())) return null;
        return new com.dossier.api.service.ent.consultantws.ConsultantFeaturesDTO.AiBudget(Math.min(100, Math.max(0, u.used())), u.resetsAt(), u.economy());
    }

    private static <T> int count(List<T> rows, Function<T, Instant> at, Instant from, Instant before) {
        return (int) rows.stream().filter(r -> {
            Instant t = at.apply(r);
            return t != null && !t.isBefore(from) && (before == null || t.isBefore(before));
        }).count();
    }
}
