package com.dossier.api.service.ent.mkt.escalations;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.ent.mgmt.MktEscalation;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.service.ent.authz.AuthzOperation;
import com.dossier.api.service.ent.mgmt.TeamScope;
import com.dossier.api.service.org.OrgException;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import com.dossier.api.service.privacy.SensitiveContentException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

/**
 * The escalation service without a database (MM-04): raising (validated, scanned, idempotent on the open key for a rule, never for a person), the manager's
 * actions as a small state machine (each writes one trail line and one audit row), the team guard (a row is the team's when its marketer or its consultant is;
 * anything else is the generic 404), and the counts.
 */
class EscalationServiceTest {

    static final Long ORG = EscalationWorld.ORG;
    static final Long MANAGER = 90L;
    static final Instant NOW = Instant.parse("2026-10-17T12:00:00Z");

    EscalationWorld world;
    EscalationService service;
    OrgMembership manager = new OrgMembership(ORG, MANAGER, 900L, "manager", OrgRole.MARKETER, OrgMemberStatus.ACTIVE, OrgStatus.ACTIVE);
    TeamScope.View team = new TeamScope.View(ORG, MANAGER, false, Set.of(70L, 71L), Set.of(10L, 11L));
    TeamScope.View everyone = new TeamScope.View(ORG, MANAGER, true, Set.of(70L, 71L), Set.of(10L));

    @BeforeEach
    void wire() {
        world = new EscalationWorld(Clock.fixed(NOW, ZoneOffset.UTC));
        service = world.service();
        when(world.teamScope.resolve(manager, AuthzOperation.WRITE, "escalations.manage")).thenReturn(team);
        when(world.teamScope.resolve(manager, AuthzOperation.READ, "escalations.manage")).thenReturn(team);
    }

    EscalationService.Raise raise(String ruleKey, long subjectId) {
        return new EscalationService.Raise("STALLED_OPPORTUNITY", "MEDIUM", "MKT_OPPORTUNITY", subjectId, 10L, 70L, "Anika Rao: SWE II stalled", "No activity for 9 days.", ruleKey, null);
    }

    MktEscalation open() {
        EscalationDTO dto = service.raise(ORG, raise("STALLED_OPPORTUNITY", 1L));
        return world.rows.stream().filter(e -> e.getId().equals(dto.id())).findFirst().orElseThrow();
    }

    // ---- raising ---------------------------------------------------------------------------------------------------------------

    @Test
    void aRuleRaiseIsIdempotentOnTheOpenKeyAndRaisesTheSeverityOfTheLiveRow() {
        EscalationDTO first = service.raise(ORG, raise("STALLED_OPPORTUNITY", 1L));
        assertThat(first.status()).isEqualTo("OPEN");
        assertThat(first.consultant().name()).isEqualTo("Anika Rao");
        assertThat(first.marketer().name()).isEqualTo("Sam Spec");
        assertThat(world.kinds(world.rows.get(0))).containsExactly("RAISED");

        EscalationDTO again = service.raise(ORG, raise("STALLED_OPPORTUNITY", 1L));
        assertThat(again.id()).isEqualTo(first.id());
        assertThat(world.rows).hasSize(1);

        EscalationDTO worse = service.raise(ORG, new EscalationService.Raise("STALLED_OPPORTUNITY", "HIGH", "MKT_OPPORTUNITY", 1L, 10L, 70L, "t", null, "STALLED_OPPORTUNITY", null));
        assertThat(worse.id()).isEqualTo(first.id());
        assertThat(world.rows.get(0).getSeverity()).isEqualTo("HIGH");
        assertThat(service.raise(ORG, raise("STALLED_OPPORTUNITY", 2L)).id()).as("another subject is its own row").isNotEqualTo(first.id());
    }

    @Test
    void aPersonsRaiseIsNeverDeduplicated() {
        EscalationService.Raise manual = new EscalationService.Raise("MANUAL", "HIGH", "CONSULTANT", 10L, 10L, 70L, "Please look at Anika", "She is asking for a call.", null, 70L);
        EscalationDTO one = service.raise(ORG, manual);
        EscalationDTO two = service.raise(ORG, manual);
        assertThat(one.id()).isNotEqualTo(two.id());
        assertThat(one.raisedBy().name()).isEqualTo("Sam Spec");
        assertThat(one.ruleKey()).isNull();
        assertThat(world.rows).hasSize(2);
    }

    @Test
    void aRaiseIsValidatedAndScanned() {
        assertThatThrownBy(() -> service.raise(ORG, new EscalationService.Raise("SHOUT", "HIGH", "CONSULTANT", 10L, 10L, 70L, "t", null, null, 70L))).isInstanceOf(OrgException.class);
        assertThatThrownBy(() -> service.raise(ORG, new EscalationService.Raise("MANUAL", "URGENT", "CONSULTANT", 10L, 10L, 70L, "t", null, null, 70L))).isInstanceOf(OrgException.class);
        assertThatThrownBy(() -> service.raise(ORG, new EscalationService.Raise("MANUAL", "LOW", "PLANET", 10L, 10L, 70L, "t", null, null, 70L))).isInstanceOf(OrgException.class);
        assertThatThrownBy(() -> service.raise(ORG, new EscalationService.Raise("MANUAL", "LOW", "CONSULTANT", null, 10L, 70L, "t", null, null, 70L))).isInstanceOf(OrgException.class);
        assertThatThrownBy(() -> service.raise(ORG, new EscalationService.Raise("MANUAL", "LOW", "CONSULTANT", 10L, 10L, 70L, " ", null, null, 70L))).isInstanceOf(OrgException.class);
        assertThatThrownBy(() -> service.raise(ORG, new EscalationService.Raise("MANUAL", "LOW", "CONSULTANT", 10L, 10L, 70L, "x".repeat(161), null, null, 70L))).isInstanceOf(OrgException.class);
        assertThatThrownBy(() -> service.raise(ORG, new EscalationService.Raise("MANUAL", "LOW", "CONSULTANT", 10L, 10L, 70L, "t", "x".repeat(501), null, 70L))).isInstanceOf(OrgException.class);
        assertThatThrownBy(() -> service.raise(ORG, new EscalationService.Raise("MANUAL", "LOW", "CONSULTANT", 10L, 10L, 70L, "ssn 123-45-6789", null, null, 70L))).isInstanceOf(SensitiveContentException.class);
        assertThatThrownBy(() -> service.raise(ORG, new EscalationService.Raise("MANUAL", "LOW", "CONSULTANT", 10L, 10L, 70L, "t", "ssn 123-45-6789", null, 70L))).isInstanceOf(SensitiveContentException.class);
        assertThatThrownBy(() -> service.raise(null, raise(null, 1L))).isInstanceOf(OrgNotFoundException.class);
        assertThat(world.rows).isEmpty();
    }

    // ---- the actions -----------------------------------------------------------------------------------------------------------

    @Test
    void acknowledgeAssignSnoozeAndCommentEachWriteOneTrailLineAndOneAuditRow() {
        MktEscalation e = open();
        EscalationDTO acked = service.acknowledge(manager, e.getId());
        assertThat(acked.status()).isEqualTo("ACKNOWLEDGED");
        service.acknowledge(manager, e.getId()); // idempotent: no second line
        assertThat(world.kinds(e)).containsExactly("RAISED", "ACKNOWLEDGED");

        EscalationDTO assigned = service.assign(manager, e.getId(), 71L);
        assertThat(assigned.assignee().name()).isEqualTo("Mia Ng");
        assertThat(world.kinds(e)).containsExactly("RAISED", "ACKNOWLEDGED", "ASSIGNED");
        service.assign(manager, e.getId(), 71L); // same assignee: nothing new
        assertThat(world.kinds(e)).hasSize(3);
        assertThat(service.assign(manager, e.getId(), MANAGER).assignee().id()).as("the manager may take it themselves").isEqualTo(MANAGER);

        Instant until = NOW.plus(Duration.ofDays(3));
        EscalationDTO snoozed = service.snooze(manager, e.getId(), until);
        assertThat(snoozed.status()).isEqualTo("SNOOZED");
        assertThat(snoozed.snoozedUntil()).isEqualTo(until);
        assertThat(service.acknowledge(manager, e.getId()).status()).as("acknowledging a snoozed row wakes it").isEqualTo("ACKNOWLEDGED");
        assertThat(e.getSnoozedUntil()).isNull();

        EscalationDTO commented = service.comment(manager, e.getId(), "Called Sam; waiting on the client.");
        assertThat(commented.events()).extracting(EscalationDTO.Event::kind).endsWith("COMMENTED");
        assertThat(commented.events().get(commented.events().size() - 1).actor().name()).isEqualTo("Priya N.");

        ArgumentCaptor<String> actions = ArgumentCaptor.forClass(String.class);
        verify(world.audit, org.mockito.Mockito.atLeast(6)).record(eq(ORG), eq("manager"), any(), actions.capture(), eq("MKT_ESCALATION"), any(), eq(String.valueOf(e.getId())), anyString(), any(), any(), any(), eq("LOW"));
        assertThat(actions.getAllValues()).contains("MKT_ESCALATION_ACKNOWLEDGE", "MKT_ESCALATION_ASSIGN", "MKT_ESCALATION_SNOOZE", "MKT_ESCALATION_COMMENT");
    }

    @Test
    void resolveNeedsATextDismissTakesAnOptionalNoteAndBothCanBeReopened() {
        MktEscalation e = open();
        assertThatThrownBy(() -> service.resolve(manager, e.getId(), " ")).isInstanceOf(OrgException.class);
        assertThatThrownBy(() -> service.resolve(manager, e.getId(), "x".repeat(301))).isInstanceOf(OrgException.class);
        assertThatThrownBy(() -> service.resolve(manager, e.getId(), "ssn 123-45-6789")).isInstanceOf(SensitiveContentException.class);
        assertThat(e.getStatus()).isEqualTo("OPEN");

        EscalationDTO resolved = service.resolve(manager, e.getId(), "Called the client; the role is on hold.");
        assertThat(resolved.status()).isEqualTo("RESOLVED");
        assertThat(resolved.resolvedBy().name()).isEqualTo("Priya N.");
        assertThat(resolved.resolution()).isEqualTo("Called the client; the role is on hold.");
        assertThat(e.getResolvedAt()).isEqualTo(NOW);

        EscalationDTO back = service.reopen(manager, e.getId());
        assertThat(back.status()).isEqualTo("OPEN");
        assertThat(e.getResolution()).isNull();
        assertThat(e.getResolvedAt()).isNull();

        EscalationDTO dismissed = service.dismiss(manager, e.getId(), null);
        assertThat(dismissed.status()).isEqualTo("DISMISSED");
        assertThat(service.reopen(manager, e.getId()).status()).isEqualTo("OPEN");
        assertThat(world.kinds(e)).containsExactly("RAISED", "RESOLVED", "REOPENED", "DISMISSED", "REOPENED");
    }

    @Test
    void aClosedRowRefusesEveryActionExceptReopenAndCommentAndAnOpenRowRefusesReopen() {
        MktEscalation e = open();
        service.resolve(manager, e.getId(), "Done");
        for (Runnable action : List.<Runnable>of(
            () -> service.acknowledge(manager, e.getId()),
            () -> service.assign(manager, e.getId(), 71L),
            () -> service.snooze(manager, e.getId(), NOW.plusSeconds(3600)),
            () -> service.resolve(manager, e.getId(), "again"),
            () -> service.dismiss(manager, e.getId(), "no")
        )) {
            assertThatThrownBy(action::run).isInstanceOfSatisfying(OrgException.class, ex -> {
                assertThat(ex.getStatus()).isEqualTo(409);
                assertThat(ex.getCode()).isEqualTo("ESCALATION_NOT_OPEN");
            });
        }
        assertThat(service.comment(manager, e.getId(), "A note after the fact").events()).extracting(EscalationDTO.Event::kind).endsWith("COMMENTED");
        service.reopen(manager, e.getId());
        assertThatThrownBy(() -> service.reopen(manager, e.getId())).isInstanceOfSatisfying(OrgException.class, ex -> assertThat(ex.getCode()).isEqualTo("ESCALATION_ALREADY_OPEN"));
    }

    @Test
    void reopeningARuleRowIsRefusedWhileTheSameThingIsOpenAsAnotherRow() {
        MktEscalation first = open();
        service.resolve(manager, first.getId(), "Done");
        MktEscalation second = service.raise(ORG, raise("STALLED_OPPORTUNITY", 1L)).id() == null ? null : world.rows.get(1);
        assertThat(second.isLive()).isTrue();
        assertThatThrownBy(() -> service.reopen(manager, first.getId())).isInstanceOfSatisfying(OrgException.class, ex -> assertThat(ex.getCode()).isEqualTo("ESCALATION_ALREADY_OPEN"));
    }

    @Test
    void snoozeNeedsAFutureTimeWithinAYear() {
        MktEscalation e = open();
        assertThatThrownBy(() -> service.snooze(manager, e.getId(), null)).isInstanceOf(OrgException.class);
        assertThatThrownBy(() -> service.snooze(manager, e.getId(), NOW)).isInstanceOf(OrgException.class);
        assertThatThrownBy(() -> service.snooze(manager, e.getId(), NOW.minusSeconds(60))).isInstanceOf(OrgException.class);
        assertThatThrownBy(() -> service.snooze(manager, e.getId(), NOW.plus(Duration.ofDays(400)))).isInstanceOf(OrgException.class);
        assertThat(e.getStatus()).isEqualTo("OPEN");
        assertThat(service.snooze(manager, e.getId(), NOW.plus(Duration.ofDays(364))).status()).isEqualTo("SNOOZED");
    }

    // ---- the team guard ----------------------------------------------------------------------------------------------------------

    @Test
    void aRowIsTheTeamsThroughItsMarketerOrItsConsultantAndAnythingElseIsTheGenericNotFound() {
        MktEscalation byMarketer = open();
        EscalationDTO byConsultant = service.raise(ORG, new EscalationService.Raise("MANUAL", "LOW", "CONSULTANT", 11L, 11L, null, "Omar asks", null, null, null));
        EscalationDTO foreign = service.raise(ORG, new EscalationService.Raise("MANUAL", "LOW", "CONSULTANT", 99L, 99L, 99L, "Someone else's", null, null, null));
        service.acknowledge(manager, byMarketer.getId());
        service.acknowledge(manager, byConsultant.id());
        assertThatThrownBy(() -> service.get(manager, foreign.id())).isInstanceOf(OrgNotFoundException.class);
        assertThatThrownBy(() -> service.acknowledge(manager, foreign.id())).isInstanceOf(OrgNotFoundException.class);
        assertThatThrownBy(() -> service.resolve(manager, foreign.id(), "x")).isInstanceOf(OrgNotFoundException.class);
        assertThatThrownBy(() -> service.comment(manager, foreign.id(), "x")).isInstanceOf(OrgNotFoundException.class);
        assertThatThrownBy(() -> service.get(manager, 999999L)).isInstanceOf(OrgNotFoundException.class);
        assertThatThrownBy(() -> service.get(manager, null)).isInstanceOf(OrgNotFoundException.class);
        assertThat(world.rows.stream().filter(e -> e.getId().equals(foreign.id())).findFirst().orElseThrow().getStatus()).isEqualTo("OPEN");

        when(world.teamScope.resolve(manager, AuthzOperation.WRITE, "escalations.manage")).thenReturn(everyone);
        assertThat(service.acknowledge(manager, foreign.id()).status()).as("an organization-wide caller reaches every row").isEqualTo("ACKNOWLEDGED");
    }

    @Test
    void anAssigneeOutsideTheTeamIsTheGenericNotFound() {
        MktEscalation e = open();
        assertThatThrownBy(() -> service.assign(manager, e.getId(), 99L)).isInstanceOf(OrgNotFoundException.class);
        assertThatThrownBy(() -> service.assign(manager, e.getId(), null)).isInstanceOf(OrgNotFoundException.class);
        assertThat(e.getAssigneeMemberId()).isNull();
    }

    // ---- lists and counts ----------------------------------------------------------------------------------------------------------

    @Test
    void theListMapsTheTabsToStatusesAndRefusesWhatItDoesNotKnow() {
        when(world.escalations.searchLive(eq(ORG), eq(false), anyCollection(), anyCollection(), anyCollection(), any(), any(), any(), any(), any(), any())).thenReturn(new org.springframework.data.domain.PageImpl<>(List.of()));
        when(world.escalations.searchClosed(eq(ORG), eq(false), anyCollection(), anyCollection(), anyCollection(), any(), any(), any(), any(), any(), any())).thenReturn(new org.springframework.data.domain.PageImpl<>(List.of()));
        @SuppressWarnings("unchecked")
        ArgumentCaptor<java.util.Collection<String>> statuses = ArgumentCaptor.forClass(java.util.Collection.class);

        service.list(manager, null, 0, 20);
        verify(world.escalations).searchLive(eq(ORG), eq(false), anyCollection(), anyCollection(), statuses.capture(), isNull(), isNull(), isNull(), isNull(), isNull(), any());
        assertThat(statuses.getValue()).containsExactlyInAnyOrder("OPEN", "ACKNOWLEDGED");

        service.list(manager, new EscalationService.Filter("snoozed", null, null, null, null, null), 0, 20);
        service.list(manager, new EscalationService.Filter("RESOLVED", "high", null, null, null, null), 0, 20);
        verify(world.escalations).searchClosed(eq(ORG), eq(false), anyCollection(), anyCollection(), statuses.capture(), eq("HIGH"), isNull(), isNull(), isNull(), isNull(), any());
        assertThat(statuses.getValue()).containsExactlyInAnyOrder("RESOLVED", "DISMISSED");

        assertThatThrownBy(() -> service.list(manager, new EscalationService.Filter("SOON", null, null, null, null, null), 0, 20)).isInstanceOf(OrgException.class);
        assertThatThrownBy(() -> service.list(manager, new EscalationService.Filter(null, "EXTREME", null, null, null, null), 0, 20)).isInstanceOf(OrgException.class);
        assertThatThrownBy(() -> service.list(manager, new EscalationService.Filter(null, null, null, null, null, "x"), 0, 20)).isInstanceOf(OrgException.class);
        org.mockito.Mockito.doThrow(new OrgNotFoundException()).when(world.teamScope).require(team, 99L);
        assertThatThrownBy(() -> service.list(manager, new EscalationService.Filter(null, null, null, 99L, null, null), 0, 20)).isInstanceOf(OrgNotFoundException.class);
        assertThatThrownBy(() -> service.list(manager, null, -1, 20)).isInstanceOf(OrgException.class);
        assertThatThrownBy(() -> service.list(manager, null, 0, 101)).isInstanceOf(OrgException.class);
        verify(world.escalations, never()).searchLive(anyLong(), anyBoolean(), anyCollection(), anyCollection(), anyCollection(), eq("EXTREME"), any(), any(), any(), any(), any());
    }

    @Test
    void theCountsSplitTheLiveRowsBySeverityAndCountSnoozedApart() {
        when(world.escalations.liveCounts(eq(ORG), eq(false), anyCollection(), anyCollection())).thenReturn(List.<Object[]>of(
            new Object[] { "HIGH", "OPEN", 2L }, new Object[] { "HIGH", "ACKNOWLEDGED", 1L }, new Object[] { "MEDIUM", "OPEN", 4L }, new Object[] { "LOW", "OPEN", 5L }, new Object[] { "HIGH", "SNOOZED", 3L }
        ));
        EscalationDTO.Counts c = service.counts(manager);
        assertThat(c.high()).isEqualTo(3);
        assertThat(c.medium()).isEqualTo(4);
        assertThat(c.low()).isEqualTo(5);
        assertThat(c.open()).isEqualTo(12);
        assertThat(c.snoozed()).isEqualTo(3);
    }
}
