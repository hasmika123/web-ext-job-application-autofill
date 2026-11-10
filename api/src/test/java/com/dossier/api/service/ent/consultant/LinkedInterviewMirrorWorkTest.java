package com.dossier.api.service.ent.consultant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.ent.talent.TalentApplication;
import com.dossier.api.domain.ent.talent.TalentInterview;
import com.dossier.api.domain.enumeration.ShareScope;
import com.dossier.api.repository.ent.consultant.ConInterviewProjectionRepository;
import com.dossier.api.repository.ent.consultant.ConProfileRepository;
import com.dossier.api.repository.ent.consultant.ConProjectionRepository;
import com.dossier.api.service.InboxInterviewChanged;
import com.dossier.api.service.ent.EnterpriseFeatureFlag;
import com.dossier.api.service.org.DataShareService;
import com.dossier.api.service.settings.EnterpriseSettingKeys;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

/**
 * An interview made from a consultant's own inbox shows on the organization's Interviews page, but only for a consultant who shares in full, only as a
 * time and a kind, and never as the meeting link, the location or anything the mail said.
 */
class LinkedInterviewMirrorWorkTest {

    private static final Long ORG = 3L;
    private static final Long MEMBER = 11L;
    private static final Long CONSULTANT = 21L;
    private static final Instant NOW = Instant.parse("2026-10-17T10:00:00Z");
    private static final InboxInterviewChanged EVENT = new InboxInterviewChanged(
        7L, 5L, 99L, Instant.parse("2026-10-27T21:00:00Z"), Instant.parse("2026-10-27T21:30:00Z"), "PHONE", false
    );

    private ConProfileRepository profiles;
    private EnterpriseFeatureFlag flags;
    private DataShareService shares;
    private ConProjectionRepository projections;
    private ConInterviewProjectionRepository interviews;
    private final List<TalentInterview> saved = new ArrayList<>();
    private LinkedInterviewMirrorWork work;

    @BeforeEach
    void setUp() {
        profiles = mock(ConProfileRepository.class);
        ConsultantProfile profile = new ConsultantProfile();
        ReflectionTestUtils.setField(profile, "id", CONSULTANT);
        profile.setStatus("ACTIVE");
        when(profiles.findByOrgIdAndMemberId(ORG, MEMBER)).thenReturn(List.of(profile));
        flags = mock(EnterpriseFeatureFlag.class);
        when(flags.isEnabled(EnterpriseSettingKeys.FLAG_CONSULTANT_JOBS, ORG)).thenReturn(true);
        shares = mock(DataShareService.class);
        when(shares.scopeOf(ORG, MEMBER)).thenReturn(ShareScope.FULL);
        projections = mock(ConProjectionRepository.class);
        TalentApplication row = new TalentApplication();
        ReflectionTestUtils.setField(row, "id", 40L);
        row.setConsultantId(CONSULTANT);
        row.setClientId(50L);
        when(projections.findByOrgIdAndPersonalApplicationId(ORG, 5L)).thenReturn(List.of(row));
        interviews = mock(ConInterviewProjectionRepository.class);
        when(interviews.findFirstByOrgIdAndPersonalInterviewId(any(), any())).thenAnswer(inv ->
            saved.stream().filter(t -> t.getPersonalInterviewId().equals(inv.getArgument(1))).findFirst()
        );
        when(interviews.save(any(TalentInterview.class))).thenAnswer(inv -> {
            TalentInterview t = inv.getArgument(0);
            if (!saved.contains(t)) saved.add(t);
            return t;
        });
        work = new LinkedInterviewMirrorWork(profiles, flags, shares, projections, interviews, Clock.fixed(NOW, ZoneOffset.UTC));
    }

    @Test
    void aFullyShareingConsultantsInterviewAppearsAsATimeAndAKindOnly() {
        assertThat(work.process(ORG, MEMBER, EVENT)).isEqualTo(1);

        TalentInterview t = saved.get(0);
        assertThat(t.getPersonalInterviewId()).isEqualTo(99L);
        assertThat(t.getApplicationId()).isEqualTo(40L);
        assertThat(t.getConsultantId()).isEqualTo(CONSULTANT);
        assertThat(t.getClientId()).isEqualTo(50L);
        assertThat(t.getScheduledAt()).isEqualTo(EVENT.startsAt());
        assertThat(t.getDurationMinutes()).isEqualTo(30);
        assertThat(t.getStatus()).isEqualTo("SCHEDULED");
        assertThat(t.getMode()).isEqualTo("PHONE");
        assertThat(t.getRoundLabel()).isEqualTo("Phone screen");
        assertThat(t.getMeetingLink()).isNull();
        assertThat(t.getLocation()).isNull();
        assertThat(t.getNotes()).isNull();
        assertThat(t.getInterviewerName()).isNull();
    }

    @Test
    void aRescheduleUpdatesTheSameRowAndACancellationMarksItCancelled() {
        work.process(ORG, MEMBER, EVENT);
        work.process(ORG, MEMBER, new InboxInterviewChanged(7L, 5L, 99L, Instant.parse("2026-10-29T22:30:00Z"), null, "VIDEO", false));
        assertThat(saved).hasSize(1);
        assertThat(saved.get(0).getScheduledAt()).isEqualTo(Instant.parse("2026-10-29T22:30:00Z"));
        assertThat(saved.get(0).getDurationMinutes()).isEqualTo(45);
        assertThat(saved.get(0).getMode()).isEqualTo("VIDEO");

        work.process(ORG, MEMBER, new InboxInterviewChanged(7L, 5L, 99L, Instant.parse("2026-10-29T22:30:00Z"), null, "VIDEO", true));
        assertThat(saved).hasSize(1);
        assertThat(saved.get(0).getStatus()).isEqualTo("CANCELLED");
    }

    @Test
    void summaryAndNoneShareMirrorNothing() {
        when(shares.scopeOf(ORG, MEMBER)).thenReturn(ShareScope.SUMMARY);
        assertThat(work.process(ORG, MEMBER, EVENT)).isZero();
        when(shares.scopeOf(ORG, MEMBER)).thenReturn(ShareScope.NONE);
        assertThat(work.process(ORG, MEMBER, EVENT)).isZero();
        when(shares.scopeOf(ORG, MEMBER)).thenReturn(null);
        assertThat(work.process(ORG, MEMBER, EVENT)).isZero();
        verify(interviews, never()).save(any(TalentInterview.class));
    }

    @Test
    void theFlagOffAnInactiveProfileAndAnApplicationTheOrgDoesNotKnowMirrorNothing() {
        when(flags.isEnabled(EnterpriseSettingKeys.FLAG_CONSULTANT_JOBS, ORG)).thenReturn(false);
        assertThat(work.process(ORG, MEMBER, EVENT)).isZero();
        when(flags.isEnabled(EnterpriseSettingKeys.FLAG_CONSULTANT_JOBS, ORG)).thenReturn(true);

        ConsultantProfile paused = new ConsultantProfile();
        ReflectionTestUtils.setField(paused, "id", CONSULTANT);
        paused.setStatus("PAUSED");
        when(profiles.findByOrgIdAndMemberId(ORG, MEMBER)).thenReturn(List.of(paused));
        assertThat(work.process(ORG, MEMBER, EVENT)).isZero();

        setUp();
        assertThat(work.process(ORG, MEMBER, new InboxInterviewChanged(7L, 6L, 99L, EVENT.startsAt(), null, "PHONE", false))).as("no projection row for application 6").isZero();
        assertThat(work.process(null, MEMBER, EVENT)).isZero();
        assertThat(Optional.ofNullable(saved).orElseThrow()).isEmpty();
    }

    @Test
    void anotherConsultantsRowIsNeverTouched() {
        TalentApplication other = new TalentApplication();
        ReflectionTestUtils.setField(other, "id", 41L);
        other.setConsultantId(999L);
        other.setClientId(50L);
        when(projections.findByOrgIdAndPersonalApplicationId(ORG, 5L)).thenReturn(List.of(other));
        assertThat(work.process(ORG, MEMBER, EVENT)).isZero();
    }

    @Test
    void theEventCarriesNoMailText() {
        assertThat(InboxInterviewChanged.class.getRecordComponents()).extracting(c -> c.getName())
            .containsExactly("userId", "applicationId", "interviewId", "startsAt", "endsAt", "kind", "cancelled");
    }
}
