package com.dossier.api.service.ent.consultantws;

import com.dossier.api.domain.ent.consultantws.CwsPrepAnswer;
import com.dossier.api.domain.ent.consultantws.CwsPrepCheck;
import com.dossier.api.domain.ent.consultantws.CwsPrepSession;
import com.dossier.api.domain.ent.talent.ClientAccount;
import com.dossier.api.domain.ent.talent.ClientRequirement;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.ent.talent.ConsultantSkill;
import com.dossier.api.domain.ent.talent.TalentApplication;
import com.dossier.api.domain.ent.talent.TalentInterview;
import com.dossier.api.repository.ent.consultantws.CwsPrepAnswerRepository;
import com.dossier.api.repository.ent.consultantws.CwsPrepCheckRepository;
import com.dossier.api.repository.ent.consultantws.CwsPrepSessionRepository;
import com.dossier.api.repository.ent.talent.ClientAccountRepository;
import com.dossier.api.repository.ent.talent.ClientRequirementRepository;
import com.dossier.api.repository.ent.talent.ConsultantSkillRepository;
import com.dossier.api.repository.ent.talent.TalentApplicationRepository;
import com.dossier.api.repository.ent.talent.TalentInterviewRepository;
import com.dossier.api.service.TrackerException;
import com.dossier.api.service.ent.authz.AuthorizationService;
import com.dossier.api.service.ent.authz.AuthzOperation;
import com.dossier.api.service.ent.authz.AuthzRequest;
import com.dossier.api.service.ent.authz.Beneficiary;
import com.dossier.api.service.ent.consultantws.InterviewPrepCatalog.ModuleDef;
import com.dossier.api.service.ent.consultantws.InterviewPrepCatalog.Q;
import com.dossier.api.service.ent.consultantws.InterviewPrepDTO.AnswerInput;
import com.dossier.api.service.ent.consultantws.InterviewPrepDTO.AnswerRow;
import com.dossier.api.service.ent.consultantws.InterviewPrepDTO.CheckResponse;
import com.dossier.api.service.ent.consultantws.InterviewPrepDTO.ChecklistItem;
import com.dossier.api.service.ent.consultantws.InterviewPrepDTO.Module;
import com.dossier.api.service.ent.consultantws.InterviewPrepDTO.NextInterview;
import com.dossier.api.service.ent.consultantws.InterviewPrepDTO.PrepTile;
import com.dossier.api.service.ent.consultantws.InterviewPrepDTO.Question;
import com.dossier.api.service.ent.consultantws.InterviewPrepDTO.Response;
import com.dossier.api.service.ent.consultantws.InterviewPrepDTO.SessionDetail;
import com.dossier.api.service.ent.consultantws.InterviewPrepDTO.SessionRequest;
import com.dossier.api.service.ent.consultantws.InterviewPrepDTO.SessionRow;
import com.dossier.api.service.ent.consultantws.InterviewPrepDTO.Tiles;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import com.dossier.api.service.privacy.SensitiveContent;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The Consultant workspace Interview Prep page (docs/enterprise-v2/page-consultant-interview-prep.md). The gate is
 * {@link ConsultantHomeService#requireSelf}; every query is organization id first plus the caller's own consultant id. There is no AI
 * here: a practice session is questions from the in-code catalog that the consultant scores themselves.
 */
@Service
public class InterviewPrepService {

    public static final String WRITE_PERMISSION = "interviews.manage";
    public static final int WEAK_BELOW = 75;
    static final int WEEKS = 6;
    static final int HISTORY_LIMIT = 100;
    static final int MAX_NOTES = 1000;
    static final int MAX_MINUTES = 600;
    private static final int MAX_CHIPS = 6;

    private final ConsultantHomeService gate;
    private final AuthorizationService authorization;
    private final CwsPrepSessionRepository sessions;
    private final CwsPrepAnswerRepository answers;
    private final CwsPrepCheckRepository checks;
    private final TalentInterviewRepository interviews;
    private final TalentApplicationRepository applications;
    private final ClientRequirementRepository requirements;
    private final ClientAccountRepository clients;
    private final ConsultantSkillRepository skills;
    private final Clock clock;

    @Autowired
    public InterviewPrepService(
        ConsultantHomeService gate,
        AuthorizationService authorization,
        CwsPrepSessionRepository sessions,
        CwsPrepAnswerRepository answers,
        CwsPrepCheckRepository checks,
        TalentInterviewRepository interviews,
        TalentApplicationRepository applications,
        ClientRequirementRepository requirements,
        ClientAccountRepository clients,
        ConsultantSkillRepository skills
    ) {
        this(gate, authorization, sessions, answers, checks, interviews, applications, requirements, clients, skills, Clock.systemUTC());
    }

    InterviewPrepService(
        ConsultantHomeService gate,
        AuthorizationService authorization,
        CwsPrepSessionRepository sessions,
        CwsPrepAnswerRepository answers,
        CwsPrepCheckRepository checks,
        TalentInterviewRepository interviews,
        TalentApplicationRepository applications,
        ClientRequirementRepository requirements,
        ClientAccountRepository clients,
        ConsultantSkillRepository skills,
        Clock clock
    ) {
        this.gate = gate;
        this.authorization = authorization;
        this.sessions = sessions;
        this.answers = answers;
        this.checks = checks;
        this.interviews = interviews;
        this.applications = applications;
        this.requirements = requirements;
        this.clients = clients;
        this.skills = skills;
        this.clock = clock;
    }

    /** The consultant for a write: the read gate plus {@code interviews.manage}. */
    private ConsultantProfile requireWriter(OrgMembership me) {
        ConsultantProfile c = gate.requireSelf(me);
        authorization.require(AuthzRequest.of(me.orgId(), List.of(WRITE_PERMISSION), Beneficiary.SELF, null, AuthzOperation.WRITE).withActor(me));
        return c;
    }

    // ---- the page -------------------------------------------------------------------------------------------------

    @Transactional(readOnly = true)
    public Response page(OrgMembership me) {
        ConsultantProfile c = gate.requireSelf(me);
        Long org = c.getOrgId();
        Instant now = Instant.now(clock);

        List<TalentInterview> upcoming = interviews.findByOrgIdAndConsultantIdAndStatusAndScheduledAtAfterOrderByScheduledAtAsc(org, c.getId(), "SCHEDULED", now);
        List<NextInterview> nexts = upcoming.stream().limit(3).map(i -> nextOf(org, i)).toList();
        NextInterview next = nexts.isEmpty() ? null : nexts.get(0);

        List<ConsultantSkill> skillRows = skills.findByOrgIdAndConsultantIdOrderBySortOrderAsc(org, c.getId());
        List<String> skillNames = skillRows.stream().map(ConsultantSkill::getSkill).filter(s -> s != null && !s.isBlank()).map(String::strip).distinct().toList();

        List<CwsPrepSession> mine = sessions.findByOrgIdAndConsultantIdOrderByOccurredAtDesc(org, c.getId());
        Instant monthAgo = now.minus(Duration.ofDays(30));
        List<CwsPrepSession> olderThanMonth = mine.stream().filter(s -> !s.getOccurredAt().isAfter(monthAgo)).toList();

        // Upcoming prep sessions: the consultant's own scheduled interviews; no earlier baseline is stored, so no change figure.
        List<Integer> upcomingSpark = new ArrayList<>();
        for (int w = 0; w < WEEKS; w++) {
            Instant from = now.plus(Duration.ofDays(7L * w));
            Instant to = from.plus(Duration.ofDays(7));
            upcomingSpark.add((int) upcoming.stream().filter(i -> !i.getScheduledAt().isBefore(from) && i.getScheduledAt().isBefore(to)).count());
        }
        PrepTile upcomingTile = new PrepTile(upcoming.size(), null, null, "COUNT", upcomingSpark);

        Integer score = average(mine);
        Integer scorePrev = average(olderThanMonth);
        List<Integer> scoreSpark = new ArrayList<>();
        List<Integer> weakSpark = new ArrayList<>();
        for (int w = WEEKS - 1; w >= 0; w--) {
            Instant at = now.minus(Duration.ofDays(7L * w));
            List<CwsPrepSession> upTo = mine.stream().filter(s -> !s.getOccurredAt().isAfter(at)).toList();
            Integer a = average(upTo);
            if (a != null) scoreSpark.add(a);
            weakSpark.add(weakKinds(upTo).size());
        }
        PrepTile scoreTile = new PrepTile(score, scorePrev, score != null && scorePrev != null ? score - scorePrev : null, "POINTS", scoreSpark);

        List<String> weak = weakKinds(mine);
        int weakNow = weak.size();
        Integer weakPrev = olderThanMonth.isEmpty() ? null : weakKinds(olderThanMonth).size();
        PrepTile weakTile = new PrepTile(weakNow, weakPrev, weakPrev == null ? null : weakNow - weakPrev, "COUNT", weakSpark);

        PrepTile setsTile = new PrepTile(suggestedSets(skillNames, nexts), null, null, "COUNT", List.of());

        Map<Long, List<CwsPrepAnswer>> answerBySession = mine.isEmpty()
            ? Map.of()
            : answers.findByOrgIdAndSessionIdIn(org, mine.stream().map(CwsPrepSession::getId).toList()).stream().collect(Collectors.groupingBy(CwsPrepAnswer::getSessionId));
        List<SessionRow> history = mine.stream().limit(HISTORY_LIMIT).map(s -> row(s, answerBySession.getOrDefault(s.getId(), List.of()).size())).toList();

        Set<String> ticked = checks.findByOrgIdAndConsultantId(org, c.getId()).stream().map(CwsPrepCheck::getItemKey).collect(Collectors.toSet());
        Map<String, Instant> tickedAt = checks.findByOrgIdAndConsultantId(org, c.getId()).stream().collect(Collectors.toMap(CwsPrepCheck::getItemKey, CwsPrepCheck::getCheckedAt, (a, b) -> a));
        List<ChecklistItem> checklist = InterviewPrepCatalog.CHECKLIST.stream()
            .map(d -> new ChecklistItem(d.key(), d.label(), ticked.contains(d.key()), tickedAt.get(d.key())))
            .toList();

        return new Response(org, now, c.getDisplayName(), new Tiles(upcomingTile, scoreTile, setsTile, weakTile), modules(skillNames), history, checklist, next, weak);
    }

    @Transactional(readOnly = true)
    public SessionDetail session(OrgMembership me, long id) {
        ConsultantProfile c = gate.requireSelf(me);
        CwsPrepSession s = own(c, id);
        return detail(s);
    }

    // ---- writes ---------------------------------------------------------------------------------------------------

    /** Records a self-scored practice session. The score is the average of the question scores; the title and question text come from the catalog. */
    @Transactional
    public SessionDetail create(OrgMembership me, SessionRequest req) {
        ConsultantProfile c = requireWriter(me);
        if (req == null) throw TrackerException.invalid("body", "is required");
        ModuleDef module = InterviewPrepCatalog.module(req.moduleKey() == null ? "" : req.moduleKey()).orElse(null);
        if (module == null || module.questions().isEmpty() || !InterviewPrepCatalog.PRACTICE.equals(module.action())) {
            throw TrackerException.invalid("moduleKey", "is not a practice module");
        }
        Integer minutes = req.durationMinutes();
        if (minutes == null || minutes < 1 || minutes > MAX_MINUTES) throw TrackerException.invalid("durationMinutes", "must be between 1 and " + MAX_MINUTES);
        String notes = cleanNotes(req.notes());

        List<AnswerInput> given = req.answers() == null ? List.of() : req.answers();
        if (given.isEmpty()) throw TrackerException.invalid("answers", "score at least one question");
        Map<String, Integer> position = new TreeMap<>();
        Map<String, Q> byId = module.questions().stream().collect(Collectors.toMap(Q::id, Function.identity()));
        for (int i = 0; i < module.questions().size(); i++) position.put(module.questions().get(i).id(), i + 1);
        Set<String> seen = new HashSet<>();
        for (AnswerInput a : given) {
            if (a == null || a.questionId() == null || !byId.containsKey(a.questionId())) throw TrackerException.invalid("answers", "has a question that is not in this module");
            if (!seen.add(a.questionId())) throw TrackerException.invalid("answers", "scores a question twice");
            if (a.score() == null || a.score() < 0 || a.score() > 100) throw TrackerException.invalid("answers", "scores must be between 0 and 100");
        }
        int total = given.stream().mapToInt(AnswerInput::score).sum();
        int score = (int) Math.round(total / (double) given.size());

        Instant now = Instant.now(clock);
        Instant nextAt = null;
        String role = null;
        List<TalentInterview> upcoming = interviews.findByOrgIdAndConsultantIdAndStatusAndScheduledAtAfterOrderByScheduledAtAsc(c.getOrgId(), c.getId(), "SCHEDULED", now);
        if (!upcoming.isEmpty()) role = nextOf(c.getOrgId(), upcoming.get(0)).role();

        CwsPrepSession s = new CwsPrepSession();
        s.setOrgId(c.getOrgId());
        s.setConsultantId(c.getId());
        s.setTitle(titleFor(role, module));
        s.setKind(module.kind());
        s.setScore(score);
        s.setDurationMinutes(minutes);
        s.setNotes(notes);
        s.setOccurredAt(now);
        s.setCreatedAt(now);
        s = sessions.save(s);
        for (AnswerInput a : given.stream().sorted((x, y) -> Integer.compare(position.get(x.questionId()), position.get(y.questionId()))).toList()) {
            CwsPrepAnswer row = new CwsPrepAnswer();
            row.setOrgId(c.getOrgId());
            row.setSessionId(s.getId());
            row.setPosition(position.get(a.questionId()));
            row.setQuestion(byId.get(a.questionId()).text());
            row.setScore(a.score());
            answers.save(row);
        }
        return detail(s);
    }

    /** Ticks or unticks one checklist item of the caller. Unticking removes the row; both directions are idempotent. */
    @Transactional
    public CheckResponse setCheck(OrgMembership me, String itemKey, Boolean checked) {
        ConsultantProfile c = requireWriter(me);
        if (itemKey == null || !InterviewPrepCatalog.isCheckKey(itemKey)) throw new OrgNotFoundException();
        if (checked == null) throw TrackerException.invalid("checked", "is required");
        CwsPrepCheck row = checks.findByOrgIdAndConsultantIdAndItemKey(c.getOrgId(), c.getId(), itemKey).orElse(null);
        if (checked) {
            if (row == null) {
                row = new CwsPrepCheck();
                row.setOrgId(c.getOrgId());
                row.setConsultantId(c.getId());
                row.setItemKey(itemKey);
                row.setCheckedAt(Instant.now(clock));
                row = checks.save(row);
            }
            return new CheckResponse(itemKey, true, row.getCheckedAt());
        }
        if (row != null) checks.delete(row);
        return new CheckResponse(itemKey, false, null);
    }

    // ---- helpers --------------------------------------------------------------------------------------------------

    static String cleanNotes(String notes) {
        if (notes == null) return null;
        String v = notes.strip();
        if (v.isEmpty()) return null;
        if (v.length() > MAX_NOTES) throw TrackerException.invalid("notes", "is longer than " + MAX_NOTES + " characters");
        SensitiveContent.check("notes", "notes", v);
        return v;
    }

    /** "Senior Java Developer - Tech Questions" when an interview is coming up, else "Technical Topics - Practice". */
    static String titleFor(String role, ModuleDef module) {
        String t = role == null || role.isBlank() ? module.title() + " - Practice" : role.strip() + " - " + module.titleSuffix();
        return t.length() > 200 ? t.substring(0, 200) : t;
    }

    /** Rounded average score, or null when there are no sessions (never a fake 0). */
    static Integer average(List<CwsPrepSession> list) {
        if (list.isEmpty()) return null;
        return (int) Math.round(list.stream().mapToInt(CwsPrepSession::getScore).average().orElse(0));
    }

    /** The kinds whose average score is below {@link #WEAK_BELOW}; kinds with no session are never weak. */
    static List<String> weakKinds(List<CwsPrepSession> list) {
        Map<String, Double> avgByKind = list.stream().collect(Collectors.groupingBy(CwsPrepSession::getKind, TreeMap::new, Collectors.averagingInt(CwsPrepSession::getScore)));
        return avgByKind.entrySet().stream().filter(e -> Math.round(e.getValue()) < WEAK_BELOW).map(Map.Entry::getKey).toList();
    }

    /** One behavioral set, one job-specific set per upcoming role (max 3), one technical set per profile skill (max 5), one research set per upcoming company (max 3). */
    static int suggestedSets(List<String> skillNames, List<NextInterview> upcoming) {
        long roles = upcoming.stream().map(NextInterview::role).filter(r -> r != null && !r.isBlank()).map(r -> r.toLowerCase(Locale.ROOT)).distinct().count();
        long companies = upcoming.stream().map(NextInterview::company).filter(r -> r != null && !r.isBlank()).map(r -> r.toLowerCase(Locale.ROOT)).distinct().count();
        return 1 + (int) Math.min(3, roles) + Math.min(5, skillNames.size()) + (int) Math.min(3, companies);
    }

    private List<Module> modules(List<String> skillNames) {
        List<Module> out = new ArrayList<>();
        for (ModuleDef d : InterviewPrepCatalog.MODULES) {
            boolean fromProfile = InterviewPrepCatalog.TECHNICAL.equals(d.key()) && !skillNames.isEmpty();
            List<String> chips = fromProfile ? skillNames.stream().limit(MAX_CHIPS).toList() : d.chips();
            out.add(new Module(d.key(), d.title(), d.description(), d.kind(), d.action(), chips, fromProfile, d.questions().stream().map(q -> new Question(q.id(), q.text())).toList()));
        }
        return out;
    }

    private NextInterview nextOf(Long org, TalentInterview i) {
        String role = null;
        String company = null;
        if (i.getApplicationId() != null) {
            TalentApplication a = applications.findByOrgIdAndId(org, i.getApplicationId()).orElse(null);
            if (a != null && a.getRequirementId() != null) {
                ClientRequirement r = requirements.findByOrgIdAndId(org, a.getRequirementId()).orElse(null);
                if (r != null) role = r.getTitle();
            }
        }
        Long clientId = i.getClientId();
        if (clientId != null) {
            ClientAccount cl = clients.findByOrgIdAndId(org, clientId).orElse(null);
            if (cl != null) company = cl.getName();
        }
        return new NextInterview(i.getId(), i.getScheduledAt(), role, company, i.getRoundLabel());
    }

    private CwsPrepSession own(ConsultantProfile c, long id) {
        CwsPrepSession s = sessions.findByOrgIdAndId(c.getOrgId(), id).orElseThrow(OrgNotFoundException::new);
        if (!c.getId().equals(s.getConsultantId())) throw new OrgNotFoundException();
        return s;
    }

    private SessionDetail detail(CwsPrepSession s) {
        List<CwsPrepAnswer> rows = answers.findByOrgIdAndSessionIdOrderByPositionAsc(s.getOrgId(), s.getId());
        return new SessionDetail(row(s, rows.size()), s.getNotes(), rows.stream().map(a -> new AnswerRow(a.getPosition(), a.getQuestion(), a.getScore())).toList());
    }

    private static SessionRow row(CwsPrepSession s, int answerCount) {
        return new SessionRow(s.getId(), s.getTitle(), s.getKind(), s.getScore(), s.getDurationMinutes(), s.getOccurredAt(), s.getNotes() != null && !s.getNotes().isBlank(), answerCount);
    }
}
