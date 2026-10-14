package com.dossier.api.service.ent.consultantws;

import com.dossier.api.service.ent.consultantws.ConsultantHomeDTO.Check;
import com.dossier.api.service.ent.consultantws.ConsultantHomeDTO.Tile;
import com.fasterxml.jackson.annotation.JsonInclude;
import java.time.Instant;
import java.util.List;

/** Wire shapes of the Consultant workspace Job Matches page (docs/enterprise-v2/page-consultant-matches.md). */
public final class JobMatchesDTO {

    private JobMatchesDTO() {}

    public record Tiles(Tile total, Tile high, Tile fresh, Tile saved, Tile viewed) {}

    /** One matched job. {@code sourceUrl} (https only, or null), {@code sourceName} and {@code quickInfo} are the marketer's entries (Kiwiply holds no full posting); {@code sourceSample} marks demo stand-in rows. {@code skillFit} is the share (0-100) of the job's listed skills the consultant has; null when the job lists none. */
    public record MatchRow(
        long matchId,
        long requirementId,
        String title,
        String company,
        String location,
        String workMode,
        String employment,
        int score,
        Integer skillFit,
        Instant postedAt,
        Long rateMinMinor,
        Long rateMaxMinor,
        String rateUnit,
        String currency,
        boolean saved,
        boolean viewed,
        boolean interestSent,
        String sourceUrl,
        String sourceName,
        String quickInfo,
        boolean sourceSample
    ) {}

    public record Alert(String key, String kind, String title, String detail, Instant at) {}

    public record Quality(int percent, List<Check> checks) {}

    public record Response(long orgId, Instant generatedAt, String name, Tiles tiles, List<MatchRow> matches, Quality quality, List<Alert> alerts) {}

    /** Skill alignment is present / missing, not a proficiency level: the profile stores no proficiency. */
    public record SkillFit(String skill, boolean present, boolean primary, int percent) {}

    /** {@code ok} true = a green tick, false = a gap. */
    public record Bullet(String key, String text, boolean ok) {}

    /** {@code tag} is GAP (a skill the job lists and the profile lacks) or SUGGESTED. */
    public record Improvement(String tag, String title, String text) {}

    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record Detail(
        MatchRow match,
        String reason,
        List<SkillFit> skills,
        List<Bullet> explanation,
        List<Improvement> improvements,
        Instant interestSentAt,
        String interestNote
    ) {}

    public record InterestRequest(String note) {}

    public record InterestResponse(long matchId, boolean interestSent, Instant interestSentAt) {}

    public record SavedResponse(long matchId, boolean saved) {}

    public record ViewResponse(long matchId, boolean viewed) {}
}
