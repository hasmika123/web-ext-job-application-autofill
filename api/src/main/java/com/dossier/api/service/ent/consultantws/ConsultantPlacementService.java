package com.dossier.api.service.ent.consultantws;

import com.dossier.api.domain.User;
import com.dossier.api.domain.ent.consultantws.CwsPlacementActivity;
import com.dossier.api.domain.ent.consultantws.CwsPlacementChecklist;
import com.dossier.api.domain.ent.consultantws.CwsPlacementDetail;
import com.dossier.api.domain.ent.talent.ClientAccount;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.ent.talent.MarketerAssignment;
import com.dossier.api.domain.ent.talent.MarketerCapacity;
import com.dossier.api.domain.ent.talent.TalentPlacement;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.ent.OrgMemberDirectoryRepository;
import com.dossier.api.repository.ent.consultantws.CwsPlacementActivityRepository;
import com.dossier.api.repository.ent.consultantws.CwsPlacementChecklistRepository;
import com.dossier.api.repository.ent.consultantws.CwsPlacementDetailRepository;
import com.dossier.api.repository.ent.consultantws.CwsPlacementMeetingRepository;
import com.dossier.api.repository.ent.consultantws.CwsPlacementMilestoneRepository;
import com.dossier.api.repository.ent.talent.ClientAccountRepository;
import com.dossier.api.repository.ent.talent.MarketerAssignmentRepository;
import com.dossier.api.repository.ent.talent.MarketerCapacityRepository;
import com.dossier.api.repository.ent.talent.TalentPlacementRepository;
import com.dossier.api.service.TrackerException;
import com.dossier.api.service.ent.consultantws.ConsultantPlacementDTO.Activity;
import com.dossier.api.service.ent.consultantws.ConsultantPlacementDTO.ChecklistItem;
import com.dossier.api.service.ent.consultantws.ConsultantPlacementDTO.Marketer;
import com.dossier.api.service.ent.consultantws.ConsultantPlacementDTO.Meeting;
import com.dossier.api.service.ent.consultantws.ConsultantPlacementDTO.Milestone;
import com.dossier.api.service.ent.consultantws.ConsultantPlacementDTO.Past;
import com.dossier.api.service.ent.consultantws.ConsultantPlacementDTO.Placement;
import com.dossier.api.service.ent.consultantws.ConsultantPlacementDTO.Response;
import com.dossier.api.service.org.OrgException;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import com.dossier.api.service.privacy.SensitiveContent;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The Consultant workspace My Placement page (docs/enterprise-v2/page-consultant-placements.md). The gate is
 * {@link ConsultantHomeService#requireSelf} (Consultant role, own consultant_profile, else the generic 404). The page shows the consultant's most
 * recent ACTIVE placement plus its detail, checklist, milestones, meetings and activity (tables {@code cws_placement_*}); the bill rate is never read.
 * Writes are the consultant's own: ticking a checklist item and posting a status note (an UPDATE activity row). Every query is organization id first
 * and the placement is always resolved from the caller's own consultant id, so another consultant's row or another tenant's is the same 404.
 */
@Service
public class ConsultantPlacementService {

    public static final String CODE_NOT_ACTIVE = "PLACEMENT_NOT_ACTIVE";
    static final int MIN_NOTE = 3;
    static final int MAX_NOTE = 300;
    static final int MAX_ACTIVITY = 10;
    static final int MAX_MEETINGS = 6;
    static final String TYPE_UPDATE = "UPDATE";

    private final ConsultantHomeService gate;
    private final TalentPlacementRepository placements;
    private final ClientAccountRepository clients;
    private final CwsPlacementDetailRepository details;
    private final CwsPlacementChecklistRepository checklist;
    private final CwsPlacementMilestoneRepository milestones;
    private final CwsPlacementMeetingRepository meetings;
    private final CwsPlacementActivityRepository activity;
    private final MarketerAssignmentRepository assignments;
    private final MarketerCapacityRepository capacities;
    private final OrgMemberDirectoryRepository memberDirectory;
    private final UserRepository users;
    private final Clock clock;

    @Autowired
    public ConsultantPlacementService(
        ConsultantHomeService gate,
        TalentPlacementRepository placements,
        ClientAccountRepository clients,
        CwsPlacementDetailRepository details,
        CwsPlacementChecklistRepository checklist,
        CwsPlacementMilestoneRepository milestones,
        CwsPlacementMeetingRepository meetings,
        CwsPlacementActivityRepository activity,
        MarketerAssignmentRepository assignments,
        MarketerCapacityRepository capacities,
        OrgMemberDirectoryRepository memberDirectory,
        UserRepository users
    ) {
        this(gate, placements, clients, details, checklist, milestones, meetings, activity, assignments, capacities, memberDirectory, users, Clock.systemUTC());
    }

    ConsultantPlacementService(
        ConsultantHomeService gate,
        TalentPlacementRepository placements,
        ClientAccountRepository clients,
        CwsPlacementDetailRepository details,
        CwsPlacementChecklistRepository checklist,
        CwsPlacementMilestoneRepository milestones,
        CwsPlacementMeetingRepository meetings,
        CwsPlacementActivityRepository activity,
        MarketerAssignmentRepository assignments,
        MarketerCapacityRepository capacities,
        OrgMemberDirectoryRepository memberDirectory,
        UserRepository users,
        Clock clock
    ) {
        this.gate = gate;
        this.placements = placements;
        this.clients = clients;
        this.details = details;
        this.checklist = checklist;
        this.milestones = milestones;
        this.meetings = meetings;
        this.activity = activity;
        this.assignments = assignments;
        this.capacities = capacities;
        this.memberDirectory = memberDirectory;
        this.users = users;
        this.clock = clock;
    }

    // ---- the page -------------------------------------------------------------------------------------------------

    @Transactional(readOnly = true)
    public Response page(OrgMembership me) {
        ConsultantProfile c = gate.requireSelf(me);
        Long org = c.getOrgId();
        Instant now = Instant.now(clock);
        LocalDate today = now.atZone(ZoneOffset.UTC).toLocalDate();
        List<TalentPlacement> mine = placements.findByOrgIdAndConsultantId(org, c.getId());
        Map<Long, String> clientNames = clients.findByOrgId(org).stream().collect(Collectors.toMap(ClientAccount::getId, ClientAccount::getName, (a, b) -> a));

        List<TalentPlacement> active = mine.stream().filter(p -> "ACTIVE".equals(p.getStatus())).sorted(RECENT_FIRST).toList();
        List<Past> past = mine.stream().filter(p -> "ENDED".equals(p.getStatus())).sorted(RECENT_FIRST)
            .map(p -> new Past(p.getId(), p.getRoleTitle(), clientNames.get(p.getClientId()), p.getStartDate(), p.getEndDate())).toList();
        if (active.isEmpty()) return new Response(org, now, c.getDisplayName(), 0, null, null, List.of(), List.of(), List.of(), List.of(), past);

        TalentPlacement p = active.get(0);
        CwsPlacementDetail d = details.findByOrgIdAndPlacementId(org, p.getId()).orElse(null);
        List<ChecklistItem> items = checklist.findByOrgIdAndPlacementIdOrderBySortNoAscIdAsc(org, p.getId()).stream().map(ConsultantPlacementService::item).toList();
        List<Milestone> marks = milestones.findByOrgIdAndPlacementIdOrderByOnDateAscIdAsc(org, p.getId()).stream()
            .map(m -> new Milestone(m.getId(), m.getLabel(), m.getDescription(), m.getOnDate(), m.isCompleted())).toList();
        List<Meeting> meets = meetings.findByOrgIdAndPlacementIdAndStartsAtGreaterThanEqualOrderByStartsAtAscIdAsc(org, p.getId(), now).stream().limit(MAX_MEETINGS)
            .map(m -> new Meeting(m.getId(), m.getLabel(), m.getStartsAt(), m.getDurationMinutes(), m.getWithLabel(), httpsOrNull(m.getJoinUrl()))).toList();
        List<Activity> log = activity.findByOrgIdAndPlacementIdOrderByOccurredAtDescIdDesc(org, p.getId(), PageRequest.of(0, MAX_ACTIVITY)).stream().map(ConsultantPlacementService::activityOf).toList();
        return new Response(org, now, c.getDisplayName(), active.size(), placement(p, d, clientNames.get(p.getClientId()), today), marketer(org, c), items, marks, meets, log, past);
    }

    private static final Comparator<TalentPlacement> RECENT_FIRST = Comparator.comparing(TalentPlacement::getStartDate, Comparator.nullsLast(Comparator.reverseOrder()))
        .thenComparing(TalentPlacement::getId, Comparator.reverseOrder());

    static Placement placement(TalentPlacement p, CwsPlacementDetail d, String clientName, LocalDate today) {
        LocalDate end = p.getEndDate();
        long days = end != null ? ChronoUnit.DAYS.between(p.getStartDate(), end) : Math.max(0, ChronoUnit.DAYS.between(p.getStartDate(), today));
        int months = (int) Math.round(days / 30.4375);
        return new Placement(
            p.getId(), p.getRoleTitle(), p.getStatus(), clientName,
            d == null ? null : d.getEndClientName(), d == null ? null : d.getProjectName(), d == null ? null : d.getLocationLabel(), d == null ? null : d.getWorkMode(),
            d == null ? null : d.getManagerName(), d == null ? null : d.getManagerTitle(), d == null ? null : d.getHoursPerWeek(), d == null ? null : d.getScheduleLabel(),
            d == null ? null : d.getEngagementStatus(), d == null ? null : d.getStatusNote(), p.getStartDate(), end, d == null ? null : d.getNextCheckIn(),
            months, end == null, "ACTIVE".equals(p.getStatus()), d != null && d.isSampleData()
        );
    }

    private static ChecklistItem item(CwsPlacementChecklist i) {
        return new ChecklistItem(i.getId(), i.getLabel(), i.getDueOn(), i.getCompletedAt());
    }

    private static Activity activityOf(CwsPlacementActivity a) {
        return new Activity(a.getId(), a.getActivityType(), a.getDescription(), a.getActorLabel(), a.getOccurredAt(), a.isSampleData());
    }

    /** A join link is only ever shown when it is https (the seed and any future writer are checked, this is the last line). */
    static String httpsOrNull(String url) {
        return url != null && url.regionMatches(true, 0, "https://", 0, 8) && url.length() > 8 ? url : null;
    }

    private Marketer marketer(Long org, ConsultantProfile c) {
        MarketerAssignment a = assignments.findByOrgIdAndConsultantId(org, c.getId()).filter(x -> "ACTIVE".equals(x.getStatus())).orElse(null);
        if (a == null) return null;
        OrgMember seat = memberDirectory.findByOrgIdAndIdIn(org, List.of(a.getMarketerMemberId())).stream().findFirst().orElse(null);
        if (seat == null || seat.getStatus() != OrgMemberStatus.ACTIVE) return null;
        User u = seat.getUserId() == null ? null : users.findById(seat.getUserId()).orElse(null);
        String title = capacities.findByOrgIdAndMemberId(org, seat.getId()).map(MarketerCapacity::getTitleLabel).filter(t -> t != null && !t.isBlank()).orElse(null);
        return new Marketer(seat.getId(), ConsultantMarketerService.personName(u, seat), title);
    }

    // ---- the two writes -------------------------------------------------------------------------------------------

    /**
     * Ticks (completed = true) or unticks one onboarding checklist item of the caller's own ACTIVE placement. Idempotent: setting the state an item
     * already has changes nothing (a tick keeps its original completed_at). An item of someone else's placement is the generic 404; an item of an ended
     * placement is a 409.
     */
    @Transactional
    public ChecklistItem setChecklist(OrgMembership me, long itemId, Boolean completed) {
        ConsultantProfile c = gate.requireSelf(me);
        if (completed == null) throw TrackerException.invalid("completed", "must be true or false");
        Long org = c.getOrgId();
        CwsPlacementChecklist row = checklist.findByOrgIdAndId(org, itemId).orElseThrow(OrgNotFoundException::new);
        TalentPlacement p = ownPlacement(org, c.getId(), row.getPlacementId());
        requireActive(p);
        if (completed && row.getCompletedAt() == null) {
            row.setCompletedAt(Instant.now(clock));
            row.setUpdatedAt(row.getCompletedAt());
            checklist.save(row);
        } else if (!completed && row.getCompletedAt() != null) {
            row.setCompletedAt(null);
            row.setUpdatedAt(Instant.now(clock));
            checklist.save(row);
        }
        return item(row);
    }

    /** Posts a short status note (3 to 300 characters, PII-scanned) on the caller's current ACTIVE placement as an UPDATE activity row. No active placement is a 404. */
    @Transactional
    public Activity postStatusNote(OrgMembership me, String note) {
        ConsultantProfile c = gate.requireSelf(me);
        Long org = c.getOrgId();
        String text = cleanNote(note);
        TalentPlacement p = placements.findByOrgIdAndConsultantId(org, c.getId()).stream().filter(x -> "ACTIVE".equals(x.getStatus())).min(RECENT_FIRST).orElseThrow(OrgNotFoundException::new);
        CwsPlacementActivity a = new CwsPlacementActivity();
        a.setOrgId(org);
        a.setPlacementId(p.getId());
        a.setActivityType(TYPE_UPDATE);
        a.setDescription(text);
        a.setActorLabel(c.getDisplayName());
        a.setOccurredAt(Instant.now(clock));
        a.setCreatedAt(a.getOccurredAt());
        a.setSampleData(false);
        return activityOf(activity.save(a));
    }

    static String cleanNote(String note) {
        String v = note == null ? "" : note.strip();
        if (v.length() < MIN_NOTE || v.length() > MAX_NOTE) throw TrackerException.invalid("note", "must be " + MIN_NOTE + " to " + MAX_NOTE + " characters");
        SensitiveContent.check("note", "note", v);
        return v;
    }

    private TalentPlacement ownPlacement(Long org, Long consultantId, Long placementId) {
        Optional<TalentPlacement> p = placements.findByOrgIdAndId(org, placementId).filter(x -> consultantId.equals(x.getConsultantId()));
        return p.orElseThrow(OrgNotFoundException::new);
    }

    private static void requireActive(TalentPlacement p) {
        if (!"ACTIVE".equals(p.getStatus())) {
            throw OrgException.coded(409, CODE_NOT_ACTIVE, "This placement has ended, so its checklist can no longer be changed.", Map.of("status", p.getStatus()));
        }
    }

}
