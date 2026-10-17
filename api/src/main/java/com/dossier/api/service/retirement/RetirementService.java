package com.dossier.api.service.retirement;

import com.dossier.api.config.Constants;
import com.dossier.api.domain.Subscription;
import com.dossier.api.domain.User;
import com.dossier.api.domain.catalog.Plan;
import com.dossier.api.domain.catalog.PlanRetirement;
import com.dossier.api.domain.catalog.PlanRetirementItem;
import com.dossier.api.domain.catalog.PlanRetirementSuccessor;
import com.dossier.api.domain.catalog.PlanVersion;
import com.dossier.api.repository.SubscriptionRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.sub.PlanRepository;
import com.dossier.api.repository.sub.PlanRetirementItemRepository;
import com.dossier.api.repository.sub.PlanRetirementRepository;
import com.dossier.api.repository.sub.PlanRetirementSuccessorRepository;
import com.dossier.api.repository.sub.PlanVersionRepository;
import com.dossier.api.security.SecurityUtils;
import com.dossier.api.service.AdminAuditService;
import com.dossier.api.service.EntitlementService;
import com.dossier.api.service.catalog.CatalogChangeRecorder;
import com.dossier.api.service.catalog.CatalogException;
import com.dossier.api.service.catalog.PlanLifecycleService;
import com.dossier.api.service.catalog.SubscriptionPlanLinker;
import com.dossier.api.service.catalog.plan.PlanRetireGuard;
import com.dossier.api.service.retirement.dto.RetirementDTOs.CancelRequest;
import com.dossier.api.service.retirement.dto.RetirementDTOs.CompleteRequest;
import com.dossier.api.service.retirement.dto.RetirementDTOs.CreateRequest;
import com.dossier.api.service.retirement.dto.RetirementDTOs.ImpactDTO;
import com.dossier.api.service.retirement.dto.RetirementDTOs.ItemDTO;
import com.dossier.api.service.retirement.dto.RetirementDTOs.ItemPage;
import com.dossier.api.service.retirement.dto.RetirementDTOs.RetirementDTO;
import com.dossier.api.service.retirement.dto.RetirementDTOs.RetirementPage;
import com.dossier.api.service.retirement.dto.RetirementDTOs.StartRequest;
import com.dossier.api.service.retirement.dto.RetirementDTOs.SuccessorDTO;
import com.dossier.api.service.retirement.dto.RetirementDTOs.SuccessorRequest;
import com.dossier.api.service.retirement.dto.RetirementDTOs.UpdateRequest;
import com.dossier.api.service.settings.BillingSettingKeys;
import com.dossier.api.service.settings.SettingsService;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.PageRequest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The retirement lifecycle (docs/subscriptions/11-plan-retirement.md sections 2, 3 and 10; story K10.1). A retirement is a first-class, audited object: an admin
 * creates it (DRAFT), ranks the successors, starts it (the plan, version or add-on becomes RETIRING and stops selling; every affected subscription gets an item with
 * an effective date that only ever moves later), and it completes when nobody is left on what is being retired. Starting changes nothing for any subscriber: they
 * keep their plan, prices, add-ons and allowances until their own date.
 *
 * <p>Scope today is the personal world (audience INDIVIDUAL, plan or add-on); organization plan retirement is K10.7 (needs the K6 enterprise plan layer) and a PRICE
 * retirement is not built (it needs the replacement-price semantics of K10.8's price step). Starting a retirement with no subscribers completes it at once, with no
 * notices. Cancelling is allowed while no subscriber has acted ({@code 409 RETIREMENT_IN_PROGRESS} otherwise: a switch is a confirmed quote and is never undone by us).
 * Every write is HIGH: a reason of at least 20 characters, the typed key, an {@code admin_audit_event} and a {@code catalog_change} row.
 */
@Service
public class RetirementService {

    private static final Logger LOG = LoggerFactory.getLogger(RetirementService.class);

    public static final int REASON_MIN_LENGTH = 20;
    public static final String PLAN_RETIREMENT_CREATED = "PLAN_RETIREMENT_CREATED";
    public static final String PLAN_RETIREMENT_UPDATED = "PLAN_RETIREMENT_UPDATED";
    public static final String PLAN_RETIREMENT_STARTED = "PLAN_RETIREMENT_STARTED";
    public static final String PLAN_RETIREMENT_CANCELLED = "PLAN_RETIREMENT_CANCELLED";
    public static final String PLAN_RETIREMENT_COMPLETED = "PLAN_RETIREMENT_COMPLETED";
    public static final String PLAN_RETIREMENT_SUCCESSORS = "PLAN_RETIREMENT_SUCCESSORS";
    static final String ENTITY_RETIREMENT = "plan_retirement";
    static final int MAX_SUCCESSORS = 5;

    /** Item statuses that still need the job (or a decision): not yet applied. */
    static final List<String> UNAPPLIED = List.of(PlanRetirementItem.PENDING, PlanRetirementItem.CANCELLED, PlanRetirementItem.SWITCH_SCHEDULED);

    private final PlanRetirementRepository retirements;
    private final PlanRetirementSuccessorRepository successors;
    private final PlanRetirementItemRepository itemRepo;
    private final PlanRepository plans;
    private final PlanVersionRepository versions;
    private final SubscriptionRepository subscriptions;
    private final UserRepository users;
    private final RetirementEffectiveDateService dates;
    private final RetirementMoney money;
    private final SuccessorAdvisor advisor;
    private final PlanLifecycleService lifecycle;
    private final PlanRetireGuard guard;
    private final SubscriptionPlanLinker linker;
    private final AdminAuditService audit;
    private final CatalogChangeRecorder changes;
    private final SettingsService settings;
    private final ObjectMapper json;
    private final JdbcTemplate jdbc;

    public RetirementService(
        PlanRetirementRepository retirements,
        PlanRetirementSuccessorRepository successors,
        PlanRetirementItemRepository itemRepo,
        PlanRepository plans,
        PlanVersionRepository versions,
        SubscriptionRepository subscriptions,
        UserRepository users,
        RetirementEffectiveDateService dates,
        RetirementMoney money,
        SuccessorAdvisor advisor,
        PlanLifecycleService lifecycle,
        PlanRetireGuard guard,
        SubscriptionPlanLinker linker,
        AdminAuditService audit,
        CatalogChangeRecorder changes,
        SettingsService settings,
        ObjectMapper json,
        JdbcTemplate jdbc
    ) {
        this.retirements = retirements;
        this.successors = successors;
        this.itemRepo = itemRepo;
        this.plans = plans;
        this.versions = versions;
        this.subscriptions = subscriptions;
        this.users = users;
        this.dates = dates;
        this.money = money;
        this.advisor = advisor;
        this.lifecycle = lifecycle;
        this.guard = guard;
        this.linker = linker;
        this.audit = audit;
        this.changes = changes;
        this.settings = settings;
        this.json = json;
        this.jdbc = jdbc;
    }

    // ---- create / read / edit -----------------------------------------------------------------------------------------------------

    /** Create a DRAFT. Nothing changes for anyone: the plan keeps selling and no item exists until {@link #start}. */
    @Transactional
    public RetirementDTO create(CreateRequest req) {
        if (req == null) throw CatalogException.unprocessable("INVALID_VALUE", "A retirement needs a body.");
        String why = reason(req.reason(), "Creating a retirement");
        String kind = req.kind() == null ? "" : req.kind().trim().toUpperCase(Locale.ROOT);
        PlanRetirement r = new PlanRetirement();
        r.setKind(kind);
        switch (kind) {
            case PlanRetirement.KIND_PLAN -> scopePlan(r, req);
            case PlanRetirement.KIND_ADDON -> scopeAddon(r, req);
            case PlanRetirement.KIND_PRICE -> throw CatalogException.unprocessable("KIND_NOT_SUPPORTED", "Retiring a price is not built yet: publish a new price version instead.", Map.of("kind", kind));
            default -> throw CatalogException.unprocessable("INVALID_VALUE", "kind must be PLAN or ADDON.", Map.of("field", "kind"));
        }
        r.setMode(mode(req.mode()));
        r.setDefaultOutcome(outcome(req.defaultOutcome() == null ? settings.getString(BillingSettingKeys.RETIREMENT_DEFAULT_OUTCOME) : req.defaultOutcome()));
        r.setNoticeScheduleJson(write(schedule(req.noticeScheduleDays() == null ? defaultSchedule() : req.noticeScheduleDays())));
        r.setMinNoticeDays(minNotice(req.minNoticeDays() == null ? settings.getInt(BillingSettingKeys.RETIREMENT_MIN_NOTICE_DAYS) : req.minNoticeDays()));
        r.setChannelsJson(write(channels(req.channels() == null ? defaultChannels() : req.channels())));
        r.setMessageMd(message(req.messageMd()));
        r.setReason(why);
        r.setStatus(PlanRetirement.DRAFT);
        r.setCreatedAt(now());
        r.setCreatedBy(actor());
        r = retirements.saveAndFlush(r);
        if (req.successors() != null && !req.successors().isEmpty()) writeSuccessors(r, req.successors());
        audit.record(PLAN_RETIREMENT_CREATED, AdminAuditService.TARGET_CATALOG, target(r), why, "risk=HIGH kind=" + r.getKind() + " outcome=" + r.getDefaultOutcome());
        changes.record(ENTITY_RETIREMENT, String.valueOf(r.getId()), null, Map.of("kind", r.getKind(), "status", r.getStatus(), "scope", scopeLabel(r)), why);
        return dto(r);
    }

    @Transactional(readOnly = true)
    public RetirementDTO get(long id) {
        return dto(load(id));
    }

    @Transactional(readOnly = true)
    public RetirementPage list(String status, int page, int size) {
        int sz = Math.max(1, Math.min(size, 100));
        int pg = Math.max(0, page);
        var p = status == null || status.isBlank()
            ? retirements.findAllByOrderByIdDesc(PageRequest.of(pg, sz))
            : retirements.findByStatusOrderByIdDesc(status.trim().toUpperCase(Locale.ROOT), PageRequest.of(pg, sz));
        return new RetirementPage(p.getContent().stream().map(this::dto).toList(), p.getTotalElements(), pg, sz);
    }

    /** Edit a DRAFT (mode, outcome, notice schedule, minimum notice, channels, message). 409 NOT_DRAFT once it has started. */
    @Transactional
    public RetirementDTO update(long id, UpdateRequest req) {
        PlanRetirement r = load(id);
        requireDraft(r);
        if (req == null) return dto(r);
        String why = reason(req.reason(), "Editing a retirement");
        if (req.mode() != null) r.setMode(mode(req.mode()));
        if (req.defaultOutcome() != null) r.setDefaultOutcome(outcome(req.defaultOutcome()));
        if (req.noticeScheduleDays() != null) r.setNoticeScheduleJson(write(schedule(req.noticeScheduleDays())));
        if (req.minNoticeDays() != null) r.setMinNoticeDays(minNotice(req.minNoticeDays()));
        if (req.channels() != null) r.setChannelsJson(write(channels(req.channels())));
        if (req.messageMd() != null) r.setMessageMd(message(req.messageMd()));
        retirements.saveAndFlush(r);
        audit.record(PLAN_RETIREMENT_UPDATED, AdminAuditService.TARGET_CATALOG, target(r), why, "risk=HIGH");
        changes.record(ENTITY_RETIREMENT, String.valueOf(r.getId()), null, Map.of("edited", true), why);
        return dto(r);
    }

    /** Replace the ranked successors. Allowed while DRAFT, NOTICING or COMPLETING (the ranking can be corrected mid-flight; suggestions are recomputed nightly). */
    @Transactional
    public RetirementDTO replaceSuccessors(long id, List<SuccessorRequest> list, String reasonText) {
        PlanRetirement r = load(id);
        if (PlanRetirement.COMPLETED.equals(r.getStatus()) || PlanRetirement.CANCELLED.equals(r.getStatus())) {
            throw CatalogException.conflict("RETIREMENT_CLOSED", "Retirement " + id + " is " + r.getStatus() + ".", Map.of("status", r.getStatus()));
        }
        String why = reason(reasonText, "Ranking successors");
        writeSuccessors(r, list == null ? List.of() : list);
        audit.record(PLAN_RETIREMENT_SUCCESSORS, AdminAuditService.TARGET_CATALOG, target(r), why, "risk=HIGH count=" + (list == null ? 0 : list.size()));
        return dto(r);
    }

    // ---- start --------------------------------------------------------------------------------------------------------------------

    /**
     * Start: the plan/version/add-on becomes RETIRING (no new buyers: quotes answer 410 PLAN_RETIRING), every affected subscription gets an item with its effective
     * date, and the impact is snapshotted. A retirement with no subscribers completes at once with no notices; KEEP_INDEFINITELY only hides the plan from new buyers.
     */
    @Transactional
    public RetirementDTO start(long id, StartRequest req) {
        PlanRetirement r = load(id);
        requireDraft(r);
        String why = reason(req == null ? null : req.reason(), "Starting a retirement");
        String expected = r.getFeatureKey() != null ? r.getFeatureKey() : plans.findById(r.getPlanId()).map(Plan::getPlanKey).orElse("");
        if (req == null || req.confirmKey() == null || !req.confirmKey().trim().equalsIgnoreCase(expected)) {
            throw new CatalogException(412, "CONFIRM_MISMATCH", "Type the key (" + expected + ") to confirm the retirement.", Map.of("expected", expected));
        }
        Instant now = now();
        boolean keep = PlanRetirement.MODE_KEEP_INDEFINITELY.equals(r.getMode());
        if (!keep && !PlanRetirement.OUTCOME_MIGRATE.equals(r.getDefaultOutcome())) requireFreeVersion();
        if (PlanRetirement.OUTCOME_MIGRATE.equals(r.getDefaultOutcome()) && successors.findByRetirementIdOrderByRankNoAsc(r.getId()).isEmpty()) {
            throw CatalogException.unprocessable("SUCCESSOR_REQUIRED", "Migrating at renewal needs at least one ranked successor.", Map.of("field", "successors"));
        }
        for (PlanRetirement other : openOthers(r)) {
            throw CatalogException.conflict("RETIREMENT_EXISTS", "Retirement " + other.getId() + " is already " + other.getStatus() + " for this scope.", Map.of("retirementId", other.getId(), "status", other.getStatus()));
        }
        startGuards(r);
        linker.link(); // rows the webhook wrote since the last hourly link must carry their plan version before we count them

        // priced and checked BEFORE anything changes: a refusal leaves the plan selling and every row untouched
        List<PlanRetirementItem> built = keep ? List.of() : buildItems(r, now);
        if (PlanRetirement.OUTCOME_MIGRATE.equals(r.getDefaultOutcome()) && !keep) requireNoPriceIncrease(r, built, now);

        r.setStartedAt(now);
        r.setStartedBy(actor());
        r.setReason(why);
        flipToRetiring(r, now);
        for (PlanRetirementItem i : built) itemRepo.save(i);
        itemRepo.flush();
        r.setImpactJson(write(impactOf(built)));
        if (keep) {
            r.setStatus(PlanRetirement.COMPLETED);
            r.setCompletedAt(now);
        } else if (built.stream().allMatch(i -> PlanRetirementItem.EXCLUDED.equals(i.getStatus()))) {
            r.setStatus(PlanRetirement.NOTICING);
            retirements.saveAndFlush(r);
            finish(r, why, now);
        } else {
            r.setStatus(PlanRetirement.NOTICING);
        }
        retirements.saveAndFlush(r);
        audit.record(PLAN_RETIREMENT_STARTED, AdminAuditService.TARGET_CATALOG, target(r), why, "risk=HIGH kind=" + r.getKind() + " items=" + built.size() + " mode=" + r.getMode() + " outcome=" + r.getDefaultOutcome());
        changes.record(ENTITY_RETIREMENT, String.valueOf(r.getId()), Map.of("status", PlanRetirement.DRAFT), Map.of("status", r.getStatus(), "items", built.size()), why);
        return dto(r);
    }

    // ---- cancel / complete --------------------------------------------------------------------------------------------------------

    /**
     * Cancel while no subscriber has acted: the plan sells again and the items are closed. {@code 409 RETIREMENT_IN_PROGRESS} once any subscriber switched, was
     * moved or cancelled by their own choice (a switch is a confirmed quote and is never undone by us). A DRAFT cancels at any time.
     */
    @Transactional
    public RetirementDTO cancel(long id, CancelRequest req) {
        PlanRetirement r = load(id);
        String why = reason(req == null ? null : req.reason(), "Cancelling a retirement");
        String status = r.getStatus();
        boolean keptOpen = PlanRetirement.COMPLETED.equals(status) && PlanRetirement.MODE_KEEP_INDEFINITELY.equals(r.getMode());
        if (!PlanRetirement.DRAFT.equals(status) && !r.isLive() && !keptOpen) {
            throw CatalogException.conflict("RETIREMENT_CLOSED", "Retirement " + id + " is " + status + ".", Map.of("status", status));
        }
        String expected = r.getFeatureKey() != null ? r.getFeatureKey() : plans.findById(r.getPlanId()).map(Plan::getPlanKey).orElse("");
        if (!PlanRetirement.DRAFT.equals(status) && (req == null || req.confirmKey() == null || !req.confirmKey().trim().equalsIgnoreCase(expected))) {
            throw new CatalogException(412, "CONFIRM_MISMATCH", "Type the key (" + expected + ") to confirm the cancellation.", Map.of("expected", expected));
        }
        Instant now = now();
        if (r.isLive()) {
            long acted = itemRepo.findByRetirementIdOrderByIdAsc(r.getId()).stream().filter(RetirementService::acted).count();
            if (acted > 0) {
                throw CatalogException.conflict("RETIREMENT_IN_PROGRESS", acted + " subscriber(s) already acted on this retirement: it can no longer be cancelled.", Map.of("acted", acted));
            }
        }
        if (!PlanRetirement.DRAFT.equals(status)) {
            restoreStatuses(r, now);
            for (PlanRetirementItem i : itemRepo.findByRetirementIdOrderByIdAsc(r.getId())) {
                if (i.getAppliedAt() == null && !PlanRetirementItem.EXCLUDED.equals(i.getStatus())) {
                    i.setStatus(PlanRetirementItem.EXCLUDED);
                    i.setNote("retirement cancelled");
                    itemRepo.save(i);
                }
            }
        }
        r.setStatus(PlanRetirement.CANCELLED);
        r.setCancelledAt(now);
        r.setCancelledBy(actor());
        retirements.saveAndFlush(r);
        audit.record(PLAN_RETIREMENT_CANCELLED, AdminAuditService.TARGET_CATALOG, target(r), why, "risk=HIGH from=" + status);
        changes.record(ENTITY_RETIREMENT, String.valueOf(r.getId()), Map.of("status", status), Map.of("status", PlanRetirement.CANCELLED), why);
        return dto(r);
    }

    /** Close a retirement whose subscribers have all been handled. {@code 409 ITEMS_PENDING} while anyone is undecided or not yet moved. */
    @Transactional
    public RetirementDTO complete(long id, CompleteRequest req) {
        PlanRetirement r = load(id);
        String why = reason(req == null ? null : req.reason(), "Completing a retirement");
        if (!r.isLive()) {
            throw CatalogException.conflict("RETIREMENT_STATE", "Retirement " + id + " is " + r.getStatus() + ": only a started retirement can be completed.", Map.of("status", r.getStatus()));
        }
        long open = itemRepo.countUnapplied(r.getId(), UNAPPLIED);
        if (open > 0) {
            throw CatalogException.conflict("ITEMS_PENDING", open + " subscriber(s) have not reached their date or have not been moved yet.", Map.of("pending", open));
        }
        finish(r, why, now());
        retirements.saveAndFlush(r);
        return dto(r);
    }

    /**
     * Complete a retirement by itself when nothing is left (the job's call). Returns whether it completed; a plan that is still referenced (a comp grant, a late
     * subscriber) keeps the retirement COMPLETING and is reported by the 409 the guard raises, which is logged and retried on the next run.
     */
    @Transactional
    public boolean completeIfDone(long id) {
        PlanRetirement r = load(id);
        if (!r.isLive() || itemRepo.countUnapplied(r.getId(), UNAPPLIED) > 0) return false;
        try {
            finish(r, "All subscribers have been handled (retirement " + id + ")", now());
            retirements.saveAndFlush(r);
            return true;
        } catch (CatalogException e) {
            LOG.warn("retirement {} cannot complete yet: {}", id, e.getCode());
            if (PlanRetirement.NOTICING.equals(r.getStatus())) {
                r.setStatus(PlanRetirement.COMPLETING);
                retirements.saveAndFlush(r);
            }
            return false;
        }
    }

    // ---- items / impact -----------------------------------------------------------------------------------------------------------

    @Transactional(readOnly = true)
    public ItemPage items(long id, String status, String interval, int page, int size) {
        load(id);
        int sz = Math.max(1, Math.min(size, 200));
        int pg = Math.max(0, page);
        var p = itemRepo.search(id, blankToNull(status == null ? null : status.toUpperCase(Locale.ROOT)), blankToNull(interval == null ? null : interval.toUpperCase(Locale.ROOT)), PageRequest.of(pg, sz));
        return new ItemPage(itemDtos(p.getContent()), p.getTotalElements(), pg, sz);
    }

    /** The impact of a DRAFT as it would be right now (nothing is written), or the stored snapshot of a started retirement. */
    @Transactional(readOnly = true)
    public ImpactDTO impact(long id) {
        PlanRetirement r = load(id);
        if (!PlanRetirement.DRAFT.equals(r.getStatus())) {
            List<PlanRetirementItem> all = itemRepo.findByRetirementIdOrderByIdAsc(r.getId());
            return impactOf(all);
        }
        return impactOf(buildItems(r, now()));
    }

    /** Items the retirement does not have yet (a subscriber who linked after it started): added with a date from today, so nobody is missed. Returns how many. */
    @Transactional
    public int addLateItems(long id) {
        PlanRetirement r = load(id);
        if (!r.isLive() || PlanRetirement.MODE_KEEP_INDEFINITELY.equals(r.getMode())) return 0;
        Set<Long> known = itemRepo.findByRetirementIdOrderByIdAsc(r.getId()).stream().map(PlanRetirementItem::getSubscriptionId).collect(Collectors.toSet());
        int n = 0;
        for (PlanRetirementItem i : buildItems(r, now())) {
            if (known.contains(i.getSubscriptionId())) continue;
            itemRepo.save(i);
            n++;
        }
        return n;
    }

    // ---- internals ----------------------------------------------------------------------------------------------------------------

    /**
     * 422 PRICE_INCREASE_REQUIRES_CONSENT (docs/subscriptions/11 section 7): moving people to a successor without their say-so is allowed only when nobody would pay more.
     * Every undecided subscriber is priced against the rank-1 successor exactly; one that would pay more, or cannot be priced at all, refuses the start. The open alternative
     * outcomes (decision S-21) never create a charge a subscriber did not ask for.
     */
    private void requireNoPriceIncrease(PlanRetirement r, List<PlanRetirementItem> items, Instant now) {
        long affected = 0;
        for (PlanRetirementItem i : items) {
            if (PlanRetirementItem.EXCLUDED.equals(i.getStatus()) || PlanRetirementItem.CANCELLED.equals(i.getStatus())) continue;
            Subscription s = subscriptions.findById(i.getSubscriptionId()).orElse(null);
            if (s == null) continue;
            try {
                SuccessorAdvisor.Evaluation ev = advisor.evaluate(r, s, now);
                if (ev.best() == null || ev.best().suggestion().deltaMinor() > 0) affected++;
            } catch (com.dossier.api.service.BillingException e) {
                affected++; // cannot be priced: never assumed to be free
            }
        }
        if (affected > 0) {
            throw CatalogException.unprocessable(
                "PRICE_INCREASE_REQUIRES_CONSENT",
                affected + " subscriber(s) would pay more, or cannot be priced, under the rank-1 successor: they can only be moved with their own confirmation.",
                Map.of("affected", affected)
            );
        }
    }

    /** Items for every personal subscription the retirement touches, with dates computed at {@code now}. Not saved. */
    List<PlanRetirementItem> buildItems(PlanRetirement r, Instant now) {
        List<Long> ids = affectedSubscriptionIds(r);
        List<PlanRetirementItem> out = new ArrayList<>();
        if (ids.isEmpty()) return out;
        int minNotice = r.getMinNoticeDays();
        for (Subscription s : subscriptions.findAllById(ids)) {
            User u = s.getUser();
            if (u == null || Constants.isEnterpriseLogin(u.getLogin())) continue; // O4: an enterprise account never has a personal plan
            PlanRetirementItem i = new PlanRetirementItem();
            i.setRetirementId(r.getId());
            i.setScope("PERSONAL");
            i.setUserId(u.getId());
            i.setSubscriptionId(s.getId());
            i.setBillingInterval(s.getBillingInterval() == null ? "MONTH" : s.getBillingInterval());
            i.setPreviousVersionId(s.getPlanVersionId());
            long recurring = money.recurringMinor(s, now);
            i.setMonthlyMinor(RetirementMoney.monthlyEquivalent(recurring, i.getBillingInterval()));
            boolean entitled = EntitlementService.isProFor(s.getStatus(), s.getCurrentPeriodEnd(), now);
            Instant at = dates.compute(RetirementEffectiveDateService.Facts.of(s), now, minNotice);
            i.setRetireEffectiveAt(at);
            i.setCreatedAt(now);
            if (!entitled) {
                // already on the Free set (lapsed or ended): nothing to take away; the plan link is released when the retirement completes
                i.setStatus(PlanRetirementItem.EXCLUDED);
                i.setNote("not entitled to a paid plan");
                i.setRetireEffectiveAt(now);
            } else if (RetirementEffectiveDateService.endsAtPeriodEnd(RetirementEffectiveDateService.Facts.of(s))) {
                i.setStatus(PlanRetirementItem.CANCELLED); // they already chose to stop: their period end stands, nothing is shortened
                i.setChoiceKind("CANCEL");
                i.setDecidedAt(now);
                i.setNote("already ending at the period end");
            }
            out.add(i);
        }
        return out;
    }

    private List<Long> affectedSubscriptionIds(PlanRetirement r) {
        if (PlanRetirement.KIND_ADDON.equals(r.getKind())) {
            return jdbc.queryForList("SELECT DISTINCT a.subscription_id FROM subscription_addon a WHERE a.feature_key = ? AND a.live = TRUE", Long.class, r.getFeatureKey());
        }
        if (r.getPlanVersionId() != null) {
            return jdbc.queryForList("SELECT s.id FROM subscription s WHERE s.plan_version_id = ?", Long.class, r.getPlanVersionId());
        }
        return jdbc.queryForList("SELECT s.id FROM subscription s JOIN plan_version v ON v.id = s.plan_version_id WHERE v.plan_id = ?", Long.class, r.getPlanId());
    }

    private static ImpactDTO impactOf(List<PlanRetirementItem> items) {
        Map<String, Integer> byInterval = new LinkedHashMap<>();
        Map<String, Integer> byStatus = new LinkedHashMap<>();
        long mrr = 0;
        Instant earliest = null;
        Instant latest = null;
        int n = 0;
        for (PlanRetirementItem i : items) {
            byStatus.merge(i.getStatus(), 1, Integer::sum);
            if (PlanRetirementItem.EXCLUDED.equals(i.getStatus())) continue;
            n++;
            byInterval.merge(i.getBillingInterval(), 1, Integer::sum);
            mrr += i.getMonthlyMinor() == null ? 0 : i.getMonthlyMinor();
            Instant at = i.getRetireEffectiveAt();
            if (earliest == null || at.isBefore(earliest)) earliest = at;
            if (latest == null || at.isAfter(latest)) latest = at;
        }
        return new ImpactDTO(n, byInterval, byStatus, mrr, earliest, latest);
    }

    /** True when the subscriber (not the system) has acted on the item: it cannot be undone by cancelling the retirement. */
    static boolean acted(PlanRetirementItem i) {
        return switch (i.getStatus()) {
            case PlanRetirementItem.SWITCHED_NOW, PlanRetirementItem.SWITCH_SCHEDULED, PlanRetirementItem.FELL_BACK, PlanRetirementItem.MIGRATED -> true;
            case PlanRetirementItem.CANCELLED -> i.getDecidedChangeId() != null || i.getAppliedAt() != null;
            default -> false;
        };
    }

    /** Make the thing being retired RETIRING and remember what it was. */
    private void flipToRetiring(PlanRetirement r, Instant now) {
        if (PlanRetirement.KIND_ADDON.equals(r.getKind())) {
            jdbc.update("UPDATE feature_definition SET lifecycle = 'RETIRING' WHERE feature_key = ?", r.getFeatureKey());
            return;
        }
        Plan plan = plans.findById(r.getPlanId()).orElseThrow(() -> CatalogException.notFound("plan", String.valueOf(r.getPlanId())));
        if (r.getPlanVersionId() != null) {
            PlanVersion v = versions.findById(r.getPlanVersionId()).orElseThrow(() -> CatalogException.notFound("plan version", String.valueOf(r.getPlanVersionId())));
            r.setVersionStatusBefore(v.getStatus());
            v.setStatus("RETIRING");
            v.setUpdatedAt(now.truncatedTo(ChronoUnit.MILLIS));
            versions.saveAndFlush(v);
            return;
        }
        r.setPlanStatusBefore(plan.getStatus());
        plan.setStatus("RETIRING");
        plan.setUpdatedAt(now.truncatedTo(ChronoUnit.MILLIS));
        plan.setUpdatedBy(actor());
        plans.saveAndFlush(plan);
        Optional<PlanVersion> live = versions.findLive(plan.getId());
        if (live.isPresent()) {
            PlanVersion v = live.get();
            r.setVersionStatusBefore(v.getStatus());
            v.setStatus("RETIRING"); // findLive is now empty: a stale checkout quote of this plan is refused as PLAN_CHANGED
            v.setUpdatedAt(now.truncatedTo(ChronoUnit.MILLIS));
            versions.saveAndFlush(v);
        }
    }

    /** Undo {@link #flipToRetiring} for a cancelled retirement. */
    private void restoreStatuses(PlanRetirement r, Instant now) {
        if (PlanRetirement.KIND_ADDON.equals(r.getKind())) {
            jdbc.update("UPDATE feature_definition SET lifecycle = 'ACTIVE' WHERE feature_key = ? AND lifecycle = 'RETIRING'", r.getFeatureKey());
            return;
        }
        if (r.getPlanVersionId() != null) {
            versions.findById(r.getPlanVersionId()).ifPresent(v -> {
                if ("RETIRING".equals(v.getStatus())) {
                    v.setStatus(r.getVersionStatusBefore() == null ? "SUPERSEDED" : r.getVersionStatusBefore());
                    v.setUpdatedAt(now.truncatedTo(ChronoUnit.MILLIS));
                    versions.saveAndFlush(v);
                }
            });
            return;
        }
        plans.findById(r.getPlanId()).ifPresent(p -> {
            for (PlanVersion v : versions.findByPlanIdOrderByVersionDesc(p.getId())) {
                if ("RETIRING".equals(v.getStatus())) {
                    v.setStatus(r.getVersionStatusBefore() == null ? "PUBLISHED" : r.getVersionStatusBefore());
                    v.setUpdatedAt(now.truncatedTo(ChronoUnit.MILLIS));
                    versions.saveAndFlush(v);
                }
            }
            if ("RETIRING".equals(p.getStatus())) {
                p.setStatus(r.getPlanStatusBefore() == null ? "PUBLISHED" : r.getPlanStatusBefore());
                p.setUpdatedAt(now.truncatedTo(ChronoUnit.MILLIS));
                p.setUpdatedBy(actor());
                plans.saveAndFlush(p);
            }
        });
    }

    /** The last step: nothing references what was being retired, so it reaches RETIRED for good. */
    private void finish(PlanRetirement r, String why, Instant now) {
        if (PlanRetirement.KIND_ADDON.equals(r.getKind())) {
            jdbc.update("UPDATE feature_definition SET lifecycle = 'RETIRED' WHERE feature_key = ?", r.getFeatureKey());
        } else {
            releaseLapsed(r);
            subscriptions.flush();
            Plan plan = plans.findById(r.getPlanId()).orElseThrow(() -> CatalogException.notFound("plan", String.valueOf(r.getPlanId())));
            if (r.getPlanVersionId() == null) guard.requireClear(plan); // checked here, not inside the lifecycle call, so a refusal never marks the transaction rollback-only
            if (r.getPlanVersionId() != null) {
                PlanVersion v = versions.findById(r.getPlanVersionId()).orElseThrow(() -> CatalogException.notFound("plan version", String.valueOf(r.getPlanVersionId())));
                lifecycle.archiveVersion(plan.getPlanKey(), v.getVersion(), why);
            } else {
                lifecycle.retire(plan.getPlanKey(), why);
            }
        }
        r.setStatus(PlanRetirement.COMPLETED);
        r.setCompletedAt(now);
        audit.record(PLAN_RETIREMENT_COMPLETED, AdminAuditService.TARGET_CATALOG, target(r), why, "risk=HIGH kind=" + r.getKind());
        changes.record(ENTITY_RETIREMENT, String.valueOf(r.getId()), Map.of("status", PlanRetirement.NOTICING), Map.of("status", PlanRetirement.COMPLETED), why);
    }

    /** A subscription that is no longer entitled to anything paid still points at the retiring version: point it at Free's, which changes nothing for the person. */
    private void releaseLapsed(PlanRetirement r) {
        Long freeVersion = freeVersionId();
        if (freeVersion == null) return;
        for (Long sid : affectedSubscriptionIds(r)) {
            subscriptions
                .findById(sid)
                .ifPresent(s -> {
                    if (EntitlementService.isProFor(s.getStatus(), s.getCurrentPeriodEnd(), now())) return; // still paying: it is the job's to move, never ours
                    s.setPlanVersionId(freeVersion);
                    s.setBillingInterval(null);
                    s.setUpdatedAt(now());
                    subscriptions.save(s);
                });
        }
    }

    private void startGuards(PlanRetirement r) {
        if (PlanRetirement.KIND_ADDON.equals(r.getKind())) return;
        Plan plan = plans.findById(r.getPlanId()).orElseThrow(() -> CatalogException.notFound("plan", String.valueOf(r.getPlanId())));
        if (r.getPlanVersionId() == null && versions.countDrafts(plan.getId()) > 0) {
            throw CatalogException.conflict("DRAFT_EXISTS", "Plan " + plan.getPlanKey() + " has a draft version: discard it first.", Map.of("planKey", plan.getPlanKey()));
        }
    }

    private List<PlanRetirement> openOthers(PlanRetirement r) {
        List<PlanRetirement> out = new ArrayList<>();
        if (PlanRetirement.KIND_ADDON.equals(r.getKind())) {
            for (PlanRetirement o : retirements.findLiveByFeatureKey(r.getFeatureKey())) if (!o.getId().equals(r.getId())) out.add(o);
            return out;
        }
        for (PlanRetirement o : retirements.findLiveByPlanId(r.getPlanId())) {
            if (o.getId().equals(r.getId())) continue;
            boolean sameScope = o.getPlanVersionId() == null || r.getPlanVersionId() == null || o.getPlanVersionId().equals(r.getPlanVersionId());
            if (sameScope) out.add(o);
        }
        return out;
    }

    private void scopePlan(PlanRetirement r, CreateRequest req) {
        String key = req.planKey() == null ? "" : req.planKey().trim().toUpperCase(Locale.ROOT);
        Plan plan = plans.findByPlanKey(key).orElseThrow(() -> CatalogException.notFound("plan", String.valueOf(req.planKey())));
        if ("FREE".equals(plan.getPlanKey())) {
            throw CatalogException.unprocessable("FREE_PLAN_PROTECTED", "The Free plan is where retired subscribers land: it cannot be retired.", Map.of("planKey", plan.getPlanKey()));
        }
        if (!"INDIVIDUAL".equals(plan.getAudience())) {
            throw CatalogException.unprocessable("AUDIENCE_NOT_SUPPORTED", "Retiring an organization plan waits for the enterprise plan layer (K10.7).", Map.of("audience", plan.getAudience()));
        }
        r.setPlanId(plan.getId());
        r.setAudience(plan.getAudience());
        if (req.version() != null) {
            PlanVersion v = versions.findByPlanIdAndVersion(plan.getId(), req.version()).orElseThrow(() -> CatalogException.notFound("plan version", plan.getPlanKey() + " v" + req.version()));
            if (!"SUPERSEDED".equals(v.getStatus())) {
                throw CatalogException.unprocessable("VERSION_STATE", "Version " + v.getVersion() + " is " + v.getStatus() + ": only a SUPERSEDED version is retired on its own (retire the plan to retire the live one).", Map.of("status", v.getStatus()));
            }
            r.setPlanVersionId(v.getId());
        } else if (!"PUBLISHED".equals(plan.getStatus())) {
            boolean kept = "RETIRING".equals(plan.getStatus()) && retirements.findLiveByPlanId(plan.getId()).isEmpty();
            if (!kept) {
                throw CatalogException.conflict("PLAN_STATE", "Plan " + plan.getPlanKey() + " is " + plan.getStatus() + ": only a PUBLISHED plan can be retired.", Map.of("status", plan.getStatus()));
            }
        }
        for (PlanRetirement o : retirements.findOpenByPlanId(plan.getId())) {
            boolean sameScope = o.getPlanVersionId() == null || r.getPlanVersionId() == null || o.getPlanVersionId().equals(r.getPlanVersionId());
            if (sameScope) throw CatalogException.conflict("RETIREMENT_EXISTS", "Retirement " + o.getId() + " is already " + o.getStatus() + " for this scope.", Map.of("retirementId", o.getId(), "status", o.getStatus()));
        }
    }

    private void scopeAddon(PlanRetirement r, CreateRequest req) {
        String key = req.featureKey() == null ? "" : req.featureKey().trim();
        List<String> rows = jdbc.queryForList("SELECT lifecycle FROM feature_definition WHERE feature_key = ?", String.class, key);
        if (rows.isEmpty()) throw CatalogException.notFound("service", key);
        if (!"ACTIVE".equals(rows.get(0))) {
            throw CatalogException.conflict("SERVICE_STATE", "Service " + key + " is " + rows.get(0) + ".", Map.of("lifecycle", rows.get(0)));
        }
        List<String> audience = jdbc.queryForList("SELECT audience FROM feature_definition WHERE feature_key = ?", String.class, key);
        if (!audience.isEmpty() && "ORG".equals(audience.get(0))) {
            throw CatalogException.unprocessable("AUDIENCE_NOT_SUPPORTED", "Retiring an organization add-on waits for the enterprise plan layer (K10.7).", Map.of("audience", "ORG"));
        }
        r.setFeatureKey(key);
        r.setAudience("INDIVIDUAL");
        for (PlanRetirement o : retirements.findLiveByFeatureKey(key)) {
            throw CatalogException.conflict("RETIREMENT_EXISTS", "Retirement " + o.getId() + " is already " + o.getStatus() + " for this service.", Map.of("retirementId", o.getId(), "status", o.getStatus()));
        }
    }

    private void writeSuccessors(PlanRetirement r, List<SuccessorRequest> list) {
        if (list.size() > MAX_SUCCESSORS) throw CatalogException.unprocessable("INVALID_VALUE", "At most " + MAX_SUCCESSORS + " successors.", Map.of("field", "successors"));
        List<PlanRetirementSuccessor> rows = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        Set<Integer> ranks = new HashSet<>();
        int pos = 0;
        for (SuccessorRequest s : list) {
            pos++;
            if (s == null) continue;
            PlanRetirementSuccessor row = new PlanRetirementSuccessor();
            row.setRetirementId(r.getId());
            int rank = s.rank() == null ? pos : s.rank();
            if (rank < 1 || !ranks.add(rank)) throw CatalogException.unprocessable("INVALID_VALUE", "Successor ranks start at 1 and must be distinct.", Map.of("field", "successors.rank"));
            row.setRankNo(rank);
            row.setNote(s.note() == null || s.note().isBlank() ? null : s.note().trim().length() > 200 ? s.note().trim().substring(0, 200) : s.note().trim());
            if (PlanRetirement.KIND_ADDON.equals(r.getKind())) {
                String fk = s.featureKey() == null ? "" : s.featureKey().trim();
                Integer n = jdbc.queryForObject("SELECT COUNT(*) FROM feature_definition WHERE feature_key = ? AND lifecycle = 'ACTIVE'", Integer.class, fk);
                if (n == null || n == 0 || fk.equals(r.getFeatureKey())) {
                    throw CatalogException.unprocessable("SUCCESSOR_NOT_SELLABLE", "Service " + fk + " cannot replace " + r.getFeatureKey() + ".", Map.of("featureKey", fk));
                }
                if (!seen.add(fk)) throw CatalogException.unprocessable("INVALID_VALUE", "A successor is listed twice.", Map.of("featureKey", fk));
                row.setSuccessorFeatureKey(fk);
            } else {
                String pk = s.planKey() == null ? "" : s.planKey().trim().toUpperCase(Locale.ROOT);
                Plan p = plans.findByPlanKey(pk).orElseThrow(() -> CatalogException.unprocessable("SUCCESSOR_NOT_SELLABLE", "Plan " + pk + " does not exist.", Map.of("planKey", pk)));
                if (p.getId().equals(r.getPlanId()) || !"INDIVIDUAL".equals(p.getAudience()) || !"PUBLISHED".equals(p.getStatus())) {
                    throw CatalogException.unprocessable("SUCCESSOR_NOT_SELLABLE", "Plan " + pk + " cannot replace this plan (it must be a different, PUBLISHED individual plan).", Map.of("planKey", pk));
                }
                if (!seen.add(pk)) throw CatalogException.unprocessable("INVALID_VALUE", "A successor is listed twice.", Map.of("planKey", pk));
                row.setSuccessorPlanKey(pk);
            }
            rows.add(row);
        }
        successors.deleteAllByRetirementId(r.getId());
        successors.flush();
        rows.sort(Comparator.comparing(PlanRetirementSuccessor::getRankNo));
        successors.saveAll(rows);
        successors.flush();
    }

    private PlanRetirement load(long id) {
        return retirements.findById(id).orElseThrow(() -> CatalogException.notFound("retirement", String.valueOf(id)));
    }

    private static void requireDraft(PlanRetirement r) {
        if (!PlanRetirement.DRAFT.equals(r.getStatus())) {
            throw CatalogException.conflict("NOT_DRAFT", "Retirement " + r.getId() + " is " + r.getStatus() + ": only a DRAFT can be started or edited.", Map.of("status", r.getStatus()));
        }
    }

    private void requireFreeVersion() {
        if (freeVersionId() == null) {
            throw CatalogException.conflict("FREE_PLAN_MISSING", "There is no live Free plan version for subscribers to fall back to.", Map.of("planKey", "FREE"));
        }
    }

    /** The live PUBLISHED version of the FREE plan, or null. */
    Long freeVersionId() {
        return plans.findByPlanKey("FREE").flatMap(p -> versions.findLive(p.getId())).map(PlanVersion::getId).orElse(null);
    }

    // ---- validation ---------------------------------------------------------------------------------------------------------------

    private static String reason(String reason, String what) {
        if (reason == null || reason.trim().length() < REASON_MIN_LENGTH) {
            throw CatalogException.unprocessable("REASON_REQUIRED", what + " needs a reason of at least " + REASON_MIN_LENGTH + " characters.", Map.of("minLength", REASON_MIN_LENGTH));
        }
        String t = reason.trim();
        return t.length() > 500 ? t.substring(0, 500) : t;
    }

    private static String mode(String m) {
        String v = m == null || m.isBlank() ? PlanRetirement.MODE_RETIRE_AT_RENEWAL : m.trim().toUpperCase(Locale.ROOT);
        if (!PlanRetirement.MODE_RETIRE_AT_RENEWAL.equals(v) && !PlanRetirement.MODE_KEEP_INDEFINITELY.equals(v)) {
            throw CatalogException.unprocessable("INVALID_VALUE", "mode must be RETIRE_AT_RENEWAL or KEEP_INDEFINITELY.", Map.of("field", "mode"));
        }
        return v;
    }

    private static String outcome(String o) {
        String v = o == null ? "" : o.trim().toUpperCase(Locale.ROOT);
        if (!PlanRetirement.OUTCOME_FREE.equals(v) && !PlanRetirement.OUTCOME_MIGRATE.equals(v) && !PlanRetirement.OUTCOME_CANCEL.equals(v)) {
            throw CatalogException.unprocessable("INVALID_VALUE", "defaultOutcome must be FREE, MIGRATE_AT_RENEWAL or CANCEL.", Map.of("field", "defaultOutcome"));
        }
        return v;
    }

    private static List<Integer> schedule(List<Integer> days) {
        if (days == null || days.isEmpty() || days.size() > 12) throw CatalogException.unprocessable("INVALID_VALUE", "The notice schedule is 1 to 12 distinct days from 1 to 365.", Map.of("field", "noticeScheduleDays"));
        Set<Integer> seen = new HashSet<>();
        for (Integer d : days) {
            if (d == null || d < 1 || d > 365 || !seen.add(d)) throw CatalogException.unprocessable("INVALID_VALUE", "The notice schedule is 1 to 12 distinct days from 1 to 365.", Map.of("field", "noticeScheduleDays"));
        }
        return days.stream().sorted(Comparator.reverseOrder()).toList();
    }

    private static int minNotice(int days) {
        int hard = BillingSettingKeys.RETIREMENT_MIN_NOTICE_HARD_MIN_DAYS;
        if (days < hard || days > 365) {
            throw CatalogException.unprocessable("MIN_NOTICE_TOO_SHORT", "The minimum notice is at least " + hard + " days (the legal floor for a price change).", Map.of("min", hard, "field", "minNoticeDays"));
        }
        return days;
    }

    private static List<String> channels(List<String> list) {
        if (list == null || list.isEmpty() || list.size() > 2) throw CatalogException.unprocessable("INVALID_VALUE", "channels is EMAIL and/or IN_APP.", Map.of("field", "channels"));
        List<String> out = new ArrayList<>();
        for (String c : list) {
            String v = c == null ? "" : c.trim().toUpperCase(Locale.ROOT);
            if ((!v.equals("EMAIL") && !v.equals("IN_APP")) || out.contains(v)) throw CatalogException.unprocessable("INVALID_VALUE", "channels is EMAIL and/or IN_APP.", Map.of("field", "channels"));
            out.add(v);
        }
        return out;
    }

    private static String message(String m) {
        if (m == null || m.isBlank()) return null;
        String t = m.trim();
        if (t.length() > 2000) throw CatalogException.unprocessable("INVALID_VALUE", "The message is at most 2000 characters.", Map.of("field", "messageMd"));
        return t;
    }

    private List<Integer> defaultSchedule() {
        return List.of(settings.getJson(BillingSettingKeys.RETIREMENT_NOTICE_SCHEDULE_DAYS, Integer[].class));
    }

    private List<String> defaultChannels() {
        return List.of(settings.getJson(BillingSettingKeys.RETIREMENT_CHANNELS, String[].class));
    }

    // ---- mapping ------------------------------------------------------------------------------------------------------------------

    RetirementDTO dto(PlanRetirement r) {
        Plan plan = r.getPlanId() == null ? null : plans.findById(r.getPlanId()).orElse(null);
        Integer version = r.getPlanVersionId() == null ? null : versions.findById(r.getPlanVersionId()).map(PlanVersion::getVersion).orElse(null);
        List<SuccessorDTO> succ = new ArrayList<>();
        for (PlanRetirementSuccessor s : successors.findByRetirementIdOrderByRankNoAsc(r.getId())) {
            String name = s.getSuccessorPlanKey() == null ? null : plans.findByPlanKey(s.getSuccessorPlanKey()).map(Plan::getName).orElse(null);
            succ.add(new SuccessorDTO(s.getSuccessorPlanKey(), name, s.getSuccessorFeatureKey(), s.getRankNo(), s.getNote()));
        }
        Map<String, Long> counts = new LinkedHashMap<>();
        jdbc.query("SELECT status, COUNT(*) AS n FROM plan_retirement_item WHERE retirement_id = ? GROUP BY status ORDER BY status", rs -> {
            counts.put(rs.getString("status"), rs.getLong("n"));
        }, r.getId());
        ImpactDTO impact = null;
        if (r.getImpactJson() != null) {
            try {
                impact = json.readValue(r.getImpactJson(), ImpactDTO.class);
            } catch (JsonProcessingException e) {
                LOG.warn("retirement {} has an unreadable impact snapshot", r.getId());
            }
        }
        return new RetirementDTO(
            r.getId(),
            r.getKind(),
            plan == null ? null : plan.getPlanKey(),
            plan == null ? null : plan.getName(),
            version,
            r.getFeatureKey(),
            r.getAudience(),
            r.getStatus(),
            r.getMode(),
            r.getDefaultOutcome(),
            readInts(r.getNoticeScheduleJson()),
            r.getMinNoticeDays(),
            readStrings(r.getChannelsJson()),
            r.getMessageMd(),
            r.getReason(),
            succ,
            counts,
            impact,
            r.getStartedAt(),
            r.getStartedBy(),
            r.getCancelledAt(),
            r.getCompletedAt(),
            r.getCreatedAt(),
            r.getCreatedBy()
        );
    }

    List<ItemDTO> itemDtos(List<PlanRetirementItem> items) {
        Map<Long, String> logins = new LinkedHashMap<>();
        for (User u : users.findAllById(items.stream().map(PlanRetirementItem::getUserId).filter(java.util.Objects::nonNull).collect(Collectors.toSet()))) logins.put(u.getId(), u.getLogin());
        List<ItemDTO> out = new ArrayList<>();
        for (PlanRetirementItem i : items) out.add(itemDto(i, logins.get(i.getUserId())));
        return out;
    }

    ItemDTO itemDto(PlanRetirementItem i, String login) {
        JsonNode suggestion = null;
        if (i.getSuggestionJson() != null) {
            try {
                suggestion = json.readTree(i.getSuggestionJson());
            } catch (JsonProcessingException e) {
                LOG.warn("item {} has an unreadable suggestion", i.getId());
            }
        }
        return new ItemDTO(
            i.getId(), i.getRetirementId(), login, i.getSubscriptionId(), i.getBillingInterval(), i.getRetireEffectiveAt(), i.getStatus(), i.getChoiceKind(),
            i.getMonthlyMinor() == null ? 0 : i.getMonthlyMinor(), suggestion, i.getSuggestedQuoteId(), i.getLastNoticeDays(), i.getDecidedAt(), i.getAppliedAt(), i.getNote()
        );
    }

    private List<Integer> readInts(String raw) {
        try {
            return List.of(json.readValue(raw, Integer[].class));
        } catch (JsonProcessingException | RuntimeException e) {
            return List.of();
        }
    }

    private List<String> readStrings(String raw) {
        try {
            return List.of(json.readValue(raw, String[].class));
        } catch (JsonProcessingException | RuntimeException e) {
            return List.of();
        }
    }

    private String write(Object o) {
        try {
            return json.writeValueAsString(o);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
    }

    private String target(PlanRetirement r) {
        return "retirement:" + r.getId() + ":" + scopeLabel(r);
    }

    private String scopeLabel(PlanRetirement r) {
        if (r.getFeatureKey() != null) return "service:" + r.getFeatureKey();
        String key = plans.findById(r.getPlanId()).map(Plan::getPlanKey).orElse("?");
        return r.getPlanVersionId() == null ? "plan:" + key : "plan:" + key + ":v" + versions.findById(r.getPlanVersionId()).map(PlanVersion::getVersion).orElse(0);
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s;
    }

    private static String actor() {
        return SecurityUtils.getCurrentUserLogin().orElse("system");
    }

    private static Instant now() {
        return Instant.now().truncatedTo(ChronoUnit.MILLIS);
    }
}
