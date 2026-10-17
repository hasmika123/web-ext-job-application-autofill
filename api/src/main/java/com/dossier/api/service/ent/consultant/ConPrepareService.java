package com.dossier.api.service.ent.consultant;

import com.dossier.api.domain.ent.mkt.MktOpportunity;
import com.dossier.api.domain.ent.prepare.PrepareEvent;
import com.dossier.api.domain.ent.prepare.PrepareItem;
import com.dossier.api.domain.ent.prepare.PrepareSession;
import com.dossier.api.domain.ent.talent.ClientAccount;
import com.dossier.api.domain.ent.talent.ClientRequirement;
import com.dossier.api.domain.ent.talent.RequirementMatch;
import com.dossier.api.repository.ent.mkt.MktOpportunityRepository;
import com.dossier.api.repository.ent.prepare.PrepareEventRepository;
import com.dossier.api.repository.ent.prepare.PrepareItemRepository;
import com.dossier.api.repository.ent.prepare.PrepareSessionRepository;
import com.dossier.api.repository.ent.talent.ClientAccountRepository;
import com.dossier.api.repository.ent.talent.ClientRequirementRepository;
import com.dossier.api.repository.ent.talent.RequirementMatchRepository;
import com.dossier.api.service.ent.consultantws.ConsultantWsJobSourceReader;
import com.dossier.api.service.org.OrgAuditService;
import com.dossier.api.service.org.OrgException;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import com.dossier.api.service.privacy.SensitiveContent;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Prepare selected openings, the server half (docs/enterprise-v2/63, roadmap X12.2). A consultant picks assigned openings; the browser extension opens each
 * job link in a tab of the consultant's own browser, fills the form from the consultant's own profile and STOPS. This class only plans and records: it
 * hands the extension the links, enforces the admin-set caps, and keeps the trail the extension reports. It never opens, fills or sends anything, and it
 * never moves an opportunity to APPLIED: that stays with the existing linker (the consultant's own application, saved after the consultant presses the
 * final button on the real site). Nothing is stored beyond a job title, a company, a link and a short scanned note; no personal data.
 *
 * <p>Gate: {@link ConScope} first (the consultant is the caller's own seat; a non-consultant is the generic 404), then {@link PrepareBatchEntitlement}
 * (feature off is the same generic 404, the feature does not exist). A match that is not one of the caller's own ASSIGNED matches is a generic 404 for the
 * whole call. Caps count prepared items per consultant, per UTC day and per UTC month. Two truly simultaneous requests could each pass the cap check; the
 * overshoot is bounded by one batch and the next call sees the true count.
 */
@Service
public class ConPrepareService {

    public static final List<String> EVENTS = List.of("OPENED", "PREFILLED", "NEEDS_INPUT", "SUBMIT_DETECTED", "CLOSED", "FAILED");
    public static final int DETAIL_MAX = 200;
    public static final String NOT_ELIGIBLE = "NOT_ELIGIBLE";
    public static final String JOB_NOT_OPEN = "JOB_NOT_OPEN";
    public static final String NO_URL = "NO_URL";
    public static final String CAP_REACHED = "PREPARE_CAP_REACHED";
    public static final String SESSION_EXPIRED = "PREPARE_SESSION_EXPIRED";
    public static final String BATCH_TOO_LARGE = "PREPARE_BATCH_TOO_LARGE";
    public static final String AUDIT_BATCH = "CONSULTANT_PREPARE_BATCH";
    public static final String AUDIT_SUBMIT_DETECTED = "CONSULTANT_PREPARE_SUBMIT_DETECTED";

    /** The opportunity states a prepared opening may be in (a match with no opportunity row yet counts as ASSIGNED). */
    static final Set<String> ELIGIBLE_STATES = Set.of("ASSIGNED", "VIEWED", "INTERESTED");
    private static final Set<String> OPEN_JOB = Set.of("OPEN", "IN_REVIEW");
    private static final String MATCH_ASSIGNED = "ASSIGNED";

    private final ConScope scope;
    private final PrepareBatchEntitlement entitlement;
    private final PrepareBatchSettings settings;
    private final RequirementMatchRepository matches;
    private final ClientRequirementRepository requirements;
    private final ClientAccountRepository clients;
    private final MktOpportunityRepository opportunities;
    private final ConsultantWsJobSourceReader sources;
    private final PrepareSessionRepository sessions;
    private final PrepareItemRepository items;
    private final PrepareEventRepository events;
    private final OrgAuditService audit;
    private final Clock clock;

    @Autowired
    public ConPrepareService(
        ConScope scope, PrepareBatchEntitlement entitlement, PrepareBatchSettings settings, RequirementMatchRepository matches, ClientRequirementRepository requirements,
        ClientAccountRepository clients, MktOpportunityRepository opportunities, ConsultantWsJobSourceReader sources, PrepareSessionRepository sessions,
        PrepareItemRepository items, PrepareEventRepository events, OrgAuditService audit
    ) {
        this(scope, entitlement, settings, matches, requirements, clients, opportunities, sources, sessions, items, events, audit, Clock.systemUTC());
    }

    ConPrepareService(
        ConScope scope, PrepareBatchEntitlement entitlement, PrepareBatchSettings settings, RequirementMatchRepository matches, ClientRequirementRepository requirements,
        ClientAccountRepository clients, MktOpportunityRepository opportunities, ConsultantWsJobSourceReader sources, PrepareSessionRepository sessions,
        PrepareItemRepository items, PrepareEventRepository events, OrgAuditService audit, Clock clock
    ) {
        this.scope = scope;
        this.entitlement = entitlement;
        this.settings = settings;
        this.matches = matches;
        this.requirements = requirements;
        this.clients = clients;
        this.opportunities = opportunities;
        this.sources = sources;
        this.sessions = sessions;
        this.items = items;
        this.events = events;
        this.audit = audit;
        this.clock = clock;
    }

    // ---- status --------------------------------------------------------------------------------------------------------------

    /** The switch and what is left of the caps. With the feature off: {@code enabled=false} and zeros (the page shows nothing). */
    @Transactional(readOnly = true)
    public ConPrepareDTO.Status status(OrgMembership me) {
        ConScope.View view = scope.read(me);
        if (!entitlement.check(view.orgId(), view.memberId()).allowed()) return new ConPrepareDTO.Status(false, 0, 0, 0, 0, 0);
        Remaining rem = remaining(view, clock.instant());
        return new ConPrepareDTO.Status(true, settings.maxBatch(view.orgId()), rem.today(), rem.month(), settings.dailyCap(view.orgId()), settings.monthlyCap(view.orgId()));
    }

    // ---- prepare -------------------------------------------------------------------------------------------------------------

    @Transactional
    public ConPrepareDTO.Created prepare(OrgMembership me, List<Long> requested) {
        ConScope.View view = scope.write(me);
        requireAllowed(view);
        Long org = view.orgId();
        Set<Long> ids = new LinkedHashSet<>();
        if (requested != null) for (Long id : requested) if (id != null) ids.add(id);
        if (ids.isEmpty()) throw validation("matchIds", "name at least one opening");
        int max = settings.maxBatch(org);
        if (ids.size() > max) throw OrgException.coded(400, BATCH_TOO_LARGE, "Prepare at most " + max + " openings at a time.", Map.of("maxBatch", max));

        // ownership first: any match that is not the caller's own ASSIGNED match is the generic 404 for the whole call
        Map<Long, RequirementMatch> owned = new HashMap<>();
        for (Long id : ids) {
            RequirementMatch m = matches.findByOrgIdAndId(org, id).orElseThrow(OrgNotFoundException::new);
            if (!view.consultantId().equals(m.getConsultantId()) || !MATCH_ASSIGNED.equals(m.getStatus())) throw new OrgNotFoundException();
            owned.put(id, m);
        }
        Set<Long> reqIds = owned.values().stream().map(RequirementMatch::getRequirementId).collect(Collectors.toSet());
        Map<Long, ClientRequirement> reqs = requirements.findByOrgIdAndIdIn(org, reqIds).stream().filter(r -> org.equals(r.getOrgId())).collect(Collectors.toMap(ClientRequirement::getId, r -> r, (a, b) -> a));
        Set<Long> clientIds = reqs.values().stream().map(ClientRequirement::getClientId).filter(c -> c != null).collect(Collectors.toSet());
        Map<Long, String> clientNames = clientIds.isEmpty() ? Map.of() : clients.findByOrgIdAndIdIn(org, clientIds).stream().filter(c -> org.equals(c.getOrgId())).collect(Collectors.toMap(ClientAccount::getId, ClientAccount::getName, (a, b) -> a));
        Map<Long, ConsultantWsJobSourceReader.Info> urls = sources.load(org, reqIds);
        Map<Long, MktOpportunity> oppByMatch = opportunities.findByOrgIdAndMatchIdIn(org, ids).stream().collect(Collectors.toMap(MktOpportunity::getMatchId, o -> o, (a, b) -> a));

        List<ConPrepareDTO.Job> jobs = new ArrayList<>();
        List<ConPrepareDTO.Skipped> skipped = new ArrayList<>();
        Map<Long, Long> opportunityOf = new HashMap<>();
        for (Long id : ids) {
            RequirementMatch m = owned.get(id);
            ClientRequirement r = reqs.get(m.getRequirementId());
            MktOpportunity opp = oppByMatch.get(id);
            String state = opp == null ? "ASSIGNED" : opp.getState();
            if (r == null || !ELIGIBLE_STATES.contains(state)) {
                skipped.add(new ConPrepareDTO.Skipped(id, NOT_ELIGIBLE));
                continue;
            }
            if (!OPEN_JOB.contains(r.getStatus())) {
                skipped.add(new ConPrepareDTO.Skipped(id, JOB_NOT_OPEN));
                continue;
            }
            String url = ConsultantWsJobSourceReader.orNone(urls, r.getId()).sourceUrl();
            if (url == null) {
                skipped.add(new ConPrepareDTO.Skipped(id, NO_URL));
                continue;
            }
            jobs.add(new ConPrepareDTO.Job(id, url, r.getTitle(), r.getClientId() == null ? null : clientNames.get(r.getClientId())));
            if (opp != null) opportunityOf.put(id, opp.getId());
        }

        Instant now = clock.instant();
        Remaining rem = remaining(view, now);
        if (jobs.isEmpty()) return new ConPrepareDTO.Created(null, null, List.of(), skipped, rem.today(), rem.month());

        // idempotent per (consultant, match): the same request again, while a live session holds exactly these openings, is that session and costs nothing
        Set<Long> wanted = jobs.stream().map(ConPrepareDTO.Job::matchId).collect(Collectors.toSet());
        for (PrepareSession live : sessions.findLive(org, view.consultantId(), now)) {
            List<PrepareItem> have = items.findByOrgIdAndConsultantIdAndSessionIdOrderByIdAsc(org, view.consultantId(), live.getId());
            if (have.stream().map(PrepareItem::getMatchId).collect(Collectors.toSet()).equals(wanted)) {
                return new ConPrepareDTO.Created(live.getId(), live.getExpiresAt(), jobs, skipped, rem.today(), rem.month());
            }
        }

        int allowance = Math.min(rem.today(), rem.month());
        if (jobs.size() > allowance) {
            throw OrgException.coded(409, CAP_REACHED, "That would go over your preparation limit. Try fewer openings, or come back later.", Map.of("remainingToday", rem.today(), "remainingMonth", rem.month()));
        }

        PrepareSession s = new PrepareSession();
        s.setOrgId(org);
        s.setConsultantId(view.consultantId());
        s.setMemberId(view.memberId());
        s.setCreatedAt(now);
        s.setExpiresAt(now.plus(settings.sessionMinutes(org), ChronoUnit.MINUTES));
        s = sessions.save(s);
        for (ConPrepareDTO.Job j : jobs) {
            PrepareItem item = new PrepareItem();
            item.setOrgId(org);
            item.setSessionId(s.getId());
            item.setConsultantId(view.consultantId());
            item.setMatchId(j.matchId());
            item.setOpportunityId(opportunityOf.get(j.matchId()));
            item.setUrl(j.url());
            item.setTitle(cut(j.title(), 255));
            item.setCompany(cut(j.company(), 255));
            item.setState(PrepareItem.WAITING);
            item.setCreatedAt(now);
            item.setUpdatedAt(now);
            items.save(item);
        }
        audit.record(me, AUDIT_BATCH, "PREPARE_SESSION", null, String.valueOf(s.getId()), jobs.size() + " openings prepared in the consultant's own browser; nothing is submitted for them");
        return new ConPrepareDTO.Created(s.getId(), s.getExpiresAt(), jobs, skipped, rem.today() - jobs.size(), rem.month() - jobs.size());
    }

    // ---- events --------------------------------------------------------------------------------------------------------------

    @Transactional
    public void event(OrgMembership me, Long sessionId, Long matchId, String event, String detail) {
        ConScope.View view = scope.write(me);
        requireAllowed(view);
        Long org = view.orgId();
        PrepareSession session = sessionId == null ? null : sessions.findByOrgIdAndConsultantIdAndId(org, view.consultantId(), sessionId).orElse(null);
        if (session == null || matchId == null) throw new OrgNotFoundException();
        PrepareItem item = items.findByOrgIdAndConsultantIdAndSessionIdAndMatchId(org, view.consultantId(), sessionId, matchId).orElseThrow(OrgNotFoundException::new);
        String kind = event == null ? "" : event.strip().toUpperCase(Locale.ROOT);
        if (!EVENTS.contains(kind)) throw validation("event", "must be one of " + String.join(", ", EVENTS));
        String note = detail == null || detail.isBlank() ? null : detail.strip();
        if (note != null && note.length() > DETAIL_MAX) throw validation("detail", "must be at most " + DETAIL_MAX + " characters");
        if (note != null) SensitiveContent.check("detail", "detail", note);
        Instant now = clock.instant();
        if (now.isAfter(session.getExpiresAt())) throw OrgException.coded(409, SESSION_EXPIRED, "This batch has expired. Prepare the openings again.", Map.of());

        PrepareEvent e = new PrepareEvent();
        e.setOrgId(org);
        e.setSessionId(sessionId);
        e.setItemId(item.getId());
        e.setMatchId(matchId);
        e.setKind(kind);
        e.setDetail(note);
        e.setOccurredAt(now);
        events.save(e);

        // once Submitted the state stays (a later Closed is still recorded above); everything else follows the latest report
        if (!PrepareItem.SUBMITTED.equals(item.getState())) item.setState(stateOf(kind));
        item.setDetail(note);
        item.setUpdatedAt(now);
        items.save(item);
        // SUBMIT_DETECTED only records. The consultant's own application is saved by the extension / the inbox and the existing linker (PipelineApplicationLinker)
        // is what moves the opportunity to APPLIED; the session view shows `applied` once it has.
        if ("SUBMIT_DETECTED".equals(kind)) audit.record(me, AUDIT_SUBMIT_DETECTED, "PREPARE_SESSION", null, String.valueOf(sessionId), "match " + matchId + ": the consultant submitted on the site themself");
    }

    static String stateOf(String event) {
        return switch (event) {
            case "OPENED" -> PrepareItem.OPENED;
            case "PREFILLED" -> PrepareItem.FILLED;
            case "NEEDS_INPUT" -> PrepareItem.NEEDS_INPUT;
            case "SUBMIT_DETECTED" -> PrepareItem.SUBMITTED;
            case "CLOSED" -> PrepareItem.CLOSED;
            default -> PrepareItem.FAILED;
        };
    }

    // ---- read a session ------------------------------------------------------------------------------------------------------

    @Transactional(readOnly = true)
    public ConPrepareDTO.Session session(OrgMembership me, Long sessionId) {
        ConScope.View view = scope.read(me);
        requireAllowed(view);
        Long org = view.orgId();
        PrepareSession s = sessionId == null ? null : sessions.findByOrgIdAndConsultantIdAndId(org, view.consultantId(), sessionId).orElse(null);
        if (s == null) throw new OrgNotFoundException();
        List<PrepareItem> rows = items.findByOrgIdAndConsultantIdAndSessionIdOrderByIdAsc(org, view.consultantId(), sessionId);
        Set<Long> matchIds = rows.stream().map(PrepareItem::getMatchId).collect(Collectors.toSet());
        Set<Long> appliedMatches = new HashSet<>();
        if (!matchIds.isEmpty()) {
            for (MktOpportunity o : opportunities.findByOrgIdAndMatchIdIn(org, matchIds)) if ("APPLIED".equals(o.getState())) appliedMatches.add(o.getMatchId());
        }
        List<ConPrepareDTO.Item> out = new ArrayList<>();
        for (PrepareItem i : rows) out.add(new ConPrepareDTO.Item(i.getMatchId(), i.getUrl(), i.getTitle(), i.getCompany(), i.getState(), i.getDetail(), appliedMatches.contains(i.getMatchId()), i.getUpdatedAt()));
        return new ConPrepareDTO.Session(s.getId(), s.getExpiresAt(), out);
    }

    // ---- internals -----------------------------------------------------------------------------------------------------------

    private void requireAllowed(ConScope.View view) {
        if (!entitlement.check(view.orgId(), view.memberId()).allowed()) throw new OrgNotFoundException();
    }

    record Remaining(int today, int month) {}

    private Remaining remaining(ConScope.View view, Instant now) {
        Long org = view.orgId();
        LocalDate day = now.atZone(ZoneOffset.UTC).toLocalDate();
        Instant dayStart = day.atStartOfDay(ZoneOffset.UTC).toInstant();
        Instant monthStart = day.withDayOfMonth(1).atStartOfDay(ZoneOffset.UTC).toInstant();
        long usedToday = items.countSince(org, view.consultantId(), dayStart);
        long usedMonth = items.countSince(org, view.consultantId(), monthStart);
        return new Remaining((int) Math.max(0, settings.dailyCap(org) - usedToday), (int) Math.max(0, settings.monthlyCap(org) - usedMonth));
    }

    private static String cut(String s, int max) {
        return s == null ? null : s.length() > max ? s.substring(0, max) : s;
    }

    private static OrgException validation(String field, String message) {
        return OrgException.coded(400, "VALIDATION", field + ": " + message, Map.of("field", field));
    }
}
