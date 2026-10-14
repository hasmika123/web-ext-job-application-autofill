package com.dossier.api.service.ent.consultantws;

import com.dossier.api.domain.ent.consultantws.CwsJobSource;
import com.dossier.api.repository.ent.consultantws.CwsJobSourceRepository;
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
 */
@Service
public class ConsultantWsJobSourceReader {

    public static final int MAX_URL = 500;

    /** What a job card shows. {@code sourceUrl} is null when there is no usable https link; {@code sample} marks demo stand-in rows. */
    public record Info(String sourceUrl, String sourceName, String quickInfo, boolean sample) {
        public static final Info NONE = new Info(null, null, null, false);
    }

    private final CwsJobSourceRepository sources;

    public ConsultantWsJobSourceReader(CwsJobSourceRepository sources) {
        this.sources = sources;
    }

    /** The source info of the given jobs of one organization; jobs without a row are absent from the map. */
    public Map<Long, Info> load(Long orgId, Collection<Long> requirementIds) {
        Map<Long, Info> out = new HashMap<>();
        List<Long> ids = List.copyOf(requirementIds);
        for (int i = 0; i < ids.size(); i += 200) {
            for (CwsJobSource s : sources.findByOrgIdAndRequirementIdIn(orgId, ids.subList(i, Math.min(i + 200, ids.size())))) {
                out.put(s.getRequirementId(), info(s));
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
    public static String safeUrl(String raw) {
        if (raw == null) return null;
        String t = raw.strip();
        if (t.isEmpty() || t.length() > MAX_URL) return null;
        if (t.chars().anyMatch(ch -> Character.isISOControl(ch) || Character.isWhitespace(ch))) return null;
        try {
            URI u = new URI(t);
            if (!"https".equals(u.getScheme() == null ? null : u.getScheme().toLowerCase(Locale.ROOT))) return null;
            if (u.getRawUserInfo() != null) return null;
            String host = u.getHost();
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
