package com.dossier.api.service.ent.consultantws;

import com.dossier.api.domain.ent.consultantws.CwsTask;
import com.dossier.api.domain.ent.talent.ClientAccount;
import com.dossier.api.domain.ent.talent.ClientRequirement;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.ent.talent.OrgResume;
import com.dossier.api.domain.ent.talent.RequirementMatch;
import com.dossier.api.domain.ent.talent.TalentApplication;
import com.dossier.api.domain.ent.talent.TalentInterview;
import com.dossier.api.domain.ent.talent.TalentPlacement;
import com.dossier.api.repository.ent.consultantws.CwsTaskRepository;
import com.dossier.api.repository.ent.talent.ClientAccountRepository;
import com.dossier.api.repository.ent.talent.ClientRequirementRepository;
import com.dossier.api.repository.ent.talent.ConsultantProfileRepository;
import com.dossier.api.repository.ent.talent.ConsultantSkillRepository;
import com.dossier.api.repository.ent.talent.OrgResumeExperienceRepository;
import com.dossier.api.repository.ent.talent.OrgResumeRepository;
import com.dossier.api.repository.ent.talent.RequirementMatchRepository;
import com.dossier.api.repository.ent.talent.TalentApplicationRepository;
import com.dossier.api.repository.ent.talent.TalentInterviewRepository;
import com.dossier.api.repository.ent.talent.TalentPlacementRepository;
import com.dossier.api.service.ent.OrgRoleService;
import com.dossier.api.service.ent.authz.AuthorizationService;
import com.dossier.api.service.ent.authz.AuthzOperation;
import com.dossier.api.service.ent.authz.AuthzRequest;
import com.dossier.api.service.ent.authz.Beneficiary;
import com.dossier.api.service.ent.consultantws.ConsultantHomeDTO.ApplicationRow;
import com.dossier.api.service.ent.consultantws.ConsultantHomeDTO.Check;
import com.dossier.api.service.ent.consultantws.ConsultantHomeDTO.Focus;
import com.dossier.api.service.ent.consultantws.ConsultantHomeDTO.FocusItem;
import com.dossier.api.service.ent.consultantws.ConsultantHomeDTO.InterviewRow;
import com.dossier.api.service.ent.consultantws.ConsultantHomeDTO.MatchRow;
import com.dossier.api.service.ent.consultantws.ConsultantHomeDTO.Me;
import com.dossier.api.service.ent.consultantws.ConsultantHomeDTO.Messages;
import com.dossier.api.service.ent.consultantws.ConsultantHomeDTO.OpportunityRow;
import com.dossier.api.service.ent.consultantws.ConsultantHomeDTO.Placement;
import com.dossier.api.service.ent.consultantws.ConsultantHomeDTO.Response;
import com.dossier.api.service.ent.consultantws.ConsultantHomeDTO.ResumeStrength;
import com.dossier.api.service.ent.consultantws.ConsultantHomeDTO.TaskRow;
import com.dossier.api.service.ent.consultantws.ConsultantHomeDTO.Tile;
import com.dossier.api.service.ent.consultantws.ConsultantHomeDTO.Tiles;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Comparator;
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
 * The Consultant workspace Home (docs/enterprise-v2/page-consultant-home.md). The caller must be an ACTIVE member who holds
 * {@code opportunities.respond} (the Consultant role) and is linked to a {@code consultant_profile}; anyone else, and any other
 * organization, gets the same generic 404. Every query takes the organization id first and the caller's own consultant id, so a
 * consultant can only ever see their own rows.
 */
@Service
public class ConsultantHomeService {

    public static final String PERMISSION = "opportunities.respond";
    static final int WEEKS = 6;

    private final OrgRoleService roles;
    private final AuthorizationService authorization;
    private final ConsultantProfileRepository consultants;
    private final RequirementMatchRepository matches;
    private final ClientRequirementRepository requirements;
    private final ClientAccountRepository clients;
    private final TalentApplicationRepository applications;
    private final TalentInterviewRepository interviews;
    private final TalentPlacementRepository placements;
    private final OrgResumeRepository resumes;
    private final OrgResumeExperienceRepository experience;
    private final ConsultantSkillRepository skills;
    private final CwsTaskRepository tasks;
    private final Clock clock;

    @Autowired
    public ConsultantHomeService(
        OrgRoleService roles,
        AuthorizationService authorization,
        ConsultantProfileRepository consultants,
        RequirementMatchRepository matches,
        ClientRequirementRepository requirements,
        ClientAccountRepository clients,
        TalentApplicationRepository applications,
        TalentInterviewRepository interviews,
        TalentPlacementRepository placements,
        OrgResumeRepository resumes,
        OrgResumeExperienceRepository experience,
        ConsultantSkillRepository skills,
        CwsTaskRepository tasks
    ) {
        this(roles, authorization, consultants, matches, requirements, clients, applications, interviews, placements, resumes, experience, skills, tasks, Clock.systemUTC());
    }

    ConsultantHomeService(
        OrgRoleService roles,
        AuthorizationService authorization,
        ConsultantProfileRepository consultants,
        RequirementMatchRepository matches,
        ClientRequirementRepository requirements,
        ClientAccountRepository clients,
        TalentApplicationRepository applications,
        TalentInterviewRepository interviews,
        TalentPlacementRepository placements,
        OrgResumeRepository resumes,
        OrgResumeExperienceRepository experience,
        ConsultantSkillRepository skills,
        CwsTaskRepository tasks,
        Clock clock
    ) {
        this.roles = roles;
        this.authorization = authorization;
        this.consultants = consultants;
        this.matches = matches;
        this.requirements = requirements;
        this.clients = clients;
        this.applications = applications;
        this.interviews = interviews;
        this.placements = placements;
        this.resumes = resumes;
        this.experience = experience;
        this.skills = skills;
        this.tasks = tasks;
        this.clock = clock;
    }

    /** The signed-in consultant's profile, or the generic 404. Reusable by the other consultant-workspace services. */
    public ConsultantProfile requireSelf(OrgMembership me) {
        if (me == null || !roles.rolesFromData(me.orgId())) throw new OrgNotFoundException();
        authorization.require(AuthzRequest.of(me.orgId(), List.of(PERMISSION), Beneficiary.SELF, null, AuthzOperation.READ).withActor(me));
        return consultants.findByOrgIdAndMemberId(me.orgId(), me.memberId()).orElseThrow(OrgNotFoundException::new);
    }

    @Transactional(readOnly = true)
    public Response home(OrgMembership me) {
        ConsultantProfile c = requireSelf(me);
        Long org = c.getOrgId();
        Instant now = Instant.now(clock);
        LocalDate today = now.atZone(ZoneOffset.UTC).toLocalDate();

        List<RequirementMatch> myMatches = matches.findByOrgIdAndConsultantIdOrderByScoreDesc(org, c.getId());
        List<TalentApplication> myApps = applications.findByOrgIdAndConsultantId(org, c.getId());
        List<TalentInterview> myInterviews = interviews.findByOrgIdAndConsultantIdAndStatusAndScheduledAtAfterOrderByScheduledAtAsc(org, c.getId(), "SCHEDULED", now);
        List<TalentPlacement> myPlacements = placements.findByOrgIdAndConsultantId(org, c.getId());

        List<Long> reqIds = Stream.concat(myMatches.stream().map(RequirementMatch::getRequirementId), myApps.stream().map(TalentApplication::getRequirementId))
            .filter(Objects::nonNull)
            .distinct()
            .toList();
        Map<Long, ClientRequirement> reqs = requirements.findAllById(reqIds).stream().filter(r -> org.equals(r.getOrgId())).collect(Collectors.toMap(ClientRequirement::getId, Function.identity()));
        Map<Long, ClientAccount> clientById = clients.findByOrgId(org).stream().collect(Collectors.toMap(ClientAccount::getId, Function.identity()));
        Map<Long, TalentApplication> appById = myApps.stream().collect(Collectors.toMap(TalentApplication::getId, Function.identity()));
        Set<Long> appliedReqs = myApps.stream().map(TalentApplication::getRequirementId).collect(Collectors.toSet());

        List<RequirementMatch> open = myMatches.stream().filter(m -> !"DISMISSED".equals(m.getStatus())).toList();
        List<RequirementMatch> assigned = myMatches.stream().filter(m -> "ASSIGNED".equals(m.getStatus())).toList();
        List<TalentApplication> activeApps = myApps.stream().filter(a -> !"CLOSED".equals(a.getStage())).toList();

        Tile jobMatches = tile(open.size(), open.stream().map(RequirementMatch::getCreatedAt).toList(), now, false);
        Tile assignedTile = tile(assigned.size(), assigned.stream().map(m -> m.getAssignedAt() != null ? m.getAssignedAt() : m.getCreatedAt()).toList(), now, false);
        Tile activeAppsTile = tile(activeApps.size(), activeApps.stream().map(TalentApplication::getCreatedAt).toList(), now, false);
        Tile interviewTile = tile(myInterviews.size(), myInterviews.stream().map(TalentInterview::getScheduledAt).toList(), now, false);
        // SAMPLE: the approvals workflow belongs to the Submissions & Approvals page and the marketer role
        Tile submissionsPending = new Tile(0, null, null, List.of(), true);
        long activePlacements = myPlacements.stream().filter(p -> "ACTIVE".equals(p.getStatus())).count();
        Tiles tiles = new Tiles(jobMatches, assignedTile, activeAppsTile, interviewTile, submissionsPending, new Placement(activePlacements, activePlacements > 0 ? "On track" : null));

        List<MatchRow> recommended = open.stream()
            .filter(m -> !appliedReqs.contains(m.getRequirementId()))
            .limit(5)
            .map(m -> matchRow(m, reqs, clientById))
            .filter(Objects::nonNull)
            .toList();

        List<OpportunityRow> opps = assigned.stream()
            .sorted(Comparator.comparing((RequirementMatch m) -> m.getAssignedAt() == null ? m.getCreatedAt() : m.getAssignedAt()).reversed())
            .limit(5)
            .map(m -> opportunityRow(m, reqs, clientById, myApps))
            .filter(Objects::nonNull)
            .toList();

        List<ApplicationRow> appRows = myApps.stream()
            .sorted(Comparator.comparing(TalentApplication::getAppliedOn, Comparator.nullsLast(Comparator.reverseOrder())))
            .limit(5)
            .map(a -> applicationRow(a, reqs, clientById))
            .toList();

        List<InterviewRow> interviewRows = myInterviews.stream().limit(3).map(i -> {
            TalentApplication a = i.getApplicationId() == null ? null : appById.get(i.getApplicationId());
            ClientRequirement r = a == null ? null : reqs.get(a.getRequirementId());
            ClientAccount cl = clientById.get(i.getClientId());
            // SAMPLE: the interview mode is not stored on talent_interview yet; shown as Video until the Interviews page owns it
            return new InterviewRow(i.getId(), i.getScheduledAt(), i.getDurationMinutes(), r != null ? r.getTitle() : "Interview", cl != null ? cl.getName() : null, i.getRoundLabel(), "VIDEO", true);
        }).toList();

        List<CwsTask> openTasks = tasks.findByOrgIdAndConsultantIdAndStatusNotOrderByDueOnAsc(org, c.getId(), "DONE");
        List<TaskRow> taskRows = openTasks.stream().limit(5).map(t -> new TaskRow(t.getId(), t.getTitle(), t.getDueOn(), t.getPriority(), t.getStatus())).toList();

        // SAMPLE until the marketer module exists: this is one half of a two-role conversation
        Messages messages = new Messages(true, List.of());

        return new Response(
            org, now, new Me(c.getId(), c.getDisplayName(), c.getJobTitle()), tiles, recommended, opps, appRows, interviewRows,
            resumeStrength(c), focus(c, today, now, open, myInterviews, myApps, openTasks), taskRows, messages
        );
    }

    /** The value now, the value a week ago (items stamped before now-7d), and a cumulative weekly sparkline. */
    static Tile tile(long value, List<Instant> stamps, Instant now, boolean sample) {
        Instant weekAgo = now.minus(Duration.ofDays(7));
        long previous = stamps.stream().filter(t -> t != null && t.isBefore(weekAgo)).count();
        Double delta = previous == 0 ? null : Math.round(((value - previous) * 1000.0) / previous) / 10.0;
        List<Long> spark = new ArrayList<>();
        for (int w = WEEKS - 1; w >= 0; w--) {
            Instant at = now.minus(Duration.ofDays(7L * w));
            spark.add(stamps.stream().filter(t -> t != null && !t.isAfter(at)).count());
        }
        return new Tile(value, previous, delta, spark, sample);
    }

    private MatchRow matchRow(RequirementMatch m, Map<Long, ClientRequirement> reqs, Map<Long, ClientAccount> clientById) {
        ClientRequirement r = reqs.get(m.getRequirementId());
        if (r == null) return null;
        ClientAccount cl = clientById.get(r.getClientId());
        return new MatchRow(m.getId(), r.getId(), r.getTitle(), cl == null ? null : cl.getName(), m.getScore() == null ? 0 : m.getScore(), r.getLocation(), r.getWorkMode(), r.getEmploymentLabel());
    }

    private OpportunityRow opportunityRow(RequirementMatch m, Map<Long, ClientRequirement> reqs, Map<Long, ClientAccount> clientById, List<TalentApplication> myApps) {
        ClientRequirement r = reqs.get(m.getRequirementId());
        if (r == null) return null;
        ClientAccount cl = clientById.get(r.getClientId());
        String status = myApps.stream()
            .filter(a -> a.getRequirementId().equals(m.getRequirementId()))
            .map(a -> "ASSIGNED".equals(a.getStage()) ? "AWAITING_APPROVAL" : "INTERESTED")
            .findFirst()
            .orElse("REVIEW_NEEDED");
        return new OpportunityRow(m.getId(), r.getId(), r.getTitle(), cl == null ? null : cl.getName(), status, m.getAssignedAt() != null ? m.getAssignedAt() : m.getCreatedAt());
    }

    private ApplicationRow applicationRow(TalentApplication a, Map<Long, ClientRequirement> reqs, Map<Long, ClientAccount> clientById) {
        ClientRequirement r = reqs.get(a.getRequirementId());
        ClientAccount cl = clientById.get(a.getClientId());
        return new ApplicationRow(a.getId(), a.getCode(), r == null ? null : r.getTitle(), cl == null ? null : cl.getName(), a.getStage(), a.getClosedReason(), a.getAppliedOn());
    }

    private ResumeStrength resumeStrength(ConsultantProfile c) {
        Long org = c.getOrgId();
        List<OrgResume> mine = resumes.findByOrgIdAndConsultantId(org, c.getId());
        boolean hasExperience = mine.stream().anyMatch(r -> !experience.findByOrgIdAndResumeIdOrderBySortOrderAsc(org, r.getId()).isEmpty());
        boolean hasSkills = skills.findByOrgIdAndConsultantIdOrderBySortOrderAsc(org, c.getId()).size() >= 3;
        boolean hasSummary = mine.stream().anyMatch(r -> r.getSummaryText() != null && !r.getSummaryText().isBlank());
        List<Check> checks = List.of(
            new Check("contact", "Contact information", c.getEmail() != null && !c.getEmail().isBlank()),
            new Check("experience", "Work experience", hasExperience),
            new Check("skills", "Key skills", hasSkills),
            new Check("certifications", "Add certifications", c.isHasCertifications()),
            new Check("summary", "Add a summary statement", hasSummary)
        );
        int pct = c.getProfileCompleteness() == null ? 0 : Math.max(0, Math.min(100, c.getProfileCompleteness()));
        return new ResumeStrength(pct, !mine.isEmpty(), checks);
    }

    private Focus focus(ConsultantProfile c, LocalDate today, Instant now, List<RequirementMatch> open, List<TalentInterview> upcoming, List<TalentApplication> apps, List<CwsTask> openTasks) {
        List<FocusItem> items = new ArrayList<>();
        Instant weekAgo = now.minus(Duration.ofDays(7));
        long fresh = open.stream().filter(m -> m.getCreatedAt() != null && m.getCreatedAt().isAfter(weekAgo)).count();
        if (fresh > 0) items.add(new FocusItem("matches", "Review " + fresh + " new job match" + (fresh == 1 ? "" : "es")));
        if (upcoming.stream().anyMatch(i -> i.getScheduledAt().isBefore(now.plus(Duration.ofDays(3))))) items.add(new FocusItem("interview-prep", "Complete interview prep"));
        if (apps.stream().anyMatch(a -> !"CLOSED".equals(a.getStage()) && a.getNextActionDue() != null && !a.getNextActionDue().isAfter(today))) items.add(new FocusItem("follow-up", "Follow up on pending application"));
        if (c.getAvailabilitySince() == null || c.getAvailabilitySince().isBefore(today.minusDays(30))) items.add(new FocusItem("availability", "Update availability"));
        openTasks.stream().filter(t -> t.getDueOn() != null && !t.getDueOn().isAfter(today)).limit(3).forEach(t -> items.add(new FocusItem("task-" + t.getId(), t.getTitle())));
        return new Focus(today, items.stream().limit(6).toList());
    }
}
