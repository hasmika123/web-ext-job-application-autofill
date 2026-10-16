package com.dossier.api.service.ent.resumes;

import com.dossier.api.domain.ProfileItem;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.ent.talent.ConsultantSkill;
import com.dossier.api.domain.ent.talent.OrgResume;
import com.dossier.api.domain.ent.talent.OrgResumeExperience;
import com.dossier.api.domain.enumeration.ProfileSection;
import com.dossier.api.repository.ProfileItemRepository;
import com.dossier.api.repository.ent.consultantws.CwsProfileDetailRepository;
import com.dossier.api.repository.ent.talent.ConsultantSkillRepository;
import com.dossier.api.repository.ent.talent.OrgResumeExperienceRepository;
import com.dossier.api.repository.ent.talent.OrgResumeRepository;
import com.dossier.api.service.org.OrgNotFoundException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import org.springframework.stereotype.Component;

/**
 * Where "New resume" gets its content for a consultant INSIDE an organization (D10 of the 2026-10-16 audit). The builder's "Use my profile" reads the
 * account's Common Profile items; an enterprise account that has never filled those in still has a full career profile in the organization workspace
 * (headline, skills, work history in the organization's resumes, summary), and the chooser used to say "Your profile is empty" next to a full profile page.
 * The organization's records are the consultant's profile here, so:
 *
 * <ul>
 *   <li>{@link #summary} counts the account's profile items when there are any, else the organization career profile;</li>
 *   <li>{@link #resolve} turns a {@code profile} request with no account items into a parsed-upload style source built from the career profile, and a
 *       {@code directory} request ({@code orgResumeId}: a resume of the organization directory that has no builder document, e.g. an imported or seeded
 *       record) into one built from that row, so it can be copied and edited in the one builder. Every other source is returned unchanged.</li>
 * </ul>
 *
 * Nothing here reads another consultant's rows: the caller passes the consultant it already authorised, and a directory row of anyone else is the generic 404.
 */
@Component
public class ConsultantCareerSeed {

    /** What the chooser says about the profile source (counts and the headline only, never values). */
    public record Summary(int itemCount, int roles, int schools, int skills, String headline) {}

    private static final int MAX_ROLES = 12;

    private final ProfileItemRepository profileItems;
    private final ConsultantSkillRepository skills;
    private final OrgResumeRepository orgResumes;
    private final OrgResumeExperienceRepository experience;
    private final CwsProfileDetailRepository details;
    private final ObjectMapper mapper;

    public ConsultantCareerSeed(
        ProfileItemRepository profileItems,
        ConsultantSkillRepository skills,
        OrgResumeRepository orgResumes,
        OrgResumeExperienceRepository experience,
        CwsProfileDetailRepository details,
        ObjectMapper mapper
    ) {
        this.profileItems = profileItems;
        this.skills = skills;
        this.orgResumes = orgResumes;
        this.experience = experience;
        this.details = details;
        this.mapper = mapper;
    }

    private List<ProfileItem> accountItems(Long userId) {
        if (userId == null) return List.of();
        return profileItems.findByUserIdAndDeletedAtIsNullOrderBySectionAscPositionAsc(userId).stream().filter(i -> !i.isHidden()).toList();
    }

    /** The profile card of the chooser: the account's items when it has any, else the organization career profile. */
    public Summary summary(Long orgId, ConsultantProfile c, Long ownerUserId) {
        List<ProfileItem> items = accountItems(ownerUserId);
        String headline = headlineOf(c);
        if (!items.isEmpty()) {
            int skillCount = 0;
            for (ProfileItem i : items) if (i.getSection() == ProfileSection.SKILL) skillCount += skillCount(i.getDataJson());
            return new Summary(
                items.size(),
                (int) items.stream().filter(i -> i.getSection() == ProfileSection.EXPERIENCE).count(),
                (int) items.stream().filter(i -> i.getSection() == ProfileSection.EDUCATION).count(),
                skillCount,
                headline
            );
        }
        int roles = roleRows(orgId, c).size();
        int skillCount = skills.findByOrgIdAndConsultantIdOrderBySortOrderAsc(orgId, c.getId()).size();
        return new Summary(roles + (skillCount > 0 ? 1 : 0), roles, 0, skillCount, headline);
    }

    /** The source to hand the builder: see the class comment. {@code source} is whatever the client sent (null, a string, or an object with {@code kind}). */
    public JsonNode resolve(Long orgId, ConsultantProfile c, Long ownerUserId, JsonNode source) {
        String kind = kindOf(source);
        if ("directory".equals(kind)) {
            JsonNode id = source.get("orgResumeId");
            Long orgResumeId = id != null && id.canConvertToLong() ? id.longValue() : null;
            if (orgResumeId == null) throw new OrgNotFoundException();
            OrgResume row = orgResumes.findByOrgIdAndId(orgId, orgResumeId).orElseThrow(OrgNotFoundException::new);
            if (!c.getId().equals(row.getConsultantId())) throw new OrgNotFoundException();
            return uploadSource(c, row.getName(), row.getSummaryText(), row.getHeadline(), rowsOf(orgId, row.getId()));
        }
        if ("profile".equals(kind) && accountItems(ownerUserId).isEmpty()) {
            Summary s = summary(orgId, c, ownerUserId);
            if (s.itemCount() > 0) return uploadSource(c, null, summaryText(orgId, c), s.headline(), roleRows(orgId, c));
        }
        return source;
    }

    // ---- the pieces -------------------------------------------------------------------------------------------------------------

    /** {@code profile} for null, "profile" and {kind:"profile"}; the lower-case trimmed kind otherwise. */
    private static String kindOf(JsonNode source) {
        if (source == null || source.isNull()) return "profile";
        String k = source.isTextual() ? source.textValue() : source.path("kind").asText("profile");
        return k.trim().toLowerCase(Locale.ROOT);
    }

    private String summaryText(Long orgId, ConsultantProfile c) {
        return details.findByOrgIdAndConsultantId(orgId, c.getId()).map(d -> d.getSummaryText()).filter(t -> t != null && !t.isBlank()).orElse(null);
    }

    /** The work history of the consultant's primary resume, else of the newest resume that has any. */
    private List<OrgResumeExperience> roleRows(Long orgId, ConsultantProfile c) {
        List<OrgResume> mine = new ArrayList<>(orgResumes.findByOrgIdAndConsultantId(orgId, c.getId()));
        mine.sort(Comparator.comparing(OrgResume::isPrimaryForOrg).reversed().thenComparing(OrgResume::getUpdatedAt, Comparator.reverseOrder()));
        for (OrgResume r : mine) {
            List<OrgResumeExperience> rows = rowsOf(orgId, r.getId());
            if (!rows.isEmpty()) return rows;
        }
        return List.of();
    }

    private List<OrgResumeExperience> rowsOf(Long orgId, Long orgResumeId) {
        List<OrgResumeExperience> rows = experience.findByOrgIdAndResumeIdOrderBySortOrderAsc(orgId, orgResumeId);
        return rows.size() > MAX_ROLES ? rows.subList(0, MAX_ROLES) : rows;
    }

    private ObjectNode uploadSource(ConsultantProfile c, String name, String summary, String headline, List<OrgResumeExperience> roles) {
        ObjectNode structured = mapper.createObjectNode();
        if (summary != null && !summary.isBlank()) structured.put("summary", summary.trim());
        ArrayNode skillNames = structured.putArray("skills");
        // the consultant's skills, primary ones first
        skills.findByOrgIdAndConsultantIdOrderBySortOrderAsc(c.getOrgId(), c.getId()).stream()
            .sorted(Comparator.comparing((ConsultantSkill s) -> !s.isPrimarySkill()))
            .forEach(s -> skillNames.add(s.getSkill()));
        ArrayNode exp = structured.putArray("experience");
        for (OrgResumeExperience r : roles) {
            ObjectNode e = exp.addObject();
            e.put("company", r.getEmployer() == null ? "" : r.getEmployer());
            e.put("title", r.getTitle() == null ? "" : r.getTitle());
            e.put("location", "");
            e.put("startDate", String.valueOf(r.getStartYear()));
            e.put("endDate", r.getEndYear() == null ? "" : String.valueOf(r.getEndYear()));
            e.put("current", r.getEndYear() == null);
            e.putArray("bullets");
        }
        structured.putArray("education");
        structured.putArray("languages");
        structured.putArray("projects");

        ObjectNode bio = mapper.createObjectNode();
        String display = c.getDisplayName() == null ? "" : c.getDisplayName().trim();
        int space = display.indexOf(' ');
        bio.put("firstName", space > 0 ? display.substring(0, space) : display);
        if (space > 0) bio.put("lastName", display.substring(space + 1).trim());
        if (c.getEmail() != null && !c.getEmail().isBlank()) bio.put("email", c.getEmail());
        if (headline != null && !headline.isBlank()) bio.put("headline", headline);

        ObjectNode source = mapper.createObjectNode();
        source.put("kind", "upload");
        source.put("fileName", name == null || name.isBlank() ? "career-profile" : name);
        source.set("structured", structured);
        source.set("bio", bio);
        return source;
    }

    private static String headlineOf(ConsultantProfile c) {
        String h = c.getHeadline() != null && !c.getHeadline().isBlank() ? c.getHeadline() : c.getJobTitle();
        return h == null || h.isBlank() ? null : h.trim();
    }

    private int skillCount(String dataJson) {
        try {
            JsonNode n = mapper.readTree(dataJson == null ? "{}" : dataJson).path("skills");
            return n.isArray() ? n.size() : 0;
        } catch (Exception e) {
            return 0;
        }
    }
}
