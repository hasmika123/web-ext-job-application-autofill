package com.dossier.api.service;

import com.dossier.api.domain.NotificationPreference;
import com.dossier.api.domain.User;
import com.dossier.api.domain.enumeration.NotificationKind;
import com.dossier.api.repository.InboxConnectionRepository;
import com.dossier.api.repository.NotificationPreferenceRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.security.SecurityUtils;
import com.dossier.api.service.NotificationPolicy.Decision;
import com.dossier.api.service.NotificationPolicy.Entry;
import com.dossier.api.service.inbox.InboxService;
import com.dossier.api.service.privacy.SensitiveContent;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.time.DateTimeException;
import java.time.Instant;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.event.EventListener;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/**
 * Notification preferences v0 (E2E-U7.0): which kinds notify the user in-app and by email, quiet hours, and the
 * time zone they are read in. One row per user, keyed by the signed-in user; there is no way to address anyone
 * else's. A user who has never saved gets the defaults the admin-configured {@code notifications.*} settings
 * describe, so the row is created on the first change and never on a read.
 *
 * <p>The locked kinds (billing, security) are always on: a request that tries to switch them off is normalised
 * back on rather than refused, and the view says which ones are locked and why. For the legacy Inbox page switch
 * (emails about interviews and offers, {@code inbox_connection.notify_email}) this table is the truth when a row
 * exists; the two are kept in step in both directions.
 */
@Service
public class NotificationPreferenceService {

    private static final Logger LOG = LoggerFactory.getLogger(NotificationPreferenceService.class);
    private static final DateTimeFormatter HHMM = DateTimeFormatter.ofPattern("HH:mm");

    /** One kind as the panel describes it. */
    public record KindInfo(String kind, String title, String description, boolean locked, String lockedWhy) {}

    /** The window offered when a user switches quiet hours on. */
    public record QuietDefaults(String start, String end) {}

    /** What {@code GET} returns. {@code stored} is false until the user's first save (then the values are defaults). */
    public record View(
        Map<String, Entry> matrix,
        String quietStart,
        String quietEnd,
        String tz,
        boolean stored,
        boolean emailEnabled,
        QuietDefaults quietDefaults,
        List<KindInfo> kinds,
        Instant updatedAt
    ) {}

    /** A switch as submitted; validated before it is trusted. */
    public record EntryIn(Boolean inapp, String email) {}

    /** What {@code PUT} takes: switches for the kinds named (others keep theirs), then quiet hours and zone. */
    public record Update(Map<String, EntryIn> matrix, String quietStart, String quietEnd, String tz) {}

    /** A user's preferences with every default applied. */
    record Prefs(Map<NotificationKind, Entry> matrix, LocalTime quietStart, LocalTime quietEnd, ZoneId tz, boolean stored, Instant updatedAt) {}

    private final NotificationPreferenceRepository preferences;
    private final InboxConnectionRepository connections;
    private final UserRepository users;
    private final ResumeBuilderSettings settings;
    private final ObjectMapper mapper;

    public NotificationPreferenceService(
        NotificationPreferenceRepository preferences,
        InboxConnectionRepository connections,
        UserRepository users,
        ResumeBuilderSettings settings,
        ObjectMapper mapper
    ) {
        this.preferences = preferences;
        this.connections = connections;
        this.users = users;
        this.settings = settings;
        this.mapper = mapper;
    }

    @Transactional(readOnly = true)
    public View mine() {
        return view(resolve(currentUser().getId()));
    }

    @Transactional
    public View update(Update in) {
        Long userId = currentUser().getId();
        Prefs before = resolve(userId);
        Map<NotificationKind, Entry> matrix = new LinkedHashMap<>(before.matrix());

        if (in != null && in.matrix() != null) {
            for (Map.Entry<String, EntryIn> e : in.matrix().entrySet()) {
                NotificationKind kind = NotificationKind.parse(e.getKey()).orElseThrow(() -> invalid("Unknown notification kind"));
                EntryIn v = e.getValue();
                if (v == null || v.inapp() == null) throw invalid("Say whether " + kind.title() + " shows in-app");
                String email = v.email() == null ? before.matrix().get(kind).email() : v.email();
                if (!NotificationPolicy.EMAIL_OFF.equals(email) && !NotificationPolicy.EMAIL_NOW.equals(email)) {
                    throw invalid("Email is off or now");
                }
                matrix.put(kind, NotificationPolicy.effective(kind, new Entry(v.inapp(), email)));
            }
        }

        String quietStartIn = in == null ? null : in.quietStart();
        String quietEndIn = in == null ? null : in.quietEnd();
        String tzIn = in == null ? null : in.tz();
        SensitiveContent.check("tz", "tz", tzIn == null ? "" : tzIn);
        LocalTime start = parseTime(quietStartIn);
        LocalTime end = parseTime(quietEndIn);
        if ((start == null) != (end == null)) throw invalid("Quiet hours need a start and an end");
        ZoneId tz = tzIn == null || tzIn.isBlank() ? before.tz() : parseZone(tzIn);

        NotificationPreference row = preferences.findById(userId).orElseGet(NotificationPreference::new);
        row.setUserId(userId);
        row.setMatrixJson(writeMatrix(matrix));
        row.setQuietStart(start);
        row.setQuietEnd(end);
        row.setTz(tz.getId());
        row.setUpdatedAt(Instant.now());
        preferences.save(row);

        // The Inbox page's switch is the same promise as the Application updates email: keep them one.
        Entry app = matrix.get(NotificationKind.APP_STATUS);
        if (!app.email().equals(before.matrix().get(NotificationKind.APP_STATUS).email())) {
            boolean on = NotificationPolicy.EMAIL_NOW.equals(app.email());
            connections
                .findById(userId)
                .ifPresent(c -> {
                    c.setNotifyEmail(on);
                    connections.save(c);
                });
        }
        return view(resolve(userId));
    }

    /** What to make for {@code kind} for this user right now: an in-app notice, an email, both, or neither. */
    @Transactional(readOnly = true)
    public Decision decide(Long userId, NotificationKind kind, Instant now) {
        Prefs p = resolve(userId);
        return NotificationPolicy.decide(
            kind,
            p.matrix().get(kind),
            settings.getBool(ResumeBuilderSettingKeys.NOTIFY_EMAIL_ENABLED),
            now,
            p.tz(),
            p.quietStart(),
            p.quietEnd()
        );
    }

    /** The Inbox page's switch moved: carry it into the matrix (only when the user has saved preferences of their own). */
    @EventListener
    @Transactional
    public void onInboxNotifyChanged(InboxService.NotifyEmailChanged e) {
        preferences
            .findById(e.userId())
            .ifPresent(row -> {
                Prefs p = resolve(e.userId());
                Map<NotificationKind, Entry> matrix = new LinkedHashMap<>(p.matrix());
                Entry old = matrix.get(NotificationKind.APP_STATUS);
                matrix.put(NotificationKind.APP_STATUS, new Entry(old.inapp(), e.on() ? NotificationPolicy.EMAIL_NOW : NotificationPolicy.EMAIL_OFF));
                row.setMatrixJson(writeMatrix(matrix));
                row.setUpdatedAt(Instant.now());
                preferences.save(row);
            });
    }

    /** The user's preferences for their data export (only what they saved; nothing when they never did). */
    @Transactional(readOnly = true)
    public Map<String, Object> exportCurrentUser() {
        Long userId = currentUser().getId();
        return preferences
            .findById(userId)
            .map(row -> {
                View v = view(resolve(userId));
                Map<String, Object> out = new LinkedHashMap<>();
                out.put("matrix", v.matrix());
                out.put("quietStart", v.quietStart());
                out.put("quietEnd", v.quietEnd());
                out.put("tz", v.tz());
                out.put("updatedAt", row.getUpdatedAt());
                return out;
            })
            .orElse(null);
    }

    public void deleteAllForUser(Long userId) {
        preferences.deleteByUserId(userId);
    }

    // ---- resolving ----------------------------------------------------------

    Prefs resolve(Long userId) {
        Map<NotificationKind, Entry> matrix = defaultMatrix();
        NotificationPreference row = preferences.findById(userId).orElse(null);
        if (row == null) {
            // Never saved: the inbox switch the user already has still decides the interview and offer emails.
            boolean inboxOff = connections.findById(userId).map(c -> !c.isNotifyEmail()).orElse(false);
            if (inboxOff) {
                Entry app = matrix.get(NotificationKind.APP_STATUS);
                matrix.put(NotificationKind.APP_STATUS, new Entry(app.inapp(), NotificationPolicy.EMAIL_OFF));
            }
            boolean quiet = settings.getBool(ResumeBuilderSettingKeys.NOTIFY_QUIET_DEFAULT_ENABLED);
            return new Prefs(
                matrix,
                quiet ? defaultQuietStart() : null,
                quiet ? defaultQuietEnd() : null,
                defaultZone(),
                false,
                null
            );
        }
        try {
            JsonNode stored = mapper.readTree(row.getMatrixJson());
            for (NotificationKind kind : NotificationKind.values()) {
                JsonNode n = stored.path(kind.name());
                if (n.isObject() && n.path("inapp").isBoolean()) {
                    matrix.put(kind, NotificationPolicy.effective(kind, new Entry(n.path("inapp").asBoolean(), n.path("email").asText("off"))));
                }
            }
        } catch (Exception ex) {
            LOG.warn("Unreadable notification matrix for user {}; using the defaults", userId);
        }
        return new Prefs(matrix, row.getQuietStart(), row.getQuietEnd(), zoneOrDefault(row.getTz()), true, row.getUpdatedAt());
    }

    /** The admin-configured defaults; a kind left out of the setting is in-app on, email off. */
    private Map<NotificationKind, Entry> defaultMatrix() {
        JsonNode configured = settings.getJson(ResumeBuilderSettingKeys.NOTIFY_DEFAULTS, JsonNode.class);
        Map<NotificationKind, Entry> out = new LinkedHashMap<>();
        for (NotificationKind kind : NotificationKind.values()) {
            JsonNode n = configured.path(kind.name());
            Entry chosen = n.isObject() ? new Entry(n.path("inapp").asBoolean(true), n.path("email").asText("off")) : new Entry(true, NotificationPolicy.EMAIL_OFF);
            out.put(kind, NotificationPolicy.effective(kind, chosen));
        }
        return out;
    }

    private LocalTime defaultQuietStart() {
        return LocalTime.of(settings.getInt(ResumeBuilderSettingKeys.NOTIFY_QUIET_START_HOUR), 0);
    }

    private LocalTime defaultQuietEnd() {
        return LocalTime.of(settings.getInt(ResumeBuilderSettingKeys.NOTIFY_QUIET_END_HOUR), 0);
    }

    private ZoneId defaultZone() {
        return zoneOrDefault(settings.getString(ResumeBuilderSettingKeys.NOTIFY_DEFAULT_TZ));
    }

    private static ZoneId zoneOrDefault(String id) {
        try {
            return id != null && ZoneId.getAvailableZoneIds().contains(id) ? ZoneId.of(id) : ZoneId.of("UTC");
        } catch (DateTimeException e) {
            return ZoneId.of("UTC");
        }
    }

    // ---- shaping ------------------------------------------------------------

    private View view(Prefs p) {
        Map<String, Entry> matrix = new LinkedHashMap<>();
        List<KindInfo> kinds = new ArrayList<>();
        for (NotificationKind kind : NotificationKind.values()) {
            matrix.put(kind.name(), p.matrix().get(kind));
            kinds.add(new KindInfo(kind.name(), kind.title(), kind.description(), kind.locked(), kind.lockedWhy()));
        }
        return new View(
            matrix,
            p.quietStart() == null ? null : p.quietStart().format(HHMM),
            p.quietEnd() == null ? null : p.quietEnd().format(HHMM),
            p.tz().getId(),
            p.stored(),
            settings.getBool(ResumeBuilderSettingKeys.NOTIFY_EMAIL_ENABLED),
            new QuietDefaults(defaultQuietStart().format(HHMM), defaultQuietEnd().format(HHMM)),
            kinds,
            p.updatedAt()
        );
    }

    private String writeMatrix(Map<NotificationKind, Entry> matrix) {
        ObjectNode root = mapper.createObjectNode();
        for (Map.Entry<NotificationKind, Entry> e : matrix.entrySet()) {
            ObjectNode n = root.putObject(e.getKey().name());
            n.put("inapp", e.getValue().inapp());
            n.put("email", e.getValue().email());
        }
        return root.toString();
    }

    private static LocalTime parseTime(String s) {
        if (s == null || s.isBlank()) return null;
        try {
            return LocalTime.parse(s.trim(), HHMM);
        } catch (DateTimeParseException e) {
            throw invalid("Quiet hours are times like 22:00");
        }
    }

    private static ZoneId parseZone(String s) {
        String id = s.trim();
        if (!ZoneId.getAvailableZoneIds().contains(id)) throw invalid("That isn't a time zone we know");
        return ZoneId.of(id);
    }

    private static ResponseStatusException invalid(String why) {
        return new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, why);
    }

    private User currentUser() {
        String login = SecurityUtils.getCurrentUserLogin().orElseThrow(() ->
            new ResponseStatusException(HttpStatus.UNAUTHORIZED, "No authenticated user")
        );
        return users.findOneByLogin(login).orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Authenticated user not found"));
    }
}
