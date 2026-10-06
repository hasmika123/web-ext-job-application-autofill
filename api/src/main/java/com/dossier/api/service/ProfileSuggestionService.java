package com.dossier.api.service;

import com.dossier.api.domain.ProfileSuggestion;
import com.dossier.api.domain.User;
import com.dossier.api.domain.enumeration.SuggestionStatus;
import com.dossier.api.repository.ProfileSuggestionRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.security.SecurityUtils;
import com.dossier.api.service.dto.BioDTO;
import com.dossier.api.service.dto.LearnedAnswerDTO;
import com.dossier.api.service.dto.ProfileSuggestionDTO;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.time.Instant;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/**
 * The self-building profile's learning half (Phase 10.3c, Tier C).
 *
 * <p>The extension reports answers the user gave while applying ({@link #record}); they become
 * <b>suggestions</b>, never profile values, until the user accepts one on the web
 * ({@link #accept}). This is the second write-back path the locked decision allows (user
 * decision 2026-09-21): creation, not editing — the server owns the record and the user confirms.
 *
 * <p>The rules, all decided 2026-09-22:
 * <ul>
 *   <li><b>Canonical, non-sensitive fields only</b> ({@link #SUGGESTIBLE}). EEO is never learned
 *       from pages — it is only ever set on the web. Resume-level text (summary, skills, cover
 *       letter) isn't a profile value either.</li>
 *   <li><b>A blank profile field is suggested at once.</b> A <b>change</b> to a value the profile
 *       already holds waits until the same new value has been seen on {@link #CHANGE_THRESHOLD}
 *       different applications — a salary typed for one job must not replace the default.</li>
 *   <li><b>A dismissed value is never suggested again</b>, and nothing already decided (accepted or
 *       dismissed) is re-opened by the extension.</li>
 *   <li><b>Free and Pro alike.</b> The self-building profile is a free feature; the Pro-only
 *       field-cache sync is a different thing and stays as it is.</li>
 * </ul>
 */
@Service
@Transactional
public class ProfileSuggestionService {

    private static final Logger LOG = LoggerFactory.getLogger(ProfileSuggestionService.class);

    /** Profile keys a learned answer may be suggested for. Mirrors the extension's canonical
     *  bio fields (schema.js) minus EEO and resume-level text. */
    public static final Set<String> SUGGESTIBLE = Set.of(
        "firstName",
        "lastName",
        "preferredName",
        "email",
        "phone",
        "addressLine1",
        "addressLine2",
        "city",
        "state",
        "postalCode",
        "country",
        "linkedin",
        "github",
        "website",
        "authorizedToWork",
        "requireSponsorship",
        "desiredSalary",
        "noticePeriod",
        "earliestStartDate",
        "workPreference",
        "willingToRelocate",
        "referralSource"
    );

    /** How many different applications must show a new value before it's offered as a change. */
    public static final int CHANGE_THRESHOLD = 2;

    static final int MAX_VALUE = 500;
    static final int MAX_BATCH = 25;
    /** Undecided suggestions a user can accumulate; past this, new ones are dropped until they review. */
    static final int MAX_PENDING = 50;

    private static final Pattern CONTEXT = Pattern.compile("^[A-Za-z0-9_-]{1,64}$");

    private final ProfileSuggestionRepository repository;
    private final UserRepository userRepository;
    private final ProfileService profileService;
    private final ObjectMapper om = new ObjectMapper();

    public ProfileSuggestionService(
        ProfileSuggestionRepository repository,
        UserRepository userRepository,
        ProfileService profileService
    ) {
        this.repository = repository;
        this.userRepository = userRepository;
        this.profileService = profileService;
    }

    /**
     * Record answers the extension learned. Malformed or disallowed entries are skipped, never an
     * error — the extension sends these in the background and has nothing useful to do with one.
     */
    public void record(List<LearnedAnswerDTO> answers) {
        if (answers == null || answers.isEmpty()) return;
        User user = currentUser();
        ObjectNode bio = readBio();
        long pending = repository.countByUserIdAndStatus(user.getId(), SuggestionStatus.PENDING);

        for (LearnedAnswerDTO a : answers.stream().limit(MAX_BATCH).toList()) {
            if (a == null || a.fieldKey() == null || !SUGGESTIBLE.contains(a.fieldKey())) continue;
            String value = clean(a.value());
            if (value.isEmpty() || value.length() > MAX_VALUE) continue;
            if (same(value, textOf(bio, a.fieldKey()))) continue; // the profile already says this
            String context = a.context() != null && CONTEXT.matcher(a.context()).matches() ? a.context() : null;

            ProfileSuggestion row = repository
                .findByUserIdAndFieldKey(user.getId(), a.fieldKey())
                .stream()
                .filter(s -> same(s.getValue(), value))
                .findFirst()
                .orElse(null);

            if (row == null) {
                if (pending >= MAX_PENDING) continue;
                row = new ProfileSuggestion();
                row.setUser(user);
                row.setFieldKey(a.fieldKey());
                row.setValue(value);
                row.setLastContext(context);
                repository.save(row);
                pending++;
            } else if (row.getStatus() == SuggestionStatus.PENDING) {
                // Seen again: only a DIFFERENT application counts toward the change threshold.
                if (context != null && !context.equals(row.getLastContext())) {
                    row.setSeenCount(row.getSeenCount() + 1);
                    row.setLastContext(context);
                }
                row.setUpdatedAt(Instant.now());
            }
            // ACCEPTED / DISMISSED: the user already decided — leave it alone.
        }
    }

    /**
     * The suggestions worth showing now: undecided, not already what the profile says, and either
     * filling a blank field or a change seen on enough applications. One per field — the most
     * recently seen value wins.
     */
    @Transactional(readOnly = true)
    public List<ProfileSuggestionDTO> listPending() {
        User user = currentUser();
        ObjectNode bio = readBio();
        Map<String, ProfileSuggestionDTO> byField = new LinkedHashMap<>();
        repository
            .findByUserIdAndStatus(user.getId(), SuggestionStatus.PENDING)
            .stream()
            // Newest first; the id breaks ties, since a timestamp column may only hold whole seconds.
            .sorted(Comparator.comparing(ProfileSuggestion::getUpdatedAt).thenComparing(ProfileSuggestion::getId).reversed())
            .forEach(s -> {
                String current = textOf(bio, s.getFieldKey());
                if (!isVisible(current, s.getValue(), s.getSeenCount())) return;
                byField.putIfAbsent(
                    s.getFieldKey(),
                    new ProfileSuggestionDTO(s.getId(), s.getFieldKey(), s.getValue(), current, s.getSeenCount(), s.getUpdatedAt())
                );
            });
        return List.copyOf(byField.values());
    }

    /**
     * Keep a suggestion: write it (or the user's edit of it) into the profile. Other undecided
     * values for the same field are dropped — the user just chose — so they can be learned afresh.
     *
     * @throws ResponseStatusException 404 if it isn't this user's undecided suggestion, 400 for a
     *                                 blank or oversized edit, 409 if the stored profile is unreadable.
     */
    public void accept(Long id, String editedValue) {
        User user = currentUser();
        ProfileSuggestion s = pendingOf(user, id);
        String value = editedValue == null ? s.getValue() : clean(editedValue);
        if (value.isEmpty() || value.length() > MAX_VALUE) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A profile value must be 1 to " + MAX_VALUE + " characters");
        }

        ObjectNode bio = readBioStrict();
        bio.put(s.getFieldKey(), value);
        try {
            profileService.upsertProfile(om.writeValueAsString(bio));
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Could not serialize the profile", e);
        }

        s.setStatus(SuggestionStatus.ACCEPTED);
        s.setUpdatedAt(Instant.now());
        repository.deleteAll(
            repository
                .findByUserIdAndFieldKey(user.getId(), s.getFieldKey())
                .stream()
                .filter(o -> o.getStatus() == SuggestionStatus.PENDING && !o.getId().equals(s.getId()))
                .toList()
        );
        LOG.debug("User {} accepted a suggested {}", user.getLogin(), s.getFieldKey());
    }

    /** Turn a suggestion down. It stays on record so the same value is never suggested again. */
    public void dismiss(Long id) {
        ProfileSuggestion s = pendingOf(currentUser(), id);
        s.setStatus(SuggestionStatus.DISMISSED);
        s.setUpdatedAt(Instant.now());
    }

    /** Every row the user owns, decided or not — for the account export (GDPR access). */
    @Transactional(readOnly = true)
    public List<Map<String, Object>> exportCurrentUser() {
        return repository
            .findByUserId(currentUser().getId())
            .stream()
            .map(s -> {
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("fieldKey", s.getFieldKey());
                m.put("value", s.getValue());
                m.put("status", s.getStatus().name());
                m.put("seenCount", s.getSeenCount());
                m.put("createdAt", s.getCreatedAt());
                m.put("updatedAt", s.getUpdatedAt());
                return m;
            })
            .toList();
    }

    /** Remove every row a user owns (account deletion). */
    public void deleteAllForUser(Long userId) {
        repository.deleteAll(repository.findByUserId(userId));
    }

    // ---- the rules, pure so they're unit-testable -------------------------------------------

    /** Show a pending suggestion when it fills a blank field, or when a change has been seen enough. */
    static boolean isVisible(String currentValue, String value, int seenCount) {
        if (same(currentValue, value)) return false;
        return clean(currentValue).isEmpty() || seenCount >= CHANGE_THRESHOLD;
    }

    /** Trimmed, with runs of whitespace collapsed; null-safe. */
    static String clean(String s) {
        return s == null ? "" : s.trim().replaceAll("\\s+", " ");
    }

    /** Case-insensitive, whitespace-insensitive equality: "hybrid " is the same answer as "Hybrid". */
    static boolean same(String a, String b) {
        return clean(a).equalsIgnoreCase(clean(b));
    }

    // ---- helpers -----------------------------------------------------------------------------

    private ProfileSuggestion pendingOf(User user, Long id) {
        return repository
            .findByIdAndUserId(id, user.getId())
            .filter(s -> s.getStatus() == SuggestionStatus.PENDING)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No such suggestion"));
    }

    private static String textOf(ObjectNode bio, String key) {
        JsonNode n = bio.get(key);
        return n != null && n.isValueNode() && !n.isNull() ? n.asText("") : "";
    }

    /** The profile as a JSON object; an absent or unreadable one reads as empty (nothing known). */
    private ObjectNode readBio() {
        try {
            return readBioStrict();
        } catch (ResponseStatusException e) {
            return om.createObjectNode();
        }
    }

    /** Like {@link #readBio} but refuses to treat a corrupt payload as empty — accepting a
     *  suggestion over it would silently wipe everything else the profile held. */
    private ObjectNode readBioStrict() {
        String payload = profileService.getProfile().map(BioDTO::getPayload).orElse(null);
        if (payload == null || payload.isBlank()) return om.createObjectNode();
        try {
            JsonNode n = om.readTree(payload);
            if (n instanceof ObjectNode o) return o;
        } catch (JsonProcessingException e) {
            // fall through: unreadable
        }
        throw new ResponseStatusException(HttpStatus.CONFLICT, "Your profile couldn't be read; edit it on the profile page first");
    }

    private User currentUser() {
        String login = SecurityUtils.getCurrentUserLogin().orElseThrow(() ->
            new ResponseStatusException(HttpStatus.UNAUTHORIZED, "No authenticated user")
        );
        return userRepository
            .findOneByLogin(login)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Authenticated user not found"));
    }
}
