package com.dossier.api.service;

import com.dossier.api.domain.AiAnswer;
import com.dossier.api.domain.User;
import com.dossier.api.repository.AiAnswerRepository;
import com.dossier.api.repository.UserRepository;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Server-side answer cache (Phase 5.3). Identical questions from the same user reuse a
 * stored answer instead of re-spending the monthly quota or re-hitting the provider — and
 * the cache follows the user across devices (it lives in {@code ai_answer}, keyed by a
 * normalized-question SHA-256 + user; a unique index on (user_id, question_hash) backs it).
 *
 * The write runs in its OWN transaction ({@code REQUIRES_NEW}) so that a rare duplicate-race
 * unique-constraint violation rolls back only the cache insert, never the caller's draft +
 * quota bookkeeping.
 */
@Service
public class AiAnswerCacheService {

    private static final Logger LOG = LoggerFactory.getLogger(AiAnswerCacheService.class);

    private final AiAnswerRepository aiAnswerRepository;
    private final UserRepository userRepository;

    public AiAnswerCacheService(AiAnswerRepository aiAnswerRepository, UserRepository userRepository) {
        this.aiAnswerRepository = aiAnswerRepository;
        this.userRepository = userRepository;
    }

    /**
     * Stable cache key for a question: lowercased, whitespace-collapsed, trailing punctuation
     * stripped, then SHA-256 (hex). Mirrors the extension's local-cache normalization so
     * trivially-different phrasings of the same question share an answer.
     */
    public static String questionHash(String question) {
        String norm = (question == null ? "" : question)
            .toLowerCase()
            .replaceAll("\\s+", " ")
            .replaceAll("[\\s?:.!,;-]+$", "")
            .trim();
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(norm.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder(64);
            for (byte b : digest) {
                sb.append(Character.forDigit((b >> 4) & 0xF, 16)).append(Character.forDigit(b & 0xF, 16));
            }
            return sb.toString();
        } catch (NoSuchAlgorithmException e) {
            // SHA-256 is guaranteed present on every JVM; this is unreachable.
            throw new IllegalStateException("SHA-256 unavailable", e);
        }
    }

    /** Cached answer for this user + question hash, if any. */
    @Transactional(readOnly = true)
    public Optional<String> lookup(String login, String questionHash) {
        return aiAnswerRepository.findOneByUserLoginAndQuestionHash(login, questionHash).map(AiAnswer::getAnswer);
    }

    /** Persist an answer for reuse. Best-effort: a concurrent duplicate is silently ignored. */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void store(String login, String questionHash, String answer, String model) {
        User user = userRepository.findOneByLogin(login).orElse(null);
        if (user == null) {
            return; // authenticated user vanished mid-request — skip caching, not fatal
        }
        AiAnswer entry = new AiAnswer();
        entry.setUser(user);
        entry.setQuestionHash(questionHash);
        entry.setAnswer(answer);
        entry.setModel(model == null || model.isBlank() ? null : model);
        entry.setCreatedAt(Instant.now());
        try {
            aiAnswerRepository.save(entry);
        } catch (DataIntegrityViolationException e) {
            // Another request cached the same (user, question_hash) first — fine.
            LOG.debug("Answer already cached for hash {}", questionHash);
        }
    }
}
