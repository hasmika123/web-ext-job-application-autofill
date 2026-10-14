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
 * <p>Which features exist, whether they are on, and their monthly allowances are ADMIN inputs in the real product (EntitlementService + the admin
 * catalog). That admin catalog and this role have not merged, so {@link #catalog()} is a static default and every status and allowance is a
 * demo stand-in ({@code sample = true}); replace it with EntitlementService when they merge. Usage is real where the product records the
 * action: Job Matching = the consultant's own match views this month, Interview Prep = their own prep sessions this month, Email Application
 * Tracking = their own applications. AI Resume Tailoring and Resume Optimization have no metered action in the product yet, so {@code used}
 * is null (never a made-up number). Every query is organization id first plus the caller's own consultant id.
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

    /** One static catalog entry (the admin catalog stand-in). */
    record Def(String key, String title, String description, String tone, String icon, boolean premium, Integer allowance, String unit, String usedNote, String href, String actionLabel, boolean overview) {}

    static List<Def> catalog() {
        return List.of(
            new Def("job-matching", "AI Job Matching", "Get AI-powered job matches based on your skills and preferences.", "accent", "search", false, null, "matches", "viewed this month", "/w/consultant/matches", "View", false),
            new Def("resume-tailoring", "AI Resume Tailoring", "Generate tailored resumes for specific job opportunities.", "violet", "file", true, 50, "credits", "used this month", "/w/consultant/resumes", "Use", true),
            new Def("interview-prep", "Interview Prep", "Practice with AI-powered interview questions and feedback.", "green", "video", true, 20, "sessions", "used this month", "/w/consultant/interview-prep", "Use", true),
            new Def("application-tracking", "Email Application Tracking", "Track your job applications and get status updates automatically.", "amber", "mail", false, null, "applications", "tracked", "/w/consultant/applications", "View", true),
            new Def("resume-optimization", "Resume Optimization", "Get AI recommendations to improve your resume and skills.", "coral", "sparkles", true, 20, "optimizations", "used this month", "/w/consultant/resumes", "Use", true)
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

        List<Feature> features = catalog().stream().map(d -> {
            Integer used = null;
            Integer last = null;
            switch (d.key()) {
                case "job-matching" -> { used = viewsNow; last = viewsPrev; }
                case "interview-prep" -> { used = prepNow; last = prepPrev; }
                case "application-tracking" -> { used = apps.size(); last = appsPrev; }
                default -> { }
            }
            return new Feature(d.key(), d.title(), d.description(), d.tone(), d.icon(), "ENABLED", d.premium(), d.allowance(), used, last, d.unit(), d.usedNote(), d.allowance() == null ? null : resetsOn, d.href(), d.actionLabel(), d.overview(), true);
        }).toList();

        long active = features.stream().filter(f -> "ENABLED".equals(f.status())).count();
        long premium = features.stream().filter(f -> f.premium() && "ENABLED".equals(f.status())).count();
        long usedThisMonth = (long) viewsNow + prepNow + appsNow;
        long prevTotal = (long) viewsPrev + prepPrev + appsPrev;
        Double delta = prevTotal == 0 ? null : Math.round((usedThisMonth - prevTotal) * 1000.0 / prevTotal) / 10.0;

        Feature credits = features.stream().filter(f -> "resume-tailoring".equals(f.key())).findFirst().orElse(null);
        Long creditsLeft = credits == null || credits.allowance() == null ? null : (long) Math.max(0, credits.allowance() - (credits.used() == null ? 0 : credits.used()));
        long expiring = !renewsOn.isAfter(today.plusDays(30)) ? 1 : 0;

        Tiles tiles = new Tiles(active, true, creditsLeft, credits == null ? null : credits.allowance(), true, usedThisMonth, delta, premium, true, expiring, renewsOn, true);
        return new Response(org, now, c.getDisplayName(), true, tiles, features);
    }

    private static <T> int count(List<T> rows, Function<T, Instant> at, Instant from, Instant before) {
        return (int) rows.stream().filter(r -> {
            Instant t = at.apply(r);
            return t != null && !t.isBefore(from) && (before == null || t.isBefore(before));
        }).count();
    }
}
