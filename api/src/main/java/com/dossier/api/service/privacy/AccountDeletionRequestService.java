package com.dossier.api.service.privacy;

import com.dossier.api.domain.privacy.AccountDeletionRequest;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.privacy.AccountDeletionRequestRepository;
import com.dossier.api.service.AccountDeletionService;
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.settings.AdminSettingKeys;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;

/**
 * Account deletion with an undo window (REAL-GAPS-C T1.3). {@link #request} records the wish and the moment the erasure becomes final
 * ({@code privacy.deletion.grace_hours}, default 24; 0 = erase at once, no undo, handled by the caller). Until that moment the account is whole and
 * works as usual, and {@link #cancel} withdraws the request. {@link #purgeDue} (run by {@code AccountDeletionPurgeJob} every few minutes) erases the
 * accounts whose window has passed through the same {@link AccountDeletionService} the immediate path uses, which also writes the purge report.
 *
 * <p>It is safe on two API instances: due requests are claimed with {@code SELECT ... FOR UPDATE SKIP LOCKED} and leased (a worker that dies lets
 * the lease lapse, and the request is picked up again); a request whose erasure fails goes back to PENDING with a short reason and is retried by the
 * next sweep. A person can only ever see or cancel their own request: every method takes the account id of the authenticated caller.
 */
@Service
public class AccountDeletionRequestService {

    private static final Logger LOG = LoggerFactory.getLogger(AccountDeletionRequestService.class);
    static final int BATCH = 20;
    static final Duration LEASE = Duration.ofMinutes(15);

    /** What the person sees. {@code status} is NONE, PENDING or RUNNING; {@code canUndo} is true only while PENDING. */
    public record View(String status, Instant requestedAt, Instant purgeAfter, int graceHours, boolean canUndo) {}

    private final AccountDeletionRequestRepository requests;
    private final UserRepository users;
    private final AccountDeletionService deletion;
    private final ResumeBuilderSettings settings;
    private final TransactionTemplate tx;
    private final AccountDeletionMailer mailer;

    public AccountDeletionRequestService(
        AccountDeletionRequestRepository requests,
        UserRepository users,
        AccountDeletionService deletion,
        ResumeBuilderSettings settings,
        PlatformTransactionManager transactionManager,
        AccountDeletionMailer mailer
    ) {
        this.requests = requests;
        this.users = users;
        this.deletion = deletion;
        this.settings = settings;
        this.tx = new TransactionTemplate(transactionManager);
        this.mailer = mailer;
    }

    public int graceHours() {
        return settings.getInt(AdminSettingKeys.PRIVACY_DELETION_GRACE_HOURS);
    }

    /** Records (or re-arms, or returns the existing) request for this account. */
    public View request(Long userId, String source, Instant now) {
        int grace = graceHours();
        boolean[] created = { false };
        AccountDeletionRequest r = tx.execute(s -> {
            AccountDeletionRequest existing = requests.findByUserId(userId).orElse(null);
            if (existing != null && !AccountDeletionRequest.CANCELLED.equals(existing.getStatus())) return existing; // already asked: idempotent (and no second e-mail)
            created[0] = true;
            AccountDeletionRequest row = existing != null ? existing : new AccountDeletionRequest();
            row.setUserId(userId);
            row.setStatus(AccountDeletionRequest.PENDING);
            row.setSource(source);
            row.setRequestedAt(now);
            row.setPurgeAfter(now.plus(Duration.ofHours(grace)));
            row.setCancelledAt(null);
            row.setLeaseUntil(null);
            row.setAttempts(0);
            row.setLastError(null);
            return requests.save(row);
        });
        if (created[0]) mailer.scheduled(emailOf(userId), r.getPurgeAfter());
        return view(r, grace);
    }

    /**
     * Erases the signed-in account at once (the zero-hour window: no undo) and then tells its own address. The address is read BEFORE the erasure, the mail is sent only after the
     * erasure succeeded (a failed erasure throws first and sends nothing), and it is held in memory for that one send.
     */
    public void eraseNow(Long userId) {
        String email = emailOf(userId);
        deletion.deleteCurrentUserAccount();
        mailer.completed(email);
    }

    private String emailOf(Long userId) {
        return users.findById(userId).map(u -> u.getEmail()).orElse(null);
    }

    public View status(Long userId) {
        return view(requests.findByUserId(userId).filter(r -> !AccountDeletionRequest.CANCELLED.equals(r.getStatus())).orElse(null), graceHours());
    }

    /** Withdraws the account's own pending request. 404 when there is none; 409 once the erasure has started (it can no longer be undone). */
    public View cancel(Long userId, Instant now) {
        AccountDeletionRequest r = tx.execute(s -> {
            AccountDeletionRequest row = requests.findByUserId(userId).filter(x -> !AccountDeletionRequest.CANCELLED.equals(x.getStatus())).orElse(null);
            if (row == null) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "No pending deletion");
            if (AccountDeletionRequest.RUNNING.equals(row.getStatus())) throw new ResponseStatusException(HttpStatus.CONFLICT, "The deletion has already started");
            row.setStatus(AccountDeletionRequest.CANCELLED);
            row.setCancelledAt(now);
            return requests.save(row);
        });
        mailer.cancelled(emailOf(userId));
        return view(r, graceHours());
    }

    /** For the admin page: pending requests, soonest first. Ids only; no name or e-mail. */
    public List<AccountDeletionRequest> pending(int limit) {
        return requests.findByStatusOrderByPurgeAfter(AccountDeletionRequest.PENDING, org.springframework.data.domain.PageRequest.of(0, Math.max(1, Math.min(limit, 200))));
    }

    /** Erases every account whose undo window has passed; returns how many were erased. Failures are recorded on the request and retried by the next sweep. */
    public int purgeDue(Instant now) {
        List<Long> ids = tx.execute(s -> {
            List<Long> due = requests.lockDue(now, BATCH);
            if (!due.isEmpty()) requests.lease(due, now.plus(LEASE));
            return due;
        });
        if (ids == null || ids.isEmpty()) return 0;
        int done = 0;
        for (Long id : ids) {
            AccountDeletionRequest r = requests.findById(id).orElse(null);
            if (r == null) continue;
            var user = users.findById(r.getUserId()).orElse(null);
            String login = user == null ? null : user.getLogin();
            String email = user == null ? null : user.getEmail(); // read before the erasure: the completed mail is the last thing sent to it
            try {
                if (login != null) deletion.deleteUserAccountByLogin(login, r.getSource(), r.getRequestedAt()); // the request row goes with the user (FK cascade)
                else requests.deleteById(id);
                done++;
                if (login != null) mailer.completed(email); // only after the erasure succeeded
            } catch (RuntimeException e) {
                LOG.warn("Scheduled account erasure (request {}) failed; it will be retried", id, e);
                String why = e.getClass().getSimpleName();
                tx.executeWithoutResult(s -> requests.fail(id, why.substring(0, Math.min(why.length(), 200))));
            }
        }
        return done;
    }

    private static View view(AccountDeletionRequest r, int grace) {
        if (r == null) return new View("NONE", null, null, grace, false);
        return new View(r.getStatus(), r.getRequestedAt(), r.getPurgeAfter(), grace, AccountDeletionRequest.PENDING.equals(r.getStatus()));
    }
}
