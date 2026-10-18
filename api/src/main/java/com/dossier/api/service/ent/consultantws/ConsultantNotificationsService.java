package com.dossier.api.service.ent.consultantws;

import com.dossier.api.domain.ent.consultantws.CwsNotification;
import com.dossier.api.domain.ent.consultantws.CwsNotificationPref;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.repository.ent.consultantws.CwsNotificationPrefRepository;
import com.dossier.api.repository.ent.consultantws.CwsNotificationRepository;
import com.dossier.api.service.TrackerException;
import com.dossier.api.service.ent.consultantws.ConsultantNotificationsDTO.Categories;
import com.dossier.api.service.ent.consultantws.ConsultantNotificationsDTO.CategoryTile;
import com.dossier.api.service.ent.consultantws.ConsultantNotificationsDTO.Changed;
import com.dossier.api.service.ent.consultantws.ConsultantNotificationsDTO.MuteResult;
import com.dossier.api.service.ent.consultantws.ConsultantNotificationsDTO.NotificationPage;
import com.dossier.api.service.ent.consultantws.ConsultantNotificationsDTO.Pref;
import com.dossier.api.service.ent.consultantws.ConsultantNotificationsDTO.PrefItem;
import com.dossier.api.service.ent.consultantws.ConsultantNotificationsDTO.PrefsResult;
import com.dossier.api.service.ent.consultantws.ConsultantNotificationsDTO.Response;
import com.dossier.api.service.ent.consultantws.ConsultantNotificationsDTO.Row;
import com.dossier.api.service.ent.consultantws.ConsultantNotificationsDTO.SnoozeResult;
import com.dossier.api.service.ent.consultantws.ConsultantNotificationsDTO.Tile;
import com.dossier.api.service.ent.consultantws.ConsultantNotificationsDTO.Tiles;
import com.dossier.api.service.org.OrgException;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.function.Predicate;
import java.util.stream.Collectors;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The Consultant workspace Notifications page (docs/enterprise-v2/page-consultant-notifications.md). The gate is
 * {@link ConsultantHomeService#requireSelf} (Consultant role, own consultant_profile, else the generic 404). Every read and write is organization id
 * first plus the caller's own consultant id, so another consultant's notification (or another tenant's, or a deleted one) is the same generic 404.
 * Loading the page first runs {@link ConsultantNotificationGenerator#generateFor}. Filtering, tab counts, tiles and paging are computed here from the
 * consultant's own rows (a consultant has tens of them, never thousands). Nothing is ever emailed, texted or pushed: the channel switches are
 * stored preferences, and SMS cannot be switched on.
 */
@Service
public class ConsultantNotificationsService {

    public static final String CODE_RESOLVED = "NOTIFICATION_RESOLVED";
    /** Categories that "Mute Notifications" leaves on: they are time-sensitive. */
    public static final Set<String> CRITICAL = Set.of(CwsNotification.INTERVIEW, CwsNotification.APPROVAL, CwsNotification.OFFER);
    static final Set<String> STATUSES = new LinkedHashSet<>(List.of("ACTIVE", "ALL", "UNREAD", "READ", "RESOLVED", "SNOOZED"));
    static final Set<String> PERIODS = new LinkedHashSet<>(List.of("TODAY", "WEEK", "MONTH"));
    static final int MAX_QUERY = 80;
    static final int DEFAULT_PAGE_SIZE = 10;
    static final int MAX_PAGE_SIZE = 50;
    static final int MAX_IDS = 50;
    static final int MAX_SNOOZE_DAYS = 14;
    static final int POINTS = 6;

    private final ConsultantHomeService gate;
    private final ConsultantNotificationGenerator generator;
    private final CwsNotificationRepository notifications;
    private final CwsNotificationPrefRepository prefs;
    private final Clock clock;

    @Autowired
    public ConsultantNotificationsService(ConsultantHomeService gate, ConsultantNotificationGenerator generator, CwsNotificationRepository notifications, CwsNotificationPrefRepository prefs) {
        this(gate, generator, notifications, prefs, Clock.systemUTC());
    }

    ConsultantNotificationsService(ConsultantHomeService gate, ConsultantNotificationGenerator generator, CwsNotificationRepository notifications, CwsNotificationPrefRepository prefs, Clock clock) {
        this.gate = gate;
        this.generator = generator;
        this.notifications = notifications;
        this.prefs = prefs;
        this.clock = clock;
    }

    // ---- the page -------------------------------------------------------------------------------------------------

    /**
     * Not transactional itself: the generator writes in its own transaction first (a concurrent request that creates the same rows only costs this
     * call its generation, never an error), then everything is read from one query.
     */
    public Response page(OrgMembership me, String status, String category, String priority, String q, String period, Integer page, Integer size) {
        ConsultantProfile c = gate.requireSelf(me);
        String st = token(status, "ACTIVE", STATUSES, "status", "is not a notification status");
        String cat = category == null || category.isBlank() ? "" : token(category, "", new LinkedHashSet<>(CwsNotification.CATEGORIES), "category", "is not a notification category");
        String pr = priority == null || priority.isBlank() ? "" : token(priority, "", new LinkedHashSet<>(CwsNotification.PRIORITIES), "priority", "must be HIGH, MEDIUM or LOW");
        String text = q == null ? "" : q.strip().toLowerCase(Locale.ROOT);
        if (text.length() > MAX_QUERY) throw TrackerException.invalid("q", "must be " + MAX_QUERY + " characters or fewer");
        String per = token(period, "WEEK", PERIODS, "period", "must be TODAY, WEEK or MONTH");
        int p = page == null ? 0 : page;
        int s = size == null ? DEFAULT_PAGE_SIZE : size;
        if (p < 0) throw TrackerException.invalid("page", "must be 0 or more");
        if (s < 1 || s > MAX_PAGE_SIZE) throw TrackerException.invalid("size", "must be between 1 and " + MAX_PAGE_SIZE);

        try {
            generator.generateFor(c);
        } catch (DataIntegrityViolationException raced) {
            // another request created the same rows a moment ago: they are there to read
        }
        Instant now = Instant.now(clock);
        List<CwsNotification> all = notifications.findByOrgIdAndConsultantId(c.getOrgId(), c.getId());
        List<CwsNotification> live = all.stream().filter(n -> n.getDeletedAt() == null).toList();
        List<CwsNotificationPref> prefRows = prefs.findByOrgIdAndConsultantId(c.getOrgId(), c.getId());

        Predicate<CwsNotification> base = n -> statusMatches(n, st, now) && (pr.isEmpty() || pr.equals(n.getPriority())) && textMatches(n, text);
        Map<String, Long> tabs = new LinkedHashMap<>();
        tabs.put("ALL", live.stream().filter(base).count());
        for (String k : CwsNotification.CATEGORIES) tabs.put(k, live.stream().filter(base).filter(n -> k.equals(n.getCategory())).count());

        List<Row> matching = live.stream()
            .filter(base)
            .filter(n -> cat.isEmpty() || cat.equals(n.getCategory()))
            .sorted(Comparator.comparing(CwsNotification::getCreatedAt).reversed().thenComparing(CwsNotification::getId, Comparator.reverseOrder()))
            .map(n -> row(n, now))
            .toList();
        int from = Math.min(matching.size(), p * s);
        List<Row> slice = matching.subList(from, Math.min(matching.size(), from + s));
        NotificationPage list = new NotificationPage(slice, p, s, matching.size(), (int) Math.ceil(matching.size() / (double) s));
        List<Pref> prefList = prefList(prefRows);
        return new Response(c.getOrgId(), now, c.getDisplayName(), tiles(all, now), tabs, list, categories(live, per, now), prefList, muted(prefList));
    }

    static Row row(CwsNotification n, Instant now) {
        return new Row(n.getId(), n.getCategory(), n.getTitle(), n.getBody(), n.getPriority(), n.getActionLabel(), n.getActionHref(), n.getRelatedType(), n.getRelatedId(), effectiveStatus(n, now),
            n.getCreatedAt(), n.getReadAt(), n.getResolvedAt(), n.getSnoozedUntil());
    }

    /** RESOLVED beats SNOOZED beats READ beats UNREAD. */
    static String effectiveStatus(CwsNotification n, Instant now) {
        if (n.getResolvedAt() != null) return "RESOLVED";
        if (isSnoozed(n, now)) return "SNOOZED";
        return n.getReadAt() != null ? "READ" : "UNREAD";
    }

    private static boolean isSnoozed(CwsNotification n, Instant now) {
        return n.getSnoozedUntil() != null && n.getSnoozedUntil().isAfter(now);
    }

    /** ACTIVE is the inbox (not resolved, not snoozed); ALL is everything that is not deleted. */
    static boolean statusMatches(CwsNotification n, String status, Instant now) {
        String eff = effectiveStatus(n, now);
        return switch (status) {
            case "ALL" -> true;
            case "ACTIVE" -> "UNREAD".equals(eff) || "READ".equals(eff);
            default -> status.equals(eff);
        };
    }

    private static boolean textMatches(CwsNotification n, String text) {
        if (text.isEmpty()) return true;
        return (n.getTitle() != null && n.getTitle().toLowerCase(Locale.ROOT).contains(text)) || (n.getBody() != null && n.getBody().toLowerCase(Locale.ROOT).contains(text));
    }

    private static String token(String v, String dflt, Set<String> allowed, String field, String message) {
        String t = v == null || v.isBlank() ? dflt : v.strip().toUpperCase(Locale.ROOT);
        if (!t.isEmpty() && !allowed.contains(t)) throw TrackerException.invalid(field, message);
        return t;
    }

    // ---- tiles ----------------------------------------------------------------------------------------------------

    /**
     * Unread, High Priority and Upcoming Reminders are rebuilt "as of" a past moment from the rows' own timestamps (created, read, resolved,
     * deleted), so "since last week" is a real comparison; a snooze in progress hides a row now but is not replayed into the past. Today compares with
     * yesterday, Resolved This Week with the seven days before. Percent changes are null when the earlier value is zero.
     */
    static Tiles tiles(List<CwsNotification> all, Instant now) {
        List<CwsNotification> live = all.stream().filter(n -> n.getDeletedAt() == null).toList();
        Instant weekAgo = now.minus(Duration.ofDays(7));
        Tile unread = asOfTile(all, now, n -> true, true);
        Tile high = asOfTile(all, now, n -> CwsNotification.HIGH.equals(n.getPriority()), false);
        Tile reminders = asOfTile(all, now, n -> CwsNotification.REMINDER.equals(n.getCategory()), false);
        Instant startToday = now.atZone(ZoneOffset.UTC).toLocalDate().atStartOfDay().toInstant(ZoneOffset.UTC);
        long today = live.stream().filter(n -> !n.getCreatedAt().isBefore(startToday) && !n.getCreatedAt().isAfter(now)).count();
        long yesterday = live.stream().filter(n -> !n.getCreatedAt().isBefore(startToday.minus(Duration.ofDays(1))) && n.getCreatedAt().isBefore(startToday)).count();
        List<Long> dayPoints = new ArrayList<>();
        for (int d = POINTS - 1; d >= 0; d--) {
            Instant a = startToday.minus(Duration.ofDays(d));
            Instant b = a.plus(Duration.ofDays(1));
            dayPoints.add(live.stream().filter(n -> !n.getCreatedAt().isBefore(a) && n.getCreatedAt().isBefore(b)).count());
        }
        Tile todayTile = tile(today, yesterday, dayPoints, "day");
        long resolvedNow = resolvedBetween(live, weekAgo, now);
        long resolvedBefore = resolvedBetween(live, weekAgo.minus(Duration.ofDays(7)), weekAgo);
        List<Long> weekPoints = new ArrayList<>();
        for (int w = POINTS - 1; w >= 0; w--) weekPoints.add(resolvedBetween(live, now.minus(Duration.ofDays(7L * (w + 1))), now.minus(Duration.ofDays(7L * w))));
        return new Tiles(unread, high, todayTile, reminders, tile(resolvedNow, resolvedBefore, weekPoints, "week"));
    }

    /** Created by T, not deleted by T, not resolved by T (and, for the unread count, not read by T). */
    private static boolean openAt(CwsNotification n, Instant t, boolean unreadOnly) {
        return !n.getCreatedAt().isAfter(t)
            && (n.getDeletedAt() == null || n.getDeletedAt().isAfter(t))
            && (n.getResolvedAt() == null || n.getResolvedAt().isAfter(t))
            && (!unreadOnly || n.getReadAt() == null || n.getReadAt().isAfter(t));
    }

    /** The count as of now (an active snooze hides a row now) and as of a week ago, plus six weekly points ending now. */
    private static Tile asOfTile(List<CwsNotification> all, Instant now, Predicate<CwsNotification> kind, boolean unreadOnly) {
        long value = all.stream().filter(kind).filter(n -> openAt(n, now, unreadOnly) && !isSnoozed(n, now)).count();
        List<Long> points = new ArrayList<>();
        for (int w = POINTS - 1; w >= 1; w--) {
            Instant at = now.minus(Duration.ofDays(7L * w));
            points.add(all.stream().filter(kind).filter(n -> openAt(n, at, unreadOnly)).count());
        }
        long previous = points.get(points.size() - 1);
        points.add(value);
        return tile(value, previous, points, "week");
    }

    private static long resolvedBetween(List<CwsNotification> live, Instant from, Instant to) {
        return live.stream().filter(n -> n.getResolvedAt() != null && n.getResolvedAt().isAfter(from) && !n.getResolvedAt().isAfter(to)).count();
    }

    private static Tile tile(long value, long previous, List<Long> points, String vs) {
        Double pct = previous == 0 ? null : Math.round(((value - previous) * 1000.0) / previous) / 10.0;
        return new Tile(value, previous, value - previous, pct, points, vs);
    }

    // ---- by category ----------------------------------------------------------------------------------------------

    static Categories categories(List<CwsNotification> live, String period, Instant now) {
        Instant from;
        Instant prevFrom;
        Instant prevTo;
        String vs;
        switch (period) {
            case "TODAY" -> {
                from = now.atZone(ZoneOffset.UTC).toLocalDate().atStartOfDay().toInstant(ZoneOffset.UTC);
                prevFrom = from.minus(Duration.ofDays(1));
                prevTo = from;
                vs = "yesterday";
            }
            case "MONTH" -> {
                from = now.minus(Duration.ofDays(30));
                prevFrom = now.minus(Duration.ofDays(60));
                prevTo = from;
                vs = "last month";
            }
            default -> {
                from = now.minus(Duration.ofDays(7));
                prevFrom = now.minus(Duration.ofDays(14));
                prevTo = from;
                vs = "last week";
            }
        }
        List<CategoryTile> items = new ArrayList<>();
        for (String k : CwsNotification.CATEGORIES) {
            long count = live.stream().filter(n -> k.equals(n.getCategory()) && !n.getCreatedAt().isBefore(from) && !n.getCreatedAt().isAfter(now)).count();
            long prev = live.stream().filter(n -> k.equals(n.getCategory()) && !n.getCreatedAt().isBefore(prevFrom) && n.getCreatedAt().isBefore(prevTo)).count();
            items.add(new CategoryTile(k, count, prev, prev == 0 ? null : Math.round(((count - prev) * 1000.0) / prev) / 10.0));
        }
        return new Categories(period, vs, from, now, items);
    }

    // ---- writes (own, live rows only; anything else is the generic 404) --------------------------------------------

    @Transactional
    public Changed markRead(OrgMembership me, List<Long> ids, Boolean read) {
        ConsultantProfile c = gate.requireSelf(me);
        if (read == null) throw TrackerException.invalid("read", "is required");
        Instant now = Instant.now(clock);
        int changed = 0;
        for (CwsNotification n : own(c, ids)) {
            if (read && n.getReadAt() == null) {
                n.setReadAt(now);
                changed++;
            } else if (!read && n.getReadAt() != null) {
                n.setReadAt(null);
                changed++;
            }
        }
        return new Changed(changed);
    }

    /** Resolves (and so also reads) the notifications; resolving a resolved one changes nothing. */
    @Transactional
    public Changed resolve(OrgMembership me, List<Long> ids) {
        ConsultantProfile c = gate.requireSelf(me);
        Instant now = Instant.now(clock);
        int changed = 0;
        for (CwsNotification n : own(c, ids)) {
            if (n.getResolvedAt() != null) continue;
            n.setResolvedAt(now);
            if (n.getReadAt() == null) n.setReadAt(now);
            n.setSnoozedUntil(null);
            changed++;
        }
        return new Changed(changed);
    }

    /** Hides the notifications until {@code until}, which must be in the future and at most 14 days away; a resolved one cannot be snoozed (409). */
    @Transactional
    public SnoozeResult snooze(OrgMembership me, List<Long> ids, Instant until) {
        ConsultantProfile c = gate.requireSelf(me);
        Instant now = Instant.now(clock);
        if (until == null) throw TrackerException.invalid("until", "is required");
        if (!until.isAfter(now)) throw TrackerException.invalid("until", "must be in the future");
        if (until.isAfter(now.plus(Duration.ofDays(MAX_SNOOZE_DAYS)))) throw TrackerException.invalid("until", "can be at most " + MAX_SNOOZE_DAYS + " days away");
        List<CwsNotification> rows = own(c, ids);
        for (CwsNotification n : rows) if (n.getResolvedAt() != null) throw OrgException.coded(409, CODE_RESOLVED, "A resolved notification cannot be snoozed.", Map.of());
        int changed = 0;
        for (CwsNotification n : rows) {
            if (until.equals(n.getSnoozedUntil())) continue;
            n.setSnoozedUntil(until);
            changed++;
        }
        return new SnoozeResult(changed, until);
    }

    /** Soft delete: the row disappears for good from the consultant's point of view and its source event is not turned into a new row. */
    @Transactional
    public Changed delete(OrgMembership me, List<Long> ids) {
        ConsultantProfile c = gate.requireSelf(me);
        Instant now = Instant.now(clock);
        List<CwsNotification> rows = own(c, ids);
        rows.forEach(n -> n.setDeletedAt(now));
        return new Changed(rows.size());
    }

    @Transactional
    public Changed markAllRead(OrgMembership me) {
        ConsultantProfile c = gate.requireSelf(me);
        Instant now = Instant.now(clock);
        int changed = 0;
        for (CwsNotification n : notifications.findByOrgIdAndConsultantId(c.getOrgId(), c.getId())) {
            if (n.getDeletedAt() != null || n.getResolvedAt() != null || n.getReadAt() != null) continue;
            n.setReadAt(now);
            changed++;
        }
        return new Changed(changed);
    }

    /** All of the caller's rows with these ids, or the generic 404 when any id is not one of their live notifications. */
    private List<CwsNotification> own(ConsultantProfile c, List<Long> ids) {
        if (ids == null || ids.isEmpty()) throw TrackerException.invalid("ids", "choose at least one notification");
        Set<Long> distinct = new LinkedHashSet<>(ids);
        if (distinct.contains(null)) throw TrackerException.invalid("ids", "contains an empty value");
        if (distinct.size() > MAX_IDS) throw TrackerException.invalid("ids", "at most " + MAX_IDS + " at a time");
        List<CwsNotification> rows = notifications.findByOrgIdAndConsultantIdAndIdIn(c.getOrgId(), c.getId(), distinct).stream().filter(n -> n.getDeletedAt() == null).toList();
        if (rows.size() != distinct.size()) throw new OrgNotFoundException();
        return rows;
    }

    // ---- preferences ----------------------------------------------------------------------------------------------

    /** Partial update of one category. SMS cannot be switched on: there is no SMS channel (422). */
    @Transactional
    public PrefsResult setPreference(OrgMembership me, String category, Boolean enabled, Boolean email, Boolean inApp, Boolean sms) {
        ConsultantProfile c = gate.requireSelf(me);
        apply(c, categoryOf(category), enabled, email, inApp, sms);
        List<Pref> list = prefList(prefs.findByOrgIdAndConsultantId(c.getOrgId(), c.getId()));
        return new PrefsResult(list, muted(list));
    }

    /** Writes several categories at once (this is what Undo after Mute uses). All or nothing: one bad item changes none. */
    @Transactional
    public PrefsResult setPreferences(OrgMembership me, List<PrefItem> items) {
        ConsultantProfile c = gate.requireSelf(me);
        if (items == null || items.isEmpty()) throw TrackerException.invalid("items", "send at least one category");
        if (items.size() > CwsNotification.CATEGORIES.size()) throw TrackerException.invalid("items", "too many categories");
        for (PrefItem i : items) {
            if (i == null) throw TrackerException.invalid("items", "contains an empty value");
            categoryOf(i.category());
            if (Boolean.TRUE.equals(i.sms())) throw TrackerException.invalid("sms", "SMS is not available yet");
        }
        for (PrefItem i : items) apply(c, categoryOf(i.category()), i.enabled(), i.email(), i.inApp(), i.sms());
        List<Pref> list = prefList(prefs.findByOrgIdAndConsultantId(c.getOrgId(), c.getId()));
        return new PrefsResult(list, muted(list));
    }

    /** Switches every non-critical category off (interviews, approvals and offers stay on) and answers with the previous settings for Undo. */
    @Transactional
    public MuteResult muteNonCritical(OrgMembership me) {
        ConsultantProfile c = gate.requireSelf(me);
        List<Pref> previous = prefList(prefs.findByOrgIdAndConsultantId(c.getOrgId(), c.getId()));
        for (String cat : CwsNotification.CATEGORIES) if (!CRITICAL.contains(cat)) apply(c, cat, false, null, null, null);
        List<Pref> now = prefList(prefs.findByOrgIdAndConsultantId(c.getOrgId(), c.getId()));
        return new MuteResult(previous, now, muted(now));
    }

    private void apply(ConsultantProfile c, String category, Boolean enabled, Boolean email, Boolean inApp, Boolean sms) {
        if (Boolean.TRUE.equals(sms)) throw TrackerException.invalid("sms", "SMS is not available yet");
        CwsNotificationPref row = prefs.findByOrgIdAndConsultantId(c.getOrgId(), c.getId()).stream().filter(p -> category.equals(p.getCategory())).findFirst().orElseGet(() -> {
            CwsNotificationPref p = new CwsNotificationPref();
            p.setOrgId(c.getOrgId());
            p.setConsultantId(c.getId());
            p.setCategory(category);
            return p;
        });
        if (enabled != null) row.setEnabled(enabled);
        if (email != null) row.setEmail(email);
        if (inApp != null) row.setInApp(inApp);
        row.setSms(false);
        row.setUpdatedAt(Instant.now(clock));
        prefs.saveAndFlush(row);
    }

    private static String categoryOf(String category) {
        String k = category == null ? "" : category.strip().toUpperCase(Locale.ROOT);
        if (!CwsNotification.CATEGORIES.contains(k)) throw TrackerException.invalid("category", "is not a notification category");
        return k;
    }

    /** Every category in order, the saved row or the defaults (on, email and in-app, no SMS). */
    static List<Pref> prefList(List<CwsNotificationPref> rows) {
        Map<String, CwsNotificationPref> by = new HashMap<>();
        for (CwsNotificationPref p : rows) by.put(p.getCategory(), p);
        return CwsNotification.CATEGORIES.stream()
            .map(k -> {
                CwsNotificationPref p = by.get(k);
                return new Pref(k, p == null || p.isEnabled(), p == null || p.isEmail(), p == null || p.isInApp(), false, false, CRITICAL.contains(k));
            })
            .toList();
    }

    static boolean muted(List<Pref> list) {
        return list.stream().filter(p -> !p.critical()).allMatch(p -> !p.enabled());
    }

    /** For the seeder: writes the default preference rows a consultant does not have yet (all on, email and in-app, SMS off). */
    @Transactional
    public int ensureDefaultPrefs(ConsultantProfile c) {
        Set<String> have = prefs.findByOrgIdAndConsultantId(c.getOrgId(), c.getId()).stream().map(CwsNotificationPref::getCategory).collect(Collectors.toSet());
        int made = 0;
        for (String k : CwsNotification.CATEGORIES) {
            if (have.contains(k)) continue;
            CwsNotificationPref p = new CwsNotificationPref();
            p.setOrgId(c.getOrgId());
            p.setConsultantId(c.getId());
            p.setCategory(k);
            prefs.save(p);
            made++;
        }
        return made;
    }
}
