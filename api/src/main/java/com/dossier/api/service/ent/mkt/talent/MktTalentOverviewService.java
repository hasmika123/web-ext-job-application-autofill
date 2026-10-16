package com.dossier.api.service.ent.mkt.talent;

import com.dossier.api.domain.ent.consultantws.CwsProfileDetail;
import com.dossier.api.domain.ent.talent.ClientAccount;
import com.dossier.api.domain.ent.talent.ClientRequirement;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.ent.talent.TalentApplication;
import com.dossier.api.domain.ent.talent.TalentInterview;
import com.dossier.api.domain.ent.talent.TalentPlacement;
import com.dossier.api.repository.ent.mkt.MktTalentApplicationRepository;
import com.dossier.api.repository.ent.mkt.MktTalentClientRepository;
import com.dossier.api.repository.ent.mkt.MktTalentConsultantRepository;
import com.dossier.api.repository.ent.mkt.MktTalentInterviewRepository;
import com.dossier.api.repository.ent.mkt.MktTalentJobRepository;
import com.dossier.api.repository.ent.mkt.MktTalentPlacementRepository;
import com.dossier.api.repository.ent.mkt.MktTalentProfileDetailRepository;
import com.dossier.api.repository.ent.mkt.MktTalentResumeRepository;
import com.dossier.api.service.dto.ChangeActorDTO;
import com.dossier.api.service.ent.applications.EntChangeActors;
import com.dossier.api.service.ent.mkt.MarketerAccess;
import com.dossier.api.service.ent.mkt.MarketerAccess.Area;
import com.dossier.api.service.ent.mkt.MktScope;
import com.dossier.api.service.ent.mkt.applications.MktApplicationStages;
import com.dossier.api.service.ent.mkt.talent.MktTalentDtos.DetailInterview;
import com.dossier.api.service.ent.mkt.talent.MktTalentOverviewDtos.*;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.EnumMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * One consultant, in full, for the marketer they are assigned to ("My Assigned Talent" -> View Profile). Every part passes through the single
 * {@link MarketerAccess} seam (O5 now: assigned = everything; O6 later: per assignment). A consultant outside the caller's scope, a caller without
 * {@code consultants.view}, another organization's id: the same generic 404. Read-only; nothing here submits or changes anything.
 */
@Service
public class MktTalentOverviewService {

    public static final int RECENT_APPLICATIONS = 5;
    public static final int MAX_RESUMES = 12;
    public static final int MAX_INTERVIEWS = 5;

    private final MktScope scope;
    private final MarketerAccess access;
    private final MktTalentService talent;
    private final MktTalentConsultantRepository consultants;
    private final MktTalentProfileDetailRepository profileDetails;
    private final MktTalentPlacementRepository placements;
    private final MktTalentResumeRepository resumes;
    private final MktTalentApplicationRepository applications;
    private final MktTalentInterviewRepository interviews;
    private final MktTalentJobRepository jobs;
    private final MktTalentClientRepository clients;
    private final EntChangeActors changeActors;

    public MktTalentOverviewService(
        MktScope scope, MarketerAccess access, MktTalentService talent, MktTalentConsultantRepository consultants, MktTalentProfileDetailRepository profileDetails,
        MktTalentPlacementRepository placements, MktTalentResumeRepository resumes, MktTalentApplicationRepository applications, MktTalentInterviewRepository interviews,
        MktTalentJobRepository jobs, MktTalentClientRepository clients, EntChangeActors changeActors
    ) {
        this.scope = scope;
        this.access = access;
        this.talent = talent;
        this.consultants = consultants;
        this.profileDetails = profileDetails;
        this.placements = placements;
        this.resumes = resumes;
        this.applications = applications;
        this.interviews = interviews;
        this.jobs = jobs;
        this.clients = clients;
        this.changeActors = changeActors;
    }

    @Transactional(readOnly = true)
    public Overview overview(OrgMembership me, Long consultantId) {
        return overview(me, consultantId, Instant.now());
    }

    @Transactional(readOnly = true)
    Overview overview(OrgMembership me, Long consultantId, Instant now) {
        MktScope.View view = scope.resolve(me, MktTalentService.PERM_VIEW);
        access.require(view, consultantId, Area.PROFILE);
        Long orgId = view.orgId();
        ConsultantProfile c = consultants.findActiveById(orgId, consultantId).orElseThrow(OrgNotFoundException::new);
        MktTalentService.Fact fact = talent.buildFacts(orgId, List.of(c), now).get(0);

        String authorization = profileDetails.findByOrgIdAndConsultantId(orgId, consultantId).map(CwsProfileDetail::getWorkAuthorization).filter(s -> !s.isBlank()).orElse(null);
        Contact contact = new Contact(blankToNull(c.getEmail()), blankToNull(c.getLocationLabel()), authorization, blankToNull(c.getPhone()), blankToNull(c.getTimeZone()), blankToNull(c.getPreferredContact()));

        List<TalentApplication> apps = access.allows(view, consultantId, Area.APPLICATIONS) ? applications.findForConsultant(orgId, consultantId) : List.of();
        List<TalentInterview> ivs = access.allows(view, consultantId, Area.INTERVIEWS) ? interviews.findUpcomingForConsultant(orgId, consultantId, now).stream().limit(MAX_INTERVIEWS).toList() : List.of();
        List<TalentPlacement> pls = access.allows(view, consultantId, Area.PLACEMENT) ? placements.findActiveForConsultant(orgId, consultantId) : List.of();

        Set<Long> clientIds = new HashSet<>();
        Set<Long> jobIds = new HashSet<>();
        apps.forEach(a -> { clientIds.add(a.getClientId()); jobIds.add(a.getRequirementId()); });
        ivs.forEach(i -> clientIds.add(i.getClientId()));
        pls.stream().limit(1).forEach(p -> clientIds.add(p.getClientId()));
        clientIds.remove(null);
        jobIds.remove(null);
        Map<Long, String> clientName = clientIds.isEmpty() ? Map.of() : clients.findByIds(orgId, clientIds).stream().collect(Collectors.toMap(ClientAccount::getId, ClientAccount::getName, (x, y) -> x));
        Map<Long, String> jobTitle = jobIds.isEmpty() ? Map.of() : jobs.findByIds(orgId, jobIds).stream().collect(Collectors.toMap(ClientRequirement::getId, ClientRequirement::getTitle, (x, y) -> x));

        Placement placement = pls.isEmpty() ? null : placement(pls.get(0), clientName);
        List<OverviewResume> rs = access.allows(view, consultantId, Area.RESUMES)
            ? resumes.findForConsultant(orgId, consultantId).stream().limit(MAX_RESUMES)
                .map(r -> new OverviewResume(r.getId(), r.getName(), r.getVersionNo(), r.isPrimaryForOrg(), r.getApprovalStatus(), r.getUpdatedAt())).toList()
            : List.of();
        List<DetailInterview> di = ivs.stream().map(i -> new DetailInterview(i.getScheduledAt(), i.getRoundLabel(), clientName.getOrDefault(i.getClientId(), ""), i.getDurationMinutes())).toList();

        return new Overview(
            c.getId(), c.getDisplayName(), c.getJobTitle(), c.getHeadline(), c.getYearsExperience(), c.getWorkMode(), fact.row().availability(), fact.row().resume(),
            c.getProfileCompleteness() == null ? 0 : c.getProfileCompleteness(), contact, fact.skills(), placement, rs, summary(orgId, apps, clientName, jobTitle), di
        );
    }

    private static Placement placement(TalentPlacement p, Map<Long, String> clientName) {
        return new Placement(p.getId(), p.getRoleTitle(), clientName.getOrDefault(p.getClientId(), ""), p.getStartDate(), p.getStatus());
    }

    private ApplicationsSummary summary(Long orgId, List<TalentApplication> apps, Map<Long, String> clientName, Map<Long, String> jobTitle) {
        Map<MktApplicationStages.Group, Integer> counts = new EnumMap<>(MktApplicationStages.Group.class);
        int open = 0;
        for (TalentApplication a : apps) {
            counts.merge(MktApplicationStages.of(a.getStage(), a.getClosedReason()), 1, Integer::sum);
            if (!MktApplicationStages.CLOSED.equals(a.getStage())) open++;
        }
        List<StageCount> byStage = new ArrayList<>();
        for (MktApplicationStages.Group g : MktApplicationStages.Group.values()) byStage.add(new StageCount(g.key(), g.label(), counts.getOrDefault(g, 0)));

        List<TalentApplication> latest = apps.stream().sorted(Comparator.comparing(TalentApplication::getUpdatedAt).reversed()).limit(RECENT_APPLICATIONS).toList();
        Set<Long> actorIds = new HashSet<>();
        List<EntChangeActors.Subject> subjects = new ArrayList<>();
        for (TalentApplication a : latest) {
            actorIds.add(a.getUpdatedByMemberId());
            subjects.add(new EntChangeActors.Subject(a.getConsultantId(), a.getMarketerMemberId()));
        }
        EntChangeActors.Lookup actors = changeActors.load(orgId, actorIds, subjects);
        List<RecentApplication> recent = latest.stream().map(a -> {
            MktApplicationStages.Group g = MktApplicationStages.of(a.getStage(), a.getClosedReason());
            ChangeActorDTO by = actors.of(a.getUpdatedByMemberId(), null, new EntChangeActors.Subject(a.getConsultantId(), a.getMarketerMemberId()));
            return new RecentApplication(a.getCode(), jobTitle.getOrDefault(a.getRequirementId(), ""), clientName.getOrDefault(a.getClientId(), ""), g.label(), g.key(), a.getNextAction(), a.getUpdatedAt(), by);
        }).toList();
        return new ApplicationsSummary(apps.size(), open, byStage, recent);
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.strip();
    }
}
