package com.dossier.api.service.ent.consultantws;

import com.dossier.api.domain.ent.consultantws.CwsMatchInterest;
import com.dossier.api.domain.ent.consultantws.CwsMatchView;
import com.dossier.api.domain.ent.consultantws.CwsSavedJob;
import com.dossier.api.domain.ent.talent.ClientAccount;
import com.dossier.api.domain.ent.talent.ClientRequirement;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.ent.talent.ConsultantSkill;
import com.dossier.api.domain.ent.talent.RequirementMatch;
import com.dossier.api.domain.ent.talent.RequirementSkill;
import com.dossier.api.domain.ent.talent.TalentApplication;
import com.dossier.api.repository.ent.consultantws.CwsMatchInterestRepository;
import com.dossier.api.repository.ent.consultantws.CwsMatchViewRepository;
import com.dossier.api.repository.ent.consultantws.CwsSavedJobRepository;
import com.dossier.api.repository.ent.talent.ClientAccountRepository;
import com.dossier.api.repository.ent.talent.ClientRequirementRepository;
import com.dossier.api.repository.ent.talent.ConsultantSkillRepository;
import com.dossier.api.repository.ent.talent.OrgResumeRepository;
import com.dossier.api.repository.ent.talent.RequirementMatchRepository;
import com.dossier.api.repository.ent.talent.RequirementSkillRepository;
import com.dossier.api.repository.ent.talent.TalentApplicationRepository;
import com.dossier.api.service.TrackerException;
import com.dossier.api.service.ent.consultantws.ConsultantHomeDTO.Check;
import com.dossier.api.service.ent.consultantws.ConsultantHomeDTO.Tile;
import com.dossier.api.service.ent.consultantws.JobMatchesDTO.Alert;
import com.dossier.api.service.ent.consultantws.JobMatchesDTO.Bullet;
import com.dossier.api.service.ent.consultantws.JobMatchesDTO.Detail;
import com.dossier.api.service.ent.consultantws.JobMatchesDTO.Improvement;
import com.dossier.api.service.ent.consultantws.JobMatchesDTO.InterestResponse;
import com.dossier.api.service.ent.consultantws.JobMatchesDTO.MatchRow;
import com.dossier.api.service.ent.consultantws.JobMatchesDTO.Quality;
import com.dossier.api.service.ent.consultantws.JobMatchesDTO.Response;
import com.dossier.api.service.ent.consultantws.JobMatchesDTO.SavedResponse;
import com.dossier.api.service.ent.consultantws.JobMatchesDTO.SkillFit;
import com.dossier.api.service.ent.consultantws.JobMatchesDTO.Tiles;
import com.dossier.api.service.ent.consultantws.JobMatchesDTO.ViewResponse;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import com.dossier.api.service.privacy.SensitiveContent;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The Consultant workspace Job Matches page (docs/enterprise-v2/page-consultant-matches.md). The gate is {@link ConsultantHomeService#requireSelf}
 * (Consultant role, own consultant_profile, else the generic 404). Every query is organization id first plus the caller's own consultant id;
 * a match id that is not one of the caller's own (or is dismissed) is the same 404, never a 403.
 */
@Service
public class JobMatchesService {

    static final int MAX_NOTE = 500;
    static final int WEEKS = 6;
    private static final int ALERT_DAYS = 14;

    private final ConsultantHomeService gate;
    private final RequirementMatchRepository matches;
    private final ClientRequirementRepository requirements;
    private final ClientAccountRepository clients;
    private final RequirementSkillRepository requirementSkills;
    private final ConsultantSkillRepository consultantSkills;
    private final CwsSavedJobRepository saved;
    private final CwsMatchViewRepository views;
    private final CwsMatchInterestRepository interests;
    private final OrgResumeRepository resumes;
    private final TalentApplicationRepository applications;
    private final Clock clock;

    @Autowired
    public JobMatchesService(
        ConsultantHomeService gate,
        RequirementMatchRepository matches,
        ClientRequirementRepository requirements,
        ClientAccountRepository clients,
        RequirementSkillRepository requirementSkills,
        ConsultantSkillRepository consultantSkills,
        CwsSavedJobRepository saved,
        CwsMatchViewRepository views,
        CwsMatchInterestRepository interests,
        OrgResumeRepository resumes,
        TalentApplicationRepository applications
    ) {
        this(gate, matches, requirements, clients, requirementSkills, consultantSkills, saved, views, interests, resumes, applications, Clock.systemUTC());
    }

    JobMatchesService(
        ConsultantHomeService gate,
        RequirementMatchRepository matches,
        ClientRequirementRepository requirements,
        ClientAccountRepository clients,
        RequirementSkillRepository requirementSkills,
        ConsultantSkillRepository consultantSkills,
        CwsSavedJobRepository saved,
        CwsMatchViewRepository views,
        CwsMatchInterestRepository interests,
        OrgResumeRepository resumes,
        TalentApplicationRepository applications,
        Clock clock
    ) {
        this.gate = gate;
        this.matches = matches;
        this.requirements = requirements;
        this.clients = clients;
        this.requirementSkills = requirementSkills;
        this.consultantSkills = consultantSkills;
        this.saved = saved;
        this.views = views;
        this.interests = interests;
        this.resumes = resumes;
        this.applications = applications;
        this.clock = clock;
    }

    // ---- the page -------------------------------------------------------------------------------------------------

    @Transactional(readOnly = true)
    public Response page(OrgMembership me) {
        ConsultantProfile c = gate.requireSelf(me);
        Long org = c.getOrgId();
        Instant now = Instant.now(clock);

        List<RequirementMatch> open = openMatches(org, c.getId());
        Map<Long, ClientRequirement> reqs = requirements.findAllById(open.stream().map(RequirementMatch::getRequirementId).distinct().toList()).stream()
            .filter(r -> org.equals(r.getOrgId()))
            .collect(Collectors.toMap(ClientRequirement::getId, Function.identity()));
        Map<Long, ClientAccount> clientById = clients.findByOrgId(org).stream().collect(Collectors.toMap(ClientAccount::getId, Function.identity()));
        Set<String> mine = skillNames(consultantSkills.findByOrgIdAndConsultantIdOrderBySortOrderAsc(org, c.getId()));
        Map<Long, List<RequirementSkill>> jobSkills = requirementSkills.findByOrgIdAndRequirementIdIn(org, reqs.keySet()).stream().collect(Collectors.groupingBy(RequirementSkill::getRequirementId));

        List<CwsSavedJob> savedRows = saved.findByOrgIdAndConsultantIdOrderByCreatedAtDesc(org, c.getId());
        List<CwsMatchView> viewRows = views.findByOrgIdAndConsultantId(org, c.getId());
        Set<Long> savedReqs = savedRows.stream().map(CwsSavedJob::getRequirementId).collect(Collectors.toSet());
        Set<Long> viewedReqs = viewRows.stream().map(CwsMatchView::getRequirementId).collect(Collectors.toSet());
        Set<Long> interestReqs = interests.findByOrgIdAndConsultantId(org, c.getId()).stream().map(CwsMatchInterest::getRequirementId).collect(Collectors.toSet());

        List<MatchRow> rows = open.stream()
            .map(m -> row(m, reqs.get(m.getRequirementId()), clientById, jobSkills.getOrDefault(m.getRequirementId(), List.of()), mine, savedReqs, viewedReqs, interestReqs))
            .filter(Objects::nonNull)
            .toList();

        List<Instant> created = open.stream().map(RequirementMatch::getCreatedAt).toList();
        List<RequirementMatch> high = open.stream().filter(m -> score(m) >= 80).toList();
        Tiles tiles = new Tiles(
            ConsultantHomeService.tile(open.size(), created, now, false),
            ConsultantHomeService.tile(high.size(), high.stream().map(RequirementMatch::getCreatedAt).toList(), now, false),
            windowTile(created, now),
            ConsultantHomeService.tile(savedRows.size(), savedRows.stream().map(CwsSavedJob::getCreatedAt).toList(), now, false),
            ConsultantHomeService.tile(viewRows.size(), viewRows.stream().map(CwsMatchView::getViewedAt).toList(), now, false)
        );
        return new Response(org, now, c.getDisplayName(), tiles, rows, quality(c, mine.size(), org), alerts(c, open, reqs, clientById, now));
    }

    /** "New in the last 7 days" against "new in the 7 days before": the value, the previous window, the change and six weekly counts. */
    static Tile windowTile(List<Instant> stamps, Instant now) {
        Instant w1 = now.minus(Duration.ofDays(7));
        Instant w2 = now.minus(Duration.ofDays(14));
        long value = stamps.stream().filter(t -> t != null && t.isAfter(w1)).count();
        long previous = stamps.stream().filter(t -> t != null && t.isAfter(w2) && !t.isAfter(w1)).count();
        Double delta = previous == 0 ? null : Math.round(((value - previous) * 1000.0) / previous) / 10.0;
        List<Long> spark = new ArrayList<>();
        for (int w = WEEKS - 1; w >= 0; w--) {
            Instant end = now.minus(Duration.ofDays(7L * w));
            Instant start = end.minus(Duration.ofDays(7));
            spark.add(stamps.stream().filter(t -> t != null && t.isAfter(start) && !t.isAfter(end)).count());
        }
        return new Tile(value, previous, delta, spark, false);
    }

    // ---- one match ------------------------------------------------------------------------------------------------

    @Transactional(readOnly = true)
    public Detail detail(OrgMembership me, long matchId) {
        ConsultantProfile c = gate.requireSelf(me);
        Long org = c.getOrgId();
        RequirementMatch m = ownMatch(org, c.getId(), matchId);
        ClientRequirement r = requirements.findByOrgIdAndId(org, m.getRequirementId()).orElseThrow(OrgNotFoundException::new);
        Map<Long, ClientAccount> clientById = r.getClientId() == null ? Map.of() : clients.findByOrgIdAndId(org, r.getClientId()).map(cl -> Map.of(cl.getId(), cl)).orElse(Map.of());
        List<ConsultantSkill> mineRows = consultantSkills.findByOrgIdAndConsultantIdOrderBySortOrderAsc(org, c.getId());
        Set<String> mine = skillNames(mineRows);
        Set<String> primary = mineRows.stream().filter(ConsultantSkill::isPrimarySkill).map(s -> norm(s.getSkill())).collect(Collectors.toSet());
        List<RequirementSkill> jobSkills = requirementSkills.findByOrgIdAndRequirementIdIn(org, List.of(r.getId()));
        Set<Long> one = Set.of(r.getId());
        Optional<CwsMatchInterest> interest = interests.findByOrgIdAndConsultantIdAndRequirementId(org, c.getId(), r.getId());
        MatchRow row = row(
            m, r, clientById, jobSkills, mine,
            saved.findByOrgIdAndConsultantIdAndRequirementId(org, c.getId(), r.getId()).isPresent() ? one : Set.of(),
            views.findByOrgIdAndConsultantIdAndRequirementId(org, c.getId(), r.getId()).isPresent() ? one : Set.of(),
            interest.isPresent() ? one : Set.of()
        );

        // the consultant's primary skills first, then the job's own order; present = 100%, missing = 0% (no proficiency data exists)
        List<SkillFit> fit = jobSkills.stream()
            .sorted(Comparator.comparing((RequirementSkill s) -> !primary.contains(norm(s.getSkill()))).thenComparing(s -> s.getSortOrder() == null ? 0 : s.getSortOrder()))
            .map(s -> {
                boolean has = mine.contains(norm(s.getSkill()));
                return new SkillFit(s.getSkill(), has, primary.contains(norm(s.getSkill())), has ? 100 : 0);
            })
            .toList();
        List<String> have = fit.stream().filter(SkillFit::present).map(SkillFit::skill).toList();
        List<String> missing = fit.stream().filter(s -> !s.present()).map(SkillFit::skill).toList();

        List<Bullet> why = new ArrayList<>();
        if (!fit.isEmpty()) {
            String list = have.isEmpty() ? "." : " (" + String.join(", ", have.stream().limit(4).toList()) + ").";
            why.add(new Bullet("skills", "You have " + have.size() + " of the " + fit.size() + " skills this role lists" + list, !have.isEmpty()));
        }
        experienceBullet(c, r).ifPresent(why::add);
        modeBullet(c, r).ifPresent(why::add);

        List<Improvement> improve = new ArrayList<>();
        missing.stream().limit(3).forEach(s -> improve.add(new Improvement("GAP", s, "Consider gaining hands-on experience with " + s + ".")));
        if (!c.isHasCertifications()) improve.add(new Improvement("SUGGESTED", "Certifications", "Add certifications that relate to " + (r.getTitle() == null ? "this role" : r.getTitle()) + "."));
        if (!c.isHasPreferences()) improve.add(new Improvement("SUGGESTED", "Job preferences", "Set your job preferences so matches fit what you want."));
        if (resumes.findByOrgIdAndConsultantId(org, c.getId()).isEmpty()) improve.add(new Improvement("SUGGESTED", "Latest resume", "Upload your latest resume so your experience can be matched."));

        return new Detail(row, m.getReason(), fit, why, improve.stream().limit(5).toList(), interest.map(CwsMatchInterest::getCreatedAt).orElse(null), interest.map(CwsMatchInterest::getNote).orElse(null));
    }

    private Optional<Bullet> experienceBullet(ConsultantProfile c, ClientRequirement r) {
        String level = r.getExperienceLevel();
        if (level == null || c.getYearsExperience() == null) return Optional.empty();
        int needed = switch (level.toUpperCase(Locale.ROOT)) {
            case "JUNIOR", "ENTRY" -> 0;
            case "MID" -> 3;
            case "SENIOR" -> 5;
            case "LEAD", "PRINCIPAL" -> 8;
            default -> -1;
        };
        if (needed < 0) return Optional.empty();
        String name = level.toLowerCase(Locale.ROOT);
        int years = c.getYearsExperience();
        return Optional.of(
            years >= needed
                ? new Bullet("experience", years + " years of experience meets the " + name + " level this role asks for.", true)
                : new Bullet("experience", "This is a " + name + " role (about " + needed + "+ years) and your profile shows " + years + ".", false)
        );
    }

    private Optional<Bullet> modeBullet(ConsultantProfile c, ClientRequirement r) {
        String want = r.getWorkMode();
        if (want == null) return Optional.empty();
        if ("REMOTE".equals(want)) return Optional.of(new Bullet("mode", "This role is remote, so location is not a barrier.", true));
        String mine = c.getWorkMode();
        if (mine == null) return Optional.empty();
        String place = r.getLocation() == null ? "" : " in " + r.getLocation();
        if (mine.equals(want) || "FLEXIBLE".equals(mine) || "ANY".equals(mine)) return Optional.of(new Bullet("mode", "The " + want.toLowerCase(Locale.ROOT) + " setup" + place + " fits your work preference.", true));
        return Optional.of(new Bullet("mode", "This role is " + want.toLowerCase(Locale.ROOT) + place + " and you prefer " + mine.toLowerCase(Locale.ROOT) + " work.", false));
    }

    // ---- writes (all own-row, org-scoped, 404 for anything else) -------------------------------------------------

    /** Records that the consultant opened View Match. Idempotent: the first view time is kept. */
    @Transactional
    public ViewResponse recordView(OrgMembership me, long matchId) {
        ConsultantProfile c = gate.requireSelf(me);
        RequirementMatch m = ownMatch(c.getOrgId(), c.getId(), matchId);
        if (views.findByOrgIdAndConsultantIdAndRequirementId(c.getOrgId(), c.getId(), m.getRequirementId()).isEmpty()) {
            CwsMatchView v = new CwsMatchView();
            v.setOrgId(c.getOrgId());
            v.setConsultantId(c.getId());
            v.setRequirementId(m.getRequirementId());
            v.setViewedAt(Instant.now(clock));
            views.save(v);
        }
        return new ViewResponse(matchId, true);
    }

    @Transactional
    public SavedResponse save(OrgMembership me, long matchId) {
        ConsultantProfile c = gate.requireSelf(me);
        RequirementMatch m = ownMatch(c.getOrgId(), c.getId(), matchId);
        if (saved.findByOrgIdAndConsultantIdAndRequirementId(c.getOrgId(), c.getId(), m.getRequirementId()).isEmpty()) {
            CwsSavedJob s = new CwsSavedJob();
            s.setOrgId(c.getOrgId());
            s.setConsultantId(c.getId());
            s.setRequirementId(m.getRequirementId());
            s.setCreatedAt(Instant.now(clock));
            saved.save(s);
        }
        return new SavedResponse(matchId, true);
    }

    @Transactional
    public SavedResponse unsave(OrgMembership me, long matchId) {
        ConsultantProfile c = gate.requireSelf(me);
        RequirementMatch m = ownMatch(c.getOrgId(), c.getId(), matchId);
        saved.findByOrgIdAndConsultantIdAndRequirementId(c.getOrgId(), c.getId(), m.getRequirementId()).ifPresent(saved::delete);
        return new SavedResponse(matchId, false);
    }

    /**
     * "Express Interest": the consultant says they want this job. Records one row and nothing else: no application, no submission, no
     * status change (Kiwiply never submits; the marketer picks it up later). Idempotent: a second call returns the first one's time.
     */
    @Transactional
    public InterestResponse expressInterest(OrgMembership me, long matchId, String note) {
        ConsultantProfile c = gate.requireSelf(me);
        RequirementMatch m = ownMatch(c.getOrgId(), c.getId(), matchId);
        String clean = cleanNote(note);
        CwsMatchInterest row = interests.findByOrgIdAndConsultantIdAndRequirementId(c.getOrgId(), c.getId(), m.getRequirementId()).orElse(null);
        if (row == null) {
            row = new CwsMatchInterest();
            row.setOrgId(c.getOrgId());
            row.setConsultantId(c.getId());
            row.setRequirementId(m.getRequirementId());
            row.setNote(clean);
            row.setCreatedAt(Instant.now(clock));
            row = interests.save(row);
        }
        return new InterestResponse(matchId, true, row.getCreatedAt());
    }

    static String cleanNote(String note) {
        if (note == null) return null;
        String v = note.strip();
        if (v.isEmpty()) return null;
        if (v.length() > MAX_NOTE) throw TrackerException.invalid("note", "is longer than " + MAX_NOTE + " characters");
        SensitiveContent.check("note", "note", v);
        return v;
    }

    // ---- helpers --------------------------------------------------------------------------------------------------

    private List<RequirementMatch> openMatches(Long org, Long consultantId) {
        return matches.findByOrgIdAndConsultantIdOrderByScoreDesc(org, consultantId).stream().filter(m -> !"DISMISSED".equals(m.getStatus())).toList();
    }

    private RequirementMatch ownMatch(Long org, Long consultantId, long matchId) {
        RequirementMatch m = matches.findByOrgIdAndId(org, matchId).orElseThrow(OrgNotFoundException::new);
        if (!consultantId.equals(m.getConsultantId()) || "DISMISSED".equals(m.getStatus())) throw new OrgNotFoundException();
        return m;
    }

    private static int score(RequirementMatch m) {
        return m.getScore() == null ? 0 : m.getScore();
    }

    private static String norm(String s) {
        return s == null ? "" : s.strip().toLowerCase(Locale.ROOT);
    }

    private static Set<String> skillNames(List<ConsultantSkill> rows) {
        return rows.stream().map(s -> norm(s.getSkill())).collect(Collectors.toCollection(LinkedHashSet::new));
    }

    private MatchRow row(
        RequirementMatch m, ClientRequirement r, Map<Long, ClientAccount> clientById, List<RequirementSkill> jobSkills, Set<String> mine,
        Set<Long> savedReqs, Set<Long> viewedReqs, Set<Long> interestReqs
    ) {
        if (r == null) return null;
        ClientAccount cl = r.getClientId() == null ? null : clientById.get(r.getClientId());
        Integer fit = jobSkills.isEmpty() ? null : (int) Math.round(100.0 * jobSkills.stream().filter(s -> mine.contains(norm(s.getSkill()))).count() / jobSkills.size());
        return new MatchRow(
            m.getId(), r.getId(), r.getTitle(), cl == null ? null : cl.getName(), r.getLocation(), r.getWorkMode(), r.getEmploymentLabel(), score(m), fit,
            r.getPostedAt(), r.getRateMinMinor(), r.getRateMaxMinor(), r.getRateUnit(), r.getCurrency(),
            savedReqs.contains(r.getId()), viewedReqs.contains(r.getId()), interestReqs.contains(r.getId())
        );
    }

    private Quality quality(ConsultantProfile c, int skillCount, Long org) {
        boolean hasResume = !resumes.findByOrgIdAndConsultantId(org, c.getId()).isEmpty();
        int pct = c.getProfileCompleteness() == null ? 0 : Math.max(0, Math.min(100, c.getProfileCompleteness()));
        List<Check> checks = List.of(
            new Check("profile", "Keep your profile up to date", pct >= 80),
            new Check("skills", "Add missing skills", skillCount >= 3),
            new Check("resume", "Upload latest resume", hasResume),
            new Check("preferences", "Set your job preferences", c.isHasPreferences()),
            new Check("certifications", "Add certifications", c.isHasCertifications())
        );
        return new Quality(pct, checks);
    }

    private List<Alert> alerts(ConsultantProfile c, List<RequirementMatch> open, Map<Long, ClientRequirement> reqs, Map<Long, ClientAccount> clientById, Instant now) {
        Long org = c.getOrgId();
        Instant since = now.minus(Duration.ofDays(ALERT_DAYS));
        Instant weekAgo = now.minus(Duration.ofDays(7));
        List<Alert> out = new ArrayList<>();

        List<RequirementMatch> fresh = open.stream().filter(m -> m.getCreatedAt() != null && m.getCreatedAt().isAfter(weekAgo)).toList();
        if (!fresh.isEmpty()) {
            Instant latest = fresh.stream().map(RequirementMatch::getCreatedAt).max(Comparator.naturalOrder()).orElse(now);
            out.add(new Alert("new-matches", "NEW_MATCHES", fresh.size() + " new job match" + (fresh.size() == 1 ? "" : "es"), "Based on your profile and preferences", latest));
        }

        // an assigned role edited after it was created (a minute of slack so the create itself does not count)
        for (RequirementMatch m : open) {
            if (!"ASSIGNED".equals(m.getStatus())) continue;
            ClientRequirement r = reqs.get(m.getRequirementId());
            if (r == null || r.getUpdatedAt() == null || r.getCreatedAt() == null) continue;
            if (r.getUpdatedAt().isAfter(since) && r.getUpdatedAt().isAfter(r.getCreatedAt().plusSeconds(60))) {
                ClientAccount cl = r.getClientId() == null ? null : clientById.get(r.getClientId());
                out.add(new Alert("role-" + m.getId(), "ROLE_UPDATED", "A role assigned to you has been updated", r.getTitle() + (cl == null ? "" : " at " + cl.getName()), r.getUpdatedAt()));
            }
        }

        List<TalentApplication> apps = applications.findByOrgIdAndConsultantId(org, c.getId());
        Map<Long, ClientRequirement> appReqs = requirements.findAllById(apps.stream().map(TalentApplication::getRequirementId).filter(Objects::nonNull).distinct().toList()).stream()
            .filter(r -> org.equals(r.getOrgId()))
            .collect(Collectors.toMap(ClientRequirement::getId, Function.identity()));
        for (TalentApplication a : apps) {
            if (a.getStageChangedAt() == null || !a.getStageChangedAt().isAfter(since)) continue;
            ClientRequirement r = appReqs.get(a.getRequirementId());
            out.add(new Alert("app-" + a.getId(), "APPLICATION_UPDATE", "Application update", (r == null ? "Your application" : r.getTitle()) + " is now " + stageText(a), a.getStageChangedAt()));
        }
        return out.stream().sorted(Comparator.comparing(Alert::at).reversed()).limit(5).toList();
    }

    static String stageText(TalentApplication a) {
        String stage = a.getStage() == null ? "" : a.getStage();
        return switch (stage) {
            case "ASSIGNED" -> "prepared";
            case "SUBMITTED" -> "submitted";
            case "UNDER_REVIEW" -> "under review";
            case "INTERVIEWING" -> "in the interview stage";
            case "OFFER" -> "at the offer stage";
            case "CLOSED" -> "closed";
            default -> stage.isEmpty() ? "updated" : stage.toLowerCase(Locale.ROOT).replace('_', ' ');
        };
    }
}
