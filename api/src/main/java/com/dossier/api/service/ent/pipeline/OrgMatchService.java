package com.dossier.api.service.ent.pipeline;

import com.dossier.api.domain.Bio;
import com.dossier.api.domain.JobPosting;
import com.dossier.api.domain.Resume;
import com.dossier.api.domain.ent.pipeline.JobOpportunity;
import com.dossier.api.domain.ent.pipeline.OpportunityMatch;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.ent.talent.ConsultantSkill;
import com.dossier.api.domain.ent.talent.OrgResume;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.repository.BioRepository;
import com.dossier.api.repository.JobPostingRepository;
import com.dossier.api.repository.ResumeRepository;
import com.dossier.api.repository.ent.pipeline.JobOpportunityRepository;
import com.dossier.api.repository.ent.pipeline.OpportunityMatchRepository;
import com.dossier.api.repository.ent.talent.ConsultantProfileRepository;
import com.dossier.api.repository.ent.talent.ConsultantSkillRepository;
import com.dossier.api.repository.ent.talent.OrgResumeRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.service.ai.AiResult;
import com.dossier.api.service.ent.authz.AuthzReason;
import com.dossier.api.service.ent.authz.ReasonToHttp;
import com.dossier.api.service.ent.billing.MatchingUsageLedger;
import com.dossier.api.service.jobs.JobBoardProperties;
import com.dossier.api.service.jobs.JobMatchPrompt;
import com.dossier.api.service.jobs.JobPrefilter;
import com.dossier.api.service.jobs.MatchPreferences;
import com.dossier.api.service.jobs.JobScoreParser;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Produces one consultant's organization matches. The producer owns orchestration and canonical persistence; the
 * candidate projector, rule scorer, AI scorer, and entitlement service each keep their narrower boundaries.
 */
@Service
public final class OrgMatchService {

    private static final Logger LOG = LoggerFactory.getLogger(OrgMatchService.class);

    public static final String SOURCE_AI = "SUGGESTED_AI";
    public static final String SOURCE_RULE = "SUGGESTED_RULE";
    public static final String STATUS_SUGGESTED = "SUGGESTED";

    public enum Status {
        AI,
        RULE,
        REPLAYED,
        NO_PROFILE,
        NO_RESUME,
        NO_CANDIDATES,
        NO_SCORES
    }

    public record Result(Status status, int candidates, int scored, int written) {}

    private record FullProfile(Resume resume, MatchPreferences preferences) {}

    private record PreparedCandidate(String ref, OpportunityCandidateProjector.Candidate candidate, Long opportunityId) {}

    private final OpportunityCandidateProjector projector;
    private final OpportunityRuleScorer rules;
    private final OpportunityAiScorer ai;
    private final OpportunityMatchingEntitlementService entitlement;
    private final MatchingBatchSettings batchSettings;
    private final OpportunityMatchRepository matches;
    private final JobOpportunityRepository opportunities;
    private final JobPostingRepository postings;
    private final ConsultantProfileRepository consultants;
    private final ConsultantSkillRepository skills;
    private final OrgResumeRepository orgResumes;
    private final OrgMemberRepository members;
    private final ResumeRepository personalResumes;
    private final BioRepository bios;
    private final JobBoardProperties jobProperties;
    private final Clock clock;

    @Autowired
    public OrgMatchService(
        OpportunityCandidateProjector projector,
        OpportunityRuleScorer rules,
        OpportunityAiScorer ai,
        OpportunityMatchingEntitlementService entitlement,
        MatchingBatchSettings batchSettings,
        OpportunityMatchRepository matches,
        JobOpportunityRepository opportunities,
        JobPostingRepository postings,
        ConsultantProfileRepository consultants,
        ConsultantSkillRepository skills,
        OrgResumeRepository orgResumes,
        OrgMemberRepository members,
        ResumeRepository personalResumes,
        BioRepository bios,
        JobBoardProperties jobProperties
    ) {
        this(
            projector,
            rules,
            ai,
            entitlement,
            batchSettings,
            matches,
            opportunities,
            postings,
            consultants,
            skills,
            orgResumes,
            members,
            personalResumes,
            bios,
            jobProperties,
            Clock.systemUTC()
        );
    }

    OrgMatchService(
        OpportunityCandidateProjector projector,
        OpportunityRuleScorer rules,
        OpportunityAiScorer ai,
        OpportunityMatchingEntitlementService entitlement,
        MatchingBatchSettings batchSettings,
        OpportunityMatchRepository matches,
        JobOpportunityRepository opportunities,
        JobPostingRepository postings,
        ConsultantProfileRepository consultants,
        ConsultantSkillRepository skills,
        OrgResumeRepository orgResumes,
        OrgMemberRepository members,
        ResumeRepository personalResumes,
        BioRepository bios,
        JobBoardProperties jobProperties,
        Clock clock
    ) {
        this.projector = projector;
        this.rules = rules;
        this.ai = ai;
        this.entitlement = entitlement;
        this.batchSettings = batchSettings;
        this.matches = matches;
        this.opportunities = opportunities;
        this.postings = postings;
        this.consultants = consultants;
        this.skills = skills;
        this.orgResumes = orgResumes;
        this.members = members;
        this.personalResumes = personalResumes;
        this.bios = bios;
        this.jobProperties = jobProperties;
        this.clock = clock;
    }

    /** Runs one bounded matching batch for the requested consultant. */
    @Transactional
    public Result matchOne(OrgMembership actor, Long consultantMemberId, String attemptId) {
        return matchOne(actor, consultantMemberId, attemptId, clock.instant());
    }

    @Transactional
    Result matchOne(OrgMembership actor, Long consultantMemberId, String attemptId, Instant now) {
        if (actor == null || actor.orgId() == null || actor.memberId() == null) throw new OrgNotFoundException();
        if (consultantMemberId == null) throw new OrgNotFoundException();
        if (attemptId == null || attemptId.isBlank()) throw new IllegalArgumentException("matching attempt id is required");

        Long orgId = actor.orgId();
        OpportunityMatchingEntitlementService.Decision decision = entitlement.reserve(actor, consultantMemberId, attemptId.strip(), now);
        if (!decision.allowed()) {
            if (decision.reason() == AuthzReason.FEATURE_NOT_LICENSED) {
                ConsultantProfile profile = consultants.findByOrgIdAndMemberId(orgId, consultantMemberId).orElseThrow(OrgNotFoundException::new);
                return runRules(actor, consultantMemberId, profilePreferences(orgId, profile), now);
            }
            throw refusal(decision);
        }

        ConsultantProfile profile = consultants.findByOrgIdAndMemberId(orgId, consultantMemberId).orElseThrow(OrgNotFoundException::new);

        // A committed or in-flight idempotency key must never pay for a second provider call.
        MatchingUsageLedger.Reservation reservation = decision.reservation();
        if (reservation == null || !decision.newlyReserved()) {
            return new Result(Status.REPLAYED, 0, 0, 0);
        }

        boolean settled = false;
        try {
            FullProfile full = fullProfile(orgId, profile, now);
            if (full == null || !full.preferences().usable()) {
                entitlement.release(decision, "NO_RESUME", now);
                settled = true;
                return new Result(full == null ? Status.NO_RESUME : Status.NO_PROFILE, 0, 0, 0);
            }

            List<PreparedCandidate> candidates = candidates(orgId, full.preferences(), batchSettings.maxFor(orgId), actor.memberId(), now);
            if (candidates.isEmpty()) {
                entitlement.release(decision, "NO_CANDIDATES", now);
                settled = true;
                return new Result(Status.NO_CANDIDATES, 0, 0, 0);
            }

            List<JobMatchPrompt.Job> jobs = candidates.stream()
                .map(c -> new JobMatchPrompt.Job(c.ref(), c.candidate().title(), c.candidate().company(), c.candidate().location(), c.candidate().workplaceType(), c.candidate().descriptionText()))
                .toList();
            String prompt = JobMatchPrompt.build(full.preferences(), full.resume(), jobs);
            Set<String> refs = candidates.stream().map(PreparedCandidate::ref).collect(java.util.stream.Collectors.toCollection(LinkedHashSet::new));
            OpportunityAiScorer.Result scored = ai.score(null, prompt, refs, decision.aiContext());
            if (!scored.usable()) {
                entitlement.release(decision, "NO_SCORES", now);
                settled = true;
                return new Result(Status.NO_SCORES, candidates.size(), 0, 0);
            }

            int written = upsert(actor, consultantMemberId, candidates, scored.scores(), SOURCE_AI, modelOf(scored.providerResult()), now);
            entitlement.commit(decision, scored.scores().size(), now);
            settled = true;
            return new Result(Status.AI, candidates.size(), scored.scores().size(), written);
        } catch (RuntimeException failure) {
            if (!settled) {
                try {
                    entitlement.release(decision, "FAILED", now);
                } catch (RuntimeException releaseFailure) {
                    LOG.warn("Could not release matching reservation {} after failure: {}", reservation.id(), releaseFailure.getClass().getSimpleName());
                }
            }
            throw failure;
        }
    }

    private Result runRules(OrgMembership actor, Long consultantMemberId, MatchPreferences preferences, Instant now) {
        if (!preferences.usable()) return new Result(Status.NO_PROFILE, 0, 0, 0);
        List<PreparedCandidate> candidates = candidates(actor.orgId(), preferences, batchSettings.maxFor(actor.orgId()), actor.memberId(), now);
        int eligible = 0;
        int written = 0;
        for (PreparedCandidate candidate : candidates) {
            OpportunityRuleScorer.Result result = rules.score(preferences, candidate.candidate());
            if (!result.eligible()) continue;
            eligible++;
            written += upsertOne(
                actor,
                consultantMemberId,
                candidate,
                result.score(),
                result.reason(),
                OpportunityRuleScorer.ALGORITHM_VERSION,
                SOURCE_RULE,
                now
            );
        }
        return new Result(Status.RULE, candidates.size(), eligible, written);
    }

    private List<PreparedCandidate> candidates(
        Long orgId,
        MatchPreferences preferences,
        int requestedLimit,
        Long actorMemberId,
        Instant now
    ) {
        int limit = Math.max(1, Math.min(100, requestedLimit));
        int freshHours = Math.max(1, jobProperties.getFreshHours());
        List<JobPosting> fresh = postings.findByPublishedAtAfter(now.minus(Duration.ofHours(freshHours)));
        List<JobPrefilter.Candidate> publicCandidates = JobPrefilter.select(preferences, fresh, Set.of(), Set.of(), JobPrefilter.MAX_CANDIDATES);
        List<OpportunityCandidateProjector.Candidate> projected = projector.projectOpen(orgId, publicCandidates);
        List<PreparedCandidate> out = new ArrayList<>();
        for (OpportunityCandidateProjector.Candidate candidate : projected) {
            if (out.size() >= limit) break;
            Long opportunityId = candidate.opportunityId();
            if (opportunityId == null && candidate.source() == OpportunityCandidateProjector.Source.PUBLIC_POSTING) {
                opportunityId = materialize(candidate, orgId, actorMemberId, now).getId();
            }
            if (opportunityId == null) continue;
            out.add(new PreparedCandidate("j" + (out.size() + 1), candidate, opportunityId));
        }
        return List.copyOf(out);
    }

    private JobOpportunity materialize(
        OpportunityCandidateProjector.Candidate candidate,
        Long orgId,
        Long actorMemberId,
        Instant now
    ) {
        if (candidate.postingId() == null) throw new IllegalStateException("public candidate has no posting id");
        Optional<JobOpportunity> existing = opportunities.findByOrgIdAndPostingId(orgId, candidate.postingId());
        if (existing.isEmpty() && candidate.dedupeKey() != null) existing = opportunities.findByOrgIdAndDedupeKey(orgId, candidate.dedupeKey());
        if (existing.isPresent()) return existing.get();

        JobOpportunity row = new JobOpportunity();
        row.setOrgId(orgId);
        row.setKind("JOB_POSTING");
        row.setPostingId(candidate.postingId());
        row.setTitle(cap(candidate.title(), 300));
        row.setCompany(cap(candidate.company(), 200));
        row.setLocation(cap(candidate.location(), 300));
        row.setUrl(cap(candidate.url(), 1000));
        row.setApplyUrl(cap(candidate.applyUrl(), 1000));
        row.setSourceLabel(cap(candidate.sourceLabel() == null ? "BOARD_API" : candidate.sourceLabel(), 40));
        row.setDescriptionText(cap(candidate.descriptionText(), 4000));
        row.setSkillsJson(cap(candidate.skillsJson(), 4000));
        row.setStatus("NEW");
        row.setPriority("NORMAL");
        row.setCreatedByMemberId(actorMemberId);
        row.setDedupeKey(cap(candidate.dedupeKey(), 64));
        row.setCreatedAt(now);
        row.setUpdatedAt(now);
        return opportunities.saveAndFlush(row);
    }

    private int upsert(
        OrgMembership actor,
        Long consultantMemberId,
        List<PreparedCandidate> candidates,
        Map<String, JobScoreParser.Score> scores,
        String source,
        String model,
        Instant now
    ) {
        int written = 0;
        for (PreparedCandidate candidate : candidates) {
            JobScoreParser.Score score = scores.get(candidate.ref());
            if (score == null) continue;
            written += upsertOne(actor, consultantMemberId, candidate, score.score(), score.why(), model, source, now);
        }
        return written;
    }

    private int upsertOne(
        OrgMembership actor,
        Long consultantMemberId,
        PreparedCandidate candidate,
        int score,
        String reason,
        String model,
        String source,
        Instant now
    ) {
        OpportunityMatch row = matches.findByOrgIdAndOpportunityIdAndConsultantMemberId(actor.orgId(), candidate.opportunityId(), consultantMemberId).orElse(null);
        if (row == null) {
            row = new OpportunityMatch();
            row.setOrgId(actor.orgId());
            row.setOpportunityId(candidate.opportunityId());
            row.setConsultantMemberId(consultantMemberId);
            row.setCreatedByMemberId(actor.memberId());
            row.setCreatedAt(now);
        }
        row.setScore(Math.max(0, Math.min(100, score)));
        row.setReason(cap(reason, 300));
        row.setModel(cap(model, 80));
        row.setSource(source);
        row.setUpdatedByMemberId(actor.memberId());
        row.setUpdatedAt(now);
        if (row.getStatus() == null || row.getStatus().isBlank()) row.setStatus(STATUS_SUGGESTED);
        matches.saveAndFlush(row);
        return 1;
    }

    private MatchPreferences profilePreferences(Long orgId, ConsultantProfile profile) {
        List<ConsultantSkill> rows = new ArrayList<>(skills.findByOrgIdAndConsultantIdOrderBySortOrderAsc(orgId, profile.getId()));
        rows.sort(Comparator.comparing((ConsultantSkill s) -> !s.isPrimarySkill()).thenComparing(s -> s.getSortOrder() == null ? 0 : s.getSortOrder()));
        Set<String> values = new LinkedHashSet<>();
        for (ConsultantSkill row : rows) {
            if (row.getSkill() != null && !row.getSkill().isBlank()) values.add(row.getSkill().strip());
            if (values.size() >= 30) break;
        }
        return new MatchPreferences(
            List.of(),
            MatchPreferences.Seniority.UNKNOWN,
            0,
            List.copyOf(values),
            null,
            null,
            null,
            null,
            false,
            false
        );
    }

    private FullProfile fullProfile(Long orgId, ConsultantProfile profile, Instant now) {
        if (profile.getMemberId() == null) return null;
        OrgMember seat = members.findByOrgIdAndId(orgId, profile.getMemberId()).orElse(null);
        if (seat == null || seat.getUserId() == null) return null;
        List<Resume> personal = personalResumes.findByUserId(seat.getUserId()).stream().filter(r -> !Boolean.TRUE.equals(r.getArchived())).toList();
        Resume resume = chooseResume(orgId, profile.getId(), personal);
        if (resume == null) return null;
        String bio = bios.findByUserId(seat.getUserId()).stream().findFirst().map(Bio::getPayload).orElse(null);
        MatchPreferences preferences = MatchPreferences.from(bio, resume.getParsedJson(), LocalDate.ofInstant(now, ZoneOffset.UTC));
        return new FullProfile(resume, preferences);
    }

    private Resume chooseResume(Long orgId, Long consultantId, List<Resume> personal) {
        if (personal.isEmpty()) return null;
        Map<Long, Resume> byId = personal.stream().filter(r -> r.getId() != null).collect(java.util.stream.Collectors.toMap(Resume::getId, r -> r, (a, b) -> a));
        List<OrgResume> links = new ArrayList<>(orgResumes.findByOrgIdAndConsultantId(orgId, consultantId));
        links.sort(
            Comparator.comparing(OrgResume::isPrimaryForOrg).reversed()
                .thenComparing(OrgResume::getUpdatedAt, Comparator.nullsLast(Comparator.reverseOrder()))
        );
        for (OrgResume link : links) {
            if (link.getResumeId() == null || "REJECTED".equals(link.getApprovalStatus())) continue;
            Resume linked = byId.get(link.getResumeId());
            if (linked != null) return linked;
        }
        return personal.stream()
            .min(
                Comparator.comparing((Resume r) -> Boolean.TRUE.equals(r.getDefaultResume()) ? 0 : 1)
                    .thenComparing(Resume::getCreatedAt, Comparator.nullsLast(Comparator.reverseOrder()))
            )
            .orElse(null);
    }

    private static RuntimeException refusal(OpportunityMatchingEntitlementService.Decision decision) {
        if (decision.authorization() != null) return ReasonToHttp.toException(decision.authorization());
        return ReasonToHttp.toException(decision.reason(), decision.details());
    }

    private static String modelOf(AiResult result) {
        return result == null || result.model() == null || result.model().isBlank() ? null : result.model().strip();
    }

    private static String cap(String value, int max) {
        if (value == null) return null;
        String clean = value.strip();
        return clean.length() <= max ? clean : clean.substring(0, Math.max(0, max - 3)) + "...";
    }
}
