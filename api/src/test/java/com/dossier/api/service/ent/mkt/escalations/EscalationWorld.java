package com.dossier.api.service.ent.mkt.escalations;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.ent.mgmt.MktEscalation;
import com.dossier.api.domain.ent.mgmt.MktEscalationEvent;
import com.dossier.api.repository.ent.mgmt.MgmtLookupRepository;
import com.dossier.api.repository.ent.mgmt.MktEscalationEventRepository;
import com.dossier.api.repository.ent.mgmt.MktEscalationRepository;
import com.dossier.api.service.ent.applications.ApplicationNames;
import com.dossier.api.service.ent.mgmt.TeamScope;
import com.dossier.api.service.org.OrgAuditService;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicLong;

/**
 * An in-memory world for the unit tests of the escalations (MM-04): the escalation and trail repositories are Mockito mocks answering from lists, so a test can run
 * the real {@link EscalationService} and {@link EscalationRules} and read back exactly what they wrote.
 */
final class EscalationWorld {

    static final Long ORG = 7L;

    final List<MktEscalation> rows = new ArrayList<>();
    final List<MktEscalationEvent> trail = new ArrayList<>();
    final MktEscalationRepository escalations = mock(MktEscalationRepository.class);
    final MktEscalationEventRepository events = mock(MktEscalationEventRepository.class);
    final MgmtLookupRepository lookup = mock(MgmtLookupRepository.class);
    final ApplicationNames names = mock(ApplicationNames.class);
    final TeamScope teamScope = mock(TeamScope.class);
    final OrgAuditService audit = mock(OrgAuditService.class);
    final Clock clock;
    private final AtomicLong ids = new AtomicLong(100);

    EscalationWorld(Clock clock) {
        this.clock = clock;
        when(escalations.saveAndFlush(any(MktEscalation.class))).thenAnswer(call -> store(call.getArgument(0)));
        when(escalations.save(any(MktEscalation.class))).thenAnswer(call -> store(call.getArgument(0)));
        when(escalations.findByOrgIdAndId(anyLong(), anyLong())).thenAnswer(call -> byId(call.getArgument(1)));
        when(escalations.lockByOrgIdAndId(anyLong(), anyLong())).thenAnswer(call -> byId(call.getArgument(1)));
        when(escalations.findLive(anyLong(), anyString(), anyString(), anyLong())).thenAnswer(call ->
            rows.stream()
                .filter(e -> e.isLive() && call.getArgument(1).equals(e.getRuleKey()) && call.getArgument(2).equals(e.getSubjectType()) && call.getArgument(3).equals(e.getSubjectId()))
                .findFirst()
        );
        when(escalations.findLiveByRule(anyLong(), anyString())).thenAnswer(call -> rows.stream().filter(e -> e.isLive() && call.getArgument(1).equals(e.getRuleKey())).toList());
        when(escalations.findWokenSnoozes(anyLong(), any(Instant.class))).thenAnswer(call ->
            rows.stream().filter(e -> MktEscalation.STATUS_SNOOZED.equals(e.getStatus()) && e.getSnoozedUntil() != null && !e.getSnoozedUntil().isAfter(call.getArgument(1))).toList()
        );
        when(events.save(any(MktEscalationEvent.class))).thenAnswer(call -> {
            MktEscalationEvent ev = call.getArgument(0);
            ev.setId(ids.incrementAndGet());
            trail.add(ev);
            return ev;
        });
        when(events.findByOrgIdAndEscalationIdOrderByOccurredAtAscIdAsc(anyLong(), anyLong())).thenAnswer(call ->
            trail.stream().filter(ev -> ev.getEscalationId().equals(call.getArgument(1))).toList()
        );
        when(names.memberNames(eq(ORG), anyCollection())).thenReturn(Map.of(70L, "Sam Spec", 90L, "Priya N.", 71L, "Mia Ng"));
        when(lookup.consultantNames(eq(ORG), anyCollection())).thenReturn(List.<Object[]>of(new Object[] { 10L, "Anika Rao" }, new Object[] { 11L, "Omar Aziz" }));
    }

    private MktEscalation store(MktEscalation e) {
        if (e.getId() == null) {
            e.setId(ids.incrementAndGet());
            rows.add(e);
        }
        return e;
    }

    private Optional<MktEscalation> byId(Long id) {
        return rows.stream().filter(e -> e.getId().equals(id)).findFirst();
    }

    EscalationService service() {
        return new EscalationService(escalations, events, lookup, names, teamScope, audit, clock);
    }

    List<MktEscalation> live(String rule) {
        return rows.stream().filter(e -> e.isLive() && rule.equals(e.getRuleKey())).toList();
    }

    List<String> kinds(MktEscalation e) {
        return trail.stream().filter(ev -> ev.getEscalationId().equals(e.getId())).map(MktEscalationEvent::getKind).toList();
    }
}
