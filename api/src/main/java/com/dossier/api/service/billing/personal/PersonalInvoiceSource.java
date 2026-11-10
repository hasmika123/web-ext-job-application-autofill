package com.dossier.api.service.billing.personal;

import com.dossier.api.service.dto.InvoiceDTO;
import java.util.List;

/**
 * Where {@code GET /api/billing/invoices} reads from. The personal invoice mirror (story K8.3, webhook-written {@code invoice} and {@code invoice_line} rows)
 * implements this port; until it exists {@link PersonalInvoiceService} falls back to asking Stripe for the customer's invoices. Newest first, at most
 * {@code limit}, only the given user's.
 */
public interface PersonalInvoiceSource {
    List<InvoiceDTO> invoicesOf(Long userId, int limit);
}
