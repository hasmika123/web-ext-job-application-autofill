package com.dossier.api.service;

import com.dossier.api.domain.ResumeDoc;
import com.dossier.api.domain.ResumeDocVersion;
import com.dossier.api.repository.ResumeDocVersionRepository;
import com.dossier.api.service.dto.ResumeActorDTO;
import com.dossier.api.service.dto.ResumeVersionDTO;
import com.dossier.api.service.resume.ResumeDocument;
import com.dossier.api.service.resume.ResumeDocumentText;
import com.dossier.api.service.resume.ResumeDocumentUpgrader;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * A built resume's version history (Resume Builder DESIGN 8.2, 9.11). Rows are snapshots of the
 * document, template and theme; {@code version_no} counts up per resume.
 *
 * <p>Policy: an <b>autosave</b> row is written only when the content changed <em>and</em> the previous
 * row is at least {@code resume.versions.coalesceMinutes} old; template switches, imports and detaches
 * always write a row; a <b>checkpoint</b> is the user's "this state matters" (reason MANUAL, or NAMED
 * with a name). Retention trims the automatic rows to the newest {@code resume.versions.retentionAuto};
 * checkpoints and named versions are kept.
 */
@Service
@Transactional
public class ResumeDocVersionService {

    public static final String AUTOSAVE = "AUTOSAVE";
    public static final String MANUAL = "MANUAL";
    public static final String NAMED = "NAMED";
    public static final String TEMPLATE_SWITCH = "TEMPLATE_SWITCH";
    public static final String IMPORT = "IMPORT";
    public static final String DETACH = "DETACH";
    public static final String RESTORE = "RESTORE";
    /** R4.1: the document right after the user applied AI changes (the state before is kept as its own row). */
    public static final String AI_APPLY = "AI_APPLY";

    /** A version name is at most this long (DESIGN 9.2). */
    public static final int MAX_NAME_CHARS = 80;

    private final ResumeDocVersionRepository repository;
    private final ResumeBuilderSettings settings;
    private final ResumeActors actors;

    public ResumeDocVersionService(ResumeDocVersionRepository repository, ResumeBuilderSettings settings, ResumeActors actors) {
        this.repository = repository;
        this.settings = settings;
        this.actors = actors;
    }

    // ---- writing ------------------------------------------------------------

    /** Write one row now, snapshotting the document as it currently stands, then trim the automatic rows. */
    public ResumeDocVersion record(ResumeDoc d, String reason, String name, String byLogin) {
        ResumeDocVersion latest = repository.findFirstByResumeIdAndUserIdOrderByVersionNoDesc(d.getResumeId(), d.getUser().getId()).orElse(null);
        ResumeDocVersion v = new ResumeDocVersion();
        v.setResumeId(d.getResumeId());
        v.setUser(d.getUser());
        v.setVersionNo(latest == null ? 1 : latest.getVersionNo() + 1);
        v.setReason(reason);
        v.setName(name);
        v.setDocJson(d.getDocJson());
        v.setTemplateId(d.getTemplateId());
        v.setThemeJson(d.getThemeJson());
        v.setContentHash(d.getContentHash());
        v.setCreatedAt(Instant.now());
        v.setCreatedByLogin(byLogin);
        ResumeDocVersion saved = repository.saveAndFlush(v);
        trimAutomatic(d);
        return saved;
    }

    /**
     * After a content save: write an AUTOSAVE row if the document changed ({@code previousHash} differs
     * from the saved hash) and the coalescing window since the previous row has passed.
     */
    public Optional<ResumeDocVersion> recordAutosave(ResumeDoc d, String previousHash, String byLogin) {
        ResumeDocVersion latest = repository.findFirstByResumeIdAndUserIdOrderByVersionNoDesc(d.getResumeId(), d.getUser().getId()).orElse(null);
        Instant lastAt = latest == null ? null : latest.getCreatedAt();
        String lastHash = latest == null ? null : latest.getContentHash();
        int minutes = settings.getInt(ResumeBuilderSettingKeys.VERSIONS_COALESCE_MINUTES);
        if (!shouldWriteAutosave(previousHash, d.getContentHash(), lastHash, lastAt, Instant.now(), minutes)) {
            return Optional.empty();
        }
        return Optional.of(record(d, AUTOSAVE, null, byLogin));
    }

    /** The autosave policy, pure: changed content, and not inside the coalescing window of the previous row. */
    static boolean shouldWriteAutosave(String previousHash, String newHash, String lastRowHash, Instant lastRowAt, Instant now, int coalesceMinutes) {
        if (newHash == null || newHash.equals(previousHash)) return false;
        if (newHash.equals(lastRowHash)) return false;
        return lastRowAt == null || !lastRowAt.plus(Duration.ofMinutes(coalesceMinutes)).isAfter(now);
    }

    /** A checkpoint: MANUAL, or NAMED when {@code name} is non-blank (trimmed, at most 80 characters). */
    public ResumeDocVersion checkpoint(ResumeDoc d, String name, String byLogin) {
        String n = name == null ? null : name.strip();
        if (n != null && n.isEmpty()) n = null;
        if (n != null && n.length() > MAX_NAME_CHARS) {
            throw ResumeDocException.invalid("$.name", "must be at most " + MAX_NAME_CHARS + " characters");
        }
        return record(d, n == null ? MANUAL : NAMED, n, byLogin);
    }

    private void trimAutomatic(ResumeDoc d) {
        int keep = settings.getInt(ResumeBuilderSettingKeys.VERSIONS_RETENTION_AUTO);
        List<Long> ids = repository.findAutomaticIds(d.getResumeId(), d.getUser().getId());
        if (ids.size() > keep) {
            repository.deleteAllById(ids.subList(keep, ids.size()));
        }
    }

    // ---- reading ------------------------------------------------------------

    /** The history of one resume, newest first, with the author and the kind of each row. */
    @Transactional(readOnly = true)
    public List<ResumeVersionDTO> rows(Long resumeId, Long userId, String ownerLogin) {
        List<ResumeDocVersionRepository.VersionRow> rows = repository.findRows(resumeId, userId);
        Map<String, ResumeActorDTO> by = actors.resolve(rows.stream().map(r -> r.getCreatedByLogin() != null ? r.getCreatedByLogin() : ownerLogin).collect(Collectors.toSet()));
        return rows
            .stream()
            .map(r -> {
                String login = r.getCreatedByLogin() != null ? r.getCreatedByLogin() : ownerLogin;
                return new ResumeVersionDTO(r.getVersionNo(), r.getReason(), r.getName(), r.getCreatedAt(), r.getContentHash(), by.get(login), kindOf(r.getReason()));
            })
            .toList();
    }

    /** The ATS plain text of one version; empty when there is no such version. */
    @Transactional(readOnly = true)
    public Optional<String> text(Long resumeId, Long userId, int versionNo) {
        return repository
            .findByResumeIdAndUserIdAndVersionNo(resumeId, userId, versionNo)
            .map(v -> ResumeDocumentText.render(ResumeDocumentUpgrader.upgrade(ResumeDocument.parse(v.getDocJson()))));
    }

    /** One whole version (document, template, theme) for Restore; empty when there is no such number. */
    @Transactional(readOnly = true)
    public Optional<ResumeDocVersion> find(Long resumeId, Long userId, int versionNo) {
        return repository.findByResumeIdAndUserIdAndVersionNo(resumeId, userId, versionNo);
    }

    /** The newest row (its number and kind feed the header's Version menu); empty before the first. */
    @Transactional(readOnly = true)
    public Optional<ResumeDocVersion> latest(Long resumeId, Long userId) {
        return repository.findFirstByResumeIdAndUserIdOrderByVersionNoDesc(resumeId, userId);
    }

    /** Resumes of this user that have a checkpoint (MANUAL or NAMED): they are no longer drafts. */
    @Transactional(readOnly = true)
    public Set<Long> checkpointResumeIds(Long userId) {
        return repository.findCheckpointResumeIds(userId);
    }

    @Transactional(readOnly = true)
    public boolean hasCheckpoint(Long resumeId, Long userId) {
        return repository.existsByResumeIdAndUserIdAndReasonIn(resumeId, userId, List.of(MANUAL, NAMED));
    }

    /** {@code AUTOSAVE} to {@code auto}, {@code NAMED} to {@code named}, {@code MANUAL} to {@code checkpoint}, anything else {@code system}. */
    public static String kindOf(String reason) {
        if (reason == null) return "system";
        return switch (reason) {
            case AUTOSAVE -> "auto";
            case NAMED -> "named";
            case MANUAL -> "checkpoint";
            default -> "system";
        };
    }
}
