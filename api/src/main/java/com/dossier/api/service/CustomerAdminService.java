package com.dossier.api.service;

import com.dossier.api.domain.CustomerNote;
import com.dossier.api.domain.StripeEvent;
import com.dossier.api.domain.Subscription;
import com.dossier.api.domain.User;
import com.dossier.api.repository.CustomerNoteRepository;
import com.dossier.api.repository.StripeEventRepository;
import com.dossier.api.repository.SubscriptionRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.security.SecurityUtils;
import com.dossier.api.service.billing.StripeProperties;
import com.dossier.api.service.dto.CustomerDTOs.Customer;
import com.dossier.api.service.dto.CustomerDTOs.Detail;
import com.dossier.api.service.dto.CustomerDTOs.TimelineEntry;
import java.time.Instant;
import java.time.YearMonth;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/**
 * The admin Customers page and each customer's billing timeline (Phase 9.C1).
 *
 * <p>Everything is read from our own mirror — the {@code subscription} row and the
 * {@code stripe_event} log the webhook writes — so this page works without calling Stripe, and
 * shows exactly what the rest of the app believes about a customer. Refunds and disputes still
 * happen in the Stripe dashboard; each row links there.
 *
 * <p>Folded in memory, like the revenue card ({@code AdminAnalyticsService}): one row per paying
 * user, and the status rule is a Java predicate that must not be duplicated in SQL.
 */
@Service
@Transactional(readOnly = true)
public class CustomerAdminService {

    public static final String ACTIVE = "ACTIVE";
    public static final String PAST_DUE = "PAST_DUE";
    public static final String CANCELLING = "CANCELLING";
    public static final String LAPSED = "LAPSED";
    /** A filter, not a status: customers whose subscription started this calendar month (UTC). */
    public static final String NEW = "NEW";

    private static final int TIMELINE_LIMIT = 200;
    private static final int MAX_NOTE = 4000;

    private final SubscriptionRepository subscriptionRepository;
    private final StripeEventRepository stripeEventRepository;
    private final CustomerNoteRepository customerNoteRepository;
    private final UserRepository userRepository;
    private final StripeProperties stripeProperties;
    private final AdminAuditService auditService;

    public CustomerAdminService(
        SubscriptionRepository subscriptionRepository,
        StripeEventRepository stripeEventRepository,
        CustomerNoteRepository customerNoteRepository,
        UserRepository userRepository,
        StripeProperties stripeProperties,
        AdminAuditService auditService
    ) {
        this.subscriptionRepository = subscriptionRepository;
        this.stripeEventRepository = stripeEventRepository;
        this.customerNoteRepository = customerNoteRepository;
        this.userRepository = userRepository;
        this.stripeProperties = stripeProperties;
        this.auditService = auditService;
    }

    /**
     * Where a customer stands, in the four groups admin works with. A failed payment wins over
     * everything (it's the one that needs action); cancelling means still paid-up but ending.
     */
    public static String statusGroup(Subscription sub, Instant now) {
        String s = sub.getStatus() == null ? "" : sub.getStatus().trim().toLowerCase();
        if (s.equals("past_due") || s.equals("unpaid")) return PAST_DUE;
        boolean pro = EntitlementService.isProFor(sub.getStatus(), sub.getCurrentPeriodEnd(), now);
        if (pro && (sub.isCancelAtPeriodEnd() || s.equals("canceled"))) return CANCELLING;
        if (pro) return ACTIVE;
        return LAPSED;
    }

    /** A customer = anyone who has ever had a subscription, not just started a checkout. */
    private List<Subscription> customers() {
        return subscriptionRepository.findAll().stream().filter(sub -> sub.getStripeSubscriptionId() != null).toList();
    }

    public Page<Customer> list(String filter, Pageable pageable) {
        Instant now = Instant.now();
        Instant monthStart = monthStart();
        String f = filter == null ? "" : filter.trim().toUpperCase();
        List<Subscription> matching = customers()
            .stream()
            .filter(sub -> matches(sub, f, now, monthStart))
            .sorted(Comparator.comparing(Subscription::getCreatedAt, Comparator.nullsLast(Comparator.reverseOrder())))
            .toList();

        int from = (int) Math.min((long) pageable.getPageNumber() * pageable.getPageSize(), matching.size());
        int to = Math.min(from + pageable.getPageSize(), matching.size());
        List<Subscription> page = matching.subList(from, to);
        Map<String, Paid> paid = totalsFor(page);
        List<Customer> rows = page.stream().map(sub -> toCustomer(sub, now, paid)).toList();
        return new PageImpl<>(rows, pageable, matching.size());
    }

    /** Tab counts for the Customers page: each status group, plus NEW and ALL. */
    public Map<String, Long> counts() {
        Instant now = Instant.now();
        Instant monthStart = monthStart();
        Map<String, Long> counts = new LinkedHashMap<>();
        for (String g : List.of(ACTIVE, PAST_DUE, CANCELLING, LAPSED)) counts.put(g, 0L);
        long fresh = 0;
        List<Subscription> all = customers();
        for (Subscription sub : all) {
            counts.merge(statusGroup(sub, now), 1L, Long::sum);
            if (isNew(sub, monthStart)) fresh++;
        }
        counts.put(NEW, fresh);
        counts.put("ALL", (long) all.size());
        return counts;
    }

    /** The user page's Billing section: summary (when they are or were a customer) + timeline. */
    public Detail detail(String login) {
        User user = userRepository.findOneByLogin(login).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No such user"));
        Subscription sub = subscriptionRepository.findOneByUserId(user.getId()).orElse(null);
        Customer customer = null;
        if (sub != null && sub.getStripeSubscriptionId() != null) {
            customer = toCustomer(sub, Instant.now(), totalsFor(List.of(sub)));
        }
        String customerId = sub == null ? null : sub.getStripeCustomerId();

        List<TimelineEntry> timeline = new ArrayList<>();
        for (StripeEvent e : stripeEventRepository.findTimeline(user.getId(), customerId, PageRequest.of(0, TIMELINE_LIMIT))) {
            timeline.add(
                new TimelineEntry(
                    "BILLING",
                    e.getOccurredAt() != null ? e.getOccurredAt() : e.getReceivedAt(),
                    e.getDetail() != null ? e.getDetail() : e.getType(),
                    null,
                    e.getAmountCents(),
                    e.getCurrency(),
                    StripeEvent.STATUS_FAILED.equals(e.getStatus())
                )
            );
        }
        for (CustomerNote n : customerNoteRepository.findAllByUserIdOrderByCreatedAtDesc(user.getId())) {
            timeline.add(new TimelineEntry("NOTE", n.getCreatedAt(), "Note from " + n.getAuthorLogin(), n.getBody(), null, null, false));
        }
        timeline.sort(Comparator.comparing(TimelineEntry::at, Comparator.nullsLast(Comparator.reverseOrder())));
        return new Detail(customer, timeline);
    }

    /** Add a note to a customer's timeline. Notes are never edited; every one is audited. */
    @Transactional
    public void addNote(String login, String body) {
        String text = body == null ? "" : body.trim();
        if (text.isEmpty()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A note can't be empty.");
        if (text.length() > MAX_NOTE) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A note can be at most 4000 characters.");
        User user = userRepository.findOneByLogin(login).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No such user"));

        CustomerNote note = new CustomerNote();
        note.setUserId(user.getId());
        note.setAuthorLogin(SecurityUtils.getCurrentUserLogin().orElse("admin"));
        note.setBody(text);
        note.setCreatedAt(Instant.now());
        customerNoteRepository.save(note);
        auditService.record(AdminAuditService.CUSTOMER_NOTE_ADD, AdminAuditService.TARGET_USER, user.getLogin(), null, "length=" + text.length());
    }

    // ---- helpers ---------------------------------------------------------------------------

    private static boolean matches(Subscription sub, String filter, Instant now, Instant monthStart) {
        if (filter.isEmpty() || filter.equals("ALL")) return true;
        if (filter.equals(NEW)) return isNew(sub, monthStart);
        return filter.equals(statusGroup(sub, now));
    }

    private static boolean isNew(Subscription sub, Instant monthStart) {
        return sub.getCreatedAt() != null && !sub.getCreatedAt().isBefore(monthStart);
    }

    private static Instant monthStart() {
        return YearMonth.now(ZoneOffset.UTC).atDay(1).atStartOfDay().toInstant(ZoneOffset.UTC);
    }

    /** What a customer has paid, from the recorded {@code invoice.paid} events. */
    private record Paid(long cents, String currency) {}

    /** Total paid per Stripe customer, for just these rows — one query. */
    private Map<String, Paid> totalsFor(List<Subscription> subs) {
        List<String> ids = subs.stream().map(Subscription::getStripeCustomerId).filter(Objects::nonNull).toList();
        Map<String, Paid> out = new HashMap<>();
        if (ids.isEmpty()) return out;
        for (Object[] row : stripeEventRepository.sumPaidByCustomer(ids)) {
            long cents = row[1] == null ? 0L : ((Number) row[1]).longValue();
            out.put((String) row[0], new Paid(cents, (String) row[2]));
        }
        return out;
    }

    private Customer toCustomer(Subscription sub, Instant now, Map<String, Paid> paid) {
        User u = sub.getUser();
        String name = u == null ? null : String.join(" ", nonBlank(u.getFirstName()), nonBlank(u.getLastName())).trim();
        Paid total = paid.get(sub.getStripeCustomerId());
        return new Customer(
            u == null ? null : u.getLogin(),
            u == null ? null : u.getEmail(),
            name == null || name.isEmpty() ? null : name,
            statusGroup(sub, now),
            sub.getStatus(),
            billingInterval(sub.getPriceId()),
            sub.getCurrentPeriodEnd(),
            sub.isCancelAtPeriodEnd(),
            total == null ? 0L : total.cents(),
            total == null || total.currency() == null ? "usd" : total.currency(),
            sub.getCreatedAt(),
            stripeUrl(sub.getStripeCustomerId())
        );
    }

    private String billingInterval(String priceId) {
        if (priceId == null) return null;
        if (priceId.equals(stripeProperties.getPriceMonthly())) return "MONTHLY";
        if (priceId.equals(stripeProperties.getPrice3mo())) return "QUARTERLY";
        return null;
    }

    /** The customer in the Stripe dashboard — the test-mode view when the key is a test key. */
    String stripeUrl(String customerId) {
        if (customerId == null) return null;
        String key = stripeProperties.getSecretKey() == null ? "" : stripeProperties.getSecretKey();
        boolean test = key.startsWith("sk_test_") || key.startsWith("rk_test_");
        return "https://dashboard.stripe.com/" + (test ? "test/" : "") + "customers/" + customerId;
    }

    private static String nonBlank(String s) {
        return s == null ? "" : s.trim();
    }
}
