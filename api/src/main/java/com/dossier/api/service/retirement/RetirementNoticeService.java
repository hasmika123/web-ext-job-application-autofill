package com.dossier.api.service.retirement;

import com.dossier.api.config.Constants;
import com.dossier.api.domain.Subscription;
import com.dossier.api.domain.User;
import com.dossier.api.domain.catalog.Plan;
import com.dossier.api.domain.catalog.PlanRetirement;
import com.dossier.api.domain.catalog.PlanRetirementItem;
import com.dossier.api.domain.catalog.PlanRetirementSuccessor;
import com.dossier.api.domain.enumeration.NotificationKind;
import com.dossier.api.domain.ent.billing.FeatureDefinition;
import com.dossier.api.domain.sub.BillingNotice;
import com.dossier.api.repository.SubscriptionRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.catalog.FeatureDefinitionRepository;
import com.dossier.api.repository.sub.BillingNoticeRepository;
import com.dossier.api.repository.sub.PlanRepository;
import com.dossier.api.repository.sub.PlanRetirementItemRepository;
import com.dossier.api.repository.sub.PlanRetirementRepository;
import com.dossier.api.repository.sub.PlanRetirementSuccessorRepository;
import com.dossier.api.service.AdminAuditService;
import com.dossier.api.service.MailService;
import com.dossier.api.service.NotificationService;
import com.dossier.api.service.NotificationService.Payload;
import com.dossier.api.service.catalog.CatalogException;
import com.dossier.api.service.retirement.RetirementNoticeComposer.Input;
import com.dossier.api.service.retirement.RetirementNoticeComposer.Notice;
import com.dossier.api.service.retirement.SuccessorAdvisor.Suggestion;
import com.dossier.api.service.retirement.dto.NoticeDTOs.NoticeDTO;
import com.dossier.api.service.retirement.dto.NoticeDTOs.NoticePage;
import com.dossier.api.service.retirement.dto.NoticeDTOs.NoticePreviewDTO;
import com.dossier.api.service.retirement.dto.NoticeDTOs.ResendResult;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Sends the retirement notices (docs/subscriptions/11 section 4; story K10.3): for each undecided subscriber, on the scheduled days before their own effective date
 * (default 60, 30, 7 and 1), by e-mail and in-app (the channels of the retirement), and never again once they choose. Every send is a {@code billing_notice} row keyed
 * {@code RET:{retirementId}:{subscriptionId}:{days}}, so support can see what was said and when, and a rerun of the job is a no-op.
 *
 * <p>The day that is due is the smallest scheduled number of days that is not less than the days left (rounded up): a retirement started 45 days before a date sends the
 * 60-day notice now, then the 30-day one at 30 days, and so on. Billing notices are money-relevant, so the notification kind BILLING (locked: in-app and e-mail always on)
 * is used. A notice is never sent to an enterprise account, an account without an e-mail address, or an account that was erased. Enterprise recipients (billing contacts
 * and role holders) wait for the enterprise story K10.7.
 */
@Service
public class RetirementNoticeService {

    private static final Logger LOG = LoggerFactory.getLogger(RetirementNoticeService.class);
    public static final String KIND_PREFIX = "RETIREMENT_NOTICE_";
    public static final String KIND_APPLIED = "FALLBACK_APPLIED";
    static final String ACTION_RESENT = "PLAN_RETIREMENT_NOTICE_RESENT";
    static final String PAGE_PATH = "/settings/plan/changing";

    private final BillingNoticeRepository notices;
    private final PlanRetirementRepository retirements;
    private final PlanRetirementItemRepository itemRepo;
    private final SubscriptionRepository subscriptions;
    private final UserRepository users;
    private final PlanRepository plans;
    private final PlanRetirementSuccessorRepository successors;
    private final FeatureDefinitionRepository features;
    private final RetirementNoticeComposer composer;
    private final MailService mail;
    private final NotificationService notifications;
    private final AdminAuditService audit;
    private final ObjectMapper json;
    private final TransactionTemplate tx;
    private final String baseUrl;

    public RetirementNoticeService(
        BillingNoticeRepository notices,
        PlanRetirementRepository retirements,
        PlanRetirementItemRepository itemRepo,
        SubscriptionRepository subscriptions,
        UserRepository users,
        PlanRepository plans,
        PlanRetirementSuccessorRepository successors,
        FeatureDefinitionRepository features,
        RetirementNoticeComposer composer,
        MailService mail,
        NotificationService notifications,
        AdminAuditService audit,
        ObjectMapper json,
        PlatformTransactionManager transactionManager,
        @Value("${jhipster.mail.base-url:http://localhost:3000}") String baseUrl
    ) {
        this.notices = notices;
        this.retirements = retirements;
        this.itemRepo = itemRepo;
        this.subscriptions = subscriptions;
        this.users = users;
        this.plans = plans;
        this.successors = successors;
        this.features = features;
        this.composer = composer;
        this.mail = mail;
        this.notifications = notifications;
        this.audit = audit;
        this.json = json;
        this.tx = new TransactionTemplate(transactionManager);
        this.baseUrl = baseUrl.replaceAll("/+$", "");
    }

    // ---- the schedule -------------------------------------------------------------------------------------------------------------

    /**
     * The notice day that is due: the smallest scheduled day that is at least the days left (rounded up), or null when the date has passed or is further away than the
     * first scheduled day.
     */
    public static Integer dueDay(List<Integer> schedule, Instant effectiveAt, Instant now) {
        if (!effectiveAt.isAfter(now)) return null;
        long secs = Duration.between(now, effectiveAt).getSeconds();
        long daysLeft = (secs + 86_399L) / 86_400L;
        Integer target = null;
        for (int d : schedule) {
            if (d >= daysLeft && (target == null || d < target)) target = d;
        }
        return target;
    }

    static String key(Long retirementId, Long subscriptionId, int days) {
        return "RET:" + retirementId + ":" + subscriptionId + ":" + days;
    }

    // ---- sending ------------------------------------------------------------------------------------------------------------------

    /** Send the notice that is due for an undecided item, once. Returns whether one was sent. */
    public boolean sendDue(PlanRetirement r, PlanRetirementItem item, Instant now) {
        if (!PlanRetirementItem.PENDING.equals(item.getStatus()) || item.getAppliedAt() != null) return false;
        if (PlanRetirement.MODE_KEEP_INDEFINITELY.equals(r.getMode())) return false;
        Integer day = dueDay(readSchedule(r), item.getRetireEffectiveAt(), now);
        if (day == null) return false;
        String key = key(r.getId(), item.getSubscriptionId(), day);
        if (notices.existsByDedupeKey(key)) return false;
        return deliver(r.getId(), item.getId(), day, key, false) != null;
    }

    /** Send the "moved to Free" confirmation of a fallback, once (K10.5). {@code lockedKeys} are the services that are read-only now. */
    public boolean sendApplied(PlanRetirement r, PlanRetirementItem item, List<String> lockedKeys) {
        String key = "RET:" + r.getId() + ":" + item.getSubscriptionId() + ":APPLIED";
        if (notices.existsByDedupeKey(key)) return false;
        return deliver(r.getId(), item.getId(), 0, key, true, lockedKeys) != null;
    }

    /** Admin: send the current notice to one undecided subscriber again, once more (bypasses the day's dedupe, audited). */
    public ResendResult resend(long retirementId, long itemId, String reason) {
        if (reason == null || reason.trim().length() < CatalogException.REASON_MIN_LENGTH) {
            throw CatalogException.unprocessable("REASON_REQUIRED", "Resending a notice needs a reason of at least " + CatalogException.REASON_MIN_LENGTH + " characters.", Map.of("minLength", CatalogException.REASON_MIN_LENGTH));
        }
        PlanRetirement r = retirements.findById(retirementId).orElseThrow(() -> CatalogException.notFound("retirement", String.valueOf(retirementId)));
        PlanRetirementItem item = itemRepo.findById(itemId).filter(i -> i.getRetirementId().equals(retirementId)).orElseThrow(() -> CatalogException.notFound("item", String.valueOf(itemId)));
        if (!r.isLive() || !PlanRetirementItem.PENDING.equals(item.getStatus())) {
            throw CatalogException.conflict("NOT_PENDING", "Only an undecided subscriber of a running retirement can be sent a notice.", Map.of("status", item.getStatus()));
        }
        Instant now = Instant.now();
        List<Integer> schedule = readSchedule(r);
        Integer day = dueDay(schedule, item.getRetireEffectiveAt(), now);
        if (day == null) day = item.getLastNoticeDays() != null ? item.getLastNoticeDays() : schedule.stream().max(Integer::compare).orElse(1);
        int n = notices.findByItemIdOrderByIdAsc(itemId).size();
        String key = key(retirementId, item.getSubscriptionId(), day) + ":R" + (n + 1);
        BillingNotice sent = deliver(retirementId, itemId, day, key, false);
        audit.record(ACTION_RESENT, AdminAuditService.TARGET_CATALOG, "retirement:" + retirementId + ":item:" + itemId, reason.trim(), "risk=MEDIUM days=" + day + " sent=" + (sent != null));
        return new ResendResult(sent != null, day, sent == null ? null : sent.getId());
    }

    private BillingNotice deliver(Long retirementId, Long itemId, int days, String key, boolean applied) {
        return deliver(retirementId, itemId, days, key, applied, List.of());
    }

    private BillingNotice deliver(Long retirementId, Long itemId, int days, String key, boolean applied, List<String> lockedKeys) {
        return tx.execute(status -> {
            PlanRetirement r = retirements.findById(retirementId).orElse(null);
            PlanRetirementItem item = itemRepo.findById(itemId).orElse(null);
            if (r == null || item == null) return null;
            User user = item.getUserId() == null ? null : users.findById(item.getUserId()).orElse(null);
            Subscription sub = item.getSubscriptionId() == null ? null : subscriptions.findById(item.getSubscriptionId()).orElse(null);
            BillingNotice row = new BillingNotice();
            row.setUserId(item.getUserId());
            row.setSubscriptionId(item.getSubscriptionId());
            row.setRetirementId(retirementId);
            row.setItemId(itemId);
            row.setKind(applied ? KIND_APPLIED : KIND_PREFIX + days);
            row.setDedupeKey(key);
            row.setCreatedAt(Instant.now());
            if (user == null || sub == null || !user.isActivated() || user.getEmail() == null || user.getEmail().isBlank() || Constants.isEnterpriseLogin(user.getLogin())) {
                // an erased, unactivated or enterprise account, or one with no address: record that we looked so the job does not look again, and send nothing
                row.setStatus("SKIPPED");
                row.setUserId(user == null ? null : user.getId());
                if (row.getUserId() == null) return null;
                notices.save(row);
                return null;
            }
            Locale locale = Locale.forLanguageTag(user.getLangKey() == null || user.getLangKey().isBlank() ? "en" : user.getLangKey());
            Notice notice = composer.compose(input(r, item, sub, user, days, applied, lockedKeys), locale, this::featureName);
            List<String> channels = readChannels(r);
            row.setChannels(String.join(",", channels));
            row.setSubject(notice.subject());
            row.setPayloadJson(payload(item, days, notice));
            row = notices.saveAndFlush(row);
            if (channels.contains("EMAIL")) mail.sendRetirementNoticeEmail(user, model(user, notice));
            if (channels.contains("IN_APP")) {
                notifications.publish(NotificationKind.BILLING, user.getId(), new Payload(notice.subject(), notice.intro(), PAGE_PATH, null, "retirement:" + retirementId, key, null, false, null));
            }
            if (!applied) {
                item.setLastNoticeDays(days);
                itemRepo.save(item);
            }
            return row;
        });
    }

    // ---- preview, ledger ----------------------------------------------------------------------------------------------------------

    /** The notice a subscriber would get now; a real one for {@code subscriptionId}, otherwise a sample with invented numbers. */
    public NoticePreviewDTO preview(long retirementId, Long subscriptionId) {
        PlanRetirement r = retirements.findById(retirementId).orElseThrow(() -> CatalogException.notFound("retirement", String.valueOf(retirementId)));
        Instant now = Instant.now();
        Notice n;
        Instant at;
        boolean sample;
        if (subscriptionId != null) {
            PlanRetirementItem item = itemRepo.findByRetirementIdAndSubscriptionId(retirementId, subscriptionId).orElseThrow(() -> CatalogException.notFound("subscription", String.valueOf(subscriptionId)));
            User user = item.getUserId() == null ? null : users.findById(item.getUserId()).orElse(null);
            Subscription sub = subscriptions.findById(subscriptionId).orElse(null);
            Integer day = dueDay(readSchedule(r), item.getRetireEffectiveAt(), now);
            n = composer.compose(input(r, item, sub, user, day == null ? readSchedule(r).get(0) : day, false, List.of()), Locale.ENGLISH, this::featureName);
            at = item.getRetireEffectiveAt();
            sample = false;
        } else {
            at = now.plus(Math.max(r.getMinNoticeDays(), readSchedule(r).get(0)), ChronoUnit.DAYS);
            Suggestion suggestion = sampleSuggestion(retirementId);
            n = composer.compose(
                new Input("Alex", subjectName(r), PlanRetirement.KIND_ADDON.equals(r.getKind()), at, r.getDefaultOutcome(), suggestion, "USD", "MONTH", List.of(), r.getMessageMd(), readSchedule(r).get(0), false, baseUrl + PAGE_PATH),
                Locale.ENGLISH,
                this::featureName
            );
            sample = true;
        }
        return new NoticePreviewDTO(n.subject(), n.intro(), n.suggest(), n.defaultOutcome(), n.cancel(), n.message(), n.emphasis(), at, n.effectiveDate(), sample);
    }

    public NoticePage list(long retirementId, int page, int size) {
        retirements.findById(retirementId).orElseThrow(() -> CatalogException.notFound("retirement", String.valueOf(retirementId)));
        int sz = Math.max(1, Math.min(size, 200));
        int pg = Math.max(0, page);
        var p = notices.findByRetirementIdOrderByIdDesc(retirementId, PageRequest.of(pg, sz));
        Map<Long, String> logins = new LinkedHashMap<>();
        for (User u : users.findAllById(p.getContent().stream().map(BillingNotice::getUserId).filter(java.util.Objects::nonNull).distinct().toList())) logins.put(u.getId(), u.getLogin());
        List<NoticeDTO> items = new ArrayList<>();
        for (BillingNotice b : p.getContent()) items.add(new NoticeDTO(b.getId(), b.getItemId(), b.getSubscriptionId(), logins.get(b.getUserId()), b.getKind(), b.getChannels(), b.getSubject(), b.getStatus(), b.getCreatedAt()));
        return new NoticePage(items, p.getTotalElements(), pg, sz);
    }

    // ---- helpers ------------------------------------------------------------------------------------------------------------------

    private Input input(PlanRetirement r, PlanRetirementItem item, Subscription sub, User user, int days, boolean applied, List<String> lockedKeys) {
        Suggestion suggestion = readSuggestion(item);
        List<String> lockedNames = new ArrayList<>();
        for (String k : lockedKeys) lockedNames.add(featureName(k));
        return new Input(
            user == null ? null : user.getFirstName(),
            subjectName(r),
            PlanRetirement.KIND_ADDON.equals(r.getKind()),
            item.getRetireEffectiveAt(),
            r.getDefaultOutcome(),
            suggestion,
            sub == null || sub.getCurrency() == null ? "USD" : sub.getCurrency(),
            item.getBillingInterval(),
            lockedNames,
            r.getMessageMd(),
            days,
            applied,
            baseUrl + PAGE_PATH
        );
    }

    private String subjectName(PlanRetirement r) {
        if (r.getFeatureKey() != null) return featureName(r.getFeatureKey());
        return plans.findById(r.getPlanId()).map(Plan::getName).orElse("your plan");
    }

    private String featureName(String key) {
        return features.findByFeatureKey(key).map(FeatureDefinition::getName).filter(n -> n != null && !n.isBlank()).orElse(key);
    }

    /** The rank-1 successor as an invented "same price" suggestion, for the preview of a retirement that has no real subscriber to show. */
    private Suggestion sampleSuggestion(long retirementId) {
        Optional<PlanRetirementSuccessor> first = successors.findByRetirementIdOrderByRankNoAsc(retirementId).stream().findFirst();
        if (first.isEmpty()) return null;
        PlanRetirementSuccessor s = first.get();
        String key = s.getSuccessorPlanKey() != null ? s.getSuccessorPlanKey() : s.getSuccessorFeatureKey();
        String name = s.getSuccessorPlanKey() != null ? plans.findByPlanKey(s.getSuccessorPlanKey()).map(Plan::getName).orElse(key) : featureName(key);
        return new Suggestion(key, name, s.getSuccessorPlanKey() != null ? "PLAN" : "ADDON", s.getRankNo(), List.of(), List.of(), 1999, 1999, 0, "SAME", "MONTH", 1999, null, List.of(), null);
    }

    private Suggestion readSuggestion(PlanRetirementItem item) {
        if (item.getSuggestionJson() == null) return null;
        try {
            return json.readValue(item.getSuggestionJson(), Suggestion.class);
        } catch (JsonProcessingException e) {
            LOG.warn("item {} has an unreadable suggestion", item.getId());
            return null;
        }
    }

    private List<Integer> readSchedule(PlanRetirement r) {
        try {
            List<Integer> out = new ArrayList<>(List.of(json.readValue(r.getNoticeScheduleJson(), Integer[].class)));
            out.sort(java.util.Comparator.reverseOrder());
            return out.isEmpty() ? List.of(60, 30, 7, 1) : out;
        } catch (JsonProcessingException | RuntimeException e) {
            return List.of(60, 30, 7, 1);
        }
    }

    private List<String> readChannels(PlanRetirement r) {
        try {
            List<String> out = List.of(json.readValue(r.getChannelsJson(), String[].class));
            return out.isEmpty() ? List.of("EMAIL", "IN_APP") : out;
        } catch (JsonProcessingException | RuntimeException e) {
            return List.of("EMAIL", "IN_APP");
        }
    }

    private String payload(PlanRetirementItem item, int days, Notice notice) {
        Map<String, Object> p = new LinkedHashMap<>();
        p.put("days", days);
        p.put("effectiveAt", item.getRetireEffectiveAt().toString());
        try {
            return json.writeValueAsString(p);
        } catch (JsonProcessingException e) {
            return "{}";
        }
    }

    private Map<String, Object> model(User user, Notice n) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("subject", n.subject());
        m.put("preheader", n.preheader());
        m.put("kicker", n.kicker());
        m.put("line1", n.line1());
        m.put("line2", n.line2());
        m.put("intro", n.intro());
        m.put("stripTitle", n.stripTitle());
        m.put("stripText", n.stripText());
        m.put("paragraphs", n.paragraphs());
        m.put("emphasis", n.emphasis());
        m.put("button", n.button());
        m.put("footer", n.footer());
        m.put("link", n.link());
        return m;
    }
}
