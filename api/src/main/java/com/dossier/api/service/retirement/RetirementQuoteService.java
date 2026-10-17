package com.dossier.api.service.retirement;

import com.dossier.api.domain.Subscription;
import com.dossier.api.domain.catalog.PlanRetirementItem;
import com.dossier.api.domain.sub.SubscriptionQuote;
import com.dossier.api.repository.sub.CatalogPublishRepository;
import com.dossier.api.repository.sub.SubscriptionQuoteRepository;
import com.dossier.api.service.BillingException;
import com.dossier.api.service.billing.personal.PersonalBasket;
import com.dossier.api.service.billing.personal.PersonalQuoteService;
import com.dossier.api.service.dto.PlanQuoteDTO;
import com.dossier.api.service.dto.PlanQuoteDTO.Basket;
import com.dossier.api.service.dto.PlanQuoteDTO.PlanRef;
import com.dossier.api.service.dto.PlanQuoteDTO.QuoteLine;
import com.dossier.api.service.pricing.PricingInputs;
import com.dossier.api.service.pricing.PricingResult.LineResult;
import com.dossier.api.service.retirement.SuccessorAdvisor.Scored;
import com.dossier.api.repository.sub.PriceLookupRepository;
import com.dossier.api.domain.catalog.ProductPrice;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The RETIREMENT_SWITCH quote (docs/subscriptions/11 sections 5.2 and 6; story K10.2): a real {@code subscription_quote} for one subscriber and one successor, so the
 * page shows exactly what My plan shows and a confirmed choice applies exactly these numbers. It has no expiry until the subscriber's effective date and is re-created
 * (the old one SUPERSEDED) when the prices, the subscription or the catalog moved. It is stored in the same shape as a personal quote ({@code lines_json} holds
 * {@link PersonalQuoteService.Stored}), so {@code GET /api/billing/quotes/{id}} reads it too; it is stored with kind {@value SuccessorAdvisor#QUOTE_KIND} because the column holds 12
 * characters, and the DTO says {@value SuccessorAdvisor#DTO_KIND}. Checkout and the add-on confirm refuse it (they only accept CHECKOUT and CHANGE); only the retirement
 * choice service applies it.
 */
@Service
public class RetirementQuoteService {

    private static final Logger LOG = LoggerFactory.getLogger(RetirementQuoteService.class);
    public static final String SUPERSEDED = "SUPERSEDED";

    private final SubscriptionQuoteRepository quotes;
    private final CatalogPublishRepository catalogVersions;
    private final PersonalBasket basket;
    private final PriceLookupRepository priceLookup;
    private final com.dossier.api.repository.sub.ProductPriceRepository productPrices;
    private final RetirementMoney money;
    private final ObjectMapper json;
    private final org.springframework.jdbc.core.JdbcTemplate jdbc;
    private final SubscriptionOwners owners;

    public RetirementQuoteService(
        SubscriptionQuoteRepository quotes,
        CatalogPublishRepository catalogVersions,
        PersonalBasket basket,
        PriceLookupRepository priceLookup,
        com.dossier.api.repository.sub.ProductPriceRepository productPrices,
        RetirementMoney money,
        ObjectMapper json,
        org.springframework.jdbc.core.JdbcTemplate jdbc,
        SubscriptionOwners owners
    ) {
        this.owners = owners;
        this.jdbc = jdbc;
        this.quotes = quotes;
        this.catalogVersions = catalogVersions;
        this.basket = basket;
        this.priceLookup = priceLookup;
        this.productPrices = productPrices;
        this.money = money;
        this.json = json;
    }

    /**
     * Store the quote for {@code scored} (a PLAN candidate with a price) and return its id. When {@code previousQuoteId} names an OPEN quote with the same inputs hash that
     * quote is kept (its id stays stable for the subscriber's page); otherwise it is SUPERSEDED and a new one is written.
     */
    @Transactional
    public Long persist(Subscription sub, Instant effectiveAt, Scored scored, Long previousQuoteId, Instant now) {
        if (scored == null || scored.priced() == null || scored.version() == null) return null;
        Long userId = owners.of(sub).userId();
        PlanQuoteDTO dto = dto(sub, scored, effectiveAt, now);
        String stateHash = sha256("RETIREMENT|" + sub.getId() + "|" + (sub.getCurrentPeriodEnd() == null ? "-" : sub.getCurrentPeriodEnd().getEpochSecond()) + "|" + sub.getPlanVersionId());
        StringBuilder price = new StringBuilder();
        price.append(scored.version().getId()).append('|').append(dto.interval()).append('|').append(dto.currency());
        scored.priced().group(PricingInputs.PLAN_GROUP).lines().stream().sorted(Comparator.comparing(LineResult::lineKey)).forEach(l ->
            price.append('|').append(l.lineKey()).append(':').append(l.quantity()).append(':').append(l.priceId()).append(':').append(l.unitEffectiveMinor())
        );
        price.append("|cur:").append(dto.current().recurringMinor());
        String hash = sha256(stateHash + "|" + sha256(price.toString()));
        if (previousQuoteId != null) {
            SubscriptionQuote prev = quotes.findById(previousQuoteId).orElse(null);
            if (prev != null && "OPEN".equals(prev.getStatus()) && hash.equals(prev.getInputsHash())) return prev.getId();
            if (prev != null && "OPEN".equals(prev.getStatus())) {
                prev.setStatus(SUPERSEDED);
                quotes.save(prev);
            }
        }
        // the same basket for the same person that is still open is the same quote (a page asked twice, a PICK repeated)
        List<Long> same = jdbc.queryForList(
            "SELECT id FROM subscription_quote WHERE user_id = ? AND kind = ? AND inputs_hash = ? AND status = 'OPEN' AND expires_at > ? ORDER BY id DESC LIMIT 1",
            Long.class,
            userId,
            SuccessorAdvisor.QUOTE_KIND,
            hash,
            java.sql.Timestamp.from(now)
        );
        if (!same.isEmpty()) return same.get(0);
        PersonalQuoteService.Meta meta = new PersonalQuoteService.Meta(
            scored.plan().getPlanKey(), dto.interval(), new LinkedHashMap<>(scored.addons()), List.of(), stateHash, sha256(price.toString()), currentQty(sub, now), null, null, null, null
        );
        SubscriptionQuote q = new SubscriptionQuote();
        q.setUserId(userId);
        q.setSubscriptionId(sub.getId());
        q.setKind(SuccessorAdvisor.QUOTE_KIND);
        q.setPlanVersionId(scored.version().getId());
        q.setBillingInterval(dto.interval());
        q.setCurrency(dto.currency());
        q.setCatalogVersion(catalogVersions.currentVersion());
        q.setInputsHash(hash);
        q.setLinesJson(write(new PersonalQuoteService.Stored(dto, meta)));
        q.setCurrentRecurringMinor(dto.current().recurringMinor());
        q.setProposedRecurringMinor(dto.proposed().recurringMinor());
        q.setDeltaMinor(dto.deltaMinor());
        q.setMonthlyEquivalentMinor(dto.proposed().monthlyEquivalentMinor() == null ? dto.proposed().recurringMinor() : dto.proposed().monthlyEquivalentMinor());
        q.setSavingsMinor(dto.proposed().savingsMinor() == null ? 0L : dto.proposed().savingsMinor());
        q.setProrationEstimateMinor(dto.prorationEstimateMinor());
        q.setNextInvoiceEstimateMinor(dto.nextInvoiceEstimateMinor());
        q.setTaxSource("NONE");
        q.setEffectiveAt(effectiveAt);
        q.setPeriodEndAt(sub.getCurrentPeriodEnd());
        q.setExpiresAt(effectiveAt.plus(1, ChronoUnit.DAYS)); // no expiry until the effective date
        q.setStatus("OPEN");
        q.setWarningsJson("[]");
        q.setCreatedAt(now);
        return quotes.saveAndFlush(q).getId();
    }

    /** The subscriber's OPEN retirement quote {@code id} for this item, or the reason it cannot be used (404, 410 QUOTE_EXPIRED, 409 QUOTE_STALE). */
    @Transactional(readOnly = true)
    public SubscriptionQuote requireUsable(Long quoteId, Long userId, PlanRetirementItem item, Instant now) {
        SubscriptionQuote q = quoteId == null ? null : quotes.findById(quoteId).orElse(null);
        if (q == null || q.getUserId() == null || !q.getUserId().equals(userId) || !SuccessorAdvisor.QUOTE_KIND.equals(q.getKind()) || !item.getSubscriptionId().equals(q.getSubscriptionId())) {
            throw new BillingException(404, "NOT_FOUND", "Not found");
        }
        if (SUPERSEDED.equals(q.getStatus())) throw new BillingException(409, "QUOTE_STALE", "Prices or your subscription changed since this quote. Review the new numbers.", Map.of("reason", "PRICE_CHANGED"));
        if (!"OPEN".equals(q.getStatus()) || q.getExpiresAt().isBefore(now)) throw new BillingException(410, "QUOTE_EXPIRED", "This quote has expired. Get a new one.");
        return q;
    }

    /** The DTO of a stored retirement quote, with its id and status. */
    public PlanQuoteDTO toDto(SubscriptionQuote q) {
        try {
            PersonalQuoteService.Stored s = json.readValue(q.getLinesJson(), PersonalQuoteService.Stored.class);
            PlanQuoteDTO d = s.dto();
            return new PlanQuoteDTO(
                q.getId(), d.kind(), q.getStatus(), q.getCreatedAt(), q.getExpiresAt(), d.currency(), d.catalogVersion(), d.plan(), d.interval(), d.intervalChange(), d.current(), d.proposed(),
                d.deltaMinor(), d.additions(), d.removals(), d.requiresConfirmation(), d.autoAdded(), d.prorationEstimateMinor(), d.nextInvoiceEstimateMinor(), d.nextInvoiceAt(), d.effectiveAt(),
                d.taxEstimateMinor(), d.taxSource(), d.taxNote(), d.aiBudgetPct(), d.promo(), d.warnings(), q.getInputsHash()
            );
        } catch (JsonProcessingException e) {
            LOG.error("Quote {} has unreadable lines_json", q.getId(), e);
            throw new BillingException(500, "QUOTE_UNREADABLE", "This quote can't be read. Get a new one.");
        }
    }

    // ---- building -----------------------------------------------------------------------------------------------------------------

    private PlanQuoteDTO dto(Subscription sub, Scored s, Instant effectiveAt, Instant now) {
        List<QuoteLine> proposedLines = new ArrayList<>();
        for (LineResult l : s.priced().group(PricingInputs.PLAN_GROUP).lines()) {
            boolean base = SuccessorAdvisor.BASE_LINE.equals(l.lineKey());
            proposedLines.add(
                new QuoteLine(base ? null : l.lineKey(), base ? "BASE" : "ADDON", base ? s.plan().getName() : l.lineKey(), l.quantity(), l.unitListMinor(), l.unitEffectiveMinor(), l.lineTotalMinor(), l.productCode(), l.priceId())
            );
        }
        long currentMinor = s.suggestion().currentMinor();
        Basket proposed = new Basket(List.copyOf(proposedLines), s.priced().recurringMinor(), s.summary().monthlyEquivalentMinor(), s.summary().savingsMinor(), s.summary().savingsBp());
        Basket current = new Basket(currentLines(sub, now), currentMinor, null, null, null);
        long delta = s.priced().recurringMinor() - currentMinor;
        return new PlanQuoteDTO(
            null, SuccessorAdvisor.DTO_KIND, "OPEN", null, null, s.priced().currency(), catalogVersions.currentVersion(), new PlanRef(s.plan().getPlanKey(), s.version().getVersion(), s.plan().getName()),
            s.priced().interval().name(), null, current, proposed, delta, List.of(), List.of(), List.of(), List.of(), 0L, s.priced().recurringMinor(), sub.getCurrentPeriodEnd(), effectiveAt.toString(), null, "NONE",
            PlanQuoteDTO.TAX_NOTE, null, null, List.of(), null
        );
    }

    private List<QuoteLine> currentLines(Subscription sub, Instant now) {
        List<QuoteLine> out = new ArrayList<>();
        ProductPrice base = sub.getPriceId() == null ? null : priceLookup.findFirstByStripePriceId(sub.getPriceId()).orElse(null);
        if (base != null) {
            out.add(new QuoteLine(null, "BASE", "Current plan", 1, base.getAmountMinor(), base.getAmountMinor(), base.getAmountMinor(), null, String.valueOf(base.getId())));
        }
        for (PersonalBasket.Held h : basket.held(sub.getId(), now)) {
            ProductPrice p = productPrices.findById(h.row().getPriceId()).orElse(null);
            long unit = p == null ? 0L : p.getAmountMinor();
            out.add(new QuoteLine(h.featureKey(), "ADDON", h.featureKey(), h.effectiveQuantity(), unit, unit, unit * h.effectiveQuantity(), null, p == null ? null : String.valueOf(p.getId())));
        }
        return List.copyOf(out);
    }

    private Map<String, Integer> currentQty(Subscription sub, Instant now) {
        Map<String, Integer> out = new LinkedHashMap<>();
        for (PersonalBasket.Held h : basket.held(sub.getId(), now)) if (h.effectiveQuantity() > 0) out.put(h.featureKey(), h.effectiveQuantity());
        return out;
    }

    private String write(Object o) {
        try {
            return json.writeValueAsString(o);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
    }

    static String sha256(String s) {
        try {
            byte[] d = MessageDigest.getInstance("SHA-256").digest(s.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            for (byte b : d) sb.append(String.format("%02x", b));
            return sb.toString();
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
