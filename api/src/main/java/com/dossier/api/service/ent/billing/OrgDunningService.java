package com.dossier.api.service.ent.billing;

import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.ent.billing.OrgBillingAccount;
import com.dossier.api.domain.ent.billing.OrgInvoice;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.MailService;
import java.text.NumberFormat;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.Comparator;
import java.util.Currency;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import org.springframework.stereotype.Service;

/**
 * What happens when an organization does not pay (docs/enterprise-v2/ORG-BILLING-BUILD.md step 3b; user decision 2026-11-12: <b>pause, suspend by
 * hand</b>). The period job calls {@link #sweep} for every Stripe-billed account, inside its own transaction:
 * <ul>
 *   <li><b>An open invoice past its due date:</b> the account is PAST_DUE, and its licensed add-ons pause from {@code features_paused_from}. That is the
 *       day after the period it paid for, or, when it never paid an invoice, the due date of its oldest unpaid one. Until then everything keeps working,
 *       and after it the base licence and every read, the billing pages and exports still do (the pause lives in {@code OrgLicenseGate}).</li>
 *   <li><b>A reminder e-mail</b> goes to the billing contact and the organization's owners and admins when it falls overdue, then once a week while it
 *       stays so. It carries the invoice, the amount, the payment link and the pause date.</li>
 *   <li><b>Nothing overdue any more</b> (paid, or voided): ACTIVE again, the pause lifted, the reminders reset.</li>
 * </ul>
 * Suspending the organization is never automatic: it is the platform admin's action (the admin organization page), as decided.
 */
@Service
public class OrgDunningService {

    static final Duration REMIND_EVERY = Duration.ofDays(7);
    private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("MMMM d, yyyy", Locale.US);

    private final OrganizationRepository organizations;
    private final OrgMemberRepository members;
    private final UserRepository users;
    private final MailService mail;

    public OrgDunningService(OrganizationRepository organizations, OrgMemberRepository members, UserRepository users, MailService mail) {
        this.organizations = organizations;
        this.members = members;
        this.users = users;
        this.mail = mail;
    }

    /** Update one account from its open Stripe invoices. Returns whether the account changed (the caller saves it). */
    public boolean sweep(OrgBillingAccount a, List<OrgInvoice> open, LocalDate today, Instant now) {
        List<OrgInvoice> late = open.stream().filter(i -> i.getDueDate() != null && i.getDueDate().isBefore(today)).sorted(Comparator.comparing(OrgInvoice::getDueDate)).toList();
        boolean collectable = "ACTIVE".equals(a.getStatus()) || "PAST_DUE".equals(a.getStatus());
        if (!collectable) return false;
        if (late.isEmpty()) {
            if (!"PAST_DUE".equals(a.getStatus()) && a.getFeaturesPausedFrom() == null && a.getLastReminderAt() == null) return false;
            a.setStatus("ACTIVE");
            a.setFeaturesPausedFrom(null);
            a.setLastReminderAt(null);
            return true;
        }
        LocalDate pausedFrom = pausedFrom(a, late.get(0));
        boolean changed = !"PAST_DUE".equals(a.getStatus()) || !pausedFrom.equals(a.getFeaturesPausedFrom());
        a.setStatus("PAST_DUE");
        a.setFeaturesPausedFrom(pausedFrom);
        if (a.getLastReminderAt() == null || !a.getLastReminderAt().plus(REMIND_EVERY).isAfter(now)) {
            remind(a, late.get(0), pausedFrom, today);
            a.setLastReminderAt(now);
            changed = true;
        }
        return changed;
    }

    /** The day after the period it paid for; the due date of the oldest unpaid invoice when it never paid one. */
    static LocalDate pausedFrom(OrgBillingAccount a, OrgInvoice oldestLate) {
        return a.getPaidThroughOn() != null ? a.getPaidThroughOn().plusDays(1) : oldestLate.getDueDate();
    }

    private void remind(OrgBillingAccount a, OrgInvoice inv, LocalDate pausedFrom, LocalDate today) {
        String orgName = organizations.findByOrgId(a.getOrgId()).map(o -> o.getDisplayName() != null && !o.getDisplayName().isBlank() ? o.getDisplayName() : o.getName()).orElse("Your organization");
        String subject = orgName + ": invoice " + inv.getInvoiceNumber() + " is overdue";
        String body = body(orgName, inv, pausedFrom, today);
        for (String to : recipients(a)) mail.sendEmail(to, subject, body, false, false);
    }

    static String body(String orgName, OrgInvoice inv, LocalDate pausedFrom, LocalDate today) {
        NumberFormat money = NumberFormat.getCurrencyInstance(Locale.US);
        try {
            money.setCurrency(Currency.getInstance(inv.getCurrency() == null ? "USD" : inv.getCurrency()));
        } catch (IllegalArgumentException ignored) {
            // keep USD
        }
        StringBuilder b = new StringBuilder();
        b.append("Hello,\n\n");
        b.append("Invoice ").append(inv.getInvoiceNumber()).append(" for ").append(orgName).append(", ").append(money.format(inv.getAmountMinor() / 100.0))
            .append(", was due on ").append(DAY.format(inv.getDueDate())).append(" and has not been paid yet.\n\n");
        if (inv.getHostedUrl() != null && !inv.getHostedUrl().isBlank()) b.append("You can pay it by card or bank transfer here: ").append(inv.getHostedUrl()).append("\n\n");
        if (pausedFrom.isAfter(today)) {
            b.append("If it is still unpaid on ").append(DAY.format(pausedFrom)).append(", your consultants' licensed add-ons (AI help, inbox monitoring, ")
                .append("Autopilot prepare) pause until it is paid.");
        } else {
            b.append("Your consultants' licensed add-ons (AI help, inbox monitoring, Autopilot prepare) are paused since ").append(DAY.format(pausedFrom))
                .append(" and come back as soon as it is paid.");
        }
        b.append(" Everything else keeps working: the workspace, your records, billing and exports.\n\n");
        b.append("If you have already paid, thank you, and please ignore this message.\n\nKiwiply");
        return b.toString();
    }

    /** The billing contact and the organization's active owners and admins, each once. */
    Set<String> recipients(OrgBillingAccount a) {
        Set<String> to = new LinkedHashSet<>();
        if (a.getBillingEmail() != null && !a.getBillingEmail().isBlank()) to.add(a.getBillingEmail().trim().toLowerCase(Locale.ROOT));
        for (OrgMember m : members.findByOrgIdAndRoleInAndStatus(a.getOrgId(), List.of(OrgRole.OWNER, OrgRole.ADMIN), OrgMemberStatus.ACTIVE)) {
            if (m.getUserId() == null) continue;
            users.findById(m.getUserId()).map(u -> u.getEmail()).filter(e -> e != null && !e.isBlank()).ifPresent(e -> to.add(e.trim().toLowerCase(Locale.ROOT)));
        }
        return to;
    }
}
