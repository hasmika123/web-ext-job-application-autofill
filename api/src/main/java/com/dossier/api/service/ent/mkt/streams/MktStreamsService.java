package com.dossier.api.service.ent.mkt.streams;

import com.dossier.api.domain.ent.mkt.MktJobStream;
import com.dossier.api.domain.ent.mkt.MktStreamAlert;
import com.dossier.api.domain.ent.mkt.MktStreamRule;
import com.dossier.api.domain.ent.mkt.MktStreamSyncLog;
import com.dossier.api.repository.ent.mkt.MktJobStreamRepository;
import com.dossier.api.repository.ent.mkt.MktStreamAlertRepository;
import com.dossier.api.repository.ent.mkt.MktStreamRuleRepository;
import com.dossier.api.repository.ent.mkt.MktStreamSyncLogRepository;
import com.dossier.api.service.ent.mkt.MktScope;
import com.dossier.api.service.ent.mkt.streams.MktStreamsDto.*;
import com.dossier.api.service.org.OrgAuditService;
import com.dossier.api.service.org.OrgException;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import com.dossier.api.service.privacy.SensitiveContent;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The Job Streams board (Marketing workspace, permission {@code matches.run}). Streams are organization-level configuration, not
 * per-consultant data, so the consultant scope of {@link MktScope} is not applied; the gate (404 for non-members / flag off / missing
 * permission) is.
 *
 * <p>This service RECORDS configuration (add, configure, pause, resume a stream; toggle a rule) and reads the sync history. It never
 * calls an external site: the sync log is written by {@link #recordSync}, which a later connector (the ATS public job-board APIs plus
 * one licensed aggregator; never scraping) calls. E1: nothing here submits anything for a consultant.
 *
 * <p>Formulas (all from rows, "now" = request time UTC): Active Job Streams = streams with {@code active}; vs last month = minus those
 * created before now-30d. Sync Health = OK share of the last {@value #HEALTH_WINDOW} syncs; previous = the {@value #HEALTH_WINDOW}
 * before. New Openings Captured = openings of OK syncs in the last 7 days vs the 7 before. Stream Errors = alerts raised in the last 30
 * days vs the 30 before.
 */
@Service
public class MktStreamsService {

    public static final String PERMISSION = "matches.run";
    static final int HEALTH_WINDOW = 42;
    static final int ACTIVITY_MAX = 20;
    static final int ALERT_MAX = 20;
    static final int MAX_KEYWORDS = 40;
    static final int MAX_STREAMS = 100;
    static final List<String> RULE_KEYS = List.of(MktStreamRule.DEFAULT_KEYWORDS, MktStreamRule.CLIENT_MAPPING, MktStreamRule.DUPLICATE_DETECTION, MktStreamRule.AUTO_PUBLISH);
    static final List<String> STATUSES = List.of(MktJobStream.ACTIVE, MktJobStream.PAUSED, MktJobStream.ERROR);
    static final String TARGET = "STREAM";
    static final String AUDIT_CREATE = "MARKETER_STREAM_CREATE";
    static final String AUDIT_UPDATE = "MARKETER_STREAM_UPDATE";
    static final String AUDIT_PAUSE = "MARKETER_STREAM_PAUSE";
    static final String AUDIT_RESUME = "MARKETER_STREAM_RESUME";
    static final String AUDIT_RULE = "MARKETER_STREAM_RULE";

    private final MktScope scope;
    private final MktJobStreamRepository streams;
    private final MktStreamSyncLogRepository logs;
    private final MktStreamAlertRepository alerts;
    private final MktStreamRuleRepository rules;
    private final OrgAuditService audit;
    private final Clock clock;

    @Autowired
    public MktStreamsService(MktScope scope, MktJobStreamRepository streams, MktStreamSyncLogRepository logs, MktStreamAlertRepository alerts, MktStreamRuleRepository rules, OrgAuditService audit) {
        this(scope, streams, logs, alerts, rules, audit, Clock.systemUTC());
    }

    MktStreamsService(MktScope scope, MktJobStreamRepository streams, MktStreamSyncLogRepository logs, MktStreamAlertRepository alerts, MktStreamRuleRepository rules, OrgAuditService audit, Clock clock) {
        this.scope = scope;
        this.streams = streams;
        this.logs = logs;
        this.alerts = alerts;
        this.rules = rules;
        this.audit = audit;
        this.clock = clock;
    }

    // ---- read ------------------------------------------------------------------------------------------------------------------

    /** Filters of the stream table. {@code sort}: created (default) | source | status | lastSync | openings, optional "-" prefix for descending. */
    public record Query(String q, String source, String status, String client, boolean showInactive, int page, int size, String sort, int days) {}

    @Transactional(readOnly = true)
    public View get(OrgMembership me, Query query) {
        scope.resolve(me, PERMISSION);
        Long orgId = me.orgId();
        Instant now = clock.instant();
        List<MktJobStream> all = streams.findByOrgIdOrderByCreatedAtAscIdAsc(orgId);
        Map<Long, String> labels = new LinkedHashMap<>();
        for (MktJobStream s : all) labels.put(s.getId(), s.getSourceLabel());

        LocalDate today = now.atZone(ZoneOffset.UTC).toLocalDate();
        Instant logSince = today.minusDays(14).atStartOfDay().toInstant(ZoneOffset.UTC);
        List<MktStreamSyncLog> recent = logs.findByOrgIdAndSyncedAtGreaterThanEqualOrderBySyncedAtAsc(orgId, logSince);
        List<MktStreamSyncLog> window = logs.findByOrgIdOrderBySyncedAtDescIdDesc(orgId, PageRequest.of(0, HEALTH_WINDOW * 2));
        List<MktStreamAlert> raised = alerts.findByOrgIdAndRaisedAtGreaterThanEqualOrderByRaisedAtAsc(orgId, now.minus(60, ChronoUnit.DAYS));

        List<Kpi> kpis = List.of(activeKpi(all, now), healthKpi(window, recent, now), openingsKpi(recent, now), errorsKpi(raised, now));
        StreamPage page = page(all, query);
        Filters filters = new Filters(
            all.stream().map(MktJobStream::getSourceLabel).distinct().sorted(String.CASE_INSENSITIVE_ORDER).toList(),
            STATUSES,
            all.stream().map(MktJobStream::getClientScope).filter(c -> c != null && !c.isBlank()).distinct().sorted(String.CASE_INSENSITIVE_ORDER).toList()
        );
        List<SyncRow> activity = window.stream().limit(ACTIVITY_MAX).map(l -> new SyncRow(l.getId(), l.getStreamId(), labels.getOrDefault(l.getStreamId(), ""), l.getSyncedAt(), l.getOpenings(), l.getStatus(), l.getMessage())).toList();
        List<AlertRow> open = alerts.findByOrgIdAndResolvedAtIsNullOrderByRaisedAtDesc(orgId, PageRequest.of(0, ALERT_MAX)).stream()
            .map(a -> new AlertRow(a.getId(), a.getSeverity(), a.getTitle(), a.getDetail(), a.getRaisedAt())).toList();
        return new View(kpis, page, filters, activity, chart(all, recent, today, query.days()), open, ruleRows(orgId));
    }

    private Kpi activeKpi(List<MktJobStream> all, Instant now) {
        long cur = all.stream().filter(MktJobStream::isActive).count();
        long prev = all.stream().filter(s -> s.isActive() && s.getCreatedAt().isBefore(now.minus(30, ChronoUnit.DAYS))).count();
        List<Double> spark = new ArrayList<>();
        for (int i = 7; i >= 0; i--) {
            Instant at = now.minus(i * 7L, ChronoUnit.DAYS);
            spark.add((double) all.stream().filter(s -> s.isActive() && !s.getCreatedAt().isAfter(at)).count());
        }
        return new Kpi("activeStreams", (double) cur, pct(cur, prev), spark);
    }

    private Kpi healthKpi(List<MktStreamSyncLog> window, List<MktStreamSyncLog> recent, Instant now) {
        List<MktStreamSyncLog> cur = window.subList(0, Math.min(HEALTH_WINDOW, window.size()));
        List<MktStreamSyncLog> prev = window.size() > HEALTH_WINDOW ? window.subList(HEALTH_WINDOW, window.size()) : List.of();
        Double value = okShare(cur);
        Double before = okShare(prev);
        Double delta = value == null || before == null || before == 0 ? null : round((value - before) / before * 100);
        List<Double> spark = new ArrayList<>();
        LocalDate today = now.atZone(ZoneOffset.UTC).toLocalDate();
        for (int i = 7; i >= 0; i--) {
            LocalDate d = today.minusDays(i);
            Double share = okShare(recent.stream().filter(l -> dayOf(l).equals(d)).toList());
            spark.add(share == null ? 0.0 : share);
        }
        return new Kpi("syncHealth", value, delta, spark);
    }

    private Kpi openingsKpi(List<MktStreamSyncLog> recent, Instant now) {
        Instant w1 = now.minus(7, ChronoUnit.DAYS);
        Instant w2 = now.minus(14, ChronoUnit.DAYS);
        long cur = sumOk(recent, w1, now.plusSeconds(1));
        long prev = sumOk(recent, w2, w1);
        List<Double> spark = new ArrayList<>();
        LocalDate today = now.atZone(ZoneOffset.UTC).toLocalDate();
        for (int i = 7; i >= 0; i--) {
            LocalDate d = today.minusDays(i);
            spark.add((double) recent.stream().filter(l -> MktStreamSyncLog.OK.equals(l.getStatus()) && dayOf(l).equals(d)).mapToLong(MktStreamSyncLog::getOpenings).sum());
        }
        return new Kpi("newOpenings", (double) cur, pct(cur, prev), spark);
    }

    private Kpi errorsKpi(List<MktStreamAlert> raised, Instant now) {
        Instant m1 = now.minus(30, ChronoUnit.DAYS);
        long cur = raised.stream().filter(a -> !a.getRaisedAt().isBefore(m1)).count();
        long prev = raised.size() - cur;
        List<Double> spark = new ArrayList<>();
        for (int i = 7; i >= 0; i--) {
            Instant from = now.minus((i + 1) * 4L, ChronoUnit.DAYS);
            Instant to = now.minus(i * 4L, ChronoUnit.DAYS);
            spark.add((double) raised.stream().filter(a -> !a.getRaisedAt().isBefore(from) && a.getRaisedAt().isBefore(to)).count());
        }
        return new Kpi("streamErrors", (double) cur, pct(cur, prev), spark);
    }

    private StreamPage page(List<MktJobStream> all, Query q) {
        String needle = q.q() == null ? "" : q.q().strip().toLowerCase(Locale.ROOT);
        boolean showInactive = q.showInactive() || MktJobStream.PAUSED.equalsIgnoreCase(q.status());
        List<MktJobStream> rows = new ArrayList<>(all.stream()
            .filter(s -> showInactive || s.isActive())
            .filter(s -> blank(q.source()) || s.getSourceLabel().equalsIgnoreCase(q.source().strip()))
            .filter(s -> blank(q.status()) || s.getStatus().equalsIgnoreCase(q.status().strip()))
            .filter(s -> blank(q.client()) || s.getClientScope() == null || s.getClientScope().equalsIgnoreCase(q.client().strip()))
            .filter(s -> needle.isEmpty() || haystack(s).contains(needle))
            .toList());
        rows.sort(comparator(q.sort()));
        int size = Math.max(1, Math.min(q.size() <= 0 ? 25 : q.size(), 100));
        int page = Math.max(0, q.page());
        int from = Math.min(rows.size(), page * size);
        List<StreamRow> items = rows.subList(from, Math.min(rows.size(), from + size)).stream().map(MktStreamsService::row).toList();
        return new StreamPage(items, rows.size(), page, size);
    }

    private static String haystack(MktJobStream s) {
        return String.join(" ", nz(s.getSourceLabel()), nz(s.getSubtitle()), nz(s.getKeywords()), nz(s.getClientScope())).toLowerCase(Locale.ROOT);
    }

    private static Comparator<MktJobStream> comparator(String sort) {
        String key = sort == null ? "" : sort.strip();
        boolean desc = key.startsWith("-");
        if (desc) key = key.substring(1);
        Comparator<MktJobStream> c = switch (key) {
            case "source" -> Comparator.comparing(s -> s.getSourceLabel().toLowerCase(Locale.ROOT));
            case "status" -> Comparator.comparing(MktJobStream::getStatus);
            case "lastSync" -> Comparator.comparing(MktJobStream::getLastSyncAt, Comparator.nullsFirst(Comparator.naturalOrder()));
            case "openings" -> Comparator.comparing(MktJobStream::getNewOpenings);
            default -> Comparator.comparing(MktJobStream::getCreatedAt).thenComparing(MktJobStream::getId, Comparator.nullsFirst(Comparator.naturalOrder()));
        };
        return desc ? c.reversed() : c;
    }

    private Chart chart(List<MktJobStream> all, List<MktStreamSyncLog> recent, LocalDate today, int daysParam) {
        int n = daysParam == 14 ? 14 : 7;
        List<LocalDate> days = new ArrayList<>();
        for (int i = n - 1; i >= 0; i--) days.add(today.minusDays(i));
        List<ChartSeries> series = new ArrayList<>();
        for (MktJobStream s : all) {
            List<Integer> values = new ArrayList<>();
            boolean any = false;
            for (LocalDate d : days) {
                int v = (int) recent.stream().filter(l -> l.getStreamId().equals(s.getId()) && MktStreamSyncLog.OK.equals(l.getStatus()) && dayOf(l).equals(d)).mapToLong(MktStreamSyncLog::getOpenings).sum();
                values.add(v);
                any |= v > 0;
            }
            if (any) series.add(new ChartSeries("s" + s.getId(), s.getSourceLabel(), values));
        }
        return new Chart(days.stream().map(LocalDate::toString).toList(), series);
    }

    private List<RuleRow> ruleRows(Long orgId) {
        Map<String, MktStreamRule> byKey = new LinkedHashMap<>();
        for (MktStreamRule r : rules.findByOrgId(orgId)) byKey.put(r.getRuleKey(), r);
        List<RuleRow> out = new ArrayList<>();
        for (String key : RULE_KEYS) {
            MktStreamRule r = byKey.get(key);
            out.add(r == null ? new RuleRow(key, false, null) : new RuleRow(key, r.isEnabled(), r.getValue()));
        }
        return out;
    }

    // ---- writes (record configuration only) ------------------------------------------------------------------------------------

    @Transactional
    public StreamRow create(OrgMembership me, CreateRequest req) {
        scope.resolve(me, PERMISSION);
        Long orgId = me.orgId();
        String label = cleanLabel(req.sourceLabel());
        if (label == null) throw OrgException.invalid("sourceLabel", "is required");
        if (streams.countByOrgId(orgId) >= MAX_STREAMS) throw OrgException.limitReached("streams", MAX_STREAMS);
        if (streams.existsByOrgIdAndSourceLabelIgnoreCase(orgId, label)) throw OrgException.invalid("sourceLabel", "a stream with this name already exists");
        MktJobStream s = new MktJobStream();
        s.setOrgId(orgId);
        s.setSourceLabel(label);
        s.setSubtitle(cleanText("subtitle", req.subtitle(), 160));
        s.setSyncEveryMinutes(req.syncEveryMinutes() == null ? 60 : req.syncEveryMinutes());
        s.setKeywords(cleanKeywords(req.keywords()));
        s.setClientScope(cleanText("clientScope", req.clientScope(), 160));
        s.setStatus(MktJobStream.ACTIVE);
        s.setActive(true);
        Instant now = clock.instant();
        s.setCreatedAt(now);
        s.setUpdatedAt(now);
        MktJobStream saved = streams.saveAndFlush(s);
        audit.record(me, AUDIT_CREATE, TARGET, null, String.valueOf(saved.getId()), label);
        return row(saved);
    }

    @Transactional
    public StreamRow update(OrgMembership me, Long id, UpdateRequest req) {
        scope.resolve(me, PERMISSION);
        MktJobStream s = streams.findByOrgIdAndId(me.orgId(), id).orElseThrow(OrgNotFoundException::new);
        if (req.sourceLabel() != null) {
            String label = cleanLabel(req.sourceLabel());
            if (label == null) throw OrgException.invalid("sourceLabel", "can't be empty");
            if (!label.equalsIgnoreCase(s.getSourceLabel()) && streams.existsByOrgIdAndSourceLabelIgnoreCase(me.orgId(), label)) throw OrgException.invalid("sourceLabel", "a stream with this name already exists");
            s.setSourceLabel(label);
        }
        if (req.subtitle() != null) s.setSubtitle(cleanText("subtitle", req.subtitle(), 160));
        if (req.syncEveryMinutes() != null) s.setSyncEveryMinutes(req.syncEveryMinutes());
        if (req.keywords() != null) s.setKeywords(cleanKeywords(req.keywords()));
        if (req.clientScope() != null) s.setClientScope(cleanText("clientScope", req.clientScope(), 160));
        s.setUpdatedAt(clock.instant());
        MktJobStream saved = streams.saveAndFlush(s);
        audit.record(me, AUDIT_UPDATE, TARGET, null, String.valueOf(id), saved.getSourceLabel());
        return row(saved);
    }

    @Transactional
    public StreamRow pause(OrgMembership me, Long id) {
        scope.resolve(me, PERMISSION);
        MktJobStream s = streams.findByOrgIdAndId(me.orgId(), id).orElseThrow(OrgNotFoundException::new);
        s.setStatus(MktJobStream.PAUSED);
        s.setActive(false);
        s.setUpdatedAt(clock.instant());
        MktJobStream saved = streams.saveAndFlush(s);
        audit.record(me, AUDIT_PAUSE, TARGET, null, String.valueOf(id), saved.getSourceLabel());
        return row(saved);
    }

    @Transactional
    public StreamRow resume(OrgMembership me, Long id) {
        scope.resolve(me, PERMISSION);
        MktJobStream s = streams.findByOrgIdAndId(me.orgId(), id).orElseThrow(OrgNotFoundException::new);
        s.setStatus(MktJobStream.ACTIVE);
        s.setActive(true);
        s.setUpdatedAt(clock.instant());
        MktJobStream saved = streams.saveAndFlush(s);
        audit.record(me, AUDIT_RESUME, TARGET, null, String.valueOf(id), saved.getSourceLabel());
        return row(saved);
    }

    @Transactional
    public RuleRow updateRule(OrgMembership me, String key, RuleRequest req) {
        scope.resolve(me, PERMISSION);
        String ruleKey = key == null ? "" : key.strip().toUpperCase(Locale.ROOT);
        if (!RULE_KEYS.contains(ruleKey)) throw new OrgNotFoundException();
        MktStreamRule r = rules.findByOrgIdAndRuleKey(me.orgId(), ruleKey).orElseGet(() -> {
            MktStreamRule n = new MktStreamRule();
            n.setOrgId(me.orgId());
            n.setRuleKey(ruleKey);
            n.setEnabled(false);
            return n;
        });
        if (req.enabled() != null) r.setEnabled(req.enabled());
        if (req.value() != null) {
            String v = req.value().strip();
            if (v.length() > 2000) throw OrgException.invalid("value", "at most 2000 characters");
            SensitiveContent.check("value", "value", v);
            r.setValue(v.isEmpty() ? null : v);
        }
        r.setUpdatedAt(clock.instant());
        MktStreamRule saved = rules.saveAndFlush(r);
        audit.record(me, AUDIT_RULE, TARGET, null, ruleKey, saved.isEnabled() ? "enabled" : "disabled");
        return new RuleRow(saved.getRuleKey(), saved.isEnabled(), saved.getValue());
    }

    // ---- the connector seam ----------------------------------------------------------------------------------------------------

    /**
     * Record the result of one sync run. THE method a future connector calls (ATS public job-board API / licensed aggregator); nothing in
     * this feature calls an external site. Writes the log row, updates the stream's last-sync fields (openings and the change against the
     * previous OK sync), and raises an ERROR alert when the run failed. A paused stream keeps its paused status. No-op (false) for a
     * stream that is not this organization's.
     */
    @Transactional
    public boolean recordSync(Long orgId, Long streamId, int openings, boolean ok, String message, Instant at) {
        MktJobStream s = streams.findByOrgIdAndId(orgId, streamId).orElse(null);
        if (s == null) return false;
        Instant when = at == null ? clock.instant() : at;
        MktStreamSyncLog log = new MktStreamSyncLog();
        log.setOrgId(orgId);
        log.setStreamId(streamId);
        log.setSyncedAt(when);
        log.setOpenings(Math.max(0, openings));
        log.setStatus(ok ? MktStreamSyncLog.OK : MktStreamSyncLog.FAILED);
        log.setMessage(message == null ? null : message.substring(0, Math.min(300, message.length())));
        if (ok) {
            Integer previous = logs.findByOrgIdAndStreamIdOrderBySyncedAtDescIdDesc(orgId, streamId, PageRequest.of(0, 10)).stream()
                .filter(l -> MktStreamSyncLog.OK.equals(l.getStatus())).map(MktStreamSyncLog::getOpenings).findFirst().orElse(null);
            s.setNewOpenings(Math.max(0, openings));
            s.setOpeningsDeltaPct(previous == null || previous == 0 ? null : BigDecimal.valueOf((openings - previous) * 100.0 / previous).setScale(2, RoundingMode.HALF_UP));
            if (MktJobStream.ERROR.equals(s.getStatus())) s.setStatus(MktJobStream.ACTIVE);
        } else if (s.isActive()) {
            s.setStatus(MktJobStream.ERROR);
        }
        s.setLastSyncAt(when);
        s.setUpdatedAt(clock.instant());
        logs.save(log);
        streams.save(s);
        if (!ok) {
            MktStreamAlert a = new MktStreamAlert();
            a.setOrgId(orgId);
            a.setStreamId(streamId);
            a.setSeverity(MktStreamAlert.ERROR);
            a.setTitle(s.getSourceLabel() + " sync failed");
            a.setDetail(log.getMessage());
            a.setRaisedAt(when);
            alerts.save(a);
        }
        return true;
    }

    // ---- helpers ---------------------------------------------------------------------------------------------------------------

    static StreamRow row(MktJobStream s) {
        return new StreamRow(
            s.getId(), s.getSourceLabel(), s.getSubtitle(), s.getStatus(), s.isActive(), s.getSyncEveryMinutes(), splitKeywords(s.getKeywords()), s.getClientScope(),
            s.getLastSyncAt(), s.getNewOpenings(), s.getOpeningsDeltaPct() == null ? null : s.getOpeningsDeltaPct().doubleValue()
        );
    }

    static List<String> splitKeywords(String raw) {
        if (raw == null || raw.isBlank()) return List.of();
        List<String> out = new ArrayList<>();
        for (String k : raw.split(",")) if (!k.isBlank()) out.add(k.strip());
        return out;
    }

    /** Trim, drop empties and case-insensitive duplicates, cap the count and the length of a keyword; null when nothing is left. */
    static String cleanKeywords(String raw) {
        if (raw == null || raw.isBlank()) return null;
        Set<String> seen = new LinkedHashSet<>();
        Set<String> lower = new TreeSet<>();
        for (String k : raw.split(",")) {
            String t = k.strip().replaceAll("\\s+", " ");
            if (t.isEmpty() || !lower.add(t.toLowerCase(Locale.ROOT))) continue;
            if (t.length() > 60) throw OrgException.invalid("keywords", "each keyword is at most 60 characters");
            if (t.indexOf('<') >= 0 || t.indexOf('>') >= 0) throw OrgException.invalid("keywords", "contains characters that are not allowed");
            seen.add(t);
        }
        if (seen.size() > MAX_KEYWORDS) throw OrgException.invalid("keywords", "at most " + MAX_KEYWORDS + " keywords");
        if (seen.isEmpty()) return null;
        String joined = String.join(", ", seen);
        SensitiveContent.check("keywords", "keywords", joined);
        return joined;
    }

    private static String cleanLabel(String raw) {
        String t = cleanText("sourceLabel", raw, 120);
        return t;
    }

    /** Trimmed text, null when empty; no markup or control characters; run through the sensitive-content scanner. */
    private static String cleanText(String field, String raw, int max) {
        if (raw == null) return null;
        String t = raw.strip().replaceAll("\\s+", " ");
        if (t.isEmpty()) return null;
        if (t.length() > max) throw OrgException.invalid(field, "at most " + max + " characters");
        if (t.chars().anyMatch(Character::isISOControl) || t.indexOf('<') >= 0 || t.indexOf('>') >= 0) throw OrgException.invalid(field, "contains characters that are not allowed");
        SensitiveContent.check(field, field, t);
        return t;
    }

    private static boolean blank(String s) {
        return s == null || s.isBlank();
    }

    private static String nz(String s) {
        return s == null ? "" : s;
    }

    private static LocalDate dayOf(MktStreamSyncLog l) {
        return l.getSyncedAt().atZone(ZoneOffset.UTC).toLocalDate();
    }

    private static Double okShare(List<MktStreamSyncLog> rows) {
        if (rows.isEmpty()) return null;
        long ok = rows.stream().filter(l -> MktStreamSyncLog.OK.equals(l.getStatus())).count();
        return round(ok * 100.0 / rows.size());
    }

    private static long sumOk(List<MktStreamSyncLog> rows, Instant from, Instant to) {
        return rows.stream().filter(l -> MktStreamSyncLog.OK.equals(l.getStatus()) && !l.getSyncedAt().isBefore(from) && l.getSyncedAt().isBefore(to)).mapToLong(MktStreamSyncLog::getOpenings).sum();
    }

    /** Percent change, one decimal; null when there is nothing to compare with (previous 0). */
    static Double pct(long current, long previous) {
        return previous <= 0 ? null : round((current - previous) * 100.0 / previous);
    }

    private static double round(double v) {
        return Math.round(v * 10.0) / 10.0;
    }
}
