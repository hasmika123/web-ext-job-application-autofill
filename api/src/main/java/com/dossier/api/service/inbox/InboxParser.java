package com.dossier.api.service.inbox;

import com.dossier.api.domain.Application;
import com.dossier.api.domain.InboxMessage;
import com.dossier.api.domain.User;
import com.dossier.api.domain.enumeration.ApplicationStatus;
import com.dossier.api.repository.ApplicationRepository;
import com.dossier.api.repository.InboxMessageRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.service.AiBudgetService;
import com.dossier.api.service.AiMeteringService;
import com.dossier.api.service.ApplicationKeys;
import com.dossier.api.service.ai.AiProvider;
import com.dossier.api.service.ai.AiProviderException;
import com.dossier.api.service.ai.AiResult;
import com.dossier.api.service.ai.AiTask;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;

/**
 * Turns newly read mail into board updates (Phase 14.4a). Runs after each inbox read, oldest mail
 * first, so a rejection that followed an interview invite ends where it should.
 *
 * <ol>
 *   <li><b>Read it.</b> Job mail goes through {@link MailClassifier}'s rules. Only what the rules
 *       can't settle is sent to the model — in batches of up to 20, one metered Flash-Lite call per
 *       batch, against the user's AI budget. If the model can't be asked (budget spent, switched
 *       off), an unsettled email changes nothing: it's kept, and its reading stays "unsure".</li>
 *   <li><b>Match it.</b> A reply follows its thread to the application the earlier mail was about
 *       (sent mail is linked too, for exactly this); otherwise {@link MailMatcher} by company and
 *       role.</li>
 *   <li><b>Act on it.</b> The status moves forward only ({@link MailMatcher#next}); a confirmation
 *       also marks the submission confirmed and dates the application. Each change is announced
 *       ({@link StatusChanged}) for 14.6's notifications.</li>
 *   <li><b>Suggest.</b> A confirmation, invite, test or offer from a company the board has no
 *       application for becomes a suggested application (14.4b shows them).</li>
 * </ol>
 *
 * Nothing here ever writes to the mailbox.
 */
@Service
public class InboxParser {

    private static final Logger LOG = LoggerFactory.getLogger(InboxParser.class);
    static final int AI_BATCH = 20;
    static final int AI_MAX_BATCHES = 3;
    static final int EXCERPT = 1200;
    private static final Set<MailClassifier.Category> SUGGESTS = EnumSet.of(
        MailClassifier.Category.APPLIED,
        MailClassifier.Category.INTERVIEW,
        MailClassifier.Category.ASSESSMENT,
        MailClassifier.Category.OFFER,
        MailClassifier.Category.RECRUITER_OUTREACH
    );

    /**
     * An application's status moved because of an email. {@code mailSentAt} is when that email was
     * sent — 14.6 stays quiet about old mail read on a first backfill.
     */
    public record StatusChanged(
        Long userId,
        Long applicationId,
        String company,
        String role,
        ApplicationStatus from,
        ApplicationStatus to,
        Long messageId,
        Instant mailSentAt
    ) {}

    public record Result(int read, int changed, int suggested, int askedModel) {}

    private final InboxMessageRepository messages;
    private final ApplicationRepository applications;
    private final UserRepository users;
    private final AiProvider provider;
    private final AiBudgetService budget;
    private final AiMeteringService metering;
    private final ApplicationEventPublisher events;
    private final InboxInterviewApplier interviewApplier;
    private final boolean aiEnabled;
    private final ObjectMapper om = new ObjectMapper();

    /** The safety gate (inbox-safety): optional, so the parser still builds by hand in unit tests; absent = every forward change is applied as before. */
    @Autowired(required = false)
    private InboxSafetyService safety;

    public InboxParser(
        InboxMessageRepository messages,
        ApplicationRepository applications,
        UserRepository users,
        AiProvider provider,
        AiBudgetService budget,
        AiMeteringService metering,
        ApplicationEventPublisher events,
        InboxInterviewApplier interviewApplier,
        @Value("${dossier.ai.enabled:false}") boolean aiEnabled
    ) {
        this.messages = messages;
        this.applications = applications;
        this.users = users;
        this.provider = provider;
        this.budget = budget;
        this.metering = metering;
        this.events = events;
        this.interviewApplier = interviewApplier;
        this.aiEnabled = aiEnabled;
    }

    public Result parse(Long userId, String inboxAddress) {
        List<InboxMessage> batch = messages.findTop500ByUserIdAndParsedAtIsNullOrderBySentAtAscIdAsc(userId);
        if (batch.isEmpty()) return new Result(0, 0, 0, 0);
        List<Application> apps = new ArrayList<>(applications.findByUserId(userId));
        Instant now = Instant.now();

        // 1. Read every job email by rules; queue what they can't settle.
        List<InboxMessage> unsure = new ArrayList<>();
        for (InboxMessage m : batch) {
            if (InboxMessage.OUT.equals(m.getDirection())) {
                // Sent mail: only linked, so replies to it can follow the thread.
                String to = m.getToAddresses() == null ? null : m.getToAddresses().split(",")[0].trim();
                MailMatcher.match(apps, null, null, m.getSubject(), to, null, inboxAddress).ifPresent(a -> m.setApplicationId(a.getId()));
                m.setClassifiedBy("NONE");
                continue;
            }
            if (!m.isJobMail()) {
                m.setClassifiedBy("NONE");
                continue;
            }
            // Never keep a sensitive value: a mail that holds one is stored with it removed (and never goes to the model).
            MailTextGuard.Stored kept = MailTextGuard.forStorage(m.getSubject(), m.getBodyText());
            if (kept.redacted()) {
                m.setSubject(kept.subject());
                m.setBodyText(kept.body());
                m.setCalendarEvent(null);
            }
            MailClassifier.Reading r = MailClassifier.read(m.getSubject(), m.getBodyText(), m.getFromName());
            m.setCategory(r.category().name());
            m.setClassifiedBy("RULE");
            m.setCompanyGuess(r.company());
            m.setRoleGuess(r.role());
            if (r.ambiguous()) unsure.add(m);
        }

        // 2. Ask the model about the unsure ones, if it may be asked. Never a mail with a sensitive value, never one that tries to instruct the model.
        Set<InboxMessage> stillUnsure = new HashSet<>(unsure);
        List<InboxMessage> askable = unsure.stream().filter(InboxParser::mayAskModel).toList();
        int asked = 0;
        String login = askable.isEmpty() ? null : users.findById(userId).map(User::getLogin).orElse(null);
        if (login != null && aiEnabled && provider.isConfigured()) {
            for (int i = 0; i < askable.size() && i / AI_BATCH < AI_MAX_BATCHES; i += AI_BATCH) {
                List<InboxMessage> slice = askable.subList(i, Math.min(askable.size(), i + AI_BATCH));
                AiBudgetService.Decision d = budget.decide(login, AiTask.INBOX);
                if (d.verdict() != AiBudgetService.Verdict.OK) break;
                try {
                    AiResult result = provider.generate(AiTask.INBOX, d.model(), prompt(slice), "");
                    metering.record(login, AiTask.INBOX, result);
                    asked += slice.size();
                    Map<String, JsonNode> byRef = parseReply(result.text());
                    for (int k = 0; k < slice.size(); k++) {
                        JsonNode n = byRef.get("m" + (k + 1));
                        if (n == null) continue;
                        InboxMessage m = slice.get(k);
                        // Closed set only: a category from the enum, no application id (none were offered), plain-text company/role; else the rules' reading stands.
                        MailTextGuard.Verdict v = MailTextGuard.validate(n, Set.of()).orElse(null);
                        if (v == null) continue;
                        m.setCategory(v.category().name());
                        m.setClassifiedBy("AI");
                        if (v.company() != null) m.setCompanyGuess(v.company());
                        if (v.role() != null) m.setRoleGuess(v.role());
                        stillUnsure.remove(m);
                    }
                } catch (AiProviderException e) {
                    LOG.warn("Inbox reading call failed: {}", e.getMessage());
                    break;
                }
            }
        }

        // 3. Match and act, oldest first.
        int changed = 0, suggested = 0;
        for (InboxMessage m : batch) {
            m.setParsedAt(now);
            if (!InboxMessage.IN.equals(m.getDirection()) || !m.isJobMail() || m.getCategory() == null) {
                messages.save(m);
                continue;
            }
            MailClassifier.Category c = category(m.getCategory());
            if (stillUnsure.contains(m) || c == null) {
                // Kept and marked, but acted on only when we're sure — a wrong "rejected" is worse than none.
                m.setClassifiedBy("UNSURE");
                messages.save(m);
                continue;
            }
            Optional<Application> threaded = thread(userId, m, apps);
            Optional<Application> app = threaded.or(() ->
                MailMatcher.match(apps, m.getCompanyGuess(), m.getRoleGuess(), m.getSubject(), m.getFromAddress(), m.getFromName(), inboxAddress)
            );
            if (app.isPresent()) {
                Application a = app.get();
                m.setApplicationId(a.getId());
                // An interview mail also says when: read it first (a cancellation never moves the status), then set the status, then the interview.
                ExtractedSchedule schedule = c == MailClassifier.Category.INTERVIEW ? interviewApplier.read(m) : null;
                if (act(userId, a, c, m, schedule, threaded.isPresent())) changed++;
                if (schedule != null) interviewApplier.apply(userId, a.getId(), m, schedule);
            } else if (safety != null && holdIfAmbiguous(userId, m, c, apps)) {
                // two applications fit equally: the person picks (see InboxSafetyService), nothing was changed
            } else if (SUGGESTS.contains(c) && m.getCompanyGuess() != null && !companyTracked(apps, m.getCompanyGuess())) {
                m.setSuggestion("NEW");
                suggested++;
            }
            messages.save(m);
        }
        if (changed > 0 || suggested > 0) LOG.info("Inbox: {} application(s) updated, {} suggested", changed, suggested);
        return new Result(batch.size(), changed, suggested, asked);
    }

    /** Apply what the email says to the application. True when the status moved. */
    private boolean act(Long userId, Application a, MailClassifier.Category c, InboxMessage m, ExtractedSchedule schedule, boolean viaThread) {
        ApplicationStatus from = a.getStatus();
        // The category table decides first: only a STATUS category may move an application (a closed role, a reminder, a recruiter's note never does).
        ApplicationStatus to = !c.mayChangeStatus()
            ? null
            : c == MailClassifier.Category.INTERVIEW ? InboxInterviewApplier.statusAfter(from, schedule) : MailMatcher.next(from, c);
        // The gate: a rejection, a weak reading, an ambiguous or backwards change is held for the person instead of applied.
        if (to != null && safety != null && !safety.screen(userId, m, a, eventOf(m, c, a.getId(), viaThread ? MailEvent.MatchKind.THREAD : MailEvent.MatchKind.COMPANY_ROLE, List.of()), to)) return false;
        boolean touched = false;
        if ((c == MailClassifier.Category.APPLIED || c == MailClassifier.Category.IN_REVIEW) && !Boolean.TRUE.equals(a.getSubmissionConfirmed())) {
            a.setSubmissionConfirmed(true);
            touched = true;
        }
        if (to != null) {
            a.setStatus(to);
            if ((to == ApplicationStatus.APPLIED || to == ApplicationStatus.IN_REVIEW) && a.getAppliedAt() == null) a.setAppliedAt(m.getSentAt() != null ? m.getSentAt() : Instant.now());
            m.setStatusChange(to.name());
            touched = true;
        }
        if (touched) {
            a.setUpdatedAt(Instant.now());
            applications.save(a);
        }
        if (to != null) events.publishEvent(
            new StatusChanged(userId, a.getId(), a.getCompany(), a.getRoleTitle(), from, to, m.getId(), m.getSentAt())
        );
        return to != null;
    }

    /** What the parser knows of one mail, as the decision seam reads it: AI readings are less sure than rule readings, a thread is surer than a name. */
    private static MailEvent eventOf(InboxMessage m, MailClassifier.Category c, Long applicationId, MailEvent.MatchKind kind, List<MailEvent.Candidate> candidates) {
        int reading = "AI".equals(m.getClassifiedBy()) ? 80 : 90;
        int match = kind == MailEvent.MatchKind.THREAD ? 95 : kind == MailEvent.MatchKind.AMBIGUOUS ? 40 : 85;
        return new MailEvent(m.getId(), c, Math.min(reading, match), reading, match, kind, applicationId, candidates, null, m.getSubject());
    }

    /** No single application matched, but two or more at the named company did: hold the mail with those candidates. True when held. */
    private boolean holdIfAmbiguous(Long userId, InboxMessage m, MailClassifier.Category c, List<Application> apps) {
        if (c == MailClassifier.Category.ALERT || c == MailClassifier.Category.OTHER) return false;
        String key = ApplicationKeys.company(m.getCompanyGuess());
        if (key.isEmpty()) return false;
        List<MailEvent.Candidate> candidates = apps
            .stream()
            .filter(a -> !Boolean.TRUE.equals(a.getArchived()) && key.equals(ApplicationKeys.company(a.getCompany())))
            .map(a -> new MailEvent.Candidate(a.getId(), 50, MailEvent.MatchKind.COMPANY, "Same company"))
            .toList();
        if (candidates.size() < 2) return false;
        safety.holdAmbiguous(userId, m, eventOf(m, c, null, MailEvent.MatchKind.AMBIGUOUS, candidates));
        return true;
    }

    /** A reply goes where the mail it answers went. */
    private Optional<Application> thread(Long userId, InboxMessage m, List<Application> apps) {
        if (m.getInReplyTo() == null || m.getInReplyTo().isBlank()) return Optional.empty();
        return messages
            .findFirstByUserIdAndMessageId(userId, m.getInReplyTo())
            .map(InboxMessage::getApplicationId)
            .flatMap(id -> apps.stream().filter(a -> id.equals(a.getId()) && !Boolean.TRUE.equals(a.getArchived())).findFirst());
    }

    private static boolean companyTracked(List<Application> apps, String company) {
        String key = ApplicationKeys.company(company);
        return !key.isEmpty() && apps.stream().anyMatch(a -> key.equals(ApplicationKeys.company(a.getCompany())));
    }

    /** A mail goes to the model only when it holds no sensitive value and does not try to instruct the model. */
    static boolean mayAskModel(InboxMessage m) {
        if (MailTextGuard.isSensitive(m.getSubject(), m.getBodyText())) return false;
        return !(MailTextGuard.looksInjected(m.getSubject()) || MailTextGuard.looksInjected(m.getBodyText()) || MailTextGuard.looksInjected(m.getFromName()));
    }

    String prompt(List<InboxMessage> slice) {
        StringBuilder sb = new StringBuilder();
        sb.append(MailTextGuard.preamble());
        sb.append("Classify each email about a job seeker's applications. For each id (m1, m2, ...) return category, one of exactly: ");
        sb.append("APPLIED (confirms an application was received), IN_REVIEW (says the application is under review), INTERVIEW (an invitation to interview or talk, or scheduling one), ");
        sb.append("ASSESSMENT (a test, coding challenge or take-home), ASSESSMENT_REMINDER (a reminder about a test already sent), REJECTED (they won't proceed with the candidate), OFFER (a job offer), ");
        sb.append("APPLICATION_CLOSED (the position was filled or closed, the candidate was not turned down), RECRUITER_OUTREACH (a recruiter writes about a role the person did not apply to), ");
        sb.append("ALERT (job recommendations, not about one application), NEWSLETTER (marketing or a newsletter), OTHER (anything else). ");
        sb.append("Also company: the hiring company's name as written - not the applicant-tracking system or job board - and role: the job title ");
        sb.append("if the email states one, else empty. Judge only from what the email says; if unsure whether it's a decision, choose OTHER. ");
        sb.append("Reply with JSON only: {\"results\":[{\"id\":\"m1\",\"category\":\"...\",\"company\":\"...\",\"role\":\"...\"}]}\n\n");
        for (int i = 0; i < slice.size(); i++) {
            InboxMessage m = slice.get(i);
            sb.append(MailTextGuard.wrap("m" + (i + 1), m.getFromName(), m.getFromAddress(), m.getSubject(), m.getBodyText(), EXCERPT).block());
        }
        return sb.toString();
    }

    Map<String, JsonNode> parseReply(String text) {
        Map<String, JsonNode> out = new HashMap<>();
        try {
            String t = text == null ? "" : text.trim();
            int start = t.indexOf('{');
            JsonNode root = start < 0 ? null : om.readTree(t.substring(start));
            if (root == null) return out;
            for (JsonNode n : root.path("results")) {
                String id = n.path("id").asText("").trim().toLowerCase(Locale.ROOT).replaceAll("[\\[\\]]", "");
                if (!id.isEmpty()) out.putIfAbsent(id, n);
            }
        } catch (Exception e) {
            // unusable reply: nothing settled
        }
        return out;
    }

    static MailClassifier.Category category(String s) {
        try {
            return s == null || s.isBlank() ? null : MailClassifier.Category.valueOf(s.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            return null;
        }
    }
}
