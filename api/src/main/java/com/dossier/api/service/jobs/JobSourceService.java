package com.dossier.api.service.jobs;

import com.dossier.api.domain.JobSource;
import com.dossier.api.repository.ApplicationRepository;
import com.dossier.api.repository.JobPostingRepository;
import com.dossier.api.repository.JobSourceRepository;
import com.dossier.api.service.AdminAuditService;
import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.ClassPathResource;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/**
 * The pool of company job boards daily job matches read (Phase 13.6a, user decision 2026-09-22:
 * "seed list + users' companies").
 *
 * <ul>
 *   <li><b>Seed</b> — {@code config/job-sources.csv}, 217 boards checked live on 2026-09-22. Synced
 *       before every nightly read: new rows are added, nothing is re-enabled or renamed, so an admin's
 *       switch-off sticks.</li>
 *   <li><b>Discovered</b> — any Greenhouse / Lever / Ashby board a Kiwiply user has an application
 *       on joins the pool, named after the company on that application. Only the company enters the
 *       pool; nothing records who applied.</li>
 *   <li><b>Admin</b> — added by hand after a live check that the board answers.</li>
 * </ul>
 */
@Service
public class JobSourceService {

    private static final Logger LOG = LoggerFactory.getLogger(JobSourceService.class);
    static final String SEED_FILE = "config/job-sources.csv";
    private static final Pattern TOKEN = Pattern.compile("[A-Za-z0-9][A-Za-z0-9._-]{0,99}");

    /** One board as the admin page shows it. */
    public record SourceView(
        Long id,
        String ats,
        String boardToken,
        String companyName,
        String origin,
        boolean enabled,
        Instant lastFetchedAt,
        String lastStatus,
        String lastError,
        Integer lastJobCount,
        int consecutiveFailures,
        long storedPostings
    ) {}

    private final JobSourceRepository sources;
    private final JobPostingRepository postings;
    private final ApplicationRepository applications;
    private final JobBoardClient client;
    private final AdminAuditService audit;

    public JobSourceService(
        JobSourceRepository sources,
        JobPostingRepository postings,
        ApplicationRepository applications,
        JobBoardClient client,
        AdminAuditService audit
    ) {
        this.sources = sources;
        this.postings = postings;
        this.applications = applications;
        this.client = client;
        this.audit = audit;
    }

    /** Adds seed boards not yet in the pool. Returns how many were added. */
    @Transactional
    public int syncSeeds() {
        int added = 0;
        for (String[] row : readSeedFile()) {
            if (sources.findOneByAtsAndBoardTokenIgnoreCase(row[0], row[1]).isEmpty()) {
                sources.save(new JobSource(row[0], row[1], row[2], JobSource.SEED));
                added++;
            }
        }
        return added;
    }

    /** Adds boards users have applied on. Returns how many were added. */
    @Transactional
    public int discoverFromApplications() {
        int added = 0;
        for (Object[] row : applications.findJobBoardLinks()) {
            Optional<JobBoardUrls.Board> b = JobBoardUrls.parse((String) row[0]);
            if (b.isEmpty() || sources.findOneByAtsAndBoardTokenIgnoreCase(b.get().ats(), b.get().token()).isPresent()) continue;
            String company = row[1] == null ? "" : ((String) row[1]).trim();
            if (company.isEmpty()) company = b.get().token();
            sources.save(new JobSource(b.get().ats(), b.get().token(), cut(company, 200), JobSource.DISCOVERED));
            added++;
        }
        return added;
    }

    @Transactional(readOnly = true)
    public List<SourceView> list() {
        Map<Long, Long> counts = new HashMap<>();
        for (Object[] r : postings.countBySource()) counts.put((Long) r[0], (Long) r[1]);
        return sources.findAllByOrderByCompanyNameAsc().stream().map(s -> view(s, counts.getOrDefault(s.getId(), 0L))).toList();
    }

    /**
     * An admin adds a board by hand. The board is read once first — a typo'd token is refused, not
     * stored — and the read's job count is kept.
     */
    @Transactional
    public SourceView add(String ats, String token, String companyName) {
        String a = ats == null ? "" : ats.trim().toLowerCase(Locale.ROOT);
        String t = token == null ? "" : token.trim();
        String name = companyName == null ? "" : companyName.trim();
        if (!JobBoardParsers.ATS.contains(a)) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "ATS must be greenhouse, lever or ashby");
        if (!TOKEN.matcher(t).matches()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "That isn't a board name");
        if (name.isEmpty()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Give the company's name");
        if (sources.findOneByAtsAndBoardTokenIgnoreCase(a, t).isPresent()) throw new ResponseStatusException(HttpStatus.CONFLICT, "That board is already in the pool");
        JobBoardClient.Result r;
        try {
            r = client.fetch(a, t, name, Instant.now());
        } catch (JobBoardClient.BoardException e) {
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "The board didn't answer: " + e.getMessage());
        }
        JobSource s = new JobSource(a, t, cut(name, 200), JobSource.ADMIN);
        s.setLastJobCount(r.total());
        s = sources.save(s);
        audit.record(AdminAuditService.JOB_SOURCE_ADD, AdminAuditService.TARGET_JOB_SOURCE, String.valueOf(s.getId()), null, a + "/" + t);
        return view(s, 0);
    }

    /** Switch a board on or off. Switching on clears its failure count so it gets a fresh start. */
    @Transactional
    public SourceView setEnabled(Long id, boolean enabled) {
        JobSource s = sources.findById(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No such board"));
        s.setEnabled(enabled);
        if (enabled) s.setConsecutiveFailures(0);
        audit.record(AdminAuditService.JOB_SOURCE_TOGGLE, AdminAuditService.TARGET_JOB_SOURCE, String.valueOf(id), null, "enabled=" + enabled);
        return view(s, 0);
    }

    static List<String[]> readSeedFile() {
        List<String[]> rows = new ArrayList<>();
        try (
            BufferedReader in = new BufferedReader(
                new InputStreamReader(new ClassPathResource(SEED_FILE).getInputStream(), StandardCharsets.UTF_8)
            )
        ) {
            String line;
            while ((line = in.readLine()) != null) {
                line = line.trim();
                if (line.isEmpty() || line.startsWith("#")) continue;
                String[] p = line.split(",", 3);
                if (p.length == 3 && JobBoardParsers.ATS.contains(p[0]) && TOKEN.matcher(p[1]).matches() && !p[2].isBlank()) {
                    rows.add(new String[] { p[0], p[1], p[2].trim() });
                } else {
                    LOG.warn("Skipping a malformed job-source seed line: {}", line);
                }
            }
        } catch (IOException e) {
            LOG.error("Couldn't read {}", SEED_FILE, e);
        }
        return rows;
    }

    private static SourceView view(JobSource s, long stored) {
        return new SourceView(
            s.getId(),
            s.getAts(),
            s.getBoardToken(),
            s.getCompanyName(),
            s.getOrigin(),
            s.isEnabled(),
            s.getLastFetchedAt(),
            s.getLastStatus(),
            s.getLastError(),
            s.getLastJobCount(),
            s.getConsecutiveFailures(),
            stored
        );
    }

    private static String cut(String s, int n) {
        return s.length() > n ? s.substring(0, n) : s;
    }
}
