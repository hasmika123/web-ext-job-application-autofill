package com.dossier.api.service.ent.consultantws;

import com.dossier.api.domain.ent.consultantws.CwsResumeActivity;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.ent.talent.ConsultantSkill;
import com.dossier.api.domain.ent.talent.OrgResume;
import com.dossier.api.domain.ent.talent.OrgResumeExperience;
import com.dossier.api.repository.ent.consultantws.CwsResumeActivityRepository;
import com.dossier.api.repository.ent.talent.ConsultantSkillRepository;
import com.dossier.api.repository.ent.talent.OrgResumeExperienceRepository;
import com.dossier.api.repository.ent.talent.OrgResumeRepository;
import com.dossier.api.service.ent.authz.AuthorizationService;
import com.dossier.api.service.ent.authz.AuthzOperation;
import com.dossier.api.service.ent.authz.AuthzRequest;
import com.dossier.api.service.ent.authz.Beneficiary;
import com.dossier.api.service.ent.consultantws.ConsultantResumesDTO.ActivityRow;
import com.dossier.api.service.ent.consultantws.ConsultantResumesDTO.Check;
import com.dossier.api.service.ent.consultantws.ConsultantResumesDTO.Experience;
import com.dossier.api.service.ent.consultantws.ConsultantResumesDTO.Improvement;
import com.dossier.api.service.ent.consultantws.ConsultantResumesDTO.Me;
import com.dossier.api.service.ent.consultantws.ConsultantResumesDTO.Preview;
import com.dossier.api.service.ent.consultantws.ConsultantResumesDTO.PrimaryTile;
import com.dossier.api.service.ent.consultantws.ConsultantResumesDTO.Response;
import com.dossier.api.service.ent.consultantws.ConsultantResumesDTO.ResumeRow;
import com.dossier.api.service.ent.consultantws.ConsultantResumesDTO.Strength;
import com.dossier.api.service.ent.consultantws.ConsultantResumesDTO.Tile;
import com.dossier.api.service.ent.consultantws.ConsultantResumesDTO.Tiles;
import com.dossier.api.service.org.OrgException;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import com.dossier.api.service.privacy.SensitiveContent;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The Consultant workspace My Resumes page (docs/enterprise-v2/page-consultant-resumes.md). Same gate as the Home
 * ({@link ConsultantHomeService#requireSelf}): an ACTIVE member holding {@code opportunities.respond} who is linked to a
 * {@code consultant_profile}; anyone else, another organization, or another consultant's resume gets the same generic 404. Writes also
 * need {@code resumes.manage} (OWN). Every query takes the organization id first and the caller's own consultant id.
 */
@Service
public class ConsultantResumesService {

    public static final String WRITE_PERMISSION = "resumes.manage";
    public static final int MAX_RESUMES = 50;
    static final int NAME_MAX = 200;
    static final int WEEKS = 6;
    static final Set<String> VISIBILITIES = Set.of("INTERNAL", "PUBLIC", "PRIVATE");
    static final Set<String> ACTIVITY_KINDS = Set.of(CwsResumeActivity.VIEWED, CwsResumeActivity.DOWNLOADED, CwsResumeActivity.SHARED);
    private static final String PROFILE_HREF = "/w/consultant/profile";

    private final ConsultantHomeService home;
    private final AuthorizationService authorization;
    private final OrgResumeRepository resumes;
    private final OrgResumeExperienceRepository experience;
    private final ConsultantSkillRepository skills;
    private final CwsResumeActivityRepository activity;
    private final Clock clock;

    @Autowired
    public ConsultantResumesService(
        ConsultantHomeService home,
        AuthorizationService authorization,
        OrgResumeRepository resumes,
        OrgResumeExperienceRepository experience,
        ConsultantSkillRepository skills,
        CwsResumeActivityRepository activity
    ) {
        this(home, authorization, resumes, experience, skills, activity, Clock.systemUTC());
    }

    ConsultantResumesService(
        ConsultantHomeService home,
        AuthorizationService authorization,
        OrgResumeRepository resumes,
        OrgResumeExperienceRepository experience,
        ConsultantSkillRepository skills,
        CwsResumeActivityRepository activity,
        Clock clock
    ) {
        this.home = home;
        this.authorization = authorization;
        this.resumes = resumes;
        this.experience = experience;
        this.skills = skills;
        this.activity = activity;
        this.clock = clock;
    }

    /** The consultant for a write: the read gate plus {@code resumes.manage}. */
    private ConsultantProfile requireWriter(OrgMembership me) {
        ConsultantProfile c = home.requireSelf(me);
        authorization.require(AuthzRequest.of(me.orgId(), List.of(WRITE_PERMISSION), Beneficiary.SELF, null, AuthzOperation.WRITE).withActor(me));
        return c;
    }

    private OrgResume own(ConsultantProfile c, Long resumeId) {
        if (resumeId == null) throw new OrgNotFoundException();
        OrgResume r = resumes.findByOrgIdAndId(c.getOrgId(), resumeId).orElseThrow(OrgNotFoundException::new);
        if (!c.getId().equals(r.getConsultantId())) throw new OrgNotFoundException();
        return r;
    }

    // ---- reads ------------------------------------------------------------------------------------------------------------------

    @Transactional(readOnly = true)
    public Response page(OrgMembership me) {
        ConsultantProfile c = home.requireSelf(me);
        Long org = c.getOrgId();
        Instant now = Instant.now(clock);
        List<OrgResume> mine = resumes.findByOrgIdAndConsultantId(org, c.getId());
        List<CwsResumeActivity> acts = activity.findByOrgIdAndConsultantIdOrderByOccurredAtDesc(org, c.getId());
        Map<Long, OrgResume> byId = mine.stream().collect(Collectors.toMap(OrgResume::getId, Function.identity()));

        OrgResume primary = mine.stream().filter(OrgResume::isPrimaryForOrg).findFirst().orElse(null);
        Tiles tiles = new Tiles(
            tile(mine.size(), mine.stream().map(OrgResume::getCreatedAt).toList(), now),
            new PrimaryTile(primary == null ? 0 : 1, primary == null ? null : primary.getName()),
            tile(acts, CwsResumeActivity.VIEWED, now),
            tile(acts, CwsResumeActivity.DOWNLOADED, now),
            tile(acts, CwsResumeActivity.SHARED, now)
        );

        List<ResumeRow> rows = mine.stream().sorted(Comparator.comparing(OrgResume::getUpdatedAt).reversed()).map(ConsultantResumesService::row).toList();
        boolean hasExperience = mine.stream().anyMatch(r -> !experience.findByOrgIdAndResumeIdOrderBySortOrderAsc(org, r.getId()).isEmpty());
        boolean hasSkills = skills.findByOrgIdAndConsultantIdOrderBySortOrderAsc(org, c.getId()).size() >= 3;
        boolean hasSummary = mine.stream().anyMatch(r -> notBlank(r.getSummaryText()));
        boolean hasEmail = notBlank(c.getEmail());
        Strength strength = strength(c, mine, hasEmail, hasExperience, hasSkills, hasSummary);

        return new Response(org, now, new Me(c.getId(), c.getDisplayName()), tiles, rows, strength, improvements(c, mine, hasExperience, hasSkills, hasSummary), recent(mine, byId, acts));
    }

    @Transactional(readOnly = true)
    public Preview preview(OrgMembership me, Long resumeId) {
        ConsultantProfile c = home.requireSelf(me);
        OrgResume r = own(c, resumeId);
        List<String> skillNames = skills.findByOrgIdAndConsultantIdOrderBySortOrderAsc(c.getOrgId(), c.getId()).stream()
            .sorted(Comparator.comparing((ConsultantSkill s) -> !s.isPrimarySkill()))
            .map(ConsultantSkill::getSkill)
            .toList();
        List<Experience> exp = experience.findByOrgIdAndResumeIdOrderBySortOrderAsc(c.getOrgId(), r.getId()).stream()
            .map(x -> new Experience(x.getTitle(), x.getEmployer(), x.getStartYear(), x.getEndYear()))
            .toList();
        return new Preview(r.getId(), r.getName(), r.getTargetRole(), r.getVersionNo(), r.getVisibility(), r.getUpdatedAt(), c.getDisplayName(), c.getEmail(), c.getJobTitle(), r.getHeadline(), r.getSummaryText(), skillNames, exp);
    }

    // ---- writes -----------------------------------------------------------------------------------------------------------------

    /** Makes this resume the consultant's primary: the old primary is cleared and flushed first (the generated unique key allows one). */
    @Transactional
    public ResumeRow setPrimary(OrgMembership me, Long resumeId) {
        ConsultantProfile c = requireWriter(me);
        OrgResume target = own(c, resumeId);
        if (!target.isPrimaryForOrg()) {
            for (OrgResume r : resumes.findByOrgIdAndConsultantId(c.getOrgId(), c.getId())) {
                if (r.isPrimaryForOrg() && !r.getId().equals(target.getId())) {
                    r.setPrimaryForOrg(false);
                    resumes.saveAndFlush(r);
                }
            }
            target.setPrimaryForOrg(true);
            target = resumes.saveAndFlush(target);
        }
        return row(target);
    }

    /** Renames and/or changes visibility. Content is not edited here, so the approval status does not change. */
    @Transactional
    public ResumeRow patch(OrgMembership me, Long resumeId, ConsultantResumesDTO.Patch body) {
        ConsultantProfile c = requireWriter(me);
        OrgResume r = own(c, resumeId);
        if (body == null || (body.name() == null && body.visibility() == null)) throw OrgException.invalid("body", "send a name or a visibility");
        String name = body.name() == null ? null : cleanName(body.name());
        String visibility = body.visibility() == null ? null : cleanVisibility(body.visibility());
        if (name != null) r.setName(name);
        if (visibility != null) r.setVisibility(visibility);
        return row(resumes.saveAndFlush(r));
    }

    /** Records that the consultant viewed, downloaded or shared one of their own resumes. */
    @Transactional
    public void record(OrgMembership me, Long resumeId, String kind) {
        ConsultantProfile c = requireWriter(me);
        OrgResume r = own(c, resumeId);
        String k = kind == null ? "" : kind.strip().toUpperCase(java.util.Locale.ROOT);
        if (!ACTIVITY_KINDS.contains(k)) throw OrgException.invalid("kind", "must be VIEWED, DOWNLOADED or SHARED");
        CwsResumeActivity a = new CwsResumeActivity();
        a.setOrgId(c.getOrgId());
        a.setConsultantId(c.getId());
        a.setResumeId(r.getId());
        a.setKind(k);
        a.setOccurredAt(Instant.now(clock));
        activity.save(a);
    }

    /**
     * A copy of one of the consultant's resumes: the next version number, private, not primary, and PENDING again so nothing becomes
     * approved without the organization's Resumes review. Experience rows are copied.
     */
    @Transactional
    public ResumeRow duplicate(OrgMembership me, Long resumeId) {
        ConsultantProfile c = requireWriter(me);
        OrgResume src = own(c, resumeId);
        List<OrgResume> mine = resumes.findByOrgIdAndConsultantId(c.getOrgId(), c.getId());
        if (mine.size() >= MAX_RESUMES) throw OrgException.invalid("resume", "you can keep at most " + MAX_RESUMES + " resumes");
        Instant now = Instant.now(clock);
        OrgResume copy = new OrgResume();
        copy.setOrgId(c.getOrgId());
        copy.setConsultantId(c.getId());
        copy.setMemberId(c.getMemberId());
        copy.setOwnerMemberId(me.memberId());
        copy.setKind(src.getKind());
        String suffix = " (copy)";
        String base = src.getName().length() + suffix.length() > NAME_MAX ? src.getName().substring(0, NAME_MAX - suffix.length()) : src.getName();
        copy.setName(base + suffix);
        copy.setTargetRole(src.getTargetRole());
        copy.setVersionNo(src.getVersionNo() + 1);
        copy.setHeadline(src.getHeadline());
        copy.setSummaryText(src.getSummaryText());
        copy.setVisibility("PRIVATE");
        copy.setPrimaryForOrg(false);
        copy.setApprovalStatus("PENDING");
        copy.setCreatedAt(now);
        copy.setUpdatedAt(now);
        copy = resumes.saveAndFlush(copy);
        for (OrgResumeExperience x : experience.findByOrgIdAndResumeIdOrderBySortOrderAsc(c.getOrgId(), src.getId())) {
            OrgResumeExperience y = new OrgResumeExperience();
            y.setOrgId(c.getOrgId());
            y.setResumeId(copy.getId());
            y.setTitle(x.getTitle());
            y.setEmployer(x.getEmployer());
            y.setStartYear(x.getStartYear());
            y.setEndYear(x.getEndYear());
            y.setSortOrder(x.getSortOrder());
            experience.save(y);
        }
        return row(copy);
    }

    // ---- derivations ------------------------------------------------------------------------------------------------------------

    static String cleanName(String raw) {
        String t = raw.strip().replaceAll("\\s+", " ");
        if (t.isEmpty()) throw OrgException.invalid("name", "cannot be empty");
        if (t.length() > NAME_MAX) throw OrgException.invalid("name", "at most " + NAME_MAX + " characters");
        if (t.chars().anyMatch(Character::isISOControl) || t.indexOf('<') >= 0 || t.indexOf('>') >= 0) throw OrgException.invalid("name", "contains characters that are not allowed");
        SensitiveContent.check("name", "name", t);
        return t;
    }

    static String cleanVisibility(String raw) {
        String v = raw.strip().toUpperCase(java.util.Locale.ROOT);
        if (!VISIBILITIES.contains(v)) throw OrgException.invalid("visibility", "must be INTERNAL, PUBLIC or PRIVATE");
        return v;
    }

    static ResumeRow row(OrgResume r) {
        return new ResumeRow(r.getId(), r.getName(), r.getTargetRole(), r.isPrimaryForOrg(), r.getUpdatedAt(), r.getVisibility(), r.getVersionNo() == null ? 1 : r.getVersionNo(), r.getApprovalStatus());
    }

    private static boolean notBlank(String s) {
        return s != null && !s.isBlank();
    }

    private static Tile tile(List<CwsResumeActivity> acts, String kind, Instant now) {
        List<Instant> stamps = acts.stream().filter(a -> kind.equals(a.getKind())).map(CwsResumeActivity::getOccurredAt).toList();
        return tile(stamps.size(), stamps, now);
    }

    /** The value now, the value 30 days ago (items stamped before now-30d), the absolute and percent change, and a cumulative weekly sparkline. */
    static Tile tile(long value, List<Instant> stamps, Instant now) {
        Instant monthAgo = now.minus(Duration.ofDays(30));
        long previous = stamps.stream().filter(t -> t != null && t.isBefore(monthAgo)).count();
        Double pct = previous == 0 ? null : Math.round(((value - previous) * 1000.0) / previous) / 10.0;
        List<Long> spark = new ArrayList<>();
        for (int w = WEEKS - 1; w >= 0; w--) {
            Instant at = now.minus(Duration.ofDays(7L * w));
            spark.add(stamps.stream().filter(t -> t != null && !t.isAfter(at)).count());
        }
        return new Tile(value, previous, value - previous, pct, spark);
    }

    /** Same derivation as the Home's Resume Strength (profile_completeness ring + the five checks). */
    private Strength strength(ConsultantProfile c, List<OrgResume> mine, boolean hasEmail, boolean hasExperience, boolean hasSkills, boolean hasSummary) {
        List<Check> checks = List.of(
            new Check("contact", "Contact information", hasEmail),
            new Check("experience", "Work experience", hasExperience),
            new Check("skills", "Key skills", hasSkills),
            new Check("certifications", "Add certifications", c.isHasCertifications()),
            new Check("summary", "Add a summary statement", hasSummary)
        );
        int pct = c.getProfileCompleteness() == null ? 0 : Math.max(0, Math.min(100, c.getProfileCompleteness()));
        return new Strength(pct, !mine.isEmpty(), checks);
    }

    /** What is missing, as things the consultant can act on. No AI: every line is a rule over the consultant's own rows. */
    private List<Improvement> improvements(ConsultantProfile c, List<OrgResume> mine, boolean hasExperience, boolean hasSkills, boolean hasSummary) {
        List<Improvement> out = new ArrayList<>();
        if (mine.stream().noneMatch(OrgResume::isPrimaryForOrg) && !mine.isEmpty()) {
            OrgResume best = mine.stream().filter(r -> "APPROVED".equals(r.getApprovalStatus())).max(Comparator.comparing(OrgResume::getUpdatedAt)).orElse(mine.get(0));
            out.add(new Improvement("primary", "Choose a primary resume", "The one used in your applications", "set-primary", null, best.getId()));
        }
        if (!hasExperience) out.add(new Improvement("experience", "Add work experience", "Show the roles you have held", "link", PROFILE_HREF, null));
        if (!hasSkills) out.add(new Improvement("skills", "Include relevant keywords", "List at least three key skills", "link", PROFILE_HREF, null));
        if (!hasSummary) out.add(new Improvement("summary", "Enhance professional summary", "Make a stronger first impression", "link", PROFILE_HREF, null));
        if (mine.stream().anyMatch(r -> !notBlank(r.getHeadline()))) out.add(new Improvement("headline", "Add a headline", "A short line under your name", "link", PROFILE_HREF, null));
        if (!c.isHasCertifications()) out.add(new Improvement("certifications", "Add certifications", "Showcase your relevant credentials", "link", PROFILE_HREF, null));
        return out.stream().limit(4).toList();
    }

    /** Views, downloads and shares from the activity table, plus an "updated" line for every resume changed after it was created. */
    private List<ActivityRow> recent(List<OrgResume> mine, Map<Long, OrgResume> byId, List<CwsResumeActivity> acts) {
        List<ActivityRow> all = new ArrayList<>();
        for (CwsResumeActivity a : acts) {
            OrgResume r = byId.get(a.getResumeId());
            if (r != null) all.add(new ActivityRow(a.getKind(), r.getId(), r.getName(), r.getVersionNo(), a.getOccurredAt()));
        }
        for (OrgResume r : mine) {
            if (r.getUpdatedAt() != null && r.getCreatedAt() != null && r.getUpdatedAt().isAfter(r.getCreatedAt().plus(Duration.ofMinutes(1)))) {
                all.add(new ActivityRow("UPDATED", r.getId(), r.getName(), r.getVersionNo(), r.getUpdatedAt()));
            }
        }
        return all.stream().sorted(Comparator.comparing(ActivityRow::at).reversed()).limit(6).toList();
    }
}
