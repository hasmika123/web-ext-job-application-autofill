package com.dossier.api.service.ent.consultantws;

import com.dossier.api.domain.User;
import com.dossier.api.domain.ent.consultantws.CwsTask;
import com.dossier.api.domain.ent.talent.ClientAccount;
import com.dossier.api.domain.ent.talent.ClientRequirement;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.ent.talent.ConsultantSkill;
import com.dossier.api.domain.ent.talent.MarketerAssignment;
import com.dossier.api.domain.ent.talent.MarketerCapacity;
import com.dossier.api.domain.ent.talent.RequirementMatch;
import com.dossier.api.domain.ent.talent.TalentApplication;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.ent.OrgMemberDirectoryRepository;
import com.dossier.api.repository.ent.consultantws.CwsTaskRepository;
import com.dossier.api.repository.ent.talent.ClientAccountRepository;
import com.dossier.api.repository.ent.talent.ClientRequirementRepository;
import com.dossier.api.repository.ent.talent.ConsultantSkillRepository;
import com.dossier.api.repository.ent.talent.MarketerAssignmentRepository;
import com.dossier.api.repository.ent.talent.MarketerCapacityRepository;
import com.dossier.api.repository.ent.talent.RequirementMatchRepository;
import com.dossier.api.repository.ent.talent.TalentApplicationRepository;
import com.dossier.api.service.ent.consultantws.ConsultantMarketerDTO.ActionPlan;
import com.dossier.api.service.ent.consultantws.ConsultantMarketerDTO.Badge;
import com.dossier.api.service.ent.consultantws.ConsultantMarketerDTO.FocusItem;
import com.dossier.api.service.ent.consultantws.ConsultantMarketerDTO.FocusRow;
import com.dossier.api.service.ent.consultantws.ConsultantMarketerDTO.Followup;
import com.dossier.api.service.ent.consultantws.ConsultantMarketerDTO.Marketer;
import com.dossier.api.service.ent.consultantws.ConsultantMarketerDTO.Message;
import com.dossier.api.service.ent.consultantws.ConsultantMarketerDTO.Messages;
import com.dossier.api.service.ent.consultantws.ConsultantMarketerDTO.Note;
import com.dossier.api.service.ent.consultantws.ConsultantMarketerDTO.Notes;
import com.dossier.api.service.ent.consultantws.ConsultantMarketerDTO.PlanItem;
import com.dossier.api.service.ent.consultantws.ConsultantMarketerDTO.Response;
import com.dossier.api.service.org.OrgMembership;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;
import java.util.stream.Stream;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Consultant workspace "My Marketer" (docs/enterprise-v2/page-consultant-marketer.md). Read-only. The gate is
 * {@link ConsultantHomeService#requireSelf}: ACTIVE member with {@code opportunities.respond} and an own consultant_profile, else the
 * generic 404. Every query takes the org id first and the caller's own consultant id; nothing takes an id from the client.
 * The marketer is exposed as a name and title only (no photo, email or phone).
 */
@Service
public class ConsultantMarketerService {

    static final int FOCUS_LIMIT = 5;
    static final int FOLLOWUP_LIMIT = 5;

    private final ConsultantHomeService home;
    private final MarketerAssignmentRepository assignments;
    private final MarketerCapacityRepository capacities;
    private final OrgMemberDirectoryRepository memberDirectory;
    private final UserRepository users;
    private final RequirementMatchRepository matches;
    private final TalentApplicationRepository applications;
    private final ClientRequirementRepository requirements;
    private final ClientAccountRepository clients;
    private final ConsultantSkillRepository skills;
    private final CwsTaskRepository tasks;
    private final Clock clock;

    @Autowired
    public ConsultantMarketerService(
        ConsultantHomeService home,
        MarketerAssignmentRepository assignments,
        MarketerCapacityRepository capacities,
        OrgMemberDirectoryRepository memberDirectory,
        UserRepository users,
        RequirementMatchRepository matches,
        TalentApplicationRepository applications,
        ClientRequirementRepository requirements,
        ClientAccountRepository clients,
        ConsultantSkillRepository skills,
        CwsTaskRepository tasks
    ) {
        this(home, assignments, capacities, memberDirectory, users, matches, applications, requirements, clients, skills, tasks, Clock.systemUTC());
    }

    ConsultantMarketerService(
        ConsultantHomeService home,
        MarketerAssignmentRepository assignments,
        MarketerCapacityRepository capacities,
        OrgMemberDirectoryRepository memberDirectory,
        UserRepository users,
        RequirementMatchRepository matches,
        TalentApplicationRepository applications,
        ClientRequirementRepository requirements,
        ClientAccountRepository clients,
        ConsultantSkillRepository skills,
        CwsTaskRepository tasks,
        Clock clock
    ) {
        this.home = home;
        this.assignments = assignments;
        this.capacities = capacities;
        this.memberDirectory = memberDirectory;
        this.users = users;
        this.matches = matches;
        this.applications = applications;
        this.requirements = requirements;
        this.clients = clients;
        this.skills = skills;
        this.tasks = tasks;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public Response page(OrgMembership me) {
        ConsultantProfile c = home.requireSelf(me);
        Long org = c.getOrgId();
        Instant now = Instant.now(clock);
        LocalDate today = now.atZone(ZoneOffset.UTC).toLocalDate();

        Marketer marketer = marketer(org, c);

        List<RequirementMatch> myMatches = matches.findByOrgIdAndConsultantIdOrderByScoreDesc(org, c.getId());
        List<TalentApplication> myApps = applications.findByOrgIdAndConsultantId(org, c.getId());
        List<CwsTask> openTasks = tasks.findByOrgIdAndConsultantIdAndStatusNotOrderByDueOnAsc(org, c.getId(), "DONE");

        List<Long> reqIds = Stream.concat(myMatches.stream().map(RequirementMatch::getRequirementId), myApps.stream().map(TalentApplication::getRequirementId))
            .filter(Objects::nonNull)
            .distinct()
            .toList();
        Map<Long, ClientRequirement> reqs = requirements.findByOrgIdAndIdIn(org, reqIds).stream().filter(r -> org.equals(r.getOrgId())).collect(Collectors.toMap(ClientRequirement::getId, Function.identity()));
        Map<Long, ClientAccount> clientById = clients.findByOrgId(org).stream().collect(Collectors.toMap(ClientAccount::getId, Function.identity()));

        List<FocusRow> focus = focusRows(myMatches, myApps, reqs, clientById);
        List<Followup> followups = followups(myApps, openTasks, reqs, clientById, today);
        List<FocusItem> marketerFocus = marketer == null ? List.of() : marketerFocus(c, myMatches);

        // D12 (2026-10-16 audit): nothing here is invented. Messages, a shared action plan and collaboration notes do not exist as data (there is no
        // message store between a consultant and a marketer), and how fast a marketer replies is measured nowhere, so they are empty and the page says so.
        Badge badge = new Badge(false, null, null);
        Messages messages = new Messages(false, List.of());
        ActionPlan plan = new ActionPlan(false, List.of());
        Notes notes = new Notes(false, List.of());

        return new Response(org, now, marketer, badge, focus, followups, marketerFocus, messages, plan, notes);
    }

    /** The current ACTIVE marketer assignment of this consultant, resolved to a display name and title; null when none. */
    private Marketer marketer(Long org, ConsultantProfile c) {
        MarketerAssignment a = assignments.findByOrgIdAndConsultantId(org, c.getId()).filter(x -> "ACTIVE".equals(x.getStatus())).orElse(null);
        if (a == null) return null;
        OrgMember seat = memberDirectory.findByOrgIdAndIdIn(org, List.of(a.getMarketerMemberId())).stream().findFirst().orElse(null);
        if (seat == null || seat.getStatus() != OrgMemberStatus.ACTIVE) return null;
        User u = seat.getUserId() == null ? null : users.findById(seat.getUserId()).orElse(null);
        String title = capacities.findByOrgIdAndMemberId(org, seat.getId()).map(MarketerCapacity::getTitleLabel).filter(t -> t != null && !t.isBlank()).orElse(null);
        return new Marketer(seat.getId(), personName(u, seat), title, a.getAssignedAt());
    }

    static String personName(User u, OrgMember seat) {
        if (u != null) {
            String n = ((u.getFirstName() == null ? "" : u.getFirstName().strip()) + " " + (u.getLastName() == null ? "" : u.getLastName().strip())).strip();
            if (!n.isEmpty()) return n;
        }
        if (seat.getDisplayLabel() != null && !seat.getDisplayLabel().isBlank()) return seat.getDisplayLabel().strip();
        return "Your marketer";
    }

    /** HIGH from 85, MEDIUM from 70, else LOW; a job with no match row (the application came from elsewhere) is MEDIUM. */
    static String priorityOf(Integer score) {
        if (score == null) return "MEDIUM";
        return score >= 85 ? "HIGH" : score >= 70 ? "MEDIUM" : "LOW";
    }

    private List<FocusRow> focusRows(List<RequirementMatch> myMatches, List<TalentApplication> myApps, Map<Long, ClientRequirement> reqs, Map<Long, ClientAccount> clientById) {
        Map<Long, TalentApplication> appByReq = new LinkedHashMap<>();
        for (TalentApplication a : myApps) appByReq.merge(a.getRequirementId(), a, (x, y) -> x.getStageChangedAt().isAfter(y.getStageChangedAt()) ? x : y);

        List<FocusRow> rows = new ArrayList<>();
        Set<Long> seen = new HashSet<>();
        myMatches.stream()
            .filter(m -> "ASSIGNED".equals(m.getStatus()))
            .sorted(Comparator.comparing((RequirementMatch m) -> m.getAssignedAt() == null ? m.getCreatedAt() : m.getAssignedAt()).reversed())
            .forEach(m -> {
                TalentApplication a = appByReq.get(m.getRequirementId());
                if (a != null && "CLOSED".equals(a.getStage())) return;
                ClientRequirement r = reqs.get(m.getRequirementId());
                if (r == null || !seen.add(r.getId())) return;
                rows.add(row(m.getId(), r, clientById, a, a == null ? "MARKETING" : a.getStage(), priorityOf(m.getScore())));
            });
        // applications that were not marketed through an ASSIGNED match, most recent change first
        Map<Long, RequirementMatch> matchByReq = myMatches.stream().collect(Collectors.toMap(RequirementMatch::getRequirementId, Function.identity(), (x, y) -> x));
        appByReq.values().stream()
            .filter(a -> !"CLOSED".equals(a.getStage()))
            .sorted(Comparator.comparing(TalentApplication::getStageChangedAt).reversed())
            .forEach(a -> {
                ClientRequirement r = reqs.get(a.getRequirementId());
                if (r == null || !seen.add(r.getId())) return;
                RequirementMatch m = matchByReq.get(r.getId());
                rows.add(row(m == null ? null : m.getId(), r, clientById, a, a.getStage(), priorityOf(m == null ? null : m.getScore())));
            });
        return rows.stream().limit(FOCUS_LIMIT).toList();
    }

    private static FocusRow row(Long matchId, ClientRequirement r, Map<Long, ClientAccount> clientById, TalentApplication a, String stage, String priority) {
        ClientAccount cl = clientById.get(r.getClientId());
        String next = a == null || a.getNextAction() == null || a.getNextAction().isBlank() ? null : a.getNextAction();
        return new FocusRow(matchId, r.getId(), r.getTitle(), cl == null ? null : cl.getName(), r.getLocation(), r.getWorkMode(), stage, priority, next, next == null ? null : a.getNextActionDue());
    }

    private List<Followup> followups(List<TalentApplication> myApps, List<CwsTask> openTasks, Map<Long, ClientRequirement> reqs, Map<Long, ClientAccount> clientById, LocalDate today) {
        List<Followup> out = new ArrayList<>();
        for (TalentApplication a : myApps) {
            if ("CLOSED".equals(a.getStage()) || a.getNextActionDue() == null || a.getNextAction() == null || a.getNextAction().isBlank()) continue;
            ClientRequirement r = reqs.get(a.getRequirementId());
            ClientAccount cl = clientById.get(a.getClientId());
            LocalDate d = a.getNextActionDue();
            String status = d.isBefore(today) ? "OVERDUE" : d.isEqual(today) ? "TODAY" : "UPCOMING";
            out.add(new Followup("app-" + a.getId(), "APPLICATION", d, a.getNextAction(), status, r == null ? null : r.getTitle(), cl == null ? null : cl.getName()));
        }
        for (CwsTask t : openTasks) {
            if (t.getDueOn() == null) continue;
            out.add(new Followup("task-" + t.getId(), "TASK", t.getDueOn(), t.getTitle(), t.getStatus(), null, null));
        }
        return out.stream().sorted(Comparator.comparing(Followup::dueOn).thenComparing(Followup::key)).limit(FOLLOWUP_LIMIT).toList();
    }

    /** Derived only from the consultant's own matches and skills: no invented activity. */
    private List<FocusItem> marketerFocus(ConsultantProfile c, List<RequirementMatch> myMatches) {
        List<FocusItem> items = new ArrayList<>();
        long open = myMatches.stream().filter(m -> !"DISMISSED".equals(m.getStatus())).count();
        long assigned = myMatches.stream().filter(m -> "ASSIGNED".equals(m.getStatus())).count();
        long strong = myMatches.stream().filter(m -> !"DISMISSED".equals(m.getStatus()) && m.getScore() != null && m.getScore() >= 85).count();
        if (open > 0) items.add(new FocusItem("marketing", "Actively marketing your profile", "to " + open + " potential " + (open == 1 ? "opportunity" : "opportunities")));
        List<String> top = skills.findByOrgIdAndConsultantIdOrderBySortOrderAsc(c.getOrgId(), c.getId()).stream().map(ConsultantSkill::getSkill).filter(s -> s != null && !s.isBlank()).limit(3).toList();
        if (!top.isEmpty()) items.add(new FocusItem("skills", "Targeting " + String.join(", ", top) + " roles", "based on your key skills"));
        if (assigned > 0) items.add(new FocusItem("assigned", "Working " + assigned + " assigned " + (assigned == 1 ? "opportunity" : "opportunities"), "lined up for you"));
        if (strong > 0) items.add(new FocusItem("strong", strong + " strong " + (strong == 1 ? "match" : "matches"), "scoring 85 or higher"));
        return items;
    }
}
