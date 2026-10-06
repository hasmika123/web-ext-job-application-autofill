package com.dossier.api.service.jobs;

import com.dossier.api.domain.JobPosting;
import com.dossier.api.domain.JobSource;
import com.dossier.api.repository.JobPostingRepository;
import com.dossier.api.repository.JobSourceRepository;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.time.Instant;
import java.util.HashSet;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/**
 * The nightly read for daily job matches (Phase 13.6a). Syncs the seed list, adds boards users have
 * applied on, then reads every enabled board one at a time and keeps what's fresh:
 *
 * <ol>
 *   <li><b>Fresh</b> — first published within {@code fresh-hours} (48) of the read.</li>
 *   <li><b>New</b> — not already stored for that board (by the board's own job id).</li>
 *   <li><b>Not a duplicate</b> — no stored posting with the same company + title + location, from
 *       any board (the same job cross-posted, or the same role opened twice in one city).</li>
 * </ol>
 *
 * A board that fails is retried the next night; after {@code disable-after-failures} failures in a
 * row it's switched off. Postings older than {@code keep-days} are deleted at the end. One run at a
 * time: a second request while one is going is refused, not queued.
 */
@Service
public class JobIngestService {

    private static final Logger LOG = LoggerFactory.getLogger(JobIngestService.class);

    /** What one run did — kept in memory for the admin page. */
    public record RunSummary(
        Instant startedAt,
        long durationMs,
        int boardsRead,
        int boardsFailed,
        int boardsSwitchedOff,
        int seedsAdded,
        int discovered,
        int postingsAdded,
        int duplicatesSkipped,
        int postingsDeleted
    ) {}

    private final JobSourceRepository sources;
    private final JobPostingRepository postings;
    private final JobSourceService sourceService;
    private final JobBoardClient client;
    private final JobBoardProperties props;
    private final AtomicBoolean running = new AtomicBoolean(false);
    private final AtomicReference<RunSummary> lastRun = new AtomicReference<>();

    public JobIngestService(
        JobSourceRepository sources,
        JobPostingRepository postings,
        JobSourceService sourceService,
        JobBoardClient client,
        JobBoardProperties props
    ) {
        this.sources = sources;
        this.postings = postings;
        this.sourceService = sourceService;
        this.client = client;
        this.props = props;
    }

    public boolean isRunning() {
        return running.get();
    }

    public RunSummary lastRun() {
        return lastRun.get();
    }

    /** Runs now, or returns empty-handed if a run is already going. */
    public RunSummary run() {
        if (!running.compareAndSet(false, true)) {
            LOG.info("Job board read already running — skipped");
            return null;
        }
        try {
            RunSummary s = doRun(Instant.now());
            lastRun.set(s);
            LOG.info("Job board read: {}", s);
            return s;
        } finally {
            running.set(false);
        }
    }

    RunSummary doRun(Instant now) {
        int seeds = sourceService.syncSeeds();
        int discovered = sourceService.discoverFromApplications();
        Instant since = now.minus(Duration.ofHours(props.getFreshHours()));
        int read = 0, failed = 0, off = 0, added = 0, dupes = 0;

        for (JobSource src : sources.findAllByEnabledTrueOrderByIdAsc()) {
            try {
                JobBoardClient.Result r = client.fetch(src.getAts(), src.getBoardToken(), src.getCompanyName(), since);
                int[] counts = store(src, r.fresh(), since);
                added += counts[0];
                dupes += counts[1];
                src.setLastStatus("OK");
                src.setLastError(null);
                src.setLastJobCount(r.total());
                src.setConsecutiveFailures(0);
                read++;
            } catch (JobBoardClient.BoardException | RuntimeException e) {
                failed++;
                src.setLastStatus("FAILED");
                src.setLastError(e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage());
                src.setConsecutiveFailures(src.getConsecutiveFailures() + 1);
                if (src.getConsecutiveFailures() >= props.getDisableAfterFailures()) {
                    src.setEnabled(false);
                    off++;
                    LOG.info("Switched off job board {}/{} after {} failed reads", src.getAts(), src.getBoardToken(), src.getConsecutiveFailures());
                }
            }
            src.setLastFetchedAt(Instant.now());
            sources.save(src);
        }

        int deleted = postings.deletePublishedBefore(now.minus(Duration.ofDays(props.getKeepDays())));
        return new RunSummary(now, Duration.between(now, Instant.now()).toMillis(), read, failed, off, seeds, discovered, added, dupes, deleted);
    }

    /** Stores one board's fresh postings. Returns {added, duplicates skipped}. */
    private int[] store(JobSource src, List<FetchedPosting> fresh, Instant since) {
        if (fresh.isEmpty()) return new int[] { 0, 0 };
        Set<String> known = new HashSet<>(postings.externalIdsForSource(src.getId()));
        Set<String> batchKeys = new HashSet<>();
        int added = 0, dupes = 0;
        for (FetchedPosting p : fresh) {
            if (p.publishedAt().isBefore(since) || known.contains(p.externalId())) continue;
            String key = dedupKey(p.company(), p.title(), p.location());
            if (!batchKeys.add(key) || postings.existsByDedupKey(key)) {
                dupes++;
                continue;
            }
            JobPosting jp = new JobPosting();
            jp.setSource(src);
            jp.setExternalId(p.externalId());
            jp.setTitle(p.title());
            jp.setCompany(p.company());
            jp.setLocation(p.location());
            jp.setWorkplaceType(p.workplaceType());
            jp.setRemote(p.remote());
            jp.setEmploymentType(p.employmentType());
            jp.setDepartment(p.department());
            jp.setUrl(p.url());
            jp.setApplyUrl(p.applyUrl());
            jp.setDescriptionText(p.description() == null || p.description().isBlank() ? null : p.description());
            jp.setPublishedAt(p.publishedAt());
            jp.setDedupKey(key);
            postings.save(jp);
            added++;
        }
        return new int[] { added, dupes };
    }

    /** SHA-256 of company | title | location, lower-cased with punctuation and extra spaces dropped. */
    static String dedupKey(String company, String title, String location) {
        String raw = norm(company) + "|" + norm(title) + "|" + norm(location);
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(raw.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    private static String norm(String s) {
        return s == null ? "" : s.toLowerCase(Locale.ROOT).replaceAll("[^\\p{L}\\p{N}]+", " ").trim();
    }
}
