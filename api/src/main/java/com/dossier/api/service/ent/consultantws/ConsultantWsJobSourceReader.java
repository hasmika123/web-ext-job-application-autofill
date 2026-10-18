package com.dossier.api.service.ent.consultantws;

import com.dossier.api.domain.ent.consultantws.CwsJobSource;
import com.dossier.api.domain.ent.talent.ClientRequirement;
import com.dossier.api.repository.ent.consultantws.CwsJobSourceRepository;
import com.dossier.api.repository.ent.talent.ClientRequirementRepository;
import java.net.URI;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.springframework.stereotype.Service;

/**
 * Reads the marketer-entered source link and quick info of jobs ({@code cws_job_source}) for the Job Discovery, Job Matches and Assigned Opportunities
 * pages. Kiwiply does not hold full job details: the consultant opens {@link Info#sourceUrl()} and applies on the source site with the extension.
 * The link is validated again on every read, so a bad row can never reach the browser as a link.
 *
 * <p>A job a marketer saved from the browser extension ("Save for consultant") has no {@code cws_job_source} row: its link is the requirement's own
 * {@code job_url}. {@link #load} falls back to it (same https-only rule) whenever the marketer entered no usable link, so every page shows the
 * same "Open job link" for the same job.
 */
@Service
public class ConsultantWsJobSourceReader {

    public static final int MAX_URL = 500;

    /** What a job card shows. {@code sourceUrl} is null when there is no usable https link; {@code sample} marks demo stand-in rows. */
    public record Info(String sourceUrl, String sourceName, String quickInfo, boolean sample) {
        public static final Info NONE = new Info(null, null, null, false);
    }

    private final CwsJobSourceRepository sources;
    private final ClientRequirementRepository requirements;

    public ConsultantWsJobSourceReader(CwsJobSourceRepository sources, ClientRequirementRepository requirements) {
        this.sources = sources;
        this.requirements = requirements;
    }

    /**
     * The source info of the given jobs of one organization. A job with neither a source row nor a usable {@code job_url} is absent from the map; a job
     * whose row has no usable link takes the requirement's own {@code job_url} (keeping the row's name and quick info).
     */
    public Map<Long, Info> load(Long orgId, Collection<Long> requirementIds) {
        Map<Long, Info> out = new HashMap<>();
        List<Long> ids = List.copyOf(requirementIds);
        for (int i = 0; i < ids.size(); i += 200) {
            for (CwsJobSource s : sources.findByOrgIdAndRequirementIdIn(orgId, ids.subList(i, Math.min(i + 200, ids.size())))) {
                out.put(s.getRequirementId(), info(s));
            }
        }
        List<Long> unlinked = ids.stream().filter(id -> out.get(id) == null || out.get(id).sourceUrl() == null).toList();
        for (int i = 0; i < unlinked.size(); i += 200) {
            for (ClientRequirement r : requirements.findByOrgIdAndIdIn(orgId, unlinked.subList(i, Math.min(i + 200, unlinked.size())))) {
                if (!orgId.equals(r.getOrgId())) continue;
                String url = safeUrl(r.getJobUrl());
                if (url == null) continue;
                Info row = out.get(r.getId());
                out.put(r.getId(), new Info(url, row == null ? null : row.sourceName(), row == null ? null : row.quickInfo(), row != null && row.sample()));
            }
        }
        return out;
    }

    public static Info info(CwsJobSource s) {
        return new Info(safeUrl(s.getSourceUrl()), blankToNull(s.getSourceName()), blankToNull(s.getQuickInfo()), s.isSampleData());
    }

    public static Info orNone(Map<Long, Info> byRequirement, Long requirementId) {
        Info i = byRequirement.get(requirementId);
        return i == null ? Info.NONE : i;
    }

    /**
     * The URL when it is a plain https link with a real host (no credentials, no whitespace or control characters, at most {@value #MAX_URL} characters),
     * else null. Used on write and on read.
     */
    /**
     * Development and demo stacks only: {@code DOSSIER_ALLOW_LOCALHOST_JOB_LINKS=true} also lets a plain-http link on a {@code *.localhost} host through
     * (the local stand-in employer pages of the enterprise demo, {@code web/scripts/demo-ats-server.mjs}). Never set in production; the https rule stands there.
     */
    static final boolean LOCALHOST_LINKS = "true".equalsIgnoreCase(System.getenv("DOSSIER_ALLOW_LOCALHOST_JOB_LINKS"));

    public static String safeUrl(String raw) {
        if (raw == null) return null;
        String t = raw.strip();
        if (t.isEmpty() || t.length() > MAX_URL) return null;
        if (t.chars().anyMatch(ch -> Character.isISOControl(ch) || Character.isWhitespace(ch))) return null;
        try {
            URI u = new URI(t);
            String scheme = u.getScheme() == null ? null : u.getScheme().toLowerCase(Locale.ROOT);
            String host = u.getHost();
            boolean localDev = LOCALHOST_LINKS && "http".equals(scheme) && host != null && host.toLowerCase(Locale.ROOT).endsWith(".localhost");
            if (!"https".equals(scheme) && !localDev) return null;
            if (u.getRawUserInfo() != null) return null;
            if (host == null || host.length() < 3 || !host.contains(".") || host.startsWith(".") || host.endsWith(".")) return null;
            return t;
        } catch (Exception e) {
            return null;
        }
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s;
    }
}
